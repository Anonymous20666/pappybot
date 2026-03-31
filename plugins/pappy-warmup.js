// plugins/pappy-warmup.js
// 🔥 WARMUP ENGINE: Greeting & Auto-Status Initializer (Now with Media & Zero-Lag!)

const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('gifted-baileys');
const taskManager = require('../core/taskManager');
const stealth = require('../core/stealthEngine');
const logger = require('../core/logger');

const CONFIG_FILE = path.join(__dirname, '../data/warmup-config.json');

function loadConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
        try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')); } 
        catch (e) { return { statusPayload: null, mediaType: null }; }
    }
    return { statusPayload: null, mediaType: null };
}

function saveConfig(data) {
    if (!fs.existsSync(path.dirname(CONFIG_FILE))) fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
}

module.exports = {
    category: 'STEALTH',
    commands: [
        { cmd: '.setnewgcstatus', role: 'owner' },
        { cmd: '.checkgcstatus', role: 'owner' },
        { cmd: '.delgcstatus', role: 'owner' }
    ],

    init(sock) {
        const botId = sock.user?.id?.split(':')[0];
        if (!botId) return;
        const fullBotJid = `${botId}@s.whatsapp.net`;

        // 🎯 TRIGGER 1: When an Admin manually adds the bot, or approves its join request
        sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
            if (action === 'add' && participants.includes(fullBotJid)) {
                triggerWarmup(sock, id, botId);
            }
        });

        // 🎯 TRIGGER 2: When the bot Auto-Joins via an invite link
        sock.ev.on('groups.upsert', async (newGroups) => {
            for (const group of newGroups) {
                triggerWarmup(sock, group.id, botId);
            }
        });
    },

    execute: async (sock, msg, args, userProfile, cmd, abortSignal) => {
        const chat = msg.key.remoteJid;
        const config = loadConfig();

        if (cmd === '.setnewgcstatus') {
            await sock.sendMessage(chat, { text: '⚙️ Processing your new group status...' });

            let textContent = args.join(' ');
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            
            // Check if media is attached directly or if the user replied to media
            let mediaMsg = msg.message?.imageMessage || msg.message?.videoMessage;
            
            if (!mediaMsg && quotedMsg) {
                mediaMsg = quotedMsg.imageMessage || quotedMsg.videoMessage;
                // If they replied to media that already has a caption, use it if no new text was provided
                if (!textContent) {
                    textContent = quotedMsg.imageMessage?.caption || quotedMsg.videoMessage?.caption || quotedMsg.conversation || '';
                }
            } else if (msg.message?.imageMessage?.caption || msg.message?.videoMessage?.caption) {
                // If they attached media directly with the command as the caption
                const rawCaption = msg.message.imageMessage?.caption || msg.message.videoMessage?.caption;
                textContent = rawCaption.replace('.setnewgcstatus', '').trim();
            }

            let mediaType = null;

            // Handle Media Download
            if (mediaMsg) {
                try {
                    mediaType = mediaMsg.mimetype.startsWith('image/') ? 'image' : 'video';
                    const stream = await downloadContentFromMessage(mediaMsg, mediaType);
                    let buffer = Buffer.from([]);
                    
                    for await (const chunk of stream) {
                        buffer = Buffer.concat([buffer, chunk]);
                    }
                    
                    const ext = mediaType === 'image' ? 'jpg' : 'mp4';
                    const mediaPath = path.join(__dirname, `../data/warmup-media.${ext}`);
                    fs.writeFileSync(mediaPath, buffer);
                    
                } catch (err) {
                    return sock.sendMessage(chat, { text: `❌ *Failed to save media:* ${err.message}` });
                }
            }

            if (!textContent && !mediaType) {
                return sock.sendMessage(chat, { text: '❌ *Usage:* Send or reply to an image/video/text with `.setnewgcstatus Your message`' });
            }

            config.statusPayload = textContent;
            config.mediaType = mediaType;
            saveConfig(config);

            const typeMsg = mediaType ? (mediaType === 'image' ? '🖼️ Image' : '🎥 Video') : '📝 Text only';
            return sock.sendMessage(chat, { text: `✅ *New Group Status Set!*\n\n*Type:* ${typeMsg}\n*Caption:* ${textContent || 'None'}\n\nI will post this whenever I join a new group.` });
        }

        if (cmd === '.checkgcstatus') {
            if (!config.statusPayload && !config.mediaType) return sock.sendMessage(chat, { text: 'ℹ️ No auto-status is currently set for new groups.' });
            
            const typeMsg = config.mediaType ? (config.mediaType === 'image' ? '🖼️ Image attached' : '🎥 Video attached') : '📝 Text only';
            return sock.sendMessage(chat, { text: `ℹ️ *Current New Group Status:*\n\n*Media:* ${typeMsg}\n*Text:* "${config.statusPayload || 'None'}"` });
        }

        if (cmd === '.delgcstatus') {
            config.statusPayload = null;
            config.mediaType = null;
            saveConfig(config);
            return sock.sendMessage(chat, { text: '🗑️ *New Group Status Cleared.*\nI will only say hi when joining new groups now.' });
        }
    }
};

