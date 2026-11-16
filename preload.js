const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  getAlarms: () => ipcRenderer.invoke('alarms:get'),
  saveAlarm: (a) => ipcRenderer.invoke('alarms:save', a),
  removeAlarm: (id) => ipcRenderer.invoke('alarms:remove', id),
  toggleAlarm: (id, on) => ipcRenderer.invoke('alarms:toggle', id, on),
  onAlarmsChanged: (cb) => ipcRenderer.on('alarms:changed', (_e, l) => cb(l)),
  testToast: (p) => ipcRenderer.send('toast:test', p),
  // eye rest / break timer
  getEyeRest: () => ipcRenderer.invoke('eyeRest:get'),
  saveEyeRest: (c) => ipcRenderer.invoke('eyeRest:save', c),
  toggleEyeRest: (on) => ipcRenderer.invoke('eyeRest:toggle', on),
  onEyeRestChanged: (cb) => ipcRenderer.on('eyeRest:changed', (_e, d) => cb(d)),
  // toast window
  onToast: (cb) => ipcRenderer.on('toast-data', (_e, d) => cb(d)),
  onPlay: (cb) => ipcRenderer.on('toast-play', () => cb()),
  onDismiss: (cb) => ipcRenderer.on('toast-dismiss', () => cb()),
  size: (h) => ipcRenderer.send('toast-size', h),
  action: (a) => ipcRenderer.send('toast-action', a),
  close: () => ipcRenderer.send('toast-close'),

  // floating shortcut
  floating: {
    startDrag: (pos) => ipcRenderer.send('floating:drag-start', pos),
    moveDrag: (pos) => ipcRenderer.send('floating:drag-move', pos),
    endDrag: () => ipcRenderer.send('floating:drag-end'),
    expand: () => ipcRenderer.send('floating:expand'),
    onDeleteHover: (cb) => ipcRenderer.on('floating:delete-hover', (_e, h) => cb(h)),
    onDeleteAnimate: (cb) => ipcRenderer.on('floating:delete-animate', () => cb()),
    onPopIn: (cb) => ipcRenderer.on('floating:pop-in', () => cb())
  },
  onDeleteHoverState: (cb) => ipcRenderer.on('delete:hover-state', (_e, h) => cb(h)),
  getFloatingState: () => ipcRenderer.invoke('floating:get'),
  toggleFloating: (enabled) => ipcRenderer.invoke('floating:toggle', enabled),
  onFloatingChanged: (cb) => ipcRenderer.on('floating:changed', (_e, s) => cb(s))
});
