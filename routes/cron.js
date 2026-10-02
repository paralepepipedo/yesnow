const express = require('express');
const router = express.Router();
const { ejecutarAvisos } = require('../lib/avisos');

// Vercel Cron llama a esta ruta con "Authorization: Bearer <CRON_SECRET>".
router.get('/avisos', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: 'CRON_SECRET no configurado' });
  if (req.get('authorization') !== `Bearer ${secret}`) return res.status(401).json({ error: 'No autorizado' });
  try {
    res.json(await ejecutarAvisos());
  } catch (e) { console.error('[cron avisos]', e); res.status(500).json({ error: 'Error interno' }); }
});

module.exports = router;
