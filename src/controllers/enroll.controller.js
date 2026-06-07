const enrollService = require('../services/enroll.service');

const EnrollController = {
    enroll: async (req, res, next) => {
        try {
            const studentId = parseInt(req.params.id, 10);
            if (isNaN(studentId)) {
                return res.status(400).json({ success: false, message: 'Invalid student ID' });
            }

            let imageBufs = [];
            if (req.files && req.files.length > 0) {
                imageBufs = req.files.map(f => f.buffer);
            } else if (req.body && Buffer.isBuffer(req.body) && req.body.length > 0) {
                // Fallback for single raw image
                imageBufs = [req.body];
            }

            if (imageBufs.length === 0) {
                return res.status(400).json({ success: false, message: 'No images provided' });
            }

            if (imageBufs.length > 3) {
                return res.status(400).json({ success: false, message: 'Maximum 3 images allowed' });
            }

            const result = await enrollService.enrollFace(studentId, imageBufs);
            if (!result.ok) {
                return res.status(result.status).json({ success: false, message: result.message });
            }

            res.json({
                success: true,
                message: 'Face enrolled successfully',
                quality_score: result.quality_score,
                embedding_dim: result.embedding_dim,
                count: result.count
            });
        } catch (err) {
            next(err);
        }
    },

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
    }
};

module.exports = EnrollController;
