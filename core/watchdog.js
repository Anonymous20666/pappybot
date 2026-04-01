// core/watchdog.js
// Monitors socket health, pings idle connections, and triggers restarts
// on zombie sockets. Also runs periodic memory and queue diagnostics.

const logger      = require('./logger');
const taskManager = require('./taskManager');

class SmartWatchdog {
    constructor(timeoutMs = 120000) {
        this.timeoutMs = timeoutMs;
        this.monitors  = new Map(); // botId → { lastSeen, pingInterval, checkInterval }

        // System diagnostics every 60 s
        this.healthInterval = setInterval(() => this._runDiagnostics(), 60000);
        this.healthInterval.unref?.(); // don't keep process alive just for this
    }

    attach(botId, sock, restartCallback) {
        // Clean up any existing monitor for this botId
        this.detach(botId);

        const monitor = {
            lastSeen: Date.now(),
            restartCallback,
        };

        // Update lastSeen on every WS frame
        const onMessage = () => { monitor.lastSeen = Date.now(); };
        try { sock.ws.on('message', onMessage); } catch (_) {}
        monitor.onMessage = onMessage;
        monitor.sock      = sock;

        // Check every 30 s
        monitor.interval = setInterval(() => this._check(botId, sock, restartCallback), 30000);
        monitor.interval.unref?.();

        this.monitors.set(botId, monitor);
        logger.info(`[WATCHDOG] Attached to ${botId}`);
    }

    detach(botId) {
        const monitor = this.monitors.get(botId);
        if (!monitor) return;
        clearInterval(monitor.interval);
        try { monitor.sock?.ws?.off?.('message', monitor.onMessage); } catch (_) {}
        this.monitors.delete(botId);
    }

    _check(botId, sock, restartCallback) {
        const monitor = this.monitors.get(botId);
        if (!monitor) return;

        const idle = Date.now() - monitor.lastSeen;

        // Ping at half the timeout threshold
        if (idle > this.timeoutMs / 2) {
            try { sock.ws.ping(); }
            catch (_) { logger.warn(`[WATCHDOG] Ping failed for ${botId}.`); }
        }

        // Trigger restart if fully zombie
        if (idle > this.timeoutMs) {
            logger.error(`[WATCHDOG] Zombie detected: ${botId}. Restarting...`);
            this.detach(botId);
            try { restartCallback(); } catch (err) {
                logger.error(`[WATCHDOG] Restart callback failed for ${botId}:`, err);
            }
        }
    }

    _runDiagnostics() {
        const stats   = taskManager.getStats();
        const memMB   = Math.round(process.memoryUsage().rss / 1024 / 1024);

        // Flush low-priority tasks if queue is severely congested
        if (stats.queued > 100 && stats.running >= taskManager.concurrency) {
            logger.warn('[WATCHDOG] Queue congestion — flushing low-priority tasks...');
            taskManager.queue = taskManager.queue.filter(j => j.priority >= 3);
        }

        // Force GC and reset message cache on critical memory
        if (memMB > 1024) {
            logger.error(`[WATCHDOG] Critical memory: ${memMB}MB. Forcing GC...`);
            if (global.gc) global.gc();
        }
    }
}

module.exports = new SmartWatchdog();
