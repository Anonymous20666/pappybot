const { escapeHTML } = require('../core/sanitizer');
const logger = require('../core/logger');

async function getGroupIntelReport(sock) {
    try {
        const groups = await sock.groupFetchAllParticipating();
        let report = "╔══════════════════╗\n     Ω GROUP INTEL\n╚══════════════════╝\n\n";
        let messageChunks = [];

        for (const jid in groups) {
            const group = groups[jid];
            const groupName = escapeHTML(group.subject);
            const memberCount = group.participants.length;
            const admins = group.participants.filter(p => p.admin).length;

            const entry = `📌 <b>${groupName}</b>\n🆔 <code>${jid}</code>\n👥 Members: ${memberCount} | 🛡️ Admins: ${admins}\n\n`;

            if ((report.length + entry.length) > 3800) {
                messageChunks.push(report);
                report = ""; 
            }
            report += entry;
        }
        
        if (report.length > 0) messageChunks.push(report);
        return { chunks: messageChunks, totalGroups: Object.keys(groups).length };
    } catch (e) {
        logger.error("Group Intel Fetch Failed:", e);
        return { chunks: ["⚠️ Failed to fetch group intelligence."], totalGroups: 0 };
    }
}

module.exports = { getGroupIntelReport };
