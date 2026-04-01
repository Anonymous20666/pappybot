// plugins/pappy-groupstatus.js
// Group status updater — posts a single WhatsApp story to one or more groups.
// Ported from levanter's gstatus logic, adapted to the pappybot plugin contract.
// No admin check — public access as requested.

const { downloadMediaMessage } = require('gifted-baileys');
const logger = require('../core/logger');

/**
 * Resolve the media payload from a quoted message.
 * Returns a Baileys-compatible sendMessage payload or null if no media.
 */
async function resolveMediaPayload(msg, caption) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted) return null;

    const imageMsg = quoted.imageMessage;
    const videoMsg = quoted.videoMessage;

    if (!imageMsg && !videoMsg) return null;

    try {
        const mediaType = imageMsg ? 'image' : 'video';
        const buffer = await downloadMediaMessage(
            { key: msg.key, message: quoted },
            'buffer',
            {}
        );
        return { [mediaType]: buffer, caption: caption || (imageMsg?.caption ?? videoMsg?.caption ?? '') };
    } catch (err) {
        logger.warn(`[GROUPSTATUS] Media download failed: ${err.message}`);
        return null;
    }
}

/**
 * Post a group status (WhatsApp story) to a single group JID.
 * Supports text, image, and video payloads.
 */
async function postGroupStatus(sock, groupJid, payload) {
    // Image and video go via sendMessage directly to the group JID.
    // Text-only uses groupStatusMessage for the coloured story bubble.
    if (payload.image || payload.video) {
        await sock.sendMessage(groupJid, payload);
    } else {
        await sock.sendMessage(groupJid, {
            groupStatusMessage: {
                text: payload.text || '🔱',
                font: 1,
                backgroundArgb: 0xFF000000
            }
        });
    }
}

module.exports = {
    category: 'STATUS',
    commands: [
        { cmd: '.updategstatus', role: 'public' }
    ],

    execute: async (sock, msg, args, userProfile, commandName) => {
        const chat = msg.key.remoteJid;
        const botId = sock.user?.id?.split(':')[0];

        // Parse args: optional list of group JIDs, then caption text
        // Usage:
        //   .updategstatus                          → current group, no caption
        //   .updategstatus Caption text here        → current group, with caption
        //   .updategstatus 1234@g.us 5678@g.us      → specific groups, no caption
        //   .updategstatus 1234@g.us Caption text   → specific group, with caption
        // Reply to image/video to include media.

        const jidArgs = args.filter(a => a.endsWith('@g.us'));
        const captionArgs = args.filter(a => !a.endsWith('@g.us'));
        const caption = captionArgs.join(' ').trim();

        // Determine target groups
        let targetJids = [];

        if (jidArgs.length > 0) {
            targetJids = jidArgs;
        } else {
            // Default: current group, or all groups if sent from a DM
            if (chat.endsWith('@g.us')) {
                targetJids = [chat];
            } else {
                // Sent from DM — target all groups the bot is in
                try {
                    const all = await sock.groupFetchAllParticipating();
                    targetJids = Object.keys(all);
                } catch (err) {
                    return sock.sendMessage(chat, { text: `❌ Failed to fetch groups: ${err.message}` });
                }
            }
        }

        if (targetJids.length === 0) {
            return sock.sendMessage(chat, {
                text: '❌ No target groups found.\n*Usage:* `.updategstatus [group_jid(s)] [caption]`\nReply to an image or video to include media.'
            });
        }

        // Resolve media from quoted message
        const mediaPayload = await resolveMediaPayload(msg, caption);

        // Check we have something to send
        const hasQuotedText = !!msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation;
        const quotedText = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || '';

        if (!mediaPayload && !caption && !hasQuotedText) {
            return sock.sendMessage(chat, {
                text: '❌ Nothing to post.\n*Usage:* `.updategstatus [group_jid(s)] [caption]`\nReply to an image, video, or text message.'
            });
        }

        const finalPayload = mediaPayload || { text: caption || quotedText };

        await sock.sendMessage(chat, {
            text: `📡 Posting group status to *${targetJids.length}* group(s)...`
        });

        let success = 0;
        let failed = 0;
        const failedJids = [];

        for (const jid of targetJids) {
            try {
                await postGroupStatus(sock, jid, finalPayload);
                success++;
            } catch (err) {
                logger.warn(`[GROUPSTATUS] Failed for ${jid}: ${err.message}`);
                failed++;
                failedJids.push(jid);
            }
        }

        const resultLines = [`✅ *GROUP STATUS UPDATED*`, ``, `Posted: ${success}/${targetJids.length} group(s)`];
        if (failed > 0) resultLines.push(`Failed: ${failed} — ${failedJids.join(', ')}`);

        return sock.sendMessage(chat, { text: resultLines.join('\n') });
    }
};
