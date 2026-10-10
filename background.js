'use strict';
// Fetches what the page could not read, names the file, hands it to the native helper,
// and reports the outcome as a notification.

const HOST = 'com.quicksave.images';
const NOTE = 'quick-save';
const MIME = {
  jpeg: 'jpg', jpg: 'jpg', pjpeg: 'jpg', png: 'png', apng: 'png', gif: 'gif', webp: 'webp', avif: 'avif',
  bmp: 'bmp', 'x-ms-bmp': 'bmp', 'x-icon': 'ico', 'vnd.microsoft.icon': 'ico', 'svg+xml': 'svg', tiff: 'tif', jxl: 'jxl',
};
const SPELLINGS = { jpg: ['jpg', 'jpeg', 'jpe', 'jfif'], tif: ['tif', 'tiff'] };
let nextRule = 1 + Math.floor(Math.random() * 1e6);  // session rules outlive a restarted worker

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

// Tabs opened before install or reload have no live content script; give them one.
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install' && reason !== 'update') return;
  for (const tab of await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] })) {
    chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['content.js'] }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (sender.tab && typeof msg?.url === 'string') save(msg);
});

chrome.notifications.onClicked.addListener(async id => {
  if (id !== NOTE) return;
  chrome.notifications.clear(id);
  const { saved } = await chrome.storage.session.get('saved');
  if (saved) chrome.runtime.sendNativeMessage(HOST, { op: 'reveal', path: saved }).catch(() => {});
});

async function save({ url, origin, data, type, cd }) {
  try {
    if (!data) ({ data, type, cd } = await fetchImage(url, origin));
    if (!data) throw new Error('the image is empty');
    const ext = sniff(atob(data.slice(0, 344))) || MIME[/^image\/([\w.+-]+)/i.exec(type || '')?.[1].toLowerCase()];
    if (!ext) throw new Error(`not an image (${(type || 'unknown type').split(';')[0]})`);
    const { dir = '', conflict = 'rename' } = await chrome.storage.local.get(['dir', 'conflict']);
    const res = await chrome.runtime.sendNativeMessage(HOST, { op: 'save', dir, name: fileName(url, cd, ext), conflict, data });
    if (!res?.ok) throw new Error(res?.error || 'the helper did not answer');
    notify(res.overwritten ? 'Image overwritten' : 'Image saved', res.name, res.path);
  } catch (e) {
    notify('Image not saved', /host not found/i.test(e.message) ? 'Helper not installed: run install.cmd' : e.message);
  }
}

// Cross-origin images are fetched with cookies and with the page's origin as Referer, as the page itself would.
async function fetchImage(url, origin) {
  if (!/^https?:/i.test(url)) throw new Error('the image is no longer available');
  const id = nextRule++;
  const referer = /^https?:/i.test(origin) ? origin + '/' : '';
  if (referer) {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [id],
      addRules: [{
        id,
        action: { type: 'modifyHeaders', requestHeaders: [{ header: 'referer', operation: 'set', value: referer }] },
        condition: { requestDomains: [new URL(url).hostname], initiatorDomains: [chrome.runtime.id], resourceTypes: ['xmlhttprequest'] },
      }],
    }).catch(() => {});
  }
  try {
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return { data: base64(await r.arrayBuffer()), type: r.headers.get('content-type'), cd: r.headers.get('content-disposition') };
  } finally {
    if (referer) chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id] }).catch(() => {});
  }
}

// Magic bytes win over the server's Content-Type. SVG is text, so only its MIME type identifies it.
function sniff(h) {
  if (h.startsWith('\xFF\xD8\xFF')) return 'jpg';
  if (h.startsWith('\x89PNG\r\n\x1A\n')) return 'png';
  if (h.startsWith('GIF8')) return 'gif';
  if (h.startsWith('RIFF') && h.slice(8, 12) === 'WEBP') return 'webp';
  if (/^[\s\S]{4}ftypavi[fs]/.test(h)) return 'avif';
  if (h.startsWith('BM')) return 'bmp';
  if (h.startsWith('\0\0\x01\0')) return 'ico';
  if (h.startsWith('II*\0') || h.startsWith('MM\0*')) return 'tif';
  if (h.startsWith('\xFF\x0A') || h.startsWith('\0\0\0\x0CJXL ')) return 'jxl';
  return '';
}

function fileName(url, cd, ext) {
  const m = /filename\*\s*=\s*utf-8''([^;]+)/i.exec(cd || '') || /filename\s*=\s*"?([^";]+)/i.exec(cd || '');
  let name = m ? decode(m[1]) : /^https?:/i.test(url) ? decode(new URL(url).pathname.split('/').pop()) : '';
  name = name.replace(/[\x00-\x1f<>:"/\\|?*]+/g, '_').replace(/^[\s.]+|[\s.]+$/g, '');
  const dot = name.lastIndexOf('.');
  const current = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  if ((SPELLINGS[ext] || [ext]).includes(current)) ext = current;  // keep .jpeg / .tiff as the site spelled them
  if (/^[a-z0-9]{1,5}$/.test(current)) name = name.slice(0, dot);   // the right extension is re-added below
  name = [...name].slice(0, 150).join('').replace(/[\s.]+$/, '') || 'image';  // by code point: never split an emoji
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(name)) name = '_' + name;
  return `${name}.${ext}`;
}

function notify(title, message, path = '') {
  chrome.storage.session.set({ saved: path });
  chrome.notifications.create(NOTE, {
    type: 'basic',
    iconUrl: 'icons/128.png',
    title,
    message,
    contextMessage: path.slice(0, path.lastIndexOf('\\')),
    silent: true,
  }).catch(() => {});
}

function decode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

function base64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
