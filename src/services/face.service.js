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

const ensureDir = (dir) => {
    fs.mkdirSync(dir, { recursive: true });
};

const buildImagePath = (attendanceId, ext = 'jpg') => {
    const now = new Date();
    const dayDir = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
    const ts = `${now.getUTCMonth() + 1}${now.getUTCDate()}_${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')}`;
    return path.join(config.face.storageDir, dayDir, `${attendanceId}_${ts}.${ext}`);
};

const triggerFaceCapture = async ({ nfcDeviceId, attendanceId, studentIdHint }) => {
    const pair = await DevicePairModel.findByNfc(nfcDeviceId);
    if (!pair) {
        logger.info(`[Face] No cam paired for nfc_device=${nfcDeviceId}, skip trigger`);
        return null;
    }
    if (!DEVICE_ID_REGEX.test(pair.cam_device_id)) {
        logger.info(`[Face] Invalid cam_device_id=${pair.cam_device_id}`);
        return null;
    }

    const token = crypto.randomBytes(32).toString('hex');
    const capture = await FaceCaptureModel.createPending({
        attendance_id: attendanceId,
        device_id: pair.cam_device_id,
        capture_token: token,
    });

    const topic = `${mqttConfig.TOPICS.FACE_CAPTURE}/${pair.cam_device_id}`;
    const payload = {
        attendance_id: attendanceId,
        student_id_hint: studentIdHint || 0,
        capture_token: token,
        ts: Date.now(),
        deadline_ts: Date.now() + config.face.captureTimeoutMs,
    };
    mqttConfig.publish(topic, payload);
    logger.info(`[Face] Triggered capture for attendance=${attendanceId} → cam=${pair.cam_device_id}`);
    return capture;
};

const handleFaceUpload = async ({ deviceId, attendanceId, captureToken, imageBuf, faceBox, faceScore, faceDetected }) => {
    if (!deviceId || !DEVICE_ID_REGEX.test(deviceId)) {
        return { ok: false, status: 400, message: 'invalid device_id' };
    }
    if (!captureToken || captureToken.length !== 64) {
        return { ok: false, status: 400, message: 'invalid capture_token' };
    }
    const aid = parseInt(attendanceId, 10);
    if (!aid || aid <= 0) {
        return { ok: false, status: 400, message: 'invalid attendance_id' };
    }

    const capture = await FaceCaptureModel.findByToken(captureToken);
    if (!capture) {
        return { ok: false, status: 404, message: 'capture_token not found' };
    }
    if (capture.device_id !== deviceId) {
        return { ok: false, status: 403, message: 'device_id mismatch' };
    }
    if (capture.attendance_id !== aid) {
        return { ok: false, status: 400, message: 'attendance_id mismatch' };
    }
    if (capture.used_at) {
        return { ok: false, status: 409, message: 'capture_token already used' };
    }

    const ageMs = Date.now() - new Date(capture.created_at).getTime();
    if (ageMs > config.face.tokenTtlSeconds * 1000) {
        await FaceCaptureModel.setExpired(capture.id);
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
        await AttendanceModel.setFaceStatus(aid, {
            face_status: 'no_face',
            face_capture_id: capture.id,
        });
        SSE_Broadcast.broadcast('face-results', 'face-decision', {
            attendance_id: aid,
            face_capture_id: capture.id,
            decision: 'no_face',
        });
        return { ok: true, face_capture_id: capture.id, status: 'no_face' };
    }

    // Fire-and-forget gRPC call
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
    });
    await AttendanceModel.setFaceStatus(attendanceId, {
        face_status: decision,
        face_capture_id: faceCaptureId,
    });

    if (config.face.strictMode && decision !== 'match') {
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
        decision,
        score: aiResp.score,
        liveness_score: aiResp.liveness_score,
    });
    logger.info(`[Face] AI result attendance=${attendanceId} decision=${decision} score=${aiResp.score?.toFixed?.(2)}`);
};

const getByAttendance = async (attendanceId) => {
    return FaceCaptureModel.findLatestByAttendance(attendanceId);
};

module.exports = { triggerFaceCapture, handleFaceUpload, onAiResult, getByAttendance };
