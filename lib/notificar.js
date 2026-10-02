const webpush = require('web-push');
const db = require('./db');

const pushActivo = !!(process.env.VAPID_PUBLIC && process.env.VAPID_PRIVATE);
if (pushActivo) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);
}

// Envía el push a todos los dispositivos del usuario. Nunca lanza: un fallo de push no debe romper la acción que lo originó.
async function enviarPush(usuarioId, { titulo, cuerpo, url, tag }) {
  if (!pushActivo || !usuarioId) return 0;
  try {
    const { rows } = await db.query('SELECT id, endpoint, p256dh, auth FROM bitacora_push_subs WHERE usuario_id = $1', [usuarioId]);
    const payload = JSON.stringify({ titulo: titulo || 'yesnow', cuerpo, url: url || '/', tag });
    const res = await Promise.allSettled(rows.map(s =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, timeout: 8000 })
        .catch(async (e) => {
          // 404/410: el dispositivo ya no existe (app desinstalada o permiso revocado).
          if (e && (e.statusCode === 404 || e.statusCode === 410)) await db.query('DELETE FROM bitacora_push_subs WHERE id = $1', [s.id]);
          throw e;
        })
    ));
    return res.filter(r => r.status === 'fulfilled').length;
  } catch (e) { console.error('[push]', e.message); return 0; }
}

// Guarda el aviso en la campana y además lo envía como push.
async function notificar(usuarioId, tipo, mensaje, proyectoId, tareaId, extra = {}) {
  if (!usuarioId) return;
  await db.query(
    `INSERT INTO bitacora_notificaciones (usuario_id, tipo, mensaje, proyecto_id, tarea_id) VALUES ($1,$2,$3,$4,$5)`,
    [usuarioId, tipo, mensaje, proyectoId || null, tareaId || null]
  );
  await enviarPush(usuarioId, {
    titulo: extra.titulo,
    cuerpo: mensaje,
    url: extra.url || (proyectoId ? `/proyecto/${proyectoId}` : '/'),
    tag: extra.tag,
  });
}

module.exports = { notificar, enviarPush, pushActivo };
