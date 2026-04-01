// services/rateLimiter.js
// Per-user and per-group cooldown enforcement.
// The original global flood gate was a single shared timestamp that blocked
// ALL users whenever ANY message arrived — removed.

const USER_COOLDOWN  = 2500;  // ms between commands from the same user
const GROUP_COOLDOWN = 1000;  // ms between commands from the same group

class RateLimiter {
    constructor() {
        this.userCooldowns  = new Map();
        this.groupCooldowns = new Map();

        // Prune stale entries every 5 minutes to prevent unbounded memory growth
        setInterval(() => this._prune(), 5 * 60 * 1000);
    }

    check(userId, groupId = null) {
        const now = Date.now();

        if (this.userCooldowns.has(userId) &&
            now - this.userCooldowns.get(userId) < USER_COOLDOWN) {
            return false;
        }

        if (groupId &&
            this.groupCooldowns.has(groupId) &&
            now - this.groupCooldowns.get(groupId) < GROUP_COOLDOWN) {
            return false;
        }

        this.userCooldowns.set(userId, now);
        if (groupId) this.groupCooldowns.set(groupId, now);
        return true;
    }

    _prune() {
        const cutoff = Date.now() - Math.max(USER_COOLDOWN, GROUP_COOLDOWN) * 10;
        for (const [k, v] of this.userCooldowns)  if (v < cutoff) this.userCooldowns.delete(k);
        for (const [k, v] of this.groupCooldowns) if (v < cutoff) this.groupCooldowns.delete(k);
    }
}

module.exports = new RateLimiter();
