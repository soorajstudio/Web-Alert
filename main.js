const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const PAD = 26, TOAST_W = 460;
let db = {
  alarms: [],
  autoStart: true,
  hintShown: false,
  eyeRest: {
    enabled: false,
    workMin: 45,
    breakMin: 5,
    title: 'Eye Rest Reminder',
    message: 'Close your eyes for 5 minutes and relax.',
    sound: 'gentle',
    style: 'capsule',
    position: 'center',
    nextFire: 0
  }
};
let mainWin, tray, quitting = false;
const toasts = [];
const pad = (n) => String(n).padStart(2, '0');
const dbFile = () => path.join(app.getPath('userData'), 'alarms.json');

function loadDb() {
  try {
    const raw = JSON.parse(fs.readFileSync(dbFile(), 'utf8'));
    db = { ...db, ...raw, eyeRest: { ...db.eyeRest, ...(raw.eyeRest || {}) } };
    if (db.eyeRest && db.eyeRest.style !== 'island') db.eyeRest.style = 'capsule';
    if (Array.isArray(db.alarms)) {
      db.alarms.forEach(a => { if (a.style !== 'island') a.style = 'capsule'; });
    }
  } catch {}
}
function saveDb() {
  try { fs.writeFileSync(dbFile(), JSON.stringify(db, null, 2)); } catch (e) { console.error(e); }
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('alarms:changed', db.alarms);
    mainWin.webContents.send('eyeRest:changed', db.eyeRest);
  }
}

/* ---------- scheduler ---------- */
function tick() {
  const now = new Date();
  const hhmm = pad(now.getHours()) + ':' + pad(now.getMinutes());
  const key = now.toDateString() + hhmm;
  const dow = (now.getDay() + 6) % 7; // 0 = Monday
  let changed = false;
  for (const a of db.alarms) {
    if (a.snoozeUntil && now.getTime() >= a.snoozeUntil) { a.snoozeUntil = 0; fire(a); changed = true; continue; }
    if (!a.enabled) continue;
    if (a.time === hhmm && a.lastFired !== key && (!a.days.length || a.days.includes(dow))) {
      a.lastFired = key;
      if (!a.days.length) a.enabled = false; // one-time alarm turns itself off
      fire(a); changed = true;
    }
  }

  // Eye rest / Break scheduler
  if (db.eyeRest && db.eyeRest.enabled) {
    const nowMs = now.getTime();
    if (!db.eyeRest.nextFire) {
      db.eyeRest.nextFire = nowMs + (Number(db.eyeRest.workMin) || 45) * 60000;
      changed = true;
    } else if (nowMs >= db.eyeRest.nextFire) {
      showToast({
        title: db.eyeRest.title || 'Eye Rest Reminder',
        description: db.eyeRest.message || 'Close your eyes for 5 minutes and relax.',
        sound: db.eyeRest.sound || 'gentle',
        style: db.eyeRest.style || 'capsule',
        position: db.eyeRest.position || 'center',
        snoozeMin: Number(db.eyeRest.breakMin) || 5,
        isEyeRest: true
      });
      db.eyeRest.nextFire = nowMs + (Number(db.eyeRest.workMin) || 45) * 60000;
      changed = true;
    }
  }

  if (changed) saveDb();
}
function fire(a) {
  showToast({ alarmId: a.id, title: a.title, description: a.description, time: a.time, sound: a.sound, snoozeMin: a.snoozeMin, style: a.style });
}

