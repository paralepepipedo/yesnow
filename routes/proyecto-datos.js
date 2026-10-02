const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../lib/db');
const { isAuth } = require('./auth');

const { notificar } = require('../lib/notificar');
const { hoyChile, fechaLarga, esReunionAgendada, todosLosUsuarios } = require('../lib/avisos');

const TIPOS = {
  fase: { tabla: 'bitacora_tareas', col: 'fase' },
  categoria: { tabla: 'bitacora_checklist_items', col: 'categoria' },
  inversion: { tabla: 'bitacora_inversion', col: 'categoria' },
};

// Registra la fase/categoría en el catálogo si aún no existe (sin distinguir mayúsculas).
async function asegurarGrupo(proyectoId, tipo, nombre) {
  if (!nombre || !String(nombre).trim()) return;
  await db.query(
    `INSERT INTO bitacora_grupos (proyecto_id, tipo, nombre) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
    [proyectoId, tipo, String(nombre).trim()]
  );
}

router.get('/', isAuth, async (req, res) => {
  const { rows } = await db.query('SELECT * FROM bitacora_proyectos WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
  const p = rows[0];
  res.json({ proyecto: { id: p.id, nombre: p.nombre, descripcion: p.descripcion, referenciaUrl: p.referencia_url } });
});

router.patch('/', isAuth, async (req, res) => {
  const b = req.body || {};
  if (b.nombre !== undefined && !b.nombre.trim()) return res.status(400).json({ error: 'Falta el nombre' });
  const sets = []; const vals = []; let i = 1;
  if (b.nombre !== undefined) { sets.push(`nombre = $${i++}`); vals.push(b.nombre.trim()); }
  if (b.descripcion !== undefined) { sets.push(`descripcion = $${i++}`); vals.push(b.descripcion || null); }
  if (b.referenciaUrl !== undefined) { sets.push(`referencia_url = $${i++}`); vals.push(b.referenciaUrl || null); }
  if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });
  vals.push(req.params.id);
  const { rows } = await db.query(
    `UPDATE bitacora_proyectos SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    vals
  );
  if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
  const p = rows[0];
  res.json({ proyecto: { id: p.id, nombre: p.nombre, descripcion: p.descripcion, referenciaUrl: p.referencia_url } });
});

// ---- fases y categorías (catálogo) ----
router.get('/grupos', isAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT tipo, nombre FROM bitacora_grupos WHERE proyecto_id = $1 ORDER BY orden, lower(nombre)', [req.params.id]
    );
    res.json({
      fases: rows.filter(r => r.tipo === 'fase').map(r => r.nombre),
      categorias: rows.filter(r => r.tipo === 'categoria').map(r => r.nombre),
      inversion: rows.filter(r => r.tipo === 'inversion').map(r => r.nombre),
    });
  } catch (e) { console.error('[GET grupos]', e); res.status(500).json({ error: 'Error interno' }); }
});

router.post('/grupos', isAuth, async (req, res) => {
  const { tipo, nombre } = req.body || {};
  if (!TIPOS[tipo] || !nombre || !nombre.trim()) return res.status(400).json({ error: 'Datos inválidos' });
  try {
    const { rows } = await db.query(
      `INSERT INTO bitacora_grupos (proyecto_id, tipo, nombre) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING nombre`,
      [req.params.id, tipo, nombre.trim()]
    );
    if (!rows[0]) return res.status(409).json({ error: 'Ya existe' });
    res.json({ nombre: rows[0].nombre });
  } catch (e) { console.error('[POST grupos]', e); res.status(500).json({ error: 'Error interno' }); }
});

