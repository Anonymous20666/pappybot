// core/whatsapp.js
// WhatsApp connection manager — one socket per session, auto-reconnect with
// exponential backoff, pairing code delivery, and clean logout handling.

const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    DisconnectReason,
    delay,
    Browsers,
} = require('gifted-baileys');
const pino = require('pino');
const fs   = require('fs');
const path = require('path');

const { ownerTelegramId, globalPrefix } = require('../config');
const logger  = require('./logger');
const engine  = require('./engine');

const SESSIONS_PATH = path.join(__dirname, '../data/sessions');
const STATE_FILE    = path.join(__dirname, '../data/botState.json');

const activeSockets = new Map();
let botState = { isSleeping: false };

// ─── Reconnect backoff state per session ─────────────────────────────────────
const reconnectAttempts = new Map(); // sessionKey → attempt count

if (!fs.existsSync(SESSIONS_PATH)) fs.mkdirSync(SESSIONS_PATH, { recursive: true });
if (!fs.existsSync(path.join(__dirname, '../data'))) fs.mkdirSync(path.join(__dirname, '../data'), { recursive: true });

const loadState = () => {
    if (fs.existsSync(STATE_FILE)) {
        try { botState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); }
        catch { botState = { isSleeping: false }; }
    }
};
const saveState = () => {
    try { fs.writeFileSync(STATE_FILE, JSON.stringify(botState)); }
    catch (err) { logger.error('Failed to save bot state:', err); }
};
loadState();

// ─── Exponential backoff helper ───────────────────────────────────────────────
function getReconnectDelay(sessionKey, statusCode) {
    // Instant reconnect for protocol-level restarts
    if (statusCode === DisconnectReason.restartRequired) {
        reconnectAttempts.delete(sessionKey);
        return 1500;
    }
    const attempt = (reconnectAttempts.get(sessionKey) || 0) + 1;
    reconnectAttempts.set(sessionKey, attempt);
    // Cap at 5 min: 8s, 16s, 32s, 64s, 128s, 300s, 300s...
    return Math.min(8000 * Math.pow(2, attempt - 1), 300000);
}

