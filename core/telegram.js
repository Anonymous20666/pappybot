// core/telegram.js
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const { tgBotToken, ownerTelegramId } = require('../config');
const { startWhatsApp, activeSockets, botState, saveState } = require('./whatsapp');
const logger = require('./logger');
const taskManager = require('./taskManager'); 

const SESSIONS_PATH = path.join(__dirname, '../data/sessions');

// 🛡️ SAFE AI INJECTION
let ai = null;
try {
    ai = require('./ai');
} catch (e) {
    logger.warn(`AI Module offline or missing. Telegram /ai command disabled.`);
}

// ─── Group Status plugin reference (lazy-loaded so it's always fresh) ─────────
function getGsPlugin() {
    try {
        const p = path.join(__dirname, '../plugins/pappy-groupstatus');
        delete require.cache[require.resolve(p)];
        return require(p);
    } catch (e) {
        return null;
    }
}

function getDynamicPlugins() {
    const pluginsDir = path.join(__dirname, '../plugins');
    if (!fs.existsSync(pluginsDir)) return {};
    const files = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.js'));
    const categories = {};
    for (const file of files) {
        try {
            delete require.cache[require.resolve(path.join(pluginsDir, file))];
            const plugin = require(path.join(pluginsDir, file));
            if (plugin.category && plugin.commands) {
                const cat = plugin.category.toUpperCase();
                if (!categories[cat]) categories[cat] = [];
                plugin.commands.forEach(c => { if (!categories[cat].includes(c.cmd)) categories[cat].push(c.cmd); });
            }
        } catch (err) {}
    }
    return categories;
}

function getMainDashboardMenu() {
    const text = `
◈ ━━━━━━ <b>Ω PAPPY ULTIMATE</b> ━━━━━━ ◈
   <i>Enterprise Growth Engine</i>
◈ ━━━━━━━━━━━━━━━━━━━━━━━━ ◈

🟢 <b>ENGINE STATUS:</b> <code>${botState.isSleeping ? 'SLEEPING (PAUSED)' : 'ONLINE & SECURE'}</code>
🌐 <b>ACTIVE NODES:</b> <code>${activeSockets.size}</code>

<i>Select an option or send a WhatsApp command directly:</i>`;
    
    // 🎛️ FULLY EXPANDED MAIN MENU
    const keyboard = Markup.inlineKeyboard([
        [ Markup.button.callback('🚀 Manage Active Nodes', 'menu_nodes') ],
        [ Markup.button.callback('🧠 Omega AI Assistant', 'cmd_ai_help') ],
        [ Markup.button.callback('➕ Deploy Node', 'help_pair'), Markup.button.callback('📊 Analytics', 'cmd_analytics') ],
        [ Markup.button.callback('📚 Dynamic Command Book', 'cmd_plugins') ],
        [ Markup.button.callback('🗑️ Wipe Redis Queue', 'cmd_wipequeue') ],
        [ Markup.button.callback(botState.isSleeping ? '🟢 Wake Engine' : '🛑 Sleep Engine', botState.isSleeping ? 'cmd_wake' : 'cmd_sleep') ],
        [ Markup.button.callback('🔄 Restart Entire System', 'cmd_restart') ]
    ]);

    return { text, keyboard };
}

