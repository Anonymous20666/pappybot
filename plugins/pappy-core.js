// plugins/pappy-core.js
// System Hub & Ghost Protocols (10x Premium Dynamic Aesthetics)

const fs = require('fs');
const path = require('path');
const { generateMenu } = require('../modules/menuEngine');

const bindDbPath = path.join(__dirname, '../data/stickerCmds.json');

// 🎨 10 PREMIUM AESTHETIC THEMES
const menuAesthetics = [
    // 1. Cyber-Hex (Very clean, technical)
    (cmds, name, role) => `*⎔ OMEGA_OS // V2.0 ⎔*\n\nWelcome back, *${name}*.\nAccess Level: [${role}]\nAll systems optimal. 🟢\n\n> ───「 *CORE MODULES* 」─── <\n\n${cmds}\n\n*<// END TRANSMISSION>*</_>`,
    
    // 2. Elegance (Minimalist, luxury)
    (cmds, name, role) => `⚜️ *O M E G A  E L I T E* ⚜️\n───────────────\nGreetings, *${name}*.\nClearance: ${role}\n\n${cmds}\n───────────────\n_Excellence in execution._`,

    // 3. Neon Tokyo (Edgy, vibrant)
    (cmds, name, role) => `🌃 *N E X U S  C O R E* 🌃\n💫 User: ${name} [${role}]\n\n*⟪ COMMAND DIRECTORY ⟫*\n\n${cmds}\n\n⚡ _Stay wired._`,
    
    // 4. Ghost Protocol (Dark, anonymous)
    (cmds, name, role) => `🥷 *G H O S T _ N E T* 🥷\n\nAgent: *${name}*\nStatus: [CLASSIFIED / ${role}]\n\n${cmds}\n\n_We operate in the shadows._`,

    // 5. Matrix Terminal (Hacker vibe)
    (cmds, name, role) => `🟩 *T E R M I N A L* 🟩\nlogin: ${name}\naccess: GRANTED (${role})\n\n[=== EXECUTE ===]\n\n${cmds}\n\n_Wake up, Neo..._`,

    // 6. Celestial / Cosmic
    (cmds, name, role) => `🌌 *A S T R A L  C O R E* 🌌\n\n✨ Commander: *${name}*\n🚀 Rank: ${role}\n\n✧ ─── *Constellations* ─── ✧\n\n${cmds}\n\n_To the stars._ 🌠`,

    // 7. Kawaii / Anime
    (cmds, name, role) => `🌸 *O M E G A  C h a n* 🌸\n\nHiii *${name}*! (≧◡≦) ♡\nYour role is: ${role} ✨\n\n╭・✦ 🎀 *Commands* 🎀 ✦・╮\n\n${cmds}\n\n╰・┈┈┈┈┈┈┈┈┈┈┈┈┈┈・╯\n_Let's do our best today!_ 💖`,

    // 8. Bloodline / Gothic
    (cmds, name, role) => `🩸 *V A M P I R I C  C O R E* 🩸\n\nLord *${name}*, the night is ours.\nBloodline: ${role}\n\n🦇 ── *Dark Arts* ── 🦇\n\n${cmds}\n\n_Eternity awaits._ 🥀`,

    // 9. Retro Arcade / 8-Bit
    (cmds, name, role) => `👾 *A R C A D E  M O D E* 👾\n\nPLAYER 1: *${name}*\nCLASS: ${role}\nREADY!\n\n🕹️ ── *MOVESET* ── 🕹️\n\n${cmds}\n\n_INSERT COIN TO CONTINUE_ 🪙`,

    // 10. Royal Decree
    (cmds, name, role) => `👑 *T H E  I M P E R I U M* 👑\n\nBy order of *${name}*:\nAuthority: ${role}\n\n📜 ── *Decrees* ── 📜\n\n${cmds}\n\n_Long live the Empire._ ⚔️`
];

module.exports = {
    category: 'SYSTEM',
    commands: [
        { cmd: '.menu', role: 'public' },
        { cmd: '.sys', role: 'public' },
        { cmd: '.bind', role: 'public' }
    ],

    execute: async (sock, msg, args, userProfile, commandName) => {
        const jid = msg.key.remoteJid;

        // 1. DYNAMIC RANDOM AESTHETIC MENU
        if (commandName === '.menu') {
            let rawMenu = generateMenu(userProfile.role);
            
            // 🧹 CLEANER: Strip the hardcoded headers from menuEngine.js so our new themes fit perfectly!
            rawMenu = rawMenu
                .replace(/╔════════════════════╗\n   Ω ELITE MENU\n╚════════════════════╝\n👤 Access Level: \*(.*?)\*\n\n/, '')
                .replace(/> Powered by Elite Engine/g, '')
                .trim();
            
            // Randomly select one of the 10 aesthetic wrappers
            const randomStyle = menuAesthetics[Math.floor(Math.random() * menuAesthetics.length)];
            const menuHtml = randomStyle(rawMenu, userProfile.name || 'Operator', userProfile.role.toUpperCase());
            
            // 💎 PREMIUM TOUCH: Send with a rich "Ad Reply" context card
            return sock.sendMessage(jid, { 
                text: menuHtml,
                contextInfo: {
                    externalAdReply: {
                        title: "Ω OMEGA ELITE ENGINE",
                        body: "Enterprise WhatsApp Solutions",
                        mediaType: 1,
                        renderLargerThumbnail: false,
                        sourceUrl: "https://t.me/holyPappy" 
                    }
                }
            }, { quoted: msg });
        }

        // 2. SYSTEM STATS
        if (commandName === '.sys') {
            const mem = process.memoryUsage();
            const stats = `⚙️ *SYSTEM TELEMETRY*\n\n` +
                          `RAM: ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB / ${(mem.heapTotal / 1024 / 1024).toFixed(2)} MB\n` +
                          `Ping: Responsive\n` +
                          `Operator: https://t.me/holyPappy`;
            return sock.sendMessage(jid, { text: stats });
        }

        // 3. GHOST BINDER (Bind commands to stickers)
        if (commandName === '.bind') {
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const sticker = quotedMsg?.stickerMessage;
            
            if (!sticker) return sock.sendMessage(jid, { text: "꒰ ❌ ꒱ Reply to a sticker to bind." });

            let commandToBind = args.join(' ');
            if (!commandToBind) return sock.sendMessage(jid, { text: "꒰ ❌ ꒱ Usage: .bind .flashtag 50" });

            const stickerId = sticker.fileSha256.toString('base64');
            let db = {};
            
            if (fs.existsSync(bindDbPath)) db = JSON.parse(fs.readFileSync(bindDbPath, 'utf-8'));
            
            db[stickerId] = commandToBind.startsWith('.') ? commandToBind : `.${commandToBind}`;
            fs.writeFileSync(bindDbPath, JSON.stringify(db));

            await sock.sendMessage(jid, { delete: msg.key }).catch(() => {});
            return sock.sendMessage(jid, { text: `⚡ *Ghost Trigger Bound:* \`${db[stickerId]}\`` });
        }
    }
};
