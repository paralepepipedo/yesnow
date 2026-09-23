require('dotenv').config();
const db = require('../lib/db');

const items = [
  ['Gobierno del Condominio', 'Rol diferenciado para Comité', 'Core', 'implementado', "usuarios.rol incluye 'comite'; tabla comite_miembros; lógica en libro-novedades.php y hito-votacion-voto.php."],
  ['Gobierno del Condominio', 'Registro formal de acuerdos del Comité', 'Core', 'parcial', 'hito_bitacora + hito_votacion_votos registran decisiones sobre hitos de proyecto; no existe un "libro de acuerdos" general.'],
  ['Gobierno del Condominio', 'Vista financiera para Comité', 'Core', 'pendiente', 'requireAdmin()/requireComunidad() solo aceptan admin/superadmin; el comité no tiene acceso a stats.php.'],
  ['Asambleas y Decisiones', 'Citaciones a asambleas', '★', 'implementado', 'tabla asamblea_citaciones_enviadas; asamblea-crear.php envía citación por correo, con reenvío.'],
  ['Asambleas y Decisiones', 'Cálculo automático de quórum legal', '★', 'implementado', 'api/helpers/asamblea-quorum.php: calcularConstitucion()/calcularAcuerdoTema() con umbrales legales por tipo.'],
  ['Asambleas y Decisiones', 'Consulta por escrito', '★', 'pendiente', 'sin coincidencias en el código.'],
  ['Finanzas y Rendición', 'Conciliación bancaria', 'Necesario', 'implementado', 'cartola-pagos.php + cartola_movimientos: importación, identificación por RUT/glosa, dedupe.'],
  ['Finanzas y Rendición', 'Rendición mensual al Comité', 'Workflow obligatorio', 'pendiente', 'sin coincidencias de "rendición"/"balance" en todo el código.'],
  ['Trazabilidad y Responsabilidad', 'Historial de acciones de usuarios', 'Core', 'parcial', 'auditorías puntuales (multas_auditoria, hito_bitacora, intentos_login) — no hay log general para todas las entidades.'],
  ['Trazabilidad y Responsabilidad', 'Checklist de obligaciones legales del administrador', 'Core diferenciador', 'pendiente', 'verificaciones_estado es checklist de inspección física, no de obligaciones legales.'],
];

async function main() {
  const { rows } = await db.query("SELECT id FROM bitacora_proyectos WHERE nombre = 'Gastos Comunes' LIMIT 1");
  if (!rows[0]) { console.log('No existe el proyecto "Gastos Comunes" todavía.'); await db.pool.end(); return; }
  const proyectoId = rows[0].id;

  const { rows: existing } = await db.query('SELECT count(*)::int AS n FROM bitacora_checklist_items WHERE proyecto_id = $1', [proyectoId]);
  if (existing[0].n > 0) { console.log('Ya hay checklist cargado para este proyecto, no se duplica.'); await db.pool.end(); return; }

  for (const [categoria, nombre, prioridad, estado, evidencia] of items) {
    await db.query(
      `INSERT INTO bitacora_checklist_items (proyecto_id, categoria, nombre, prioridad, estado, evidencia) VALUES ($1,$2,$3,$4,$5,$6)`,
      [proyectoId, categoria, nombre, prioridad, estado, evidencia]
    );
  }
  console.log(`[seed] ${items.length} ítems de checklist insertados en "Gastos Comunes".`);
  await db.pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
