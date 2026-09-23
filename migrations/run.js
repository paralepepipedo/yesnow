require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const db = require('../lib/db');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '001_init.sql'), 'utf8');
  await db.query(sql);
  console.log('[migrate] Tablas bitacora_* creadas u OK.');

  const { rows } = await db.query('SELECT count(*)::int AS n FROM bitacora_usuarios');
  if (rows[0].n === 0) {
    const manuelHash = await bcrypt.hash('2146', 10);
    const gonzaloHash = await bcrypt.hash('2125', 10);
    await db.query(
      `INSERT INTO bitacora_usuarios (nombre, pin_hash, avatar_color) VALUES ($1,$2,$3), ($4,$5,$6)`,
      ['Manuel', manuelHash, 'accent', 'Gonzalo', gonzaloHash, 'gonzalo']
    );
    console.log('[migrate] Usuarios Manuel y Gonzalo creados.');
  } else {
    console.log('[migrate] Usuarios ya existían, no se tocaron.');
  }

  await db.pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
