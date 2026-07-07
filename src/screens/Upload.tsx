import { useMemo, useState } from 'react';
import { savePhoto, useAppState, useDispatch } from '../state/store';
import { compressImage, makeThumbnail } from '../lib/image';
import { extractRows } from '../lib/gemini';
import { buildPrompt, buildResponseSchema } from '../lib/schema';
import { runQueue } from '../lib/queue';
import type { PhotoItem, PhotoStatus, Row } from '../types';

const statusLabel: Record<PhotoStatus, string> = {
  pendiente: 'Pendiente',
  procesando: 'Procesando…',
  ok: 'OK',
  REVISAR: 'REVISAR',
  error: 'Error',
};

export function Upload() {
  const { config, photos } = useAppState();
  const dispatch = useDispatch();
  const [running, setRunning] = useState(false);

  const columns = useMemo(() => config.columns.filter((c) => c.label), [config.columns]);
  const done = photos.filter((p) => p.status === 'ok' || p.status === 'REVISAR' || p.status === 'error').length;

  async function onFiles(files: FileList | null) {
    if (!files) return;
    const arr = Array.from(files);
    const stamp = Date.now();
    // Secuencial a propósito: genera una miniatura por vez para no decodificar
    // muchas fotos full-res en paralelo (evita el "memoria insuficiente" en celu).
    for (let i = 0; i < arr.length; i++) {
      const file = arr[i];
      let thumbUrl = '';
      try {
        thumbUrl = await makeThumbnail(file);
      } catch {
        // Si no se puede hacer la miniatura, seguimos sin ella (se procesa igual).
      }
      const item: PhotoItem = {
        id: `${stamp}-${i}-${file.name}`,
        name: file.name,
        file,
        thumbUrl,
        status: 'pendiente',
        rows: [],
      };
      dispatch({ type: 'addPhotos', photos: [item] });
      void savePhoto(item); // persistir pendiente para resume
    }
  }

  async function process(target: PhotoItem[]) {
    if (!target.length) return;
    setRunning(true);
    const schema = buildResponseSchema(columns);
    const prompt = buildPrompt(columns);

    await runQueue(
      target,
      async (photo) => {
        dispatch({ type: 'updatePhoto', id: photo.id, status: 'procesando', rows: photo.rows });
        try {
          const { base64, mimeType } = await compressImage(photo.file);
          const rows: Row[] = await extractRows(
            config.apiKey.trim(),
            config.model,
            base64,
            mimeType,
            schema,
            prompt,
          );
          const needsReview = rows.length === 0 || rows.some((r) => Object.values(r).includes('REVISAR'));
          const status: PhotoStatus = needsReview ? 'REVISAR' : 'ok';
          dispatch({ type: 'updatePhoto', id: photo.id, status, rows });
          await savePhoto({ ...photo, status, rows });
        } catch (e) {
          const error = (e as Error).message;
          dispatch({ type: 'updatePhoto', id: photo.id, status: 'error', error });
          await savePhoto({ ...photo, status: 'error', error, rows: [] });
        }
      },
      { concurrency: 3 },
    );
    setRunning(false);
  }

  const pending = () => photos.filter((p) => p.status === 'pendiente');
  const failed = () => photos.filter((p) => p.status === 'error');

  return (
    <div className="screen">
      <h1>Subir y procesar</h1>

      <label className="btn primary file-btn">
        Elegir o sacar fotos
        <input
          type="file"
          multiple
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => onFiles(e.target.files)}
        />
      </label>

      {photos.length > 0 && (
        <>
          <div className="progress-row">
            <span>{done} / {photos.length}</span>
            <progress value={done} max={photos.length} />
          </div>
          <div className="actions">
            <button className="btn" disabled={running || !pending().length} onClick={() => process(pending())}>
              Procesar ({pending().length})
            </button>
            <button className="btn ghost" disabled={running || !failed().length} onClick={() => process(failed())}>
              Reintentar fallidas ({failed().length})
            </button>
          </div>

          <div className="thumb-grid">
            {photos.map((p) => (
              <div className="thumb" key={p.id}>
                <img src={p.thumbUrl} alt={p.name} />
                <span className={`badge badge-${p.status}`}>{statusLabel[p.status]}</span>
              </div>
            ))}
          </div>

          <button className="btn primary" onClick={() => dispatch({ type: 'setScreen', screen: 'results' })}>
            Ver resultados
          </button>
        </>
      )}
    </div>
  );
}
