const express = require('express');
const router = express.Router();
const multer = require('multer');
const StudentController = require('../controllers/student.controller');
const EnrollController = require('../controllers/enroll.controller');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 500 * 1024, files: 3 },
    fileFilter: (_req, file, cb) => {
        if (['image/jpeg', 'image/png'].includes(file.mimetype)) {
            cb(null, true);
        } else {
            const err = new Error('Invalid file type. Only JPEG and PNG are allowed.');
            err.statusCode = 400;
            cb(err, false);
        }
    }
});
const { authMiddleware, requireAdmin, requireManagerOrAdmin } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { createStudent, updateStudent, studentIdParam, getStudents } = require('../validations/student.validation');

router.get('/', authMiddleware, requireAdmin, validate(getStudents), StudentController.getAll);
router.get('/:id', authMiddleware, requireManagerOrAdmin, validate(studentIdParam), StudentController.getById);
router.post('/', authMiddleware, requireManagerOrAdmin, validate(createStudent), StudentController.create);
router.put('/:id', authMiddleware, requireManagerOrAdmin, validate(updateStudent), StudentController.update);
router.delete('/:id', authMiddleware, requireAdmin, validate(studentIdParam), StudentController.delete);

// Enrollment routes
router.post('/:id/enroll-face', 
    authMiddleware, 
    requireManagerOrAdmin, 
    validate(studentIdParam),
    upload.array('images', 3),
    EnrollController.enroll
);
router.delete('/:id/enroll-face', authMiddleware, requireAdmin, validate(studentIdParam), EnrollController.unenroll);
router.get('/:id/enroll-face', authMiddleware, requireManagerOrAdmin, validate(studentIdParam), EnrollController.status);

module.exports = router;
