// core/bullEngine.js
const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');
const stealth = require('./stealthEngine');
const logger = require('./logger');
const { redis } = require('../config');

// 1. Connect to Redis Cloud securely
const connection = new Redis({
    host: redis.host,
    port: redis.port,
    password: redis.password,
    maxRetriesPerRequest: null,
});

// 2. Create the Queue
const broadcastQueue = new Queue('elite-broadcast-queue', { 
    connection,
    defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
    }
});

// 3. Create the Worker
const broadcastWorker = new Worker('elite-broadcast-queue', async (job) => {
    const { botId, targetJid, textContent, mode, previewData, useGhostProtocol } = job.data;
    
    let sock = null;
    if (global.waSocks) {
        for (const [sessionKey, activeSock] of global.waSocks.entries()) {
            if (sessionKey.includes(botId)) { 
                sock = activeSock;
                break;
            }
        }
    }

    if (!sock) throw new Error(`Socket offline for bot: ${botId}`);

    const mutatedText = stealth.mutateMessage(textContent);
    await stealth.simulateHumanInteraction(sock, targetJid, mutatedText, null);

    // 👻 GHOST PROTOCOL EXECUTION (LOW-LEVEL INSTANT DELETE)
    if (useGhostProtocol) {
        try {
            // Send invisible Zero-Width character
            const ghostMsg = await sock.sendMessage(targetJid, { text: '\u200B\u200E' });
            
            // Micro-jitter (300-600ms)
            await new Promise(res => setTimeout(res, 300 + Math.random() * 300));

            // LOW-LEVEL INSTANT DELETE (Bypasses regular queue for immediate effect)
            await sock.relayMessage(targetJid, {
                protocolMessage: {
                    key: ghostMsg.key,
                    type: 14 // 14 is the raw protocol ID for 'Revoke/Delete'
                }
            }, { additionalNodes: [] });

            // Brief pause before the main aesthetic drop
            await new Promise(res => setTimeout(res, 500 + Math.random() * 500));
        } catch (err) {
            logger.warn(`[GHOST] Silent strike failed in ${targetJid}: ${err.message}`);
        }
    }

    // 🚀 MAIN PAYLOAD DEPLOYMENT
    let payload = {};

    if (mode === 'status') {
        if (previewData) {
            payload = { 
                text: mutatedText, 
                contextInfo: { externalAdReply: previewData } 
            };
        } else {
            payload = { groupStatusMessage: { text: mutatedText, font: 1, backgroundArgb: 0xff000000 } };
        }
    } else {
        payload = { text: mutatedText };
        if (previewData) {
            payload.contextInfo = { externalAdReply: previewData };
        }
    }
    
    await sock.sendMessage(targetJid, payload);
    return { targetJid };
    
}, { 
    connection, 
    concurrency: 5, 
    limiter: { max: 10, duration: 1000 } 
});

broadcastWorker.on('failed', (job, err) => {
    logger.error(`❌ [BULLMQ] Job failed for ${job?.data?.targetJid}: ${err.message}`);
});

logger.system('📦 BullMQ Engine Connected to Redis Cloud & Ready.');

module.exports = { broadcastQueue };
