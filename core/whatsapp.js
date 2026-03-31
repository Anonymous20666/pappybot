// core/whatsapp.js
// Ω ELITE CONNECTION MANAGER & EVENT-DRIVEN PROTOCOL

const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion, 
    makeCacheableSignalKeyStore, 
    DisconnectReason,
    delay,
    Browsers
} = require('gifted-baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const { ownerTelegramId, globalPrefix } = require('../config');
const logger = require('./logger');
const engine = require('./engine'); 

const SESSIONS_PATH = path.join(__dirname, '../data/sessions');
const STATE_FILE = path.join(__dirname, '../data/botState.json');

const activeSockets = new Map();
let botState = { isSleeping: false };
if (!global.messageCache) global.messageCache = new WeakMap();

if (!fs.existsSync(SESSIONS_PATH)) fs.mkdirSync(SESSIONS_PATH, { recursive: true });
if (!fs.existsSync(path.join(__dirname, '../data'))) fs.mkdirSync(path.join(__dirname, '../data'));

const loadState = () => { 
    if (fs.existsSync(STATE_FILE)) {
        try { botState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); } 
        catch (e) { botState = { isSleeping: false }; }
    }
};
const saveState = () => fs.writeFileSync(STATE_FILE, JSON.stringify(botState));
loadState();

async function startWhatsApp(chatId = ownerTelegramId, phoneNumber, slotId = '1', isRestart = false) {
    if (botState.isSleeping && !isRestart) return;
    const sessionKey = `${chatId}_${phoneNumber}_${slotId}`;
    if (activeSockets.has(sessionKey) && !isRestart) return;

    const sessionDir = path.join(SESSIONS_PATH, sessionKey);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    let { version } = await fetchLatestBaileysVersion();
    if (!version) version = [2, 3000, 1017531287];

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
        }, 
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'), 
        
        // 🛑 MILITARY-GRADE MEMORY & STEALTH OPTIMIZATIONS 🛑
        syncFullHistory: false, 
        generateHighQualityLinkPreview: false, 
        markOnlineOnConnect: false, 
        retryRequestDelayMs: 2500,
        getMessage: async (key) => undefined,
        patchMessageBeforeSending: (message) => {
            const requiresPatch = !!(message.buttonsMessage || message.templateMessage || message.listMessage);
            if (requiresPatch) { message = { viewOnceMessage: { message: { messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} }, ...message } } }; }
            return message;
        }
    });

    if (!sock.authState.creds.registered) {
        logger.system(`Initiating pairing sequence for +${phoneNumber}...`);
        let retryCount = 0;
        const requestPairing = async () => {
            try {
                let cleanNumber = String(phoneNumber).replace(/[^0-9]/g, '');
                await delay(4000); 
                
                const code = await sock.requestPairingCode(cleanNumber);
                const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
                
                logger.system(`PAIRING CODE FOR +${cleanNumber}: ${formattedCode}`);
                if (global.tgBot) {
                    await global.tgBot.telegram.sendMessage(
                        chatId, 
                        `🔗 <b>PAIRING CODE FOR +${cleanNumber}</b>\n\n<code>${formattedCode}</code>\n\n<i>Enter this code in your WhatsApp > Linked Devices > Link with phone number instead.</i>`, 
                        { parse_mode: 'HTML' }
                    );
                }
            } catch (err) {
                logger.error(`Pairing code error: ${err.message}`);
                retryCount++;
                if (retryCount < 3) {
                    setTimeout(requestPairing, 5000);
                } else if (global.tgBot) {
                    global.tgBot.telegram.sendMessage(chatId, `❌ <b>PAIRING FAILED</b>\nEnsure the number is correct. \nError: <code>${err.message}</code>`, { parse_mode: 'HTML' });
                }
            }
        };
        setTimeout(requestPairing, 3000);
    }

    activeSockets.set(sessionKey, sock);
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            activeSockets.delete(sessionKey); 
            
            if (shouldReconnect) {
                let reconnectDelay = 8000;
                if (statusCode === DisconnectReason.restartRequired) reconnectDelay = 2000;
                if (statusCode === DisconnectReason.connectionClosed) reconnectDelay = 5000;
                if (statusCode === DisconnectReason.connectionLost) reconnectDelay = 4000;
                
                logger.system(`Connection closed (Code: ${statusCode}). Reconnecting ${sessionKey} in ${reconnectDelay}ms...`);
                setTimeout(() => startWhatsApp(chatId, phoneNumber, slotId, true), reconnectDelay);
            } else {
                logger.system(`🚨 LOGGED OUT of session ${sessionKey}. Engaging Auto-Purge...`);
                const sessionDir = path.join(SESSIONS_PATH, sessionKey);
                if (fs.existsSync(sessionDir)) {
                    try { fs.rmSync(sessionDir, { recursive: true, force: true }); } 
                    catch (err) { logger.error('Failed to auto-purge session:', err); }
                }
                if (global.tgBot) global.tgBot.telegram.sendMessage(chatId, `🗑️ <b>SESSION PURGED</b>\nNode +${phoneNumber} was logged out and has been permanently deleted.`, { parse_mode: 'HTML' }).catch(()=>{});
            }
        }
        
        if (connection === 'open') {
            logger.success(`🟩 WhatsApp Online → ${phoneNumber}`);
            engine.triggerBoot(sock); 
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (botState.isSleeping || type !== 'notify') return;
        
        const msg = messages[0];
        if (!msg?.message) return;

        global.messageCache.set(msg.key, msg);

        const jid = msg.key.remoteJid;
        const isGroup = jid.endsWith('@g.us');
        const botId = sock.user?.id?.split(':')[0] || phoneNumber;
        
        let text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || '';
        if (msg.message.ephemeralMessage) {
            const eph = msg.message.ephemeralMessage.message;
            text = eph?.conversation || eph?.extendedTextMessage?.text || eph?.imageMessage?.caption || eph?.videoMessage?.caption || '';
        }

        let isGroupAdmin = false;
        if (isGroup) {
            try {
                const meta = await sock.groupMetadata(jid);
                const sender = msg.key.participant || msg.key.remoteJid;
                const participant = meta.participants.find(p => p.id === sender);
                isGroupAdmin = participant?.admin?.includes('admin');
            } catch {}
        }

        engine.triggerMessage({
            sock, msg, text, isGroup, 
            sender: msg.key.participant || msg.key.remoteJid, 
            botId, isGroupAdmin
        });
    });

    return sock;
}

module.exports = { startWhatsApp, activeSockets, loadState, saveState, botState };
