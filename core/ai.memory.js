// core/ai.memory.js
const { connection: redis } = require('../services/redis'); // 👈 Uses your secure Cloud Redis

const MEMORY_LIMIT = 5;

async function getMemory(userId) {
    const data = await redis.get(`memory:${userId}`);
    return data ? JSON.parse(data) : [];
}

async function updateMemory(userId, userMsg, aiMsg) {
    let history = await getMemory(userId);

    history.push({ user: userMsg, ai: aiMsg });

    if (history.length > MEMORY_LIMIT) {
        history = history.slice(-MEMORY_LIMIT);
    }

    await redis.set(`memory:${userId}`, JSON.stringify(history), 'EX', 86400); // 24h TTL
}

module.exports = { getMemory, updateMemory };
