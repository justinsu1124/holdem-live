import { useState } from 'react';
import type { Mode } from '../types';

interface Props {
  onCreate: (mode: Mode, name: string, config: Record<string, number>) => void;
  onJoin: (code: string, name: string) => void;
  initialCode: string;
}

export function Home({ onCreate, onJoin, initialCode }: Props) {
  const [tab, setTab] = useState<'create' | 'join'>(initialCode ? 'join' : 'create');
  const [mode, setMode] = useState<Mode | null>(null);
  const [name, setName] = useState(localStorage.getItem('holdem.name') || '');
  const [code, setCode] = useState(initialCode);
  const [smallBlind, setSmallBlind] = useState(1);
  const [bigBlind, setBigBlind] = useState(2);
  const [ante, setAnte] = useState(0);
  const [startingStack, setStartingStack] = useState(200);

  const remember = (n: string) => {
    localStorage.setItem('holdem.name', n);
    return n;
  };

  return (
    <div className="home">
      <h1 className="title">德州撲克<span>現場助手</span></h1>

      <div className="tabs">
        <button className={tab === 'create' ? 'on' : ''} onClick={() => setTab('create')}>開新牌局</button>
        <button className={tab === 'join' ? 'on' : ''} onClick={() => setTab('join')}>加入牌局</button>
      </div>

      {tab === 'create' ? (
        <div className="panel">
          <label className="lbl">選擇模式</label>
          <div className="mode-picker">
            <button className={`mode-card ${mode === 'chips' ? 'on' : ''}`} onClick={() => setMode('chips')}>
              <div className="mode-emoji">🪙</div>
              <div className="mode-name">純籌碼計算</div>
              <div className="mode-desc">用實體牌，手機只負責算底池、下注、記分</div>
            </button>
            <button className={`mode-card ${mode === 'deal' ? 'on' : ''}`} onClick={() => setMode('deal')}>
              <div className="mode-emoji">📱</div>
              <div className="mode-name">手機發牌</div>
              <div className="mode-desc">每人用自己手機看底牌，可驗證的公平 RNG 洗牌</div>
            </button>
          </div>

          <label className="lbl">你的暱稱</label>
          <input value={name} maxLength={12} placeholder="輸入暱稱" onChange={(e) => setName(e.target.value)} />

          <div className="grid2">
            <div>
              <label className="lbl">小盲</label>
              <input type="number" inputMode="numeric" value={smallBlind} onChange={(e) => setSmallBlind(+e.target.value)} />
            </div>
            <div>
              <label className="lbl">大盲</label>
              <input type="number" inputMode="numeric" value={bigBlind} onChange={(e) => setBigBlind(+e.target.value)} />
            </div>
            <div>
              <label className="lbl">前注 Ante</label>
              <input type="number" inputMode="numeric" value={ante} onChange={(e) => setAnte(+e.target.value)} />
            </div>
            <div>
              <label className="lbl">起始籌碼</label>
              <input type="number" inputMode="numeric" value={startingStack} onChange={(e) => setStartingStack(+e.target.value)} />
            </div>
          </div>

          <button
            className="primary big"
            disabled={!mode || !name.trim()}
            onClick={() => onCreate(mode!, remember(name.trim()), { smallBlind, bigBlind, ante, startingStack })}
          >
            建立房間
          </button>
        </div>
      ) : (
        <div className="panel">
          <label className="lbl">房間代碼</label>
          <input
            className="code-input"
            value={code}
            maxLength={4}
            placeholder="ABCD"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <label className="lbl">你的暱稱</label>
          <input value={name} maxLength={12} placeholder="輸入暱稱" onChange={(e) => setName(e.target.value)} />
          <button
            className="primary big"
            disabled={code.length !== 4 || !name.trim()}
            onClick={() => onJoin(code, remember(name.trim()))}
          >
            加入
          </button>
        </div>
      )}

      <p className="foot">同一桌所有人連到同一個網址即可，牌只會出現在自己手機上。</p>
    </div>
  );
}
