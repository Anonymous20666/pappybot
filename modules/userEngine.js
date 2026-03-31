// modules/userEngine.js
const { ownerWhatsAppJids } = require('../config');
class UserEngine {
    constructor() { this.users = new Map(); }
    getOrCreate(userId, name = 'Unknown', isGroupAdmin = false) {
        if (!this.users.has(userId)) {
            let assignedRole = 'public';
            if (ownerWhatsAppJids && ownerWhatsAppJids.includes(userId)) assignedRole = 'owner';
            else if (isGroupAdmin) assignedRole = 'admin';

            this.users.set(userId, {
                id: userId, name: name, xp: 0, role: assignedRole,
                stats: { messagesSent: 0, commandsUsed: 0 },
                activity: { lastSeen: Date.now(), isBanned: false }
            });
        }
        const user = this.users.get(userId);
        user.activity.lastSeen = Date.now();
        user.stats.messagesSent++;
        return user;
    }
}
module.exports = new UserEngine();
