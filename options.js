'use strict';
// Settings page; every change is stored at once, like Maxthon's own settings.

const HOST = 'com.quicksave.images';
const $ = id => document.getElementById(id);
const helper = msg => chrome.runtime.sendNativeMessage(HOST, msg);

init();

$('enabled').addEventListener('change', e => {
  chrome.storage.local.set({ enabled: e.target.checked });
  render();
});

for (const radio of document.getElementsByName('conflict')) {
  radio.addEventListener('change', e => chrome.storage.local.set({ conflict: e.target.value }));
}

$('change').addEventListener('click', async e => {
  e.preventDefault();
  try {
    const r = await helper({ op: 'pick', dir: $('dir').value });
    if (r.ok) {
      $('dir').value = r.dir;
      await chrome.storage.local.set({ dir: r.dir });
      status('');
    } else if (!r.cancelled) {
      status(r.error);
    }
  } catch (err) {
    status(explain(err));
  }
});

async function init() {
  const s = await chrome.storage.local.get({ enabled: true, dir: '', conflict: 'rename' });
  $('enabled').checked = s.enabled;
  document.querySelector(`[name=conflict][value=${s.conflict === 'overwrite' ? 'overwrite' : 'rename'}]`).checked = true;
  $('dir').value = s.dir;
  render();
  try {
    const r = await helper({ op: 'ping' });
    if (!s.dir) $('dir').value = r.pictures;  // an empty setting means the Pictures folder
  } catch (err) {
    status(explain(err));
  }
}

function explain(err) {
  return /host not found/i.test(err.message)
    ? 'Helper not installed: run install.cmd in the extension folder, then reopen this page.'
    : err.message;
}

function render() {
  document.body.classList.toggle('off', !$('enabled').checked);
}

function status(text) {
  $('status').textContent = text;
}
