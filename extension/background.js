/* Auto Logbook IPB: toolbar button. Holds no state of its own. */
const PORTAL = 'https://studentportal.ipb.ac.id/';

chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (tab && tab.id != null && tab.url && tab.url.startsWith(PORTAL)) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'alb:toggle' });
      } catch {
        // The tab was opened before the extension was installed or updated:
        // reload it so the content script runs, then open the panel.
        await chrome.storage.local.set({ 'alb.openRequest': Date.now() });
        await chrome.tabs.reload(tab.id);
      }
      return;
    }
    await chrome.storage.local.set({ 'alb.openRequest': Date.now() });
    await chrome.tabs.create({ url: `${PORTAL}Kegiatan/AktivitasKampusMerdeka` });
  } catch (err) {
    console.error('[Auto Logbook]', err);
  }
});