// Renombra. Si el nuevo nombre ya existe exige { unir: true } y fusiona los miembros en el existente.
router.patch('/grupos', isAuth, async (req, res) => {
  const { tipo, nombre, nuevoNombre, unir } = req.body || {};
  const T = TIPOS[tipo];
  if (!T || !nombre || !nuevoNombre || !nuevoNombre.trim()) return res.status(400).json({ error: 'Datos inválidos' });
  const nuevo = nuevoNombre.trim();
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: otro } = await client.query(
      `SELECT nombre FROM bitacora_grupos WHERE proyecto_id = $1 AND tipo = $2 AND lower(nombre) = lower($3) AND lower(nombre) <> lower($4)`,
      [req.params.id, tipo, nuevo, nombre]
    );
    if (otro[0] && !unir) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Ya existe', existente: otro[0].nombre }); }
    const destino = otro[0] ? otro[0].nombre : nuevo;
    await client.query(`UPDATE ${T.tabla} SET ${T.col} = $1 WHERE proyecto_id = $2 AND ${T.col} = $3`, [destino, req.params.id, nombre]);
    if (otro[0]) {
      await client.query('DELETE FROM bitacora_grupos WHERE proyecto_id = $1 AND tipo = $2 AND nombre = $3', [req.params.id, tipo, nombre]);
    } else {
      await client.query('UPDATE bitacora_grupos SET nombre = $1 WHERE proyecto_id = $2 AND tipo = $3 AND nombre = $4', [destino, req.params.id, tipo, nombre]);
    }
    await client.query('COMMIT');
    res.json({ nombre: destino, unido: !!otro[0] });
  } catch (e) { await client.query('ROLLBACK'); console.error('[PATCH grupos]', e); res.status(500).json({ error: 'Error interno' }); }
  finally { client.release(); }
});

// Fase: sus tareas pasan a "Sin fase". Categoría: solo se elimina si no tiene ítems.
router.delete('/grupos', isAuth, async (req, res) => {
  const { tipo, nombre } = req.query;
  if (!TIPOS[tipo] || !nombre) return res.status(400).json({ error: 'Datos inválidos' });
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    if (tipo === 'fase') {
      await client.query('UPDATE bitacora_tareas SET fase = NULL WHERE proyecto_id = $1 AND fase = $2', [req.params.id, nombre]);
    } else if (tipo === 'inversion') {
      const { rows } = await client.query('SELECT count(*)::int AS n FROM bitacora_inversion WHERE proyecto_id = $1 AND categoria = $2', [req.params.id, nombre]);
      if (rows[0].n > 0) {
        if (nombre.toLowerCase() === 'otros') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'La categoría «Otros» tiene movimientos' }); }
        await client.query("INSERT INTO bitacora_grupos (proyecto_id, tipo, nombre) VALUES ($1,'inversion','Otros') ON CONFLICT DO NOTHING", [req.params.id]);
        await client.query("UPDATE bitacora_inversion SET categoria = 'Otros' WHERE proyecto_id = $1 AND categoria = $2", [req.params.id, nombre]);
      }
    } else {
      const { rows } = await client.query('SELECT count(*)::int AS n FROM bitacora_checklist_items WHERE proyecto_id = $1 AND categoria = $2', [req.params.id, nombre]);
      if (rows[0].n > 0) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'La categoría tiene ítems' }); }
    }
    await client.query('DELETE FROM bitacora_grupos WHERE proyecto_id = $1 AND tipo = $2 AND nombre = $3', [req.params.id, tipo, nombre]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) { await client.query('ROLLBACK'); console.error('[DELETE grupos]', e); res.status(500).json({ error: 'Error interno' }); }
  finally { client.release(); }
});

// ---- tareas ----
router.get('/tareas', isAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT t.*, array(
         SELECT jsonb_build_object('id', u.id, 'nombre', u.nombre, 'avatar_color', u.avatar_color)
         FROM bitacora_usuarios u WHERE u.id = ANY(t.asignados)
       ) AS asignados_info
       FROM bitacora_tareas t WHERE t.proyecto_id = $1 ORDER BY t.fecha_fin ASC`,
      [req.params.id]
    );
    res.json({ tareas: rows.map(t => ({
      id: t.id, nombre: t.nombre, descripcion: t.descripcion, fase: t.fase,
      fechaInicio: t.fecha_inicio, fechaFin: t.fecha_fin, estado: t.estado, color: t.color,
      asignados: t.asignados_info,
    })) });
  } catch (e) { console.error('[GET tareas]', e); res.status(500).json({ error: 'Error interno' }); }
});

router.post('/tareas', isAuth, async (req, res) => {
  const b = req.body || {};
  if (!b.nombre || !b.fechaFin) return res.status(400).json({ error: 'Falta nombre o fecha de término' });
  try {
    const { rows } = await db.query(
      `INSERT INTO bitacora_tareas (proyecto_id, nombre, descripcion, asignados, fase, fecha_inicio, fecha_fin, color, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.params.id, b.nombre.trim(), b.descripcion || null, b.asignados || [], b.fase || null,
       b.fechaInicio || null, b.fechaFin, b.color || '#0052ea', req.session.usuario.id]
    );
    const t = rows[0];
    await asegurarGrupo(req.params.id, 'fase', t.fase);
    const { rows: proj } = await db.query('SELECT nombre FROM bitacora_proyectos WHERE id = $1', [req.params.id]);
    for (const uid of (b.asignados || [])) {
      if (uid !== req.session.usuario.id) {
        await notificar(uid, 'asignacion', `${req.session.usuario.nombre} te asignó "${t.nombre}" en ${proj[0]?.nombre || 'un proyecto'}`, req.params.id, t.id);
      }
    }
    res.json({ tarea: t });
  } catch (e) { console.error('[POST tareas]', e); res.status(500).json({ error: 'Error interno' }); }
});

