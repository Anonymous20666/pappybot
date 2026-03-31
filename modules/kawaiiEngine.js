// modules/kawaiiEngine.js
/**
 * 🌸 KAWAII & ELITE AESTHETIC ENGINE
 * Minimal Luxury ASCII Formatting with OpenRouter AI Injection
 */

const ai = require('../core/ai');
const logger = require('../core/logger');

// Fallback moods in case OpenRouter times out or errors
const STATIC_MOODS = [
    "soft signal received…",
    "this one feels different ✧",
    "quiet drop, loud impact",
    "transmission secured",
    "for your eyes only ♡",
    "the architecture of exclusivity",
    "silent deployment ⎔"
];

// 🎨 PREMIUM ASCII TEMPLATES
const TEMPLATES = [
    // 1. Private Access
    (title, url, mood) => `✦━━━━━━━━━━━━━━✦\n♡ private access ♡\n✧ curated drop ✧\n\n  ${title}\n\n  ⤷ ${url}\n\n✦━━━━━━━━━━━━━━✦\n— ${mood} ✦`,
    
    // 2. Invitation
    (title, url, mood) => `╭─〔 ✦ invitation ✦ 〕─╮\n♡ soft launch\n☆ members only\n\n→ ${title}\n\n${url}\n╰────────────────╯\n✧ ${mood} ✧`,
    
    // 3. Exclusive Signal
    (title, url, mood) => `┏━━━━━━━━━━━━━━┓\n✧ exclusive signal ✧\n\n${title}\n\n↳ ${url}\n┗━━━━━━━━━━━━━━┛\n♡ ${mood} ♡`,
    
    // 4. Ethereal Route
    (title, url, mood) => `┌───── •✧• ─────┐\n  ethereal drop\n  limited routing\n\n  ${title}\n\n  ➶ ${url}\n└───── •✧• ─────┘\n  ${mood}`,
    
    // 5. Velvet Whisper
    (title, url, mood) => `⌠ velvet whisper ⌡\n\n ✦ ${title}\n\n ⤿ ${url}\n\n⌡ signal secured ⌠\n— ${mood}`
];

/**
 * Trims text to prevent pushing the URL off-screen on mobile devices.
 */
function trimText(text, maxLength = 80) {
    if (!text) return "Unknown Signal";
    return text.length > maxLength ? text.substring(0, maxLength - 3) + "..." : text;
}

/**
 * Generates the final ASCII invite payload.
 * * @param {Object} params 
 * @param {string} params.url - The extracted URL
 * @param {string} params.title - The scraped website title
 * @param {boolean} params.useAI - Whether to ping OpenRouter for a dynamic mood
 */
async function generateInvite({ url, title, useAI = false }) {
    const safeTitle = trimText(title, 80);
    let mood = STATIC_MOODS[Math.floor(Math.random() * STATIC_MOODS.length)];

    // 🧠 OPENROUTER DYNAMIC MOOD INJECTION
    if (useAI) {
        try {
            const prompt = `Write a very short, 3 to 6 word aesthetic, mysterious, or kawaii "mood line" for a link titled: "${safeTitle}". Make it completely lowercase, minimal, and luxurious. Do not use quotes, and do not put punctuation at the end.`;
            const systemPrompt = "You are an elite, minimalist luxury copywriter for an exclusive underground digital club.";
            
            const aiResponse = await ai.generateText(prompt, systemPrompt);
            
            // Validate AI output isn't a massive paragraph due to hallucination
            if (aiResponse && aiResponse.length < 50) {
                mood = aiResponse.trim().replace(/["']/g, '').toLowerCase();
            } else {
                logger.warn("[KAWAII] AI mood was too long, falling back to static.");
            }
        } catch (error) {
            logger.error("[KAWAII] OpenRouter AI failed. Using static fallback.", error.message);
        }
    }

    // Select a random template and compile
    const randomTemplate = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
    return randomTemplate(safeTitle, url, mood);
}

module.exports = { generateInvite };
