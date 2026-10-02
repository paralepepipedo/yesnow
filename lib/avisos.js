const db = require('./db');
const { notificar } = require('./notificar');

const TZ = 'America/Santiago';
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Fecha de hoy en Chile como 'YYYY-MM-DD' (el servidor corre en UTC).
function hoyChile() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
const aUTC = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); };
const diasEntre = (desde, hasta) => Math.round((aUTC(hasta) - aUTC(desde)) / 86400000);
function fechaLarga(s) { const d = new Date(aUTC(s)); return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`; }

// "Reuniones" / "Reunión" / "reunion", sin importar mayúsculas ni tildes.
const esReunion = (cat) => String(cat || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().startsWith('reunion');

async function todosLosUsuarios() {
  return (await db.query('SELECT id FROM bitacora_usuarios')).rows.map(r => r.id);
}

// Una reunión es un movimiento de tiempo en la categoría Reuniones; lo que manda es su fecha, no si está como plan o real.
const esReunionAgendada = (m) => m.tipo === 'tiempo' && esReunion(m.categoria);

// Marca el aviso como enviado; devuelve false si ya se había enviado antes.
async function reclamar(clave) {
  const { rowCount } = await db.query('INSERT INTO bitacora_avisos_enviados (clave) VALUES ($1) ON CONFLICT DO NOTHING', [clave]);
  return rowCount === 1;
}

// Revisa plazos y reuniones. Pensado para correr una vez al día (cron).
async function ejecutarAvisos() {
  const hoy = hoyChile();
  const limite = new Date(aUTC(hoy) + 3 * 86400000).toISOString().slice(0, 10);
  const out = { plazos: 0, reuniones: 0 };
  const usuarios = await todosLosUsuarios();

  const { rows: tareas } = await db.query(
    `SELECT t.id, t.nombre, t.asignados, t.fecha_fin, t.proyecto_id, p.nombre AS proyecto
     FROM bitacora_tareas t JOIN bitacora_proyectos p ON p.id = t.proyecto_id
     WHERE t.estado <> 'completada' AND t.fecha_fin BETWEEN $1 AND $2`, [hoy, limite]
  );
  for (const t of tareas) {
    const dias = diasEntre(hoy, t.fecha_fin);
    const tramo = dias === 0 ? 0 : dias === 1 ? 1 : 3; // avisos a los 3 días, a 1 día y el mismo día
    if (!(await reclamar(`plazo:${t.id}:${tramo}:${String(t.fecha_fin).slice(0, 10)}`))) continue;
    const cuando = dias === 0 ? 'Vence hoy' : dias === 1 ? 'Vence mañana' : `Vence en ${dias} días`;
    const destino = (t.asignados && t.asignados.length) ? t.asignados : usuarios;
    for (const uid of destino) {
      await notificar(uid, 'plazo', `${cuando}: "${t.nombre}" en ${t.proyecto}`, t.proyecto_id, t.id, { titulo: 'Plazo por vencer', url: `/proyecto/${t.proyecto_id}/gantt`, tag: `plazo-${t.id}` });
    }
    out.plazos++;
  }

  const { rows: movs } = await db.query(
    `SELECT i.id, i.categoria, i.concepto, i.personas, i.fecha, i.proyecto_id, p.nombre AS proyecto
     FROM bitacora_inversion i JOIN bitacora_proyectos p ON p.id = i.proyecto_id
     WHERE i.tipo = 'tiempo' AND i.fecha = $1`, [hoy]
  );
  for (const m of movs) {
    if (!esReunion(m.categoria)) continue;
    if (!(await reclamar(`reunion:${m.id}:hoy:${hoy}`))) continue;
    const destino = (m.personas && m.personas.length) ? m.personas : usuarios;
    for (const uid of destino) {
      await notificar(uid, 'reunion', `Reunión hoy (${fechaLarga(m.fecha)}): ${m.concepto}`, m.proyecto_id, null, { titulo: 'Reunión de hoy', url: `/proyecto/${m.proyecto_id}/inversion`, tag: `reunion-${m.id}` });
    }
    out.reuniones++;
  }
  return out;
}

module.exports = { ejecutarAvisos, hoyChile, diasEntre, fechaLarga, esReunionAgendada, todosLosUsuarios };
