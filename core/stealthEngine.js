// core/stealthEngine.js
const logger = require('./logger');

class StealthEngine {
    mutateMessage(text) {
        if (!text) return text;
        const spintaxRegex = /\{([^{}]+)\}/g;
        return text.replace(spintaxRegex, (match, contents) => {
            const choices = contents.split('|');
            return choices[Math.floor(Math.random() * choices.length)];
        });
    }

    async simulateHumanInteraction(sock, jid, text, abortSignal) {
        if (abortSignal?.aborted) throw new Error('AbortError');
        try {
            await sock.presenceSubscribe(jid).catch(() => {});
            await this._randomDelay(800, 2000, abortSignal);
            if (abortSignal?.aborted) throw new Error('AbortError');

            await sock.sendPresenceUpdate('composing', jid);
            const charCount = text ? text.length : 15;
            const typingDuration = Math.min(charCount * (Math.floor(Math.random() * 50) + 50), 10000); 
            await this._randomDelay(typingDuration * 0.8, typingDuration * 1.2, abortSignal);
            if (abortSignal?.aborted) throw new Error('AbortError');

            await sock.sendPresenceUpdate('paused', jid);
            await this._randomDelay(300, 800, abortSignal);
        } catch (e) {
            if (e.message !== 'AbortError') logger.warn(`[STEALTH] Failed human simulation for ${jid}`);
        }
    }

    async _randomDelay(min, max, abortSignal) {
        const ms = Math.floor(Math.random() * (max - min + 1)) + min;
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(resolve, ms);
            if (abortSignal) {
                abortSignal.addEventListener('abort', () => {
                    clearTimeout(timeout);
                    reject(new Error('AbortError'));
                });
            }
        });
    }
}
module.exports = new StealthEngine();
