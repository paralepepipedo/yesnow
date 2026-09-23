require('dotenv').config();
const db = require('../lib/db');

async function main() {
  await db.query(`DELETE FROM bitacora_tareas WHERE nombre LIKE 'Prueba codificaci%'`);
  await db.query(`UPDATE bitacora_tareas SET fase = 'Diseño' WHERE nombre = 'Acordar bosquejo final de Dashboard'`);
  const { rows } = await db.query(`SELECT nombre, fase FROM bitacora_tareas ORDER BY creado_en`);
  console.log(rows);
  await db.pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