/* ---------- popup notifications ---------- */
function layout() {
  const wa = screen.getPrimaryDisplay().workArea;
  const W = TOAST_W + PAD * 2;
  let cumTop = 0;
  for (const t of toasts) {
    if (!t.h || t.win.isDestroyed()) continue;
    if (t.position === 'center') {
      t.win.setBounds({
        x: Math.round(wa.x + (wa.width - W) / 2),
        y: Math.round(wa.y + (wa.height - t.h) / 2),
        width: W,
        height: t.h
      });
    } else {
      t.win.setBounds({
        x: Math.round(wa.x + (wa.width - W) / 2),
        y: Math.round(wa.y + 14 - PAD + cumTop),
        width: W,
        height: t.h
      });
      cumTop += t.h - PAD * 2 + 10;
    }
  }
}
function showToast(p) {
  const win = new BrowserWindow({
    width: TOAST_W + PAD * 2, height: 320, show: false, frame: false, transparent: true,
    alwaysOnTop: true, skipTaskbar: true, focusable: false, resizable: false, hasShadow: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, autoplayPolicy: 'no-user-gesture-required' }
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  const t = {
    win,
    h: 0,
    id: win.webContents.id,
    alarmId: p.alarmId,
    snoozeMin: p.snoozeMin,
    position: p.position || 'top',
    isEyeRest: !!p.isEyeRest,
    closing: false
  };
  toasts.push(t);
  win.loadFile('toast.html');
  win.webContents.once('did-finish-load', () => win.webContents.send('toast-data', p));
}
function dismiss(t) {
  if (!t || t.closing || t.win.isDestroyed()) return;
  t.closing = true;
  t.win.webContents.send('toast-dismiss');
  setTimeout(() => remove(t), 1500);
}
function remove(t) {
  const i = toasts.indexOf(t); if (i >= 0) toasts.splice(i, 1);
  if (!t.win.isDestroyed()) t.win.destroy();
  layout();
}
const byId = (e) => toasts.find(t => t.id === e.sender.id);
ipcMain.on('toast-size', (e, h) => { const t = byId(e); if (!t) return; t.h = Math.ceil(h) + PAD * 2; layout(); t.win.showInactive(); t.win.webContents.send('toast-play'); });
ipcMain.on('toast-close', (e) => { const t = byId(e); if (t) remove(t); });
ipcMain.on('toast-action', (e, action) => {
  const t = byId(e); if (!t) return;
  if (action === 'snooze') {
    if (t.alarmId) {
      const a = db.alarms.find(x => x.id === t.alarmId);
      if (a) { a.snoozeUntil = Date.now() + (t.snoozeMin || 10) * 60000; saveDb(); }
    } else if (t.isEyeRest && db.eyeRest) {
      db.eyeRest.nextFire = Date.now() + (t.snoozeMin || 5) * 60000;
      saveDb();
    }
  }
  dismiss(t);
});
ipcMain.on('toast:test', (_e, p) => showToast({ ...p, alarmId: null }));

/* ---------- eye rest break data ---------- */
ipcMain.handle('eyeRest:get', () => db.eyeRest);
ipcMain.handle('eyeRest:save', (_e, cfg) => {
  const prevEnabled = db.eyeRest.enabled;
  db.eyeRest = {
    ...db.eyeRest,
    ...cfg,
    workMin: Math.max(1, Number(cfg.workMin) || 45),
    breakMin: Math.max(1, Number(cfg.breakMin) || 5),
    title: String(cfg.title || 'Eye Rest Reminder').trim(),
    message: String(cfg.message || 'Close your eyes for 5 minutes and relax.').trim(),
    sound: cfg.sound || 'gentle',
    style: cfg.style === 'island' ? 'island' : 'capsule',
    position: cfg.position || 'center',
    enabled: !!cfg.enabled
  };
  if (db.eyeRest.enabled && (!prevEnabled || !db.eyeRest.nextFire)) {
    db.eyeRest.nextFire = Date.now() + db.eyeRest.workMin * 60000;
  } else if (!db.eyeRest.enabled) {
    db.eyeRest.nextFire = 0;
  }
  saveDb();
  return db.eyeRest;
});
ipcMain.handle('eyeRest:toggle', (_e, on) => {
  db.eyeRest.enabled = !!on;
  db.eyeRest.nextFire = on ? Date.now() + (Number(db.eyeRest.workMin) || 45) * 60000 : 0;
  saveDb();
  return db.eyeRest;
});

/* ---------- alarm data ---------- */
ipcMain.handle('alarms:get', () => db.alarms);
ipcMain.handle('alarms:save', (_e, a) => {
  const clean = {
    id: a.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    time: /^\d{2}:\d{2}$/.test(a.time) ? a.time : '08:00',
    title: String(a.title || '').trim().slice(0, 100) || 'Alarm',
    description: String(a.description || '').trim().slice(0, 500),
    days: [...new Set((a.days || []).filter(d => d >= 0 && d <= 6))].sort(),
    sound: a.sound || 'chime', snoozeMin: Number(a.snoozeMin) || 10,
    style: a.style === 'island' ? 'island' : 'capsule',
    enabled: a.enabled !== false, snoozeUntil: 0, lastFired: ''
  };
  const i = db.alarms.findIndex(x => x.id === clean.id);
  if (i >= 0) db.alarms[i] = clean; else db.alarms.push(clean);
  saveDb(); return db.alarms;
});
ipcMain.handle('alarms:remove', (_e, id) => { db.alarms = db.alarms.filter(a => a.id !== id); saveDb(); return db.alarms; });
ipcMain.handle('alarms:toggle', (_e, id, on) => {
  const a = db.alarms.find(x => x.id === id);
  if (a) { a.enabled = on; a.snoozeUntil = 0; if (on) a.lastFired = ''; }
  saveDb(); return db.alarms;
});

/* ---------- main window / tray ---------- */
function createWindow(hidden) {
  mainWin = new BrowserWindow({
    width: 940, height: 720, minWidth: 520, minHeight: 420, show: false, title: 'PopNotify',
    backgroundColor: '#2b2826', autoHideMenuBar: true,
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#2b2826', symbolColor: '#ffffff', height: 36 },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, autoplayPolicy: 'no-user-gesture-required' }
  });
  mainWin.setMenuBarVisibility(false);
  mainWin.loadFile('index.html');
  mainWin.once('ready-to-show', () => { if (!hidden) mainWin.show(); });
  mainWin.on('close', (e) => {
    if (quitting) return;
    e.preventDefault(); mainWin.hide();
    if (!db.hintShown) {
      db.hintShown = true; saveDb();
      showToast({ title: 'Still running in the background', description: 'Your alarms will keep working. Use the tray icon to open or quit PopNotify.', sound: 'none' });
    }
  });
}
function showMain() { if (!mainWin || mainWin.isDestroyed()) createWindow(false); else { mainWin.show(); mainWin.focus(); } }
function applyAutoStart() {
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!db.autoStart, args: ['--hidden'] });
}
function buildTray() {
  try {
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png')).resize({ width: 16, height: 16 }));
    tray.setToolTip('PopNotify');
    const menu = () => Menu.buildFromTemplate([
      { label: 'Open PopNotify', click: showMain },
      { label: 'Start with Windows', type: 'checkbox', checked: !!db.autoStart, click: (i) => { db.autoStart = i.checked; saveDb(); applyAutoStart(); } },
      { type: 'separator' },
      { label: 'Quit', click: () => { quitting = true; app.quit(); } }
    ]);
    tray.setContextMenu(menu());
    tray.on('click', showMain);
  } catch (err) {
    console.warn('Tray init skipped or failed:', err);
  }
}

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', showMain);
app.on('window-all-closed', () => {});
app.on('before-quit', () => { quitting = true; });
app.whenReady().then(() => {
  app.setAppUserModelId('com.popnotify.app');
  loadDb();
  createWindow(process.argv.includes('--hidden'));
  buildTray(); applyAutoStart();
  setInterval(tick, 1000);
  if (process.argv.includes('--test-toast')) {
    setTimeout(() => {
      showToast({ title: 'Tesing', description: 'Lakalaka', time: '14:16', sound: 'none', snoozeMin: 10, alarmId: 'demo' });
    }, 600);
  }
});
