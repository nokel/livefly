(function (root) {
  const LF = root.LF;
  if (!LF || !LF.core || !LF.core.isTop) return;
  if (LF.editor && LF.editor.build === LF.BUILD) {
    LF.editor.toggle();
    return;
  }
  if (LF.editor) {
    try {
      LF.editor.close();
    } catch {
    }
    LF.editor = null;
  }
  const contentType = document.contentType;
  if (contentType && contentType !== 'text/html' && contentType !== 'application/xhtml+xml') return;

  const core = LF.core;
  const dom = LF.dom;
  const h = dom.h;

  const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  const AXES = {
    x: { size: 'width', min: 'min-width', max: 'max-width', margin: 'margin-left', margins: 'marginLeft', dim: 'width', startEdge: 'left', endEdge: 'right', cross: 'y' },
    y: { size: 'height', min: 'min-height', max: 'max-height', margin: 'margin-top', margins: 'marginTop', dim: 'height', startEdge: 'top', endEdge: 'bottom', cross: 'x' }
  };
  const NEIGHBOUR_MIN = 24;
  const SPACER_MAX = 40;
  const EDGE_GRAB = 5;
  const TREE_PAGE = 120;
  const TREE_ROWS = 1500;
  const PANEL_MIN_W = 260;
  const PANEL_MIN_H = 160;
  const CURSORS = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
  const MAX_UNDO = 100;
  const ICONS = {
    eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
    eyeOff: ['M3 3l18 18', 'M10.6 6.1A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2', 'M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 4.3-1', 'M9.9 9.9a3 3 0 0 0 4.2 4.2'],
    lock: ['M6 11h12v9H6z', 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3'],
    unlock: ['M6 11h12v9H6z', 'M8.5 11V8a3.5 3.5 0 0 1 6.8-1.2'],
    trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
    undo: ['M9 14L4 9l5-5', 'M4 9h10a6 6 0 0 1 0 12h-3'],
    redo: ['M15 14l5-5-5-5', 'M20 9H10a6 6 0 0 0 0 12h3'],
    up: ['M12 19V5', 'M5 12l7-7 7 7'],
    down: ['M12 5v14', 'M19 12l-7 7-7-7'],
    compare: ['M3 4h18v16H3z', 'M12 4v16'],
    bookmark: ['M6 3h12v18l-6-4-6 4z'],
    check: ['M5 12l5 5L20 7'],
    dock: ['M3 4h18v16H3z', 'M15 4v16'],
    outline: ['M4 4h5', 'M15 4h5', 'M4 20h5', 'M15 20h5', 'M4 4v5', 'M4 15v5', 'M20 4v5', 'M20 15v5'],
    play: ['M7 4l13 8-13 8z']
  };

  const STYLE = `
    :host { all: initial; }
    *, *::before, *::after { box-sizing: border-box; }
    .layer { position: fixed; left: 0; top: 0; right: 0; bottom: 0; pointer-events: auto; cursor: default; }
    .layer.pass { pointer-events: none; }
    .box { position: fixed; left: 0; top: 0; display: none; pointer-events: none; will-change: transform; }
    .hover { outline: 1px solid #4f9dff; background: rgba(79,157,255,.14); }
    .hot { outline: 2px solid #ffb02e; background: rgba(255,176,46,.16); }
    .ghost { outline: 1px dashed rgba(255,176,46,.85); }
    .sel { outline: 2px solid #4f9dff; }
    .sel.locked { outline-color: #ff5d6c; }
    .handle { position: absolute; left: 0; top: 0; display: none; width: 11px; height: 11px; margin: -5.5px 0 0 -5.5px; background: #fff; border: 1px solid #1b6fd1; border-radius: 3px; box-shadow: 0 0 0 1px rgba(255,255,255,.55); pointer-events: auto; }
    .tag { position: absolute; left: 0; bottom: 100%; margin-bottom: 3px; padding: 2px 6px; border-radius: 4px; background: #1b6fd1; color: #fff; font: 11px/1.3 system-ui, "Segoe UI", sans-serif; white-space: nowrap; max-width: 420px; overflow: hidden; text-overflow: ellipsis; }
    .tag.in { bottom: auto; top: 4px; left: 4px; margin: 0; }
    .flag { position: absolute; left: 12px; display: none; padding: 3px 9px; border-radius: 5px; background: #1b6fd1; color: #fff; font: 11px/1.3 system-ui, "Segoe UI", sans-serif; white-space: nowrap; max-width: 420px; overflow: hidden; text-overflow: ellipsis; pointer-events: none; box-shadow: 0 4px 14px rgba(0,0,0,.35); }
    .ui { position: fixed; pointer-events: auto; font: 12px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif; color: #e6e8ee; background: #2a2c33; border: 1px solid #43464f; box-shadow: 0 10px 34px rgba(0,0,0,.5); }
    .toolbar { top: 10px; left: 50%; transform: translateX(-50%); width: max-content; display: flex; align-items: center; gap: 2px; padding: 4px; border-radius: 10px; }
    .toolbar.free { top: 0; left: 0; }
    .sep { width: 1px; align-self: stretch; margin: 3px 4px; background: #43464f; }
    .grip, .phead, .rsz { user-select: none; -webkit-user-select: none; touch-action: none; }
    .grip { align-self: stretch; width: 14px; display: flex; align-items: center; justify-content: center; cursor: grab; color: #7d8496; border-radius: 6px; }
    .grip:hover, .phead:hover .dots { color: #e6e8ee; }
    .dots { display: block; flex: none; width: 12px; height: 15px; color: inherit; background: radial-gradient(circle, currentColor 1.1px, transparent 1.5px) 0 0 / 6px 5px; }
    .moving, .moving .grip, .moving .phead { cursor: grabbing; }
    .btn { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 8px; border-radius: 6px; cursor: pointer; color: #e6e8ee; white-space: nowrap; }
    .btn:hover { background: #3a3d47; }
    .btn.on { background: #1b6fd1; color: #fff; }
    .btn.primary { background: #2f8f5b; color: #fff; }
    .btn.primary:hover { background: #38a56a; }
    .btn.danger:hover { background: #7a2f38; }
    .btn[disabled] { opacity: .35; pointer-events: none; }
    .btn.small { height: 22px; padding: 0 6px; }
    .btn.icon { padding: 0 6px; }
    .btn.flat { background: #373a44; }
    .btn.flat:hover { background: #454957; }
    svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; flex: none; }
    .panel { top: 58px; bottom: 44px; right: 10px; width: 332px; display: flex; flex-direction: column; border-radius: 10px; overflow: hidden; }
    .panel.left { right: auto; left: 10px; }
    .panel.free { top: 0; left: 0; right: auto; bottom: auto; }
    .panel.collapsed { bottom: auto; }
    .panel.collapsed .body, .panel.collapsed .rsz { display: none; }
    .phead { display: flex; align-items: center; gap: 8px; height: 26px; padding: 0 4px 0 10px; background: #25262b; border-bottom: 1px solid #43464f; color: #7d8496; cursor: grab; flex: none; }
    .ptitle { flex: 1; color: #9aa0ae; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; }
    .rsz { position: absolute; z-index: 2; }
    .rsz.s { left: 16px; right: 16px; bottom: 0; height: 5px; cursor: ns-resize; }
    .rsz.e { top: 26px; bottom: 16px; right: 0; width: 5px; cursor: ew-resize; }
    .rsz.w { top: 26px; bottom: 16px; left: 0; width: 5px; cursor: ew-resize; }
    .rsz.se, .rsz.sw { bottom: 0; width: 16px; height: 16px; }
    .rsz.se { right: 0; cursor: nwse-resize; background: linear-gradient(135deg, transparent 52%, #7d8496 52%, #7d8496 60%, transparent 60%, transparent 72%, #7d8496 72%, #7d8496 80%, transparent 80%); }
    .rsz.sw { left: 0; cursor: nesw-resize; background: linear-gradient(225deg, transparent 52%, #7d8496 52%, #7d8496 60%, transparent 60%, transparent 72%, #7d8496 72%, #7d8496 80%, transparent 80%); }
    .tabs { display: flex; gap: 2px; padding: 4px; border-bottom: 1px solid #43464f; background: #25262b; }
    .tab { all: unset; flex: 1; text-align: center; padding: 6px 4px; border-radius: 6px; cursor: pointer; color: #9aa0ae; }
    .tab:hover { color: #e6e8ee; background: #30333b; }
    .tab.on { background: #3a3d47; color: #fff; }
    .body { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 8px 10px 12px; }
    .hint { color: #9aa0ae; padding: 10px 2px; }
    .group { margin: 12px 0 4px; padding-bottom: 3px; border-bottom: 1px solid #3a3d47; color: #9aa0ae; text-transform: uppercase; letter-spacing: .06em; font-size: 10px; }
    .row { display: flex; align-items: center; gap: 6px; margin: 4px 0; }
    .row .lbl { width: 78px; flex: none; color: #b6bbc8; }
    .row.set .lbl { color: #ffd479; }
    .row .ctl { flex: 1; display: flex; gap: 4px; align-items: center; min-width: 0; }
    input, select, textarea { all: unset; box-sizing: border-box; background: #1d1e23; border: 1px solid #43464f; border-radius: 5px; padding: 4px 6px; color: #e6e8ee; min-width: 0; }
    input[type=checkbox] { width: 14px; height: 14px; padding: 0; appearance: auto; }
    input[type=range] { padding: 0; border: 0; background: none; appearance: auto; height: 18px; }
    input[type=color] { width: 30px; height: 24px; padding: 1px; appearance: auto; cursor: pointer; flex: none; }
    input[type=number] { width: 100%; }
    input:not([type=checkbox]):not([type=range]):not([type=color]), select { flex: 1; width: 100%; }
    select { appearance: auto; }
    input:focus, select:focus, textarea:focus { border-color: #4f9dff; }
    input.bad, textarea.bad { border-color: #ff5d6c; }
    textarea { display: block; width: 100%; min-height: 110px; resize: vertical; font: 12px/1.45 ui-monospace, Consolas, "Courier New", monospace; white-space: pre; overflow: auto; }
    .seg { display: flex; flex: 1; border: 1px solid #43464f; border-radius: 6px; overflow: hidden; }
    .seg .btn { flex: 1; justify-content: center; border-radius: 0; height: 24px; }
    .actions { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0; }
    .count { color: #9aa0ae; font-size: 11px; flex: none; }
    .count.warn { color: #ff8d98; }
    .lrow { display: flex; align-items: center; gap: 2px; padding: 3px 4px; border-radius: 6px; cursor: pointer; }
    .lrow:hover { background: #343741; }
    .lrow.sel { background: #1f4a7f; }
    .lrow.off .lname { opacity: .45; text-decoration: line-through; }
    .lrow .lname { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 4px; }
    .lrow .btn { height: 22px; padding: 0 4px; }
    .lhead { display: flex; gap: 4px; align-items: center; margin: 0 0 6px; }
    .lhead input { flex: 1; }
    .tree { margin: 4px 0 0; }
    .tw { all: unset; box-sizing: border-box; width: 16px; height: 22px; display: inline-flex; align-items: center; justify-content: center; color: #9aa0ae; cursor: pointer; flex: none; font-size: 10px; }
    .tw:hover { color: #fff; }
    .tw.leaf { cursor: default; opacity: 0; pointer-events: none; }
    .lrow.node { min-height: 24px; padding: 1px 2px; }
    .lrow.dim .lname { opacity: .5; }
    .lname .nm { color: #e6e8ee; }
    .lname .ht { color: #8b92a3; margin-left: 6px; }
    .lname.renamed .nm { color: #ffd479; }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: #ffb02e; flex: none; margin: 0 4px; }
    .rename { flex: 1; }
    .more { color: #9aa0ae; padding: 4px 8px; cursor: pointer; border-radius: 6px; }
    .more:hover { color: #fff; background: #343741; }
    .seg .btn.on { background: #1b6fd1; color: #fff; }
    .pre { margin: 6px 0 0; padding: 8px; max-height: 160px; overflow: auto; white-space: pre-wrap; word-break: break-all; background: #1d1e23; border: 1px solid #3a3d47; border-radius: 6px; font: 11px/1.4 ui-monospace, Consolas, monospace; color: #b9c1d6; }
    .status { left: 50%; transform: translateX(-50%); bottom: 10px; max-width: calc(100vw - 380px); padding: 5px 12px; border-radius: 8px; color: #b6bbc8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .toast { top: 58px; left: 50%; transform: translateX(-50%); padding: 7px 14px; border-radius: 8px; background: #1b6fd1; color: #fff; display: none; max-width: 460px; }
    .toast.show { display: block; }
    .toast.warn { background: #b4352f; }
    .status, .toast, .pass-note { pointer-events: none; }
    input[type=range] { flex: 1; min-width: 0; }
    .note { margin: 6px 0; color: #9aa0ae; font-size: 11px; }
    .pass-note { top: 58px; left: 50%; transform: translateX(-50%); padding: 8px 14px; border-radius: 8px; background: #b36b00; color: #fff; display: none; }
    .pass-note.show { display: block; }
  `;

  const S = {
    active: false,
    site: LF.emptySite(),
    selEl: null,
    selRuleId: null,
    hoverEl: null,
    hoverRuleId: null,
    tab: 'props',
    drag: null,
    pending: null,
    undo: [],
    redo: [],
    lastRev: '',
    dirty: false,
    saveTimer: 0,
    compare: false,
    outlines: true,
    passthrough: false,
    layout: LF.normalizeLayout(null),
    moving: null,
    collapsed: false,
    matches: new Map(),
    lastPointer: { x: -1, y: -1 },
    childTrail: [],
    coalesce: '',
    coalesceTimer: 0,
    swallow: new Set(),
    raf: 0,
    tick: 0,
    toastTimer: 0,
    cssTimer: 0,
    expanded: new Set(),
    layerMode: 'all',
    layerQuery: '',
    renaming: false,
    hoverLock: false,
    nameMap: new WeakMap(),
    limits: new Map(),
    freeHinted: false,
    scrollToSel: false,
    renameCancel: false
  };

  const ui = { fields: [], pool: [], handles: [] };

  const deepCopy = value => JSON.parse(JSON.stringify(value));
  const round = (value, places) => {
    const factor = Math.pow(10, places === undefined ? 1 : places);
    return Math.round(value * factor) / factor;
  };
  const toPlain = rect => ({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
  const inRect = (point, rect) => point.x >= rect.left && point.x <= rect.left + rect.width && point.y >= rect.top && point.y <= rect.top + rect.height;

  const icon = name => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    for (const path of ICONS[name] || []) {
      const node = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      node.setAttribute('d', path);
      svg.append(node);
    }
    return svg;
  };

  const button = (options, ...children) =>
    h('button', Object.assign({ type: 'button', class: 'btn' }, options), ...children);

  const toast = (text, warn) => {
    if (!ui.toast) return;
    ui.toast.textContent = text;
    ui.toast.classList.toggle('warn', Boolean(warn));
    ui.toast.classList.add('show');
    root.clearTimeout(S.toastTimer);
    S.toastTimer = root.setTimeout(() => ui.toast.classList.remove('show'), 2800);
  };

  const ruleById = id => S.site.rules.find(rule => rule.id === id) || null;
  const currentRule = () => (S.selRuleId ? ruleById(S.selRuleId) : null);
  const inScope = rule => !rule.page || rule.page === location.pathname;

  const ruleFor = element => {
    let found = null;
    for (const rule of S.site.rules) {
      if (!inScope(rule) || !dom.matchesSafe(element, rule.sel)) continue;
      if (!found) found = rule;
      if (dom.qs(rule.sel) === element && dom.countMatches(rule.sel) === 1) return rule;
    }
    return found;
  };

  const prunedRules = () => S.site.rules.filter(rule => Object.keys(rule.d).length > 0);

  const selectorCache = new WeakMap();
  const cachedSelector = element => {
    let value = selectorCache.get(element);
    if (value === undefined) {
      value = dom.selectorFor(element).sel;
      selectorCache.set(element, value);
    }
    return value;
  };

  const rebuildNames = () => {
    const next = new WeakMap();
    for (const entry of S.site.names) {
      const element = dom.qs(entry.sel);
      if (element) next.set(element, entry.name);
    }
    S.nameMap = next;
  };

  const layerName = element => S.nameMap.get(element) || dom.cssName(element);

  const isRenamed = element => S.nameMap.has(element);

  const snapshot = () => JSON.stringify({ rules: S.site.rules, names: S.site.names, css: S.site.css, forceImportant: S.site.forceImportant });

  const pushUndo = () => {
    S.undo.push(snapshot());
    if (S.undo.length > MAX_UNDO) S.undo.shift();
    S.redo.length = 0;
  };

  const restore = json => {
    const data = JSON.parse(json);
    S.site.rules = data.rules;
    S.site.names = data.names || [];
    S.site.css = data.css;
    S.site.forceImportant = data.forceImportant;
    LF.prepareCss(S.site);
    rebuildNames();
  };

  const renderPage = () => {
    const site = S.compare ? Object.assign({}, S.site, { enabled: false }) : S.site;
    LF.prepareCss(site);
    core.renderSite = site;
    return core.sync();
  };

  const settle = async () => {
    await core.sync();
    await new Promise(resolve => root.requestAnimationFrame(() => root.requestAnimationFrame(resolve)));
  };

  const flushSave = async () => {
    root.clearTimeout(S.saveTimer);
    S.saveTimer = 0;
    if (!S.dirty) return;
    S.dirty = false;
    LF.prepareCss(S.site);
    const response = await LF.patch(core.host, {
      set: {
        rules: prunedRules(),
        names: S.site.names,
        css: S.site.css,
        cssC: S.site.cssC,
        cssSrc: S.site.cssSrc,
        forceImportant: S.site.forceImportant
      }
    });
    if (response && response.rev) S.lastRev = response.rev;
  };

  const scheduleSave = () => {
    S.dirty = true;
    root.clearTimeout(S.saveTimer);
    S.saveTimer = root.setTimeout(flushSave, 250);
  };

  const refreshMatches = () => {
    const next = new Map();
    for (const rule of S.site.rules) next.set(rule.id, dom.qsa(rule.sel).slice(0, 40));
    S.matches = next;
  };

  const afterChange = () => {
    renderPage();
    scheduleSave();
    refreshMatches();
    refreshUI();
  };

  const edit = (fn, coalesce) => {
    const rule = ensureRule();
    if (!rule) return false;
    if (rule.locked) {
      toast('This layer is locked', true);
      return false;
    }
    if (!(coalesce && S.coalesce === coalesce)) pushUndo();
    S.coalesce = coalesce || '';
    root.clearTimeout(S.coalesceTimer);
    S.coalesceTimer = root.setTimeout(() => {
      S.coalesce = '';
    }, 800);
    fn(rule, S.selEl);
    afterChange();
    return true;
  };

  const mutateRule = (rule, fn) => {
    pushUndo();
    fn(rule);
    afterChange();
  };

  const ensureRule = () => {
    const existing = currentRule();
    if (existing) return existing;
    const element = S.selEl;
    if (!element) return null;
    const rule = newRule(element);
    S.site.rules.unshift(rule);
    S.selRuleId = rule.id;
    return rule;
  };

  const newRule = element => ({
    id: LF.uid('r'),
    name: layerName(element),
    sel: dom.selectorFor(element).sel,
    on: true,
    locked: false,
    page: '',
    d: {},
    created: Date.now()
  });

  const ruleForElement = element => {
    if (element === S.selEl) {
      const own = currentRule();
      if (own) return own;
    }
    const found = S.site.rules.find(rule => inScope(rule) && dom.qs(rule.sel) === element && dom.countMatches(rule.sel) === 1);
    if (found) return found;
    const rule = newRule(element);
    S.site.rules.unshift(rule);
    if (element === S.selEl) S.selRuleId = rule.id;
    return rule;
  };

  const setLayerName = (element, value) => {
    const name = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const selector = dom.selectorFor(element).sel;
    const natural = dom.cssName(element);
    pushUndo();
    S.site.names = S.site.names.filter(entry => entry.sel !== selector);
    if (name && name !== natural) S.site.names.push({ sel: selector, name });
    const rule = S.site.rules.find(item => item.sel === selector);
    if (rule) rule.name = name || natural;
    rebuildNames();
    scheduleSave();
    refreshUI();
  };

  const reveal = element => {
    for (let node = element.parentElement; node; node = node.parentElement) S.expanded.add(node);
    S.scrollToSel = true;
  };

  const select = (element, keepTrail) => {
    if (!keepTrail) S.childTrail = [];
    S.selEl = element;
    const rule = element ? ruleFor(element) : null;
    S.selRuleId = rule ? rule.id : null;
    if (element) reveal(element);
    refreshUI();
  };

  const scrollToElement = element => {
    const rect = element.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > root.innerHeight) element.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const selectRule = rule => {
    const element = dom.qs(rule.sel);
    S.childTrail = [];
    S.selEl = element;
    S.selRuleId = rule.id;
    if (element) {
      reveal(element);
      scrollToElement(element);
    }
    refreshUI();
  };

  const deselect = () => {
    S.selEl = null;
    S.selRuleId = null;
    S.childTrail = [];
    refreshUI();
  };

  const selectParent = () => {
    const element = S.selEl;
    if (!element || !element.parentElement) return;
    S.childTrail.push(element);
    select(element.parentElement, true);
  };

  const selectChild = () => {
    const element = S.selEl;
    if (!element) return;
    let next = S.childTrail.pop();
    if (!next || !element.contains(next) || next === element) {
      next = Array.from(element.children).find(child => child.getBoundingClientRect().width > 0) || null;
    }
    if (next) select(dom.topSvg(next), true);
  };

  const readTranslate = (rule, element) => {
    const source = rule && rule.d.translate ? rule.d.translate : element ? getComputedStyle(element).translate : 'none';
    if (!source || source === 'none' || source.includes('%')) return { x: 0, y: 0 };
    const parts = source.split(/\s+/).map(part => Number.parseFloat(part));
    return { x: Number.isFinite(parts[0]) ? parts[0] : 0, y: Number.isFinite(parts[1]) ? parts[1] : 0 };
  };

  const setTranslate = (rule, x, y) => {
    const px = round(x);
    const py = round(y);
    if (px === 0 && py === 0) delete rule.d.translate;
    else rule.d.translate = px + 'px ' + py + 'px';
  };

  const REPLACED = /^(img|video|canvas|svg|iframe|embed|object|audio|picture)$/;

  const makeTransformable = (rule, element) => {
    if (!element || REPLACED.test(element.localName) || rule.d.display) return;
    if (getComputedStyle(element).display === 'inline') {
      rule.d.display = 'inline-block';
      toast('Switched this inline element to inline-block so it can move and resize');
    }
  };

  const plainTransform = (style, rule) => {
    if (rule && (rule.d.rotate || rule.d.scale)) return false;
    if (style.rotate !== 'none' && !/^0(deg)?$/.test(style.rotate)) return false;
    if (style.scale !== 'none' && style.scale !== '1') return false;
    if (style.transform === 'none') return true;
    const match = /^matrix\(([^)]+)\)$/.exec(style.transform);
    if (!match) return false;
    const [a, b, c, d] = match[1].split(',').map(Number);
    return Math.abs(a - 1) < 0.001 && Math.abs(d - 1) < 0.001 && Math.abs(b) < 0.001 && Math.abs(c) < 0.001;
  };

  const visibilityMode = rule => {
    if (!rule) return 'show';
    if (rule.d.display === 'none') return 'hide';
    if (/hidden|collapse/.test(rule.d.visibility || '')) return 'ghost';
    return 'show';
  };

  const setVisibility = mode => {
    if (mode !== 'show' && S.selEl && (S.selEl === document.documentElement || S.selEl === document.body)) {
      toast('Hiding the whole page is not allowed', true);
      return;
    }
    edit(rule => {
      if (rule.d.display === 'none') delete rule.d.display;
      delete rule.d.visibility;
      if (mode === 'hide') rule.d.display = 'none';
      else if (mode === 'ghost') rule.d.visibility = 'hidden';
    });
  };

  const toggleHide = () => {
    if (!S.selEl && !currentRule()) return;
    setVisibility(visibilityMode(currentRule()) === 'show' ? 'hide' : 'show');
  };

  const undo = () => {
    if (!S.undo.length) return;
    S.redo.push(snapshot());
    restore(S.undo.pop());
    afterRestore();
  };

  const redo = () => {
    if (!S.redo.length) return;
    S.undo.push(snapshot());
    restore(S.redo.pop());
    afterRestore();
  };

  const afterRestore = () => {
    if (S.selRuleId && !ruleById(S.selRuleId)) S.selRuleId = null;
    if (!S.selRuleId && S.selEl) {
      const rule = ruleFor(S.selEl);
      S.selRuleId = rule ? rule.id : null;
    }
    afterChange();
  };

  const deleteRule = rule => {
    pushUndo();
    S.site.rules = S.site.rules.filter(item => item !== rule);
    if (S.selRuleId === rule.id) S.selRuleId = null;
    if (S.selEl) {
      const next = ruleFor(S.selEl);
      S.selRuleId = next ? next.id : null;
    }
    afterChange();
  };

  const cssField = (prop, label, options) => {
    const opts = options || {};
    return {
      id: prop,
      label,
      type: opts.type || 'text',
      options: opts.options,
      unit: opts.unit || '',
      min: opts.min,
      max: opts.max,
      step: opts.step,
      scale: opts.scale || 1,
      neutral: opts.neutral,
      read(rule, element) {
        if (rule && prop in rule.d) return { raw: rule.d[prop], set: true };
        return { raw: element ? getComputedStyle(element).getPropertyValue(prop) : '', set: false };
      },
      write(rule, element, raw) {
        if (raw === '') delete rule.d[prop];
        else rule.d[prop] = raw;
      },
      clear(rule) {
        delete rule.d[prop];
      }
    };
  };

  const translateField = (axis, label) => ({
    id: 'translate-' + axis,
    label,
    type: 'num',
    custom: true,
    unit: 'px',
    scale: 1,
    step: 1,
    read: (rule, element) => ({ raw: String(readTranslate(rule, element)[axis]), set: Boolean(rule && rule.d.translate) }),
    write(rule, element, raw) {
      const current = readTranslate(rule, element);
      current[axis] = raw === '' ? 0 : Number(raw);
      makeTransformable(rule, element);
      setTranslate(rule, current.x, current.y);
    },
    clear(rule) {
      delete rule.d.translate;
    }
  });

  const sizeField = (prop, label, measure) => ({
    id: prop,
    label,
    type: 'num',
    custom: true,
    unit: 'px',
    scale: 1,
    step: 1,
    min: 0,
    read(rule, element) {
      if (rule && rule.d[prop]) return { raw: rule.d[prop], set: true };
      if (!element) return { raw: '', set: false };
      const rect = element.getBoundingClientRect();
      const scale = dom.ancestorScale(element);
      return { raw: String(measure === 'w' ? rect.width / scale.x : rect.height / scale.y), set: false };
    },
    write(rule, element, raw) {
      if (raw === '') {
        delete rule.d[prop];
        if (!rule.d.width && !rule.d.height) delete rule.d['box-sizing'];
        return;
      }
      makeTransformable(rule, element);
      rule.d[prop] = Number(raw) + 'px';
      rule.d['box-sizing'] = 'border-box';
    },
    clear(rule) {
      delete rule.d[prop];
      if (!rule.d.width && !rule.d.height) delete rule.d['box-sizing'];
    }
  });

  const FONT_WEIGHTS = ['', '100', '200', '300', '400', '500', '600', '700', '800', '900'];

  const FIELD_GROUPS = [
    ['Transform', [
      translateField('x', 'X'),
      translateField('y', 'Y'),
      cssField('rotate', 'Rotate', { type: 'num', unit: 'deg', neutral: 0, step: 1 }),
      cssField('scale', 'Scale %', { type: 'num', scale: 100, neutral: 100, step: 1, min: 1 })
    ]],
    ['Size', [sizeField('width', 'Width', 'w'), sizeField('height', 'Height', 'h')]],
    ['Appearance', [
      cssField('opacity', 'Opacity', { type: 'range', scale: 100, neutral: 100, min: 0, max: 100, step: 1 }),
      cssField('background-color', 'Background', { type: 'color' }),
      cssField('color', 'Text color', { type: 'color' }),
      cssField('border-radius', 'Radius', { type: 'num', unit: 'px', min: 0, step: 1 }),
      cssField('border', 'Border', { type: 'text' }),
      cssField('box-shadow', 'Shadow', { type: 'text' })
    ]],
    ['Text', [
      cssField('font-size', 'Font size', { type: 'num', unit: 'px', min: 1, step: 1 }),
      cssField('font-weight', 'Weight', { type: 'select', options: FONT_WEIGHTS }),
      cssField('text-align', 'Align', { type: 'select', options: ['', 'left', 'center', 'right', 'justify'] }),
      cssField('line-height', 'Line height', { type: 'text' }),
      cssField('letter-spacing', 'Spacing', { type: 'num', unit: 'px', step: 0.5 })
    ]],
    ['Spacing', [
      cssField('margin', 'Margin', { type: 'text' }),
      cssField('padding', 'Padding', { type: 'text' })
    ]],
    ['Stacking', [
      cssField('z-index', 'Z-index', { type: 'num', step: 1 }),
      cssField('position', 'Position', { type: 'select', options: ['', 'static', 'relative', 'absolute', 'fixed', 'sticky'] })
    ]]
  ];

  const numberOf = (raw, def) => {
    const value = Number.parseFloat(raw);
    if (Number.isFinite(value)) return round(value * def.scale, 2);
    return def.neutral !== undefined ? def.neutral : '';
  };

  const applyField = (entry, raw) => {
    const def = entry.def;
    const key = 'f:' + def.id;
    if (def.type === 'num' || def.type === 'range') {
      if (raw === '') {
        edit(rule => def.clear(rule), key);
        return;
      }
      const number = Number(raw);
      if (!Number.isFinite(number)) return;
      edit((rule, element) => {
        if (def.custom) def.write(rule, element, raw);
        else def.write(rule, element, round(number / def.scale, 4) + def.unit);
      }, key);
      return;
    }
    if (raw !== '' && !LF.isSafeValue(raw)) {
      entry.input.classList.add('bad');
      toast('That value is not allowed', true);
      return;
    }
    if (raw !== '' && !CSS.supports(def.id, raw)) {
      entry.input.classList.add('bad');
      return;
    }
    entry.input.classList.remove('bad');
    edit((rule, element) => def.write(rule, element, raw), key);
  };

  const makeField = def => {
    const entry = { def };
    let control;
    if (def.type === 'select') {
      entry.input = h('select', { onchange: () => applyField(entry, entry.input.value) },
        def.options.map(option => h('option', { value: option, text: option === '' ? '—' : option })));
      control = [entry.input];
    } else if (def.type === 'color') {
      entry.swatch = h('input', { type: 'color', oninput: () => applyField(entry, entry.swatch.value) });
      entry.input = h('input', { type: 'text', spellcheck: 'false', onchange: () => applyField(entry, entry.input.value.trim()) });
      control = [entry.swatch, entry.input];
    } else if (def.type === 'range') {
      entry.range = h('input', {
        type: 'range', min: def.min, max: def.max, step: def.step,
        oninput: () => {
          entry.input.value = entry.range.value;
          applyField(entry, entry.range.value);
        }
      });
      entry.input = h('input', {
        type: 'number', min: def.min, max: def.max, step: def.step,
        oninput: () => {
          if (entry.input.value !== '') entry.range.value = entry.input.value;
          applyField(entry, entry.input.value);
        }
      });
      entry.input.style.maxWidth = '62px';
      control = [entry.range, entry.input];
    } else if (def.type === 'num') {
      entry.input = h('input', {
        type: 'number', min: def.min, max: def.max, step: def.step,
        oninput: () => applyField(entry, entry.input.value)
      });
      control = [entry.input];
    } else {
      entry.input = h('input', { type: 'text', spellcheck: 'false', onchange: () => applyField(entry, entry.input.value.trim()) });
      control = [entry.input];
    }
    const reset = button({
      class: 'btn small icon flat', title: 'Reset this property',
      onclick: () => {
        edit(rule => def.clear(rule));
      }
    }, '×');
    entry.row = h('div', { class: 'row' }, h('span', { class: 'lbl', text: def.label }), h('div', { class: 'ctl' }, control, reset));
    ui.fields.push(entry);
    return entry.row;
  };

  const refreshField = entry => {
    const active = ui.shadow.activeElement;
    if (active && (active === entry.input || active === entry.swatch || active === entry.range)) return;
    const def = entry.def;
    const rule = currentRule();
    const result = def.read(rule, S.selEl);
    entry.row.classList.toggle('set', result.set);
    if (def.type === 'select') {
      entry.input.value = result.raw;
      if (entry.input.value !== result.raw) entry.input.value = '';
    } else if (def.type === 'color') {
      entry.input.value = result.raw;
      entry.swatch.value = dom.toHex(result.raw);
    } else if (def.type === 'range') {
      const number = numberOf(result.raw, def);
      entry.input.value = number === '' ? '' : String(number);
      entry.range.value = number === '' ? String(def.max) : String(number);
    } else if (def.type === 'num') {
      const number = numberOf(result.raw, def);
      entry.input.value = number === '' ? '' : String(number);
    } else {
      entry.input.value = result.set ? result.raw : '';
      entry.input.placeholder = result.set ? '' : result.raw;
    }
  };

  const refreshFields = () => {
    for (const entry of ui.fields) refreshField(entry);
  };

  const buildProps = () => {
    const wrap = h('div');
    ui.propsEmpty = h('div', {
      class: 'hint',
      text: 'Click any part of the page to select it. Drag it to move, drag the square handles to resize. Use [ and ] to select the parent or child.'
    });
    ui.nameInput = h('input', {
      type: 'text', spellcheck: 'false',
      onchange: () => {
        if (S.selEl) setLayerName(S.selEl, ui.nameInput.value);
      }
    });
    ui.selInput = h('input', { type: 'text', spellcheck: 'false', onchange: () => applySelectorInput() });
    ui.selCount = h('span', { class: 'count' });
    ui.visSeg = h('div', { class: 'seg' },
      ['show', 'hide', 'ghost'].map(mode =>
        button({ 'data-mode': mode, onclick: () => setVisibility(mode), title: { show: 'Visible', hide: 'Hidden (collapses layout)', ghost: 'Hidden (keeps its space)' }[mode] },
          { show: 'Show', hide: 'Hide', ghost: 'Hide, keep space' }[mode])));
    ui.layerCss = h('textarea', {
      spellcheck: 'false',
      onchange: () => {
        const rule = currentRule();
        if (!rule) return;
        const parsed = LF.parseDeclarations(ui.layerCss.value);
        mutateRule(rule, item => { item.d = parsed; });
      }
    });
    ui.enabledBox = h('input', { type: 'checkbox', onchange: () => { const rule = currentRule(); if (rule) mutateRule(rule, item => { item.on = ui.enabledBox.checked; }); } });
    ui.lockedBox = h('input', { type: 'checkbox', onchange: () => { const rule = currentRule(); if (rule) mutateRule(rule, item => { item.locked = ui.lockedBox.checked; }); } });
    ui.scopeSelect = h('select', {
      onchange: () => {
        const rule = currentRule();
        if (rule) mutateRule(rule, item => { item.page = ui.scopeSelect.value === 'page' ? location.pathname : ''; });
      }
    }, h('option', { value: 'site', text: 'Whole site' }), h('option', { value: 'page', text: 'This page only' }));

    ui.propsForm = h('div', null,
      h('div', { class: 'row' }, h('span', { class: 'lbl', text: 'Layer' }), h('div', { class: 'ctl' }, ui.nameInput)),
      h('div', { class: 'row' }, h('span', { class: 'lbl', text: 'Selector' }), h('div', { class: 'ctl' }, ui.selInput)),
      h('div', { class: 'row' }, h('span', { class: 'lbl' }), h('div', { class: 'ctl' }, ui.selCount)),
      h('div', { class: 'actions' },
        button({ class: 'btn small flat', title: 'Match only this element', onclick: () => useSelector('specific') }, 'This one'),
        button({ class: 'btn small flat', title: 'Match all similar elements', onclick: () => useSelector('similar') }, 'All similar'),
        button({ class: 'btn small flat', title: 'Select parent  [', onclick: selectParent }, icon('up'), 'Parent'),
        button({ class: 'btn small flat', title: 'Select child  ]', onclick: selectChild }, icon('down'), 'Child')),
      h('div', { class: 'group', text: 'Visibility' }),
      h('div', { class: 'row' }, ui.visSeg),
      FIELD_GROUPS.map(([title, defs]) => [h('div', { class: 'group', text: title }), defs.map(makeField)]),
      h('div', { class: 'group', text: 'Layer CSS' }),
      ui.layerCss,
      h('div', { class: 'note', text: 'One declaration per line. Every value is applied with !important so the page cannot override it.' }),
      h('div', { class: 'group', text: 'Layer' }),
      h('div', { class: 'row' }, h('span', { class: 'lbl', text: 'Applies to' }), h('div', { class: 'ctl' }, ui.scopeSelect)),
      h('div', { class: 'row' }, h('span', { class: 'lbl', text: 'Enabled' }), h('div', { class: 'ctl' }, ui.enabledBox)),
      h('div', { class: 'row' }, h('span', { class: 'lbl', text: 'Locked' }), h('div', { class: 'ctl' }, ui.lockedBox)),
      h('div', { class: 'actions' },
        button({ class: 'btn flat danger', title: 'Remove every edit on this layer', onclick: () => { const rule = currentRule(); if (rule) deleteRule(rule); } }, icon('trash'), 'Reset this element')));
    wrap.append(ui.propsEmpty, ui.propsForm);
    return wrap;
  };

  const applySelectorInput = () => {
    const rule = currentRule();
    if (!rule) return;
    const value = LF.normalizeSelector(ui.selInput.value);
    if (!dom.isValidSelector(value)) {
      ui.selInput.classList.add('bad');
      return;
    }
    ui.selInput.classList.remove('bad');
    mutateRule(rule, item => { item.sel = value; });
    if (S.selEl && !dom.matchesSafe(S.selEl, value)) S.selEl = dom.qs(value);
  };

  const useSelector = kind => {
    if (!S.selEl) return;
    const value = kind === 'similar' ? dom.similarSelectorFor(S.selEl) : dom.selectorFor(S.selEl).sel;
    const rule = ensureRule();
    mutateRule(rule, item => { item.sel = value; });
  };

  const refreshProps = () => {
    const rule = currentRule();
    const has = Boolean(rule || S.selEl);
    ui.propsEmpty.style.display = has ? 'none' : 'block';
    ui.propsForm.style.display = has ? 'block' : 'none';
    if (!has) return;
    const active = ui.shadow.activeElement;
    const selector = rule ? rule.sel : S.selEl ? cachedSelector(S.selEl) : '';
    if (active !== ui.nameInput) ui.nameInput.value = S.selEl ? layerName(S.selEl) : rule ? rule.name : '';
    if (active !== ui.selInput) {
      ui.selInput.value = selector;
      ui.selInput.classList.remove('bad');
    }
    const count = selector ? dom.countMatches(selector) : 0;
    ui.selCount.textContent = count === 0 ? 'Matches nothing on this page' : count === 1 ? 'Matches 1 element' : 'Matches ' + count + ' elements';
    ui.selCount.classList.toggle('warn', count !== 1);
    const mode = visibilityMode(rule);
    for (const node of ui.visSeg.children) node.classList.toggle('on', node.dataset.mode === mode);
    if (active !== ui.layerCss) ui.layerCss.value = rule ? LF.stringifyDeclarations(rule.d) : '';
    ui.enabledBox.checked = rule ? rule.on !== false : true;
    ui.lockedBox.checked = rule ? rule.locked === true : false;
    ui.scopeSelect.value = rule && rule.page ? 'page' : 'site';
    refreshFields();
  };

  const buildLayers = () => {
    ui.layerList = h('div', { class: 'tree' });
    ui.compareBtn = button({ class: 'btn flat', onclick: toggleCompare, title: 'Temporarily show the original page' }, icon('compare'), 'Compare with original');
    ui.layerSearch = h('input', {
      type: 'text',
      spellcheck: 'false',
      placeholder: 'Search layers by name, class or id',
      oninput: () => {
        S.layerQuery = ui.layerSearch.value.trim().toLowerCase();
        renderLayers();
      }
    });
    ui.modeSeg = h('div', { class: 'seg' },
      ['all', 'edited'].map(mode =>
        button({
          'data-mode': mode,
          onclick: () => {
            S.layerMode = mode;
            renderLayers();
          }
        }, mode === 'all' ? 'All layers' : 'Edited only')));
    return h('div', null,
      h('div', { class: 'actions' }, ui.compareBtn),
      h('div', { class: 'lhead' }, ui.layerSearch),
      h('div', { class: 'row' }, ui.modeSeg),
      ui.layerList);
  };

  const ruleIndex = () => {
    const map = new Map();
    for (const rule of S.site.rules) {
      if (!Object.keys(rule.d).length) continue;
      for (const element of S.matches.get(rule.id) || []) {
        if (!map.has(element)) map.set(element, rule);
      }
    }
    return map;
  };

  const startRename = (element, label) => {
    S.renaming = true;
    S.renameCancel = false;
    const input = h('input', { type: 'text', class: 'rename', spellcheck: 'false', value: layerName(element) });
    const finish = () => {
      if (!S.renaming) return;
      S.renaming = false;
      const cancelled = S.renameCancel;
      S.renameCancel = false;
      if (cancelled) renderLayers();
      else setLayerName(element, input.value);
    };
    input.addEventListener('blur', finish);
    label.replaceWith(input);
    input.focus();
    input.select();
  };

  const treeRow = (element, depth, context, flat) => {
    const kids = flat ? [] : dom.layerChildren(element);
    const expanded = S.expanded.has(element);
    const rule = context.ruleOf.get(element) || null;
    const hidden = Boolean(rule) && visibilityMode(rule) !== 'show';
    const style = getComputedStyle(element);
    const dim = style.display === 'none' || style.visibility === 'hidden';
    const hint = dom.hintFor(element);
    const twisty = h('button', {
      type: 'button',
      class: 'tw' + (kids.length ? '' : ' leaf'),
      title: expanded ? 'Collapse' : 'Expand',
      text: expanded ? '▾' : '▸',
      onclick: event => {
        event.stopPropagation();
        if (S.expanded.has(element)) S.expanded.delete(element);
        else S.expanded.add(element);
        renderLayers();
      }
    });
    const label = h('span', {
      class: 'lname' + (isRenamed(element) ? ' renamed' : ''),
      title: dom.cssName(element) + (hint ? '   ' + hint : '') + '\nDouble-click to rename',
      ondblclick: event => {
        event.stopPropagation();
        startRename(element, label);
      }
    }, h('span', { class: 'nm', text: layerName(element) }), hint ? h('span', { class: 'ht', text: hint }) : null);
    const row = h('div', {
      class: 'lrow node' + (element === S.selEl ? ' sel' : '') + (dim ? ' dim' : ''),
      onclick: () => {
        select(element);
        scrollToElement(element);
      },
      onpointerenter: () => {
        S.hoverEl = element;
        S.hoverLock = true;
      },
      onpointerleave: () => {
        S.hoverEl = null;
        S.hoverLock = false;
      }
    },
      twisty,
      button({
        class: 'btn small icon',
        title: hidden ? 'Show this layer' : 'Hide this layer',
        onclick: event => {
          event.stopPropagation();
          select(element);
          toggleHide();
        }
      }, icon(hidden ? 'eyeOff' : 'eye')),
      label,
      rule ? h('span', { class: 'dot', title: 'Edited' }) : null);
    row.style.paddingLeft = Math.min(depth, 14) * 10 + 2 + 'px';
    return row;
  };

  const moreRow = (element, remaining, depth) => {
    const row = h('div', {
      class: 'more',
      text: 'Show ' + Math.min(remaining, TREE_PAGE) + ' more of ' + remaining + ' …',
      onclick: () => {
        S.limits.set(element, (S.limits.get(element) || TREE_PAGE) + TREE_PAGE);
        renderLayers();
      }
    });
    row.style.marginLeft = Math.min(depth, 14) * 10 + 18 + 'px';
    return row;
  };

  const renderEdited = () => {
    const rules = S.site.rules.filter(rule => Object.keys(rule.d).length > 0 || rule.id === S.selRuleId);
    if (!rules.length) {
      ui.layerList.append(h('div', { class: 'hint', text: 'No edited elements yet. Select something on the page and change it.' }));
      return;
    }
    for (const rule of rules) {
      const hidden = visibilityMode(rule) !== 'show';
      const matches = S.matches.get(rule.id) || [];
      const countText = matches.length >= 40 ? '40+' : String(matches.length);
      const first = matches[0];
      const label = first ? layerName(first) : rule.name || rule.sel;
      const row = h('div', {
        class: 'lrow' + (rule.id === S.selRuleId ? ' sel' : '') + (rule.on === false ? ' off' : ''),
        title: rule.sel + (rule.page ? '  (only on ' + rule.page + ')' : ''),
        onclick: () => selectRule(rule),
        onpointerenter: () => { S.hoverRuleId = rule.id; },
        onpointerleave: () => { S.hoverRuleId = null; }
      },
        button({
          class: 'btn small icon', title: hidden ? 'Show element' : 'Hide element',
          onclick: event => {
            event.stopPropagation();
            S.selRuleId = rule.id;
            S.selEl = dom.qs(rule.sel);
            toggleHide();
          }
        }, icon(hidden ? 'eyeOff' : 'eye')),
        h('span', { class: 'lname', text: (rule.page && rule.page !== location.pathname ? '• ' : '') + label }),
        h('span', { class: 'count' + (matches.length === 0 ? ' warn' : ''), text: countText }),
        button({
          class: 'btn small icon', title: rule.locked ? 'Unlock' : 'Lock',
          onclick: event => {
            event.stopPropagation();
            mutateRule(rule, item => { item.locked = !item.locked; });
          }
        }, icon(rule.locked ? 'lock' : 'unlock')),
        button({
          class: 'btn small icon danger', title: 'Delete layer',
          onclick: event => {
            event.stopPropagation();
            deleteRule(rule);
          }
        }, icon('trash')));
      ui.layerList.append(row);
    }
  };

  const renderSearch = context => {
    const query = S.layerQuery;
    let found = 0;
    if (document.body) {
      const all = [document.body, ...document.body.querySelectorAll('*')];
      for (const element of all) {
        if (!dom.isLayer(element)) continue;
        const text = (layerName(element) + ' ' + dom.cssName(element) + ' ' + dom.hintFor(element)).toLowerCase();
        if (!text.includes(query)) continue;
        ui.layerList.append(treeRow(element, 0, context, true));
        if (++found >= 150) break;
      }
    }
    if (!found) ui.layerList.append(h('div', { class: 'hint', text: 'No layer matches.' }));
  };

  const renderLayers = () => {
    if (S.renaming || !ui.layerList) return;
    for (const node of ui.modeSeg.children) node.classList.toggle('on', node.dataset.mode === S.layerMode);
    ui.layerList.textContent = '';
    if (S.layerMode === 'edited') {
      renderEdited();
      return;
    }
    const context = { ruleOf: ruleIndex() };
    if (S.layerQuery) {
      renderSearch(context);
      return;
    }
    const budget = { left: TREE_ROWS };
    const walk = (element, depth) => {
      if (budget.left <= 0) return;
      budget.left--;
      ui.layerList.append(treeRow(element, depth, context, false));
      if (!S.expanded.has(element)) return;
      const kids = dom.layerChildren(element);
      const limit = S.limits.get(element) || TREE_PAGE;
      for (const kid of kids.slice(0, limit)) walk(kid, depth + 1);
      if (kids.length > limit) ui.layerList.append(moreRow(element, kids.length - limit, depth + 1));
    };
    if (document.body) walk(document.body, 0);
    if (budget.left <= 0) ui.layerList.append(h('div', { class: 'hint', text: 'Collapse some layers or use the search box to see the rest.' }));
    if (S.scrollToSel) {
      S.scrollToSel = false;
      const selected = ui.layerList.querySelector('.lrow.sel');
      if (selected) selected.scrollIntoView({ block: 'nearest' });
    }
  };

  const buildCss = () => {
    ui.cssArea = h('textarea', {
      spellcheck: 'false',
      placeholder: '.promo-banner { display: none; }\nbody { font-family: Georgia, serif; }',
      oninput: () => {
        const value = ui.cssArea.value;
        root.clearTimeout(S.cssTimer);
        S.cssTimer = root.setTimeout(() => {
          if (!(S.coalesce === 'css')) pushUndo();
          S.coalesce = 'css';
          root.clearTimeout(S.coalesceTimer);
          S.coalesceTimer = root.setTimeout(() => { S.coalesce = ''; }, 800);
          S.site.css = value;
          afterChange();
        }, 250);
      }
    });
    ui.forceBox = h('input', {
      type: 'checkbox',
      onchange: () => {
        pushUndo();
        S.site.forceImportant = ui.forceBox.checked;
        S.site.cssSrc = '';
        afterChange();
      }
    });
    ui.cssInfo = h('div', { class: 'note' });
    ui.generated = h('pre', { class: 'pre' });
    return h('div', null,
      h('div', { class: 'group', text: 'Custom CSS for this site' }),
      ui.cssArea,
      ui.cssInfo,
      h('div', { class: 'row' }, h('span', { class: 'lbl', text: 'Force !important' }), h('div', { class: 'ctl' }, ui.forceBox)),
      h('div', { class: 'note', text: 'Applied to every page on this site as a stylesheet the page cannot see or remove. Forcing !important makes your rules win over the site’s own styles.' }),
      h('div', { class: 'group', text: 'Generated from layers' }),
      ui.generated);
  };

  const refreshCss = () => {
    if (ui.shadow.activeElement !== ui.cssArea) ui.cssArea.value = S.site.css;
    ui.forceBox.checked = S.site.forceImportant !== false;
    let ruleCount = 0;
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(S.site.css);
      ruleCount = sheet.cssRules.length;
    } catch {
      ruleCount = 0;
    }
    ui.cssInfo.textContent = S.site.css.trim() ? ruleCount + ' rule' + (ruleCount === 1 ? '' : 's') + ' parsed' : '';
    const layers = LF.compile(Object.assign({}, S.site, { css: '', cssC: '', popups: [] }), { top: true, path: location.pathname });
    ui.generated.textContent = layers.join('\n') || 'Nothing yet.';
  };

  const buildPopups = () => {
    ui.popupList = h('div');
    ui.popupsBox = h('input', {
      type: 'checkbox',
      onchange: () => LF.patch(core.host, { set: { popupsEnabled: ui.popupsBox.checked } })
    });
    return h('div', null,
      h('div', { class: 'note', text: 'Open the popup you want gone, press Remember state, then click its close or dismiss button exactly as you normally would. livefly replays that click automatically whenever the popup shows up again.' }),
      h('div', { class: 'actions' }, button({ class: 'btn primary', onclick: startRecord }, icon('bookmark'), 'Remember state')),
      h('div', { class: 'row' }, h('span', { class: 'lbl', text: 'Auto-close' }), h('div', { class: 'ctl' }, ui.popupsBox)),
      h('div', { class: 'group', text: 'Remembered popups' }),
      ui.popupList);
  };

  const refreshPopups = () => {
    ui.popupsBox.checked = S.site.popupsEnabled !== false;
    ui.popupList.textContent = '';
    if (!S.site.popups.length) {
      ui.popupList.append(h('div', { class: 'hint', text: 'Nothing remembered for this site yet.' }));
      return;
    }
    for (const popup of S.site.popups) {
      const strategy = h('select', {
        title: 'What to do when this popup appears',
        onchange: () => LF.patch(core.host, { updatePopup: { id: popup.id, changes: { strategy: strategy.value } } })
      },
        h('option', { value: 'click', text: 'Click close' }),
        h('option', { value: 'hide', text: 'Hide it' }));
      strategy.value = popup.strategy;
      ui.popupList.append(h('div', { class: 'lrow' },
        h('input', {
          type: 'checkbox', checked: popup.on !== false,
          onchange: event => LF.patch(core.host, { updatePopup: { id: popup.id, changes: { on: event.target.checked } } })
        }),
        h('span', {
          class: 'lname',
          title: popup.close + '\n' + (popup.hide.length ? 'Hidden before it paints: ' + popup.hide.join(', ') : 'Its container is learned the next time it closes'),
          text: popup.name || popup.close
        }),
        strategy,
        button({ class: 'btn small icon danger', title: 'Forget this popup', onclick: () => LF.patch(core.host, { removePopup: popup.id }) }, icon('trash'))));
    }
  };

  const refreshToolbar = () => {
    ui.undoBtn.disabled = S.undo.length === 0;
    ui.redoBtn.disabled = S.redo.length === 0;
    ui.hideBtn.classList.toggle('on', visibilityMode(currentRule()) !== 'show');
    ui.compareTool.classList.toggle('on', S.compare);
    ui.outlineBtn.classList.toggle('on', S.outlines);
    ui.compareBtn.classList.toggle('on', S.compare);
    if (ui.status) {
      ui.status.textContent = S.selEl
        ? layerName(S.selEl) + '   ' + Math.round(S.selEl.getBoundingClientRect().width) + ' × ' + Math.round(S.selEl.getBoundingClientRect().height)
        : 'Click to select · Drag to move · Drag an edge to resize (neighbours adjust) · Alt = float · [ ] parent/child · H hide · Esc done';
    }
  };

  const showTab = name => {
    S.tab = name;
    for (const [key, node] of Object.entries(ui.tabButtons)) node.classList.toggle('on', key === name);
    for (const [key, node] of Object.entries(ui.tabPanels)) node.style.display = key === name ? 'block' : 'none';
    refreshUI();
  };

  const refreshUI = () => {
    if (!S.active || !ui.shadow) return;
    refreshToolbar();
    if (S.tab === 'props') refreshProps();
    if (S.tab === 'layers') renderLayers();
    if (S.tab === 'css') refreshCss();
    if (S.tab === 'popups') refreshPopups();
  };

  const toggleCompare = () => {
    S.compare = !S.compare;
    renderPage();
    refreshUI();
    toast(S.compare ? 'Showing the original page. Press Compare again to return.' : 'Showing your edits');
  };

  const startRecord = () => {
    S.passthrough = true;
    ui.layer.classList.add('pass');
    ui.passNote.classList.add('show');
    LF.send({ t: 'record:begin' });
  };

  const recordEnded = result => {
    if (!S.passthrough) return;
    S.passthrough = false;
    ui.layer.classList.remove('pass');
    ui.passNote.classList.remove('show');
    if (result) toast('Popup remembered');
    refreshUI();
  };

  const externalChange = site => {
    S.site.popups = site.popups;
    S.site.enabled = site.enabled;
    S.site.popupsEnabled = site.popupsEnabled;
    if (!S.dirty && site.rev !== S.lastRev) {
      S.site.names = deepCopy(site.names || []);
      rebuildNames();
    }
    const same = JSON.stringify(site.rules) === JSON.stringify(prunedRules()) && site.css === S.site.css;
    if (!same && !S.dirty && site.rev !== S.lastRev) {
      S.site.rules = deepCopy(site.rules);
      S.site.css = site.css;
      S.site.forceImportant = site.forceImportant;
      LF.prepareCss(S.site);
      if (S.selRuleId && !ruleById(S.selRuleId)) S.selRuleId = null;
    }
    refreshMatches();
    refreshUI();
  };

  const place = (node, rect) => {
    const left = Math.max(rect.left, -3);
    const top = Math.max(rect.top, -3);
    const right = Math.min(rect.left + rect.width, root.innerWidth + 3);
    const bottom = Math.min(rect.top + rect.height, root.innerHeight + 3);
    if (right <= left || bottom <= top) {
      node.style.display = 'none';
      return false;
    }
    node.style.transform = 'translate(' + left + 'px,' + top + 'px)';
    node.style.width = right - left + 'px';
    node.style.height = bottom - top + 'px';
    node.style.display = 'block';
    return true;
  };

  const poolBox = (index, className) => {
    let node = ui.pool[index];
    if (!node) {
      node = h('div', { class: 'box' });
      ui.layer.append(node);
      ui.pool[index] = node;
    }
    node.className = 'box ' + className;
    return node;
  };

  const selectionRect = () => {
    if (S.drag && S.drag.predicted) return S.drag.predicted;
    const element = S.selEl;
    if (!element || !element.isConnected) return null;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0 ? toPlain(rect) : null;
  };

  const canResize = () => {
    const rule = currentRule();
    if (!S.selEl || (rule && rule.locked) || S.selEl === document.documentElement || S.selEl === document.body) return false;
    return plainTransform(getComputedStyle(S.selEl), rule);
  };

  const uiRects = () =>
    [ui.toolbar, ui.panel, ui.status]
      .filter(node => node && node.isConnected)
      .map(node => node.getBoundingClientRect())
      .filter(rect => rect.width > 0 && rect.height > 0);

  const covered = (x, y, rects) =>
    rects.some(rect => x > rect.left - 8 && x < rect.right + 8 && y > rect.top - 8 && y < rect.bottom + 8);

  const slide = (from, to, free) => {
    const mid = (from + to) / 2;
    const span = Math.max(mid - from, to - mid);
    for (let offset = 0; offset <= span; offset += 20) {
      for (const value of offset === 0 ? [mid] : [mid - offset, mid + offset]) {
        if (value >= from && value <= to && free(value)) return value;
      }
    }
    return null;
  };

  const handleSpot = (name, rect, rects) => {
    const width = root.innerWidth;
    const height = root.innerHeight;
    const right = rect.left + rect.width;
    const bottom = rect.top + rect.height;
    const within = (value, limit) => value >= -1 && value <= limit + 1;
    const visible = {
      left: Math.max(rect.left, 0),
      right: Math.min(right, width),
      top: Math.max(rect.top, 0),
      bottom: Math.min(bottom, height)
    };
    if (visible.right <= visible.left || visible.bottom <= visible.top) return null;
    const clampX = value => Math.min(Math.max(value, 6), width - 6);
    const clampY = value => Math.min(Math.max(value, 6), height - 6);
    if (name.length === 2) {
      const x = name.includes('w') ? rect.left : right;
      const y = name.includes('n') ? rect.top : bottom;
      if (!within(x, width) || !within(y, height) || covered(x, y, rects)) return null;
      return { x: clampX(x), y: clampY(y) };
    }
    if (name === 'e' || name === 'w') {
      const x = name === 'w' ? rect.left : right;
      if (!within(x, width)) return null;
      const y = slide(visible.top, visible.bottom, value => !covered(x, value, rects));
      return y === null ? null : { x: clampX(x), y: clampY(y) };
    }
    const y = name === 'n' ? rect.top : bottom;
    if (!within(y, height)) return null;
    const x = slide(visible.left, visible.right, value => !covered(value, y, rects));
    return x === null ? null : { x: clampX(x), y: clampY(y) };
  };

  const hideHandles = () => {
    for (const handle of ui.handles) handle.style.display = 'none';
  };

  const offscreenNote = (element, box) => {
    const name = layerName(element);
    if (box.width <= 0 && box.height <= 0) return { text: name + '   (not displayed)', edge: 'top' };
    if (box.bottom <= 0) return { text: '↑  ' + name + '   (above this view)', edge: 'top' };
    if (box.top >= root.innerHeight) return { text: '↓  ' + name + '   (below this view)', edge: 'bottom' };
    return { text: name + '   (outside this view)', edge: 'top' };
  };

  const drawOverlay = () => {
    const rect = selectionRect();
    if (rect && place(ui.selBox, rect)) {
      const rule = currentRule();
      ui.selBox.classList.toggle('locked', Boolean(rule && rule.locked));
      if (!S.passthrough && canResize()) {
        const rects = uiRects();
        for (const handle of ui.handles) {
          const spot = handleSpot(handle.dataset.handle, rect, rects);
          if (spot) {
            handle.style.transform = 'translate(' + spot.x + 'px,' + spot.y + 'px)';
            handle.style.display = 'block';
          } else {
            handle.style.display = 'none';
          }
        }
      } else {
        hideHandles();
      }
      ui.nameTag.textContent = (S.selEl ? layerName(S.selEl) : '') + '   ' + Math.round(rect.width) + ' × ' + Math.round(rect.height);
      ui.nameTag.classList.toggle('in', rect.top < 26);
    } else {
      ui.selBox.style.display = 'none';
      hideHandles();
    }
    const hover = S.hoverEl;
    let note = null;
    if (hover && hover.isConnected && !S.drag && !S.passthrough && (hover !== S.selEl || S.hoverLock)) {
      const box = hover.getBoundingClientRect();
      if (place(ui.hoverBox, box)) {
        ui.hoverTag.textContent = layerName(hover);
        ui.hoverTag.classList.toggle('in', box.top < 26);
      } else {
        ui.hoverBox.style.display = 'none';
        if (S.hoverLock) note = offscreenNote(hover, box);
      }
    } else {
      ui.hoverBox.style.display = 'none';
    }
    if (note) {
      ui.hoverFlag.textContent = note.text;
      ui.hoverFlag.style.top = note.edge === 'top' ? '6px' : 'auto';
      ui.hoverFlag.style.bottom = note.edge === 'bottom' ? '6px' : 'auto';
      ui.hoverFlag.style.display = 'block';
    } else {
      ui.hoverFlag.style.display = 'none';
    }
    let index = 0;
    if (S.hoverRuleId) {
      for (const element of S.matches.get(S.hoverRuleId) || []) {
        if (!element.isConnected) continue;
        const rectangle = element.getBoundingClientRect();
        if (rectangle.width <= 0 && rectangle.height <= 0) continue;
        place(poolBox(index++, 'hot'), rectangle);
      }
    } else if (S.outlines && !S.passthrough) {
      for (const rule of S.site.rules) {
        if (rule.on === false || !Object.keys(rule.d).length) continue;
        for (const element of S.matches.get(rule.id) || []) {
          if (index >= 80) break;
          if (!element.isConnected || element === S.selEl) continue;
          const rectangle = element.getBoundingClientRect();
          if (rectangle.width <= 0 && rectangle.height <= 0) continue;
          place(poolBox(index++, 'ghost'), rectangle);
        }
      }
    }
    if (S.drag && S.drag.kind === 'reorder') {
      place(poolBox(index++, 'hot'), {
        left: S.drag.rect.left + S.lastPointer.x - S.drag.start.x,
        top: S.drag.rect.top + S.lastPointer.y - S.drag.start.y,
        width: S.drag.rect.width,
        height: S.drag.rect.height
      });
    }
    for (let i = index; i < ui.pool.length; i++) ui.pool[i].style.display = 'none';
  };

  const pickAt = point => {
    for (const element of document.elementsFromPoint(point.x, point.y)) {
      if (element === ui.host || element.localName === 'livefly-root') continue;
      return dom.topSvg(element);
    }
    return null;
  };

  const frame = () => {
    if (!S.active) return;
    S.raf = root.requestAnimationFrame(frame);
    if (document.hidden) return;
    if (!ui.host.isConnected && document.documentElement) document.documentElement.append(ui.host);
    S.tick++;
    if ((S.hoverLock || S.hoverRuleId) && !(ui.layerList && ui.layerList.matches(':hover'))) {
      S.hoverLock = false;
      S.hoverRuleId = null;
      S.hoverEl = null;
    }
    if (S.tick % 45 === 0) {
      refreshMatches();
      if (!S.drag && !S.pending && !S.hoverLock && S.lastPointer.x >= 0) S.hoverEl = overUi(S.lastPointer) ? null : pickAt(S.lastPointer);
    }
    if (S.tick % 120 === 0 && S.site.names.length && !S.drag) rebuildNames();
    drawOverlay();
  };

  const overUi = point => {
    const node = ui.shadow.elementFromPoint(point.x, point.y);
    return Boolean(node && node.closest('.ui'));
  };

  const edgeAt = point => {
    if (S.passthrough || !canResize()) return '';
    const rect = selectionRect();
    if (!rect) return '';
    const right = rect.left + rect.width;
    const bottom = rect.top + rect.height;
    const insideX = point.x >= rect.left - EDGE_GRAB && point.x <= right + EDGE_GRAB;
    const insideY = point.y >= rect.top - EDGE_GRAB && point.y <= bottom + EDGE_GRAB;
    const near = (a, b) => Math.abs(a - b) <= EDGE_GRAB;
    let vertical = '';
    let horizontal = '';
    if (insideX) vertical = near(point.y, rect.top) ? 'n' : near(point.y, bottom) ? 's' : '';
    if (insideY) horizontal = near(point.x, rect.left) ? 'w' : near(point.x, right) ? 'e' : '';
    return vertical + horizontal;
  };

  const handleAt = point => {
    const node = ui.shadow.elementFromPoint(point.x, point.y);
    if (node && node.dataset && node.dataset.handle) return node.dataset.handle;
    return edgeAt(point);
  };

  const releaseCapture = pointerId => {
    try {
      if (pointerId !== undefined) ui.host.releasePointerCapture(pointerId);
    } catch {
    }
  };

  const outOfFlow = style =>
    style.position === 'absolute' || style.position === 'fixed' || style.display === 'none' || style.display === 'contents';

  const flowChildren = (parent, except) =>
    Array.from(parent.children).filter(child => {
      if (child === except) return false;
      const style = getComputedStyle(child);
      if (outOfFlow(style)) return false;
      const rect = child.getBoundingClientRect();
      return rect.width > 0 || rect.height > 0;
    });

  const mainAxisOf = style => {
    if (/grid/.test(style.display)) return /^column/.test(style.gridAutoFlow) ? 'y' : 'x';
    return /^column/.test(style.flexDirection) ? 'y' : 'x';
  };

  const inFlexMain = (element, axis) => {
    const parent = element.parentElement;
    if (!parent) return false;
    const style = getComputedStyle(parent);
    return /flex/.test(style.display) && mainAxisOf(style) === axis;
  };

  const pageRect = element => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left + root.scrollX,
      top: rect.top + root.scrollY,
      right: rect.right + root.scrollX,
      bottom: rect.bottom + root.scrollY,
      width: rect.width,
      height: rect.height
    };
  };

  const findNeighbour = (element, axis, side) => {
    const parent = element.parentElement;
    if (!parent) return null;
    const style = getComputedStyle(parent);
    if (!/flex/.test(style.display) || mainAxisOf(style) !== axis) return null;
    const a = AXES[axis];
    const c = AXES[a.cross];
    const own = element.getBoundingClientRect();
    let best = null;
    let bestGap = Infinity;
    for (const sibling of flowChildren(parent, element)) {
      const rect = sibling.getBoundingClientRect();
      if (rect[a.dim] < SPACER_MAX) continue;
      const overlap = Math.min(own[c.endEdge], rect[c.endEdge]) - Math.max(own[c.startEdge], rect[c.startEdge]);
      if (overlap <= 0) continue;
      const gap = side === 'end' ? rect[a.startEdge] - own[a.endEdge] : own[a.startEdge] - rect[a.endEdge];
      if (gap < -1.5) continue;
      if (gap < bestGap) {
        best = sibling;
        bestGap = gap;
      }
    }
    return best;
  };

  const BOX_DISPLAY = /^(block|flex|grid|flow-root|list-item|inline-block|inline-flex)$/;

  const flushParent = (node, edge, pure) => {
    const parent = node.parentElement;
    if (!parent || parent === document.body || parent === document.documentElement) return null;
    if (!BOX_DISPLAY.test(getComputedStyle(parent).display)) return null;
    const own = node.getBoundingClientRect();
    const outer = parent.getBoundingClientRect();
    if (Math.abs(outer[edge] - own[edge]) > 3) return null;
    if (pure && Math.abs(outer.width - own.width) > 3) return null;
    if (outer.width >= root.innerWidth - 8) return null;
    return parent;
  };

  const flushOwner = (element, axis, side) => {
    if (axis !== 'x' || outOfFlow(getComputedStyle(element))) return element;
    const edge = side === 'end' ? 'right' : 'left';
    let owner = element;
    for (let depth = 0; depth < 16 && !findNeighbour(owner, axis, side); depth++) {
      const parent = flushParent(owner, edge, true);
      if (!parent) break;
      owner = parent;
    }
    if (findNeighbour(owner, axis, side)) return owner;
    let node = owner;
    for (let depth = 0; depth < 12; depth++) {
      const parent = flushParent(node, edge, false);
      if (!parent) break;
      node = parent;
      if (findNeighbour(node, axis, side)) return node;
    }
    return owner;
  };

  const chainBetween = (element, owner, axis, scale) => {
    const chain = [];
    for (let node = element; node && node !== owner; node = node.parentElement) {
      chain.push({ node, base: node.getBoundingClientRect()[AXES[axis].dim] / scale });
    }
    return chain;
  };

  const planAxis = (element, axis, side) => {
    const a = AXES[axis];
    const owner = flushOwner(element, axis, side);
    const neighbour = findNeighbour(owner, axis, side);
    const scale = dom.ancestorScale(owner)[axis];
    const rect = owner.getBoundingClientRect();
    return {
      axis,
      side,
      owner,
      neighbour,
      scale,
      inFlexMain: inFlexMain(owner, axis),
      origin: pageRect(owner),
      base: rect[a.dim] / scale,
      neighbourBase: neighbour ? neighbour.getBoundingClientRect()[a.dim] / scale : 0,
      neighbourGrow: neighbour ? Number.parseFloat(getComputedStyle(neighbour).flexGrow) || 0 : 0,
      baseMargin: Number.parseFloat(getComputedStyle(owner)[a.margins]) || 0,
      chain: chainBetween(element, owner, axis, scale),
      target: rect[a.dim] / scale,
      neighbourTarget: neighbour ? neighbour.getBoundingClientRect()[a.dim] / scale : 0,
      ownerRule: null,
      neighbourRule: null,
      relaxed: false,
      neighbourRelaxed: false
    };
  };

  const planResize = (element, handle) => {
    const items = [];
    if (handle.includes('e') || handle.includes('w')) items.push(planAxis(element, 'x', handle.includes('e') ? 'end' : 'start'));
    if (handle.includes('s') || handle.includes('n')) items.push(planAxis(element, 'y', handle.includes('s') ? 'end' : 'start'));
    return items;
  };

  const writeSize = (rule, a, value, flexMain) => {
    rule.d[a.size] = round(value) + 'px';
    rule.d['box-sizing'] = 'border-box';
    if (flexMain) rule.d.flex = '0 0 auto';
  };

  const relaxLimits = (rule, a) => {
    rule.d[a.max] = 'none';
    rule.d[a.min] = '0';
  };

  const applyFlow = (item, delta) => {
    const a = AXES[item.axis];
    let change = Math.max(8, item.base + delta) - item.base;
    if (item.neighbour) change = Math.min(change, Math.max(0, item.neighbourBase - NEIGHBOUR_MIN));
    item.target = item.base + change;
    writeSize(item.ownerRule, a, item.target, item.inFlexMain);
    if (item.side === 'start' && !item.neighbour) item.ownerRule.d[a.margin] = round(item.baseMargin - change) + 'px';
    if (item.neighbourRule) {
      item.neighbourTarget = item.neighbourBase - change;
      writeSize(item.neighbourRule, a, item.neighbourTarget, true);
    }
  };

  const reorderParent = element => {
    const parent = element.parentElement;
    if (!parent || element === document.body || element === document.documentElement) return null;
    if (!/flex|grid/.test(getComputedStyle(parent).display)) return null;
    if (outOfFlow(getComputedStyle(element))) return null;
    return flowChildren(parent, element).length > 0 ? parent : null;
  };

  const orderOf = element => Number.parseInt(getComputedStyle(element).order, 10) || 0;

  const placeNear = (element, parent, target, after) => {
    const children = Array.from(parent.children);
    const compare = (a, b) => a.order - b.order || a.index - b.index;
    const entries = flowChildren(parent, element)
      .map(node => ({ node, order: orderOf(node), index: children.indexOf(node) }))
      .sort(compare);
    const at = entries.findIndex(entry => entry.node === target) + (after ? 1 : 0);
    const before = entries.slice(0, at);
    const next = entries.slice(at);
    const prev = before[before.length - 1] || null;
    const following = next[0] || null;
    const index = children.indexOf(element);
    const fits = value =>
      (!prev || compare(prev, { order: value, index }) < 0) && (!following || compare({ order: value, index }, following) < 0);
    const low = prev ? prev.order : following ? following.order - 1 : 0;
    const high = following ? following.order : prev ? prev.order + 1 : 0;
    const assignments = [];
    let value = null;
    for (let candidate = low; candidate <= high; candidate++) {
      if (fits(candidate)) {
        value = candidate;
        break;
      }
    }
    if (value === null) {
      if (next.length <= before.length) {
        value = prev.order + 1;
        next.forEach((entry, position) => assignments.push([entry.node, value + 1 + position]));
      } else {
        value = following.order - 1;
        before.slice().reverse().forEach((entry, position) => assignments.push([entry.node, value - 1 - position]));
      }
    }
    assignments.push([element, value]);
    const rules = assignments.map(([node, order]) => [ruleForElement(node), order]);
    if (rules.some(([rule]) => rule.locked)) {
      toast('A layer in this row is locked', true);
      return false;
    }
    let changed = false;
    for (const [rule, order] of rules) {
      const text = String(order);
      if (rule.d.order !== text) {
        rule.d.order = text;
        changed = true;
      }
    }
    return changed;
  };

  const startReorder = (element, parent, pending) => {
    const rule = ensureRule();
    if (!rule) return;
    if (rule.locked) {
      toast('This layer is locked', true);
      S.pending = null;
      return;
    }
    S.coalesce = '';
    pushUndo();
    S.drag = {
      kind: 'reorder',
      el: element,
      parent,
      ruleId: rule.id,
      start: pending.start,
      pointerId: pending.pointerId,
      rect: toPlain(element.getBoundingClientRect()),
      changed: false,
      busy: false,
      lastTarget: null,
      before: snapshot()
    };
    S.pending = null;
    ui.layer.style.cursor = 'grabbing';
  };

  const startMove = pending => {
    const element = pending.el;
    if (!element) return;
    const parent = pending.alt ? null : reorderParent(element);
    if (parent) {
      startReorder(element, parent, pending);
      return;
    }
    const rule = ensureRule();
    if (!rule) return;
    if (rule.locked) {
      toast('This layer is locked', true);
      S.pending = null;
      return;
    }
    S.coalesce = '';
    pushUndo();
    const rect = element.getBoundingClientRect();
    makeTransformable(rule, element);
    S.drag = {
      kind: 'move',
      el: element,
      ruleId: rule.id,
      start: pending.start,
      pointerId: pending.pointerId,
      rect: toPlain(rect),
      base: readTranslate(rule, element),
      scale: dom.ancestorScale(element),
      predicted: toPlain(rect),
      changed: false,
      before: snapshot()
    };
    S.pending = null;
    ui.layer.style.cursor = 'move';
    if (!pending.alt && !S.freeHinted) {
      S.freeHinted = true;
      toast('This element is not in a flex or grid row, so it floats freely. Hold Alt to always float.');
    }
  };

  const startFreeResize = (handle, point, event) => {
    const element = S.selEl;
    const rule = ensureRule();
    if (!element || !rule) return;
    if (rule.locked) {
      toast('This layer is locked', true);
      return;
    }
    S.coalesce = '';
    pushUndo();
    const rect = element.getBoundingClientRect();
    const scale = dom.ancestorScale(element);
    makeTransformable(rule, element);
    S.drag = {
      kind: 'resize',
      handle,
      el: element,
      ruleId: rule.id,
      start: point,
      pointerId: event.pointerId,
      rect: toPlain(rect),
      scale,
      base: readTranslate(rule, element),
      baseW: rect.width / scale.x,
      baseH: rect.height / scale.y,
      predicted: toPlain(rect),
      changed: false,
      before: snapshot()
    };
    try {
      ui.host.setPointerCapture(event.pointerId);
    } catch {
    }
  };

  const startResize = (handle, point, event) => {
    const element = S.selEl;
    if (!element) return;
    const own = currentRule();
    if (own && own.locked) {
      toast('This layer is locked', true);
      return;
    }
    if (!plainTransform(getComputedStyle(element), own)) {
      toast('Reset rotation and scale in the panel to resize by dragging', true);
      return;
    }
    if (event.altKey) {
      startFreeResize(handle, point, event);
      return;
    }
    let items;
    try {
      items = planResize(element, handle);
    } catch {
      items = null;
    }
    if (!items || !items.length) {
      startFreeResize(handle, point, event);
      return;
    }
    S.coalesce = '';
    pushUndo();
    for (const item of items) {
      item.ownerRule = ruleForElement(item.owner);
      if (item.neighbour && item.neighbourGrow === 0) item.neighbourRule = ruleForElement(item.neighbour);
      if (item.ownerRule.locked || (item.neighbourRule && item.neighbourRule.locked)) {
        S.undo.pop();
        toast('A layer next to this one is locked', true);
        return;
      }
      makeTransformable(item.ownerRule, item.owner);
    }
    S.drag = {
      kind: 'flow',
      handle,
      el: element,
      items,
      start: point,
      pointerId: event.pointerId,
      rect: toPlain(element.getBoundingClientRect()),
      changed: false,
      before: snapshot()
    };
    try {
      ui.host.setPointerCapture(event.pointerId);
    } catch {
    }
  };

  const dragFlow = (event, point) => {
    const drag = S.drag;
    const dx = point.x - drag.start.x;
    const dy = point.y - drag.start.y;
    let deltas = drag.items.map(item => {
      const raw = (item.axis === 'x' ? dx : dy) / item.scale;
      return item.side === 'end' ? raw : -raw;
    });
    if (event.shiftKey && drag.items.length === 2) {
      const ratios = drag.items.map((item, index) => (item.base + deltas[index]) / item.base);
      const factor = Math.abs(ratios[0] - 1) > Math.abs(ratios[1] - 1) ? ratios[0] : ratios[1];
      deltas = drag.items.map(item => item.base * (factor - 1));
    }
    drag.items.forEach((item, index) => applyFlow(item, deltas[index]));
    drag.changed = true;
    renderPage();
    refreshFields();
  };

  const dragReorder = point => {
    const drag = S.drag;
    if (drag.busy || !drag.el.isConnected) return;
    const target = flowChildren(drag.parent, drag.el).find(sibling => inRect(point, toPlain(sibling.getBoundingClientRect())));
    if (!target) {
      drag.lastTarget = null;
      return;
    }
    if (target === drag.lastTarget) return;
    drag.lastTarget = target;
    const style = getComputedStyle(drag.parent);
    const main = mainAxisOf(style);
    const own = drag.el.getBoundingClientRect();
    const other = target.getBoundingClientRect();
    const dx = other.left + other.width / 2 - (own.left + own.width / 2);
    const dy = other.top + other.height / 2 - (own.top + own.height / 2);
    const sameLine =
      main === 'x' ? Math.abs(dy) < Math.min(own.height, other.height) / 2 : Math.abs(dx) < Math.min(own.width, other.width) / 2;
    const delta = main === 'x' ? (sameLine ? dx : dy) : sameLine ? dy : dx;
    const reversed = (/flex/.test(style.display) && /reverse/.test(style.flexDirection)) !== (main === 'x' && style.direction === 'rtl');
    if (!placeNear(drag.el, drag.parent, target, delta > 0 !== reversed)) return;
    drag.changed = true;
    drag.busy = true;
    renderPage();
    settle().then(() => {
      drag.busy = false;
    });
  };

  const dragMove = (event, point) => {
    const drag = S.drag;
    if (drag.kind === 'flow') {
      dragFlow(event, point);
      return;
    }
    if (drag.kind === 'reorder') {
      dragReorder(point);
      return;
    }
    const rule = ruleById(drag.ruleId);
    if (!rule) return;
    let dx = point.x - drag.start.x;
    let dy = point.y - drag.start.y;
    if (drag.kind === 'move') {
      if (event.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      const tx = Math.round(drag.base.x + dx / drag.scale.x);
      const ty = Math.round(drag.base.y + dy / drag.scale.y);
      setTranslate(rule, tx, ty);
      drag.predicted = {
        left: drag.rect.left + (tx - drag.base.x) * drag.scale.x,
        top: drag.rect.top + (ty - drag.base.y) * drag.scale.y,
        width: drag.rect.width,
        height: drag.rect.height
      };
    } else {
      const handle = drag.handle;
      const east = handle.includes('e');
      const west = handle.includes('w');
      const south = handle.includes('s');
      const north = handle.includes('n');
      let width = drag.baseW;
      let height = drag.baseH;
      if (east) width = Math.max(8, drag.baseW + dx / drag.scale.x);
      if (west) width = Math.max(8, drag.baseW - dx / drag.scale.x);
      if (south) height = Math.max(8, drag.baseH + dy / drag.scale.y);
      if (north) height = Math.max(8, drag.baseH - dy / drag.scale.y);
      if (event.shiftKey && handle.length === 2) {
        const rx = width / drag.baseW;
        const ry = height / drag.baseH;
        const factor = Math.abs(rx - 1) > Math.abs(ry - 1) ? rx : ry;
        width = Math.max(8, drag.baseW * factor);
        height = Math.max(8, drag.baseH * factor);
      }
      const tx = drag.base.x + (west ? drag.baseW - width : 0);
      const ty = drag.base.y + (north ? drag.baseH - height : 0);
      if (east || west) rule.d.width = round(width) + 'px';
      if (south || north) rule.d.height = round(height) + 'px';
      rule.d['box-sizing'] = 'border-box';
      setTranslate(rule, tx, ty);
      drag.predicted = {
        left: drag.rect.left + (tx - drag.base.x) * drag.scale.x,
        top: drag.rect.top + (ty - drag.base.y) * drag.scale.y,
        width: width * drag.scale.x,
        height: height * drag.scale.y
      };
    }
    drag.changed = true;
    renderPage();
    refreshFields();
  };

  const settleResize = async drag => {
    const rule = ruleById(drag.ruleId);
    if (!rule || !drag.el.isConnected) return;
    const east = drag.handle.includes('e');
    const west = drag.handle.includes('w');
    const south = drag.handle.includes('s');
    const north = drag.handle.includes('n');
    let relaxed = false;
    for (let pass = 0; pass < 3; pass++) {
      await settle();
      const actual = drag.el.getBoundingClientRect();
      const target = drag.predicted;
      let changed = false;
      if (!relaxed) {
        if ((east || west) && Math.abs(actual.width - target.width) > 1.5) {
          rule.d['max-width'] = 'none';
          rule.d['min-width'] = '0';
          const parent = drag.el.parentElement;
          if (parent && /flex|grid/.test(getComputedStyle(parent).display) && !rule.d.flex) rule.d.flex = '0 0 auto';
          changed = true;
        }
        if ((north || south) && Math.abs(actual.height - target.height) > 1.5) {
          rule.d['max-height'] = 'none';
          rule.d['min-height'] = '0';
          changed = true;
        }
        relaxed = true;
      }
      if (!changed) {
        let errorX = 0;
        let errorY = 0;
        if (east && !west) errorX = actual.left - drag.rect.left;
        if (west && !east) errorX = actual.right - (drag.rect.left + drag.rect.width);
        if (south && !north) errorY = actual.top - drag.rect.top;
        if (north && !south) errorY = actual.bottom - (drag.rect.top + drag.rect.height);
        if (Math.abs(errorX) > 0.75 || Math.abs(errorY) > 0.75) {
          const current = readTranslate(rule, drag.el);
          setTranslate(rule, current.x - errorX / drag.scale.x, current.y - errorY / drag.scale.y);
          changed = true;
        }
      }
      if (!changed) break;
      renderPage();
    }
  };

  const settleFlow = async drag => {
    for (let pass = 0; pass < 4; pass++) {
      await settle();
      let changed = false;
      for (const item of drag.items) {
        if (!item.owner.isConnected) continue;
        const a = AXES[item.axis];
        const actual = pageRect(item.owner);
        if (!item.relaxed && Math.abs(actual[a.dim] / item.scale - item.target) > 1.5) {
          relaxLimits(item.ownerRule, a);
          item.relaxed = true;
          changed = true;
        }
        if (item.neighbourRule && !item.neighbourRelaxed && item.neighbour.isConnected) {
          const size = item.neighbour.getBoundingClientRect()[a.dim] / item.scale;
          if (Math.abs(size - item.neighbourTarget) > 1.5) {
            relaxLimits(item.neighbourRule, a);
            item.neighbourRelaxed = true;
            changed = true;
          }
        }
        if (changed) continue;
        for (const link of item.chain) {
          const wanted = link.base + (item.target - item.base);
          const size = link.node.getBoundingClientRect()[a.dim] / item.scale;
          if (Math.abs(size - wanted) <= 1.5) continue;
          const rule = ruleForElement(link.node);
          if (rule.locked) continue;
          writeSize(rule, a, wanted, inFlexMain(link.node, item.axis));
          relaxLimits(rule, a);
          changed = true;
        }
        if (changed) continue;
        const anchor = item.side === 'end' ? a.startEdge : a.endEdge;
        const error = actual[anchor] - item.origin[anchor];
        if (Math.abs(error) > 0.75) {
          const current = readTranslate(item.ownerRule, item.owner);
          if (item.axis === 'x') setTranslate(item.ownerRule, current.x - error / item.scale, current.y);
          else setTranslate(item.ownerRule, current.x, current.y - error / item.scale);
          changed = true;
        }
      }
      if (!changed) break;
      renderPage();
    }
  };

  const endDrag = async () => {
    const drag = S.drag;
    if (!drag) return;
    S.drag = null;
    releaseCapture(drag.pointerId);
    ui.layer.style.cursor = 'default';
    if (!drag.changed) {
      S.undo.pop();
      return;
    }
    if (drag.kind === 'resize') await settleResize(drag);
    else if (drag.kind === 'flow') await settleFlow(drag);
    else if (drag.kind === 'reorder') await settle();
    scheduleSave();
    refreshMatches();
    refreshUI();
  };

  const cancelDrag = () => {
    const drag = S.drag;
    if (!drag) return;
    S.drag = null;
    releaseCapture(drag.pointerId);
    restore(drag.before);
    S.undo.pop();
    ui.layer.style.cursor = 'default';
    afterChange();
  };

  const updateCursor = point => {
    const handle = handleAt(point);
    if (handle) {
      ui.layer.style.cursor = CURSORS[handle];
      return;
    }
    const rect = selectionRect();
    ui.layer.style.cursor = rect && inRect(point, rect) ? 'move' : 'default';
  };

  const onPointer = event => {
    if (event.detail === 0 && /^(click|mousedown|mouseup)$/.test(event.type)) return false;
    if (S.moving) return false;
    const point = { x: event.clientX, y: event.clientY };
    const busy = Boolean(S.drag || S.pending);
    if (!busy) {
      if (event.target !== ui.host) return false;
      if (overUi(point)) {
        if (!S.hoverLock) S.hoverEl = null;
        return false;
      }
    }
    S.lastPointer = point;
    switch (event.type) {
      case 'pointermove':
        if (S.drag) dragMove(event, point);
        else if (S.pending) {
          if (Math.hypot(point.x - S.pending.start.x, point.y - S.pending.start.y) > 3) startMove(S.pending);
        } else {
          S.hoverEl = pickAt(point);
          updateCursor(point);
        }
        return true;
      case 'pointerdown': {
        if (event.button !== 0) return true;
        const active = ui.shadow.activeElement;
        if (active && active.blur) active.blur();
        event.preventDefault();
        const handle = handleAt(point);
        if (handle && S.selEl) {
          startResize(handle, point, event);
          return true;
        }
        const hit = pickAt(point);
        if (!hit) return true;
        const rect = selectionRect();
        const inside = Boolean(S.selEl && S.selEl.isConnected && S.selEl.contains(hit) && rect && inRect(point, rect));
        if (!inside) select(hit);
        S.pending = { start: point, el: S.selEl, hit, inside, pointerId: event.pointerId, alt: event.altKey };
        try {
          ui.host.setPointerCapture(event.pointerId);
        } catch {
        }
        return true;
      }
      case 'pointerup':
      case 'pointercancel': {
        if (S.drag) {
          endDrag();
        } else if (S.pending) {
          const pending = S.pending;
          S.pending = null;
          releaseCapture(pending.pointerId);
          if (pending.inside && pending.hit !== S.selEl && S.selEl && S.selEl.contains(pending.hit)) select(pending.hit);
        }
        return true;
      }
      case 'contextmenu':
        event.preventDefault();
        return true;
      default:
        return true;
    }
  };

  const isTypingTarget = node =>
    Boolean(node) && (/^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName) || node.isContentEditable);

  const nudgeBy = (dx, dy) => {
    if (!S.selEl && !currentRule()) return;
    edit((rule, element) => {
      const current = readTranslate(rule, element);
      makeTransformable(rule, element);
      setTranslate(rule, current.x + dx, current.y + dy);
    }, 'nudge');
  };

  const onKey = event => {
    const focused = ui.shadow.activeElement;
    if (focused && isTypingTarget(focused)) {
      if (event.type === 'keydown' && (event.key === 'Escape' || (event.key === 'Enter' && S.renaming))) {
        event.preventDefault();
        if (event.key === 'Escape' && S.renaming) S.renameCancel = true;
        focused.blur();
      }
      return true;
    }
    if (isTypingTarget(document.activeElement)) return false;
    if (event.type !== 'keydown') {
      if (!S.swallow.has(event.key)) return false;
      if (event.type === 'keyup') S.swallow.delete(event.key);
      return true;
    }
    const key = event.key;
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && !event.altKey) {
      const lower = key.toLowerCase();
      if (lower === 'z') {
        if (event.shiftKey) redo();
        else undo();
      } else if (lower === 'y') redo();
      else if (lower === 's') flushSave();
      else return false;
      event.preventDefault();
      return true;
    }
    if (event.altKey) return false;
    const step = event.shiftKey ? 10 : 1;
    switch (key) {
      case 'Escape':
        if (S.drag) cancelDrag();
        else if (S.passthrough) LF.send({ t: 'record:cancel' });
        else if (S.selEl || S.selRuleId) deselect();
        else close();
        break;
      case 'ArrowLeft': nudgeBy(-step, 0); break;
      case 'ArrowRight': nudgeBy(step, 0); break;
      case 'ArrowUp': nudgeBy(0, -step); break;
      case 'ArrowDown': nudgeBy(0, step); break;
      case 'Delete':
      case 'Backspace':
      case 'h':
      case 'H':
        toggleHide();
        break;
      case '[': selectParent(); break;
      case ']': selectChild(); break;
      default:
        return false;
    }
    event.preventDefault();
    S.swallow.add(key);
    return true;
  };

  const onWindowEvent = event => {
    if (!S.active || S.passthrough) return false;
    return event.type.startsWith('key') ? onKey(event) : onPointer(event);
  };

  const clamp = (value, low, high) => Math.min(Math.max(value, low), Math.max(low, high));

  const viewport = () => ({ w: document.documentElement.clientWidth || root.innerWidth, h: root.innerHeight });

  const fitSpot = (which, spot) => {
    const view = viewport();
    if (which === 'toolbar') {
      const rect = ui.toolbar.getBoundingClientRect();
      return { x: clamp(spot.x, 0, view.w - rect.width), y: clamp(spot.y, 0, view.h - rect.height) };
    }
    const w = clamp(spot.w, PANEL_MIN_W, view.w);
    const h = clamp(spot.h, PANEL_MIN_H, view.h);
    const shown = S.collapsed ? ui.panel.getBoundingClientRect().height : h;
    return { x: clamp(spot.x, 0, view.w - w), y: clamp(spot.y, 0, view.h - shown), w, h };
  };

  const applyLayout = () => {
    if (!ui.toolbar || !ui.panel) return;
    const { toolbar, panel, dock } = S.layout;
    ui.panel.classList.toggle('left', dock === 'left');
    if (toolbar) {
      const spot = fitSpot('toolbar', toolbar);
      ui.toolbar.classList.add('free');
      ui.toolbar.style.transform = 'translate(' + spot.x + 'px,' + spot.y + 'px)';
    } else {
      ui.toolbar.classList.remove('free');
      ui.toolbar.style.transform = '';
    }
    if (panel) {
      const spot = fitSpot('panel', panel);
      ui.panel.classList.add('free');
      ui.panel.style.transform = 'translate(' + spot.x + 'px,' + spot.y + 'px)';
      ui.panel.style.width = spot.w + 'px';
      ui.panel.style.height = S.collapsed ? '' : spot.h + 'px';
    } else {
      ui.panel.classList.remove('free');
      ui.panel.style.transform = '';
      ui.panel.style.width = '';
      ui.panel.style.height = '';
    }
  };

  const saveLayout = () => {
    const value = { toolbar: S.layout.toolbar, panel: S.layout.panel, dock: S.layout.dock };
    core.layout = LF.normalizeLayout(value);
    try {
      const pending = chrome.storage.local.set({ [LF.LAYOUT_KEY]: value });
      if (pending && pending.catch) pending.catch(() => {});
    } catch {
    }
  };

  const resetSpot = which => {
    S.layout[which] = null;
    applyLayout();
    saveLayout();
  };

  const startUiDrag = (event, which, zone) => {
    if (event.button !== 0 || S.moving) return;
    if (event.target.closest && event.target.closest('button, input, select, textarea')) return;
    const node = which === 'toolbar' ? ui.toolbar : ui.panel;
    const rect = node.getBoundingClientRect();
    const view = viewport();
    const stored = S.layout[which];
    const origin = which === 'toolbar'
      ? { x: rect.left, y: rect.top }
      : { x: rect.left, y: rect.top, w: rect.width, h: S.collapsed ? (stored ? stored.h : view.h - 102) : rect.height };
    const target = event.currentTarget;
    const start = { x: event.clientX, y: event.clientY };
    let moved = false;
    event.preventDefault();
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
    }
    node.classList.add('moving');
    S.moving = { pointerId: event.pointerId };
    const update = next => {
      const dx = next.clientX - start.x;
      const dy = next.clientY - start.y;
      const spot = Object.assign({}, origin);
      if (!zone) {
        spot.x = origin.x + dx;
        spot.y = origin.y + dy;
      } else {
        if (zone.includes('w')) {
          const right = origin.x + origin.w;
          spot.x = clamp(origin.x + dx, 0, right - PANEL_MIN_W);
          spot.w = right - spot.x;
        }
        if (zone.includes('e')) spot.w = clamp(origin.w + dx, PANEL_MIN_W, view.w - origin.x);
        if (zone.includes('s')) spot.h = clamp(origin.h + dy, PANEL_MIN_H, view.h - origin.y);
      }
      moved = true;
      S.layout[which] = fitSpot(which, spot);
      applyLayout();
    };
    const finish = () => {
      target.removeEventListener('pointermove', update);
      target.removeEventListener('pointerup', finish);
      target.removeEventListener('pointercancel', finish);
      target.removeEventListener('lostpointercapture', finish);
      try {
        target.releasePointerCapture(event.pointerId);
      } catch {
      }
      node.classList.remove('moving');
      S.moving = null;
      if (moved) saveLayout();
    };
    target.addEventListener('pointermove', update);
    target.addEventListener('pointerup', finish);
    target.addEventListener('pointercancel', finish);
    target.addEventListener('lostpointercapture', finish);
  };

  const onResize = () => {
    if (S.active) applyLayout();
  };

  const build = () => {
    const { host, shadow } = dom.shadowHost(STYLE);
    ui.host = host;
    ui.shadow = shadow;
    ui.layer = h('div', { class: 'layer' });
    ui.hoverTag = h('div', { class: 'tag' });
    ui.hoverBox = h('div', { class: 'box hover' }, ui.hoverTag);
    ui.hoverFlag = h('div', { class: 'flag' });
    ui.nameTag = h('div', { class: 'tag' });
    ui.handles = HANDLES.map(name => {
      const node = h('div', { class: 'handle', 'data-handle': name });
      node.style.cursor = CURSORS[name];
      return node;
    });
    ui.selBox = h('div', { class: 'box sel' }, ui.nameTag);
    ui.layer.append(ui.hoverBox, ui.selBox, ...ui.handles, ui.hoverFlag);

    ui.undoBtn = button({ class: 'btn icon', title: 'Undo  (Ctrl+Z)', onclick: undo }, icon('undo'));
    ui.redoBtn = button({ class: 'btn icon', title: 'Redo  (Ctrl+Shift+Z)', onclick: redo }, icon('redo'));
    ui.hideBtn = button({ class: 'btn', title: 'Hide or show the selected element  (H)', onclick: toggleHide }, icon('eyeOff'), 'Hide');
    ui.compareTool = button({ class: 'btn', title: 'Compare with the original page', onclick: toggleCompare }, icon('compare'), 'Compare');
    ui.outlineBtn = button({ class: 'btn icon', title: 'Outline edited regions', onclick: () => { S.outlines = !S.outlines; refreshUI(); } }, icon('outline'));
    ui.rememberBtn = button({ class: 'btn', title: 'Record a popup so it closes by itself next time', onclick: startRecord }, icon('bookmark'), 'Remember state');
    ui.dockBtn = button({
      class: 'btn icon', title: 'Dock the panel to the other side',
      onclick: () => {
        S.layout.dock = S.layout.dock === 'right' ? 'left' : 'right';
        S.layout.panel = null;
        applyLayout();
        saveLayout();
      }
    }, icon('dock'));
    ui.doneBtn = button({ class: 'btn primary', title: 'Save and close  (Esc)', onclick: close }, icon('check'), 'Done');
    ui.toolbar = h('div', {
      class: 'ui toolbar',
      onpointerdown: event => startUiDrag(event, 'toolbar')
    },
      h('div', {
        class: 'grip',
        title: 'Drag to move the toolbar. Double-click to put it back.',
        ondblclick: () => resetSpot('toolbar')
      }, h('span', { class: 'dots' })),
      ui.undoBtn, ui.redoBtn, h('div', { class: 'sep' }),
      ui.hideBtn, ui.compareTool, ui.outlineBtn, h('div', { class: 'sep' }),
      ui.rememberBtn, ui.dockBtn, h('div', { class: 'sep' }), ui.doneBtn);

    ui.tabPanels = {
      props: h('div', null, buildProps()),
      layers: h('div', null, buildLayers()),
      css: h('div', null, buildCss()),
      popups: h('div', null, buildPopups())
    };
    ui.tabButtons = {};
    const labels = { props: 'Properties', layers: 'Layers', css: 'CSS', popups: 'Popups' };
    const tabs = h('div', { class: 'tabs' });
    for (const key of Object.keys(labels)) {
      ui.tabButtons[key] = h('button', { type: 'button', class: 'tab', text: labels[key], onclick: () => showTab(key) });
      tabs.append(ui.tabButtons[key]);
    }
    const head = h('div', {
      class: 'phead',
      title: 'Drag to move the panel. Double-click to dock it again.',
      onpointerdown: event => startUiDrag(event, 'panel'),
      ondblclick: () => resetSpot('panel')
    },
      h('span', { class: 'dots' }),
      h('span', { class: 'ptitle', text: 'livefly' }),
      button({
        class: 'btn small icon flat', title: 'Collapse or expand the panel',
        onclick: () => {
          S.collapsed = !S.collapsed;
          ui.panel.classList.toggle('collapsed', S.collapsed);
          applyLayout();
        }
      }, '↕'));
    const zones = ['s', 'e', 'w', 'se', 'sw'].map(zone =>
      h('div', { class: 'rsz ' + zone, onpointerdown: event => startUiDrag(event, 'panel', zone) }));
    ui.body = h('div', { class: 'body' }, Object.values(ui.tabPanels));
    ui.panel = h('div', { class: 'ui panel' }, head, tabs, ui.body, ...zones);
    ui.status = h('div', { class: 'ui status' });
    ui.toast = h('div', { class: 'ui toast' });
    ui.passNote = h('div', { class: 'ui pass-note', text: 'Recording: close the popup now. Press Esc to cancel.' });
    shadow.append(ui.layer, ui.status, ui.toolbar, ui.panel, ui.toast, ui.passNote);
  };

  const flushOnLeave = () => {
    if (S.dirty) flushSave();
  };

  const flushOnHidden = () => {
    if (document.visibilityState === 'hidden') flushOnLeave();
  };

  function open() {
    if (S.active) return;
    S.active = true;
    root.addEventListener('pagehide', flushOnLeave);
    document.addEventListener('visibilitychange', flushOnHidden);
    S.site = LF.prepareCss(LF.normalizeSite(deepCopy(core.site)));
    S.undo = [];
    S.redo = [];
    S.expanded = new Set(document.body ? [document.body] : []);
    S.limits = new Map();
    S.layerMode = 'all';
    S.layerQuery = '';
    S.renaming = false;
    S.hoverLock = false;
    S.hoverEl = null;
    S.hoverRuleId = null;
    S.scrollToSel = false;
    S.moving = null;
    S.collapsed = false;
    S.layout = LF.normalizeLayout(core.layout);
    rebuildNames();
    S.compare = false;
    S.passthrough = false;
    S.selEl = null;
    S.selRuleId = null;
    ui.fields = [];
    ui.pool = [];
    build();
    document.documentElement.append(ui.host);
    applyLayout();
    root.addEventListener('resize', onResize);
    const wasDisabled = core.site.enabled === false;
    S.site.enabled = true;
    core.editorHook = { externalChange, recordEnded };
    core.setEventHook(onWindowEvent);
    refreshMatches();
    showTab('props');
    renderPage();
    S.raf = root.requestAnimationFrame(frame);
    if (wasDisabled) {
      LF.patch(core.host, { set: { enabled: true } });
      toast('Edits were paused for this site. They are on again.');
    } else if (core.paused) {
      toast('livefly is paused in its options page, so edits will not show until you resume it', true);
    }
  }

  async function close() {
    if (!S.active) return;
    if (S.drag) cancelDrag();
    S.active = false;
    root.removeEventListener('pagehide', flushOnLeave);
    root.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', flushOnHidden);
    S.moving = null;
    root.cancelAnimationFrame(S.raf);
    core.setEventHook(null);
    core.editorHook = null;
    ui.host.remove();
    S.compare = false;
    await flushSave();
    const finalSite = Object.assign(deepCopy(S.site), { rules: deepCopy(prunedRules()) });
    core.site = LF.prepareCss(LF.normalizeSite(finalSite));
    core.renderSite = null;
    core.sync();
  }

  LF.editor = {
    build: LF.BUILD,
    open,
    close,
    toggle: () => (S.active ? close() : open()),
    state: S,
    ui
  };

  if (core.ready) open();
  else core.readyPromise.then(open);
})(globalThis);
