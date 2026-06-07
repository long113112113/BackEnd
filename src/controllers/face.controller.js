const path = require('path');
const faceService = require('../services/face.service');

const FaceController = {
    upload: async (req, res, next) => {
        try {
            const { deviceId, attendanceId, captureToken, faceBox, faceScore, faceDetected } = req.faceMeta;
            const imageBuf = req.body && req.body.length > 0 ? req.body : null;

            const result = await faceService.handleFaceUpload({
                deviceId,
                attendanceId,
                captureToken,
                imageBuf,
                faceBox,
                faceScore,
                faceDetected,
            });

            if (!result.ok) {
                return res.status(result.status).json({ success: false, message: result.message });
            }
            res.json({
                success: true,
                face_capture_id: result.face_capture_id,
                status: result.status,
            });
        } catch (err) {
            next(err);
        }
    },

    getByAttendance: async (req, res, next) => {
        try {
            const aid = parseInt(req.params.attendanceId, 10);
            if (!aid) {
                return res.status(400).json({ success: false, message: 'invalid attendanceId' });
            }
            const capture = await faceService.getByAttendance(aid);
            res.json({ success: true, data: capture });
        } catch (err) {
            next(err);
        }
    },

    getImage: async (req, res, next) => {
        try {
            const aid = parseInt(req.params.attendanceId, 10);
            if (!aid) {
                return res.status(400).json({ success: false, message: 'invalid attendanceId' });
            }
            const capture = await faceService.getByAttendance(aid);
            if (!capture || !capture.image_path) {
                return res.status(404).json({ success: false, message: 'face image not found' });
            }
            const absolutePath = path.resolve(capture.image_path);
            res.sendFile(absolutePath);
        } catch (err) {
            next(err);
        }
    },
};

module.exports = FaceController;
