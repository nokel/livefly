(function (root) {
  const LF = root.LF || (root.LF = {});

  LF.SETTINGS_KEY = 'lf:settings';
  LF.LAYOUT_KEY = 'lf:layout';
  LF.SITE_PREFIX = 'site:';
  LF.MAX_RULES = 500;
  LF.MAX_POPUPS = 50;
  LF.MAX_NAMES = 1000;
  LF.BOOST_ID = 'lf-boost';
  LF.BUILD = '1.3.1';

  LF.siteKey = hostname => String(hostname || '').toLowerCase().replace(/^www\./, '');
  LF.storageKey = host => LF.SITE_PREFIX + host;
  LF.uid = prefix => (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  LF.emptySite = () => ({
    v: 1,
    enabled: true,
    popupsEnabled: true,
    forceImportant: true,
    rules: [],
    css: '',
    cssC: '',
    cssSrc: '',
    popups: [],
    names: [],
    rev: '',
    updated: 0
  });

  LF.splitTopLevel = (text, separator) => {
    const parts = [];
    let depth = 0;
    let quote = '';
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quote) {
        if (c === '\\') i++;
        else if (c === quote) quote = '';
        continue;
      }
      if (c === '"' || c === "'") quote = c;
      else if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth = Math.max(0, depth - 1);
      else if (c === separator && depth === 0) {
        parts.push(text.slice(start, i));
        start = i + 1;
      }
    }
    parts.push(text.slice(start));
    return parts;
  };

  LF.isBalanced = text => {
    const stack = [];
    const pairs = { ')': '(', ']': '[' };
    let quote = '';
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quote) {
        if (c === '\\') i++;
        else if (c === quote) quote = '';
        continue;
      }
      if (c === '"' || c === "'") quote = c;
      else if (c === '(' || c === '[') stack.push(c);
      else if (c === ')' || c === ']') {
        if (stack.pop() !== pairs[c]) return false;
      }
    }
    return !quote && stack.length === 0;
  };

  LF.cleanValue = value => {
    let text = typeof value === 'string' ? value : String(value == null ? '' : value);
    text = text.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
    text = text.replace(/\s*!important\s*$/i, '').trim();
    return text;
  };

  LF.isSafeValue = value =>
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 2000 &&
    !/[{}]|\/\*|\*\/|@import/i.test(value) &&
    LF.isBalanced(value) &&
    LF.splitTopLevel(value, ';').length === 1;

  LF.isSafeProp = prop =>
    typeof prop === 'string' &&
    prop.length <= 80 &&
    /^(--[A-Za-z0-9_-]+|[a-z][a-z0-9-]*)$/i.test(prop);

  LF.normalizeSelector = selector => String(selector || '').replace(/\s+/g, ' ').trim();

  LF.isSafeSelector = selector => {
    if (typeof selector !== 'string') return false;
    const text = LF.normalizeSelector(selector);
    if (!text || text.length > 2000) return false;
    if (/[{};@<]|\/\*|\*\//.test(text)) return false;
    if (!LF.isBalanced(text)) return false;
    return LF.splitTopLevel(text, ',').every(part => part.trim().length > 0);
  };

  const ROOT_SELECTORS = new Set([
    'html', 'body', ':root', '*', 'html body', 'html > body', 'html>body', ':root > body', ':root body', 'html *', 'body *'
  ]);

  LF.isRootSelector = selector => ROOT_SELECTORS.has(LF.normalizeSelector(selector).toLowerCase());

  const ROOT_UNSAFE = {
    display: v => /^none$/i.test(v),
    visibility: v => /^(hidden|collapse)$/i.test(v),
    opacity: v => Number.parseFloat(v) <= 0.05,
    'pointer-events': v => /^none$/i.test(v),
    overflow: v => /hidden|clip/i.test(v),
    'overflow-x': v => /hidden|clip/i.test(v),
    'overflow-y': v => /hidden|clip/i.test(v),
    width: v => Number.parseFloat(v) === 0,
    height: v => Number.parseFloat(v) === 0
  };

  const declarationsFor = (declarations, rootish) => {
    const out = [];
    for (const [prop, raw] of Object.entries(declarations || {})) {
      if (!LF.isSafeProp(prop)) continue;
      const value = LF.cleanValue(raw);
      if (!LF.isSafeValue(value)) continue;
      if (rootish && ROOT_UNSAFE[prop] && ROOT_UNSAFE[prop](value)) continue;
      out.push(prop + ':' + value + ' !important');
    }
    return out.join(';');
  };

  const NO_BOOST = /::|:(before|after|first-line|first-letter|selection|placeholder|marker|backdrop)\b/i;

  const boostSelector = selector =>
    NO_BOOST.test(selector) ? selector : ':is(' + selector + '):not(#' + LF.BOOST_ID + '):not(#' + LF.BOOST_ID + ')';

  const compileRules = (rules, path, boost) => {
    const out = [];
    for (const rule of rules || []) {
      if (!rule || rule.on === false) continue;
      if (rule.page && rule.page !== path) continue;
      if (!LF.isSafeSelector(rule.sel)) continue;
      const selectors = LF.splitTopLevel(LF.normalizeSelector(rule.sel), ',').map(s => s.trim()).filter(Boolean);
      const body = declarationsFor(rule.d, selectors.some(LF.isRootSelector));
      if (!body) continue;
      for (const selector of selectors) {
        out.push((boost ? boostSelector(selector) : selector) + '{' + body + '}');
      }
    }
    return out.join('\n');
  };

  const GENERIC_HOST = /(^|[-_])(root|app|outer|portal|container|wrapper|layer|host|main|page|body|content|__next)([-_]|$)/i;

  const wordlike = token => {
    const parts = token.split(/[-_]+/).filter(Boolean).flatMap(part => part.split(/(?<=[a-z])(?=[A-Z])/));
    return (
      parts.length > 0 &&
      parts.every(part => /^[A-Za-z][a-z]{1,}$/.test(part) || /^\d{1,3}$/.test(part)) &&
      parts.some(part => /^[A-Za-z][a-z]{2,}$/.test(part))
    );
  };

  LF.isRiskyHide = selector => {
    const text = LF.normalizeSelector(selector);
    if (/:has\(/.test(text) || /\[[^\]]+\]/.test(text)) return false;
    const names = token => Array.from(text.matchAll(new RegExp('\\' + token + '((?:\\\\.|[\\w-])+)', 'g')), match => match[1]);
    const ids = names('#');
    const classes = names('.');
    if (!ids.length && !classes.length) return true;
    return ids.concat(classes).some(name => GENERIC_HOST.test(name) || !wordlike(name));
  };

  LF.normalizeHide = list =>
    Array.isArray(list)
      ? list
          .filter(selector => LF.isSafeSelector(selector))
          .map(LF.normalizeSelector)
          .filter(selector => !LF.isRootSelector(selector) && !LF.isRiskyHide(selector))
          .slice(0, 5)
      : [];

  const compilePopupHides = popups => {
    const out = [];
    for (const popup of popups || []) {
      if (!popup || popup.on === false) continue;
      for (const selector of LF.normalizeHide(popup.hide)) {
        out.push(selector + '{display:none !important}');
      }
    }
    return out.join('\n');
  };

  LF.compile = (site, context) => {
    const sheets = [];
    if (!site) return sheets;
    const ctx = context || {};
    const top = ctx.top !== false;
    const path = ctx.path || '';
    const boost = Boolean(ctx.boost);
    if (site.enabled !== false && top) {
      const layers = compileRules(site.rules, path, boost);
      if (layers) sheets.push(layers);
      const custom = site.forceImportant === false ? site.css : site.cssC;
      if (typeof custom === 'string' && custom.trim()) sheets.push(custom);
    }
    if (site.popupsEnabled !== false) {
      const hides = compilePopupHides(site.popups);
      if (hides) sheets.push(hides);
    }
    return sheets;
  };

  const normalizeRule = raw => {
    if (!raw || typeof raw !== 'object') return null;
    if (!LF.isSafeSelector(raw.sel)) return null;
    const declarations = {};
    if (raw.d && typeof raw.d === 'object') {
      for (const [prop, value] of Object.entries(raw.d)) {
        const clean = LF.cleanValue(value);
        if (LF.isSafeProp(prop) && LF.isSafeValue(clean)) declarations[prop] = clean;
      }
    }
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : LF.uid('r'),
      name: typeof raw.name === 'string' ? raw.name.slice(0, 120) : '',
      sel: LF.normalizeSelector(raw.sel),
      on: raw.on !== false,
      locked: raw.locked === true,
      page: typeof raw.page === 'string' ? raw.page.slice(0, 500) : '',
      d: declarations,
      created: Number(raw.created) || 0
    };
  };

  const normalizePopup = raw => {
    if (!raw || typeof raw !== 'object') return null;
    const close = LF.isSafeSelector(raw.close) ? LF.normalizeSelector(raw.close) : '';
    const hide = LF.normalizeHide(raw.hide);
    if (!close && !hide.length) return null;
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : LF.uid('p'),
      name: typeof raw.name === 'string' ? raw.name.slice(0, 120) : '',
      on: raw.on !== false,
      strategy: raw.strategy === 'hide' ? 'hide' : 'click',
      close,
      hide,
      label: typeof raw.label === 'string' ? raw.label.slice(0, 80) : '',
      added: Number(raw.added) || 0
    };
  };

  const normalizeName = raw => {
    if (!raw || typeof raw !== 'object') return null;
    if (!LF.isSafeSelector(raw.sel)) return null;
    const name = typeof raw.name === 'string' ? raw.name.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 120) : '';
    if (!name) return null;
    return { sel: LF.normalizeSelector(raw.sel), name };
  };

  LF.normalizeSite = raw => {
    const site = LF.emptySite();
    if (!raw || typeof raw !== 'object') return site;
    site.enabled = raw.enabled !== false;
    site.popupsEnabled = raw.popupsEnabled !== false;
    site.forceImportant = raw.forceImportant !== false;
    site.css = typeof raw.css === 'string' ? raw.css.slice(0, 500000) : '';
    site.cssC = typeof raw.cssC === 'string' ? raw.cssC.slice(0, 600000) : '';
    site.cssSrc = typeof raw.cssSrc === 'string' ? raw.cssSrc.slice(0, 500000) : '';
    site.rev = typeof raw.rev === 'string' ? raw.rev : '';
    site.updated = Number(raw.updated) || 0;
    if (Array.isArray(raw.rules)) {
      site.rules = raw.rules.map(normalizeRule).filter(Boolean).slice(0, LF.MAX_RULES);
    }
    if (Array.isArray(raw.popups)) {
      site.popups = raw.popups.map(normalizePopup).filter(Boolean).slice(0, LF.MAX_POPUPS);
    }
    if (Array.isArray(raw.names)) {
      const seen = new Set();
      site.names = raw.names
        .map(normalizeName)
        .filter(item => {
          if (!item || seen.has(item.sel)) return false;
          seen.add(item.sel);
          return true;
        })
        .slice(0, LF.MAX_NAMES);
    }
    return site;
  };

  LF.normalizeLayout = raw => {
    const layout = { toolbar: null, panel: null, dock: 'right' };
    if (!raw || typeof raw !== 'object') return layout;
    const finite = value => typeof value === 'number' && Number.isFinite(value);
    const limit = value => Math.min(Math.max(value, -20000), 20000);
    const toolbar = raw.toolbar;
    if (toolbar && finite(toolbar.x) && finite(toolbar.y)) {
      layout.toolbar = { x: limit(toolbar.x), y: limit(toolbar.y) };
    }
    const panel = raw.panel;
    if (panel && finite(panel.x) && finite(panel.y) && finite(panel.w) && finite(panel.h)) {
      layout.panel = { x: limit(panel.x), y: limit(panel.y), w: Math.min(Math.max(panel.w, 1), 20000), h: Math.min(Math.max(panel.h, 1), 20000) };
    }
    if (raw.dock === 'left') layout.dock = 'left';
    return layout;
  };

  LF.BACKUP_APP = 'livefly';
  LF.BACKUP_VERSION = 1;
  LF.BACKUP_LIMIT = 32 * 1024 * 1024;

  LF.buildBackup = (sites, now) => ({ app: LF.BACKUP_APP, version: LF.BACKUP_VERSION, exported: now, sites });

  LF.parseBackup = (text, now) => {
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    if (!data || data.app !== LF.BACKUP_APP || !data.sites || typeof data.sites !== 'object' || Array.isArray(data.sites)) {
      throw new Error('This file is not a livefly backup.');
    }
    const restored = {};
    for (const [host, raw] of Object.entries(data.sites)) {
      const clean = LF.siteKey(host);
      if (!/^[a-z0-9.-]+$/.test(clean)) continue;
      const site = LF.normalizeSite(raw);
      site.rev = LF.uid('v');
      site.updated = now;
      restored[clean] = site;
    }
    return restored;
  };

  LF.hasContent = site =>
    Boolean(site) &&
    (site.rules.some(r => Object.keys(r.d).length > 0) ||
      site.css.trim().length > 0 ||
      site.popups.length > 0 ||
      (site.names || []).length > 0);

  LF.countActive = site => {
    if (!site) return 0;
    let count = 0;
    if (site.enabled !== false) count += site.rules.filter(r => r.on !== false && Object.keys(r.d).length > 0).length;
    if (site.popupsEnabled !== false) count += site.popups.filter(p => p.on !== false).length;
    return count;
  };

  LF.parseDeclarations = text => {
    const out = {};
    for (const part of LF.splitTopLevel(String(text || ''), ';')) {
      const index = part.indexOf(':');
      if (index < 1) continue;
      let prop = part.slice(0, index).trim();
      if (!prop.startsWith('--')) prop = prop.toLowerCase();
      const value = LF.cleanValue(part.slice(index + 1));
      if (LF.isSafeProp(prop) && LF.isSafeValue(value)) out[prop] = value;
    }
    return out;
  };

  LF.stringifyDeclarations = declarations =>
    Object.entries(declarations || {}).map(([prop, value]) => prop + ': ' + value + ';').join('\n');

  const isStyleLike = rule =>
    (typeof CSSStyleRule !== 'undefined' && rule instanceof CSSStyleRule) ||
    (typeof CSSNestedDeclarations !== 'undefined' && rule instanceof CSSNestedDeclarations);

  LF.importantify = css => {
    if (typeof css !== 'string' || !css.trim()) return '';
    if (typeof CSSStyleSheet !== 'function') return css;
    let sheet;
    try {
      sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
    } catch {
      return css;
    }
    const walk = rules => {
      for (const rule of rules) {
        if (isStyleLike(rule)) {
          const style = rule.style;
          for (const name of Array.from(style)) {
            style.setProperty(name, style.getPropertyValue(name), 'important');
          }
        }
        const skip = typeof CSSKeyframesRule !== 'undefined' && rule instanceof CSSKeyframesRule;
        if (rule.cssRules && !skip) walk(rule.cssRules);
      }
    };
    walk(sheet.cssRules);
    return Array.from(sheet.cssRules, rule => rule.cssText).join('\n');
  };

  LF.prepareCss = site => {
    if (site.forceImportant !== false && (site.cssSrc !== site.css || (!site.cssC && site.css))) {
      site.cssC = LF.importantify(site.css);
      site.cssSrc = site.css;
    }
    return site;
  };

  LF.send = message =>
    new Promise(resolve => {
      try {
        chrome.runtime.sendMessage(message, response => {
          void chrome.runtime.lastError;
          resolve(response);
        });
      } catch {
        resolve(undefined);
      }
    });

  LF.patch = (host, patch) => LF.send({ t: 'patch', host, patch });
})(typeof self !== 'undefined' ? self : globalThis);
