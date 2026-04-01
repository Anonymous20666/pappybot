// core/linkPreview.js
// Uses Baileys' built-in getUrlInfo + extractUrlFromText (same approach as levanter).
// No external HTTP client needed — Baileys handles fetch, redirect, and thumbnail compression.

const { getUrlInfo, extractUrlFromText } = require('gifted-baileys');
const logger = require('./logger');

/**
 * Extract the first URL from a text string.
 * Uses Baileys' URL_REGEX (same regex levanter relies on).
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
 * Levanter's approach: call getUrlInfo(url) from gifted-baileys directly.
 * It uses link-preview-js internally, compresses the thumbnail to JPEG,
 * and returns { title, description, jpegThumbnail, 'canonical-url' }.
 * We map that straight into externalAdReply — no axios, no manual fetch.
 *
 * @param {string} text - Message text that may contain a URL
 * @returns {Promise<object|null>} Baileys contextInfo or null if no preview
 */
async function buildLinkPreview(text) {
    if (!text) return null;

    const url = extractUrlFromText(text);
    if (!url) return null;

    try {
        const info = await getUrlInfo(url, {
            thumbnailWidth: 300,
            fetchOpts: {
                timeout: 8000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; WhatsApp/2.24)'
                }
            }
        });

        if (!info || !info.title) return null;

        return {
            externalAdReply: {
                title: info.title || '',
                body: info.description || '',
                mediaType: 1,
                sourceUrl: info['canonical-url'] || url,
                thumbnail: info.jpegThumbnail || undefined,
                renderLargerThumbnail: true,
                showAdAttribution: false,
            }
        };
    } catch (err) {
        logger.warn(`[LinkPreview] Failed for ${url}: ${err.message}`);
        return null;
    }
}

module.exports = { buildLinkPreview, extractUrls };
