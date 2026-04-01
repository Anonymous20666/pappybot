// plugins/pappy-groupstatus.js
// Posts WhatsApp group stories with native link preview (thumbnail + title card),
// configurable background color, font style, text color, and repeat count.
// Uses sock.giftedStatus.sendStatusToGroups() — gifted-baileys' native story engine
// which auto-generates the link preview card shown in the screenshot.

const { downloadMediaMessage, extractUrlFromText } = require('gifted-baileys');
const logger = require('../core/logger');

// ─── Background color palette ─────────────────────────────────────────────────
const BG_COLORS = {
    black:   '#000000',
    white:   '#FFFFFF',
    blue:    '#1A73E8',
    navy:    '#0D1B2A',
    red:     '#E53935',
    pink:    '#E91E8C',
    purple:  '#7B1FA2',
    green:   '#2E7D32',
    teal:    '#00695C',
    orange:  '#E65100',
    yellow:  '#F9A825',
    grey:    '#424242',
    cyan:    '#0097A7',
    lime:    '#558B2F',
    brown:   '#4E342E',
    indigo:  '#283593',
};

// ─── Font IDs (WhatsApp story font 0–8) ──────────────────────────────────────
const FONTS = {
    sans:      0,
    serif:     1,
    mono:      2,
    cursive:   3,
    bold:      4,
    italic:    5,
    condensed: 6,
    rounded:   7,
    elegant:   8,
};

// ─── Persistent per-session config ───────────────────────────────────────────
const gsConfig = {
    backgroundColor: BG_COLORS.black,
    textColor:       '#FFFFFF',
    font:            FONTS.sans,
    repeat:          1,
};

function getGsConfig()      { return gsConfig; }
function setGsConfig(patch) { Object.assign(gsConfig, patch); }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const delay = ms => new Promise(r => setTimeout(r, ms));

async function resolveMedia(msg, caption) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted) return null;
    const imageMsg = quoted.imageMessage;
    const videoMsg = quoted.videoMessage;
    if (!imageMsg && !videoMsg) return null;
    try {
        const type   = imageMsg ? 'image' : 'video';
        const buffer = await downloadMediaMessage({ key: msg.key, message: quoted }, 'buffer', {});
        return { [type]: buffer, caption: caption || imageMsg?.caption || videoMsg?.caption || '' };
    } catch (err) {
        logger.warn(`[GROUPSTATUS] Media download failed: ${err.message}`);
        return null;
    }
}

