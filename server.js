require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');
const db = require('./lib/db');

const authRoutes = require('./routes/auth');
const proyectosRoutes = require('./routes/proyectos');
const proyectoDatosRoutes = require('./routes/proyecto-datos');
const notificacionesRoutes = require('./routes/notificaciones');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3010;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new pgSession({
    pool: db.pool,
    tableName: 'bitacora_session',
    createTableIfMissing: false,
  }),
  secret: process.env.SESSION_SECRET || 'bitacora-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  }
}));

app.use('/api/auth', authRoutes);
app.use('/api/proyectos', proyectosRoutes);
app.use('/api/proyectos/:id', proyectoDatosRoutes);
app.use('/api/notificaciones', notificacionesRoutes);

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/proyectos', (req, res) => res.sendFile(path.join(__dirname, 'public', 'proyectos', 'index.html')));
app.get('/proyecto/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'proyecto', 'index.html')));
app.get('/proyecto/:id/gantt', (req, res) => res.sendFile(path.join(__dirname, 'public', 'proyecto', 'gantt.html')));
app.get('/proyecto/:id/checklist', (req, res) => res.sendFile(path.join(__dirname, 'public', 'proyecto', 'checklist.html')));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\nBitácora Compartida corriendo en http://localhost:${PORT}\n`);
  });
}

module.exports = app;
