// Bridge for the UI: window.app.call(cmd, payload), window.app.onState(cb), window.app.onLog(cb).
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('app', {
  call: (cmd, payload) => ipcRenderer.invoke('call', cmd, payload),
  onState: (cb) => {
    const h = (_e, s) => cb(s);
    ipcRenderer.on('state', h);
    return () => ipcRenderer.removeListener('state', h);
  },
  onLog: (cb) => {
    // Lines arrive in batches; React groups the updates into one render.
    const h = (_e, list) => (Array.isArray(list) ? list : [list]).forEach((e) => cb(e));
    ipcRenderer.on('log', h);
    return () => ipcRenderer.removeListener('log', h);
  },
});
