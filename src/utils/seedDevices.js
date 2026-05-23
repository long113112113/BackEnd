const DeviceKeyModel = require('../models/deviceKey.model');

const seedDevices = async () => {
    try {
        const raw = process.env.DEVICE_HMAC_KEYS;

        if (!raw) {
            console.log('[Seed] DEVICE_HMAC_KEYS not set. Skipping device key seed.');
            return;
        }

        const entries = raw.split(',').map(s => s.trim()).filter(Boolean);

        for (const entry of entries) {
            const colonIdx = entry.indexOf(':');
            if (colonIdx === -1) {
                console.warn(`[Seed] Invalid DEVICE_HMAC_KEYS entry (missing colon): "${entry}"`);
                continue;
            }

            const device_id = entry.slice(0, colonIdx).trim();
            const hmac_key = entry.slice(colonIdx + 1).trim();

            if (!device_id || !hmac_key) {
                console.warn(`[Seed] Invalid DEVICE_HMAC_KEYS entry: "${entry}"`);
                continue;
            }

            await DeviceKeyModel.upsert({ device_id, hmac_key });
            console.log(`[Seed] Device key provisioned: ${device_id}`);
        }
    } catch (err) {
        console.error('[Seed] Failed to seed device keys:', err.message);
    }
};

module.exports = seedDevices;
