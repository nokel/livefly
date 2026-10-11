(function (root) {
  const LF = root.LF;
  if (!LF || (LF.core && LF.core.build === LF.BUILD)) return;
  if (!/^https?:$/.test(location.protocol)) return;
  const host = LF.siteKey(location.hostname);
  if (!host) return;

  const isTop = root === root.top;
  const HOOKED_EVENTS = [
    'pointerdown', 'pointermove', 'pointerup', 'pointercancel',
    'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick', 'contextmenu',
    'keydown', 'keyup', 'keypress'
  ];

  if (LF.core && LF.core.dispose) LF.core.dispose();

  const core = (LF.core = {
    build: LF.BUILD,
    host,
    isTop,
    key: LF.storageKey(host),
    site: LF.emptySite(),
    layout: LF.normalizeLayout(null),
    renderSite: null,
    paused: false,
    ready: false,
    readyPromise: null,
    resolveReady: null,
    applied: [],
    extra: new Set(),
    eventHook: null,
    editorHook: null,
    fallback: null
  });

  core.readyPromise = new Promise(resolve => {
    core.resolveReady = resolve;
  });

  core.dispose = () => {
    core.setEventHook(null);
    core.editorHook = null;
    const editor = LF.editor;
    if (editor && editor.state && editor.state.active) {
      try {
        editor.close();
      } catch {
      }
    }
  };

  const isAlive = () => {
    try {
      return Boolean(chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  };

  const desired = boost => {
    if (core.paused) return [];
    const site = core.renderSite || core.site;
    const sheets = LF.compile(site, { top: isTop, path: location.pathname, boost });
    for (const css of core.extra) sheets.push(css);
    return sheets;
  };

  const setFallback = text => {
    try {
      if (!text) {
        if (core.fallback) {
          core.fallback.replaceSync('');
          document.adoptedStyleSheets = document.adoptedStyleSheets.filter(sheet => sheet !== core.fallback);
        }
        return;
      }
      if (!core.fallback) core.fallback = new CSSStyleSheet();
      core.fallback.replaceSync(text);
      if (!document.adoptedStyleSheets.includes(core.fallback)) {
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, core.fallback];
      }
    } catch {
    }
  };

  const runSync = async () => {
    if (!isAlive()) return;
    const want = desired(false);
    const add = want.filter(css => !core.applied.includes(css));
    const remove = core.applied.filter(css => !want.includes(css));
    if (!add.length && !remove.length) {
      if (want.every(css => core.applied.includes(css))) setFallback('');
      return;
    }
    if (add.length) setFallback(desired(true).join('\n'));
    const response = await LF.send({ t: 'css', add, remove });
    if (response && response.added && response.removed) {
      add.forEach((css, index) => {
        if (response.added[index]) core.applied.push(css);
      });
      remove.forEach((css, index) => {
        const at = core.applied.indexOf(css);
        if (response.removed[index] && at !== -1) core.applied.splice(at, 1);
      });
    }
    if (want.every(css => core.applied.includes(css))) setFallback('');
  };

  let running = null;
  let dirty = false;

  core.sync = () => {
    dirty = true;
    if (running) return running;
    running = (async () => {
      try {
        while (dirty) {
          dirty = false;
          await runSync();
        }
      } finally {
        running = null;
      }
    })();
    return running;
  };

  const eventListener = event => {
    const hook = core.eventHook;
    if (hook && hook(event)) event.stopImmediatePropagation();
  };

  core.setEventHook = hook => {
    const had = Boolean(core.eventHook);
    core.eventHook = hook || null;
    if (hook && !had) for (const type of HOOKED_EVENTS) root.addEventListener(type, eventListener, true);
    if (!hook && had) for (const type of HOOKED_EVENTS) root.removeEventListener(type, eventListener, true);
  };

  const report = () => {
    if (isTop) LF.send({ t: 'status', count: core.paused ? 0 : LF.countActive(core.site) });
  };

  const loadSite = raw => LF.prepareCss(LF.normalizeSite(raw));

  const checkBackground = async () => {
    const reply = await LF.send({ t: 'hello' });
    core.background = (reply && reply.build) || '';
    if (isTop && core.background !== LF.BUILD && LF.hasContent(core.site)) {
      LF.popups.notice('livefly was updated but its background part is still the old version. Open the browser extensions page and reload livefly.');
    }
  };

  const boot = async () => {
    let data = {};
    try {
      data = await chrome.storage.local.get([core.key, LF.SETTINGS_KEY, LF.LAYOUT_KEY]);
    } catch {
    }
    core.site = loadSite(data[core.key]);
    core.layout = LF.normalizeLayout(data[LF.LAYOUT_KEY]);
    core.paused = Boolean(data[LF.SETTINGS_KEY] && data[LF.SETTINGS_KEY].paused);
    core.ready = true;
    core.resolveReady();
    core.sync();
    LF.popups.update(core.site);
    report();
    checkBackground();
  };

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !isAlive()) return;
    if (changes[LF.LAYOUT_KEY]) core.layout = LF.normalizeLayout(changes[LF.LAYOUT_KEY].newValue);
    if (changes[LF.SETTINGS_KEY]) {
      const value = changes[LF.SETTINGS_KEY].newValue;
      core.paused = Boolean(value && value.paused);
    }
    if (changes[core.key]) {
      core.site = loadSite(changes[core.key].newValue);
      if (core.editorHook && core.editorHook.externalChange) core.editorHook.externalChange(core.site);
    }
    if (changes[core.key] || changes[LF.SETTINGS_KEY]) {
      core.sync();
      LF.popups.update(core.site);
      report();
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (!message || typeof message.t !== 'string') return false;
    switch (message.t) {
      case 'ping':
        respond({
          ok: true,
          build: LF.BUILD,
          host,
          isTop,
          editing: Boolean(core.editorHook),
          enabled: core.site.enabled,
          paused: core.paused,
          rules: core.site.rules.length,
          popups: core.site.popups.length
        });
        return false;
      case 'editor:toggle':
        if (!isTop) return false;
        if (LF.editor && LF.editor.build === LF.BUILD) {
          LF.editor.toggle();
          respond({ loaded: true });
        } else {
          respond({ loaded: false });
        }
        return false;
      case 'record:arm':
        LF.popups.arm({ banner: Boolean(message.banner) });
        respond({ ok: true });
        return false;
      case 'record:disarm':
        LF.popups.disarm(message.result || null);
        respond({ ok: true });
        return false;
      default:
        return false;
    }
  });

  let lastPath = location.pathname;
  const onNavigate = () => {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    core.sync();
  };
  if (root.navigation && root.navigation.addEventListener) {
    root.navigation.addEventListener('currententrychange', onNavigate);
  }
  root.addEventListener('popstate', onNavigate);

  boot();
})(globalThis);
