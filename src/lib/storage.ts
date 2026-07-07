import type { AppConfig, PhotoItem } from '../types';

// --- Config en localStorage ---

const CONFIG_KEY = 'planillas.config';

export function loadConfig(): AppConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? (JSON.parse(raw) as AppConfig) : null;
  } catch {
    return null;
  }
}

export function saveConfig(config: AppConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

// --- Resultados/estado por foto en IndexedDB (para resume) ---
// Guardamos una versión serializable de PhotoItem (sin el object URL, que se
// regenera al recargar y no es persistente).

const DB_NAME = 'planillas';
const STORE = 'photos';

// Persistimos todo menos el thumbUrl (object URL, no persistente). El File sí se
// guarda: es structured-cloneable, y permite reprocesar pendientes tras recargar.
type StoredPhoto = Omit<PhotoItem, 'thumbUrl'>;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function savePhoto(photo: PhotoItem): Promise<void> {
  const db = await openDb();
  const { thumbUrl: _thumbUrl, ...stored } = photo;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(stored);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadPhotos(): Promise<StoredPhoto[]> {
  const db = await openDb();
  const result = await new Promise<StoredPhoto[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as StoredPhoto[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

export async function clearPhotos(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
