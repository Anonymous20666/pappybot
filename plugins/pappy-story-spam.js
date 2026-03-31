// plugins/pappy-story-spam.js
const { downloadMediaMessage } = require('gifted-baileys'); 
const delay = (ms) => new Promise(res => setTimeout(res, ms));

async function sendWithRetry(sock, target, payload, abortSignal, retries = 3) {
    for (let i = 0; i < retries; i++) {
        if (abortSignal?.aborted) throw new Error('AbortError');
        try {
            await sock.sendMessage(target, payload);
            return true;
        } catch (e) {
            if (i === retries - 1) return false;
            await delay(1500 * (i + 1)); 
        }
    }
    return false;
}

module.exports = {
    category: 'ELITE',
    commands: [
        { cmd: '.gstatus', role: 'owner' },
        { cmd: '.ggstatus', role: 'owner' }
    ],
    execute: async (sock, msg, args, userProfile, commandName) => {
        const chat = msg.key.remoteJid;
        const botId = sock.user.id.split(':')[0];
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        // Detect Media Type
        const isImage = quotedMsg?.imageMessage;
        const isVideo = quotedMsg?.videoMessage;
        const hasMedia = isImage || isVideo;

        if (commandName === '.gstatus') {
            const amount = parseInt(args[0]);
            const targetJid = args[1];
            const textContent = args.slice(2).join(' ');

            if (isNaN(amount) || !targetJid) {
                return sock.sendMessage(chat, { text: "❌ *SYNTAX:* .gstatus [amount] [group_jid] [text or reply to media]" });
            }
            if (!targetJid.endsWith('@g.us')) return sock.sendMessage(chat, { text: "⚠️ Invalid target. Must be a Group JID." });
            if (amount > 1500) return sock.sendMessage(chat, { text: "⚠️ Limit reached. Max amount is 1500." });

            let finalPayload = { text: textContent || (quotedMsg?.conversation || '🔱') };

            if (hasMedia) {
                await sock.sendMessage(chat, { text: "📥 Downloading media buffer for broadcast..." });
                try {
                    const mediaBuffer = await downloadMediaMessage(
                        msg.message.extendedTextMessage.contextInfo, 
                        'buffer', 
                        {}
                    );
                    finalPayload = isImage 
                        ? { image: mediaBuffer, caption: textContent || quotedMsg.imageMessage.caption || '' }
                        : { video: mediaBuffer, caption: textContent || quotedMsg.videoMessage.caption || '' };
                } catch (err) {
                    return sock.sendMessage(chat, { text: `❌ Media download failed: ${err.message}` });
                }
            } else {
                // Fallback to groupStatusMessage if it's purely text to match legacy behavior
                finalPayload = { groupStatusMessage: { text: finalPayload.text, font: 1, backgroundArgb: 0xFF000000 } };
            }

            await sock.sendMessage(chat, { text: `🚀 *TARGETED SPAM QUEUED*\nTarget: \`${targetJid}\`\nPayload: ${amount} messages\n_Running in background._` });

            // 🚀 DETACHED THREAD
            (async () => {
                let success = 0, fail = 0;
                for (let i = 0; i < amount; i++) {
                    const isDelivered = await sendWithRetry(sock, targetJid, finalPayload, null);
                    if (isDelivered) success++; else fail++;
                    await delay(600 + Math.random() * 400); 
                }
                await sock.sendMessage(chat, { text: `✅ *SPAM COMPLETE*\nBlasted: ${success} | Failed: ${fail}` });
            })();
        }

        if (commandName === '.ggstatus') {
            const amount = parseInt(args[0]);
            const textContent = args.slice(1).join(' ');

            if (isNaN(amount)) {
                return sock.sendMessage(chat, { text: "❌ *SYNTAX:* .ggstatus [amount] [text or reply to media]" });
            }
            if (amount > 500) return sock.sendMessage(chat, { text: "⚠️ Limit reached. Max amount is 500." });

            try {
                const groups = await sock.groupFetchAllParticipating();
                const fullBotJid = botId + '@s.whatsapp.net';
                
                const jids = Object.values(groups).filter(group => {
                    if (!group.id.endsWith('@g.us')) return false;
                    if (group.announce) { 
                        const botParticipant = group.participants.find(p => p.id === fullBotJid);
                        if (!botParticipant || !botParticipant.admin) return false;
                    }
                    return true;
                }).map(g => g.id);
                
                if (jids.length === 0) return sock.sendMessage(chat, { text: "❌ No valid groups found where the bot has permission." });

                let finalPayload = { text: textContent || (quotedMsg?.conversation || '🔱') };

                if (hasMedia) {
                    await sock.sendMessage(chat, { text: "📥 Downloading media buffer for global broadcast..." });
                    try {
                        const mediaBuffer = await downloadMediaMessage(
                            msg.message.extendedTextMessage.contextInfo, 
                            'buffer', 
                            {}
                        );
                        finalPayload = isImage 
                            ? { image: mediaBuffer, caption: textContent || quotedMsg.imageMessage.caption || '' }
                            : { video: mediaBuffer, caption: textContent || quotedMsg.videoMessage.caption || '' };
                    } catch (err) {
                        return sock.sendMessage(chat, { text: `❌ Media download failed: ${err.message}` });
                    }
                } else {
                    finalPayload = { groupStatusMessage: { text: finalPayload.text, font: 1, backgroundArgb: 0xFF000000 } };
                }

                await sock.sendMessage(chat, { text: `🚀 *GLOBAL STORY SPAM QUEUED*\nTargeting ${jids.length} groups with ${amount} stories each.\n_Engine detached to prevent lag._` });

                // 🚀 DETACHED THREAD
                (async () => {
                    let success = 0, fail = 0;
                    for (let i = 0; i < amount; i++) {
                        for (const target of jids) {
                            const isDelivered = await sendWithRetry(sock, target, finalPayload, null);
                            if (isDelivered) success++; else fail++;
                            await delay(500 + Math.random() * 500); 
                        }
                        if (i % 10 === 0) await delay(3000); 
                    }
                    await sock.sendMessage(chat, { text: `✅ *GLOBAL SPAM COMPLETE*\nBlasted: ${success} total stories | Failed: ${fail}` });
                })();
            } catch (err) { 
                return sock.sendMessage(chat, { text: `❌ Error: ${err.message}` });
            }
        }
    }
};
