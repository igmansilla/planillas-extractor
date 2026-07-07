import { Provider, useAppState, useDispatch, type Screen } from './state/store';
import { Config } from './screens/Config';
import { Upload } from './screens/Upload';
import { Results } from './screens/Results';

const tabs: { id: Screen; label: string }[] = [
  { id: 'config', label: 'Config' },
  { id: 'upload', label: 'Fotos' },
  { id: 'results', label: 'Resultados' },
];

function Shell() {
  const { screen, hydrated } = useAppState();
  const dispatch = useDispatch();

  if (!hydrated) return <div className="screen">Cargando…</div>;

  return (
    <div className="app">
      <main>
        {screen === 'config' && <Config />}
        {screen === 'upload' && <Upload />}
        {screen === 'results' && <Results />}
      </main>
      <nav className="tabbar">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={screen === t.id ? 'tab active' : 'tab'}
            onClick={() => dispatch({ type: 'setScreen', screen: t.id })}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

export function App() {
  return (
    <Provider>
      <Shell />
    </Provider>
  );
}