router.patch('/tareas/:tareaId', isAuth, async (req, res) => {
  const b = req.body || {};
  const sets = []; const vals = []; let i = 1;
  const map = { estado: 'estado', nombre: 'nombre', fechaInicio: 'fecha_inicio', fechaFin: 'fecha_fin', fase: 'fase', color: 'color' };
  for (const [k, col] of Object.entries(map)) if (b[k] !== undefined) { sets.push(`${col} = $${i++}`); vals.push(b[k]); }
  if (b.asignados !== undefined) { sets.push(`asignados = $${i++}`); vals.push(b.asignados); }
  if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });
  vals.push(req.params.tareaId, req.params.id);
  try {
    const { rows } = await db.query(
      `UPDATE bitacora_tareas SET ${sets.join(', ')}, actualizado_en = now() WHERE id = $${i++} AND proyecto_id = $${i} RETURNING *`,
      vals
    );
    if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
    const t = rows[0];
    if (b.fase) await asegurarGrupo(req.params.id, 'fase', t.fase);
    if (b.asignados !== undefined) {
      const { rows: proj } = await db.query('SELECT nombre FROM bitacora_proyectos WHERE id = $1', [req.params.id]);
      for (const uid of b.asignados) {
        if (uid !== req.session.usuario.id) {
          await notificar(uid, 'cambio', `${req.session.usuario.nombre} cambió "${t.nombre}" en ${proj[0]?.nombre || 'un proyecto'}`, req.params.id, t.id);
        }
      }
    }
    res.json({ tarea: t });
  } catch (e) { console.error('[PATCH tarea]', e); res.status(500).json({ error: 'Error interno' }); }
});

// ---- checklist ----
router.get('/checklist', isAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT c.*, array(
       SELECT jsonb_build_object('id', u.id, 'nombre', u.nombre, 'avatar_color', u.avatar_color)
       FROM bitacora_usuarios u WHERE u.id = ANY(c.asignados)
     ) AS asignados_info
     FROM bitacora_checklist_items c WHERE c.proyecto_id = $1 ORDER BY categoria, orden, nombre`, [req.params.id]
  );
  res.json({ items: rows.map(c => ({
    id: c.id, categoria: c.categoria, nombre: c.nombre, prioridad: c.prioridad,
    estado: c.estado, evidencia: c.evidencia, tareaId: c.tarea_id, asignados: c.asignados_info,
  })) });
});

router.patch('/checklist/:itemId', isAuth, async (req, res) => {
  const b = req.body || {};
  if (b.estado !== undefined && !['implementado', 'parcial', 'pendiente'].includes(b.estado)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }
  const sets = []; const vals = []; let i = 1;
  const map = { estado: 'estado', categoria: 'categoria', nombre: 'nombre', prioridad: 'prioridad', evidencia: 'evidencia' };
  for (const [k, col] of Object.entries(map)) if (b[k] !== undefined) { sets.push(`${col} = $${i++}`); vals.push(b[k]); }
  if (b.asignados !== undefined) { sets.push(`asignados = $${i++}`); vals.push(b.asignados); }
  if (b.tareaId !== undefined) { sets.push(`tarea_id = $${i++}`); vals.push(b.tareaId || null); }
  if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });
  vals.push(req.params.itemId, req.params.id);
  const { rows } = await db.query(
    `UPDATE bitacora_checklist_items SET ${sets.join(', ')}, actualizado_en = now() WHERE id = $${i++} AND proyecto_id = $${i} RETURNING *`,
    vals
  );
  if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
  const it = rows[0];
  if (b.categoria) await asegurarGrupo(req.params.id, 'categoria', it.categoria);
  if (b.asignados !== undefined) {
    const { rows: proj } = await db.query('SELECT nombre FROM bitacora_proyectos WHERE id = $1', [req.params.id]);
    for (const uid of b.asignados) {
      if (uid !== req.session.usuario.id) {
        await notificar(uid, 'asignacion', `${req.session.usuario.nombre} te asignó el ítem de checklist "${it.nombre}" en ${proj[0]?.nombre || 'un proyecto'}`, req.params.id, null);
      }
    }
  }
  res.json({ item: it });
});

// ---- ideas ----
router.get('/ideas', isAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT i.*, u.nombre AS autor_nombre FROM bitacora_ideas i
     LEFT JOIN bitacora_usuarios u ON u.id = i.autor_id
     WHERE i.proyecto_id = $1 ORDER BY i.creado_en DESC`, [req.params.id]
  );
  res.json({ ideas: rows.map(x => ({
    id: x.id, texto: x.texto, autor: x.autor_nombre, creadoEn: x.creado_en,
    convertidoTipo: x.convertido_tipo, convertidoId: x.convertido_id,
  })) });
});

