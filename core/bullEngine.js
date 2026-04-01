// core/bullEngine.js
// BullMQ broadcast queue backed by Redis Cloud.
// Worker looks up sockets by exact sessionKey stored in job data,
// not by substring match, to avoid hitting the wrong session.

const { Queue, Worker } = require('bullmq');
const Redis   = require('ioredis');
const stealth = require('./stealthEngine');
const logger  = require('./logger');
const { redis } = require('../config');

const connection = new Redis({
    host:                 redis.host,
    port:                 redis.port,
    password:             redis.password,
    maxRetriesPerRequest: null,
    enableReadyCheck:     false,
    lazyConnect:          false,
});

connection.on('error', err => logger.error('[REDIS] Connection error:', err));
connection.on('connect', () => logger.success('[REDIS] Connected to Redis Cloud.'));

// ─── Queue ────────────────────────────────────────────────────────────────────
const broadcastQueue = new Queue('elite-broadcast-queue', {
    connection,
    defaultJobOptions: {
        attempts:        5,
        backoff:         { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail:    { count: 200 },
    },
});

// ─── Worker ───────────────────────────────────────────────────────────────────
const broadcastWorker = new Worker('elite-broadcast-queue', async (job) => {
    const { sessionKey, botId, targetJid, textContent, mode, previewData, useGhostProtocol } = job.data;

    // Prefer exact sessionKey lookup; fall back to botId substring for legacy jobs
    let sock = null;
    if (global.waSocks) {
        if (sessionKey && global.waSocks.has(sessionKey)) {
            sock = global.waSocks.get(sessionKey);
        } else if (botId) {
            for (const [key, s] of global.waSocks.entries()) {
                if (key.includes(botId)) { sock = s; break; }
            }
        }
    }

    if (!sock?.user) throw new Error(`Socket offline for session: ${sessionKey || botId}`);

    const mutatedText = stealth.mutateMessage(textContent);
    await stealth.simulateHumanInteraction(sock, targetJid, mutatedText, null);

    // Ghost protocol — send invisible char then immediately delete it
    if (useGhostProtocol) {
        try {
            const ghostMsg = await sock.sendMessage(targetJid, { text: '\u200B\u200E' });
            await new Promise(r => setTimeout(r, 300 + Math.random() * 300));
            await sock.relayMessage(targetJid, {
                protocolMessage: { key: ghostMsg.key, type: 14 }
            }, { additionalNodes: [] });
            await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
        } catch (err) {
            logger.warn(`[GHOST] Silent strike failed in ${targetJid}: ${err.message}`);
        }
    }

    // Build payload
    let payload;
    if (mode === 'status') {
        payload = previewData
            ? { text: mutatedText, contextInfo: { externalAdReply: previewData } }
            : { groupStatusMessage: { text: mutatedText, font: 1, backgroundArgb: 0xFF000000 } };
    } else {
        payload = { text: mutatedText };
        if (previewData) payload.contextInfo = { externalAdReply: previewData };
    }

    await sock.sendMessage(targetJid, payload);
    return { targetJid };

}, {
    connection,
    concurrency: 5,
    limiter: { max: 10, duration: 1000 },
});

broadcastWorker.on('failed', (job, err) => {
    logger.error(`[BULLMQ] Job failed for ${job?.data?.targetJid}: ${err.message}`);
});

broadcastWorker.on('error', err => {
    logger.error('[BULLMQ] Worker error:', err);
});

logger.system('BullMQ Engine connected to Redis Cloud.');

module.exports = { broadcastQueue, broadcastWorker };
