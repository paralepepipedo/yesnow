CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS bitacora_usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  pin_hash text NOT NULL,
  avatar_color text NOT NULL DEFAULT 'accent',
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bitacora_proyectos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  descripcion text,
  referencia_url text,
  creado_por uuid REFERENCES bitacora_usuarios(id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bitacora_tareas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id uuid NOT NULL REFERENCES bitacora_proyectos(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  descripcion text,
  asignados uuid[] NOT NULL DEFAULT '{}',
  fase text,
  fecha_inicio date,
  fecha_fin date NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','en_progreso','completada')),
  color text NOT NULL DEFAULT '#0e7490',
  creado_por uuid REFERENCES bitacora_usuarios(id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bitacora_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id uuid NOT NULL REFERENCES bitacora_proyectos(id) ON DELETE CASCADE,
  categoria text NOT NULL,
  nombre text NOT NULL,
  prioridad text,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('implementado','parcial','pendiente')),
  evidencia text,
  asignados uuid[] NOT NULL DEFAULT '{}',
  tarea_id uuid REFERENCES bitacora_tareas(id) ON DELETE SET NULL,
  orden int NOT NULL DEFAULT 0,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bitacora_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id uuid NOT NULL REFERENCES bitacora_proyectos(id) ON DELETE CASCADE,
  texto text NOT NULL,
  autor_id uuid REFERENCES bitacora_usuarios(id),
  convertido_tipo text CHECK (convertido_tipo IN ('checklist','tarea')),
  convertido_id uuid,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bitacora_notificaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES bitacora_usuarios(id),
  tipo text NOT NULL,
  mensaje text NOT NULL,
  proyecto_id uuid REFERENCES bitacora_proyectos(id) ON DELETE CASCADE,
  tarea_id uuid REFERENCES bitacora_tareas(id) ON DELETE CASCADE,
  leido boolean NOT NULL DEFAULT false,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bit_tareas_proyecto ON bitacora_tareas(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_bit_checklist_proyecto ON bitacora_checklist_items(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_bit_ideas_proyecto ON bitacora_ideas(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_bit_notif_usuario ON bitacora_notificaciones(usuario_id, leido);

CREATE TABLE IF NOT EXISTS bitacora_session (
  sid varchar NOT NULL COLLATE "default",
  sess json NOT NULL,
  expire timestamp(6) NOT NULL
) WITH (OIDS=FALSE);
ALTER TABLE bitacora_session DROP CONSTRAINT IF EXISTS bitacora_session_pkey;
ALTER TABLE bitacora_session ADD CONSTRAINT bitacora_session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX IF NOT EXISTS idx_bit_session_expire ON bitacora_session(expire);
