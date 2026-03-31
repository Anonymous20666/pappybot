// core/statusManager.js
const logger = require('./logger');

// 🛡️ MEMORY FIX: WeakMap automatically garbage-collects cache when a session is deleted
const sessionGroupCache = new WeakMap();

async function getGroups(sock) {
    const botId = sock.user?.id?.split(':')[0];
    if (!botId) {
        logger.error("Socket user ID not found. Cannot fetch groups.");
        return [];
    }

    const now = Date.now();
    
    // Tie the cache directly to the socket object instance
    let cache = sessionGroupCache.get(sock) || { jids: [], lastFetch: 0 };

    if (now - cache.lastFetch > 600000 || cache.jids.length === 0) {
        try {
            const groups = await sock.groupFetchAllParticipating();
            cache.jids = Object.keys(groups);
            cache.lastFetch = now;
            sessionGroupCache.set(sock, cache);
            logger.info(`[${botId}] Group cache refreshed (${cache.jids.length} groups)`);
        } catch (err) {
            logger.error(`[${botId}] Failed to fetch groups, using stale cache.`, err);
            return cache.jids; 
        }
    }

    return cache.jids;
}

async function postTextStatus(sock, text) {
    try {
        const groupJids = await getGroups(sock);

        if (!groupJids || groupJids.length === 0) {
            logger.warn(`[${sock.user?.id?.split(':')[0]}] No groups found for status broadcast`);
            return false;
        }

        await sock.sendMessage(
            "status@broadcast",
            {
                text: `Ω ELITE BROADCAST\n\n${text}`
            },
            {
                // Ensures only participants of these groups can see the status
                statusJidList: groupJids 
            }
        );

        logger.info(`[${sock.user?.id?.split(':')[0]}] Status successfully posted to ${groupJids.length} targets`);
        return true;

    } catch (e) {
        logger.error("Status broadcast failed:", e);
        return false;
    }
}

module.exports = { postTextStatus };
