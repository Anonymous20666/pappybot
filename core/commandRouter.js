// core/commandRouter.js
// Loads all plugins, routes incoming messages to the correct handler,
// enforces role checks, and submits work to the task queue.

const fs          = require('fs');
const path        = require('path');
const eventBus    = require('./eventBus');
const taskManager = require('./taskManager');
const rateLimiter = require('../services/rateLimiter');
const userEngine  = require('../modules/userEngine');
const logger      = require('./logger');
const { globalPrefix } = require('../config');

class CommandRouter {
    constructor() {
        this.plugins = new Map(); // cmd string → plugin object
        this.loadPlugins();
        this.initBus();
    }

    loadPlugins() {
        const dir = path.join(__dirname, '../plugins');
        if (!fs.existsSync(dir)) return;

        for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
            try {
                const plugin = require(path.join(dir, file));
                if (plugin.init)      eventBus.on('system.boot', sock => plugin.init(sock));
                if (plugin.commands)  plugin.commands.forEach(cmd => this.plugins.set(cmd.cmd, plugin));
            } catch (err) {
                logger.error(`Failed to load plugin ${file}:`, err);
            }
        }
        logger.success(`CommandRouter loaded ${this.plugins.size} command(s).`);
    }

    initBus() {
        eventBus.on('message.upsert', async ({ sock, msg, text, isGroup, sender, botId, isGroupAdmin }) => {
            if (!text?.startsWith(globalPrefix)) return;

            // Parse command and args
            const parts       = text.trim().split(/ +/);
            const commandName = parts[0].toLowerCase();
            const args        = parts.slice(1);

            const plugin = this.plugins.get(commandName);
            if (!plugin) return;

            // Ensure plugin has an execute function
            if (typeof plugin.execute !== 'function') {
                logger.warn(`Plugin for ${commandName} has no execute() method.`);
                return;
            }

            // Get or create user profile
            const userProfile = userEngine.getOrCreate(sender, msg.pushName, isGroupAdmin);
            if (userProfile.activity.isBanned) return;

            // Refresh role in case admin status changed since last message
            if (isGroupAdmin && userProfile.role === 'public') userProfile.role = 'admin';

            // Role enforcement
            const cmdDef = plugin.commands.find(c => c.cmd === commandName);
            if (cmdDef?.role === 'owner' && userProfile.role !== 'owner') return;
            if (cmdDef?.role === 'admin' && userProfile.role === 'public') return;

            // Rate limiting
            const groupId = isGroup ? msg.key.remoteJid : null;
            if (!rateLimiter.check(sender, groupId)) {
                sock.sendMessage(msg.key.remoteJid, { text: '⏳ Slow down — rate limit active.' }).catch(() => {});
                return;
            }

            userProfile.stats.commandsUsed++;

            const taskId = `CMD_${commandName}_${sender}_${Date.now()}`;
            taskManager.submit(taskId, async (abortSignal) => {
                await plugin.execute(sock, msg, args, userProfile, commandName, abortSignal);
            }, { priority: 5, timeout: 60000 }).catch(err => {
                logger.error(`[ROUTER] Error in ${commandName}:`, err);
                sock.sendMessage(msg.key.remoteJid, { text: `❌ Command error: ${err.message}` }).catch(() => {});
            });
        });
    }
}

module.exports = new CommandRouter();