// ─── Main connection factory ──────────────────────────────────────────────────
async function startWhatsApp(chatId = ownerTelegramId, phoneNumber, slotId = '1', isRestart = false) {
    if (botState.isSleeping && !isRestart) return null;

    const sessionKey = `${chatId}_${phoneNumber}_${slotId}`;

    // Don't open a second socket for the same session unless this is a restart
    if (activeSockets.has(sessionKey) && !isRestart) return activeSockets.get(sessionKey);

    const sessionDir = path.join(SESSIONS_PATH, sessionKey);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    let version;
    try {
        ({ version } = await fetchLatestBaileysVersion());
    } catch {
        version = [2, 3000, 1017531287];
    }

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys:  makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        logger:               pino({ level: 'silent' }),
        printQRInTerminal:    false,
        browser:              Browsers.ubuntu('Chrome'),
        syncFullHistory:      false,
        generateHighQualityLinkPreview: true,  // needed for link preview cards
        markOnlineOnConnect:  false,
        retryRequestDelayMs:  2500,
        getMessage:           async () => undefined,
        patchMessageBeforeSending: (message) => {
            if (message.buttonsMessage || message.templateMessage || message.listMessage) {
                message = {
                    viewOnceMessage: {
                        message: {
                            messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
                            ...message,
                        },
                    },
                };
            }
            return message;
        },
    });

    activeSockets.set(sessionKey, sock);
    sock.ev.on('creds.update', saveCreds);

    // ─── Pairing code request ─────────────────────────────────────────────────
    if (!sock.authState.creds.registered) {
        logger.system(`Initiating pairing for +${phoneNumber}...`);
        let pairingAttempt = 0;

        const requestPairing = async () => {
            try {
                const clean = String(phoneNumber).replace(/\D/g, '');
                await delay(4000);
                const code = await sock.requestPairingCode(clean);
                const formatted = code?.match(/.{1,4}/g)?.join('-') || code;
                logger.system(`PAIRING CODE for +${clean}: ${formatted}`);
                if (global.tgBot) {
                    await global.tgBot.telegram.sendMessage(
                        chatId,
                        `🔗 <b>PAIRING CODE FOR +${clean}</b>\n\n<code>${formatted}</code>\n\n<i>WhatsApp → Linked Devices → Link with phone number instead.</i>`,
                        { parse_mode: 'HTML' }
                    ).catch(() => {});
                }
            } catch (err) {
                logger.error(`Pairing code error (attempt ${pairingAttempt + 1}): ${err.message}`);
                pairingAttempt++;
                if (pairingAttempt < 3) {
                    setTimeout(requestPairing, 6000 * pairingAttempt);
                } else if (global.tgBot) {
                    global.tgBot.telegram.sendMessage(
                        chatId,
                        `❌ <b>PAIRING FAILED</b>\nCheck the number and try /pair again.\n<code>${err.message}</code>`,
                        { parse_mode: 'HTML' }
                    ).catch(() => {});
                }
            }
        };
        setTimeout(requestPairing, 3000);
    }

    // ─── Connection lifecycle ─────────────────────────────────────────────────
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            // QR appeared — means pairing code path failed; notify owner
            logger.warn(`[${sessionKey}] QR code generated (pairing code path failed).`);
        }

        if (connection === 'open') {
            reconnectAttempts.delete(sessionKey); // reset backoff on successful connect
            logger.success(`WhatsApp Online → +${phoneNumber}`);
            engine.triggerBoot(sock);
        }

        if (connection === 'close') {
            activeSockets.delete(sessionKey);

            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const loggedOut  = statusCode === DisconnectReason.loggedOut;

            if (loggedOut) {
                logger.warn(`LOGGED OUT: +${phoneNumber}. Purging session...`);
                try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (_) {}
                reconnectAttempts.delete(sessionKey);
                if (global.tgBot) {
                    global.tgBot.telegram.sendMessage(
                        chatId,
                        `🗑️ <b>SESSION PURGED</b>\n+${phoneNumber} was logged out and deleted.`,
                        { parse_mode: 'HTML' }
                    ).catch(() => {});
                }
                return; // do NOT reconnect after logout
            }

            const reconnectMs = getReconnectDelay(sessionKey, statusCode);
            logger.system(`Connection closed (code ${statusCode}) for +${phoneNumber}. Reconnecting in ${Math.round(reconnectMs / 1000)}s...`);
            setTimeout(() => startWhatsApp(chatId, phoneNumber, slotId, true), reconnectMs);
        }
    });

    // ─── Message handler ──────────────────────────────────────────────────────
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (botState.isSleeping || type !== 'notify') return;

        const msg = messages[0];
        if (!msg?.message) return;

        const jid    = msg.key.remoteJid;
        const isGroup = jid?.endsWith('@g.us') ?? false;
        const botId  = sock.user?.id?.split(':')[0] || phoneNumber;

        // Extract text from all common message types
        const m = msg.message;
        const eph = m.ephemeralMessage?.message;
        const src = eph || m;
        const text =
            src.conversation ||
            src.extendedTextMessage?.text ||
            src.imageMessage?.caption ||
            src.videoMessage?.caption ||
            src.documentMessage?.caption || '';

        if (!text) return;

        let isGroupAdmin = false;
        if (isGroup) {
            try {
                const meta   = await sock.groupMetadata(jid);
                const sender = msg.key.participant || msg.key.remoteJid;
                const part   = meta.participants.find(p => p.id === sender);
                isGroupAdmin = !!(part?.admin);
            } catch (_) {}
        }

        engine.triggerMessage({
            sock, msg, text, isGroup,
            sender: msg.key.participant || msg.key.remoteJid,
            botId, isGroupAdmin,
        });
    });

    return sock;
}

module.exports = { startWhatsApp, activeSockets, loadState, saveState, botState };
