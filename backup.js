(function (root) {
  const LF = root.LF || (root.LF = {});

  const readSites = async () => {
    const all = await chrome.storage.local.get(null);
    const sites = [];
    for (const [key, value] of Object.entries(all)) {
      if (!key.startsWith(LF.SITE_PREFIX)) continue;
      sites.push({ host: key.slice(LF.SITE_PREFIX.length), site: LF.normalizeSite(value) });
    }
    sites.sort((a, b) => b.site.updated - a.site.updated || a.host.localeCompare(b.host));
    return sites;
  };

  const exportFile = async () => {
    const sites = {};
    for (const entry of await readSites()) {
      if (LF.hasContent(entry.site) || entry.site.enabled === false) sites[entry.host] = entry.site;
    }
    const count = Object.keys(sites).length;
    if (!count) return 0;
    const now = new Date();
    const blob = new Blob([JSON.stringify(LF.buildBackup(sites, now.getTime()), null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'livefly-saved-changes-' + now.toISOString().slice(0, 10) + '.json';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 60000);
    return count;
  };

  const importFile = async file => {
    if (file.size > LF.BACKUP_LIMIT) throw new Error('This file is not a livefly backup.');
    const restored = LF.parseBackup(await file.text(), Date.now());
    const writes = {};
    for (const [host, site] of Object.entries(restored)) writes[LF.storageKey(host)] = site;
    if (Object.keys(writes).length) await chrome.storage.local.set(writes);
    return Object.keys(writes).length;
  };

  const sitesText = count => count + ' site' + (count === 1 ? '' : 's');

  const bind = (exportButton, importButton, input, say) => {
    exportButton.addEventListener('click', async () => {
      try {
        const count = await exportFile();
        say(count ? 'Exported ' + sitesText(count) + '.' : 'Nothing to export yet. Edit a site first.');
      } catch (error) {
        say(String((error && error.message) || error), true);
      }
    });
    importButton.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files[0];
      input.value = '';
      if (!file) return;
      try {
        const count = await importFile(file);
        say(count ? 'Imported ' + sitesText(count) + '.' : 'That file has no sites in it.');
      } catch (error) {
        say(String((error && error.message) || error), true);
      }
    });
  };

  LF.backup = { readSites, exportFile, importFile, bind };
})(typeof self !== 'undefined' ? self : globalThis);
