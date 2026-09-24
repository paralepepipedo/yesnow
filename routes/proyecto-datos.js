const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../lib/db');
const { isAuth } = require('./auth');

async function notificar(usuarioId, tipo, mensaje, proyectoId, tareaId) {
  if (!usuarioId) return;
  await db.query(
    `INSERT INTO bitacora_notificaciones (usuario_id, tipo, mensaje, proyecto_id, tarea_id) VALUES ($1,$2,$3,$4,$5)`,
    [usuarioId, tipo, mensaje, proyectoId || null, tareaId || null]
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

module.exports = router;
