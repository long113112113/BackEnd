const path = require('path');
const logger = require('../utils/logger');
const config = require('../config');

let grpc;
let protoLoader;
let client = null;
let protoRoot = null;
let serviceCtor = null;

const PROTO_PATH = path.join(__dirname, '..', '..', 'proto', 'face_recognition.proto');

const loadClient = () => {
    if (client) return client;
    if (!config.ai.enabled) {
        logger.info('[AI] AI_GRPC_ENABLED=false, gRPC client disabled (stub mode)');
        return null;
    }
    try {
        grpc = require('@grpc/grpc-js');
        protoLoader = require('@grpc/proto-loader');
    } catch (err) {
        logger.error('[AI] gRPC deps missing. Run `npm i @grpc/grpc-js @grpc/proto-loader`');
        return null;
    }
    protoRoot = protoLoader.loadSync(PROTO_PATH, {
        keepCase: false,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
    });
    const pkg = grpc.loadPackageDefinition(protoRoot);
    serviceCtor = pkg.facerecognition.FaceRecognition;
    if (!serviceCtor) {
        logger.error('[AI] Failed to load FaceRecognition service from proto');
        return null;
    }
    client = new serviceCtor(config.ai.grpcUrl, grpc.credentials.createInsecure());
    logger.info(`[AI] gRPC client ready: ${config.ai.grpcUrl}`);
    return client;
};

/**
 * Recognize a captured face.
 * @param {{face_capture_id:number, attendance_id:number, student_id_hint:number, image:Buffer, box?:{x:number,y:number,w:number,h:number,score:number}, ts_ms?:number}} req
 * @returns {Promise<{matched:boolean, student_id:number, score:number, liveness_score:number, decision:string, request_id:string}>}
 */
const recognize = (req) => {
    return new Promise((resolve, reject) => {
        const c = loadClient();
        if (!c) {
            // Stub mode for development: assume match on non-empty image
            if (req.image && req.image.length > 1024) {
                return resolve({
                    matched: true,
                    student_id: req.student_id_hint || 0,
                    score: 0.99,
                    liveness_score: 0.99,
                    decision: 'match',
                    request_id: 'stub',
                });
            }
            return resolve({
                matched: false,
                student_id: 0,
                score: 0,
                liveness_score: 0,
                decision: 'no_face',
                request_id: 'stub',
            });
        }

        const box = {
            x: req.box?.x || 0,
            y: req.box?.y || 0,
            w: req.box?.w || 0,
            h: req.box?.h || 0,
            score: req.box?.score || 0,
        };
        const request = {
            face_capture_id: req.face_capture_id,
            attendance_id: req.attendance_id,
            student_id_hint: req.student_id_hint || 0,
            image: req.image || Buffer.alloc(0),
            box,
            ts_ms: req.ts_ms || Date.now(),
        };

        const attempt = (retriesLeft, next) => {
            const deadline = new Date(Date.now() + 3000);
            c.Recognize(request, { deadline }, (err, resp) => {
                if (err) {
                    if (retriesLeft > 0 && (err.code === grpc?.status?.UNAVAILABLE || err.code === 14)) {
                        return next(retriesLeft - 1);
                    }
                    return reject(err);
                }
                resolve({
                    matched: !!resp.matched,
                    student_id: resp.student_id || 0,
                    score: resp.score || 0,
                    liveness_score: resp.liveness_score || 0,
                    decision: resp.decision || 'error',
                    request_id: resp.request_id || '',
                });
            });
        };

        attempt(1, (n) => setTimeout(() => attempt(n - 1, () => {}), 200));
    });
};

module.exports = { recognize };
