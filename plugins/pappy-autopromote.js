// plugins/pappy-autopromote.js
const fs = require('fs');
const path = require('path');
const { broadcastQueue } = require('../core/bullEngine'); 
const logger = require('../core/logger');
const { buildLinkPreview } = require('../core/linkPreview'); // 🌸 NEW ENGINE

const DB_PATH = path.join(__dirname, '../data/autopromote.json');
let activePromos = new Map();
let activeIntervals = new Map();

// ⚡ V8 Event Loop Unblocker
const yieldLoop = () => new Promise(resolve => setImmediate(resolve));

// 🎨 20 FAST AESTHETIC TEMPLATES
const AESTHETIC_TEMPLATES = [
    (text) => `✦━━━━━━━━━━━━━━✦\n♡ private access ♡\n\n${text}\n\n✦━━━━━━━━━━━━━━✦`,
    (text) => `╭─〔 ✦ invitation ✦ 〕─╮\n\n→ ${text}\n\n╰────────────────╯`,
    (text) => `┏━━━━━━━━━━━━━━┓\n✧ exclusive signal ✧\n\n${text}\n┗━━━━━━━━━━━━━━┛`,
    (text) => `┌───── •✧• ─────┐\n  ethereal drop\n\n${text}\n\n└───── •✧• ─────┘`,
    (text) => `⌠ velvet whisper ⌡\n\n✦ ${text}\n\n⌡ signal secured ⌠`,
    (text) => `╭・✦ 🎀 ✧ 🎀 ✦・╮\n\n${text}\n\n╰・┈┈┈┈┈┈┈┈┈┈・╯`,
    (text) => `*ೃ༄ ✧ \n\n${text}\n\n✧ ೃ༄*`,
    (text) => `»»————-　★　————-««\n\n${text}\n\n»»————-　★　————-««`,
    (text) => `.・゜-: ✧ :-　　\n${text}\n-: ✧ :-゜・．`,
    (text) => `♡━━━━━━━━━━━━━━♡\n\n${text}\n\n♡━━━━━━━━━━━━━━♡`,
    (text) => `*:✧*:✧*:✧*:✧*:✧*:✧\n\n${text}\n\n✧:*✧:*✧:*✧:*✧:*✧:*`,
    (text) => `╭ 　　　　　　　　　　　　　╮\n\n${text}\n\n╰ 　　　　　　　　　　　　　╯`,
    (text) => `┏ ━━┅━━━┅━━ ┓\n\n${text}\n\n┗ ━━┅━━━┅━━ ┛`,
    (text) => `✧･ﾟ: *✧･ﾟ:* \n${text}\n *:･ﾟ✧*:･ﾟ✧`,
    (text) => `⊱ ────── {.⋅ ✯ ⋅.} ────── ⊰\n\n${text}\n\n⊱ ────── {.⋅ ✯ ⋅.} ────── ⊰`,
    (text) => `＊*•̩̩͙✩•̩̩͙*˚　　˚*•̩̩͙✩•̩̩͙*˚＊\n\n${text}\n\n＊*•̩̩͙✩•̩̩͙*˚　　˚*•̩̩͙✩•̩̩͙*˚＊`,
    (text) => `▰▰▰▰▰▰▰▰▰▰▰▰\n\n${text}\n\n▰▰▰▰▰▰▰▰▰▰▰▰`,
    (text) => `【 ＮＥＴＷＯＲＫ　ＤＲＯＰ 】\n\n${text}\n\n【 ＥＮＤ　ＴＲＡＮＳＭＩＳＳＩＯＮ 】`,
    (text) => `▄▀▄▀▄▀▄▀▄▀▄▀▄▀▄\n\n${text}\n\n▄▀▄▀▄▀▄▀▄▀▄▀▄▀▄`,
    (text) => `╔════════════════════╗\n   ✧ *SYSTEM ALERT* ✧\n\n${text}\n╚════════════════════╝`
];

