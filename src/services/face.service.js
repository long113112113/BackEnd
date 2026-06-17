const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');
const mqttConfig = require('../config/mqtt');
const FaceCaptureModel = require('../models/faceCapture.model');
const DevicePairModel = require('../models/devicePair.model');
const AttendanceModel = require('../models/attendance.model');
const StudentModel = require('../models/student.model');
const SSE_Broadcast = require('./sse.broadcast');
const aiClient = require('./ai.grpc.server');

const DEVICE_ID_REGEX = /^[a-zA-Z0-9_-]{1,50}$/;
const CAMERA_STATUS_STATES = new Set(['accepted', 'busy', 'capturing', 'uploading', 'done', 'failed', 'expired']);
const CAMERA_STATUS_REASONS = new Set([
    '',
    'queue_full',
    'upload_busy',
    'timeout',
    'http_error',
    'no_image',
    'stale_trigger',
]);
const TERMINAL_CAMERA_STATUS = {
    busy: 'cam_busy',
    failed: 'capture_failed',
    expired: 'expired',
};
const ACCEPTED_UPLOAD_CAPTURE_STATUS = 'pending';

const createHttpError = (statusCode, message) => {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
};

const ensureDir = (dir) => {
    fs.mkdirSync(dir, { recursive: true });
};

const buildImagePath = (attendanceId, ext = 'jpg') => {
    const now = new Date();
    const dayDir = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
    const ts = `${now.getUTCMonth() + 1}${now.getUTCDate()}_${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')}`;
    return path.join(config.face.storageDir, dayDir, `${attendanceId}_${ts}.${ext}`);
};

const buildCapturePayload = ({ attendanceId, studentIdHint, token }) => {
    const now = Date.now();
    return {
        attendance_id: attendanceId,
        student_id_hint: studentIdHint || 0,
        capture_token: token,
        ts: now,
        deadline_ts: now + config.face.captureTimeoutMs,
        ttl_ms: config.face.captureTimeoutMs,
    };
};

const clearTimedOutCameraCaptures = async (camDeviceId) => {
    const expired = await FaceCaptureModel.expireStaleActiveByDevice(
        camDeviceId,
        config.face.captureTimeoutMs
    );
    if (expired > 0) {
        logger.warn(`[Face] Expired stale active captures for cam=${camDeviceId}, count=${expired}`);
    }
};

const findCameraBusyCapture = async (camDeviceId) => {
    await clearTimedOutCameraCaptures(camDeviceId);
    return FaceCaptureModel.findActiveByDevice(camDeviceId);
};

/**
 * Triggers an attendance face capture unless the paired camera is busy.
 * @param {object} params - Trigger parameters.
 * @param {string} params.nfcDeviceId - NFC device that created the attendance row.
 * @param {number} params.attendanceId - Attendance row ID to update.
 * @param {number} [params.studentIdHint] - Student PK sent to the camera/AI path.
 * @returns {Promise<object|null>} The created capture row or null when skipped.
 */
