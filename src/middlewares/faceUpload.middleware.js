const DEVICE_ID_REGEX = /^[a-zA-Z0-9_-]{1,50}$/;

const parseHeaders = (req, res, next) => {
    const deviceId = req.get('X-Device-Id');
    const attendanceId = req.get('X-Attendance-Id');
    const captureToken = req.get('X-Capture-Token');
    const faceBoxRaw = req.get('X-Face-Box');
    const faceScoreRaw = req.get('X-Face-Score');
    const faceDetectedRaw = req.get('X-Face-Detected');

    if (!deviceId || !DEVICE_ID_REGEX.test(deviceId)) {
        return res.status(400).json({ success: false, message: 'invalid or missing X-Device-Id' });
    }
    const aid = parseInt(attendanceId, 10);
    if (!aid || aid <= 0) {
        return res.status(400).json({ success: false, message: 'invalid X-Attendance-Id' });
    }
    if (!captureToken || !/^[a-f0-9]{64}$/.test(captureToken)) {
        return res.status(400).json({ success: false, message: 'invalid X-Capture-Token' });
    }

    let faceBox = null;
    if (faceBoxRaw) {
        try {
            faceBox = JSON.parse(faceBoxRaw);
            if (typeof faceBox !== 'object' || faceBox === null) throw new Error('not object');
        } catch {
            return res.status(400).json({ success: false, message: 'invalid X-Face-Box JSON' });
        }
    }
    const faceScore = faceScoreRaw != null ? parseFloat(faceScoreRaw) : null;
    const faceDetected = faceDetectedRaw === 'true' || faceDetectedRaw === '1';

    req.faceMeta = {
        deviceId,
        attendanceId: aid,
        captureToken,
        faceBox,
        faceScore: Number.isFinite(faceScore) ? faceScore : null,
        faceDetected,
    };
    next();
};

module.exports = { parseHeaders };
