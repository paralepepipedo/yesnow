require('dotenv').config();
const db = require('../lib/db');

const PROYECTO = 'Gastos Comunes';

const COLOR = {
  'Finanzas y Rendición': '#2563eb',
  'Asambleas y Decisiones': '#7c3aed',
  'Gobierno del Condominio': '#059669',
  'Copropietarios y Residentes': '#d97706',
  'Operación y Cumplimiento': '#0891b2',
  'Trazabilidad y Responsabilidad': '#64748b',
};

const TAREAS = [
  ['Pago electrónico', 'Finanzas y Rendición', '2026-09-23', '2026-10-06', ['Gonzalo']],
  ['Rendición mensual al Comité', 'Finanzas y Rendición', '2026-09-23', '2026-10-03', ['Manuel']],
  ['Acuerdo previo del Comité para convenio de pago', 'Finanzas y Rendición', '2026-09-29', '2026-10-08', ['Manuel', 'Gonzalo']],
  ['Votaciones electrónicas', 'Asambleas y Decisiones', '2026-10-06', '2026-10-24', ['Gonzalo']],
  ['Libro de Actas digital (custodia, firmas y plazos)', 'Asambleas y Decisiones', '2026-10-06', '2026-10-30', ['Gonzalo']],
  ['Dashboard exclusivo de obligaciones del Comité', 'Gobierno del Condominio', '2026-10-01', '2026-10-20', ['Gonzalo']],
  ['Registro formal de acuerdos del Comité', 'Gobierno del Condominio', '2026-09-24', '2026-10-02', ['Manuel']],
  ['Calendario de obligaciones legales Comité/Admin.', 'Gobierno del Condominio', '2026-09-25', '2026-10-05', ['Manuel']],
  ['Diferenciar propietario / arrendatario / residente', 'Copropietarios y Residentes', '2026-09-23', '2026-09-30', ['Manuel']],
  ['Reservas de espacios comunes', 'Operación y Cumplimiento', '2026-10-08', '2026-11-02', ['Manuel', 'Gonzalo']],
  ['Control de acceso / visitas', 'Operación y Cumplimiento', '2026-10-15', '2026-11-10', ['Gonzalo']],
  ['Historial de acciones de usuarios', 'Trazabilidad y Responsabilidad', '2026-09-23', '2026-09-28', ['Gonzalo']],
  ['Checklist de obligaciones legales del administrador', 'Trazabilidad y Responsabilidad', '2026-09-29', '2026-10-15', ['Manuel']],
];

const IDEAS = [
  ['Evaluar integrar firma electrónica (FEA/FES) para que el Libro de Actas digital quede validado legalmente, no solo digitalizado.', 'Gonzalo'],
  ['¿Usamos Webpay o Flow como pasarela para el pago electrónico, en vez de construir una integración bancaria directa?', 'Manuel'],
];

(async () => {
  const { rows: projRows } = await db.query('SELECT id FROM bitacora_proyectos WHERE nombre = $1', [PROYECTO]);
  if (!projRows.length) { console.error('Proyecto no encontrado:', PROYECTO); process.exit(1); }
  const proyectoId = projRows[0].id;

  const { rows: users } = await db.query('SELECT id, nombre FROM bitacora_usuarios');
  const uid = {}; users.forEach(u => { uid[u.nombre] = u.id; });

  for (const [nombre, fase, inicio, fin, asignadosNombres] of TAREAS) {
    const asignados = asignadosNombres.map(n => uid[n]);
    await db.query(
      `INSERT INTO bitacora_tareas (proyecto_id, nombre, descripcion, asignados, fase, fecha_inicio, fecha_fin, color, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [proyectoId, nombre, null, asignados, fase, inicio, fin, COLOR[fase] || '#e4472b', uid.Manuel]
    );
  }
  console.log(TAREAS.length, 'tareas insertadas');

  for (const [texto, autorNombre] of IDEAS) {
    await db.query(`INSERT INTO bitacora_ideas (proyecto_id, texto, autor_id) VALUES ($1,$2,$3)`, [proyectoId, texto, uid[autorNombre]]);
  }
  console.log(IDEAS.length, 'ideas insertadas');

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
