import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameState } from './types';

const WS_URL = (() => {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws`;
})();

type Pending = Record<string, unknown> | null;

export function useGame() {
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef<Pending>(null);
  const resumeRef = useRef<Pending>(null);

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= 1) return;
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      const first = pendingRef.current ?? resumeRef.current;
      if (first) ws.send(JSON.stringify(first));
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string);
      if (msg.type === 'state') setState(msg.state);
      else if (msg.type === 'error') setError(msg.message);
      else if (msg.type === 'joined') {
        if (msg.token) {
          localStorage.setItem('holdem.token', msg.token);
          localStorage.setItem('holdem.code', msg.code);
          resumeRef.current = { type: 'join', code: msg.code, token: msg.token };
        }
        pendingRef.current = null;
      }
    };
    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      setTimeout(connect, 1500);
    };
    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('holdem.token');
    const code = localStorage.getItem('holdem.code');
    if (token && code) resumeRef.current = { type: 'join', code, token };
    connect();
    return () => {
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [connect]);

  const send = useCallback((msg: Record<string, unknown>) => {
    setError(null);
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
    else {
      pendingRef.current = msg;
      connect();
    }
  }, [connect]);

  const leave = useCallback(() => {
    localStorage.removeItem('holdem.token');
    localStorage.removeItem('holdem.code');
    resumeRef.current = null;
    setState(null);
    wsRef.current?.close();
  }, []);

  return { state, error, connected, send, leave, clearError: () => setError(null) };
}
