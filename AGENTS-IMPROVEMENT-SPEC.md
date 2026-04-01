# AGENTS-IMPROVEMENT-SPEC.md

Concrete improvements to the codebase, ordered by severity.

---

## Audit Summary

### What's good

- **Plugin auto-loader** — `commandRouter.js` discovers and registers plugins
  without manual registration. Adding a new command is one file.
- **Task queue with abort signals** — `taskManager.js` supports priority,
  timeout, retry, and cooperative cancellation via `AbortController`.
- **Watchdog** — detects zombie sockets and high memory, triggers restarts
  automatically.
- **Daily log rotation** — `logger.js` rotates files without an external
  dependency.
- **Ghost session sweep** — corrupted Baileys auth dirs are purged on boot
  before any socket is opened.
- **Staggered boot** — 3.5 s delay between sessions reduces WhatsApp
  rate-limit risk on startup.
- **BullMQ background worker** — broadcast jobs survive process restarts
  (persisted in Redis).

### What's missing

1. No `.gitignore` — `data/`, `node_modules/`, and `.env` are unprotected.
2. No input validation on plugin args — any user can pass arbitrary strings.
3. No test suite — zero automated coverage.
4. No linter/formatter — inconsistent style across files.
5. `permission.js` is unused — `userEngine.js` duplicates role logic.
6. `rateLimiter.js` global flood gate blocks all users when one fires.
7. No graceful shutdown for BullMQ worker — jobs can be lost on SIGINT.
8. `data/` paths are hardcoded in multiple files instead of one constant.
9. Broadcast commands have `role: 'public'` — any user can mass-broadcast.
10. No `.env.example` — new contributors have no template.

### What's wrong

1. **Credentials hardcoded in `config.js`** — Redis password and OpenRouter
   key appear as fallback literals. If `.env` is absent, real secrets are
   exposed in source.
2. **`.env` committed to git** — the file contains live tokens, a Redis
   password, and an API key. These are already in the repository history.
3. **`userEngine` role is never updated** — role is assigned once at first
   seen. If a user becomes a group admin mid-session, their role stays
   `public` until process restart.
4. **`rateLimiter` global gate is broken** — `this.lastGlobalMessage` is a
   single timestamp shared across all users. One message from any user
   blocks all others for 100 ms, making the bot unresponsive under load.
5. **`pappy-broadcast.js` commands are `role: 'public'`** — `.gcast` and
   `.godcast` send to every group the bot is in. Any WhatsApp user can
   trigger a mass broadcast.
6. **`config.js` fallback secrets** — `redis.password` and `ai.openRouterKey`
   have hardcoded production values as `||` fallbacks. Remove them.
7. **`WeakMap` for message cache is ineffective** — `global.messageCache` is
   a `WeakMap` keyed on `msg.key` objects. `msg.key` is a plain object
   created fresh per message; it will never be GC'd while referenced, and
   the cache is never read anywhere in the codebase.
8. **`permission.js` is dead code** — imported nowhere; `userEngine.js`
   reimplements the same logic. One of them should be removed.
9. **Unhandled `fs.readFileSync` in `pappy-core.js` `.bind`** — if
   `stickerCmds.json` is malformed, `JSON.parse` throws and crashes the
   command with no user feedback.
10. **`broadcastWorker` socket lookup is O(n)** — iterates all active sockets
    to find one by `botId` substring match. Use a direct Map key lookup.

---

## Improvement Specs

### SPEC-01 — Add `.gitignore` and remove committed secrets

**Priority: Critical**

**Problem:** `.env` with live credentials is committed. `node_modules/` and
`data/` may also be tracked.

**Changes:**

1. Create `.gitignore`:
   ```
   node_modules/
   data/
   .env
   *.log
   ```
2. Run `git rm --cached .env` and `git rm -r --cached node_modules/ data/`
   if any are tracked.
3. Create `.env.example` with placeholder values (no real secrets).
4. Rotate all credentials that were committed: TG token, Redis password,
   OpenRouter key, WhatsApp JID.

---

### SPEC-02 — Remove hardcoded fallback secrets from `config.js`

**Priority: Critical**

**Problem:** `config.js` uses `|| 'actual-secret'` as fallbacks. If `.env`
is missing, production credentials are used silently.

**Change:** Replace fallback literals with startup validation:

```js
function requireEnv(key) {
    const val = process.env[key];
    if (!val) throw new Error(`Missing required env var: ${key}`);
    return val;
}

const config = {
    tgBotToken: requireEnv('TG_BOT_TOKEN'),
    // ...
    redis: {
        host: requireEnv('REDIS_HOST'),
        port: parseInt(requireEnv('REDIS_PORT'), 10),
        password: requireEnv('REDIS_PASSWORD'),
    },
    ai: {
        openRouterKey: requireEnv('OPENROUTER_API_KEY'),
    }
};
```

This fails fast with a clear message instead of silently using stale secrets.

---

### SPEC-03 — Restrict broadcast commands to `owner` role

**Priority: High**

**Problem:** `.gcast`, `.godcast`, and all schedule/loop variants are
`role: 'public'`. Any WhatsApp user who knows the prefix can trigger a
mass broadcast to every group the bot is in.

**Change:** In `plugins/pappy-broadcast.js`, change every command entry:

```js
commands: [
    { cmd: '.gcast',            role: 'owner' },
    { cmd: '.godcast',          role: 'owner' },
    { cmd: '.stopcast',         role: 'owner' },
    { cmd: '.schedulecast',     role: 'owner' },
    { cmd: '.schedulegodcast',  role: 'owner' },
    { cmd: '.loopcast',         role: 'owner' },
    { cmd: '.loopgodcast',      role: 'owner' },
    { cmd: '.listschedule',     role: 'owner' },
    { cmd: '.cancelschedule',   role: 'owner' },
],
```

