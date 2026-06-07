const StudentModel = require('../models/student.model');
const aiClient = require('./ai.grpc.server');

const enrollFace = async (studentId, imageBufs) => {
    const student = await StudentModel.findById(studentId);
    if (!student) {
        return { ok: false, status: 404, message: 'Student not found' };
    }

    try {
        const embeddings = [];
        let totalQuality = 0;

        // Process sequentially
        for (const buf of imageBufs) {
            const resp = await aiClient.extractFeature({
                student_id_hint: student.id,
                image: buf,
            });

            if (!resp.success) {
                return { ok: false, status: 400, message: resp.error || 'Failed to extract face embedding' };
            }

            if (!resp.embedding || resp.embedding.length === 0) {
                return { ok: false, status: 400, message: 'AI returned empty embedding' };
            }

            embeddings.push(resp.embedding);
            totalQuality += resp.quality_score || 0;
        }

        // Replace existing
        await StudentModel.clearEmbeddings(student.id);

        for (const emb of embeddings) {
            await StudentModel.addEmbedding(student.id, emb);
        }

        return { 
            ok: true, 
            quality_score: totalQuality / embeddings.length,
            embedding_dim: embeddings[0].length,
            count: embeddings.length
        };
    } catch (err) {
        return { ok: false, status: 500, message: `AI Service Error: ${err.message}` };
    }
};

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

module.exports = { enrollFace, unenrollFace, getEnrollmentStatus };
