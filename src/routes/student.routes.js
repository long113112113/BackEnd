const express = require('express');
const router = express.Router();
const StudentController = require('../controllers/student.controller');
const EnrollController = require('../controllers/enroll.controller');

const { authMiddleware, requireAdmin, requireManagerOrAdmin } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { createStudent, updateStudent, studentIdParam, getStudents } = require('../validations/student.validation');

router.get('/', authMiddleware, requireAdmin, validate(getStudents), StudentController.getAll);
router.get('/:id', authMiddleware, requireManagerOrAdmin, validate(studentIdParam), StudentController.getById);
router.post('/', authMiddleware, requireManagerOrAdmin, validate(createStudent), StudentController.create);
router.put('/:id', authMiddleware, requireManagerOrAdmin, validate(updateStudent), StudentController.update);
router.delete('/:id', authMiddleware, requireAdmin, validate(studentIdParam), StudentController.delete);

// Enrollment status & unenroll (manual upload route removed — enrollment via ESP32 camera only)
router.delete('/:id/enroll-face', authMiddleware, requireAdmin, validate(studentIdParam), EnrollController.unenroll);
router.get('/:id/enroll-face', authMiddleware, requireManagerOrAdmin, validate(studentIdParam), EnrollController.status);
router.get('/:id/enroll-image', authMiddleware, requireManagerOrAdmin, validate(studentIdParam), EnrollController.getEnrollImage);

router.post('/:id/trigger-enroll-cam',
    authMiddleware,
    requireManagerOrAdmin,
    validate(studentIdParam),
    StudentController.triggerEnrollCam
);

module.exports = router;
