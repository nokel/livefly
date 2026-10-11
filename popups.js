(function (root) {
  const LF = root.LF;
  if (LF.popups && LF.popups.build === LF.BUILD) return;
  if (LF.popups && LF.popups.dispose) LF.popups.dispose();
  const popups = (LF.popups = { build: LF.BUILD });

  const MAX_ROUNDS = 3;
  const RETRY_STEPS = [300, 300, 400, 600, 800, 1200, 1600];
  const DOC_CLICK_LIMIT = 40;
  const POLL_MS = 50;
  const CLICK_DELAY = 80;
  const LEARN_MS = 300;
  const LEARN_DEPTH = 8;
  const LEARN_COVER = 0.35;
  const LEARN_TRIES = 3;
  const IDENTITY = ['data-test-id', 'data-testid', 'data-test', 'data-qa', 'role', 'aria-label'];
  const UNLOCK_CSS = 'html,body{overflow:auto !important;overflow-y:auto !important}';

  let clicked = new WeakMap();
  const running = new WeakSet();
  const sessions = new Map();
  const learnTries = new Map();
  let rules = [];
  let observer = null;
  let timer = 0;
  let scanning = false;
  let rerun = false;
  let watchingFocus = false;

  const sleep = ms => new Promise(resolve => root.setTimeout(resolve, ms));

  const TRACE_KEY = 'lf:trace';
  const traceQueue = [];
  let traceTimer = 0;

  const flushTrace = async () => {
    traceTimer = 0;
    try {
      const stored = await chrome.storage.local.get(TRACE_KEY);
      const list = (stored[TRACE_KEY] || []).concat(traceQueue.splice(0)).slice(-150);
      await chrome.storage.local.set({ [TRACE_KEY]: list });
    } catch {
    }
  };

  const trace = (kind, data) => {
    traceQueue.push({
      t: Date.now(),
      p: root.performance ? Math.round(root.performance.now()) : 0,
      f: LF.core && LF.core.isTop ? 'top' : 'frame',
      h: root.location ? root.location.hostname : '',
      k: kind,
      d: data
    });
    if (!traceTimer) traceTimer = root.setTimeout(flushTrace, 400);
  };

  const probe = label => {
    if (!rules.length) return;
    trace(label, {
      focus: document.hasFocus ? document.hasFocus() : null,
      vis: document.visibilityState,
      rules: rules.map(rule => {
        const button = LF.dom.qs(rule.close);
        return {
          id: rule.id.slice(-4),
          button: button ? (LF.dom.isShown(button) ? 'shown' : 'hidden') : 'none',
          hide: rule.hide.map(selector => {
            const element = LF.dom.qs(selector);
            return element ? (LF.dom.isShown(element) ? 'shown' : 'hidden') : 'none';
          })
        };
      })
    });
  };

  const probeSoon = label => {
    probe(label);
    root.setTimeout(() => probe(label + '+300'), 300);
    root.setTimeout(() => probe(label + '+1500'), 1500);
  };

  const unlockScroll = () => {
    const core = LF.core;
    if (!core || core.extra.has(UNLOCK_CSS) || !LF.dom.isScrollLocked()) return;
    core.extra.add(UNLOCK_CSS);
    core.sync();
  };

  const fallbackHide = rule => {
    const core = LF.core;
    if (!core || !rule.hide.length) return;
    const css = rule.hide
      .filter(selector => LF.isSafeSelector(selector) && !LF.isRootSelector(selector))
      .map(selector => selector + '{display:none !important}')
      .join('\n');
    if (css) core.extra.add(css);
    unlockScroll();
    core.sync();
  };

  const allowClick = rule => {
    let session = sessions.get(rule.id);
    if (!session) {
      const verdict = LF.send({ t: 'popup:allow', host: LF.core.host, id: rule.id }).then(reply => {
        trace('allow', { id: rule.id.slice(-4), verdict: reply });
        return Boolean(reply && reply.allow);
      });
      session = { count: 0, verdict };
      sessions.set(rule.id, session);
    }
    if (session.count >= DOC_CLICK_LIMIT) return Promise.resolve(false);
    session.count++;
    return session.verdict;
  };

  const isGone = (button, covered) => !button.isConnected || (!covered && !LF.dom.isShown(button));

  const waitGone = async (button, covered, ms) => {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      if (isGone(button, covered)) return true;
      await sleep(POLL_MS);
    }
    return isGone(button, covered);
  };

  const clickUntilGone = async (rule, button, covered) => {
    for (const wait of RETRY_STEPS) {
      if (isGone(button, covered)) return true;
      if (!(await allowClick(rule))) return false;
      LF.dom.activate(button);
      trace('click', { id: rule.id.slice(-4), covered });
      if (await waitGone(button, covered, wait)) return true;
    }
    return false;
  };

  const signatureOf = element => {
    if (element.id) return '#' + CSS.escape(element.id);
    for (const attr of IDENTITY) {
      const value = element.getAttribute(attr);
      if (value && value.length <= 80) return element.localName + '[' + attr + '="' + value.replace(/(["\\])/g, '\\$1') + '"]';
    }
    return '';
  };

  const closedNow = (entry, strict) => {
    const gone = !entry.element.isConnected || (!strict && !LF.dom.isShown(entry.element));
    if (!gone) return false;
    if (!entry.signature) return true;
    const again = LF.dom.qs(entry.signature);
    return !(again && again !== entry.element && (strict || LF.dom.isShown(again)));
  };

  const hopsOf = selector => (selector.match(/> \* /g) || []).length;

  const upgradable = rule => rule.hide.length === 1 && /^[a-z][a-z0-9-]*:has\(/.test(rule.hide[0]);

  const trailOf = button => {
    const view = Math.max(1, root.innerWidth * root.innerHeight);
    const trail = [];
    let current = button;
    for (
      let depth = 0;
      current && current.nodeType === 1 && current !== document.body && current !== document.documentElement && depth < LEARN_DEPTH;
      depth++
    ) {
      const rect = current.getBoundingClientRect();
      trail.push({ element: current, area: rect.width * rect.height, tag: current.localName, signature: signatureOf(current) });
      current = current.parentElement;
    }
    return { view, entries: trail };
  };

  const ANCHOR = /^[a-zA-Z][\w-]*(?:\[[^\]]+\]|#[\w-]+|\.[\w-]+)*$|^(?:\[[^\]]+\]|#[\w-]+|\.[\w-]+)+$/;

  const anchoredHide = (anchor, trail, strict) => {
    if (!ANCHOR.test(anchor) || LF.isRiskyHide(anchor)) return '';
    const back = LF.dom.qs(anchor);
    if (back && (strict || LF.dom.isShown(back))) return '';
    const limit = trail.view * LEARN_COVER;
    let pick = 0;
    for (let index = 1; index < trail.entries.length; index++) {
      const entry = trail.entries[index];
      if (!closedNow(entry, strict)) break;
      if (entry.area > limit || entry.element.parentElement === document.body) break;
      pick = index;
    }
    if (!pick || !/^[a-z][a-z0-9-]*$/.test(trail.entries[pick].tag)) return '';
    const selector = trail.entries[pick].tag + ':has(' + '> * '.repeat(pick - 1) + '> ' + anchor + ')';
    return LF.dom.isValidSelector(selector) && !LF.isRiskyHide(selector) ? selector : '';
  };

  const learn = (rule, trail, covered) => {
    const tries = learnTries.get(rule.id) || 0;
    if (tries >= LEARN_TRIES || !trail.entries.length) return;
    learnTries.set(rule.id, tries + 1);
    root.setTimeout(() => {
      const selector = anchoredHide(rule.close, trail, covered);
      trace('learn', {
        covered,
        id: rule.id.slice(-4),
        pick: selector,
        trail: trail.entries.map(entry => ({ tag: entry.tag, area: Math.round(entry.area), connected: entry.element.isConnected, shown: LF.dom.isShown(entry.element) }))
      });
      if (!selector || (covered && hopsOf(selector) <= hopsOf(rule.hide[0]))) return;
      learnTries.set(rule.id, LEARN_TRIES);
      LF.patch(LF.core.host, { updatePopup: { id: rule.id, changes: { hide: [selector] } } }).then(response => trace('patched', { id: rule.id.slice(-4), response }));
    }, LEARN_MS);
  };

  const handle = async rule => {
    if (rule.strategy === 'hide') {
      if (rule.hide.some(selector => LF.dom.qs(selector))) unlockScroll();
      return;
    }
    if (!rule.close) return;
    const button = LF.dom.qs(rule.close);
    if (!button) return;
    const covered = rule.hide.length > 0;
    if (!covered && !LF.dom.isShown(button)) return;
    const used = clicked.get(button) || 0;
    if (used >= MAX_ROUNDS || running.has(button)) return;
    clicked.set(button, used + 1);
    trace('seen', { id: rule.id.slice(-4), covered, shown: LF.dom.isShown(button), used });
    if (!covered) {
      await sleep(CLICK_DELAY);
      if (!button.isConnected || !LF.dom.isShown(button)) return;
    }
    const trail = !covered || upgradable(rule) ? trailOf(button) : null;
    running.add(button);
    const started = Date.now();
    clickUntilGone(rule, button, covered).then(gone => {
      running.delete(button);
      trace('done', { id: rule.id.slice(-4), covered, gone, ms: Date.now() - started });
      if (gone && trail) learn(rule, trail, covered);
      if (!gone) fallbackHide(rule);
    });
  };

  const schedule = delay => {
    if (timer) return;
    timer = root.setTimeout(() => {
      timer = 0;
      scan();
    }, delay);
  };

  const scan = async () => {
    if (!LF.core || LF.core.paused) return;
    if (scanning) {
      rerun = true;
      return;
    }
    scanning = true;
    try {
      for (const rule of rules) await handle(rule);
    } catch {
    } finally {
      scanning = false;
      if (rerun) {
        rerun = false;
        schedule(CLICK_DELAY);
      }
    }
  };

  const startObserving = () => {
    observer = new MutationObserver(() => schedule(50));
    observer.observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'open', 'aria-hidden']
    });
    document.addEventListener('DOMContentLoaded', () => schedule(0), { once: true });
    root.addEventListener('load', () => schedule(300), { once: true });
    if (!watchingFocus) {
      watchingFocus = true;
      document.addEventListener('visibilitychange', () => probeSoon('vis:' + document.visibilityState));
      root.addEventListener('blur', () => probeSoon('blur'));
      root.addEventListener('focus', () => probeSoon('focus'));
    }
  };

  const stopObserving = () => {
    if (observer) observer.disconnect();
    observer = null;
  };

  popups.dispose = () => {
    stopObserving();
    hideBanner();
  };

  popups.update = site => {
    rules = site && site.popupsEnabled !== false ? site.popups.filter(popup => popup.on !== false) : [];
    const needed = rules.length > 0 && !(LF.core && LF.core.paused);
    if (needed && !observer) startObserving();
    if (!needed && observer) stopObserving();
    if (needed) {
      schedule(0);
      trace('update', { build: LF.BUILD, rules: rules.map(rule => ({ id: rule.id.slice(-4), hide: rule.hide, strategy: rule.strategy })) });
      probeSoon('update');
    }
  };

  popups.notice = text => showBar(text, false, 9000);

  popups.rescan = () => {
    clicked = new WeakMap();
    learnTries.clear();
    schedule(0);
  };

  const BANNER_CSS = `
    :host { all: initial; }
    .bar {
      position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
      display: flex; gap: 12px; align-items: center; max-width: min(640px, calc(100vw - 24px));
      padding: 10px 14px; border-radius: 10px; background: #1f2230; color: #f1f3f9;
      font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
      box-shadow: 0 8px 28px rgba(0,0,0,.45); border: 1px solid #4a5170; pointer-events: auto;
    }
    strong { color: #8fb4ff; }
    .btn {
      all: unset; cursor: pointer; padding: 5px 10px; border-radius: 6px; background: #343a55; color: #fff;
    }
    .btn:hover { background: #46507a; }
  `;

  const recorder = { armed: false, cleanup: null, banner: null, snapshot: [], toastTimer: 0 };

  const hideBanner = () => {
    if (recorder.banner) recorder.banner.host.remove();
    recorder.banner = null;
    root.clearTimeout(recorder.toastTimer);
  };

  const showBar = (text, withCancel, duration) => {
    if (!LF.core.isTop) return;
    hideBanner();
    const { host, shadow } = LF.dom.shadowHost(BANNER_CSS);
    const h = LF.dom.h;
    const children = [h('strong', { text: 'livefly' }), h('span', { text })];
    if (withCancel) children.push(h('button', { class: 'btn', text: 'Cancel', onclick: () => LF.send({ t: 'record:cancel' }) }));
    shadow.append(h('div', { class: 'bar' }, children));
    (document.documentElement || document).append(host);
    recorder.banner = { host };
    if (!withCancel) recorder.toastTimer = root.setTimeout(hideBanner, duration || 4000);
  };

  const takeSnapshot = () => {
    const candidates = LF.dom.overlayCandidates();
    const rated = candidates.map(element => {
      const rect = element.getBoundingClientRect();
      return { element, area: rect.width * rect.height };
    });
    rated.sort((a, b) => b.area - a.area);
    recorder.snapshot = rated.slice(0, 25).map(item => ({
      element: item.element,
      selector: LF.dom.selectorFor(item.element).sel
    }));
  };

  const disarmLocal = () => {
    recorder.armed = false;
    if (recorder.cleanup) recorder.cleanup();
    recorder.cleanup = null;
  };

  const finish = (button, selector, label, trail) => {
    const closed = recorder.snapshot.filter(item => !item.element.isConnected || !LF.dom.isShown(item.element));
    const roots = closed.filter(item => !closed.some(other => other !== item && other.element.contains(item.element)));
    let hide = roots.slice(0, 3).map(item => item.selector);
    if (!hide.length) {
      const learned = anchoredHide(selector, trail);
      if (learned) hide = [learned];
    }
    if (!hide.length) {
      const dialog = LF.dom.nearestDialog(button);
      if (dialog && dialog.isConnected) hide = [LF.dom.selectorFor(dialog).sel];
    }
    hide = hide.filter(entry => LF.isSafeSelector(entry) && !LF.isRootSelector(entry));
    const rule = {
      id: LF.uid('p'),
      name: label ? 'Click “' + label + '”' : 'Popup',
      on: true,
      strategy: 'click',
      close: selector,
      hide,
      label,
      added: Date.now()
    };
    LF.patch(LF.core.host, { addPopup: rule });
    LF.send({ t: 'record:finished', result: { name: rule.name, closed: hide.length, host: LF.core.host } });
  };

  popups.arm = options => {
    if (recorder.armed) return;
    recorder.armed = true;
    root.setTimeout(takeSnapshot, 50);
    const onDown = event => {
      if (event.button !== 0 || !event.isTrusted) return;
      const target = event.composedPath()[0];
      if (!(target instanceof Element) || target.localName === 'livefly-root') return;
      disarmLocal();
      const button = LF.dom.closestClickable(target);
      const selector = LF.dom.selectorFor(button).sel;
      const label = (button.getAttribute('aria-label') || button.getAttribute('title') || button.textContent || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 40);
      const trail = trailOf(button);
      root.setTimeout(() => finish(button, selector, label, trail), 900);
    };
    const onKey = event => {
      if (event.key === 'Escape') LF.send({ t: 'record:cancel' });
    };
    root.addEventListener('pointerdown', onDown, true);
    root.addEventListener('keydown', onKey, true);
    recorder.cleanup = () => {
      root.removeEventListener('pointerdown', onDown, true);
      root.removeEventListener('keydown', onKey, true);
    };
    if (options && options.banner) {
      showBar('Close the popup the way you normally would (click its close or dismiss button). livefly will remember it.', true);
    }
  };

  popups.disarm = result => {
    disarmLocal();
    recorder.snapshot = [];
    hideBanner();
    if (result && LF.core.isTop) {
      const detail = result.closed
        ? 'Remembered. It will close automatically next time.'
        : 'Remembered the click. No popup container was detected, so only the click is replayed.';
      showBar(detail, false);
    }
    const hook = LF.core.editorHook;
    if (hook && hook.recordEnded) hook.recordEnded(result);
    if (LF.core.host) popups.rescan();
  };
})(globalThis);
