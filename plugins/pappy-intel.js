// plugins/pappy-intel.js
// 🚀 PAPPY ULTIMATE: Aggressive Queued Auto-Joiner (Premium UI Edition)

const fs = require('fs');
const path = require('path');
const { ownerTelegramId } = require('../config');
const logger = require('../core/logger');
const eventBus = require('../core/eventBus');

const dbPath = path.join(__dirname, '../data/intel.json');
if (!fs.existsSync(path.dirname(dbPath))) fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// ⚙️ Aggressive Limits
const LIMITS = {
    MAX_JOINS_PER_DAY: 500,         
    MIN_COOLDOWN_MS: 10 * 1000,     
    MAX_COOLDOWN_MS: 30 * 1000      
};

let intelCache = { 
    knownLinks: [], 
    pendingQueue: [], 
    dailyJoins: 0, 
    lastJoinDate: new Date().toISOString().split('T')[0],
    lastJoinTimestamp: 0
};

if (fs.existsSync(dbPath)) {
    try { intelCache = { ...intelCache, ...JSON.parse(fs.readFileSync(dbPath, 'utf8')) }; } 
    catch (e) { logger.error("Failed to read intel DB, resetting state."); }
}

const saveState = () => fs.writeFileSync(dbPath, JSON.stringify(intelCache, null, 2));

function checkDailyReset() {
    const today = new Date().toISOString().split('T')[0];
    if (intelCache.lastJoinDate !== today) {
        intelCache.lastJoinDate = today;
        intelCache.dailyJoins = 0;
        logger.info("🔄 Daily join limits have been reset.");
        saveState();
    }
}

module.exports = {
    category: 'INTEL',
    commands: [
        { cmd: '.autojoin', role: 'public' },
        { cmd: '.joinqueue', role: 'public' }
    ],
    
    init(sock) {
        // 1. SILENT SCRAPER: Listens to Event Bus
        eventBus.on('message.upsert', async ({ text }) => {
            if (!text || !text.includes('chat.whatsapp.com')) return; 

            const links = text.match(/chat\.whatsapp\.com\/([0-9A-Za-z]{20,24})/ig);
            if (links) {
                let addedToQueue = 0;
                for (let fullLink of links) {
                    const code = fullLink.split('chat.whatsapp.com/')[1];
                    if (!intelCache.knownLinks.includes(code) && !intelCache.pendingQueue.includes(code)) {
                        intelCache.pendingQueue.push(code);
                        addedToQueue++;
                    }
                }
                if (addedToQueue > 0) {
                    saveState();
                    logger.info(`🕵️ [INTEL] Intercepted ${addedToQueue} new group links. Queued.`);
                }
            }
        });

        // 2. THE AGGRESSIVE DAEMON
        setInterval(async () => {
            if (!global.autoJoinEnabled || intelCache.pendingQueue.length === 0) return;
            checkDailyReset();

            const now = Date.now();
            if (intelCache.dailyJoins >= LIMITS.MAX_JOINS_PER_DAY) return; 

            const randomCooldown = Math.floor(Math.random() * (LIMITS.MAX_COOLDOWN_MS - LIMITS.MIN_COOLDOWN_MS + 1)) + LIMITS.MIN_COOLDOWN_MS;
            if (now - intelCache.lastJoinTimestamp < randomCooldown) return; 

            const nextCode = intelCache.pendingQueue.shift(); 
            intelCache.knownLinks.push(nextCode); 
            
            try {
                logger.info(`⏳ [INTEL] Attempting aggressive auto-join: ${nextCode}`);
                await new Promise(res => setTimeout(res, 2000 + Math.random() * 2000)); 
                
                const groupJid = await sock.groupAcceptInvite(nextCode);
                if (groupJid) {
                    intelCache.dailyJoins++;
                    intelCache.lastJoinTimestamp = Date.now();
                    saveState();
                    
                    logger.success(`✅ [INTEL] Joined: ${groupJid}. (${intelCache.dailyJoins}/${LIMITS.MAX_JOINS_PER_DAY})`);
                    if (global.tgBot) global.tgBot.telegram.sendMessage(ownerTelegramId, `🚨 <b>NEW TERRITORY SECURED</b>\n\nCode: <code>${nextCode}</code>\nDaily Limit: ${intelCache.dailyJoins}/${LIMITS.MAX_JOINS_PER_DAY}\nQueue Remaining: ${intelCache.pendingQueue.length}`, { parse_mode: 'HTML' }).catch(()=>{});
                }
            } catch (err) {
                logger.warn(`❌ [INTEL] Failed to join ${nextCode}. Link may be revoked.`);
                intelCache.lastJoinTimestamp = Date.now() - (LIMITS.MAX_COOLDOWN_MS - 5000);
                saveState();
            }
        }, 10000);
    },

    execute: async (sock, msg, args, userProfile, commandName) => {
        const chat = msg.key.remoteJid;

        if (commandName === '.autojoin') {
            const action = args[0]?.toLowerCase();
            if (action === 'on' || action === 'off') {
                global.autoJoinEnabled = (action === 'on');
                return sock.sendMessage(chat, { 
                    text: `📡 *A U T O - J O I N :* ${global.autoJoinEnabled ? 'ENGAGED 🟢' : 'OFFLINE 🔴'}`,
                    contextInfo: {
                        externalAdReply: {
                            title: "Ω INTEL ENGINE",
                            body: global.autoJoinEnabled ? "Scraping & Infiltrating" : "System Paused",
                            mediaType: 1,
                            sourceUrl: "https://t.me/holyPappy"
                        }
                    }
                });
            }
            return sock.sendMessage(chat, { text: `⚙️ Status: ${global.autoJoinEnabled ? 'ENGAGED 🟢' : 'OFFLINE 🛑'}\nUsage: .autojoin [on/off]` });
        }

        if (commandName === '.joinqueue') {
            checkDailyReset();
            
            // Premium Cinematic Radar Stats
            const stats = `*╭━━━・ 📡 𝐈𝐍𝐓𝐄𝐋 𝐑𝐀𝐃𝐀𝐑 ・━━━╮*\n\n` +
                          `⏳ *Pending Targets:* ${intelCache.pendingQueue.length}\n` +
                          `✅ *Infiltrated Today:* ${intelCache.dailyJoins} / ${LIMITS.MAX_JOINS_PER_DAY}\n` +
                          `⚙️ *Engine Status:* ${global.autoJoinEnabled ? 'ENGAGED 🟢' : 'OFFLINE 🔴'}\n\n` +
                          `*╰━━━━━━━━━━━━━━━━━━━━╯*\n\n` +
                          `_Omega Auto-Infiltration System_`;

            return sock.sendMessage(chat, { 
                text: stats,
                contextInfo: {
                    externalAdReply: {
                        title: "Ω RADAR ACTIVE",
                        body: `${intelCache.pendingQueue.length} groups in queue`,
                        mediaType: 1,
                        sourceUrl: "https://t.me/holyPappy"
                    }
                }
            });
        }
    }
};
