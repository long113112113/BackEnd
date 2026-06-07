const path = require('path');
const enrollService = require('../services/enroll.service');
const FaceCaptureModel = require('../models/faceCapture.model');

const EnrollController = {
    unenroll: async (req, res, next) => {
        try {
            const studentId = parseInt(req.params.id, 10);
            if (isNaN(studentId)) {
                return res.status(400).json({ success: false, message: 'Invalid student ID' });
            }

            const result = await enrollService.unenrollFace(studentId);
            if (!result.ok) {
                return res.status(result.status).json({ success: false, message: result.message });
            }

            res.json({ success: true, message: 'Face unenrolled successfully' });
        } catch (err) {
            next(err);
        }
    },

    status: async (req, res, next) => {
        try {
            const studentId = parseInt(req.params.id, 10);
            if (isNaN(studentId)) {
                return res.status(400).json({ success: false, message: 'Invalid student ID' });
            }

            const result = await enrollService.getEnrollmentStatus(studentId);
            if (!result.ok) {
                return res.status(result.status).json({ success: false, message: result.message });
            }

            res.json({ success: true, data: result.data });
        } catch (err) {
            next(err);
        }
    },

    /**
     * GET /api/students/:id/enroll-image
     * Serves the JPEG captured during the latest successful enrollment.
     */
    getEnrollImage: async (req, res, next) => {
        try {
            const studentId = parseInt(req.params.id, 10);
            const index = parseInt(req.query.index || '0', 10);
            if (isNaN(studentId)) {
                return res.status(400).json({ success: false, message: 'Invalid student ID' });
            }

            const capture = await FaceCaptureModel.findLatestEnrollmentByStudent(studentId, index);
            if (!capture || !capture.image_path) {
                return res.status(404).json({ success: false, message: 'No enrollment image found' });
            }

            const absolutePath = path.resolve(capture.image_path);
            res.sendFile(absolutePath);
        } catch (err) {
            next(err);
        }
    },
};

module.exports = EnrollController;
