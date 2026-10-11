(function (root) {
  const LF = root.LF;
  if (LF.dom && LF.dom.build === LF.BUILD) return;
  const dom = (LF.dom = { build: LF.BUILD });

  dom.qs = (selector, context) => {
    try {
      return (context || document).querySelector(selector);
    } catch {
      return null;
    }
  };

  dom.qsa = (selector, context) => {
    try {
      return Array.from((context || document).querySelectorAll(selector));
    } catch {
      return [];
    }
  };

  dom.countMatches = selector => {
    try {
      return document.querySelectorAll(selector).length;
    } catch {
      return -1;
    }
  };

  dom.isValidSelector = selector => {
    if (!LF.isSafeSelector(selector)) return false;
    try {
      document.createDocumentFragment().querySelector(selector);
      return true;
    } catch {
      return false;
    }
  };

  dom.matchesSafe = (element, selector) => {
    try {
      return element.matches(selector);
    } catch {
      return false;
    }
  };

  dom.h = (tag, attrs, ...children) => {
    const element = document.createElement(tag);
    const props = [];
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (value === null || value === undefined || value === false) continue;
        if (key === 'class') element.className = value;
        else if (key === 'text') element.textContent = value;
        else if (key.startsWith('on') && typeof value === 'function') element.addEventListener(key.slice(2), value);
        else if (key === 'value' || key === 'checked' || key === 'disabled' || key === 'selected') props.push([key, value]);
        else element.setAttribute(key, value === true ? '' : String(value));
      }
    }
    for (const child of children.flat(Infinity)) {
      if (child === null || child === undefined || child === false) continue;
      element.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    for (const [key, value] of props) element[key] = value;
    return element;
  };

  dom.shadowHost = cssText => {
    const host = document.createElement('livefly-root');
    host.style.cssText =
      'all:initial!important;position:fixed!important;left:0!important;top:0!important;right:0!important;bottom:0!important;' +
      'z-index:2147483647!important;pointer-events:none!important;display:block!important;contain:none!important;' +
      'transform:none!important;filter:none!important;opacity:1!important;visibility:visible!important';
    const shadow = host.attachShadow({ mode: 'closed' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(cssText);
    shadow.adoptedStyleSheets = [sheet];
    return { host, shadow };
  };

  const STATE_WORDS = /^(active|open|opened|close|closed|show|shown|hide|hidden|visible|selected|current|focus|focused|hover|hovered|loading|loaded|disabled|enabled|checked|expanded|collapsed|collapsing|collapse|fade|in|out|sticky|stuck|fixed|scrolled|animate|animated|lazy|lazyload|lazyloaded|lazyloading|ready|init|initialized|dark|light|mobile|desktop|touch|first|last|odd|even|clearfix)$/i;
  const STATE_PREFIX = /^(is|has|ng|state)-/i;
  const FRAMEWORK_PREFIX = /^(css|sc|jsx|svelte|astro|emotion|jss|styled)-[A-Za-z0-9]{4,}$/;
  const TEST_ATTRS = ['data-testid', 'data-test-id', 'data-test', 'data-qa', 'data-cy', 'data-automation-id', 'data-component', 'data-role', 'data-section', 'data-id'];
  const SOFT_ATTRS = ['role', 'aria-label', 'name', 'type', 'alt', 'title', 'placeholder', 'itemprop', 'for'];

  const randomSegment = segment =>
    segment.length >= 5 &&
    /\d/.test(segment) &&
    /[a-z]/i.test(segment) &&
    !/^\d+(px|em|rem|vw|vh|x|xl|xs|sm|md|lg)?$/i.test(segment);

  const mixedCaseNoise = segment => {
    if (!/^[A-Za-z]{5,10}$/.test(segment) || !/[a-z]/.test(segment) || !/[A-Z]/.test(segment)) return false;
    let changes = 0;
    for (let i = 1; i < segment.length; i++) {
      const prevUpper = segment[i - 1] === segment[i - 1].toUpperCase();
      const upper = segment[i] === segment[i].toUpperCase();
      if (prevUpper !== upper) changes++;
    }
    return changes >= 3;
  };

  const looksGenerated = token => {
    if (token.length > 40) return true;
    if (/\d{4,}/.test(token)) return true;
    if (FRAMEWORK_PREFIX.test(token)) return true;
    if (/^_[A-Za-z0-9]{5,}$/.test(token)) return true;
    return token.split(/[-_]/).some(segment => randomSegment(segment) || mixedCaseNoise(segment));
  };

  const isStableClass = token =>
    token.length >= 2 && !looksGenerated(token) && !STATE_WORDS.test(token) && !STATE_PREFIX.test(token);

  const isStableId = id =>
    id.length <= 60 && !looksGenerated(id) && !/[:\s]/.test(id) && !/^\d+$/.test(id);

  const modulePrefix = token => {
    const match = /^(.{3,}?__)[A-Za-z0-9_-]{4,12}$/.exec(token);
    return match && looksGenerated(token) ? match[1] : '';
  };

  const classTokens = element => {
    const raw = element.getAttribute('class');
    return raw ? raw.split(/\s+/).filter(Boolean) : [];
  };

  const quoteAttr = value => '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ') + '"';

  const compoundCandidates = element => {
    const tag = CSS.escape(element.localName);
    const out = [];
    const push = selector => {
      if (selector && !out.includes(selector)) out.push(selector);
    };
    if (element.id && isStableId(element.id)) push('#' + CSS.escape(element.id));
    for (const attr of TEST_ATTRS) {
      const value = element.getAttribute(attr);
      if (value && value.length <= 80) push(tag + '[' + attr + '=' + quoteAttr(value) + ']');
    }
    const tokens = classTokens(element);
    const stable = tokens.filter(isStableClass).slice(0, 3);
    stable.forEach((_, index) => {
      push(tag + stable.slice(0, index + 1).map(token => '.' + CSS.escape(token)).join(''));
    });
    if (stable.length) push('.' + CSS.escape(stable[0]));
    const prefix = tokens.map(modulePrefix).find(Boolean);
    if (prefix) push(tag + '[class*=' + quoteAttr(prefix) + ']');
    if (element.localName === 'a') {
      const href = (element.getAttribute('href') || '').trim().replace(/[?#].*$/, '');
      if (href && href.length <= 120) push('a[href=' + quoteAttr(href) + ']');
    }
    if (['img', 'iframe', 'source', 'video', 'audio', 'embed'].includes(element.localName)) {
      const src = (element.getAttribute('src') || '').trim();
      if (src && !src.startsWith('data:') && !src.startsWith('blob:')) {
        const clean = src.replace(/[?#].*$/, '');
        if (clean.length <= 120) push(tag + '[src=' + quoteAttr(clean) + ']');
      }
    }
    for (const attr of SOFT_ATTRS) {
      const value = element.getAttribute(attr);
      if (value && value.length <= 60) push(tag + '[' + attr + '=' + quoteAttr(value) + ']');
    }
    push(tag);
    return out;
  };

  const isUnique = (selector, element) => {
    try {
      const found = document.querySelectorAll(selector);
      return found.length === 1 && found[0] === element;
    } catch {
      return false;
    }
  };

  const nthPath = element => {
    const parts = [];
    let current = element;
    while (current && current.nodeType === 1 && current !== document.documentElement) {
      if (current === document.body) {
        parts.unshift('body');
        break;
      }
      if (current.id && isStableId(current.id) && isUnique('#' + CSS.escape(current.id), current)) {
        parts.unshift('#' + CSS.escape(current.id));
        break;
      }
      const tag = CSS.escape(current.localName);
      const parent = current.parentElement;
      let part = tag;
      if (parent) {
        const same = Array.from(parent.children).filter(child => child.localName === current.localName);
        if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(current) + 1) + ')';
      }
      parts.unshift(part);
      current = parent;
    }
    if (parts[0] !== 'body' && parts[0] && parts[0][0] !== '#') parts.unshift('html', 'body');
    return parts.join(' > ');
  };

  dom.selectorFor = element => {
    if (element === document.documentElement) return { sel: 'html', unique: true };
    if (element === document.body) return { sel: 'body', unique: true };
    const own = compoundCandidates(element);
    for (const candidate of own) {
      if (isUnique(candidate, element)) return { sel: candidate, unique: true };
    }
    let budget = 400;
    let ancestor = element.parentElement;
    let depth = 0;
    while (ancestor && ancestor !== document.documentElement && ancestor !== document.body && depth < 6 && budget > 0) {
      const anchors = compoundCandidates(ancestor).filter((c, i, all) => depth === 0 || i < all.length - 1);
      const combinator = depth === 0 ? ' > ' : ' ';
      for (const anchor of anchors) {
        for (const candidate of own) {
          if (budget-- <= 0) break;
          const selector = anchor + combinator + candidate;
          if (isUnique(selector, element)) return { sel: selector, unique: true };
        }
      }
      ancestor = ancestor.parentElement;
      depth++;
    }
    const path = nthPath(element);
    return { sel: path, unique: isUnique(path, element) };
  };

  dom.similarSelectorFor = element => {
    let best = null;
    for (const candidate of compoundCandidates(element)) {
      if (candidate[0] === '#') continue;
      const count = dom.countMatches(candidate);
      if (count < 2) continue;
      if (!best || count < best.count) best = { sel: candidate, count };
    }
    return best ? best.sel : dom.selectorFor(element).sel;
  };

  const LAYER_SKIP = new Set(['script', 'style', 'link', 'meta', 'noscript', 'template', 'base', 'head', 'title', 'br', 'wbr', 'livefly-root']);
  const HINT_ATTRS = ['data-testid', 'data-test-id', 'data-test', 'data-qa', 'data-cy', 'aria-label', 'role', 'name', 'alt', 'title', 'placeholder'];

  dom.cssName = element => {
    let name = element.localName;
    if (element.id) name += '#' + element.id;
    const raw = element.getAttribute('class');
    if (raw) {
      for (const token of raw.split(/\s+/)) {
        if (token) name += '.' + token;
      }
    }
    return name;
  };

  dom.hintFor = element => {
    for (const attr of HINT_ATTRS) {
      const value = (element.getAttribute(attr) || '').trim();
      if (value) return value.replace(/\s+/g, ' ').slice(0, 40);
    }
    let text = '';
    for (const node of element.childNodes) {
      if (node.nodeType !== 3) continue;
      text += node.data;
      if (text.length > 80) break;
    }
    text = text.trim().replace(/\s+/g, ' ');
    return text ? '“' + text.slice(0, 28) + '”' : '';
  };

  dom.layerChildren = element => Array.from(element.children).filter(child => !LAYER_SKIP.has(child.localName));

  dom.isLayer = element => Boolean(element) && element.nodeType === 1 && !LAYER_SKIP.has(element.localName);

  dom.isShown = element => {
    if (!element || !element.isConnected) return false;
    if (typeof element.checkVisibility === 'function') {
      const ok = element.checkVisibility({
        checkOpacity: true,
        checkVisibilityCSS: true,
        opacityProperty: true,
        visibilityProperty: true
      });
      if (!ok) return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const CLICKABLE =
    'button, a[href], [role="button"], [role="link"], input[type="button"], input[type="submit"], summary, [onclick], label[for]';

  dom.closestClickable = element => {
    let current = element;
    for (let depth = 0; current && current.nodeType === 1 && depth < 6; depth++) {
      if (current.matches(CLICKABLE)) return current;
      current = current.parentElement;
    }
    let top = element;
    for (let depth = 0; depth < 6; depth++) {
      if (getComputedStyle(top).cursor !== 'pointer') break;
      const parent = top.parentElement;
      if (!parent || parent === document.body || getComputedStyle(parent).cursor !== 'pointer') break;
      top = parent;
    }
    return top;
  };

  dom.topSvg = element => {
    let current = element;
    while (current && current.ownerSVGElement) current = current.ownerSVGElement;
    return current || element;
  };

  dom.ancestorScale = element => {
    let parent = element.parentElement;
    while (parent && !(parent.offsetWidth > 0 && parent.offsetHeight > 0)) parent = parent.parentElement;
    if (!parent) return { x: 1, y: 1 };
    const rect = parent.getBoundingClientRect();
    const clamp = value => (Number.isFinite(value) && value > 0.05 && value < 20 ? value : 1);
    return { x: clamp(rect.width / parent.offsetWidth), y: clamp(rect.height / parent.offsetHeight) };
  };

  dom.toHex = color => {
    const match = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i.exec(color || '');
    if (!match) return '#000000';
    return (
      '#' +
      [match[1], match[2], match[3]]
        .map(part => Math.max(0, Math.min(255, Math.round(Number(part)))).toString(16).padStart(2, '0'))
        .join('')
    );
  };

  dom.isTransparent = color => !color || color === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(color);

  dom.activate = element => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const anchor = element.closest('a[href]');
    const guard = event => {
      if (anchor && (event.target === element || element.contains(event.target))) {
        let sameDocument = false;
        try {
          const target = new URL(anchor.href, location.href);
          sameDocument = target.origin + target.pathname + target.search === location.origin + location.pathname + location.search;
        } catch {
          sameDocument = false;
        }
        if (!sameDocument) event.preventDefault();
      }
    };
    root.addEventListener('click', guard, true);
    const init = { bubbles: true, cancelable: true, composed: true, view: root, button: 0, clientX: x, clientY: y };
    try {
      element.dispatchEvent(new PointerEvent('pointerdown', { ...init, pointerType: 'mouse', isPrimary: true }));
      element.dispatchEvent(new MouseEvent('mousedown', init));
      element.dispatchEvent(new PointerEvent('pointerup', { ...init, pointerType: 'mouse', isPrimary: true }));
      element.dispatchEvent(new MouseEvent('mouseup', init));
      element.click();
    } finally {
      root.setTimeout(() => root.removeEventListener('click', guard, true), 50);
    }
  };

  const DIALOG_LIKE = '[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog[open]';

  dom.overlayCandidates = () => {
    const out = [];
    if (!document.body) return out;
    const viewportArea = Math.max(1, root.innerWidth * root.innerHeight);
    const nodes = document.body.querySelectorAll('*');
    for (const element of nodes) {
      if (out.length >= 60) break;
      const rect = element.getBoundingClientRect();
      if (rect.width < 60 || rect.height < 30) continue;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || Number.parseFloat(style.opacity) < 0.05) continue;
      const position = style.position;
      const dialogLike = element.matches(DIALOG_LIKE);
      const floating =
        position === 'fixed' ||
        position === 'sticky' ||
        (position === 'absolute' && Number.parseInt(style.zIndex, 10) >= 10);
      if (!floating && !dialogLike) continue;
      const coverage = (rect.width * rect.height) / viewportArea;
      if (coverage < 0.04 && !dialogLike) continue;
      out.push(element);
    }
    return out;
  };

  dom.nearestDialog = element => {
    const dialog = element.closest(DIALOG_LIKE);
    if (dialog) return dialog;
    let current = element.parentElement;
    for (let depth = 0; current && current !== document.body && depth < 12; depth++) {
      const style = getComputedStyle(current);
      if (style.position === 'fixed' || style.position === 'sticky') return current;
      current = current.parentElement;
    }
    return null;
  };

  dom.isScrollLocked = () => {
    const html = getComputedStyle(document.documentElement);
    const body = document.body ? getComputedStyle(document.body) : null;
    const locked = style => style && /hidden|clip/.test(style.overflowY + ' ' + style.overflow);
    return locked(html) || locked(body);
  };
})(globalThis);
