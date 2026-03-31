// plugins/pappy-radar.js
const { ownerTelegramId } = require('../config');

module.exports = {
    category: 'INTEL',
    commands: [{ cmd: '.radar', role: 'owner' }],
    init(sock) {
        sock.ev.on('connection.update', async (update) => {
            if (update.connection === 'open') {
                setTimeout(async () => {
                    try {
                        const groups = await sock.groupFetchAllParticipating();
                        const jids = Object.keys(groups);
                        if (jids.length === 0 || !global.tgBot) return;
                        let tgMessage = `📡 <b>OMEGA BOOT: RADAR DUMP</b>\n\nMonitoring <b>${jids.length}</b> sectors:\n\n`;
                        for (const jid of jids) tgMessage += `📁 <b>${groups[jid].subject || "Unknown"}</b>\n🆔 <code>${jid}</code>\n\n`;
                        const chunks = tgMessage.match(/[\s\S]{1,4000}/g) || [];
                        for (const chunk of chunks) await global.tgBot.telegram.sendMessage(ownerTelegramId, chunk, { parse_mode: 'HTML' }).catch(()=>{});
                    } catch (e) {}
                }, 8000);
            }
        });
        sock.ev.on('groups.upsert', async (newGroups) => {
            for (const group of newGroups) {
                if (global.tgBot) global.tgBot.telegram.sendMessage(ownerTelegramId, `🚨 <b>NEW TERRITORY ACQUIRED</b> 🚨\n\n📁 <b>Name:</b> ${group.subject || "Unknown"}\n🆔 <b>JID:</b> <code>${group.id}</code>`, { parse_mode: 'HTML' }).catch(() => {});
            }
        });
    },
    execute: async (sock, msg, args, userProfile, commandName) => {
        const chat = msg.key.remoteJid;
        if (commandName === '.radar') {
            await sock.sendMessage(chat, { text: "📡 *SCANNING SECTORS...*\n_Transmitting data securely to your Telegram._" });
            try {
                const groups = await sock.groupFetchAllParticipating();
                const jids = Object.keys(groups);
                if (global.tgBot) {
                    let radarMsg = `📡 <b>OMEGA RADAR: MANUAL DUMP</b>\n\nMonitoring <b>${jids.length}</b> sectors:\n\n`;
                    for (const jid of jids) radarMsg += `📁 <b>${groups[jid].subject || "Unknown"}</b>\n🆔 <code>${jid}</code>\n\n`;
                    const chunks = radarMsg.match(/[\s\S]{1,4000}/g) || [];
                    for (const chunk of chunks) await global.tgBot.telegram.sendMessage(ownerTelegramId, chunk, { parse_mode: 'HTML' }).catch(()=>{});
                }
            } catch (err) { return sock.sendMessage(chat, { text: "❌ Radar scan failed." }); }
        }
    }
};
