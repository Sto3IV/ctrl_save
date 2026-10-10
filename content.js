'use strict';
// Maxthon-style quick save: Ctrl+left-click on an image saves it without a dialog.

let enabled = true;
chrome.storage.local.get({ enabled: true }, s => { enabled = s.enabled; });
chrome.storage.onChanged.addListener(c => { if (c.enabled) enabled = c.enabled.newValue !== false; });

// The image URL when the event belongs to a quick-save click, otherwise ''.
function imageUrl(e) {
  // runtime.id vanishes when the extension reloads; an orphaned copy must let the click through.
  if (!enabled || !e.isTrusted || e.button !== 0 || !e.ctrlKey || e.shiftKey || e.altKey || e.metaKey || !chrome.runtime?.id) return '';
  const el = e.composedPath()[0];
  const src = el?.localName === 'img' ? el.currentSrc || el.src : '';
  return /^(https?|data|blob):/i.test(src) ? src : '';
}

// The whole press is taken from the page, so links, lightboxes and drag handlers never see it.
for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'dblclick', 'click']) {
  addEventListener(type, e => {
    const url = imageUrl(e);
    if (!url) return;
    e.stopImmediatePropagation();
    // A cancelled pointerdown suppresses mousedown, and mousedown is the one whose default starts drag and selection.
    if (!type.startsWith('pointer')) e.preventDefault();
    if (type === 'click') save(url);
  }, true);
}

async function save(url) {
  const msg = { url, origin: location.origin };
  // Same-origin, data: and blob: images are read here, from the page's own cache; the worker fetches the rest.
  if (!/^https?:/i.test(url) || new URL(url).origin === location.origin) {
    try {
      const r = await fetch(url, { cache: 'force-cache' });
      if (r.ok) {
        msg.data = base64(await r.arrayBuffer());
        msg.type = r.headers.get('content-type');
        msg.cd = r.headers.get('content-disposition');
      }
    } catch {}
  }
  chrome.runtime.sendMessage(msg).catch(() => {});
}

function base64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