function saveDb() {
    const data = {};
    for (const [key, value] of activePromos.entries()) data[key] = value;
    if (!fs.existsSync(path.dirname(DB_PATH))) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function loadDb() {
    if (fs.existsSync(DB_PATH)) {
        try {
            const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
            for (const [key, value] of Object.entries(data)) activePromos.set(key, value);
        } catch(e) {}
    }
}

// 🛡️ DYNAMIC TIME SHIFTING (ANTI-BAN)
function scheduleNextPromotion(botId, linkUrl) {
    const baseTime = 24 * 60 * 60 * 1000;
    const jitter = Math.floor(Math.random() * (45 * 60 * 1000));
    const isNegative = Math.random() > 0.5;
    const nextRunDelay = isNegative ? baseTime - jitter : baseTime + jitter;

    logger.info(`[AUTO-PROMOTE] Next cycle for ${botId} in ${(nextRunDelay / 3600000).toFixed(2)} hours.`);
    const timeout = setTimeout(async () => {
        await executeDailyPromotion(botId, linkUrl);
        scheduleNextPromotion(botId, linkUrl); 
    }, nextRunDelay);
    activeIntervals.set(botId, timeout);
}

async function executeDailyPromotion(botId, linkUrl) {
    logger.info(`[AUTO-PROMOTE] Executing daily Ghost-Godcast for ${botId}`);
    const sock = global.waSocks?.get(botId);
    if (!sock) return logger.warn(`[AUTO-PROMOTE] Socket offline for ${botId}`);

    try {
        const rawGroups = await sock.groupFetchAllParticipating();
        const jids = Object.values(rawGroups)
            .filter(g => !g.announce || g.participants.some(p => p.id.includes(botId) && ['admin', 'superadmin'].includes(p.admin)))
            .map(g => g.id);
        
        if (jids.length === 0) return;

        // 🧠 Build rich card preview
        const preview = await buildLinkPreview(linkUrl);
        
        // 🎨 Wrap in aesthetic text
        const randomTemplate = AESTHETIC_TEMPLATES[Math.floor(Math.random() * AESTHETIC_TEMPLATES.length)];
        const finalPayloadText = randomTemplate(linkUrl);

        const jobs = jids.map(targetJid => ({
            name: `PROMOTE_${botId}_${targetJid}`,
            data: { 
                botId, targetJid, 
                textContent: finalPayloadText, 
                mode: 'status', 
                previewData: preview ? preview.externalAdReply : null,
                useGhostProtocol: true // 👻 INVISIBLE TEXT DELETION ENGAGED
            },
            opts: { priority: 2, removeOnComplete: true }
        }));

        // ⚡ V8 MEMORY SAFE BATCHING
        const CHUNK_SIZE = 1000;
        for (let i = 0; i < jobs.length; i += CHUNK_SIZE) {
            await broadcastQueue.addBulk(jobs.slice(i, i + CHUNK_SIZE));
            await yieldLoop(); 
        }
        
        logger.success(`[AUTO-PROMOTE] Successfully deployed ${jids.length} ghost promotions to Redis.`);
    } catch (err) {
        logger.error(`[AUTO-PROMOTE] Execution failed: ${err.message}`);
    }
}

module.exports = {
    category: 'BROADCAST',
    commands: [
        { cmd: '.autopromote', role: 'owner' }
    ],
    
    init: () => {
        loadDb();
        for (const [botId, promo] of activePromos.entries()) {
            scheduleNextPromotion(botId, promo.link);
            logger.info(`[AUTO-PROMOTE] Resumed cycle for bot ${botId}`);
        }
    },

    execute: async (sock, msg, args, userProfile, cmd) => {
        const chat = msg.key.remoteJid;
        const botId = sock.user?.id?.split(':')[0];
        const action = args[0]?.toLowerCase();
        
        if (action === 'off') {
            if (activeIntervals.has(botId)) {
                clearTimeout(activeIntervals.get(botId));
                activeIntervals.delete(botId);
                activePromos.delete(botId);
                saveDb();
                return sock.sendMessage(chat, { text: '🛑 *Auto-Promote Deactivated.* The cycle has been stopped.' });
            }
            return sock.sendMessage(chat, { text: 'ℹ️ No active promotion found to stop.' });
        }

        const linkUrl = args.find(a => a.startsWith('http'));
        if (!linkUrl) {
            return sock.sendMessage(chat, { text: '❌ *Usage:* `.autopromote [link]` to start, or `.autopromote off` to stop.' });
        }

        if (activeIntervals.has(botId)) clearTimeout(activeIntervals.get(botId));

        activePromos.set(botId, { link: linkUrl, startedAt: Date.now() });
        saveDb();
        scheduleNextPromotion(botId, linkUrl);

        await sock.sendMessage(chat, { text: `✅ *AUTO-PROMOTE ENGAGED*\n\n🔗 *Link:* ${linkUrl}\n⚙️ *Cycle:* ~24 Hours (Dynamic Jitter Active)\n👻 *Ghost Protocol:* Active\n\n_The engine will now generate a rich preview and broadcast this link immediately, and then repeat dynamically every ~24 hours._` });
        executeDailyPromotion(botId, linkUrl);
    }
};
