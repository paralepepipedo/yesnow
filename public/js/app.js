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

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
  }

  return { toast, confirm, api, combo, theme: { get: getTheme, set: setTheme, cycle: cycleTheme, isDark } };
})();