router.post('/ideas', isAuth, async (req, res) => {
  const { texto } = req.body || {};
  if (!texto || !texto.trim()) return res.status(400).json({ error: 'Falta el texto' });
  const { rows } = await db.query(
    `INSERT INTO bitacora_ideas (proyecto_id, texto, autor_id) VALUES ($1,$2,$3) RETURNING *`,
    [req.params.id, texto.trim(), req.session.usuario.id]
  );
  try {
    const { rows: proj } = await db.query('SELECT nombre FROM bitacora_proyectos WHERE id = $1', [req.params.id]);
    const resumen = rows[0].texto.length > 140 ? rows[0].texto.slice(0, 137) + '…' : rows[0].texto;
    for (const uid of await todosLosUsuarios()) {
      if (uid !== req.session.usuario.id) await notificar(uid, 'idea', `${req.session.usuario.nombre} agregó una idea en ${proj[0]?.nombre || 'un proyecto'}: ${resumen}`, req.params.id, null, { titulo: 'Idea nueva' });
    }
  } catch (e) { console.error('[notificar idea]', e); }
  res.json({ idea: { id: rows[0].id, texto: rows[0].texto, autor: req.session.usuario.nombre, creadoEn: rows[0].creado_en } });
});

router.patch('/ideas/:ideaId', isAuth, async (req, res) => {
  const b = req.body || {};
  const sets = []; const vals = []; let i = 1;
  if (b.texto !== undefined) { sets.push(`texto = $${i++}`); vals.push(b.texto.trim()); }
  if (b.convertidoTipo !== undefined) { sets.push(`convertido_tipo = $${i++}`); vals.push(b.convertidoTipo); }
  if (b.convertidoId !== undefined) { sets.push(`convertido_id = $${i++}`); vals.push(b.convertidoId); }
  if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });
  vals.push(req.params.ideaId, req.params.id);
  const { rows } = await db.query(
    `UPDATE bitacora_ideas SET ${sets.join(', ')} WHERE id = $${i++} AND proyecto_id = $${i} RETURNING *, (SELECT nombre FROM bitacora_usuarios WHERE id = autor_id) AS autor_nombre`,
    vals
  );
  if (!rows[0]) return res.status(404).json({ error: 'No encontrada' });
  const x = rows[0];
  res.json({ idea: { id: x.id, texto: x.texto, autor: x.autor_nombre, creadoEn: x.creado_en, convertidoTipo: x.convertido_tipo, convertidoId: x.convertido_id } });
});

router.delete('/ideas/:ideaId', isAuth, async (req, res) => {
  await db.query('DELETE FROM bitacora_ideas WHERE id = $1 AND proyecto_id = $2', [req.params.ideaId, req.params.id]);
  res.json({ success: true });
});

