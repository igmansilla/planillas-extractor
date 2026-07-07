import type { Column } from '../types';

// Genera un `key` estable a partir del índice. Se usa como property name en el
// responseSchema para evitar problemas con espacios/acentos en los labels visibles.
export function makeKey(index: number): string {
  return `c${index}`;
}

// responseSchema de Gemini: { filas: [ { c0, c1, ... } ] }, todas string.
// Usa el subconjunto OpenAPI que soporta la API (type, properties, items, required, description).
export function buildResponseSchema(columns: Column[]): object {
  const properties: Record<string, object> = {};
  for (const col of columns) {
    properties[col.key] = {
      type: 'string',
      description: col.hint ? `${col.label}: ${col.hint}` : col.label,
    };
  }
  return {
    type: 'object',
    properties: {
      filas: {
        type: 'array',
        items: {
          type: 'object',
          properties,
          propertyOrdering: columns.map((c) => c.key),
        },
      },
    },
    required: ['filas'],
  };
}

// Prompt en español que describe la tarea y las columnas.
export function buildPrompt(columns: Column[]): string {
  const lista = columns
    .map((c) => `- ${c.key} = "${c.label}"${c.hint ? ` (${c.hint})` : ''}`)
    .join('\n');
  return [
    'Sos un extractor de datos de planillas escritas a mano o impresas.',
    'La imagen contiene UNA tabla con varias filas. Extraé TODAS las filas.',
    'Devolvé un JSON con la forma { "filas": [ ... ] }, una entrada por fila detectada.',
    'Cada entrada tiene exactamente estas claves (usá el identificador de la izquierda como clave):',
    lista,
    '',
    'Reglas:',
    '- Si un dato no se puede leer con seguridad, poné el texto "REVISAR" en esa celda.',
    '- NO inventes datos: si una celda está vacía en la planilla, dejala como cadena vacía "".',
    '- No agregues filas de encabezado ni totales que no sean datos reales.',
    '- Respondé SÓLO con el JSON, sin texto adicional.',
  ].join('\n');
}
