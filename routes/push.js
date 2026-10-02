const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const { isAuth } = require('./auth');
const { enviarPush, pushActivo } = require('../lib/notificar');

router.get('/clave', isAuth, (req, res) => {
  res.json({ activo: pushActivo, clave: pushActivo ? process.env.VAPID_PUBLIC : null });
});

router.post('/suscribir', isAuth, async (req, res) => {
  const s = req.body || {};
  if (!s.endpoint || !s.keys || !s.keys.p256dh || !s.keys.auth) return res.status(400).json({ error: 'Suscripción inválida' });
  try {
    // Si el dispositivo cambia de usuario en la misma sesión del navegador, el aviso pasa al usuario actual.
    await db.query(
      `INSERT INTO bitacora_push_subs (usuario_id, endpoint, p256dh, auth) VALUES ($1,$2,$3,$4)
       ON CONFLICT (endpoint) DO UPDATE SET usuario_id = EXCLUDED.usuario_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [req.session.usuario.id, s.endpoint, s.keys.p256dh, s.keys.auth]
    );
    res.json({ success: true });
  } catch (e) { console.error('[push suscribir]', e); res.status(500).json({ error: 'Error interno' }); }
});

router.post('/desuscribir', isAuth, async (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: 'Falta el endpoint' });
  await db.query('DELETE FROM bitacora_push_subs WHERE endpoint = $1 AND usuario_id = $2', [endpoint, req.session.usuario.id]);
  res.json({ success: true });
});

// Envía un aviso de prueba a los dispositivos del usuario actual.
router.post('/probar', isAuth, async (req, res) => {
  const n = await enviarPush(req.session.usuario.id, { titulo: 'yesnow', cuerpo: 'Los avisos están funcionando.', url: '/', tag: 'prueba' });
  res.json({ enviados: n });
});

module.exports = router;
