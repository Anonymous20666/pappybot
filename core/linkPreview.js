// core/linkPreview.js
// Uses Baileys' built-in getUrlInfo + extractUrlFromText (same approach as levanter).
// sourceUrl is always the original URL so tapping the card opens the correct page.
// WhatsApp invite links get mediaType 2 so they render as tappable join cards.

const { getUrlInfo, extractUrlFromText } = require('gifted-baileys');
const logger = require('./logger');

const WA_INVITE_RE = /chat\.whatsapp\.com\/[A-Za-z0-9]{10,}/;

/**
 * Extract the first URL from a text string.
 * Returns an array for API compatibility with callers that do urls[0].
 */
function extractUrls(text) {
    if (!text) return [];
    const url = extractUrlFromText(text);
    return url ? [url] : [];
}

/**
 * Build a Baileys contextInfo object with a rich link preview.
 *
 * - sourceUrl is always the original URL (not the canonical redirect)
 *   so tapping the card opens the correct destination.
 * - WhatsApp invite links use mediaType 2 (group invite card) so they
 *   render with a "View group" / join button instead of a plain web card.
 *
 * @param {string} text - Message text that may contain a URL
 * @returns {Promise<object|null>} Baileys contextInfo or null if no preview
 */
async function buildLinkPreview(text) {
    if (!text) return null;

    const url = extractUrlFromText(text);
    if (!url) return null;

    const isWaInvite = WA_INVITE_RE.test(url);

    try {
        const info = await getUrlInfo(url, {
            thumbnailWidth: 300,
            fetchOpts: {
                timeout: 8000,
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WhatsApp/2.24)' },
            },
        });

        if (!info || !info.title) return null;

        return {
            externalAdReply: {
                title:                info.title || '',
                body:                 info.description || (isWaInvite ? 'Group chat invite' : ''),
                // mediaType 2 = WhatsApp group invite (tappable join card)
                // mediaType 1 = generic web link card
                mediaType:            isWaInvite ? 2 : 1,
                // Always use the original URL — canonical-url may be a redirect
                sourceUrl:            url,
                thumbnail:            info.jpegThumbnail || undefined,
                renderLargerThumbnail: true,
                showAdAttribution:    false,
            },
        };
    } catch (err) {
        logger.warn(`[LinkPreview] Failed for ${url}: ${err.message}`);
        return null;
    }
}

module.exports = { buildLinkPreview, extractUrls };
