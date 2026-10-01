// Catálogo de fases (Gantt) y categorías (Checklist) + gestor para renombrar, unir, eliminar y mover.
// Requiere app.js (BT). Fase: tareas con { id, nombre, fase }. Categoría: ítems con { id, nombre, categoria }.
(function(){
  const BT = window.BT;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const ICON = {
    chev: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
    edit: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>',
    del: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
  };
  const GEAR = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

  BT.grupos = { fases: [], categorias: [], inversion: [] };
  BT.gearIcon = GEAR;
  BT.loadGrupos = async (proyectoId) => {
    const d = await BT.api('/api/proyectos/' + proyectoId + '/grupos');
    BT.grupos = { fases: d.fases || [], categorias: d.categorias || [], inversion: d.inversion || [] };
    return BT.grupos;
  };

  // opts: { kind: 'fase'|'categoria', proyectoId, miembros: () => [...], reload: async () => void }
  BT.manageGroups = function(opts){
    const { kind, proyectoId, miembros, reload } = opts;
    const isFase = kind === 'fase';
    const K = kind === 'inversion'
      ? { title: 'Gestionar categorías', noun: 'categoría', unit: ['movimiento', 'movimientos'], key: 'categoria', path: '/inversion/', field: 'categoria', list: () => BT.grupos.inversion, none: false, toOtros: true }
      : isFase
      ? { title: 'Gestionar fases', noun: 'fase', unit: ['tarea', 'tareas'], key: 'fase', path: '/tareas/', field: 'fase', list: () => BT.grupos.fases, none: true }
      : { title: 'Gestionar categorías', noun: 'categoría', unit: ['ítem', 'ítems'], key: 'categoria', path: '/checklist/', field: 'categoria', list: () => BT.grupos.categorias, none: false };
    const base = '/api/proyectos/' + proyectoId;
    const st = { open: new Set(), edit: null, del: null, merge: null, err: '', busy: false };
    const wrap = document.createElement('div');
    wrap.className = 'bt-modal';
    wrap.innerHTML = '<div class="bt-backdrop"></div><div class="bt-box wide bt-mg"></div>';
    document.body.appendChild(wrap);
    const box = wrap.querySelector('.bt-box');
    const close = () => { wrap.remove(); };
    wrap.querySelector('.bt-backdrop').onclick = close;

    const members = (n) => miembros().filter(m => (m[K.key] || null) === (n === null ? null : n));
    const count = (n) => { const c = members(n).length; return c + ' ' + K.unit[c === 1 ? 0 : 1]; };

    async function sync(){ await Promise.all([BT.loadGrupos(proyectoId), reload()]); render(); }
    async function run(fn){
      if (st.busy) return; st.busy = true; st.err = '';
      try { await fn(); await sync(); }
      catch (e) { st.err = e.message; render(); }
      finally { st.busy = false; }
    }

    function row(n, i){
      const open = st.open.has(i), isNone = n === null, mem = members(n);
      const head = st.edit === i
        ? `<input type="text" data-r="in" value="${esc(n)}" autocomplete="off" aria-label="Nuevo nombre"><button class="bt-mgb primary" data-a="save" data-i="${i}">Guardar</button><button class="bt-mgb" data-a="cancel">Cancelar</button>`
        : `<button class="bt-tg${open ? ' open' : ''}" data-a="tog" data-i="${i}" aria-label="Ver ${K.unit[1]}">${ICON.chev}</button><span class="bt-nm">${isNone ? 'Sin fase' : esc(n)}</span><span class="bt-cnt">${count(n)}</span>${isNone ? '' : `<button class="bt-ib" data-a="edit" data-i="${i}" title="Renombrar" aria-label="Renombrar">${ICON.edit}</button><button class="bt-ib del" data-a="del" data-i="${i}" title="Eliminar" aria-label="Eliminar">${ICON.del}</button>`}`;
      let extra = '';
      if (st.merge && st.merge.from === i) {
        const to = K.list()[st.merge.to];
        extra = `<div class="bt-cf"><span>Ya existe «${esc(to)}». ¿Unir «${esc(n)}» con «${esc(to)}»? Sus ${K.unit[1]} pasarán a «${esc(to)}».</span><div><button class="bt-mgb primary" data-a="domerge">Unir</button><button class="bt-mgb" data-a="cancel">Cancelar</button></div></div>`;
      }
      if (st.del === i) {
        const destino = K.toOtros ? 'Otros' : 'Sin fase';
        extra = (isFase || K.toOtros || mem.length === 0)
          ? `<div class="bt-cf d"><span>${mem.length ? (mem.length === 1 ? `Su ${K.unit[0]} pasará a «${destino}». Nada se borra.` : `Sus ${mem.length} ${K.unit[1]} pasarán a «${destino}». Nada se borra.`) : `La ${K.noun} está vacía.`} ¿Eliminar «${esc(n)}»?</span><div><button class="bt-mgb danger" data-a="dodel">Eliminar</button><button class="bt-mgb" data-a="cancel">Cancelar</button></div></div>`
          : `<div class="bt-cf d"><span>«${esc(n)}» tiene ${mem.length} ${K.unit[mem.length === 1 ? 0 : 1]}. Despliega la fila para moverlos a otra ${K.noun}, o renómbrala con el nombre de otra para unirlas.</span><div><button class="bt-mgb" data-a="cancel">Entendido</button></div></div>`;
      }
      let list = '';
      if (open) {
        const targets = K.list().map((g, gi) => ({ g, gi })).filter(x => x.gi !== i);
        list = `<div class="bt-mm">${mem.length ? mem.map(m => `<div class="bt-mr"><span title="${esc(m.nombre)}">${esc(m.nombre)}</span><select data-a="mv" data-id="${m.id}" aria-label="Mover a otra ${K.noun}"><option value="">Mover a…</option>${K.none && !isNone ? '<option value="__none">Sin fase</option>' : ''}${targets.map(x => `<option value="${x.gi}">${esc(x.g)}</option>`).join('')}</select></div>`).join('') : `<div class="bt-hint">No hay ${K.unit[1]} en esta ${K.noun}.</div>`}</div>`;
      }
      return `<div class="bt-mrow"><div class="bt-mh">${head}</div>${extra}${list}</div>`;
    }
    function render(){
      const list = K.list();
      const focusNew = document.activeElement && document.activeElement.id === 'btMgNew';
      box.innerHTML = `<h3>${K.title}</h3>
        ${list.map((n, i) => row(n, i)).join('')}
        ${K.none ? row(null, -1) : ''}
        ${list.length || K.none ? '' : `<div class="bt-hint" style="margin-bottom:10px">Aún no hay ${K.noun}s.</div>`}
        <div class="bt-add"><input type="text" id="btMgNew" placeholder="Nueva ${K.noun}…" autocomplete="off"><button class="bt-mgb primary" data-a="add">Agregar</button></div>
        ${st.err ? `<div class="bt-err">${esc(st.err)}</div>` : ''}
        <div class="bt-actions" style="margin-top:16px"><button data-a="close">Cerrar</button></div>`;
      const inp = box.querySelector('[data-r="in"]'); if (inp) { inp.focus(); inp.select(); }
      else if (focusNew) box.querySelector('#btMgNew').focus();
    }

    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]'); if (!b || b.tagName === 'SELECT') return;
      const a = b.dataset.a, list = K.list(); st.err = '';
      if (a === 'close') return close();
      if (a === 'tog') { const i = +b.dataset.i; st.open.has(i) ? st.open.delete(i) : st.open.add(i); }
      else if (a === 'edit') { st.edit = +b.dataset.i; st.del = st.merge = null; }
      else if (a === 'cancel') { st.edit = st.del = st.merge = null; }
      else if (a === 'del') { st.del = +b.dataset.i; st.edit = st.merge = null; }
      else if (a === 'save') {
        const i = +b.dataset.i, v = box.querySelector('[data-r="in"]').value.trim();
        if (!v) st.err = 'El nombre no puede quedar vacío.';
        else if (v === list[i]) st.edit = null;
        else {
          const other = list.findIndex((g, gi) => gi !== i && norm(g) === norm(v));
          if (other >= 0) { st.merge = { from: i, to: other }; st.edit = null; }
          else return run(async () => { await BT.api(base + '/grupos', { method: 'PATCH', body: JSON.stringify({ tipo: kind, nombre: list[i], nuevoNombre: v }) }); st.edit = null; BT.toast('Renombrada a «' + v + '»'); });
        }
      }
      else if (a === 'domerge') {
        const { from, to } = st.merge;
        return run(async () => { await BT.api(base + '/grupos', { method: 'PATCH', body: JSON.stringify({ tipo: kind, nombre: list[from], nuevoNombre: list[to], unir: true }) }); st.merge = null; st.open.clear(); BT.toast('Unidas en «' + list[to] + '»'); });
      }
      else if (a === 'dodel') {
        const n = list[st.del];
        return run(async () => { await BT.api(base + '/grupos?tipo=' + kind + '&nombre=' + encodeURIComponent(n), { method: 'DELETE' }); st.del = null; st.open.clear(); BT.toast('«' + n + '» eliminada'); });
      }
      else if (a === 'add') {
        const v = box.querySelector('#btMgNew').value.trim();
        if (!v) st.err = 'Escribe un nombre.';
        else if (list.some(g => norm(g) === norm(v))) st.err = 'Ya existe «' + list.find(g => norm(g) === norm(v)) + '».';
        else return run(async () => { await BT.api(base + '/grupos', { method: 'POST', body: JSON.stringify({ tipo: kind, nombre: v }) }); BT.toast('«' + v + '» creada'); });
      }
      render();
    });
    box.addEventListener('change', (e) => {
      const s = e.target.closest('select[data-a="mv"]'); if (!s || s.value === '') return;
      const list = K.list(), dest = s.value === '__none' ? null : list[+s.value];
      run(async () => { await BT.api(base + K.path + s.dataset.id, { method: 'PATCH', body: JSON.stringify({ [K.field]: dest }) }); BT.toast('Movido a «' + (dest || 'Sin fase') + '»'); });
    });
    box.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (e.target.matches('[data-r="in"]')) box.querySelector('[data-a="save"]').click();
      else if (e.target.id === 'btMgNew') box.querySelector('[data-a="add"]').click();
    });
    render();
  };
})();
