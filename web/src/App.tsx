import { useEffect } from 'react';
import { useGame } from './useGame';
import { Home } from './components/Home';
import { Table } from './components/Table';
import './styles.css';

export default function App() {
  const { state, error, connected, send, leave, clearError } = useGame();
  const initialCode = new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? '';

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(clearError, 4000);
    return () => clearTimeout(t);
  }, [error, clearError]);

  return (
    <>
      {error && <div className="toast">{error}</div>}
      {state ? (
        <Table state={state} send={send} onLeave={leave} connected={connected} />
      ) : (
        <Home
          initialCode={initialCode}
          onCreate={(mode, name, config) => send({ type: 'create', mode, name, config })}
          onJoin={(code, name) => send({ type: 'join', code, name })}
        />
      )}
    </>
  );
}
