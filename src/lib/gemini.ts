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

export interface RawModel {
  name: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
}

// Modelos que aceptan generateContent pero NO sirven acá: generan audio o imágenes,
// o son de robótica/control de pantalla. Con responseSchema devuelven 400.
const NO_APTOS = /-tts|-image|robotics|computer-use|embedding/;

// Versión que aparece en el nombre: "gemini-3.6-flash" → 3.6. Los alias sin número
// ("gemini-flash-latest") dan 0 y se ordenan aparte, por delante.
function versionOf(name: string): number {
  const m = name.match(/gemini-(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

// Ordena y filtra el listado crudo de la API. El primero es el default de la UI, así
// que tiene que ser un modelo que ande sin billing: los Flash tienen cuota en free
// tier, los Pro tienen `limit: 0` y fallan siempre. Los Pro quedan igual en la lista
// para elegirlos a mano si algún día se activa facturación.
export function rankModels(raw: RawModel[]): ModelInfo[] {
  const models = raw
    .filter(
      (m) =>
        m.name.startsWith('models/gemini') &&
        (m.supportedGenerationMethods ?? []).includes('generateContent') &&
        !NO_APTOS.test(m.name),
    )
    .map((m) => ({ name: m.name, displayName: m.displayName ?? m.name.replace('models/', '') }));

  const rank = (name: string) => ({
    familia: name.includes('flash') ? 0 : name.includes('-pro') ? 1 : 2,
    lite: name.includes('lite') ? 1 : 0,
    // Los alias -latest los mantiene Google apuntando al modelo vigente: no quedan
    // obsoletos solos, así que van antes que cualquier versión clavada.
    alias: name.endsWith('-latest') ? 0 : 1,
    version: versionOf(name),
  });

  models.sort((a, b) => {
    const ra = rank(a.name);
    const rb = rank(b.name);
    return (
      ra.familia - rb.familia ||
      ra.lite - rb.lite ||
      ra.alias - rb.alias ||
      rb.version - ra.version ||
      a.name.localeCompare(b.name)
    );
  });
  return models;
}

// Recorta el listado ordenado a un puñado de opciones con nombre humano. Elegir entre
// 20 modelos es una carga inútil para quien solo quiere escanear planillas: acá quedan
// las 3 que importan, derivadas por regla del listado vivo (no hardcodeadas) para que
// no se pudran cuando Google retire modelos.
export function pickCurated(ranked: ModelInfo[]): ModelInfo[] {
  const esFlash = (n: string) => n.includes('flash');
  const esLite = (n: string) => n.includes('lite');
  const esPro = (n: string) => n.includes('-pro');

  // `ranked` ya viene ordenado (alias primero, después versión desc), así que el orden
  // de estos filtros alcanza para elegir bien.
  const flashes = ranked.filter((m) => esFlash(m.name) && !esLite(m.name));
  const pros = ranked.filter(
    (m) =>
      esPro(m.name) &&
      // El alias `gemini-pro-latest` está en la blocklist de migrateConfig: ofrecerlo
      // haría que elegirlo a mano se deshaga solo al recargar.
      !m.name.endsWith('-latest') &&
      // Variante especializada en tool-calling, no aporta nada para leer planillas.
      !m.name.includes('customtools'),
  );

  const curados: ModelInfo[] = [];
  if (flashes[0]) curados.push({ ...flashes[0], note: 'Recomendado — rápido y gratis' });
  // Escape real: ya vimos al flash principal devolver 503 por alta demanda.
  if (flashes[1]) curados.push({ ...flashes[1], note: 'Alternativa — si el primero falla' });
  if (pros[0]) {
    curados.push({
      ...pros[0],
      note: 'Máxima precisión — requiere facturación',
      requiresBilling: true,
    });
  }
  return curados;
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
  return rankModels(data.models ?? []);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// POST /models/<model>:generateContent con structured output.
const MAX_RETRIES = 5;
const MAX_BACKOFF_MS = 60_000;

// Cuánto esperar antes de reintentar un 429/5xx. Respeta el retraso que sugiere el
// servidor (header Retry-After o RetryInfo.retryDelay en el body de Gemini); si no
// hay, usa backoff exponencial. Todo con techo de MAX_BACKOFF_MS.
// Un 429 con `limit: 0` no es "esperá un rato": es que la API key no tiene NADA de
// cuota para ese modelo (típico de los Pro en free tier). Reintentar es tiempo
// perdido —eran ~2 min por foto— y siempre termina en error.
export function isPermanentQuotaError(body: string): boolean {
  return /limit:\s*0\b/.test(body);
}

// Nombre del modelo que la API menciona en el error de cuota, para poder decirle al
// usuario cuál es el que no tiene acceso (el alias no se lo dice).
function modeloDelError(body: string): string | null {
  return body.match(/model:\s*([\w.-]+)/)?.[1] ?? null;
}

function retryDelayMs(res: Response, body: string, attempt: number): number {
  const header = res.headers.get('retry-after');
  if (header) {
    const secs = Number(header);
    if (!Number.isNaN(secs)) return Math.min(secs * 1000, MAX_BACKOFF_MS);
    const when = Date.parse(header);
    if (!Number.isNaN(when)) return Math.min(Math.max(0, when - Date.now()), MAX_BACKOFF_MS);
  }
  const m = body.match(/"retryDelay"\s*:\s*"([\d.]+)s"/);
  if (m) return Math.min(Math.ceil(parseFloat(m[1]) * 1000) + 500, MAX_BACKOFF_MS);
  return Math.min(2 ** attempt * 1000 + Math.random() * 400, MAX_BACKOFF_MS);
}

// Reintenta 429/5xx respetando el retraso del servidor (máx MAX_RETRIES reintentos).
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
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      lastErr = new GeminiError(`Error de red: ${(e as Error).message}`);
      if (attempt < MAX_RETRIES) {
        await sleep(Math.min(2 ** attempt * 1000, MAX_BACKOFF_MS));
        continue; // reintentar
      }
      break;
    }

    if (res.status === 429 || res.status >= 500) {
      const errBody = await res.text().catch(() => '');
      if (res.status === 429 && isPermanentQuotaError(errBody)) {
        const real = modeloDelError(errBody);
        throw new GeminiError(
          `Tu API key no tiene cuota para ${real ?? model} (el plan gratuito da 0 requests ` +
            `para este modelo). Elegí un modelo Flash en Config, o activá facturación en Google Cloud.`,
          429,
        );
      }
      lastErr = new GeminiError(
        res.status === 429 ? 'Límite de la API alcanzado (429)' : `Gemini respondió ${res.status}`,
        res.status,
      );
      if (attempt < MAX_RETRIES) {
        await sleep(retryDelayMs(res, errBody, attempt));
        continue; // reintentar
      }
      break;
    }
    if (!res.ok) {
      // 4xx no se reintenta. Incluye el 404 de modelos que la API lista pero ya
      // retiró ("no longer available to new users").
      const detalle = await res.text().catch(() => '');
      const msg = detalle.match(/"message":\s*"([^"]+)"/)?.[1];
      throw new GeminiError(`Gemini respondió ${res.status}${msg ? `: ${msg}` : ''}`, res.status);
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
