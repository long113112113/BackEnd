const logger = require('../utils/logger');

const channels = new Map();

const SSE_Broadcast = {
    addClient: (res, channel = 'unknown-cards') => {
        if (!channels.has(channel)) {
            channels.set(channel, new Set());
        }
        channels.get(channel).add(res);
        logger.info(`[SSE Broadcast] Client added to channel '${channel}' (total: ${channels.get(channel).size})`);
    },

    removeClient: (res, channel = 'unknown-cards') => {
        const channelSet = channels.get(channel);
        if (!channelSet) return;
        channelSet.delete(res);
        logger.info(`[SSE Broadcast] Client removed from channel '${channel}' (total: ${channelSet.size})`);
        if (channelSet.size === 0) {
            channels.delete(channel);
        }
    },

    getClientCount: (channel) => {
        const channelSet = channels.get(channel);
        return channelSet ? channelSet.size : 0;
    },

    broadcast: (channel, event, data) => {
        const channelSet = channels.get(channel);
        if (!channelSet || channelSet.size === 0) return;

        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        const dead = [];

        for (const res of channelSet) {
            if (res.writableEnded || res.writableFinished || res.destroyed) {
                dead.push(res);
                continue;
            }
            try {
                const ok = res.write(payload);
                if (!ok) {
                    res.once('drain', () => {});
                }
            } catch {
                dead.push(res);
            }
        }

        for (const res of dead) {
            channelSet.delete(res);
        }
    },

    disconnectChannel: (channel, reason = 'channel_closed') => {
        const channelSet = channels.get(channel);
        if (!channelSet || channelSet.size === 0) return;

        const payload = `event: error\ndata: ${JSON.stringify({ message: reason })}\n\n`;
        for (const res of channelSet) {
            try {
                res.write(payload);
                res.end();
            } catch {}
        }
        channels.delete(channel);
        logger.info(`[SSE Broadcast] Disconnected all clients from channel '${channel}' (reason: ${reason})`);
    },
};

module.exports = SSE_Broadcast;
