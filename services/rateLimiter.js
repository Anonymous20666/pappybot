// services/rateLimiter.js
const LIMITS = { user: 2500, group: 1000, globalFlood: 100 }; 
class RateLimiter {
    constructor() {
        this.userCooldowns = new Map();
        this.groupCooldowns = new Map();
        this.lastGlobalMessage = 0;
    }
    check(userId, groupId = null) {
        const now = Date.now();
        if (now - this.lastGlobalMessage < LIMITS.globalFlood) return false;
        this.lastGlobalMessage = now;
        if (this.userCooldowns.has(userId) && now - this.userCooldowns.get(userId) < LIMITS.user) return false;
        if (groupId && this.groupCooldowns.has(groupId) && now - this.groupCooldowns.get(groupId) < LIMITS.group) return false;
        this.userCooldowns.set(userId, now);
        if (groupId) this.groupCooldowns.set(groupId, now);
        return true;
    }
}
module.exports = new RateLimiter();
