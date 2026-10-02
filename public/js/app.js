// Helpers compartidos entre páginas. Nunca usar alert()/confirm()/prompt() nativos —
// siempre BT.toast / BT.confirm, que son modales propios de la web.
window.BT = (function(){
  function ensureToastEl(){
    let el = document.querySelector('.bt-toast');
    if (!el) { el = document.createElement('div'); el.className = 'bt-toast'; document.body.appendChild(el); }
    return el;
  }
  function toast(msg, ms){
    const el = ensureToastEl();
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('on'), ms || 2400);
  }

  function confirm({ title = 'Confirmar', message = '', okText = 'Confirmar', cancelText = 'Cancelar', danger = false } = {}){
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'bt-modal';
      wrap.innerHTML = `
        <div class="bt-backdrop"></div>
        <div class="bt-box">
          <h3>${title}</h3>
          <p>${message}</p>
          <div class="bt-actions">
            <button class="cancel">${cancelText}</button>
            <button class="${danger ? 'danger' : 'primary'} ok">${okText}</button>
          </div>
        </div>`;
      document.body.appendChild(wrap);
      const close = (val) => { wrap.remove(); resolve(val); };
      wrap.querySelector('.bt-backdrop').onclick = () => close(false);
      wrap.querySelector('.cancel').onclick = () => close(false);
      wrap.querySelector('.ok').onclick = () => close(true);
    });
  }

  async function api(url, opts){
    const r = await fetch(url, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts));
    let d = null;
    try { d = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error((d && d.error) || ('Error ' + r.status));
    return d;
  }

  // ---- Tema claro / oscuro ----
  const THEME_KEY = 'bitacora-theme';
  const SUN_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const MOON_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  function getTheme(){ try{ return localStorage.getItem(THEME_KEY); }catch(e){ return null; } }
  function isDark(){
    const t = getTheme();
    if (t) return t === 'dark';
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  function applyTheme(){
    const t = getTheme();
    if (t) document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    document.querySelectorAll('[data-theme-toggle]').forEach(btn => { btn.innerHTML = isDark() ? MOON_SVG : SUN_SVG; });
  }
  function setTheme(t){
    try{ if (t) localStorage.setItem(THEME_KEY, t); else localStorage.removeItem(THEME_KEY); }catch(e){}
    applyTheme();
  }
  function cycleTheme(){ setTheme(isDark() ? 'light' : 'dark'); }
  applyTheme();
  document.addEventListener('click', (e) => { if (e.target.closest('[data-theme-toggle]')) cycleTheme(); });

  // ---- Instalar como app (PWA) ----
  let deferredInstall = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
    showInstallBanner();
  });
  window.addEventListener('appinstalled', () => { hideInstallBanner(); deferredInstall = null; });

  function showInstallBanner(){
    if (document.getElementById('bt-install')) return;
    const bar = document.createElement('div');
    bar.id = 'bt-install';
    bar.innerHTML = `
      <img src="/icons/icon.svg" alt="">
      <div class="bt-install-text"><b>Instalar yesnow</b><span>Accedé más rápido desde tu pantalla de inicio</span></div>
      <button class="bt-install-go">Instalar</button>
      <button class="bt-install-x" aria-label="Cerrar">✕</button>`;
    document.body.appendChild(bar);
    bar.querySelector('.bt-install-go').onclick = async () => {
      hideInstallBanner();
      if (!deferredInstall) return;
      deferredInstall.prompt();
      await deferredInstall.userChoice;
      deferredInstall = null;
    };
    bar.querySelector('.bt-install-x').onclick = hideInstallBanner;
  }
  function hideInstallBanner(){
    const bar = document.getElementById('bt-install');
    if (bar) bar.remove();
  }

  // ---- Combobox: lista desplegable que acepta texto libre y evita duplicados ----
  const normTxt = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const escTxt = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  function combo(host, opts){
    const { value = '', getOptions, noun = 'opción', allowNone = false, noneLabel = 'Sin fase', placeholder = 'Elegir o escribir…' } = opts;
    host.classList.add('bt-combo');
    host.innerHTML = `<div class="bt-cbox"><input type="text" autocomplete="off" role="combobox" aria-expanded="false" placeholder="${escTxt(placeholder)}"><button type="button" class="bt-cbtn" tabindex="-1" aria-label="Ver opciones"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button></div><ul class="bt-clist" hidden></ul>`;
    const input = host.querySelector('input'), list = host.querySelector('.bt-clist'), btn = host.querySelector('.bt-cbtn');
    input.value = value;
    let entries = [], hl = 0;
    const exact = (q) => getOptions().find(o => normTxt(o) === normTxt(q));
    function paint(){
      list.innerHTML = entries.map((e, i) => `<li data-i="${i}" class="${e.cls}${i === hl ? ' hl' : ''}" role="option">${escTxt(e.label)}</li>`).join('');
      const cur = list.querySelector('.hl'); if (cur) cur.scrollIntoView({ block: 'nearest' });
    }
    function build(){
      const q = input.value, all = getOptions(), ex = exact(q);
      const shown = (!q.trim() || ex) ? all : all.filter(o => normTxt(o).includes(normTxt(q)));
      entries = [];
      if (allowNone && (!q.trim() || ex)) entries.push({ v: '', label: noneLabel, cls: 'none' });
      shown.forEach(o => entries.push({ v: o, label: o, cls: '' }));
      if (q.trim() && !ex) entries.push({ v: q.trim(), label: `+ Crear ${noun} «${q.trim()}»`, cls: 'new' });
      if (!entries.length) entries.push({ v: null, label: `Aún no hay ${noun}s. Escribe para crear una.`, cls: 'none' });
      const at = entries.findIndex(e => e.v !== null && ex && normTxt(e.v) === normTxt(q));
      hl = at >= 0 ? at : 0;
      paint();
    }
    const open = () => { build(); list.hidden = false; input.setAttribute('aria-expanded', 'true'); };
    const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); };
    function pick(i){ const e = entries[i]; if (!e || e.v === null) return; input.value = e.v; close(); }
    input.addEventListener('focus', open);
    input.addEventListener('input', open);
    btn.addEventListener('click', () => { if (list.hidden) { input.focus(); open(); } else close(); });
    list.addEventListener('mousedown', (e) => { e.preventDefault(); const li = e.target.closest('li'); if (li) pick(+li.dataset.i); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { if (list.hidden) open(); else { hl = Math.min(entries.length - 1, hl + 1); paint(); } e.preventDefault(); }
      else if (e.key === 'ArrowUp') { hl = Math.max(0, hl - 1); paint(); e.preventDefault(); }
      else if (e.key === 'Enter' && !list.hidden) { pick(hl); e.preventDefault(); }
      else if (e.key === 'Escape' && !list.hidden) { close(); e.stopPropagation(); }
    });
    input.addEventListener('blur', close);
    return { get value(){ const raw = input.value.trim(); return exact(raw) ?? raw; }, set value(v){ input.value = v; } };
  }

  // ---- Menú del avatar: Inversión, Cambiar PIN, Mis proyectos, Cerrar sesión ----
  const PROF_ICON = {
    chart: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    key: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    grid: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
    bell: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    out: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    eye: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeOff: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    checkBig: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    x: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  };

  // Campo de 4 casillas para un PIN. Devuelve { el, value, full, setError, reveal, focus }.
  function pinField(onChange){
    const el = document.createElement('div');
    el.className = 'bt-pin';
    el.innerHTML = [0,1,2,3].map(i => `<input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="off" aria-label="Dígito ${i+1}">`).join('');
    const boxes = [...el.querySelectorAll('input')];
    const value = () => boxes.map(b => b.value).join('');
    const sync = () => { boxes.forEach(b => b.classList.toggle('filled', !!b.value)); onChange && onChange(); };
    boxes.forEach((b, i) => {
      b.addEventListener('input', () => {
        b.value = b.value.replace(/\D/g, '').slice(-1);
        if (b.value && boxes[i + 1]) boxes[i + 1].focus();
        sync();
      });
      b.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !b.value && boxes[i - 1]) { boxes[i - 1].value = ''; boxes[i - 1].focus(); sync(); e.preventDefault(); }
        else if (e.key === 'ArrowLeft' && boxes[i - 1]) boxes[i - 1].focus();
        else if (e.key === 'ArrowRight' && boxes[i + 1]) boxes[i + 1].focus();
      });
      b.addEventListener('focus', () => b.select());
      b.addEventListener('paste', (e) => {
        const d = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 4);
        if (!d) return;
        e.preventDefault();
        boxes.forEach((x, k) => { x.value = d[k] || ''; });
        (boxes[Math.min(d.length, 3)]).focus(); sync();
      });
    });
    return {
      el, value, full: () => value().length === 4,
      setError(on){ el.classList.toggle('err', !!on); if (on) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); } },
      setOk(on){ el.classList.toggle('ok', !!on); },
      reveal(on){ boxes.forEach(b => { b.type = on ? 'text' : 'password'; }); },
      clear(){ boxes.forEach(b => { b.value = ''; b.classList.remove('filled'); }); },
      focus(){ boxes[0].focus(); },
    };
  }

  function changePin(){
    const wrap = document.createElement('div');
    wrap.className = 'bt-modal';
    wrap.innerHTML = `<div class="bt-backdrop"></div><div class="bt-box bt-pinbox" role="dialog" aria-label="Cambiar PIN">
      <button type="button" class="bt-pinx" aria-label="Cerrar">${PROF_ICON.x}</button>
      <div class="bt-pinhead"><div class="bt-pinico">${PROF_ICON.key}</div>
        <div><h3>Cambiar PIN</h3><p>Elige 4 dígitos. Es lo que usas para entrar.</p></div></div>
      <div class="bt-pinbody">
        <div class="bt-pinrow"><div class="bt-pintop"><span>PIN actual</span><button type="button" class="bt-pineye" aria-label="Mostrar u ocultar PIN">${PROF_ICON.eye}</button></div><div id="pnCur"></div><div class="bt-pinmsg" id="mCur"></div></div>
        <div class="bt-pinrow"><div class="bt-pintop"><span>PIN nuevo</span></div><div id="pnNew"></div><div class="bt-pinmsg" id="mNew"></div></div>
        <div class="bt-pinrow"><div class="bt-pintop"><span>Repite el PIN nuevo</span></div><div id="pnRep"></div><div class="bt-pinmsg" id="mRep"></div></div>
      </div>
      <button type="button" class="bt-pinsave" disabled>Guardar PIN</button>
    </div>`;
    document.body.appendChild(wrap);
    const box = wrap.querySelector('.bt-box');
    const $ = (s) => wrap.querySelector(s);
    const close = () => wrap.remove();
    wrap.querySelector('.bt-backdrop').onclick = close;
    $('.bt-pinx').onclick = close;
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

    let showing = false, busy = false;
    const cur = pinField(update), nw = pinField(update), rep = pinField(update);
    $('#pnCur').appendChild(cur.el); $('#pnNew').appendChild(nw.el); $('#pnRep').appendChild(rep.el);
    const msg = (id, text, kind) => { const m = $(id); m.textContent = text || ''; m.className = 'bt-pinmsg' + (kind ? ' ' + kind : ''); };
    $('.bt-pineye').onclick = () => { showing = !showing; [cur, nw, rep].forEach(f => f.reveal(showing)); $('.bt-pineye').innerHTML = showing ? PROF_ICON.eyeOff : PROF_ICON.eye; };

    function update(){
      cur.setError(false); msg('#mCur', '');
      nw.setError(false); nw.setOk(false); rep.setError(false); rep.setOk(false);
      let valid = cur.full() && nw.full() && rep.full();
      if (nw.full() && cur.full() && nw.value() === cur.value()) { nw.setError(true); msg('#mNew', 'Debe ser distinto al actual.', 'bad'); valid = false; }
      else if (nw.full()) { nw.setOk(true); msg('#mNew', ''); } else msg('#mNew', '');
      if (rep.full() && nw.full()) {
        if (rep.value() === nw.value()) { rep.setOk(true); msg('#mRep', 'Coinciden', 'good'); }
        else { rep.setError(true); msg('#mRep', 'No coinciden.', 'bad'); valid = false; }
      } else msg('#mRep', '');
      $('.bt-pinsave').disabled = !valid || busy;
    }

    async function save(){
      if ($('.bt-pinsave').disabled) return;
      busy = true; $('.bt-pinsave').disabled = true; $('.bt-pinsave').textContent = 'Guardando…';
      try {
        await api('/api/auth/pin', { method: 'POST', body: JSON.stringify({ actual: cur.value(), nuevo: nw.value() }) });
        box.innerHTML = `<div class="bt-pindone"><div class="bt-pinok">${PROF_ICON.checkBig}</div><h3>PIN actualizado</h3><p>La próxima vez entra con tu PIN nuevo.</p></div>`;
        setTimeout(close, 1700);
      } catch (e) {
        busy = false; $('.bt-pinsave').textContent = 'Guardar PIN';
        update();
        if (/actual/i.test(e.message)) { cur.clear(); cur.setError(true); msg('#mCur', e.message, 'bad'); cur.focus(); $('.bt-pinsave').disabled = true; }
        else toast(e.message);
      }
    }
    $('.bt-pinsave').onclick = save;
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    cur.focus();
  }

  // ---- Avisos push (notificaciones del dispositivo) ----
  const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  async function pushSub(){
    if (!pushSupported()) return null;
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  }
  function b64ToBytes(b64){
    const pad = '='.repeat((4 - b64.length % 4) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  }
  async function enablePush(){
    if (!pushSupported()) { toast('Este navegador no permite avisos'); return false; }
    const cfg = await api('/api/push/clave');
    if (!cfg.activo) { toast('Los avisos no están configurados en el servidor'); return false; }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('Permiso denegado. Actívalo en los ajustes del navegador'); return false; }
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(cfg.clave) });
    await api('/api/push/suscribir', { method: 'POST', body: JSON.stringify(sub.toJSON()) });
    const r = await api('/api/push/probar', { method: 'POST' });
    toast(r.enviados ? 'Avisos activados en este dispositivo' : 'Avisos activados');
    return true;
  }
  async function disablePush(){
    const sub = await pushSub();
    if (sub) { await api('/api/push/desuscribir', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
    toast('Avisos desactivados en este dispositivo');
  }

  // Invitación para activar avisos: solo en la lista de proyectos y el dashboard, mientras este dispositivo no los tenga.
  async function initPushBanner(){
    if (!/^\/(proyectos|proyecto\/[^/]+)\/?$/.test(location.pathname) || !pushSupported() || Notification.permission === 'denied') return;
    try { if (localStorage.getItem('bt-push-dismissed')) return; } catch (e) {}
    try { await api('/api/auth/me'); } catch (e) { return; }
    let sub = null;
    try { sub = await Promise.race([pushSub(), new Promise(r => setTimeout(() => r(null), 4000))]); } catch (e) {}
    if (sub && Notification.permission === 'granted') return;
    const bar = document.createElement('div');
    bar.className = 'bt-pushbar'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Activar avisos');
    bar.innerHTML = `<span class="bt-pb-ic">${PROF_ICON.bell}</span>
      <div class="bt-pb-tx"><b>Activa los avisos</b><span>Entérate de ideas nuevas, plazos y reuniones.</span></div>
      <button class="bt-pb-go">Activar</button>
      <button class="bt-pb-x" aria-label="Cerrar">&times;</button>`;
    document.body.appendChild(bar);
    requestAnimationFrame(() => bar.classList.add('on'));
    const close = (remember) => { if (remember) { try { localStorage.setItem('bt-push-dismissed', '1'); } catch (e) {} } bar.classList.remove('on'); setTimeout(() => bar.remove(), 250); };
    bar.querySelector('.bt-pb-x').onclick = () => close(true);
    bar.querySelector('.bt-pb-go').onclick = async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      try { if (await enablePush()) close(false); }
      catch (err) { console.error('[avisos]', err); toast('No se pudo activar los avisos (' + (err && err.name || 'error') + ': ' + (err && err.message || '').slice(0, 90) + ')', 9000); }
      btn.disabled = false;
    };
  }
  window.addEventListener('load', () => setTimeout(initPushBanner, 1200));

  function initAvatarMenu(){
    const av = document.getElementById('meAvatar');
    if (!av || av.dataset.menu) return;
    av.dataset.menu = '1';
    av.setAttribute('role', 'button'); av.setAttribute('tabindex', '0'); av.setAttribute('aria-haspopup', 'menu'); av.setAttribute('aria-label', 'Menú de perfil');
    av.style.cursor = 'pointer';
    const m = location.pathname.match(/^\/proyecto\/([^/]+)/);
    const proyectoId = m && m[1];
    let menu = null;
    const closeMenu = () => { if (menu) { menu.remove(); menu = null; av.setAttribute('aria-expanded', 'false'); } };
    async function openMenu(){
      let nombre = '';
      try { nombre = (await api('/api/auth/me')).usuario.nombre; } catch (e) { return; }
      let pushOn = false;
      try { pushOn = pushSupported() && Notification.permission === 'granted' && !!(await pushSub()); } catch (e) {}
      menu = document.createElement('div');
      menu.className = 'bt-menu'; menu.setAttribute('role', 'menu');
      menu.innerHTML = `<div class="bt-mwho"><b>${escTxt(nombre)}</b><span>${proyectoId ? 'Menú del proyecto' : 'Tu cuenta'}</span></div>
        ${proyectoId ? `<a role="menuitem" href="/proyecto/${proyectoId}/inversion" class="${location.pathname.endsWith('/inversion') ? 'on' : ''}">${PROF_ICON.chart} Inversión del proyecto</a>` : ''}
        ${pushSupported() ? `<button role="menuitem" data-m="push">${PROF_ICON.bell} ${pushOn ? 'Desactivar avisos' : 'Activar avisos'}</button>` : ''}
        <button role="menuitem" data-m="pin">${PROF_ICON.key} Cambiar PIN</button>
        ${proyectoId ? `<a role="menuitem" href="/proyectos">${PROF_ICON.grid} Mis proyectos</a>` : ''}
        <button role="menuitem" data-m="out" class="out">${PROF_ICON.out} Cerrar sesión</button>`;
      document.body.appendChild(menu);
      const r = av.getBoundingClientRect();
      menu.style.top = (r.bottom + 8) + 'px';
      menu.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
      av.setAttribute('aria-expanded', 'true');
      menu.addEventListener('click', async (e) => {
        const b = e.target.closest('button'); if (!b) return;
        closeMenu();
        if (b.dataset.m === 'pin') changePin();
        else if (b.dataset.m === 'push') { try { pushOn ? await disablePush() : await enablePush(); } catch (err) { console.error('[avisos]', err); toast('No se pudo cambiar los avisos (' + (err && err.name || 'error') + ': ' + (err && err.message || '').slice(0, 90) + ')', 9000); } }
        else if (b.dataset.m === 'out') {
          const ok = await confirm({ title: 'Cerrar sesión', message: '¿Seguro que quieres salir?', okText: 'Cerrar sesión' });
          if (!ok) return;
          await api('/api/auth/logout', { method: 'POST' });
          location.href = '/';
        }
      });
    }
    av.addEventListener('click', (e) => { e.stopPropagation(); menu ? closeMenu() : openMenu(); });
    av.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); menu ? closeMenu() : openMenu(); } });
    document.addEventListener('click', (e) => { if (menu && !menu.contains(e.target)) closeMenu(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
    window.addEventListener('resize', closeMenu);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAvatarMenu); else initAvatarMenu();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
  }

  return { toast, confirm, api, combo, changePin, theme: { get: getTheme, set: setTheme, cycle: cycleTheme, isDark } };
})();