---

### SPEC-04 — Fix the global rate limiter flood gate

**Priority: High**

**Problem:** `this.lastGlobalMessage` is a single shared timestamp. One
message from any user resets it, blocking all other users for 100 ms.
Under normal usage this fires constantly, making the bot appear unresponsive.

**Change:** Remove the global gate entirely or make it per-bot-instance, not
per-message. The per-user and per-group cooldowns already provide adequate
protection:

```js
check(userId, groupId = null) {
    const now = Date.now();
    if (this.userCooldowns.has(userId) &&
        now - this.userCooldowns.get(userId) < LIMITS.user) return false;
    if (groupId && this.groupCooldowns.has(groupId) &&
        now - this.groupCooldowns.get(groupId) < LIMITS.group) return false;
    this.userCooldowns.set(userId, now);
    if (groupId) this.groupCooldowns.set(groupId, now);
    return true;
}
```

---

### SPEC-05 — Remove dead code: `permission.js` and `global.messageCache`

**Priority: Medium**

**Problem:**
- `modules/permission.js` exports `getUserRole` but is imported nowhere.
  `userEngine.js` contains the same logic.
- `global.messageCache` is a `WeakMap` set in `whatsapp.js` but never read.

**Changes:**
1. Delete `modules/permission.js`.
2. Remove the `global.messageCache` assignment and `WeakMap` import from
   `whatsapp.js`.
3. If message caching is needed in future, implement it with a proper
   `Map` with TTL eviction.

---

### SPEC-06 — Centralise `data/` path constant

**Priority: Medium**

**Problem:** `path.join(__dirname, '../data/...')` is repeated across
`whatsapp.js`, `telegram.js`, `pappy-broadcast.js`, `pappy-core.js`, and
`logger.js`. A rename or restructure requires touching every file.

**Change:** Add to `config.js`:

```js
const DATA_DIR = path.join(__dirname, 'data');
```

Export it and import in all files that construct data paths. Each file
then does:

```js
const { DATA_DIR } = require('../config');
const SESSIONS_PATH = path.join(DATA_DIR, 'sessions');
```

---

### SPEC-07 — Fix BullMQ worker socket lookup

**Priority: Medium**

**Problem:** `bullEngine.js` worker iterates `global.waSocks` with a
substring match (`sessionKey.includes(botId)`) to find the right socket.
This is O(n) and fragile — a `botId` that is a substring of another key
will match the wrong socket.

**Change:** Store sockets in `global.waSocks` with `botId` as the key
(not the full session key), or pass the full `sessionKey` into the BullMQ
job data and look up directly:

```js
// In job data:
data: { sessionKey, targetJid, textContent, ... }

// In worker:
const sock = global.waSocks?.get(job.data.sessionKey);
if (!sock) throw new Error(`Socket offline: ${job.data.sessionKey}`);
```

---

### SPEC-08 — Graceful BullMQ worker shutdown

**Priority: Medium**

**Problem:** `index.js` handles `SIGINT` by calling `process.exit(0)`
immediately. Any in-flight BullMQ jobs are abandoned without being
re-queued, causing silent message loss.

**Change:**

```js
process.on('SIGINT', async () => {
    logger.warn('Shutting down — draining worker...');
    const { broadcastWorker } = require('./core/bullEngine');
    await broadcastWorker.close();
    process.exit(0);
});
```

---

### SPEC-09 — Fix `userEngine` stale role on group admin change

**Priority: Low**

**Problem:** A user's role is set once when first seen. If they become a
group admin after the bot has already cached them as `public`, they stay
`public` until the process restarts.

**Change:** In `commandRouter.js`, update the cached role on every message
rather than only at creation:

```js
const userProfile = userEngine.getOrCreate(sender, msg.pushName, isGroupAdmin);
// Refresh role in case admin status changed
if (isGroupAdmin && userProfile.role === 'public') {
    userProfile.role = 'admin';
}
```

---

### SPEC-10 — Add `.env.example` and devcontainer `postCreateCommand`

**Priority: Low**

**Problem:** New contributors have no template for required env vars and
must read source to discover them. The devcontainer does not install
dependencies automatically.

**Changes:**

1. Create `.env.example`:
   ```
   TG_BOT_TOKEN=
   OWNER_TG_ID=
   OWNER_WA_JID=number@s.whatsapp.net
   REDIS_HOST=
   REDIS_PORT=
   REDIS_PASSWORD=
   OPENROUTER_API_KEY=
   ```

2. Add to `.devcontainer/devcontainer.json`:
   ```json
   "postCreateCommand": "npm install"
   ```

---

## Implementation Order

| # | Spec | Effort | Impact |
|---|---|---|---|
| 1 | SPEC-01 Gitignore + rotate secrets | 1 h | Critical |
| 2 | SPEC-02 Remove hardcoded fallbacks | 30 min | Critical |
| 3 | SPEC-03 Restrict broadcast to owner | 5 min | High |
| 4 | SPEC-04 Fix rate limiter flood gate | 15 min | High |
| 5 | SPEC-07 Fix BullMQ socket lookup | 20 min | Medium |
| 6 | SPEC-08 Graceful worker shutdown | 15 min | Medium |
| 7 | SPEC-05 Remove dead code | 10 min | Medium |
| 8 | SPEC-06 Centralise data path | 30 min | Medium |
| 9 | SPEC-09 Stale role fix | 10 min | Low |
| 10 | SPEC-10 .env.example + devcontainer | 10 min | Low |
