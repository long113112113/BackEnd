const path = require('path');
const logger = require('../utils/logger');
const config = require('../config');

let grpc;
let protoLoader;
let server = null;
let activeWorkers = new Set();
let pendingTasks = new Map();

const PROTO_PATH = path.join(__dirname, '..', '..', 'proto', 'face_recognition.proto');

const startServer = () => {
    if (!config.ai.enabled) {
        logger.info('[AI] AI_GRPC_ENABLED=false, gRPC server disabled (stub mode)');
        return;
    }
    try {
        grpc = require('@grpc/grpc-js');
        protoLoader = require('@grpc/proto-loader');
    } catch (err) {
        logger.error('[AI] gRPC deps missing. Run `npm i @grpc/grpc-js @grpc/proto-loader`');
        return;
    }

    const protoRoot = protoLoader.loadSync(PROTO_PATH, {
        keepCase: false,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
    });
    const pkg = grpc.loadPackageDefinition(protoRoot);
    const serviceCtor = pkg.facerecognition.FaceRecognition.service;

    server = new grpc.Server();

    server.addService(serviceCtor, {
        Recognize: (call, callback) => {
            // Legacy unary fallback
            callback({
                code: grpc.status.UNIMPLEMENTED,
                details: "Unary Recognize is deprecated. Use ConnectWorker."
            });
        },
        ConnectWorker: (call) => {
            let workerId = 'unknown';
            activeWorkers.add(call);
            logger.info('[AI Worker] New worker connected.');

            call.on('data', (workerMsg) => {
                if (workerMsg.register) {
                    workerId = workerMsg.register.worker_id;
                    logger.info(`[AI Worker] Worker registered: ${workerId}`);
                } else if (workerMsg.result) {
                    const resp = workerMsg.result;
                    // We expect the worker to echo the face_capture_id into the request_id field
                    const taskId = resp.request_id;
                    
                    const task = pendingTasks.get(taskId);
                    if (task) {
                        clearTimeout(task.timeout);
                        pendingTasks.delete(taskId);
                        task.resolve({
                            matched: !!resp.matched,
                            student_id: resp.student_id || 0,
                            score: resp.score || 0,
                            liveness_score: resp.liveness_score || 0,
                            decision: resp.decision || 'error',
                            request_id: resp.request_id || '',
                        });
                    } else {
                        logger.debug(`[AI Worker] Received result for unknown/expired task: ${taskId}`);
                    }
                }
            });

            call.on('end', () => {
                logger.info(`[AI Worker] Worker disconnected: ${workerId}`);
                activeWorkers.delete(call);
            });

            call.on('error', (err) => {
                logger.error(`[AI Worker] Worker error (${workerId}): ${err.message}`);
                activeWorkers.delete(call);
            });
        }
    });

    const bindAddr = config.ai.grpcUrl || '0.0.0.0:50051';
    server.bindAsync(bindAddr, grpc.ServerCredentials.createInsecure(), (err, port) => {
        if (err) {
            logger.error(`[AI] gRPC Server failed to bind on ${bindAddr}: ${err.message}`);
            return;
        }
        // grpc.Server.start() is not strictly required in @grpc/grpc-js latest versions if using bindAsync, but it's safe to call.
        server.start();
        logger.info(`[AI] gRPC Worker Server listening on ${bindAddr}`);
    });
};

const stopServer = () => {
    return new Promise((resolve) => {
        if (server) {
            server.tryShutdown(() => {
                logger.info('[AI] gRPC Server shut down.');
                resolve();
            });
        } else {
            resolve();
        }
    });
};

/**
 * Recognize a captured face. Routes the task to an available worker stream.
 * @param {{face_capture_id:number, attendance_id:number, student_id_hint:number, image:Buffer, box?:{x:number,y:number,w:number,h:number,score:number}, ts_ms?:number}} req
 * @returns {Promise<{matched:boolean, student_id:number, score:number, liveness_score:number, decision:string, request_id:string}>}
 */
const recognize = (req) => {
    return new Promise((resolve, reject) => {
        if (!config.ai.enabled || !server) {
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

        if (activeWorkers.size === 0) {
            return reject(new Error('No active AI workers available'));
        }

        // Pick a random worker for basic load balancing
        const workers = Array.from(activeWorkers);
        const selectedWorker = workers[Math.floor(Math.random() * workers.length)];

        const taskId = req.face_capture_id.toString();
        
        // Timeout (5 seconds max for the worker to respond)
        const timeout = setTimeout(() => {
            if (pendingTasks.has(taskId)) {
                pendingTasks.delete(taskId);
                reject(new Error('AI Worker processing timeout'));
            }
        }, 5000);

        pendingTasks.set(taskId, { resolve, reject, timeout });

        const requestPayload = {
            face_capture_id: req.face_capture_id,
            attendance_id: req.attendance_id,
            student_id_hint: req.student_id_hint || 0,
            image: req.image || Buffer.alloc(0),
            box: {
                x: req.box?.x || 0,
                y: req.box?.y || 0,
                w: req.box?.w || 0,
                h: req.box?.h || 0,
                score: req.box?.score || 0,
            },
            ts_ms: req.ts_ms || Date.now(),
        };

        try {
            selectedWorker.write({ task: requestPayload });
        } catch (err) {
            clearTimeout(timeout);
            pendingTasks.delete(taskId);
            activeWorkers.delete(selectedWorker);
            reject(new Error(`Failed to write to worker: ${err.message}`));
        }
    });
};

module.exports = { startServer, stopServer, recognize };
