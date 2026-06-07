const StudentModel = require('../models/student.model');

const unenrollFace = async (studentId) => {
    const student = await StudentModel.findById(studentId);
    if (!student) {
        return { ok: false, status: 404, message: 'Student not found' };
    }
    await StudentModel.clearEmbeddings(student.id);
    return { ok: true };
};

const getEnrollmentStatus = async (studentId) => {
    const student = await StudentModel.findById(studentId);
    if (!student) {
        return { ok: false, status: 404, message: 'Student not found' };
    }
    const count = await StudentModel.getEmbeddingCount(student.id);
    return { ok: true, data: { enrolled: count > 0, count } };
};

module.exports = { unenrollFace, getEnrollmentStatus };
