const express = require('express');
const router = express.Router();
const DashboardController = require('../controllers/dashboard.controller');
const { authMiddleware, requireManagerOrAdmin } = require('../middlewares/auth.middleware');

router.get('/chart', authMiddleware, requireManagerOrAdmin, DashboardController.getChart);
router.get('/stream', authMiddleware, requireManagerOrAdmin, DashboardController.streamChart);

module.exports = router;
