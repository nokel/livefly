(async () => {
  const $ = id => document.getElementById(id);

  const say = (text, error) => {
    const node = $('message');
    node.hidden = !text;
    node.textContent = text || '';
    node.classList.toggle('error', Boolean(error));
  };

  const cell = (text, className) => {
    const td = document.createElement('td');
    if (className) td.className = className;
    td.textContent = text;
    return td;
  };

  const render = async () => {
    const sites = (await LF.backup.readSites()).filter(entry => LF.hasContent(entry.site) || entry.site.enabled === false);
    $('count').textContent = String(sites.length);
    $('empty').hidden = sites.length > 0;
    const body = $('rows');
    body.textContent = '';
    for (const { host, site } of sites) {
      const row = document.createElement('tr');
      const nameCell = document.createElement('td');
      const link = document.createElement('a');
      link.href = 'https://' + host + '/';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = host;
      nameCell.append(link);
      const edits = site.rules.filter(rule => Object.keys(rule.d).length > 0).length;
      const toggleCell = document.createElement('td');
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = site.enabled;
      toggle.title = 'Apply edits on this site';
      toggle.addEventListener('change', () => LF.patch(host, { set: { enabled: toggle.checked } }));
      toggleCell.append(toggle);
      const actionCell = document.createElement('td');
      actionCell.className = 'act';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'danger';
      remove.textContent = 'Delete';
      remove.addEventListener('click', async () => {
        if (!confirm('Delete every edit for ' + host + '?')) return;
        await LF.patch(host, { reset: true });
      });
      actionCell.append(remove);
      row.append(
        nameCell,
        cell(String(edits), 'num'),
        cell(String(site.popups.length), 'num'),
        cell(site.css.trim() ? 'Yes' : '—', 'num'),
        toggleCell,
        actionCell
      );
      body.append(row);
    }
  };

  const settings = async () => {
    const stored = await chrome.storage.local.get(LF.SETTINGS_KEY);
    return stored[LF.SETTINGS_KEY] || {};
  };

  $('paused').checked = Boolean((await settings()).paused);
  $('paused').addEventListener('change', async () => {
    const current = await settings();
    await chrome.storage.local.set({ [LF.SETTINGS_KEY]: Object.assign({}, current, { paused: $('paused').checked }) });
  });

  LF.backup.bind($('export'), $('import'), $('file'), say);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') render();
  });

  await render();
})();
