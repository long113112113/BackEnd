const express = require('express');
const router = express.Router();
const StudentController = require('../controllers/student.controller');
const { authMiddleware, requireAdmin, requireManagerOrAdmin } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { createStudent, updateStudent, studentIdParam, getStudents } = require('../validations/student.validation');

router.get('/', authMiddleware, requireAdmin, validate(getStudents), StudentController.getAll);
router.get('/:id', authMiddleware, requireManagerOrAdmin, validate(studentIdParam), StudentController.getById);
router.post('/', authMiddleware, requireManagerOrAdmin, validate(createStudent), StudentController.create);
router.put('/:id', authMiddleware, requireManagerOrAdmin, validate(updateStudent), StudentController.update);
router.delete('/:id', authMiddleware, requireAdmin, validate(studentIdParam), StudentController.delete);

module.exports = router;
