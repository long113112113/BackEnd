const express = require('express');
const router = express.Router();
const StudentController = require('../controllers/student.controller');
const { authMiddleware, requireAdmin } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { createStudent, updateStudent, studentIdParam } = require('../validations/student.validation');

router.get('/', authMiddleware, requireAdmin, StudentController.getAll);
router.get('/:id', authMiddleware, validate(studentIdParam), StudentController.getById);
router.post('/', authMiddleware, requireAdmin, validate(createStudent), StudentController.create);
router.put('/:id', authMiddleware, requireAdmin, validate(updateStudent), StudentController.update);
router.delete('/:id', authMiddleware, requireAdmin, validate(studentIdParam), StudentController.delete);

module.exports = router;