router.delete('/tareas/:tareaId', isAuth, async (req, res) => {
  await db.query('DELETE FROM bitacora_tareas WHERE id = $1 AND proyecto_id = $2', [req.params.tareaId, req.params.id]);
  res.json({ success: true });
});

router.post('/checklist', isAuth, async (req, res) => {
  const b = req.body || {};
  if (!b.categoria || !b.nombre) return res.status(400).json({ error: 'Falta categoría o nombre' });
  const { rows } = await db.query(
    `INSERT INTO bitacora_checklist_items (proyecto_id, categoria, nombre, prioridad, estado, evidencia, asignados, tarea_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.params.id, b.categoria.trim(), b.nombre.trim(), b.prioridad || null, b.estado || 'pendiente', b.evidencia || null, b.asignados || [], b.tareaId || null]
  );
  const it = rows[0];
  await asegurarGrupo(req.params.id, 'categoria', it.categoria);
  const { rows: proj } = await db.query('SELECT nombre FROM bitacora_proyectos WHERE id = $1', [req.params.id]);
  for (const uid of (b.asignados || [])) {
    if (uid !== req.session.usuario.id) {
      await notificar(uid, 'asignacion', `${req.session.usuario.nombre} te asignó el ítem de checklist "${it.nombre}" en ${proj[0]?.nombre || 'un proyecto'}`, req.params.id, null);
    }
  }
  res.json({ item: it });
});

router.delete('/checklist/:itemId', isAuth, async (req, res) => {
  await db.query('DELETE FROM bitacora_checklist_items WHERE id = $1 AND proyecto_id = $2', [req.params.itemId, req.params.id]);
  res.json({ success: true });
});

// ---- inversión (tiempo y dinero) ----
const INV_SELECT = `SELECT i.*, array(
    SELECT jsonb_build_object('id', u.id, 'nombre', u.nombre, 'avatar_color', u.avatar_color)
    FROM bitacora_usuarios u WHERE u.id = ANY(i.personas)
  ) AS personas_info FROM bitacora_inversion i`;
const mapInv = (r) => ({
  id: r.id, estado: r.estado, tipo: r.tipo, cantidad: Number(r.cantidad), moneda: r.moneda,
  categoria: r.categoria, concepto: r.concepto, fecha: r.fecha, personas: r.personas_info || [], tareaId: r.tarea_id,
});
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

router.get('/inversion', isAuth, async (req, res) => {
  try {
    const { rows } = await db.query(`${INV_SELECT} WHERE i.proyecto_id = $1 ORDER BY i.fecha DESC, i.creado_en DESC`, [req.params.id]);
    res.json({ movimientos: rows.map(mapInv) });
  } catch (e) { console.error('[GET inversion]', e); res.status(500).json({ error: 'Error interno' }); }
});

router.post('/inversion', isAuth, async (req, res) => {
  const b = req.body || {};
  const estado = b.estado === 'plan' ? 'plan' : 'real';
  const cantidad = Number(b.cantidad);
  if (!['tiempo', 'dinero'].includes(b.tipo)) return res.status(400).json({ error: 'Tipo inválido' });
  if (!(cantidad > 0)) return res.status(400).json({ error: 'La cantidad debe ser mayor a cero' });
  if (b.tipo === 'dinero' && !['CLP', 'USD'].includes(b.moneda)) return res.status(400).json({ error: 'Moneda inválida' });
  if (!b.categoria || !String(b.categoria).trim()) return res.status(400).json({ error: 'Falta la categoría' });
  if (!b.concepto || !String(b.concepto).trim()) return res.status(400).json({ error: 'Falta el concepto' });
  if (!FECHA_RE.test(b.fecha || '')) return res.status(400).json({ error: 'Fecha inválida' });
  const personas = Array.isArray(b.personas) ? b.personas : [];
  if (estado === 'real' && !personas.length) return res.status(400).json({ error: 'Indica quién participó o pagó' });
  try {
    const { rows } = await db.query(
      `INSERT INTO bitacora_inversion (proyecto_id, estado, tipo, cantidad, moneda, categoria, concepto, fecha, personas, tarea_id, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [req.params.id, estado, b.tipo, cantidad, b.tipo === 'dinero' ? b.moneda : null, String(b.categoria).trim(), String(b.concepto).trim(),
       b.fecha, personas, b.tareaId || null, req.session.usuario.id]
    );
    await asegurarGrupo(req.params.id, 'inversion', b.categoria);
    // Reunión agendada (fecha de hoy o futura): avisa a los participantes, o a todos si no se indicó ninguno.
    const mov = { estado, tipo: b.tipo, categoria: String(b.categoria).trim() };
    if (esReunionAgendada(mov) && b.fecha >= hoyChile()) {
      try {
        const destino = personas.length ? personas : await todosLosUsuarios();
        for (const uid of destino) {
          await notificar(uid, 'reunion', `Reunión agendada para el ${fechaLarga(b.fecha)}: ${String(b.concepto).trim()}`, req.params.id, null, { titulo: 'Reunión agendada', url: `/proyecto/${req.params.id}/inversion` });
        }
      } catch (e) { console.error('[notificar reunion]', e); }
    }
    const { rows: full } = await db.query(`${INV_SELECT} WHERE i.id = $1`, [rows[0].id]);
    res.json({ movimiento: mapInv(full[0]) });
  } catch (e) { console.error('[POST inversion]', e); res.status(500).json({ error: 'Error interno' }); }
});

