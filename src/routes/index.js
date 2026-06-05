
const express = require('express');
const router = express.Router();
const { notFoundHandler } = require('../middlewares/error.middleware');

const authRoutes = require('./auth.routes');
const studentRoutes = require('./student.routes');
const attendanceRoutes = require('./attendance.routes');
const unknownCardRoutes = require('./unknownCard.routes');
const deviceKeyRoutes = require('./deviceKey.routes');
const dashboardRoutes = require('./dashboard.routes');
const faceRoutes = require('./face.routes');
const devicePairRoutes = require('./devicePair.routes');

router.use('/auth', authRoutes);
router.use('/students', studentRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/unknown-cards', unknownCardRoutes);
router.use('/device-keys', deviceKeyRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/face', faceRoutes);
router.use('/device-pairs', devicePairRoutes);

router.use(notFoundHandler);

module.exports = router;
