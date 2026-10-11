importScripts('shared.js');

const CONTENT_FILES = ['shared.js', 'dom.js', 'popups.js', 'content.js'];
const POPUP_CLICK_LIMIT = 10;
const POPUP_CLICK_WINDOW_MS = 60000;

chrome.action.setBadgeBackgroundColor({ color: '#5b5bd6' });

chrome.storage.local.set({ 'lf:bg': { build: LF.BUILD, at: Date.now() } }).catch(() => {});

const isWebUrl = url => /^https?:\/\//i.test(url || '');

const sendToTab = async (tabId, message, frameId) => {
  try {
    const options = frameId === undefined ? undefined : { frameId };
    return await chrome.tabs.sendMessage(tabId, message, options);
  } catch {
    return undefined;
  }
};

const ensureContent = async tabId => {
  const pong = await sendToTab(tabId, { t: 'ping' }, 0);
  if (pong && pong.ok && pong.build === LF.BUILD) return true;
  try {
    await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, files: CONTENT_FILES });
    return true;
  } catch {
    return false;
  }
};

const openEditor = async tabId => {
  if (!(await ensureContent(tabId))) return { ok: false, error: 'This page cannot be edited.' };
  const response = await sendToTab(tabId, { t: 'editor:toggle' }, 0);
  if (response && response.loaded) return { ok: true };
  try {
    await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, files: ['editor.js'] });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error) };
  }
};

let patchChain = Promise.resolve();

const applyPatch = async (host, patch) => {
  const key = LF.storageKey(host);
  const stored = await chrome.storage.local.get(key);
  if (patch.reset) {
    await chrome.storage.local.remove(key);
    return { ok: true, rev: '' };
  }
  const site = LF.normalizeSite(stored[key]);
  const set = patch.set || {};
  for (const field of ['enabled', 'popupsEnabled', 'forceImportant', 'css', 'cssC', 'cssSrc']) {
    if (field in set) site[field] = set[field];
  }
  if (Array.isArray(set.rules)) site.rules = LF.normalizeSite({ rules: set.rules }).rules;
  if (Array.isArray(set.popups)) site.popups = LF.normalizeSite({ popups: set.popups }).popups;
  if (Array.isArray(set.names)) site.names = LF.normalizeSite({ names: set.names }).names;
  if (patch.addPopup) {
    const incoming = LF.normalizeSite({ popups: [patch.addPopup] }).popups[0];
    if (incoming) {
      site.popups = site.popups.filter(popup => popup.close !== incoming.close).concat(incoming).slice(-LF.MAX_POPUPS);
    }
  }
  if (patch.updatePopup) {
    const target = site.popups.find(popup => popup.id === patch.updatePopup.id);
    if (target) {
      const changes = patch.updatePopup.changes || {};
      if ('on' in changes) target.on = Boolean(changes.on);
      if (changes.strategy === 'click' || changes.strategy === 'hide') target.strategy = changes.strategy;
      if (Array.isArray(changes.hide)) target.hide = LF.normalizeHide(changes.hide);
      if (typeof changes.name === 'string') target.name = changes.name.slice(0, 120);
    }
  }
  if (patch.removePopup) site.popups = site.popups.filter(popup => popup.id !== patch.removePopup);
  site.rev = LF.uid('v');
  site.updated = Date.now();
  await chrome.storage.local.set({ [key]: site });
  return { ok: true, rev: site.rev };
};

const patchSite = (host, patch) => {
  const run = patchChain.then(() => applyPatch(host, patch || {}));
  patchChain = run.catch(() => {});
  return run;
};

const allowPopupClick = async (host, id) => {
  const key = 'rl:' + host + ':' + id;
  const stored = await chrome.storage.session.get(key);
  const now = Date.now();
  const recent = (stored[key] || []).filter(time => now - time < POPUP_CLICK_WINDOW_MS);
  if (recent.length >= POPUP_CLICK_LIMIT) return { allow: false };
  recent.push(now);
  await chrome.storage.session.set({ [key]: recent });
  return { allow: true };
};

const handlers = {
  async css(message, sender) {
    const tabId = sender.tab && sender.tab.id;
    if (tabId === undefined) return { added: [], removed: [] };
    const target = sender.documentId
      ? { tabId, documentIds: [sender.documentId] }
      : { tabId, frameIds: [sender.frameId || 0] };
    const added = [];
    const removed = [];
    for (const css of message.add || []) {
      try {
        await chrome.scripting.insertCSS({ target, css, origin: 'USER' });
        added.push(true);
      } catch {
        added.push(false);
      }
    }
    for (const css of message.remove || []) {
      try {
        await chrome.scripting.removeCSS({ target, css, origin: 'USER' });
        removed.push(true);
      } catch {
        removed.push(false);
      }
    }
    return { added, removed };
  },

  async patch(message) {
    if (!message.host) return { ok: false };
    return patchSite(LF.siteKey(message.host), message.patch);
  },

  async hello() {
    return { ok: true, build: LF.BUILD };
  },

  async status(message, sender) {
    const tabId = sender.tab && sender.tab.id;
    if (tabId === undefined) return { ok: false };
    const count = Number(message.count) || 0;
    await chrome.action.setBadgeText({ tabId, text: count > 0 ? String(Math.min(count, 99)) : '' });
    return { ok: true };
  },

  async 'popup:allow'(message) {
    return allowPopupClick(String(message.host), String(message.id));
  },

  async 'record:begin'(message, sender) {
    const tabId = message.tabId !== undefined ? message.tabId : sender.tab && sender.tab.id;
    if (tabId === undefined) return { ok: false };
    if (!(await ensureContent(tabId))) return { ok: false };
    await sendToTab(tabId, { t: 'record:arm', banner: true });
    return { ok: true };
  },

  async 'record:finished'(message, sender) {
    const tabId = sender.tab && sender.tab.id;
    if (tabId === undefined) return { ok: false };
    await sendToTab(tabId, { t: 'record:disarm', result: message.result || { closed: 0 } });
    return { ok: true };
  },

  async 'record:cancel'(message, sender) {
    const tabId = sender.tab && sender.tab.id;
    if (tabId === undefined) return { ok: false };
    await sendToTab(tabId, { t: 'record:disarm', result: null });
    return { ok: true };
  },

  async 'editor:open'(message, sender) {
    const tabId = message.tabId !== undefined ? message.tabId : sender.tab && sender.tab.id;
    if (tabId === undefined) return { ok: false };
    return openEditor(tabId);
  }
};

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!message || typeof message.t !== 'string' || sender.id !== chrome.runtime.id) return false;
  const handler = handlers[message.t];
  if (!handler) return false;
  handler(message, sender).then(respond, error => respond({ ok: false, error: String((error && error.message) || error) }));
  return true;
});

chrome.commands.onCommand.addListener(async command => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || tab.id === undefined || !isWebUrl(tab.url)) return;
  if (command === 'toggle-editor') {
    await openEditor(tab.id);
    return;
  }
  if (command === 'toggle-site') {
    const host = LF.siteKey(new URL(tab.url).hostname);
    const key = LF.storageKey(host);
    const stored = await chrome.storage.local.get(key);
    const site = LF.normalizeSite(stored[key]);
    await patchSite(host, { set: { enabled: !site.enabled } });
  }
});

const injectIntoOpenTabs = async () => {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  } catch {
    return;
  }
  for (const tab of tabs) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: CONTENT_FILES });
    } catch {
    }
  }
};

chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install' || details.reason === 'update') injectIntoOpenTabs();
});