async function startTelegram() {
    const bot = new Telegraf(tgBotToken);
    global.tgBot = bot;

    bot.use((ctx, next) => {
        if (ctx.from?.id.toString() !== ownerTelegramId) return;
        return next();
    });

    // ==========================================
    // 🎛️ MAIN MENU ROUTING
    // ==========================================
    bot.command('start', (ctx) => {
        const { text, keyboard } = getMainDashboardMenu();
        ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
    });

    bot.action('menu_main', (ctx) => {
        ctx.answerCbQuery();
        const { text, keyboard } = getMainDashboardMenu();
        ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard }).catch(()=>{});
    });

    // ==========================================
    // 🌐 ACTIVE NODES SUBMENU
    // ==========================================
    bot.action('menu_nodes', (ctx) => {
        ctx.answerCbQuery();
        if (activeSockets.size === 0) {
            return ctx.editMessageText('🔴 <b>NO ACTIVE SESSIONS</b>\nClick "Deploy Node" on the main menu to pair a number.', { 
                parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back to Hub', 'menu_main')]]) 
            }).catch(()=>{});
        }
        
        const buttons = [];
        activeSockets.forEach((sock, key) => {
            const phone = key.split('_')[1] || key;
            const status = sock?.user ? '🟢' : '⏳';
            buttons.push([Markup.button.callback(`${status} Node +${phone}`, `node_${key}`)]);
        });
        buttons.push([Markup.button.callback('🔙 Back to Hub', 'menu_main')]);

        ctx.editMessageText('🌐 <b>SELECT A NODE TO MANAGE:</b>', { 
            parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) 
        }).catch(()=>{});
    });

    // ==========================================
    // ⚙️ ULTIMATE PER-SESSION CONTROL PANEL
    // ==========================================
    bot.action(/^node_(.+)$/, (ctx) => {
        ctx.answerCbQuery();
        const sessionKey = ctx.match[1];
        const phone = sessionKey.split('_')[1] || sessionKey;
        const isOnline = activeSockets.get(sessionKey)?.user ? 'Online 🟢' : 'Connecting/Offline ⏳';
        
        const text = `📱 <b>NODE CONTROL: +${phone}</b>\n\n<b>Status:</b> ${isOnline}\n\n<i>Select a management protocol for this specific number:</i>`;
        
        ctx.editMessageText(text, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [ Markup.button.callback('🔄 Restart Node', `restart_node_${sessionKey}`), Markup.button.callback('🗑️ Purge Node', `purge_node_${sessionKey}`) ],
                [ Markup.button.callback('📡 Broadcast & Godcast', `bcast_node_${sessionKey}`) ],
                [ Markup.button.callback('🎯 Nexus Sniper', `nexus_node_${sessionKey}`) ],
                [ Markup.button.callback('💬 Send DM', `dm_node_${sessionKey}`), Markup.button.callback('🖼️ Upload Status', `status_node_${sessionKey}`) ],
                [ Markup.button.callback('📸 Group Status', `gstatus_node_${sessionKey}`) ],
                [ Markup.button.callback('🔙 Back to Nodes', 'menu_nodes') ]
            ])
        }).catch(()=>{});
    });

    // ─── PER-SESSION SUBMENUS ──────────────────────────────────────────────
    bot.action(/^restart_node_(.+)$/, async (ctx) => {
        ctx.answerCbQuery('Restarting node...');
        const sessionKey = ctx.match[1];
        const parts = sessionKey.split('_');
        const chatId = parts[0];
        const phone = parts[1];
        const slotId = parts[2] || '1';
        
        const sock = activeSockets.get(sessionKey);
        if (sock) {
            try { sock.ws.close(); } catch(e) {}
            activeSockets.delete(sessionKey);
        }
        
        ctx.editMessageText(`🔄 <b>RESTARTING NODE +${phone}...</b>\nAllow up to 10 seconds for the node to reconnect to WhatsApp.`, {
            parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back to Nodes', 'menu_nodes')]])
        }).catch(()=>{});

        setTimeout(() => { startWhatsApp(chatId, phone, slotId, true).catch(err => logger.error("Node restart failed:", err)); }, 3000);
    });

    bot.action(/^purge_node_(.+)$/, (ctx) => {
        ctx.answerCbQuery('Purging Node...');
        const sessionKey = ctx.match[1];
        const phone = sessionKey.split('_')[1] || sessionKey;
        const sock = activeSockets.get(sessionKey);

        if (sock) {
            try { sock.logout(); } catch(e) { sock.ws.close(); }
            activeSockets.delete(sessionKey);
        }

        const sessionDir = path.join(SESSIONS_PATH, sessionKey);
        if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });

        ctx.editMessageText(`🗑️ <b>NODE PURGED</b>\nSession +${phone} has been permanently destroyed and logged out.`, { 
            parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back to Nodes', 'menu_nodes')]]) 
        }).catch(()=>{});
    });

    bot.action(/^bcast_node_(.+)$/, (ctx) => {
        ctx.answerCbQuery();
        const sessionKey = ctx.match[1];
        const phone = sessionKey.split('_')[1] || sessionKey;
        
        const text = `📡 <b>BROADCAST TOOLS (+${phone})</b>\n\nYou can use the Universal Bridge to control this node by typing commands directly in Telegram:\n\n` +
        `• <b>Godcast:</b> <code>.godcast Your Message</code>\n` +
        `• <b>Standard Gcast:</b> <code>.gcast Your Message</code>\n` +
        `• <b>Schedule:</b> <code>.schedulecast 15m Message</code>\n\n` +
        `<i>(Just send the command as a normal message here)</i>`;
        
        ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[ Markup.button.callback('🔙 Back to Node', `node_${sessionKey}`) ]]) }).catch(()=>{});
    });

    bot.action(/^nexus_node_(.+)$/, (ctx) => {
        ctx.answerCbQuery();
        const sessionKey = ctx.match[1];
        const text = `🎯 <b>NEXUS SNIPER PROTOCOL</b>\n\nTo silently infiltrate a group and DM its members, type:\n\n<code>.nexus [group_jid] [Your message]</code>\n\n<i>Tip: Use {group} in your text to magically insert the group's name so it looks human.</i>`;
        ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[ Markup.button.callback('🔙 Back to Node', `node_${sessionKey}`) ]]) }).catch(()=>{});
    });

    bot.action(/^dm_node_(.+)$/, (ctx) => {
        ctx.answerCbQuery();
        const sessionKey = ctx.match[1];
        const text = `💬 <b>DIRECT MESSAGE</b>\n\nTo send a DM via this node, type:\n\n<code>/dm [phone_number] [message]</code>\n\nExample:\n<code>/dm 2348123456789 Hello from Omega!</code>`;
        ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[ Markup.button.callback('🔙 Back to Node', `node_${sessionKey}`) ]]) }).catch(()=>{});
    });

    bot.action(/^status_node_(.+)$/, (ctx) => {
        ctx.answerCbQuery();
        const sessionKey = ctx.match[1];
        const text = `🖼️ <b>UPLOAD STATUS / MEDIA</b>\n\n• <b>Text Status:</b> <code>/status [message]</code>\n• <b>Media Status:</b> Send a Photo/Video to this Telegram bot with the caption <code>/castmedia</code>.`;
        ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[ Markup.button.callback('🔙 Back to Node', `node_${sessionKey}`) ]]) }).catch(()=>{});
    });

    // ==========================================
    // 📸 GROUP STATUS SUBMENU
    // ==========================================

    // Helper: build the Group Status main submenu text + keyboard
    function buildGsMenu(sessionKey) {
        const gs = getGsPlugin();
        const cfg = gs ? gs.getGsConfig() : { backgroundColor: '#000000', font: 0, repeat: 1 };
        const BG_COLORS = gs?.BG_COLORS || {};
        const FONTS     = gs?.FONTS     || {};

        const colorName = Object.keys(BG_COLORS).find(k => BG_COLORS[k] === cfg.backgroundColor) || cfg.backgroundColor;
        const fontName  = Object.keys(FONTS).find(k => FONTS[k] === cfg.font) || String(cfg.font);

        const text =
            `📸 <b>GROUP STATUS ENGINE</b>\n\n` +
            `🎨 Background : <code>${colorName}</code>\n` +
            `🖊️ Font        : <code>${fontName}</code>\n` +
            `🔁 Repeat      : <code>${cfg.repeat}×</code>\n\n` +
            `<i>Post a story to all groups this node is in.\n` +
            `Use /updategstatus [text or link] to post from here.</i>`;

        const keyboard = Markup.inlineKeyboard([
            [ Markup.button.callback('🎨 Change Color',  `gs_color_${sessionKey}`),  Markup.button.callback('🖊️ Change Font', `gs_font_${sessionKey}`) ],
            [ Markup.button.callback('🔁 Set Repeat',    `gs_repeat_${sessionKey}`), Markup.button.callback('🗑️ Reset Config', `gs_reset_${sessionKey}`) ],
            [ Markup.button.callback('📤 Post Now (text/link)', `gs_postnow_${sessionKey}`) ],
            [ Markup.button.callback('🔙 Back to Node',  `node_${sessionKey}`) ],
        ]);

        return { text, keyboard };
    }

    bot.action(/^gstatus_node_(.+)$/, (ctx) => {
        ctx.answerCbQuery();
        const sessionKey = ctx.match[1];
        const { text, keyboard } = buildGsMenu(sessionKey);
        ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard }).catch(()=>{});
    });

    // ── Color picker ──────────────────────────────────────────────────────────
    bot.action(/^gs_color_(.+)$/, (ctx) => {
        ctx.answerCbQuery();
        const sessionKey = ctx.match[1];
        const gs = getGsPlugin();
        if (!gs) return ctx.editMessageText('❌ Group Status plugin not loaded.').catch(()=>{});

        const colorButtons = Object.keys(gs.BG_COLORS).map(name =>
            Markup.button.callback(name, `gs_setcolor_${name}_${sessionKey}`)
        );
        // 2 per row
        const rows = [];
        for (let i = 0; i < colorButtons.length; i += 2) rows.push(colorButtons.slice(i, i + 2));
        rows.push([ Markup.button.callback('🔙 Back', `gstatus_node_${sessionKey}`) ]);

        ctx.editMessageText('🎨 <b>SELECT BACKGROUND COLOR:</b>', {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard(rows)
        }).catch(()=>{});
    });

    bot.action(/^gs_setcolor_([a-z]+)_(.+)$/, (ctx) => {
        ctx.answerCbQuery();
        const colorName  = ctx.match[1];
        const sessionKey = ctx.match[2];
        const gs = getGsPlugin();
        if (!gs || !gs.BG_COLORS[colorName]) return;
        gs.setGsConfig({ backgroundColor: gs.BG_COLORS[colorName] });
        const { text, keyboard } = buildGsMenu(sessionKey);
        ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard }).catch(()=>{});
    });

    // ── Font picker ───────────────────────────────────────────────────────────
    bot.action(/^gs_font_(.+)$/, (ctx) => {
        ctx.answerCbQuery();
        const sessionKey = ctx.match[1];
        const gs = getGsPlugin();
        if (!gs) return ctx.editMessageText('❌ Group Status plugin not loaded.').catch(()=>{});

        const fontButtons = Object.keys(gs.FONTS).map(name =>
            Markup.button.callback(name, `gs_setfont_${name}_${sessionKey}`)
        );
        const rows = [];
        for (let i = 0; i < fontButtons.length; i += 3) rows.push(fontButtons.slice(i, i + 3));
        rows.push([ Markup.button.callback('🔙 Back', `gstatus_node_${sessionKey}`) ]);

        ctx.editMessageText('🖊️ <b>SELECT FONT STYLE:</b>', {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard(rows)
        }).catch(()=>{});
    });

    bot.action(/^gs_setfont_([a-z]+)_(.+)$/, (ctx) => {
        ctx.answerCbQuery();
        const fontName   = ctx.match[1];
        const sessionKey = ctx.match[2];
        const gs = getGsPlugin();
        if (!gs || gs.FONTS[fontName] === undefined) return;
        gs.setGsConfig({ font: gs.FONTS[fontName] });
        const { text, keyboard } = buildGsMenu(sessionKey);
        ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard }).catch(()=>{});
    });

    // ── Repeat picker ─────────────────────────────────────────────────────────
    bot.action(/^gs_repeat_(.+)$/, (ctx) => {
        ctx.answerCbQuery();
        const sessionKey = ctx.match[1];
        const options = [1, 2, 3, 5, 10, 15, 20, 30, 50];
        const rows = [];
        const btns = options.map(n => Markup.button.callback(`${n}×`, `gs_setrepeat_${n}_${sessionKey}`));
        for (let i = 0; i < btns.length; i += 3) rows.push(btns.slice(i, i + 3));
        rows.push([ Markup.button.callback('🔙 Back', `gstatus_node_${sessionKey}`) ]);

        ctx.editMessageText('🔁 <b>SELECT REPEAT COUNT:</b>\n<i>How many times to post per group.</i>', {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard(rows)
        }).catch(()=>{});
    });

    bot.action(/^gs_setrepeat_(\d+)_(.+)$/, (ctx) => {
        ctx.answerCbQuery();
        const n          = parseInt(ctx.match[1]);
        const sessionKey = ctx.match[2];
        const gs = getGsPlugin();
        if (!gs) return;
        gs.setGsConfig({ repeat: n });
        const { text, keyboard } = buildGsMenu(sessionKey);
        ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard }).catch(()=>{});
    });

    // ── Reset config ──────────────────────────────────────────────────────────
    bot.action(/^gs_reset_(.+)$/, (ctx) => {
        ctx.answerCbQuery('Config reset.');
        const sessionKey = ctx.match[1];
        const gs = getGsPlugin();
        if (gs) gs.setGsConfig({ backgroundColor: gs.BG_COLORS.black, font: gs.FONTS.sans, repeat: 1 });
        const { text, keyboard } = buildGsMenu(sessionKey);
        ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard }).catch(()=>{});
    });

    // ── Post Now (prompts user to send text/link via /updategstatus) ──────────
    bot.action(/^gs_postnow_(.+)$/, (ctx) => {
        ctx.answerCbQuery();
        const sessionKey = ctx.match[1];
        ctx.editMessageText(
            `📤 <b>POST GROUP STATUS</b>\n\n` +
            `Send your text or link as:\n<code>/updategstatus Your text or https://link.here</code>\n\n` +
            `To target specific groups, add their JIDs:\n<code>/updategstatus 1234567890-1234567@g.us Your text</code>\n\n` +
            `<i>Current config will be applied automatically.</i>`,
            { parse_mode: 'HTML', ...Markup.inlineKeyboard([[ Markup.button.callback('🔙 Back', `gstatus_node_${sessionKey}`) ]]) }
        ).catch(()=>{});
    });

    // ── /updategstatus Telegram command (bridges to plugin) ──────────────────
    bot.command('updategstatus', async (ctx) => {
        const text = ctx.message.text.replace('/updategstatus', '').trim();
        if (!text) return ctx.reply('❌ Usage: <code>/updategstatus Your text or https://link</code>', { parse_mode: 'HTML' });

        const sock = Array.from(activeSockets.values()).find(s => s?.user);
        if (!sock) return ctx.reply('❌ No active WhatsApp nodes.');

        const gs = getGsPlugin();
        if (!gs) return ctx.reply('❌ Group Status plugin not loaded.');

        ctx.reply('📡 <b>Posting group status...</b>', { parse_mode: 'HTML' });

        const mockMsg = {
            key: { remoteJid: sock.user.id.split(':')[0] + '@s.whatsapp.net', fromMe: true, id: `TG_GS_${Date.now()}` },
            message: { conversation: `.updategstatus ${text}` }
        };
        const mockUser = { role: 'owner', stats: { commandsUsed: 0 }, activity: { isBanned: false } };
        const args = text.split(' ');

        const bridgeSock = new Proxy(sock, {
            get(target, prop) {
                if (prop === 'sendMessage') {
                    return async (jid, payload, ...rest) => {
                        if (payload.text) ctx.reply(`📱 <b>STATUS:</b>\n${payload.text}`, { parse_mode: 'HTML' });
                        else return target.sendMessage(jid, payload, ...rest);
                    };
                }
                return target[prop];
            }
        });

        taskManager.submit(`TG_GS_${Date.now()}`, async (sig) => {
            await gs.execute(bridgeSock, mockMsg, args, mockUser, '.updategstatus', sig);
        }, { priority: 5, timeout: 120000 }).catch(err => ctx.reply(`❌ ${err.message}`));
    });

    // ==========================================
    // 🛠️ MAIN MENU ACTION HANDLERS
    // ==========================================
    bot.action('cmd_ai_help', (ctx) => {
        ctx.answerCbQuery();
        ctx.editMessageText('🧠 <b>OMEGA AI ASSISTANT</b>\n\nThe AI is connected. To use it, simply type:\n\n<code>/ai [Your prompt here]</code>\n\nExample: <code>/ai Write a high-converting promotional message for my crypto group</code>', { 
            parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back to Hub', 'menu_main')]]) 
        }).catch(()=>{});
    });

    bot.action('cmd_wipequeue', async (ctx) => {
        ctx.answerCbQuery('Wiping Redis Database...');
        try {
            const { broadcastQueue } = require('./bullEngine');
            ctx.editMessageText('🗑️ <b>WIPING REDIS DATABASE...</b>\n<i>Please wait...</i>', { parse_mode: 'HTML' }).catch(()=>{});
            await broadcastQueue.pause();
            await broadcastQueue.obliterate({ force: true });
            await broadcastQueue.resume();
            ctx.editMessageText('✅ <b>QUEUE DESTROYED</b>\nAll pending Godcasts and broadcasts have been completely wiped from the Redis Cloud.', { 
                parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back to Hub', 'menu_main')]]) 
            }).catch(()=>{});
        } catch (err) {
            ctx.editMessageText(`❌ <b>ERROR:</b> ${err.message}`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back to Hub', 'menu_main')]]) }).catch(()=>{});
        }
    });

    bot.action('help_pair', (ctx) => {
        ctx.answerCbQuery();
        ctx.editMessageText('➕ <b>HOW TO DEPLOY A NEW NODE:</b>\n\nTo pair a new WhatsApp number, send the following command in this chat:\n\n<code>/pair [phone_number]</code>\n\n<i>Example:</i> <code>/pair 2348123456789</code>', { 
            parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back to Hub', 'menu_main')]]) 
        }).catch(()=>{});
    });

    bot.action('cmd_plugins', (ctx) => {
        ctx.answerCbQuery('Loading Command Book...');
        const categories = getDynamicPlugins();
        let menuText = `📚 <b>PAPPY DYNAMIC PLUGIN MENU</b>\n<i>Send these directly in Telegram to execute!</i>\n\n`;
        for (const [cat, cmds] of Object.entries(categories)) {
            menuText += `◈ <b>[ ${cat} ]</b>\n  └ <code>${cmds.join('</code>, <code>')}</code>\n\n`;
        }
        ctx.editMessageText(menuText, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back to Hub', 'menu_main')]]) }).catch(()=>{});
    });

    bot.action('cmd_analytics', (ctx) => {
        ctx.answerCbQuery('Fetching Telemetry...');
        const sysUsed = Math.round((os.totalmem() - os.freemem()) / 1024 / 1024);
        const botRss = Math.round(process.memoryUsage().rss / 1024 / 1024); 
        const stats = taskManager.getStats();
        
        const dashboard = `📊 <b>ENGINE ANALYTICS</b>\n\n🟢 Nodes Online: ${activeSockets.size}\n⚡ Tasks Running: ${stats.running}\n⏳ Tasks Queued: ${stats.queued}\n🤖 Engine RAM: ${botRss}MB\n💻 Server RAM: ${sysUsed}MB`;
        ctx.editMessageText(dashboard, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back to Hub', 'menu_main')]]) }).catch(()=>{});
    });

    bot.action('cmd_sleep', (ctx) => {
        ctx.answerCbQuery('System Sleeping...');
        botState.isSleeping = true;
        saveState();
        const { text, keyboard } = getMainDashboardMenu();
        ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard }).catch(()=>{});
    });

    bot.action('cmd_wake', (ctx) => {
        ctx.answerCbQuery('System Waking...');
        botState.isSleeping = false;
        saveState();
        const { text, keyboard } = getMainDashboardMenu();
        ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard }).catch(()=>{});
    });

    bot.action('cmd_restart', (ctx) => {
        ctx.answerCbQuery('Restarting System...');
        ctx.editMessageText('🔄 <b>RESTARTING ENGINE...</b>\n\n<i>The control panel will go offline for 5 seconds while the engine reboots.</i>', { parse_mode: 'HTML' }).catch(()=>{});
        setTimeout(() => process.exit(0), 1500);
    });

    // ==========================================
    // 🔗 RESTORED NATIVE TELEGRAM COMMANDS
    // ==========================================
    
    bot.command('ai', async (ctx) => {
        if (!ai) return ctx.reply('❌ The AI module is currently offline.');
        const prompt = ctx.message.text.replace('/ai', '').trim();
        if (!prompt) return ctx.reply('🧠 Ask me anything.\nExample: `/ai Write a savage response`', { parse_mode: 'Markdown' });
        const waitMsg = await ctx.reply('⚙️ <i>Processing via Multi-Agent AI...</i>', { parse_mode: 'HTML' });
  
        try {
            // 🧠 Connects natively to the multi-agent memory system
            const response = await ai.generateText(prompt, ctx.from.id.toString());
            
            // 🛡️ SANITIZER: Prevent Telegram from crashing when the AI uses <3 or <think> tags
            const safeResponse = response.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            
            await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, undefined, `<b>OMEGA AI:</b>\n\n${safeResponse}`, { parse_mode: 'HTML' });
        } catch (e) {
            await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, undefined, `❌ AI Error: ${e.message}`);
        }
    });

    bot.command('pair', async (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length < 2) return ctx.reply(`⚠️ <b>Usage:</b>\n<code>/pair [phone]</code>`, { parse_mode: 'HTML' });
        const phone = args[1].replace(/[^0-9]/g, '');
        ctx.reply(`⚙️ <b>INITIALIZING STEALTH LINK...</b>\n\n📱 <code>+${phone}</code>\n<i>Please wait for your 8-digit pairing code...</i>`, { parse_mode: 'HTML' });
        try { await startWhatsApp(ctx.chat.id.toString(), phone, args[2] || '1'); } 
        catch (err) { ctx.reply(`❌ <b>ERROR:</b>\n<code>${err.message}</code>`, { parse_mode: 'HTML' }); }
    });

    bot.command('status', async (ctx) => {
        const text = ctx.message.text.replace('/status', '').trim();
        if (!text) return ctx.reply('❌ Provide text for the status.');
        if (activeSockets.size === 0) return ctx.reply('❌ No WhatsApp accounts connected.');

        ctx.reply('📱 <b>UPLOADING STATUS...</b>', { parse_mode: 'HTML' });
        let successCount = 0;
        
        for (const [key, sock] of activeSockets.entries()) {
            if (!sock?.user) continue;
            try {
                const groups = await sock.groupFetchAllParticipating();
                await sock.sendMessage("status@broadcast", { text: `Ω ELITE BROADCAST\n\n${text}` }, { statusJidList: Object.keys(groups) });
                successCount++;
            } catch (e) {}
        }
        ctx.reply(`✅ <b>STATUS UPLOADED</b>\nSuccessfully posted on ${successCount} account(s).`, { parse_mode: 'HTML' });
    });

    bot.command('rmsession', async (ctx) => {
        const phone = ctx.message.text.split(' ')[1];
        if (!phone) return ctx.reply('❌ Usage: <code>/rmsession 2348123456789</code>', { parse_mode: 'HTML' });
        let targetKey = null;
        for (const key of activeSockets.keys()) {
            if (key.includes(phone)) targetKey = key;
        }

        if (!targetKey) return ctx.reply(`❌ Could not find an active session for +${phone}.`, { parse_mode: 'HTML' });
        const sock = activeSockets.get(targetKey);
        if (sock) {
            try { sock.logout(); } catch (e) { sock.ws.close(); }
            activeSockets.delete(targetKey);
        }

        const sessionDir = path.join(SESSIONS_PATH, targetKey);
        if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });
        ctx.reply(`🗑️ <b>SESSION DESTROYED</b>\nThe account +${phone} has been completely removed.`, { parse_mode: 'HTML' });
    });

    bot.command('dm', async (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length < 3) return ctx.reply('❌ Usage: /dm 2348123456789 Your Message');
        const targetPhone = args[1].replace(/[^0-9]/g, '');
        const message = args.slice(2).join(' ');
        const targetJid = `${targetPhone}@s.whatsapp.net`;

        const firstSocket = Array.from(activeSockets.values()).find(sock => sock?.user);
        if (!firstSocket) return ctx.reply('❌ No active sockets.');

        try {
            await firstSocket.sendMessage(targetJid, { text: message });
            ctx.reply(`✅ <b>DM SENT to +${targetPhone}</b>`, { parse_mode: 'HTML' });
        } catch (e) {
            ctx.reply(`❌ <b>FAILED:</b> ${e.message}`, { parse_mode: 'HTML' });
        }
    });

    bot.command('castmedia', async (ctx) => {
        if (!ctx.message.photo && !ctx.message.video) return ctx.reply('❌ Send a Photo/Video with /castmedia caption.');
        const firstSocket = Array.from(activeSockets.values()).find(sock => sock?.user);
        if (!firstSocket) return ctx.reply('❌ No connected WhatsApp nodes.');

        ctx.reply('🚀 <b>DOWNLOADING MEDIA & DISPATCHING TO JITTER QUEUE...</b>', { parse_mode: 'HTML' });

        try {
            const fileId = ctx.message.photo ? ctx.message.photo[ctx.message.photo.length - 1].file_id : ctx.message.video.file_id;
            const fileUrl = await ctx.telegram.getFileLink(fileId);
            const response = await axios.get(fileUrl.href, { responseType: 'arraybuffer' });
            const mediaBuffer = Buffer.from(response.data, 'binary');
            const caption = ctx.message.caption ? ctx.message.caption.replace('/castmedia', '').trim() : '';
            const isPhoto = !!ctx.message.photo;

            const botId = firstSocket.user.id.split(':')[0];
            
            taskManager.submit(`TG_MEDIA_${Date.now()}`, async (abortSignal) => {
                const groups = await firstSocket.groupFetchAllParticipating();
                const jids = Object.keys(groups);
                for (let i = 0; i < jids.length; i++) {
                    if (abortSignal.aborted) break;
                    await firstSocket.sendMessage(jids[i], { [isPhoto ? 'image' : 'video']: mediaBuffer, caption: caption }).catch(()=>{});
                    
                    // 🛡️ HUMAN EMULATION: Wait between 2.5 and 4.5 seconds between each media send
                    await new Promise(res => setTimeout(res, 2500 + Math.random() * 2000));
                }
            }, { priority: 2, timeout: 600000 });
            
            ctx.reply(`✅ <b>MEDIA BROADCAST QUEUED</b>`, { parse_mode: 'HTML' });
        } catch (err) {
            ctx.reply(`❌ <b>FAILED:</b> ${err.message}`, { parse_mode: 'HTML' });
        }
    });

    // 🕵️‍♂️ OSINT MASS LINK SCRAPER HOOK
    bot.command('osint', async (ctx) => {
        const text = ctx.message.reply_to_message?.text || ctx.message.text.replace('/osint', '').trim();
        
        if (!text) {
            return ctx.reply('❌ *Syntax:* Reply to a message with `/osint` or paste text after the command.', { parse_mode: 'Markdown' });
        }

        ctx.reply('🕵️‍♂️ <b>ANALYZING TEXT FOR WHATSAPP INTELLIGENCE...</b>', { parse_mode: 'HTML' });

        try {
            const INTEL_DB_PATH = path.join(__dirname, '../data/intel.json');
            let intelCache = { knownLinks: [], pendingQueue: [], dailyJoins: 0, lastJoinDate: '', lastJoinTimestamp: 0 };
            
            if (fs.existsSync(INTEL_DB_PATH)) {
                intelCache = JSON.parse(fs.readFileSync(INTEL_DB_PATH, 'utf8'));
            }

            const regex = /chat\.whatsapp\.com\/([0-9A-Za-z]{20,24})/ig;
            let match;
            let addedCount = 0;
            
            while ((match = regex.exec(text)) !== null) {
                const code = match[1];
                if (!intelCache.knownLinks.includes(code) && !intelCache.pendingQueue.includes(code)) {
                    intelCache.pendingQueue.push(code);
                    addedCount++;
                }
            }

            if (addedCount > 0) {
                fs.writeFileSync(INTEL_DB_PATH, JSON.stringify(intelCache, null, 2));
                ctx.reply(`✅ <b>OSINT SUCCESS</b>\n\nExtracted and queued <b>${addedCount}</b> new WhatsApp links. The WhatsApp Engine has begun infiltration.`, { parse_mode: 'HTML' });
            } else {
                ctx.reply('⚠️ No valid WhatsApp links found in that text.');
            }

        } catch (err) {
            ctx.reply(`❌ <b>ERROR:</b> ${err.message}`, { parse_mode: 'HTML' });
        }
    });

    bot.command('gcast', async (ctx) => {
        const text = ctx.message.text.replace('/gcast', '').trim();
        if (!text) return ctx.reply('❌ Syntax: <code>/gcast Message</code>', { parse_mode: 'HTML' });
        ctx.message.text = `.gcast ${text}`;
        bot.handleUpdate({ message: ctx.message });
    });

    bot.command('godcast', async (ctx) => {
        const text = ctx.message.text.replace('/godcast', '').trim();
        if (!text) return ctx.reply('❌ Syntax: <code>/godcast Message</code>', { parse_mode: 'HTML' });
        ctx.message.text = `.godcast ${text}`;
        bot.handleUpdate({ message: ctx.message });
    });

    bot.command('wipequeue', async (ctx) => {
        try {
            const { broadcastQueue } = require('./bullEngine');
            ctx.reply('🗑️ <b>WIPING REDIS DATABASE...</b>\n<i>Please wait...</i>', { parse_mode: 'HTML' });
            
            await broadcastQueue.pause();
            await broadcastQueue.obliterate({ force: true });
            await broadcastQueue.resume();
            
            ctx.reply('✅ <b>QUEUE DESTROYED</b>\nAll pending Godcasts and broadcasts have been completely wiped from the Redis Cloud.', { parse_mode: 'HTML' });
        } catch (err) {
            ctx.reply(`❌ <b>ERROR:</b> ${err.message}`, { parse_mode: 'HTML' });
        }
    });

    // ==========================================
    // 🌉 UNIVERSAL TELEGRAM-TO-WHATSAPP BRIDGE
    // ==========================================
    bot.on('text', async (ctx, next) => {
        const text = ctx.message.text;
        
        if (!text.startsWith('.')) return next();

        const args = text.trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        const firstActiveSocket = Array.from(activeSockets.values()).find(sock => sock?.user);
        if (!firstActiveSocket) return ctx.reply('❌ <b>No active WhatsApp nodes.</b> Deploy a node first using /pair.', { parse_mode: 'HTML' });

        const pluginsDir = path.join(__dirname, '../plugins');
        let targetPlugin = null;
        
        if (fs.existsSync(pluginsDir)) {
            const files = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.js'));
            for (const file of files) {
                try {
                    const plugin = require(path.join(pluginsDir, file));
                    if (plugin.commands && plugin.commands.find(c => c.cmd === commandName)) { 
                        targetPlugin = plugin;
                        break; 
                    }
                } catch (e) {}
            }
        }

        if (!targetPlugin) return ctx.reply(`❌ Unknown WhatsApp command: <code>${commandName}</code>`, { parse_mode: 'HTML' });

        const botJid = firstActiveSocket.user.id.split(':')[0] + '@s.whatsapp.net';
        const mockMsg = { key: { remoteJid: botJid, fromMe: true, id: `TG_CMD_${Date.now()}` }, message: { conversation: text } };
        const mockUserProfile = { role: 'owner', stats: { commandsUsed: 0 }, activity: { isBanned: false } };

        // 🪞 Proxy socket to redirect WhatsApp text responses back to Telegram
        const bridgeSock = new Proxy(firstActiveSocket, {
            get(target, prop) {
                if (prop === 'sendMessage') {
                    return async (jid, payload, ...rest) => {
                        if (payload.text) return ctx.reply(`📱 <b>NODE FEEDBACK:</b>\n${payload.text}`, { parse_mode: 'HTML' });
                        return target.sendMessage(jid, payload, ...rest);
                    };
                }
                return target[prop];
            }
        });

        taskManager.submit(`TG_EXEC_${Date.now()}`, async (abortSignal) => {
             await targetPlugin.execute(bridgeSock, mockMsg, args, mockUserProfile, commandName, abortSignal);
        }, { priority: 5, timeout: 60000 }).catch(err => ctx.reply(`❌ <b>Plugin Error:</b> ${err.message}`, { parse_mode: 'HTML' }));
    });

    bot.launch().then(() => { logger.system('Premium Telegram Dashboard is ONLINE.'); });
    
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));

    return bot;
}

module.exports = { startTelegram };
