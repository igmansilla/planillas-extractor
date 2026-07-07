import { useState } from 'react';
import { useAppState, useDispatch } from '../state/store';
import { listModels } from '../lib/gemini';
import { buildPrompt, makeKey } from '../lib/schema';
import type { Column } from '../types';

export function Config() {
  const { config, models } = useAppState();
  const dispatch = useDispatch();
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  const setColumns = (columns: Column[]) => dispatch({ type: 'setConfig', config: { columns } });

  async function handleLoadModels() {
    setLoadingModels(true);
    setModelsError(null);
    try {
      const list = await listModels(config.apiKey.trim());
      dispatch({ type: 'setModels', models: list });
      if (list.length && !config.model) {
        dispatch({ type: 'setConfig', config: { model: list[0].name } });
      }
    } catch (e) {
      setModelsError((e as Error).message);
    } finally {
      setLoadingModels(false);
    }
  }

  function updateColumn(i: number, patch: Partial<Column>) {
    setColumns(config.columns.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function addColumn() {
    setColumns([...config.columns, { key: makeKey(config.columns.length), label: '', hint: '' }]);
  }
  function removeColumn(i: number) {
    // Reindexa las keys para mantenerlas estables/contiguas.
    const next = config.columns
      .filter((_, idx) => idx !== i)
      .map((c, idx) => ({ ...c, key: makeKey(idx) }));
    setColumns(next);
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= config.columns.length) return;
    const next = [...config.columns];
    [next[i], next[j]] = [next[j], next[i]];
    setColumns(next.map((c, idx) => ({ ...c, key: makeKey(idx) })));
  }

  const canContinue = config.apiKey.trim() && config.model && config.columns.some((c) => c.label);

  return (
    <div className="screen">
      <h1>Configuración</h1>

      <section className="card">
        <label className="field">
          <span>API key de Gemini</span>
          <input
            type="password"
            autoComplete="off"
            placeholder="Pegá tu token"
            value={config.apiKey}
            onChange={(e) => dispatch({ type: 'setConfig', config: { apiKey: e.target.value } })}
          />
        </label>
        <button className="btn" onClick={handleLoadModels} disabled={!config.apiKey.trim() || loadingModels}>
          {loadingModels ? 'Cargando…' : 'Cargar modelos'}
        </button>
        {modelsError && <p className="error">{modelsError}</p>}
        {models.length > 0 && (
          <label className="field">
            <span>Modelo</span>
            <select
              value={config.model}
              onChange={(e) => dispatch({ type: 'setConfig', config: { model: e.target.value } })}
            >
              {models.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      <section className="card">
        <h2>Columnas</h2>
        {config.columns.map((col, i) => (
          <div className="column-row" key={col.key}>
            <div className="column-inputs">
              <input
                placeholder="Nombre de columna"
                value={col.label}
                onChange={(e) => updateColumn(i, { label: e.target.value })}
              />
              <input
                placeholder="Pista (opcional)"
                value={col.hint ?? ''}
                onChange={(e) => updateColumn(i, { hint: e.target.value })}
              />
            </div>
            <div className="column-actions">
              <button className="icon-btn" onClick={() => move(i, -1)} aria-label="Subir">↑</button>
              <button className="icon-btn" onClick={() => move(i, 1)} aria-label="Bajar">↓</button>
              <button className="icon-btn" onClick={() => removeColumn(i)} aria-label="Quitar">✕</button>
            </div>
          </div>
        ))}
        <button className="btn ghost" onClick={addColumn}>+ Agregar columna</button>
      </section>

      <section className="card">
        <h2>Vista previa del prompt</h2>
        <pre className="prompt-preview">{buildPrompt(config.columns.filter((c) => c.label))}</pre>
      </section>

      <button className="btn primary" disabled={!canContinue} onClick={() => dispatch({ type: 'setScreen', screen: 'upload' })}>
        Continuar
      </button>
    </div>
  );
}