/**
 * Executes the stealth warmup sequence (ZERO-LAG DETACHED THREAD)
 */
function triggerWarmup(sock, groupId, botId) {
    // 🚀 DETACHED EXECUTION: Bypasses the task queue entirely to prevent lag
    (async () => {
        try {
            // 1. Prepare standard greeting
            const rareEmojis = "🐦‍🔥|🍄‍🟫|🍋‍🟩|🫨|🩷|🪼|🪽|✨|🫥|🫶|🫪";
            const spintaxGreeting = `{Hi|Hey|Yoo|Hello|Hii} {everyone|guys|y'all|there} {${rareEmojis}}`;
            const mutatedGreeting = stealth.mutateMessage(spintaxGreeting);

            logger.info(`🔥 [WARMUP] Initializing session keys for new sector: ${groupId}`);

            // 🛡️ HUMAN JITTER: Wait between 6 to 18 seconds before saying "hi"
            const jitterDelay = Math.floor(Math.random() * (18000 - 6000 + 1)) + 6000;
            await new Promise(res => setTimeout(res, jitterDelay));

            // Emulate typing and send greeting
            await stealth.simulateHumanInteraction(sock, groupId, mutatedGreeting, null);
            await sock.sendMessage(groupId, { text: mutatedGreeting });
            
            // 2. Post the configured Godcast Status / Media
            const config = loadConfig();
            if (config.statusPayload || config.mediaType) {
                
                // Wait 3 to 6 seconds after saying Hi before dropping the status
                await new Promise(res => setTimeout(res, 3000 + Math.random() * 3000));

                const mutatedStatus = stealth.mutateMessage(config.statusPayload || '');
                
                if (config.mediaType) {
                    const ext = config.mediaType === 'image' ? 'jpg' : 'mp4';
                    const mediaPath = path.join(__dirname, `../data/warmup-media.${ext}`);
                    
                    if (fs.existsSync(mediaPath)) {
                        const mediaBuffer = fs.readFileSync(mediaPath);
                        if (config.mediaType === 'image') {
                            await sock.sendMessage(groupId, { image: mediaBuffer, caption: mutatedStatus });
                        } else {
                            await sock.sendMessage(groupId, { video: mediaBuffer, caption: mutatedStatus });
                        }
                        logger.success(`✅ [WARMUP] Media Auto-Status dropped in ${groupId}.`);
                    } else {
                        await sock.sendMessage(groupId, { text: mutatedStatus });
                    }
                } else {
                    // Send text using the aesthetic Godcast bubble
                    await sock.sendMessage(groupId, { 
                        groupStatusMessage: { text: mutatedStatus, font: 1, backgroundArgb: 0xff000000 } 
                    });
                    logger.success(`✅ [WARMUP] Text Auto-Status dropped in ${groupId}.`);
                }
            }
        } catch (err) {
            logger.error(`❌ [WARMUP ERROR] Sector ${groupId} failed:`, err.message);
        }
    })();
}
