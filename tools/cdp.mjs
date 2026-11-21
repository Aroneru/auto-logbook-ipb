// Minimal Chrome DevTools Protocol client over --remote-debugging-pipe.
// Pipe mode is required to load an unpacked extension (Extensions.loadUnpacked)
// in branded Chrome, which ignores --load-extension since Chrome 137.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function findChrome() {
  const local = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe') : null;
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    local,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  const hit = candidates.find((p) => existsSync(p));
  if (!hit) throw new Error('Chrome not found; set CHROME_PATH');
  return hit;
}

export async function launch({ args = [], headless = true } = {}) {
  const userDataDir = mkdtempSync(join(tmpdir(), 'alb-chrome-'));
  const chromeArgs = [
    headless ? '--headless=new' : null,
    '--remote-debugging-pipe',
    '--enable-unsafe-extension-debugging',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-features=Translate,MediaRouter,OptimizationHints',
    '--mute-audio',
    ...args,
    'about:blank',
  ].filter(Boolean);
  const proc = spawn(findChrome(), chromeArgs, { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (d) => (stderr += d.toString()));

  const writer = proc.stdio[3];
  const reader = proc.stdio[4];
  let nextId = 0;
  const pending = new Map();
  const listeners = new Set();
  let buffer = Buffer.alloc(0);

  reader.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    let zero;
    while ((zero = buffer.indexOf(0)) >= 0) {
      const msg = JSON.parse(buffer.subarray(0, zero).toString('utf8'));
      buffer = buffer.subarray(zero + 1);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject, method } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
        else resolve(msg.result);
      } else {
        for (const fn of listeners) fn(msg);
      }
    }
  });

  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject, method });
      writer.write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
    });

  const on = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };

  const waitFor = (predicate, timeout = 15000, what = 'event') =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`timeout waiting for ${what}`));
      }, timeout);
      const off = on((msg) => {
        if (predicate(msg)) {
          clearTimeout(timer);
          off();
          resolve(msg);
        }
      });
    });

  // Make sure the browser answers before handing it out.
  await Promise.race([
    send('Browser.getVersion'),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Chrome did not start: ${stderr.slice(0, 500)}`)), 15000)),
  ]);

  async function close() {
    try {
      await Promise.race([send('Browser.close'), new Promise((r) => setTimeout(r, 3000))]);
    } catch {
      /* already gone */
    }
    proc.kill();
    await new Promise((r) => setTimeout(r, 300));
    try {
      rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      /* Windows may keep files locked for a moment */
    }
  }

  /** Open a page and return helpers bound to its session. */
  async function newPage(url = 'about:blank', { width = 1366, height = 900 } = {}) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const contexts = new Map();
    on((msg) => {
      if (msg.sessionId !== sessionId) return;
      if (msg.method === 'Runtime.executionContextCreated') contexts.set(msg.params.context.id, msg.params.context);
      if (msg.method === 'Runtime.executionContextDestroyed') contexts.delete(msg.params.executionContextId);
      if (msg.method === 'Runtime.executionContextsCleared') contexts.clear();
    });
    const s = (method, params) => send(method, params, sessionId);
    await s('Page.enable');
    await s('Runtime.enable');
    await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

    const page = {
      sessionId,
      targetId,
      send: s,
      contexts,
      async goto(u) {
        const loaded = waitFor((m) => m.sessionId === sessionId && m.method === 'Page.loadEventFired', 20000, `load ${u}`);
        await s('Page.navigate', { url: u });
        await loaded;
      },
      /**
       * Run a test-authored expression via CDP Runtime.evaluate inside the
       * headless test browser (main world, or the extension's isolated world).
       * Dev/test tooling only; never shipped in the extension.
       */
      async evaluate(expression, { world = 'main', timeout = 20000 } = {}) {
        let contextId;
        if (world === 'extension') {
          const deadline = Date.now() + timeout;
          while (!contextId && Date.now() < deadline) {
            const ctx = [...contexts.values()].find((c) => c.auxData && c.auxData.type === 'isolated' && /^chrome-extension:/.test(c.origin));
            if (ctx) contextId = ctx.id;
            else await new Promise((r) => setTimeout(r, 100));
          }
          if (!contextId) throw new Error('extension isolated world not found');
        }
        const res = await s('Runtime.evaluate', { expression, contextId, awaitPromise: true, returnByValue: true, userGesture: true });
        if (res.exceptionDetails) {
          const d = res.exceptionDetails;
          throw new Error(`eval failed: ${(d.exception && d.exception.description) || d.text}`);
        }
        return res.result.value;
      },
      async screenshot(path, clip) {
        const { data } = await s('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
        const { writeFileSync } = await import('node:fs');
        writeFileSync(path, Buffer.from(data, 'base64'));
      },
    };
    if (url && url !== 'about:blank') await page.goto(url);
    return page;
  }

  return { send, on, waitFor, close, newPage, proc, userDataDir };
}
