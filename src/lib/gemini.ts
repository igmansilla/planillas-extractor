import type { ModelInfo, Row } from '../types';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Error de extracción que el llamador puede distinguir de un resultado sin filas.
export class GeminiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
  }
}

interface RawModel {
  name: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
}

// GET /models → filtra Gemini que soporten generateContent (los Gemini soportan
// imágenes; la API no marca "visión" explícitamente, así que el filtro es por nombre).
export async function listModels(apiKey: string): Promise<ModelInfo[]> {
  const res = await fetch(`${BASE}/models?pageSize=1000`, {
    headers: { 'x-goog-api-key': apiKey },
  });
  if (!res.ok) {
    throw new GeminiError(`No se pudieron listar los modelos (${res.status})`, res.status);
  }
  const data = (await res.json()) as { models?: RawModel[] };
  const models = (data.models ?? [])
    .filter(
      (m) =>
        m.name.startsWith('models/gemini') &&
        (m.supportedGenerationMethods ?? []).includes('generateContent'),
    )
    .map((m) => ({ name: m.name, displayName: m.displayName ?? m.name.replace('models/', '') }));

  // Prioriza los *-pro-* más nuevos arriba (para el default de la UI).
  models.sort((a, b) => {
    const pa = a.name.includes('-pro') ? 0 : 1;
    const pb = b.name.includes('-pro') ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return b.name.localeCompare(a.name); // desc → nombres más nuevos arriba
  });
  return models;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// POST /models/<model>:generateContent con structured output.
// Reintenta 429/5xx con backoff exponencial (máx 3 reintentos).
export async function extractRows(
  apiKey: string,
  model: string,
  imageBase64: string,
  mimeType: string,
  schema: object,
  prompt: string,
): Promise<Row[]> {
  const modelPath = model.startsWith('models/') ? model : `models/${model}`;
  const url = `${BASE}/${modelPath}:generateContent`;
  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  };

  let lastErr: GeminiError | null = null;
  for (let attempt = 0; attempt <= 3; attempt++) {
    if (attempt > 0) await sleep(2 ** (attempt - 1) * 1000 + Math.random() * 300);
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      lastErr = new GeminiError(`Error de red: ${(e as Error).message}`);
      continue; // reintentar
    }

    if (res.status === 429 || res.status >= 500) {
      lastErr = new GeminiError(`Gemini respondió ${res.status}`, res.status);
      continue; // reintentar
    }
    if (!res.ok) {
      throw new GeminiError(`Gemini respondió ${res.status}`, res.status); // 4xx no se reintenta
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new GeminiError('Respuesta vacía de Gemini');
    let parsed: { filas?: Row[] };
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new GeminiError('La respuesta no es JSON válido');
    }
    return parsed.filas ?? [];
  }
  throw lastErr ?? new GeminiError('Falló la extracción tras varios reintentos');
}
