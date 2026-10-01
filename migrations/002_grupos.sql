-- Catálogo de fases (tareas Gantt) y categorías (ítems de checklist) por proyecto.
-- tareas.fase e items.categoria siguen siendo texto; esta tabla permite fases/categorías vacías.
CREATE TABLE IF NOT EXISTS bitacora_grupos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id uuid NOT NULL REFERENCES bitacora_proyectos(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('fase','categoria')),
  nombre text NOT NULL,
  orden int NOT NULL DEFAULT 0,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bitacora_grupos_uniq ON bitacora_grupos (proyecto_id, tipo, lower(nombre));

INSERT INTO bitacora_grupos (proyecto_id, tipo, nombre)
SELECT DISTINCT ON (proyecto_id, lower(fase)) proyecto_id, 'fase', fase
FROM bitacora_tareas WHERE fase IS NOT NULL AND btrim(fase) <> ''
ON CONFLICT DO NOTHING;

INSERT INTO bitacora_grupos (proyecto_id, tipo, nombre)
SELECT DISTINCT ON (proyecto_id, lower(categoria)) proyecto_id, 'categoria', categoria
FROM bitacora_checklist_items WHERE categoria IS NOT NULL AND btrim(categoria) <> ''
ON CONFLICT DO NOTHING;
