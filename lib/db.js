const { Pool, types } = require('pg');

// OID 1082 = columnas `date`. Sin esto, node-postgres las convierte a un
// objeto Date con hora/zona horaria, lo que desalinea el día (ver el mismo
// problema ya resuelto en gantt.html). Se devuelven como 'YYYY-MM-DD' plano.
types.setTypeParser(1082, val => val);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
