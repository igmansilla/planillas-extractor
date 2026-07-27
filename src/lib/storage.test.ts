import { describe, expect, it } from 'vitest';
import { migrateConfig } from './storage';
import type { AppConfig } from '../types';

const base: AppConfig = { apiKey: 'k', model: '', columns: [] };

describe('migrateConfig', () => {
  it('borra el modelo que la versión vieja auto-elegía y no funciona', () => {
    // `gemini-pro-latest` era el default de la app hasta este fix: resuelve a
    // gemini-3.1-pro, que en free tier tiene cuota 0. Quedó guardado en el
    // localStorage de todos, y como sigue existiendo en el listado, sin esto
    // nadie se recupera solo. Vacío = la UI vuelve a auto-elegir (ahora un Flash).
    expect(migrateConfig({ ...base, model: 'models/gemini-pro-latest' }).model).toBe('');
  });

  it('respeta un modelo elegido a mano', () => {
    const elegido = 'models/gemini-3.1-pro-preview';
    expect(migrateConfig({ ...base, model: elegido }).model).toBe(elegido);
  });

  it('no toca el resto de la config', () => {
    const cfg: AppConfig = {
      apiKey: 'secreta',
      model: 'models/gemini-pro-latest',
      columns: [{ key: 'c0', label: 'Nombre' }],
    };
    const out = migrateConfig(cfg);
    expect(out.apiKey).toBe('secreta');
    expect(out.columns).toEqual(cfg.columns);
  });
});
