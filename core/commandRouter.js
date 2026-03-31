// core/commandRouter.js
const fs = require('fs');
const path = require('path');
const eventBus = require('./eventBus');
const taskManager = require('./taskManager');
const rateLimiter = require('../services/rateLimiter');
const userEngine = require('../modules/userEngine');
const logger = require('./logger');
const { globalPrefix } = require('../config');

class CommandRouter {
    constructor() {
        this.plugins = new Map();
        this.loadPlugins();
        this.initBus();
    }

    loadPlugins() {
        const dir = path.join(__dirname, '../plugins');
        if (!fs.existsSync(dir)) return;
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
        for (const file of files) {
            try {
                const plugin = require(path.join(dir, file));
                if (plugin.init) eventBus.on('system.boot', (sock) => plugin.init(sock));
                if (plugin.commands) {
                    plugin.commands.forEach(cmd => this.plugins.set(cmd.cmd, { ...plugin, file }));
                }
            } catch (err) { logger.error(`Failed to load plugin: ${file}`, err); }
        }
    }

    initBus() {
        eventBus.on('message.upsert', async ({ sock, msg, text, isGroup, sender, botId, isGroupAdmin }) => {
            if (!text || !text.startsWith(globalPrefix)) return;

            const userProfile = userEngine.getOrCreate(sender, msg.pushName, isGroupAdmin);
            if (userProfile.activity.isBanned) return;

            const args = text.slice(globalPrefix.length).trim().split(/ +/);
            const commandName = `.${args.shift().toLowerCase()}`;

            const plugin = this.plugins.get(commandName);
            if (!plugin) return;

            // Role verification
            if (plugin.commands.find(c => c.cmd === commandName).role === 'owner' && userProfile.role !== 'owner') return;

            const groupId = isGroup ? msg.key.remoteJid : null;
            if (!rateLimiter.check(sender, groupId)) {
                return sock.sendMessage(msg.key.remoteJid, { text: '⏳ *Rate limit exceeded. System pacing...*' });
            }

            userProfile.stats.commandsUsed++;

            const taskId = `CMD_${sender}_${Date.now()}`;
            taskManager.submit(taskId, async (abortSignal) => {
                await plugin.execute(sock, msg, args, userProfile, commandName, abortSignal);
            }, { priority: 5, timeout: 60000 }).catch(err => {
                logger.error(`[CRASH PREVENTED] Error in ${commandName}:`, err);
            });
        });
    }
}
module.exports = new CommandRouter();
