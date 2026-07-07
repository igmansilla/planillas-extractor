import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';
import type { AppConfig, Column, ModelInfo, PhotoItem, PhotoStatus, Row } from '../types';
import { loadConfig, loadPhotos, saveConfig, savePhoto } from '../lib/storage';
import { makeKey } from '../lib/schema';

export type Screen = 'config' | 'upload' | 'results';

export interface AppState {
  screen: Screen;
  config: AppConfig;
  models: ModelInfo[];
  photos: PhotoItem[];
  hydrated: boolean;
}

const defaultColumns: Column[] = [
  { key: makeKey(0), label: 'Nombre', hint: '' },
  { key: makeKey(1), label: 'Fecha', hint: '' },
  { key: makeKey(2), label: 'Cantidad', hint: '' },
];

const initialState: AppState = {
  screen: 'config',
  config: { apiKey: '', model: '', columns: defaultColumns },
  models: [],
  photos: [],
  hydrated: false,
};

type Action =
  | { type: 'hydrate'; config: AppConfig | null; photos: PhotoItem[] }
  | { type: 'setScreen'; screen: Screen }
  | { type: 'setConfig'; config: Partial<AppConfig> }
  | { type: 'setModels'; models: ModelInfo[] }
  | { type: 'addPhotos'; photos: PhotoItem[] }
  | { type: 'updatePhoto'; id: string; status: PhotoStatus; rows?: Row[]; error?: string }
  | { type: 'clearPhotos' };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'hydrate':
      return {
        ...state,
        config: action.config ?? state.config,
        photos: action.photos,
        hydrated: true,
      };
    case 'setScreen':
      return { ...state, screen: action.screen };
    case 'setConfig':
      return { ...state, config: { ...state.config, ...action.config } };
    case 'setModels':
      return { ...state, models: action.models };
    case 'addPhotos':
      return { ...state, photos: [...state.photos, ...action.photos] };
    case 'updatePhoto':
      return {
        ...state,
        photos: state.photos.map((p) =>
          p.id === action.id
            ? {
                ...p,
                status: action.status,
                rows: action.rows ?? p.rows,
                error: action.error,
              }
            : p,
        ),
      };
    case 'clearPhotos':
      return { ...state, photos: [] };
    default:
      return state;
  }
}

const StateCtx = createContext<AppState>(initialState);
const DispatchCtx = createContext<Dispatch<Action>>(() => {});

export function Provider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Hidratar config (localStorage) y fotos (IndexedDB) al montar.
  useEffect(() => {
    (async () => {
      const config = loadConfig();
      const stored = await loadPhotos();
      const photos: PhotoItem[] = stored.map((s) => ({
        ...s,
        thumbUrl: URL.createObjectURL(s.file),
      }));
      dispatch({ type: 'hydrate', config, photos });
    })();
  }, []);

  // Persistir config en cada cambio (una vez hidratado).
  useEffect(() => {
    if (state.hydrated) saveConfig(state.config);
  }, [state.config, state.hydrated]);

  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={dispatch}>{children}</DispatchCtx.Provider>
    </StateCtx.Provider>
  );
}

export const useAppState = () => useContext(StateCtx);
export const useDispatch = () => useContext(DispatchCtx);

// Helper: persiste una foto (estado + filas) en IndexedDB para resume.
export { savePhoto };
