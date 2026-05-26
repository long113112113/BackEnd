const crypto = require('crypto');

const NONCE_TTL_MS = 60_000;
const AES_DOMAIN_SEPARATOR = 'attendance-aes-gcm-v1';

const seenNonces = new Map();

setInterval(() => {
    const now = Date.now();
    for (const [nonce, ts] of seenNonces) {
        if (now - ts > NONCE_TTL_MS) {
            seenNonces.delete(nonce);
        }
    }
}, 10_000);

const computeHmac = (keyHex, message) => {
    const key = Buffer.from(keyHex, 'hex');
    return crypto.createHmac('sha256', key).update(message).digest('hex');
};

const deriveAesKey = (hmacKeyHex) => {
    const key = Buffer.from(hmacKeyHex, 'hex');
    return crypto.createHmac('sha256', key).update(AES_DOMAIN_SEPARATOR).digest('hex');
};

const encryptAesGcm = (keyHex, plaintext) => {
    const key = Buffer.from(keyHex, 'hex');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
        iv: iv.toString('base64'),
        ciphertext: encrypted.toString('base64'),
        auth_tag: authTag.toString('base64'),
    };
};

const decryptAesGcm = (keyHex, encryptedObj) => {
    const key = Buffer.from(keyHex, 'hex');
    const iv = Buffer.from(encryptedObj.iv, 'base64');
    const ciphertext = Buffer.from(encryptedObj.ciphertext, 'base64');
    const authTag = Buffer.from(encryptedObj.auth_tag, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
};

const verifyNonce = (nonce) => {
    if (!nonce || typeof nonce !== 'string' || nonce.length !== 32) {
        return { ok: false, reason: 'invalid_nonce_format' };
    }
    if (seenNonces.has(nonce)) {
        return { ok: false, reason: 'nonce_reused' };
    }
    seenNonces.set(nonce, Date.now());
    return { ok: true };
};

const NVS_RESET_DELTA_THRESHOLD = 1000;

const verifySeq = (newSeq, lastSeq) => {
    const seq = Number(newSeq);
    if (isNaN(seq) || seq <= 0) {
        return { ok: false, reason: 'invalid_seq' };
    }
    if (!Number.isSafeInteger(seq)) {
        return { ok: false, reason: 'overflow_seq' };
    }
    const last = Number(lastSeq);
    if (!Number.isSafeInteger(last)) {
        return { ok: false, reason: 'overflow_last_seq' };
    }
    if (seq > last) {
        return { ok: true };
    }
    if (seq === 1 || (last - seq) > NVS_RESET_DELTA_THRESHOLD) {
        return { ok: true, nvs_reset: true };
    }
    return { ok: false, reason: 'seq_not_monotonic', expected: last + 1, got: seq };
};

module.exports = {
    computeHmac,
    verifyNonce,
    verifySeq,
    deriveAesKey,
    encryptAesGcm,
    decryptAesGcm,
};
