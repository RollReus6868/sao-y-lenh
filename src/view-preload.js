// Runs in each OneMES page of the embedded view. While the view is not on screen
// (any page other than Trình duyệt) Chromium paints no frames, so requestAnimationFrame
// never fires and page code waiting on it would stall. A timer stands in for the frame.
'use strict';
const { contextBridge } = require('electron');

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
