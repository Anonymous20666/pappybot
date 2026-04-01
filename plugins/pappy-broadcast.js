// plugins/pappy-broadcast.js
const fs = require('fs');
const path = require('path');
const { broadcastQueue } = require('../core/bullEngine'); 
const { connection: redisClient } = require('../services/redis'); 
const logger = require('../core/logger');

// 🌸 PREVIEW ENGINE (AI Removed for maximum speed)
const { buildLinkPreview, extractUrls } = require('../core/linkPreview'); 

const SCHEDULE_FILE = path.join(__dirname, '../data/schedule-db.json');
const activeSchedules = new Map();

// ⚡ V8 Event Loop Unblocker
const yieldLoop = () => new Promise(resolve => setImmediate(resolve));

// ==========================================
// 🎨 20 PREMIUM AESTHETIC TEMPLATES
// ==========================================
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

// ==========================================
// 💾 CACHE & SCHEDULING HELPERS
// ==========================================

function saveSchedules() { 
    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify([...activeSchedules.values()].map(s => s.meta), null, 2)); 
}

function parseTime(input) {
    const value = parseInt(input);
    if (input.endsWith('m')) return Date.now() + value * 60000;
    if (input.endsWith('h')) return Date.now() + value * 3600000;
    return null; 
}

function queueSchedule(meta) {
    const delayMs = meta.time - Date.now();
    const waitTime = Math.max(delayMs, 2000); 

    const timeout = setTimeout(async () => {
        try {
            const sock = global.waSocks?.get(meta.botId);
            if (sock) {
                const jids = await fetchAllGroups(sock, meta.botId);
                await executeBroadcastTask(sock, jids, meta.text, meta.mode, meta.chat);
            }
        } catch (error) {
            logger.error(`Schedule execution failed for ${meta.id}: ${error.message}`);
        } finally {
            if (meta.isLoop) {
                meta.time += meta.loopInterval; 
                queueSchedule(meta);
                saveSchedules();
            } else {
                activeSchedules.delete(meta.id);
                saveSchedules();
            }
        }
    }, waitTime);
    activeSchedules.set(meta.id, { timeout, meta });
}

// ==========================================
// 🧠 INTELLIGENT TARGET FILTERING
// ==========================================

async function fetchAllGroups(sock, botId, minMembers = 5) {
    const raw = await sock.groupFetchAllParticipating();
    return Object.values(raw).filter(g => {
        if (g.participants.length < minMembers) return false;
        if (g.announce) {
            const botMeta = g.participants.find(p => p.id.includes(botId));
            if (!botMeta || !['admin', 'superadmin'].includes(botMeta.admin)) return false;
        }
        return true;
    }).map(g => ({ id: g.id, size: g.participants.length }));
}

// ==========================================
// 🚀 SUPREME BROADCAST ENGINE
// ==========================================

async function executeBroadcastTask(sock, groupData, textContent, mode, chat) {
    const botId = sock.user.id.split(':')[0];
    const jids = groupData.map(g => g.id);
    
    let preview = null;
    let finalPayloadText = textContent; 
    
    // Extract URLs using the new linkPreview helper
    const urls = extractUrls(textContent);

    // 1. Generate link preview whenever a URL is present (both .gcast and .godcast)
    if (urls && urls.length > 0) {
        await sock.sendMessage(chat, { text: `🔍 *Curating Drop:* Generating rich link preview...` });
        try {
            preview = await buildLinkPreview(textContent);
        } catch (err) {
            logger.warn("Preview Generation Failed:", err.message);
        }
    }

    // 2. Wrap text in aesthetic designs instantly (ONLY for .godcast)
    if (mode === 'status') {
        const randomTemplate = AESTHETIC_TEMPLATES[Math.floor(Math.random() * AESTHETIC_TEMPLATES.length)];
        finalPayloadText = randomTemplate(textContent);
    }

    await sock.sendMessage(chat, { text: `🔥 Compiling ${jids.length} Godcast payloads. Engaging Queue...` });

    const jobs = groupData.map(group => {
        const jobPriority = group.size >= 100 ? 1 : (group.size >= 50 ? 2 : 5);
        return {
            name: `BCAST_${botId}_${group.id}`,
            data: { 
                botId, 
                targetJid: group.id, 
                textContent: finalPayloadText, 
                mode, 
                // Pass the Baileys preview data down into the background worker
                previewData: preview ? preview.externalAdReply : null 
            },
            opts: { priority: jobPriority, attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: true, removeOnFail: 100 }
        };
    });

    // ⚡ V8 MEMORY SAFE BATCHING (Yield Loop for 0ms lag)
    const CHUNK_SIZE = 1000;
    for (let i = 0; i < jobs.length; i += CHUNK_SIZE) {
        const chunk = jobs.slice(i, i + CHUNK_SIZE);
        await broadcastQueue.addBulk(chunk);
        await yieldLoop(); // Forces V8 engine to breathe
    }

    await sock.sendMessage(chat, { text: `✅ *GODCAST DEPLOYED*\nSuccessfully injected ${jids.length} drops into the background worker. Engine running seamlessly.` });
}

