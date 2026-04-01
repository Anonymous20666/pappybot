# AGENTS.md — pappybot

Agent guidance for working in this repository.

---

## Project Overview

**pappybot** is a multi-session WhatsApp bot with a Telegram control dashboard.
It manages multiple WhatsApp accounts simultaneously, routing commands through a
plugin system backed by a BullMQ/Redis job queue.

**Runtime:** Node.js (CommonJS)  
**Entry point:** `index.js`  
**Start command:** `node --expose-gc index.js`

---

## Architecture

```
index.js                  Boot sequence, session sweep, watchdog attach
config.js                 Single source of truth for all env vars (via dotenv)
core/
  whatsapp.js             Baileys socket lifecycle, session management
  telegram.js             Telegraf bot — owner control panel, /pair command
  engine.js               Thin event bridge (triggerBoot / triggerMessage)
  commandRouter.js        Plugin loader, command dispatch, role check
  taskManager.js          In-process priority queue (concurrency = 50)
  bullEngine.js           BullMQ queue + worker for background broadcasts
  watchdog.js             Socket health monitor, memory guard
  logger.js               ANSI terminal logger with daily file rotation
  eventBus.js             Node EventEmitter singleton
  stealthEngine.js        Spintax mutation, human-typing simulation
  ai.js / ai.agents.js    OpenRouter multi-model AI with agent personas
  ai.memory.js            Per-user conversation memory
  ai.tools.js             Tool definitions for AI function calling
  sanitizer.js            Input sanitization helpers
  statusManager.js        WhatsApp status/story management
  linkPreview.js          URL extraction and rich preview generation
modules/
  userEngine.js           In-memory user registry (role, stats, ban flag)
  permission.js           Role resolution (owner / admin / public)
  menuEngine.js           Dynamic command menu builder
  groupIntel.js           Group metadata helpers
  analytics.js            Usage analytics
  kawaiiEngine.js         Aesthetic text/emoji helpers
plugins/                  Self-contained command modules (auto-loaded)
  pappy-core.js           .menu, .sys, .bind
  pappy-broadcast.js      .gcast, .godcast, scheduled/loop casts
  pappy-strike.js         .strike, .flashtag, .vanish (owner-only)
  pappy-autopromote.js    Auto-promote group members
  pappy-invite.js         Group invite management
  pappy-nexus.js          Cross-group networking
  pappy-intel.js          Group intelligence gathering
  pappy-osint.js          OSINT lookups
  pappy-radar.js          Activity radar
  pappy-warmup.js         Account warmup sequences
services/
  redis.js                ioredis singleton (shared by BullMQ)
  rateLimiter.js          Per-user / per-group / global flood control
data/                     Runtime data (gitignored) — sessions, logs, JSON DBs
```

---

## Plugin Contract

Every file in `plugins/` must export:

```js
module.exports = {
    category: 'STRING',          // Display category for .menu
    commands: [
        { cmd: '.commandname', role: 'public' | 'admin' | 'owner' }
    ],
    init: (sock) => {},          // Optional — called on system.boot
    execute: async (sock, msg, args, userProfile, commandName, abortSignal) => {}
};
```

- `commandRouter.js` auto-loads all `.js` files from `plugins/` at startup.
- Commands are keyed by `cmd` string (must include the `.` prefix).
- Role enforcement happens in `commandRouter.js` before `execute` is called.
- Long-running work must be submitted to `taskManager.submit()`, not run inline.

---

## Environment Variables

All secrets live in `.env` and are accessed only through `config.js`.
Never read `process.env` directly outside of `config.js`.

| Variable | Purpose |
|---|---|
| `TG_BOT_TOKEN` | Telegraf bot token |
| `OWNER_TG_ID` | Owner's Telegram user ID |
| `OWNER_WA_JID` | Owner's WhatsApp JID (`number@s.whatsapp.net`) |
| `REDIS_HOST` | Redis hostname |
| `REDIS_PORT` | Redis port |
| `REDIS_PASSWORD` | Redis auth password |
| `OPENROUTER_API_KEY` | OpenRouter AI key |

---

## Key Conventions

### Session keys
Format: `{telegramChatId}_{phoneNumber}_{slotId}`  
Example: `8380969639_2348164167112_1`

### Command prefix
Defined in `config.globalPrefix` (default: `.`).  
All command strings in plugin `commands[]` arrays must include the prefix.

### Task submission
```js
taskManager.submit(uniqueId, async (abortSignal) => {
    // work here
}, { priority: 1-10, timeout: 60000 });
```
Higher priority number = processed first.

### Logging
```js
const logger = require('./core/logger');
logger.info('message');
logger.success('message');
logger.warn('message');
logger.error('message', errorObject);
logger.system('message');
```
Do not use `console.log` in production code paths.

### Error handling
- Wrap plugin `execute` bodies in try/catch; errors are caught by `taskManager`.
- Never let a plugin crash the process — the global `uncaughtException` handler
  in `index.js` is a last resort, not a substitute for local error handling.

---

## Data Directory

`data/` is created at runtime and is not committed.

| Path | Contents |
|---|---|
| `data/sessions/{key}/` | Baileys multi-file auth state |
| `data/botState.json` | Sleep/wake state |
| `data/logs/system-YYYY-MM-DD.log` | Daily log files |
| `data/stickerCmds.json` | Sticker→command bindings |
| `data/schedule-db.json` | Persisted broadcast schedules |

---

## Development Notes

- No test suite exists yet. Manual testing via Telegram `/pair` + WhatsApp.
- No linter or formatter is configured.
- `gifted-baileys` is a fork of `@whiskeysockets/baileys` — API is compatible.
- BullMQ workers run in-process (same Node process as the bot).
- `node --expose-gc` is required for the watchdog's manual GC call.
- The devcontainer uses the universal image; consider switching to
  `mcr.microsoft.com/devcontainers/javascript-node:20` for faster startup.