router.patch('/inversion/:movId', isAuth, async (req, res) => {
  const b = req.body || {};
  const sets = []; const vals = []; let i = 1;
  const add = (col, v) => { sets.push(`${col} = $${i++}`); vals.push(v); };
  if (b.estado !== undefined) { if (!['real', 'plan'].includes(b.estado)) return res.status(400).json({ error: 'Estado inválido' }); add('estado', b.estado); }
  if (b.tipo !== undefined) {
    if (!['tiempo', 'dinero'].includes(b.tipo)) return res.status(400).json({ error: 'Tipo inválido' });
    if (b.tipo === 'dinero' && !['CLP', 'USD'].includes(b.moneda)) return res.status(400).json({ error: 'Moneda inválida' });
    add('tipo', b.tipo); add('moneda', b.tipo === 'dinero' ? b.moneda : null);
  } else if (b.moneda !== undefined) {
    if (!['CLP', 'USD'].includes(b.moneda)) return res.status(400).json({ error: 'Moneda inválida' });
    add('moneda', b.moneda);
  }
  if (b.cantidad !== undefined) { if (!(Number(b.cantidad) > 0)) return res.status(400).json({ error: 'La cantidad debe ser mayor a cero' }); add('cantidad', Number(b.cantidad)); }
  if (b.categoria !== undefined) { if (!String(b.categoria).trim()) return res.status(400).json({ error: 'Falta la categoría' }); add('categoria', String(b.categoria).trim()); }
  if (b.concepto !== undefined) { if (!String(b.concepto).trim()) return res.status(400).json({ error: 'Falta el concepto' }); add('concepto', String(b.concepto).trim()); }
  if (b.fecha !== undefined) { if (!FECHA_RE.test(b.fecha)) return res.status(400).json({ error: 'Fecha inválida' }); add('fecha', b.fecha); }
  if (b.personas !== undefined) add('personas', Array.isArray(b.personas) ? b.personas : []);
  if (b.tareaId !== undefined) add('tarea_id', b.tareaId || null);
  if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });
  vals.push(req.params.movId, req.params.id);
  try {
    const { rows } = await db.query(
      `UPDATE bitacora_inversion SET ${sets.join(', ')}, actualizado_en = now() WHERE id = $${i++} AND proyecto_id = $${i} RETURNING id, categoria`, vals
    );
    if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
    if (b.categoria) await asegurarGrupo(req.params.id, 'inversion', rows[0].categoria);
    const { rows: full } = await db.query(`${INV_SELECT} WHERE i.id = $1`, [rows[0].id]);
    res.json({ movimiento: mapInv(full[0]) });
  } catch (e) { console.error('[PATCH inversion]', e); res.status(500).json({ error: 'Error interno' }); }
});

router.delete('/inversion/:movId', isAuth, async (req, res) => {
  await db.query('DELETE FROM bitacora_inversion WHERE id = $1 AND proyecto_id = $2', [req.params.movId, req.params.id]);
  res.json({ success: true });
});

module.exports = router;

