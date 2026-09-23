require('dotenv').config();
const fs = require('fs');
const db = require('../lib/db');

const ESTADO_MAP = { 'Implementado': 'implementado', 'Parcial': 'parcial', 'No implementado': 'pendiente' };

function parse(md) {
  const lines = md.split('\n');
  const items = [];
  let cat = null;
  let inResumen = false;
  for (const line of lines) {
    if (/^##\s+Resumen/.test(line)) { inResumen = true; continue; }
    if (inResumen) continue;
    const h = line.match(/^##\s+(.+)$/);
    if (h) { cat = h[1].trim(); continue; }
    if (!cat) continue;
    const row = line.match(/^\|\s*(.+?)\s*\|\s*(Implementado|Parcial|No implementado)\s*\|\s*(.+?)\s*\|$/);
    if (row) {
      const nombre = row[1].trim();
      if (nombre === 'Item') continue; // header row
      items.push({ categoria: cat, nombre, estado: ESTADO_MAP[row[2]], evidencia: row[3].trim() });
    }
  }
  return items;
}

async function main() {
  const md = fs.readFileSync('C:\\xampp\\htdocs\\YESNOW\\auditoria_checklist_gastos_comunes.md', 'utf8');
  const items = parse(md);
  console.log(`[seed-full] ${items.length} ítems parseados del audit.`);
  if (items.length < 60) { console.log('Muy pocos ítems parseados, algo salió mal, aborto.'); await db.pool.end(); return; }

  const { rows } = await db.query("SELECT id FROM bitacora_proyectos WHERE nombre = 'Gastos Comunes' LIMIT 1");
  if (!rows[0]) { console.log('No existe el proyecto "Gastos Comunes".'); await db.pool.end(); return; }
  const proyectoId = rows[0].id;

  await db.query('DELETE FROM bitacora_checklist_items WHERE proyecto_id = $1', [proyectoId]);
  for (const it of items) {
    await db.query(
      `INSERT INTO bitacora_checklist_items (proyecto_id, categoria, nombre, estado, evidencia) VALUES ($1,$2,$3,$4,$5)`,
      [proyectoId, it.categoria, it.nombre, it.estado, it.evidencia]
    );
  }
  console.log(`[seed-full] ${items.length} ítems insertados (reemplazando los de muestra).`);
  await db.pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
