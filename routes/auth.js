const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../lib/db');

const isAuth = (req, res, next) => {
  if (req.session.usuario) return next();
  res.status(401).json({ error: 'No autorizado' });
};

router.get('/usuarios', async (req, res) => {
  const { rows } = await db.query('SELECT id, nombre, avatar_color FROM bitacora_usuarios ORDER BY nombre');
  res.json({ usuarios: rows });
});

router.post('/login', async (req, res) => {
  const { id, pin } = req.body || {};
  if (!id || !pin) return res.status(400).json({ error: 'Falta usuario o PIN' });

  try {
    const { rows } = await db.query('SELECT * FROM bitacora_usuarios WHERE id = $1', [id]);
    const usuario = rows[0];
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    const match = await bcrypt.compare(pin, usuario.pin_hash);
    if (!match) return res.status(401).json({ error: 'PIN incorrecto' });

    req.session.usuario = { id: usuario.id, nombre: usuario.nombre, avatar_color: usuario.avatar_color };
    res.json({ success: true, usuario: req.session.usuario });
  } catch (e) {
    console.error('[Auth] login:', e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.get('/me', (req, res) => {
  if (req.session.usuario) res.json({ usuario: req.session.usuario });
  else res.status(401).json({ error: 'No autorizado' });
});

router.post('/pin', async (req, res) => {
  if (!req.session.usuario) return res.status(401).json({ error: 'No autorizado' });
  const { actual, nuevo } = req.body || {};
  if (!/^\d{4}$/.test(String(nuevo || ''))) return res.status(400).json({ error: 'El PIN nuevo debe tener 4 dígitos' });
  if (!actual) return res.status(400).json({ error: 'Falta el PIN actual' });
  if (String(actual) === String(nuevo)) return res.status(400).json({ error: 'El PIN nuevo debe ser distinto al actual' });
  try {
    const { rows } = await db.query('SELECT pin_hash FROM bitacora_usuarios WHERE id = $1', [req.session.usuario.id]);
    if (!rows[0] || !(await bcrypt.compare(String(actual), rows[0].pin_hash))) {
      return res.status(401).json({ error: 'El PIN actual no coincide' });
    }
    const hash = await bcrypt.hash(String(nuevo), 10);
    await db.query('UPDATE bitacora_usuarios SET pin_hash = $1 WHERE id = $2', [hash, req.session.usuario.id]);
    res.json({ success: true });
  } catch (e) {
    console.error('[Auth] pin:', e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

module.exports = router;
module.exports.isAuth = isAuth;
