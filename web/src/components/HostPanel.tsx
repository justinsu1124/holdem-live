import { useState } from 'react';
import type { GameState } from '../types';

interface Props {
  state: GameState;
  send: (msg: Record<string, unknown>) => void;
}

export function HostPanel({ state, send }: Props) {
  const [sb, setSb] = useState(state.config.smallBlind);
  const [bb, setBb] = useState(state.config.bigBlind);
  const [ante, setAnte] = useState(state.config.ante);
  const [chips, setChips] = useState<Record<string, number>>({});

  const inHand = !!state.hand;

  return (
    <div className="panel host-panel">
      <h3>主持人控制台</h3>

      <div className="row">
        <button className="primary" disabled={inHand} onClick={() => send({ type: 'startHand' })}>
          發下一手牌
        </button>
        <button className="danger" disabled={!inHand} onClick={() => send({ type: 'cancelHand' })}>
          取消本手（退回籌碼）
        </button>
      </div>

      <h4>盲注設定</h4>
      <div className="grid3">
        <div>
          <label className="lbl">小盲</label>
          <input type="number" inputMode="numeric" value={sb} onChange={(e) => setSb(+e.target.value)} />
        </div>
        <div>
          <label className="lbl">大盲</label>
          <input type="number" inputMode="numeric" value={bb} onChange={(e) => setBb(+e.target.value)} />
        </div>
        <div>
          <label className="lbl">前注</label>
          <input type="number" inputMode="numeric" value={ante} onChange={(e) => setAnte(+e.target.value)} />
        </div>
      </div>
      <button
        disabled={inHand}
        onClick={() => send({ type: 'setConfig', config: { smallBlind: sb, bigBlind: bb, ante } })}
      >
        套用盲注
      </button>

      <h4>玩家管理</h4>
      <div className="host-players">
        {state.players.map((p) => (
          <div key={p.id} className="host-player">
            <span className="hp-name">{p.name}</span>
            <span className="hp-stack">{p.stack}</span>
            <input
              type="number"
              inputMode="numeric"
              placeholder="±"
              value={chips[p.id] ?? ''}
              onChange={(e) => setChips({ ...chips, [p.id]: +e.target.value })}
            />
            <button
              onClick={() => {
                send({ type: 'addChips', playerId: p.id, amount: chips[p.id] || 0 });
                setChips({ ...chips, [p.id]: 0 });
              }}
            >
              補碼
            </button>
            <button className="danger" disabled={inHand} onClick={() => send({ type: 'kick', playerId: p.id })}>
              移除
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