const triggerFaceCapture = async ({ nfcDeviceId, attendanceId, studentIdHint }) => {
    const pair = await DevicePairModel.findByNfc(nfcDeviceId);
    if (!pair) {
        logger.info(`[Face] No cam paired for nfc_device=${nfcDeviceId}, skip trigger`);
        await AttendanceModel.setFaceStatus(attendanceId, { face_status: 'no_cam' });
        SSE_Broadcast.broadcast('face-results', 'face-decision', { attendance_id: attendanceId, decision: 'no_cam' });
        return null;
    }
    if (!DEVICE_ID_REGEX.test(pair.cam_device_id)) {
        logger.info(`[Face] Invalid cam_device_id=${pair.cam_device_id}`);
        await AttendanceModel.setFaceStatus(attendanceId, { face_status: 'no_cam' });
        SSE_Broadcast.broadcast('face-results', 'face-decision', { attendance_id: attendanceId, decision: 'no_cam' });
        return null;
    }

    const busyCapture = await findCameraBusyCapture(pair.cam_device_id);
    if (busyCapture) {
        logger.warn(
            `[Face] Camera busy cam=${pair.cam_device_id} attendance=${attendanceId} ` +
            `active_capture=${busyCapture.id} active_status=${busyCapture.status}`
        );
        await AttendanceModel.setFaceStatus(attendanceId, { face_status: 'cam_busy' });
        SSE_Broadcast.broadcast('face-results', 'face-decision', {
            attendance_id: attendanceId,
            student_id: studentIdHint,
            decision: 'cam_busy',
        });
        return null;
    }

    const token = crypto.randomBytes(32).toString('hex');
    const capture = await FaceCaptureModel.createPending({
        attendance_id: attendanceId,
        device_id: pair.cam_device_id,
        capture_token: token,
    });

    if (!capture) {
        logger.warn(`[Face] Camera busy (race caught) cam=${pair.cam_device_id} attendance=${attendanceId}`);
        await AttendanceModel.setFaceStatus(attendanceId, { face_status: 'cam_busy' });
        SSE_Broadcast.broadcast('face-results', 'face-decision', {
            attendance_id: attendanceId,
            student_id: studentIdHint,
            decision: 'cam_busy',
        });
        return null;
    }

    const topic = `${mqttConfig.TOPICS.FACE_CAPTURE}/${pair.cam_device_id}`;
    const payload = buildCapturePayload({ attendanceId, studentIdHint, token });
    mqttConfig.publish(topic, payload);
    logger.info(`[Face] Triggered capture for attendance=${attendanceId} → cam=${pair.cam_device_id}`);
    return capture;
};

/**
 * Triggers a face enrollment capture unless the selected camera is busy.
 * @param {object} params - Trigger parameters.
 * @param {number} params.studentId - Student PK that will receive the embedding.
 * @param {string} params.camDeviceId - Camera device that should capture the face.
 * @returns {Promise<object>} The created enrollment capture row.
 * @throws {Error} 409 when the camera already has an active capture.
 */