async function postStory(sock, groupJids, content) {
    return sock.giftedStatus.sendStatusToGroups(content, groupJids);
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

module.exports = {
    category: 'STATUS',
    commands: [
        { cmd: '.updategstatus', role: 'public' },
        { cmd: '.gstatusconfig', role: 'public' },
    ],

    getGsConfig,
    setGsConfig,
    BG_COLORS,
    FONTS,

    execute: async (sock, msg, args, userProfile, commandName) => {
        const chat = msg.key.remoteJid;

        // ── .gstatusconfig ────────────────────────────────────────────────────
        if (commandName === '.gstatusconfig') {
            const sub = args[0]?.toLowerCase();
            const val = args[1]?.toLowerCase();

            if (!sub) {
                const colorName = Object.keys(BG_COLORS).find(k => BG_COLORS[k] === gsConfig.backgroundColor) || gsConfig.backgroundColor;
                const fontName  = Object.keys(FONTS).find(k => FONTS[k] === gsConfig.font) || String(gsConfig.font);
                return sock.sendMessage(chat, {
                    text:
                        `⚙️ *GROUP STATUS CONFIG*\n\n` +
                        `🎨 Background : *${colorName}*\n` +
                        `🖊️ Font        : *${fontName}*\n` +
                        `🔁 Repeat      : *${gsConfig.repeat}×*\n\n` +
                        `*Commands:*\n` +
                        `• \`.gstatusconfig color [name]\`\n` +
                        `• \`.gstatusconfig font [name]\`\n` +
                        `• \`.gstatusconfig repeat [1-50]\`\n\n` +
                        `*Colors:* ${Object.keys(BG_COLORS).join(', ')}\n` +
                        `*Fonts:*  ${Object.keys(FONTS).join(', ')}`
                });
            }

            if (sub === 'color') {
                if (!val || !BG_COLORS[val])
                    return sock.sendMessage(chat, { text: `❌ Unknown color.\nOptions: ${Object.keys(BG_COLORS).join(', ')}` });
                gsConfig.backgroundColor = BG_COLORS[val];
                return sock.sendMessage(chat, { text: `✅ Background → *${val}* (${BG_COLORS[val]})` });
            }

            if (sub === 'font') {
                if (!val || FONTS[val] === undefined)
                    return sock.sendMessage(chat, { text: `❌ Unknown font.\nOptions: ${Object.keys(FONTS).join(', ')}` });
                gsConfig.font = FONTS[val];
                return sock.sendMessage(chat, { text: `✅ Font → *${val}*` });
            }

            if (sub === 'repeat') {
                const n = parseInt(args[1]);
                if (isNaN(n) || n < 1 || n > 50)
                    return sock.sendMessage(chat, { text: '❌ Repeat must be 1–50.' });
                gsConfig.repeat = n;
                return sock.sendMessage(chat, { text: `✅ Repeat → *${n}×* per group` });
            }

            return sock.sendMessage(chat, { text: '❌ Unknown sub-command. Use: color / font / repeat' });
        }

        // ── .updategstatus ────────────────────────────────────────────────────
        const jidArgs     = args.filter(a => a.endsWith('@g.us'));
        const captionArgs = args.filter(a => !a.endsWith('@g.us'));
        const caption     = captionArgs.join(' ').trim();

        let targetJids = [];
        if (jidArgs.length > 0) {
            targetJids = jidArgs;
        } else if (chat.endsWith('@g.us')) {
            targetJids = [chat];
        } else {
            try {
                const all  = await sock.groupFetchAllParticipating();
                targetJids = Object.keys(all);
            } catch (err) {
                return sock.sendMessage(chat, { text: `❌ Failed to fetch groups: ${err.message}` });
            }
        }

        if (targetJids.length === 0)
            return sock.sendMessage(chat, { text: '❌ No target groups found.' });

        const quotedText   = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || '';
        const mediaPayload = await resolveMedia(msg, caption);

        let content;
        if (mediaPayload) {
            content = { ...mediaPayload };
        } else {
            const text = caption || quotedText;
            if (!text)
                return sock.sendMessage(chat, { text: '❌ Nothing to post. Provide text, a link, or reply to media.' });
            content = {
                text,
                backgroundColor: gsConfig.backgroundColor,
                textColor:       gsConfig.textColor,
                font:            gsConfig.font,
            };
        }

        const hasUrl    = !mediaPayload && !!extractUrlFromText(content.text || '');
        const totalSend = targetJids.length * gsConfig.repeat;

        await sock.sendMessage(chat, {
            text:
                `📡 Posting to *${targetJids.length}* group(s)` +
                (hasUrl          ? ' with link preview card' : '') +
                (gsConfig.repeat > 1 ? ` × *${gsConfig.repeat}*` : '') +
                `...`
        });

        let success = 0;
        let failed  = 0;

        for (let round = 0; round < gsConfig.repeat; round++) {
            for (const jid of targetJids) {
                try {
                    await postStory(sock, [jid], content);
                    success++;
                    await delay(800 + Math.random() * 600);
                } catch (err) {
                    logger.warn(`[GROUPSTATUS] Failed ${jid} (round ${round + 1}): ${err.message}`);
                    failed++;
                }
            }
            if (round < gsConfig.repeat - 1) await delay(2000 + Math.random() * 1000);
        }

        return sock.sendMessage(chat, {
            text: `✅ *GROUP STATUS DONE*\n\nPosted: ${success}/${totalSend}\nFailed: ${failed}`
        });
    }
};
