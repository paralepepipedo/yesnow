-- Notificaciones push: un registro por dispositivo suscrito.
CREATE TABLE IF NOT EXISTS bitacora_push_subs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES bitacora_usuarios(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bitacora_push_subs_usuario ON bitacora_push_subs (usuario_id);

-- Avisos automáticos (plazos y reuniones) ya enviados, para no repetirlos si el proceso corre otra vez.
CREATE TABLE IF NOT EXISTS bitacora_avisos_enviados (
  clave text PRIMARY KEY,
  enviado_en timestamptz NOT NULL DEFAULT now()
);
