// Runs in each OneMES page of the embedded view. While the view is not on screen
// (any page other than Trình duyệt) Chromium paints no frames, so requestAnimationFrame
// never fires and page code waiting on it would stall. A timer stands in for the frame.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

try {
  contextBridge.executeInMainWorld({
    func: () => {
      const raf = window.requestAnimationFrame.bind(window);
      const caf = window.cancelAnimationFrame.bind(window);
      const live = new Map();
      let n = 0;
      window.requestAnimationFrame = (cb) => {
        const id = ++n;
        const run = (t) => {
          const x = live.get(id);
          if (!x) return;
          live.delete(id);
          caf(x.r);
          clearTimeout(x.s);
          cb(t);
        };
        live.set(id, { r: raf(run), s: setTimeout(() => run(performance.now()), 50) });
        return id;
      };
      window.cancelAnimationFrame = (id) => {
        const x = live.get(id);
        if (!x) return;
        live.delete(id);
        caf(x.r);
        clearTimeout(x.s);
      };
    },
  });
} catch (e) {
  // Older runtime without executeInMainWorld: pages still work, only rAF stays native.
}

// 0.6.0: when the user logs in to OneMES by hand, the account they typed goes to the
// app, which keeps it (encrypted) only once the next page shows the login worked.
// Only on a login page: a password box on a page without the session id.
(() => {
  const shown = (el) => !!el && el.offsetParent !== null;
  const onLoginPage = () => /login|dangnhap/i.test(location.href) || !/usid=/i.test(location.href);
  function grab() {
    try {
      if (!onLoginPage()) return;
      const pw = [...document.querySelectorAll('input[type=password]')].find((x) => shown(x) && x.value);
      if (!pw) return;
      const scope = pw.form || document;
      const users = [...scope.querySelectorAll('input')].filter(
        (x) => /^(text|email|tel|)$/i.test(x.getAttribute('type') || '') && shown(x) && x.value && x.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING
      );
      const user = users.pop();
      if (user) ipcRenderer.send('syl:login-typed', { user: user.value, pass: pw.value });
    } catch (e) {}
  }
  document.addEventListener('submit', grab, true);
  document.addEventListener('click', (e) => {
    if (e.target && e.target.closest && e.target.closest('button, input[type=submit], input[type=button], input[type=image], a')) grab();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT') grab();
  }, true);
})();
