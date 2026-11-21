/* Auto Logbook IPB: content-script entry point (runs on studentportal.ipb.ac.id). */
(function (ALB) {
  'use strict';

  if (window.top !== window || ALB.booted) return;
  ALB.booted = true;

  const ctx = ALB.portal.context(location, document);
  const panel = new ALB.Panel(ctx);
  ALB.panel = panel;

  if (ctx.kind === 'log') panel.launcher = ALB.ui.injectLauncher(() => panel.open());
  else if (ctx.kind === 'list') panel.launcher = ALB.ui.injectLauncher(() => panel.open(), { floating: true });

  // Toolbar button (see background.js).
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'alb:toggle') {
      panel.toggle();
      sendResponse({ ok: true, kind: ctx.kind });
    }
    return false;
  });

  // Open automatically after "open the panel" navigations (toolbar, activity picker).
  // Not on the login page: the request survives until the user is signed in.
  (async () => {
    if (ALB.portal.isLoginPage(location.href, document)) return;
    const at = await ALB.store.get(ALB.store.KEYS.openRequest, 0);
    if (at && Date.now() - at < 3 * 60 * 1000) {
      await ALB.store.remove(ALB.store.KEYS.openRequest);
      panel.open();
    }
  })();
})(globalThis.ALB);