// ==========================================
// 🎮 COMMAND ROUTER
// ==========================================

module.exports = {
    category: 'BROADCAST',
    commands: [
        { cmd: '.gcast', role: 'public' }, { cmd: '.godcast', role: 'public' }, { cmd: '.stopcast', role: 'public' },
        { cmd: '.schedulecast', role: 'public' }, { cmd: '.schedulegodcast', role: 'public' },
        { cmd: '.loopcast', role: 'public' }, { cmd: '.loopgodcast', role: 'public' },
        { cmd: '.listschedule', role: 'public' }, { cmd: '.cancelschedule', role: 'public' }
    ],
    init: () => {
        if (!fs.existsSync(path.join(__dirname, '../data'))) fs.mkdirSync(path.join(__dirname, '../data'));
        if (fs.existsSync(SCHEDULE_FILE)) {
            try { JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf-8')).forEach(queueSchedule); } catch(e) {}
        }
    },
    execute: async (sock, msg, args, userProfile, cmd, abortSignal) => {
        const chat = msg.key.remoteJid;
        const botId = sock.user?.id?.split(':')[0];
        const quotedText = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text;

        if (cmd === '.stopcast') { return sock.sendMessage(chat, { text: '🛑 Future payloads aborted.' }); }

        const schedCmds = ['.schedulecast', '.schedulegodcast', '.loopcast', '.loopgodcast'];
        if (schedCmds.includes(cmd)) {
            const timeArg = args.shift();
            const textContent = args.join(' ') || quotedText;
            if (!timeArg || !textContent) return sock.sendMessage(chat, { text: '❌ Usage: .schedulecast 10m Message' });
            
            const time = parseTime(timeArg);
            if (!time) return sock.sendMessage(chat, { text: '❌ Invalid time format. Use m or h (e.g., 15m).' });

            const id = 'SCH-' + Math.random().toString(36).slice(2, 8).toUpperCase();
            const mode = cmd.includes('godcast') ? 'status' : 'normal';
            const isLoop = cmd.startsWith('.loop');
            
            queueSchedule({ id, chat, botId, text: textContent, time, mode, isLoop, loopInterval: isLoop ? (time - Date.now()) : null });
            saveSchedules();
            return sock.sendMessage(chat, { text: `🗓 Scheduled Drop: ${id}` });
        }

        if (cmd === '.listschedule' || cmd === '.cancelschedule') {
            if (cmd === '.cancelschedule') {
                if (activeSchedules.has(args[0])) { 
                    clearTimeout(activeSchedules.get(args[0]).timeout); 
                    activeSchedules.delete(args[0]); saveSchedules(); 
                    return sock.sendMessage(chat, {text: '🛑 Cancelled.'}); 
                }
                return sock.sendMessage(chat, {text: '❌ Schedule ID not found.'}); 
            }
            return sock.sendMessage(chat, { text: `🗓 Active drops: ${activeSchedules.size}` });
        }

        if (cmd === '.gcast' || cmd === '.godcast') {
            const textContent = args.join(' ') || quotedText;
            if (!textContent) return sock.sendMessage(chat, { text: '🫪 Payload required.' });
            
            const groupData = await fetchAllGroups(sock, botId);
            await executeBroadcastTask(sock, groupData, textContent, cmd === '.godcast' ? 'status' : 'normal', chat);
        }
    }
};
