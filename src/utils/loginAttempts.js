const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

const attempts = new Map();

const cleanup = () => {
    const now = Date.now();
    for (const [username, data] of attempts) {
        if (data.lockUntil && data.lockUntil < now) {
            attempts.delete(username);
        }
    }
};

const cleanupInterval = setInterval(cleanup, CLEANUP_INTERVAL_MS);
cleanupInterval.unref();

const checkLockout = (username) => {
    const data = attempts.get(username);
    if (!data) return { locked: false };

    if (data.lockUntil && data.lockUntil > Date.now()) {
        const retryAfter = Math.ceil((data.lockUntil - Date.now()) / 1000);
        return { locked: true, retryAfter };
    }

    if (data.lockUntil && data.lockUntil <= Date.now()) {
        attempts.delete(username);
        return { locked: false };
    }

    return { locked: false };
};

const recordFailure = (username) => {
    const data = attempts.get(username) || { count: 0, lockUntil: null };
    data.count += 1;

    if (data.count >= MAX_ATTEMPTS) {
        data.lockUntil = Date.now() + LOCK_DURATION_MS;
    }

    attempts.set(username, data);
};

const resetAttempts = (username) => {
    attempts.delete(username);
};

module.exports = { checkLockout, recordFailure, resetAttempts };
