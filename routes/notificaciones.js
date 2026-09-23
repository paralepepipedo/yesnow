const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const { isAuth } = require('./auth');

router.get('/', isAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT n.*, p.nombre AS proyecto_nombre FROM bitacora_notificaciones n
     LEFT JOIN bitacora_proyectos p ON p.id = n.proyecto_id
     WHERE n.usuario_id = $1 ORDER BY n.creado_en DESC LIMIT 30`,
    [req.session.usuario.id]
  );
  res.json({ notificaciones: rows.map(n => ({
    id: n.id, tipo: n.tipo, mensaje: n.mensaje, proyectoId: n.proyecto_id,
    proyectoNombre: n.proyecto_nombre, tareaId: n.tarea_id, leido: n.leido, creadoEn: n.creado_en,
  })) });
});

router.get('/no-leidas', isAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM bitacora_notificaciones WHERE usuario_id = $1 AND leido = false`,
    [req.session.usuario.id]
  );
  res.json({ count: rows[0].n });
});

router.post('/marcar-leidas', isAuth, async (req, res) => {
  await db.query(`UPDATE bitacora_notificaciones SET leido = true WHERE usuario_id = $1 AND leido = false`, [req.session.usuario.id]);
  res.json({ success: true });
});

module.exports = router;
