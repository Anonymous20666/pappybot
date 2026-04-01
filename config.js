// config.js
// Single source of truth for all environment variables.
// Fails fast with a clear message if a required variable is missing.

require('dotenv').config();

function requireEnv(key) {
    const val = process.env[key];
    if (!val) throw new Error(`Missing required environment variable: ${key}`);
    return val;
}

const config = {
    tgBotToken:        requireEnv('TG_BOT_TOKEN'),
    ownerTelegramId:   requireEnv('OWNER_TG_ID'),
    ownerWhatsAppJids: [ requireEnv('OWNER_WA_JID') ],
    globalPrefix:      '.',

    system: {
        taskTimeoutMs:       60000,
        maxQueueConcurrency: 50,
        watchdogTimeoutMs:   120000,
    },

    redis: {
        host:     requireEnv('REDIS_HOST'),
        port:     parseInt(requireEnv('REDIS_PORT'), 10),
        password: requireEnv('REDIS_PASSWORD'),
    },

    ai: {
        openRouterKey: requireEnv('OPENROUTER_API_KEY'),
    },
};

module.exports = Object.freeze(config);
