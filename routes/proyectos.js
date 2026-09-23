const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const { isAuth } = require('./auth');

router.get('/', isAuth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT p.id, p.nombre, p.descripcion, p.referencia_url, p.creado_en,
        (SELECT count(*)::int FROM bitacora_tareas t WHERE t.proyecto_id = p.id) AS total_tareas,
        (SELECT count(*)::int FROM bitacora_checklist_items c WHERE c.proyecto_id = p.id) AS total_checklist,
        (SELECT count(*)::int FROM bitacora_checklist_items c WHERE c.proyecto_id = p.id AND c.estado = 'implementado') AS checklist_ok
      FROM bitacora_proyectos p
      ORDER BY p.creado_en ASC
    `);
    res.json({ proyectos: rows.map(p => ({
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion,
      referenciaUrl: p.referencia_url,
      totalTareas: p.total_tareas,
      checklistPct: p.total_checklist ? Math.round((p.checklist_ok / p.total_checklist) * 100) : 0,
      totalChecklist: p.total_checklist,
    })) });
  } catch (e) {
    console.error('[GET /proyectos]', e);
    res.status(500).json({ error: 'Error interno' });
  }
});

router.post('/', isAuth, async (req, res) => {
  const { nombre, descripcion, referenciaUrl } = req.body || {};
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'Falta el nombre' });
  try {
    const { rows } = await db.query(
      `INSERT INTO bitacora_proyectos (nombre, descripcion, referencia_url, creado_por) VALUES ($1,$2,$3,$4) RETURNING *`,
      [nombre.trim(), descripcion || null, referenciaUrl || null, req.session.usuario.id]
    );
    res.json({ proyecto: { id: rows[0].id, nombre: rows[0].nombre, descripcion: rows[0].descripcion, referenciaUrl: rows[0].referencia_url, totalTareas: 0, checklistPct: 0, totalChecklist: 0 } });
  } catch (e) {
    console.error('[POST /proyectos]', e);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
