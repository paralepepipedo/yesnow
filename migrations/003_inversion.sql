-- Inversión por proyecto: movimientos reales (tiempo y dinero) y gastos/tiempos futuros.
CREATE TABLE IF NOT EXISTS bitacora_inversion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id uuid NOT NULL REFERENCES bitacora_proyectos(id) ON DELETE CASCADE,
  estado text NOT NULL DEFAULT 'real' CHECK (estado IN ('real','plan')),
  tipo text NOT NULL CHECK (tipo IN ('tiempo','dinero')),
  cantidad numeric(14,2) NOT NULL CHECK (cantidad > 0),
  moneda text CHECK (moneda IN ('CLP','USD')),
  categoria text NOT NULL,
  concepto text NOT NULL,
  fecha date NOT NULL,
  personas uuid[] NOT NULL DEFAULT '{}',
  tarea_id uuid REFERENCES bitacora_tareas(id) ON DELETE SET NULL,
  creado_por uuid REFERENCES bitacora_usuarios(id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CHECK ((tipo = 'dinero' AND moneda IS NOT NULL) OR (tipo = 'tiempo' AND moneda IS NULL))
);
CREATE INDEX IF NOT EXISTS bitacora_inversion_proyecto ON bitacora_inversion (proyecto_id, estado, fecha DESC);

-- Las categorías de inversión viven en el mismo catálogo de grupos.
ALTER TABLE bitacora_grupos DROP CONSTRAINT IF EXISTS bitacora_grupos_tipo_check;
ALTER TABLE bitacora_grupos ADD CONSTRAINT bitacora_grupos_tipo_check CHECK (tipo IN ('fase','categoria','inversion'));

-- Categorías iniciales para los proyectos existentes.
INSERT INTO bitacora_grupos (proyecto_id, tipo, nombre)
SELECT p.id, 'inversion', c.nombre FROM bitacora_proyectos p CROSS JOIN (VALUES ('Reuniones'),('Suscripciones'),('Hosting y dominios'),('Desarrollo'),('Otros')) AS c(nombre)
ON CONFLICT DO NOTHING;
