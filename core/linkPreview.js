// core/linkPreview.js
const { getLinkPreview } = require('link-preview-js');
const axios = require('axios');

// ─── URL Extraction ───────────────────────────────────────────────────────────
function extractUrls(text) {
  const urlRegex = /https?:\/\/[^\s]+/g;
  return text.match(urlRegex) || [];
}

// ─── Fetch thumbnail as base64 buffer ────────────────────────────────────────
async function fetchThumbnailBuffer(imageUrl) {
  try {
    const res = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 5000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    return Buffer.from(res.data);
  } catch {
    return null;
  }
}

// ─── Core: build Baileys contextInfo with link preview ───────────────────────
async function buildLinkPreview(text) {
  if (!text) return null;
  const urls = extractUrls(text);
  if (!urls.length) return null;

  let preview;
  try {
    preview = await getLinkPreview(urls[0], {
      timeout: 5000,
      followRedirects: 'follow',
      handleRedirects: (baseURL, forwardedURL) => {
        const u1 = new URL(baseURL);
        const u2 = new URL(forwardedURL);
        return (
          u2.hostname === u1.hostname ||
          u2.hostname === 'www.' + u1.hostname ||
          'www.' + u2.hostname === u1.hostname
        );
      },
    });
  } catch {
    return null;
  }

  const thumbnailUrl = preview.images?.[0] || preview.favicons?.[0] || '';
  const jpegThumbnail = thumbnailUrl ? await fetchThumbnailBuffer(thumbnailUrl) : null;

  return {
    externalAdReply: {
      title: preview.title || 'Link Preview',
      body: preview.description || '',
      mediaType: 1, 
      sourceUrl: urls[0],
      thumbnail: jpegThumbnail || undefined,
      renderLargerThumbnail: true,
      showAdAttribution: false,
    },
  };
}

module.exports = { buildLinkPreview, extractUrls };
