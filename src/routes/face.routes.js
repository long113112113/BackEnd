const express = require('express');
const router = express.Router();
const FaceController = require('../controllers/face.controller');
const { parseHeaders } = require('../middlewares/faceUpload.middleware');
const { authMiddleware, requireManagerOrAdmin } = require('../middlewares/auth.middleware');

router.post(
    '/upload',
    express.raw({ type: ['image/jpeg', 'application/octet-stream'], limit: '200kb' }),
    parseHeaders,
    FaceController.upload
);

router.get(
    '/attendance/:attendanceId',
    authMiddleware,
    requireManagerOrAdmin,
    FaceController.getByAttendance
);

router.get(
    '/image/:attendanceId',
    authMiddleware,
    requireManagerOrAdmin,
    FaceController.getImage
);

module.exports = router;
