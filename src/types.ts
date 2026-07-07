// Tipos compartidos de la app.

export type PhotoStatus = 'pendiente' | 'procesando' | 'ok' | 'REVISAR' | 'error';

// Una columna configurada por el usuario.
// `key` es un identificador estable/saneado (ej. c0, c1) usado como property name
// en el responseSchema y en el JSON que devuelve Gemini.
// `label` es el nombre visible que va al encabezado del Excel.
export interface Column {
  key: string;
  label: string;
  hint?: string;
}

// Fila extraída: mapa key -> valor (siempre string; "REVISAR" si ilegible).
export type Row = Record<string, string>;

export interface PhotoItem {
  id: string;
  name: string;
  file: File; // archivo original (se persiste en IndexedDB para resume)
  thumbUrl: string; // object URL para la miniatura (se regenera al recargar)
  status: PhotoStatus;
  rows: Row[];
  error?: string;
}

export interface ModelInfo {
  name: string; // "models/gemini-..."
  displayName: string;
}

export interface AppConfig {
  apiKey: string;
  model: string;
  columns: Column[];
}
