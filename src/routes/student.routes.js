const express = require('express');
const router = express.Router();
const StudentController = require('../controllers/student.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { createStudent, updateStudent, studentIdParam } = require('../validations/student.validation');

router.get('/', authMiddleware, StudentController.getAll);
router.get('/:id', authMiddleware, validate(studentIdParam), StudentController.getById);
router.post('/', authMiddleware, validate(createStudent), StudentController.create);
router.put('/:id', authMiddleware, validate(updateStudent), StudentController.update);
router.delete('/:id', authMiddleware, validate(studentIdParam), StudentController.delete);

module.exports = router;
