import { describe, expect, it } from 'vitest';
import { isPermanentQuotaError, pickCurated, rankModels } from './gemini';
import listing from './__fixtures__/models-listing.json';

// Listado real de la API (capturado 2026-07-27, 56 modelos). Sirve de regresión:
// el bug original fue que el orden elegía `gemini-pro-latest` como default, que en
// free tier tiene cuota 0 y hacía fallar TODAS las fotos con 429.
const raw = listing as { name: string; supportedGenerationMethods?: string[] }[];

describe('rankModels', () => {
  const ranked = rankModels(raw);
  const names = ranked.map((m) => m.name);

  it('elige un Flash como default, no un Pro', () => {
    // Regresión del bug: models[0] era `gemini-pro-latest` → `gemini-3.1-pro`,
    // sin cuota en free tier. El default tiene que funcionar sin billing.
    expect(names[0]).toBe('models/gemini-flash-latest');
  });

  it('prefiere el alias -latest antes que una versión clavada', () => {
    // Los alias los mantiene Google apuntando al modelo vigente, así que no
    // se pudren cuando sale una versión nueva.
    expect(names.indexOf('models/gemini-flash-latest')).toBeLessThan(
      names.indexOf('models/gemini-3.6-flash'),
    );
  });

  it('prefiere el flash completo antes que el lite', () => {
    expect(names.indexOf('models/gemini-flash-latest')).toBeLessThan(
      names.indexOf('models/gemini-flash-lite-latest'),
    );
  });

  it('ordena los flash por versión descendente', () => {
    expect(names.indexOf('models/gemini-3.6-flash')).toBeLessThan(
      names.indexOf('models/gemini-2.0-flash'),
    );
  });

  it('deja los Pro disponibles pero después de los Flash', () => {
    // Siguen elegibles a mano (por si activan billing), solo que no de default.
    const primerPro = names.findIndex((n) => n.includes('-pro'));
    const ultimoFlash = names.map((n) => n.includes('flash')).lastIndexOf(true);
    expect(primerPro).toBeGreaterThan(ultimoFlash);
    expect(names).toContain('models/gemini-3.1-pro-preview');
  });

  it('excluye modelos que no pueden devolver JSON desde una imagen', () => {
    // Todos estos aceptan generateContent (por eso pasaban el filtro viejo) pero
    // revientan con responseSchema: son de audio, de generar imágenes, etc.
    for (const malo of [
      'models/gemini-2.5-pro-preview-tts',
      'models/gemini-3.1-flash-tts-preview',
      'models/gemini-3-pro-image',
      'models/gemini-3-pro-image-preview',
      'models/gemini-2.5-flash-image',
      'models/gemini-3.1-flash-lite-image',
      'models/gemini-robotics-er-1.6-preview',
      'models/gemini-2.5-computer-use-preview-10-2025',
    ]) {
      expect(names).not.toContain(malo);
    }
  });

  it('excluye lo que no soporta generateContent', () => {
    const embeddings = raw
      .filter((m) => !(m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m) => m.name);
    for (const e of embeddings) expect(names).not.toContain(e);
  });

  it('no descarta los flash de uso general', () => {
    expect(names).toContain('models/gemini-3.6-flash');
    expect(names).toContain('models/gemini-2.0-flash');
  });
});

describe('pickCurated', () => {
  const curados = pickCurated(rankModels(raw));
  const names = curados.map((m) => m.name);

  it('deja 3 opciones, no 20', () => {
    // El punto de todo esto: bajarle la carga cognitiva al usuario final.
    expect(curados).toHaveLength(3);
  });

  it('el default sigue siendo el flash gratis', () => {
    expect(names[0]).toBe('models/gemini-flash-latest');
    expect(curados[0].requiresBilling).toBeFalsy();
  });

  it('la segunda opción es un flash distinto, como escape ante un 503', () => {
    expect(names[1]).toBe('models/gemini-3.6-flash');
    expect(names[1]).not.toBe(names[0]);
    expect(curados[1].requiresBilling).toBeFalsy();
  });

  it('el Pro va último y avisa que necesita facturación', () => {
    expect(curados[2].requiresBilling).toBe(true);
    expect(names[2]).toContain('-pro');
  });

  it('el Pro no es el alias, que la migración borraría a sus espaldas', () => {
    // migrateConfig limpia `models/gemini-pro-latest` de la config guardada. Si lo
    // ofreciéramos acá, elegirlo a mano se desharía solo al recargar.
    expect(names[2]).not.toBe('models/gemini-pro-latest');
  });

  it('evita las variantes especializadas del Pro', () => {
    expect(names[2]).not.toContain('customtools');
  });

  it('todas las opciones traen una nota legible', () => {
    for (const m of curados) expect(m.note).toBeTruthy();
  });

  it('los curados salen del listado completo, sin inventar nombres', () => {
    const todos = rankModels(raw).map((m) => m.name);
    for (const n of names) expect(todos).toContain(n);
  });

  it('degrada sin romperse si la API no devuelve Pros', () => {
    const soloFlash = raw.filter((m) => !m.name.includes('-pro'));
    const out = pickCurated(rankModels(soloFlash));
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((m) => !m.requiresBilling)).toBe(true);
  });

  it('no repite modelo si hay un solo flash disponible', () => {
    const unoSolo = raw.filter((m) => m.name === 'models/gemini-flash-latest');
    const out = pickCurated(rankModels(unoSolo));
    expect(out).toHaveLength(1);
  });
});

describe('isPermanentQuotaError', () => {
  // Cuerpo real del 429 que devolvió la API con `gemini-pro-latest` en free tier.
  const cuota0 = JSON.stringify({
    error: {
      code: 429,
      message:
        'You exceeded your current quota. \n* Quota exceeded for metric: ' +
        'generativelanguage.googleapis.com/generate_content_free_tier_requests, ' +
        'limit: 0, model: gemini-3.1-pro\nPlease retry in 24.44s.',
    },
  });

  it('detecta limit: 0 como permanente (no tiene sentido reintentar)', () => {
    expect(isPermanentQuotaError(cuota0)).toBe(true);
  });

  it('no marca como permanente un rate limit normal', () => {
    const transitorio = JSON.stringify({
      error: { message: 'Quota exceeded ... limit: 15, model: gemini-flash-latest' },
    });
    expect(isPermanentQuotaError(transitorio)).toBe(false);
  });

  it('ante un cuerpo vacío o raro asume transitorio', () => {
    expect(isPermanentQuotaError('')).toBe(false);
    expect(isPermanentQuotaError('no es json')).toBe(false);
  });
});
