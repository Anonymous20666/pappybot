// plugins/pappy-invite.js
// 🌸 Cinematic Invite Generator (Multi-Aesthetic Premium Scraper)

const axios = require('axios');
const logger = require('../core/logger');
const { buildLinkPreview } = require('../core/linkPreview'); // 👈 Injecting the Link Preview Engine

// 🎨 5 DYNAMIC AESTHETIC THEMES FOR INVITE CARDS
const inviteAesthetics = [
    (name, size, owner, desc, code) => `*⎔ OMEGA_OS // SECTOR_LOCATED ⎔*\n\n> ──「 *${name}* 」── <\n\n👥 *Population:* ${size}\n👑 *Admin:* ${owner}\n\n*DATA_DUMP:*\n${desc.substring(0, 150)}...\n\n🔗 *Wormhole:* https://chat.whatsapp.com/${code}\n\n*<// ENTER IF YOU DARE>*</_>`,
    (name, size, owner, desc, code) => `⚜️ *V I P  I N V I T A T I O N* ⚜️\n───────────────\n🌟 *Sector:* ${name}\n👥 *Members:* ${size}\n👑 *Founder:* ${owner}\n───────────────\n\n📜 *Manifesto:*\n_> ${desc.substring(0, 150)}..._\n\n🔗 *Portal:* https://chat.whatsapp.com/${code}\n\n_Excellence awaits._`,
    (name, size, owner, desc, code) => `🌃 *N E X U S  G A T E* 🌃\n\n📍 *Zone:* ${name}\n💫 *Souls:* ${size}\n\n*⟪ INFO_DIRECTIVE ⟫*\n${desc.substring(0, 150)}...\n\n🔗 *Link:* https://chat.whatsapp.com/${code}\n\n⚡ _Plug in._`,
    (name, size, owner, desc, code) => `🥷 *G H O S T _ R O U T E* 🥷\n\nTarget: *${name}*\nOperatives: ${size}\n\n[CLASSIFIED INTEL]:\n${desc.substring(0, 150)}...\n\n🔗 *Infiltration Link:* https://chat.whatsapp.com/${code}\n\n_We operate in the shadows._`,
    (name, size, owner, desc, code) => `🌸 *I n v i t e ~ C h a n !* 🌸\n\nWahhh! A new group! (≧◡≦) ♡\n\n🎀 *Name:* ${name}\n🧸 *Friends:* ${size} members\n\n╭・✦ 💌 *About* 💌 ✦・╮\n${desc.substring(0, 150)}...\n╰・┈┈┈┈┈┈┈┈┈┈┈┈┈┈・╯\n\n🔗 *Join here:* https://chat.whatsapp.com/${code}\n\n_See you there!_ 💖`
];

module.exports = {
    category: 'AESTHETIC',
    commands: [{ cmd: '.invitecard', role: 'public' }], 
    
    execute: async (sock, msg, args, userProfile, cmd, abortSignal) => {
        const jid = msg.key.remoteJid;
        
        // Support grabbing the link from arguments OR a replied-to message
        const quotedText = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || 
                           msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text || '';
        const input = args.join(' ') || quotedText;
        
        // Silently delete the user's trigger message to keep the chat clean
        await sock.sendMessage(jid, { delete: msg.key }).catch(() => {});
        
        // Extract just the invite code from the link
        const linkMatch = input.match(/chat\.whatsapp\.com\/([A-Za-z0-9]{20,24})/i);
        if (!linkMatch) return sock.sendMessage(jid, { text: '❌ *Invalid Link!*\nUsage: `.invitecard https://chat.whatsapp.com/...` or reply to a link.' });

        const inviteCode = linkMatch[1];
        const fullLink = `https://chat.whatsapp.com/${inviteCode}`;
        
        try {
            await sock.sendMessage(jid, { text: '🔍 _Scanning group metadata & generating elite preview..._' });

            // 1. Fetch live group info from WhatsApp servers
            const groupInfo = await sock.groupGetInviteInfo(inviteCode).catch(() => null);
            
            // 2. Generate our ultra-premium Link Preview Card via the new engine
            const preview = await buildLinkPreview(fullLink);

            // Set up fallback variables just in case the WhatsApp server fetch fails
            const groupName = groupInfo?.subject || preview?.externalAdReply?.title || 'Unknown Sector';
            const memberCount = groupInfo?.size || 'Unknown';
            const creator = groupInfo?.owner ? `+${groupInfo.owner.split('@')[0]}` : 'Hidden';
            const desc = groupInfo?.desc || preview?.externalAdReply?.body || 'No description provided.';
            
            // 3. Try to grab the group's profile picture directly
            let pfpBuffer = null;
            if (groupInfo) {
                try {
                    const pfpUrl = await sock.profilePictureUrl(groupInfo.id, 'image');
                    if (pfpUrl) {
                        const res = await axios.get(pfpUrl, { responseType: 'arraybuffer' });
                        pfpBuffer = Buffer.from(res.data, 'binary');
                    }
                } catch (e) {} // Silent fail if no PFP
            }

            // 4. Roll the dice for a random aesthetic!
            const randomStyle = inviteAesthetics[Math.floor(Math.random() * inviteAesthetics.length)];
            const aestheticCaption = randomStyle(groupName, memberCount, creator, desc, inviteCode);

            // 5. Build the ad reply — always pin sourceUrl to the real invite link
            //    mediaType 2 = WhatsApp group invite (makes the card tappable/joinable)
            const adReply = {
                title:                groupName,
                body:                 `Group chat invite`,
                mediaType:            2,
                sourceUrl:            fullLink,
                thumbnail:            pfpBuffer || preview?.externalAdReply?.thumbnail || undefined,
                renderLargerThumbnail: true,
                showAdAttribution:    false,
            };

            // 6. Send as text with the tappable invite card
            await sock.sendMessage(jid, {
                text: aestheticCaption,
                contextInfo: {
                    externalAdReply: adReply,
                    isForwarded:     true,
                    forwardingScore: 999,
                }
            });

        } catch (error) {
            logger.error('Invite Card Error:', error);
            return sock.sendMessage(jid, { text: '❌ *Failed to generate card.*\nThe link might be revoked or invalid.' });
        }
    }
};
