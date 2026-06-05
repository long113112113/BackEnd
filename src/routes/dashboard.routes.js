const express = require('express');
const router = express.Router();
const DashboardController = require('../controllers/dashboard.controller');
const { authMiddleware, requireManagerOrAdmin } = require('../middlewares/auth.middleware');

router.get('/chart', authMiddleware, requireManagerOrAdmin, DashboardController.getChart);
router.get('/stream', authMiddleware, requireManagerOrAdmin, DashboardController.streamChart);
router.get('/stream/unknown-cards', authMiddleware, requireManagerOrAdmin, DashboardController.streamUnknownCards);
router.get('/stream/face-results', authMiddleware, requireManagerOrAdmin, DashboardController.streamFaceResults);

module.exports = router;
