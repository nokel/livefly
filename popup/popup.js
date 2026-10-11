(async () => {
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const detached = params.has('tab');

  const sayTransfer = (text, error) => {
    const node = $('transferMessage');
    node.hidden = !text;
    node.textContent = text || '';
    node.classList.toggle('error', Boolean(error));
  };

  LF.backup.bind($('export'), $('import'), $('file'), sayTransfer);

  let tab = null;
  try {
    if (detached) tab = await chrome.tabs.get(Number(params.get('tab')));
    else [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    tab = null;
  }

  let url = null;
  try {
    url = tab && tab.url ? new URL(tab.url) : null;
  } catch {
    url = null;
  }

  if (!tab || !url || !/^https?:$/.test(url.protocol)) {
    $('unsupported').hidden = false;
    $('host').textContent = url ? url.protocol : '';
    return;
  }

  const host = LF.siteKey(url.hostname);
  const key = LF.storageKey(host);
  let site = LF.emptySite();
  $('host').textContent = host;
  $('host').title = host;
  $('main').hidden = false;

  const say = (text, error) => {
    const node = $('message');
    node.hidden = !text;
    node.textContent = text || '';
    node.classList.toggle('error', Boolean(error));
  };

  const finish = () => {
    if (!detached) window.close();
  };

  const renderPopups = () => {
    const list = $('popupList');
    list.textContent = '';
    $('popupCount').textContent = String(site.popups.length);
    if (!site.popups.length) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'None yet. Press Remember state while a popup is open.';
      list.append(empty);
      return;
    }
    for (const popup of site.popups) {
      const item = document.createElement('li');
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = popup.on !== false;
      toggle.addEventListener('change', () =>
        LF.patch(host, { updatePopup: { id: popup.id, changes: { on: toggle.checked } } }));
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = popup.name || popup.close;
      name.title = popup.close;
      const strategy = document.createElement('select');
      for (const [value, label] of [['click', 'Click close'], ['hide', 'Hide it']]) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        strategy.append(option);
      }
      strategy.value = popup.strategy;
      strategy.addEventListener('change', () =>
        LF.patch(host, { updatePopup: { id: popup.id, changes: { strategy: strategy.value } } }));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.title = 'Forget this popup';
      remove.addEventListener('click', () => LF.patch(host, { removePopup: popup.id }));
      item.append(toggle, name, strategy, remove);
      list.append(item);
    }
  };

  const render = () => {
    $('enabled').checked = site.enabled;
    $('popupsOn').checked = site.popupsEnabled;
    $('force').checked = site.forceImportant !== false;
    const edited = site.rules.filter(rule => Object.keys(rule.d).length > 0).length;
    const parts = [];
    parts.push(edited + ' edited element' + (edited === 1 ? '' : 's'));
    parts.push(site.popups.length + ' remembered popup' + (site.popups.length === 1 ? '' : 's'));
    $('summary').textContent = parts.join(' · ');
    if (document.activeElement !== $('css')) $('css').value = site.css;
    renderPopups();
  };

  const load = async () => {
    const stored = await chrome.storage.local.get(key);
    site = LF.normalizeSite(stored[key]);
    render();
  };

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[key]) return;
    site = LF.normalizeSite(changes[key].newValue);
    render();
  });

  $('edit').addEventListener('click', async () => {
    $('edit').disabled = true;
    const response = await LF.send({ t: 'editor:open', tabId: tab.id });
    if (response && response.ok) finish();
    else {
      $('edit').disabled = false;
      say((response && response.error) || 'Could not open the editor on this page. Reload the page and try again.', true);
    }
  });

  $('remember').addEventListener('click', async () => {
    const response = await LF.send({ t: 'record:begin', tabId: tab.id });
    if (response && response.ok) finish();
    else say('Could not start recording on this page. Reload the page and try again.', true);
  });

  $('enabled').addEventListener('change', () => LF.patch(host, { set: { enabled: $('enabled').checked } }));
  $('popupsOn').addEventListener('change', () => LF.patch(host, { set: { popupsEnabled: $('popupsOn').checked } }));

  let cssTimer = 0;
  const saveCss = async () => {
    const css = $('css').value;
    const force = $('force').checked;
    const cssC = force ? LF.importantify(css) : css;
    await LF.patch(host, { set: { css, cssC, cssSrc: css, forceImportant: force } });
    $('cssStatus').textContent = 'Saved';
  };

  $('css').addEventListener('input', () => {
    $('cssStatus').textContent = 'Saving…';
    clearTimeout(cssTimer);
    cssTimer = setTimeout(saveCss, 350);
  });

  $('force').addEventListener('change', saveCss);

  $('reset').addEventListener('click', async () => {
    if (!confirm('Remove every edit, custom CSS rule and remembered popup for ' + host + '?')) return;
    await LF.patch(host, { reset: true });
    say('This site has been reset.');
  });

  $('options').addEventListener('click', () => chrome.runtime.openOptionsPage());

  await load();
})();
