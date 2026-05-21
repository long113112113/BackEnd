const express = require('express');
const router = express.Router();
const StudentController = require('../controllers/student.controller');
const authMiddleware = require('../middlewares/auth.middleware');

router.get('/', authMiddleware, StudentController.getAll);
router.get('/:id', authMiddleware, StudentController.getById);
router.post('/', authMiddleware, StudentController.create);
router.put('/:id', authMiddleware, StudentController.update);
router.delete('/:id', authMiddleware, StudentController.delete);

module.exports = router;
