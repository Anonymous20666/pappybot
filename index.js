// index.js
// Ω ELITE MULTI-SESSION OPERATOR

const fs   = require('fs');
const path = require('path');
const { startWhatsApp, activeSockets } = require('./core/whatsapp');
const { startTelegram }                = require('./core/telegram');
const logger                           = require('./core/logger');
const { ownerTelegramId }              = require('./config');
const watchdog                         = require('./core/watchdog');

const SESSIONS_PATH = path.join(__dirname, 'data/sessions');
const delay = ms => new Promise(r => setTimeout(r, ms));

// ─── Zero-crash tolerance ─────────────────────────────────────────────────────
process.on('uncaughtException',  err    => logger.error('[CRASH PREVENTED] Uncaught Exception:',  err));
process.on('unhandledRejection', reason => logger.error('[CRASH PREVENTED] Unhandled Rejection:', reason));

// ─── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(signal) {
    logger.warn(`[SHUTDOWN] ${signal} received — draining worker...`);
    try {
        const { broadcastWorker } = require('./core/bullEngine');
        await broadcastWorker.close();
    } catch (_) {}
    process.exit(0);
}
process.once('SIGINT',  () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

// ─── Ghost session sweeper ────────────────────────────────────────────────────
function sweepGhostSessions(sessionsDir) {
    if (!fs.existsSync(sessionsDir)) return;
    let nuked = 0;
    for (const folder of fs.readdirSync(sessionsDir)) {
        const folderPath = path.join(sessionsDir, folder);
        if (!fs.statSync(folderPath).isDirectory()) continue;
        const credsPath = path.join(folderPath, 'creds.json');
        let corrupted = false;
        if (!fs.existsSync(credsPath)) {
            corrupted = true;
        } else {
            try {
                const data = fs.readFileSync(credsPath, 'utf-8');
                if (!data || !data.trim()) corrupted = true;
                else JSON.parse(data);
            } catch { corrupted = true; }
        }
        if (corrupted) {
            try { fs.rmSync(folderPath, { recursive: true, force: true }); nuked++; }
            catch (err) { logger.error(`Failed to sweep ghost session ${folder}:`, err); }
        }
    }
    if (nuked > 0) logger.warn(`Ghost sweeper removed ${nuked} dead session(s).`);
}

// ─── Boot a single session with watchdog attachment ───────────────────────────
async function bootSession(chatId, phoneNumber, slotId, sessionFolder) {
    try {
        const sock = await startWhatsApp(chatId, phoneNumber, slotId, true);
        if (!sock) return;

        global.waSocks.set(sessionFolder, sock);

        const botId = sock.user?.id?.split(':')[0];
        if (botId) {
            watchdog.attach(botId, sock, async () => {
                logger.error(`[WATCHDOG] Restarting frozen session: ${sessionFolder}`);
                try { sock.ws.close(); } catch (_) {}
                activeSockets.delete(sessionFolder);
                global.waSocks.delete(sessionFolder);
                await delay(3000);
                await bootSession(chatId, phoneNumber, slotId, sessionFolder);
            });
        }
    } catch (err) {
        logger.error(`Failed to boot session ${sessionFolder}: ${err.message}`);
        // Retry after 15 s so a transient network error doesn't kill the session permanently
        await delay(15000);
        await bootSession(chatId, phoneNumber, slotId, sessionFolder);
    }
}

// ─── Main boot ────────────────────────────────────────────────────────────────
async function boot() {
    try {
        console.clear();
        logger.info('IGNITING PAPPY ULTIMATE ENGINE...');

        // Start Telegram dashboard first so pairing codes can be delivered
        try {
            const tgBot = await startTelegram();
            global.tgBot = tgBot;
            logger.success('Telegram Command Center Online');
        } catch (err) {
            logger.error(`Telegram dashboard failed to boot: ${err.message}`);
        }

        global.waSocks = activeSockets;

        if (!fs.existsSync(SESSIONS_PATH)) fs.mkdirSync(SESSIONS_PATH, { recursive: true });

        logger.info('Running pre-flight diagnostics...');
        sweepGhostSessions(SESSIONS_PATH);

        const validSessions = fs.readdirSync(SESSIONS_PATH)
            .filter(f => fs.statSync(path.join(SESSIONS_PATH, f)).isDirectory());

        if (validSessions.length === 0) {
            logger.info('No saved sessions found. Use /pair in Telegram to link a number.');
        } else {
            logger.info(`Found ${validSessions.length} session(s). Starting staggered boot...`);
            for (const folder of validSessions) {
                const parts    = folder.split('_');
                const chatId   = parts.length >= 2 ? parts[0] : ownerTelegramId;
                const phone    = parts.length >= 2 ? parts[1] : folder;
                const slotId   = parts[2] || '1';
                await bootSession(chatId, phone, slotId, folder);
                await delay(3500); // stagger to avoid WA rate-limit on startup
            }
        }

        logger.system('SYSTEM FULLY ONLINE AND AWAITING COMMANDS.');
    } catch (err) {
        logger.error(`Critical boot failure: ${err.message}`);
        // Don't exit — let the process stay alive so Telegram can still receive /pair
    }
}

boot();