const triggerFaceEnroll = async ({ studentId, camDeviceId }) => {
    const busyCapture = await findCameraBusyCapture(camDeviceId);
    if (busyCapture) {
        logger.warn(
            `[Face] Camera busy cam=${camDeviceId} enroll_student=${studentId} ` +
            `active_capture=${busyCapture.id} active_status=${busyCapture.status}`
        );
        throw createHttpError(409, 'Camera is busy processing another capture');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const capture = await FaceCaptureModel.createEnrollmentPending({
        student_id: studentId,
        device_id: camDeviceId,
        capture_token: token,
    });

    if (!capture) {
        logger.warn(`[Face] Camera busy (race caught) cam=${camDeviceId} enroll_student=${studentId}`);
        throw createHttpError(409, 'Camera is busy processing another capture');
    }

    const topic = `${mqttConfig.TOPICS.FACE_CAPTURE}/${camDeviceId}`;
    const payload = buildCapturePayload({
        attendanceId: 0,
        studentIdHint: studentId,
        token,
    });
    mqttConfig.publish(topic, payload);
    logger.info(`[Face] Triggered enrollment capture for student=${studentId} → cam=${camDeviceId}`);
    return capture;
};

const normalizeCameraStatus = ({ state, reason, faceScore, elapsedMs }) => {
    const normalizedState = typeof state === 'string' ? state.trim() : '';
    if (!CAMERA_STATUS_STATES.has(normalizedState)) {
        return null;
    }

    const normalizedReason = typeof reason === 'string' ? reason.trim() : '';
    return {
        state: normalizedState,
        reason: CAMERA_STATUS_REASONS.has(normalizedReason) ? normalizedReason : 'unknown',
        faceScore: Number.isFinite(faceScore) ? faceScore : null,
        elapsedMs: Number.isFinite(elapsedMs) && elapsedMs >= 0 ? Math.floor(elapsedMs) : null,
    };
};

const findCaptureForCameraStatus = async ({ deviceId, attendanceId }) => {
    if (attendanceId > 0) {
        const capture = await FaceCaptureModel.findLatestByAttendance(attendanceId);
        if (capture && capture.device_id === deviceId) {
            return capture;
        }
    }
    return FaceCaptureModel.findActiveByDevice(deviceId);
};

const broadcastTerminalCameraStatus = async (capture, terminalStatus, meta) => {
    if (capture.type === 'attendance' && capture.attendance_id) {
        await AttendanceModel.setFaceStatus(capture.attendance_id, {
            face_status: terminalStatus,
            face_capture_id: capture.id,
        });
        SSE_Broadcast.broadcast('face-results', 'face-decision', {
            attendance_id: capture.attendance_id,
            face_capture_id: capture.id,
            decision: terminalStatus,
            reason: meta.reason || undefined,
            device_status: meta.state,
            elapsed_ms: meta.elapsedMs,
        });
        return;
    }

    if (capture.type === 'enroll') {
        SSE_Broadcast.broadcast('face-results', 'enroll-decision', {
            student_id: capture.student_id,
            face_capture_id: capture.id,
            decision: terminalStatus,
            reason: meta.reason || undefined,
            device_status: meta.state,
            elapsed_ms: meta.elapsedMs,
        });
    }
};

/**
 * Applies camera firmware status reports from MQTT.
 * @param {object} params - Status report parsed from face/status topic.
 * @param {string} params.deviceId - Camera device ID from the status topic.
 * @param {number} params.attendanceId - Attendance ID reported by firmware.
 * @param {string} params.state - Firmware state name.
 * @param {string} [params.reason] - Firmware reason code.
 * @param {number} [params.faceScore] - Embedded detector score.
 * @param {number} [params.elapsedMs] - Firmware elapsed time.
 * @returns {Promise<object>} Handling result for logging/tests.
 */
const handleCaptureStatus = async ({ deviceId, attendanceId, state, reason, faceScore, elapsedMs }) => {
    if (!deviceId || !DEVICE_ID_REGEX.test(deviceId)) {
        return { ok: false, status: 400, message: 'invalid device_id' };
    }

    const aid = parseInt(attendanceId, 10);
    if (Number.isNaN(aid) || aid < 0) {
        return { ok: false, status: 400, message: 'invalid attendance_id' };
    }

    const meta = normalizeCameraStatus({ state, reason, faceScore, elapsedMs });
    if (!meta) {
        return { ok: false, status: 400, message: 'invalid camera status' };
    }

    const capture = await findCaptureForCameraStatus({ deviceId, attendanceId: aid });
    if (!capture || capture.device_id !== deviceId) {
        logger.warn(`[Face] Status ignored; no matching capture cam=${deviceId} attendance=${aid} state=${meta.state}`);
        return { ok: false, status: 404, message: 'capture not found' };
    }

    const updateParams = {
        device_status: meta.state,
        device_status_reason: meta.reason,
        device_elapsed_ms: meta.elapsedMs,
        face_score: meta.faceScore,
    };
    const terminalStatus = TERMINAL_CAMERA_STATUS[meta.state];
    let updated = null;

    if (terminalStatus) {
        updated = await FaceCaptureModel.setDeviceTerminal(capture.id, {
            status: terminalStatus,
            ...updateParams,
        });
        if (updated) {
            await broadcastTerminalCameraStatus(capture, terminalStatus, meta);
        }
    }

    if (!updated) {
        updated = await FaceCaptureModel.updateDeviceStatus(capture.id, updateParams);
    }

    logger.info(
        `[Face] Camera status cam=${deviceId} attendance=${aid} ` +
        `capture=${capture.id} state=${meta.state} reason=${meta.reason || '-'}`
    );
    return { ok: true, capture_id: capture.id, state: meta.state, terminal_status: terminalStatus || null };
};

const handleFaceUpload = async ({ deviceId, attendanceId, captureToken, imageBuf, faceBox, faceScore, faceDetected }) => {
    if (!deviceId || !DEVICE_ID_REGEX.test(deviceId)) {
        return { ok: false, status: 400, message: 'invalid device_id' };
    }
    if (!captureToken || captureToken.length !== 64) {
        return { ok: false, status: 400, message: 'invalid capture_token' };
    }
    const aid = parseInt(attendanceId, 10);
    if (Number.isNaN(aid) || aid < 0) {
        return { ok: false, status: 400, message: 'invalid attendance_id' };
    }

    const capture = await FaceCaptureModel.findByToken(captureToken);
    if (!capture) {
        return { ok: false, status: 404, message: 'capture_token not found' };
    }
    if (capture.device_id !== deviceId) {
        return { ok: false, status: 403, message: 'device_id mismatch' };
    }
    if (capture.type === 'attendance') {
        if (capture.attendance_id !== aid) {
            return { ok: false, status: 400, message: 'attendance_id mismatch' };
        }
    }
    if (capture.status !== ACCEPTED_UPLOAD_CAPTURE_STATUS) {
        return { ok: false, status: 409, message: `capture_token no longer active (${capture.status})` };
    }
    if (capture.used_at) {
        return { ok: false, status: 409, message: 'capture_token already used' };
    }

    const ageMs = Date.now() - new Date(capture.created_at).getTime();
    if (ageMs > config.face.tokenTtlSeconds * 1000) {
        await FaceCaptureModel.setExpired(capture.id);
        if (capture.type === 'attendance') {
            await AttendanceModel.setFaceStatus(aid, {
                face_status: 'expired',
                face_capture_id: capture.id,
            });
            SSE_Broadcast.broadcast('face-results', 'face-decision', {
                attendance_id: aid,
                face_capture_id: capture.id,
                decision: 'expired',
            });
        }
        return { ok: false, status: 410, message: 'capture_token expired' };
    }

    const marked = await FaceCaptureModel.markUsed(capture.id);
    if (!marked) {
        return { ok: false, status: 409, message: 'capture_token already used (race)' };
    }

    let imagePath = null;
    if (faceDetected && imageBuf && imageBuf.length > 0) {
        try {
            imagePath = buildImagePath(aid);
            ensureDir(path.dirname(imagePath));
            fs.writeFileSync(imagePath, imageBuf);
        } catch (err) {
            logger.error(`[Face] Failed to write image: ${err.message}`);
            imagePath = null;
        }
    }

    const updated = await FaceCaptureModel.attachImage(capture.id, {
        image_path: imagePath,
        face_box: faceBox || null,
        face_score: typeof faceScore === 'number' ? faceScore : null,
        face_detected: !!faceDetected && imageBuf && imageBuf.length > 0,
    });

    if (!faceDetected || !imageBuf || imageBuf.length === 0) {
        // Short-circuit: no face detected, no need to call AI
        await FaceCaptureModel.setAiResult(capture.id, { status: 'no_face', ai_request_id: null });
        
        if (capture.type === 'attendance') {
            await AttendanceModel.setFaceStatus(aid, {
                face_status: 'no_face',
                face_capture_id: capture.id,
            });
            SSE_Broadcast.broadcast('face-results', 'face-decision', {
                attendance_id: aid,
                face_capture_id: capture.id,
                decision: 'no_face',
            });
        } else if (capture.type === 'enroll') {
            SSE_Broadcast.broadcast('face-results', 'enroll-decision', {
                student_id: capture.student_id,
                face_capture_id: capture.id,
                decision: 'no_face',
            });
        }
        return { ok: true, face_capture_id: capture.id, status: 'no_face' };
    }

    if (capture.type === 'enroll') {
        // Enrollment flow: Extract feature and save to student
        aiClient.extractFeature({
            student_id_hint: capture.student_id,
            image: imageBuf,
            box: faceBox,
        }).then(async (resp) => {
            if (resp.success && resp.embedding && resp.embedding.length > 0) {
                await StudentModel.addEmbedding(capture.student_id, resp.embedding);
                await FaceCaptureModel.setAiResult(capture.id, { status: 'match', ai_request_id: null });
                SSE_Broadcast.broadcast('face-results', 'enroll-decision', {
                    student_id: capture.student_id,
                    face_capture_id: capture.id,
                    decision: 'success',
                });
                logger.info(`[Face] Extracted and saved embedding for student=${capture.student_id}`);
            } else {
                // Determine specific failure reason from AI error message
                const aiError = (resp.error || '').toLowerCase();
                let decision = 'error';
                if (aiError.includes('not looking straight') || aiError.includes('pitch') || aiError.includes('yaw')) {
                    decision = 'bad_pose';
                } else if (aiError.includes('no face')) {
                    decision = 'no_face';
                }

                await FaceCaptureModel.setAiResult(capture.id, { status: decision, ai_request_id: null });
                SSE_Broadcast.broadcast('face-results', 'enroll-decision', {
                    student_id: capture.student_id,
                    face_capture_id: capture.id,
                    decision,
                    error: resp.error || 'Unknown extraction error',
                });
                logger.warn(`[Face] Enrollment failed for student=${capture.student_id}: ${resp.error}`);
            }
        }).catch(async (err) => {
            logger.error(`[Face] AI Extract error capture=${capture.id}: ${err.message}`);
            await FaceCaptureModel.setAiResult(capture.id, { status: 'ai_error', ai_request_id: null });
            SSE_Broadcast.broadcast('face-results', 'enroll-decision', {
                student_id: capture.student_id,
                face_capture_id: capture.id,
                decision: 'ai_error',
                error: err.message,
            });
        });
        return { ok: true, face_capture_id: capture.id, status: 'processing' };
    }

    // Fire-and-forget gRPC call for Attendance
    const attendanceRecord = await AttendanceModel.findById(aid);
    const studentId = attendanceRecord?.student_id || 0;
    
    let refEmbeddings = [];
    if (studentId) {
        const embeddings = await StudentModel.getEmbeddings(studentId);
        if (embeddings && embeddings.length > 0) refEmbeddings = embeddings;
    }

    aiClient.recognize({
        face_capture_id: capture.id,
        attendance_id: aid,
        student_id_hint: studentId,
        image: imageBuf,
        box: faceBox,
        reference_embeddings: refEmbeddings,
    })
        .then(async (resp) => {
            await onAiResult(capture.id, aid, resp);
        })
        .catch(async (err) => {
            logger.error(`[Face] AI gRPC error capture=${capture.id}: ${err.message}`);
            await FaceCaptureModel.setAiResult(capture.id, { status: 'ai_error', ai_request_id: null });
            await AttendanceModel.setFaceStatus(aid, {
                face_status: 'ai_error',
                face_capture_id: capture.id,
            });
        });

    return { ok: true, face_capture_id: capture.id, status: 'processing' };
};

const onAiResult = async (faceCaptureId, attendanceId, aiResp) => {
    const decision = aiResp.decision || 'error';
    await FaceCaptureModel.setAiResult(faceCaptureId, {
        status: decision,
        ai_request_id: aiResp.request_id || null,
        match_score: aiResp.score,
        liveness_score: aiResp.liveness_score,
    });
    await AttendanceModel.setFaceStatus(attendanceId, {
        face_status: decision,
        face_capture_id: faceCaptureId,
    });

    const isStrict = config.face.strictMode && aiClient.isServiceHealthy();
    if (isStrict && decision !== 'match') {
        // Mark attendance as failed in strict mode; admin decides
        await AttendanceModel.setFaceStatus(attendanceId, {
            face_status: `failed_${decision}`,
            face_capture_id: faceCaptureId,
        });
    }

    SSE_Broadcast.broadcast('face-results', 'face-decision', {
        attendance_id: attendanceId,
        face_capture_id: faceCaptureId,
        student_id: aiResp.student_id,
        matched: !!aiResp.matched,
        decision,
        score: aiResp.score,
        liveness_score: aiResp.liveness_score,
    });
    logger.info(`[Face] AI result attendance=${attendanceId} decision=${decision} score=${aiResp.score?.toFixed?.(2)} matched=${!!aiResp.matched}`);
};

const getByAttendance = async (attendanceId) => {
    return FaceCaptureModel.findLatestByAttendance(attendanceId);
};

module.exports = {
    triggerFaceCapture,
    triggerFaceEnroll,
    handleFaceUpload,
    handleCaptureStatus,
    onAiResult,
    getByAttendance,
};
