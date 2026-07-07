import { useMemo } from 'react';
import { useAppState } from '../state/store';
import { exportXlsx } from '../lib/excel';

export function Results() {
  const { config, photos } = useAppState();
  const columns = useMemo(() => config.columns.filter((c) => c.label), [config.columns]);

  const allRows = useMemo(
    () => photos.flatMap((p) => p.rows.map((row) => ({ row, photo: p.name, status: p.status }))),
    [photos],
  );
  const problems = photos.filter((p) => p.status === 'error' || p.status === 'REVISAR');

  return (
    <div className="screen">
      <h1>Resultados</h1>

      <p className="counter">
        {allRows.length} filas · {photos.length} fotos
      </p>

      <button className="btn primary" disabled={!allRows.length} onClick={() => exportXlsx(photos, columns)}>
        Descargar Excel
      </button>

      {problems.length > 0 && (
        <section className="card">
          <h2>Fotos con problemas ({problems.length})</h2>
          <ul className="problem-list">
            {problems.map((p) => (
              <li key={p.id}>
                <strong>{p.name}</strong> — {p.status}
                {p.error ? `: ${p.error}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
              <th>_foto</th>
            </tr>
          </thead>
          <tbody>
            {allRows.map(({ row, photo }, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.key} className={row[c.key] === 'REVISAR' ? 'cell-review' : undefined}>
                    {row[c.key] ?? ''}
                  </td>
                ))}
                <td className="cell-photo">{photo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
