import { useEffect, useState } from 'react';
import type { Legal } from '../types';

interface Props {
  legal: Legal;
  bigBlind: number;
  onAct: (action: string, amount?: number) => void;
}

export function ActionBar({ legal, bigBlind, onAct }: Props) {
  const { toCall, minRaiseTo, maxRaiseTo, pot, actions } = legal;
  const [raiseTo, setRaiseTo] = useState(minRaiseTo);

  useEffect(() => setRaiseTo(minRaiseTo), [minRaiseTo]);

  const canRaise = actions.includes('raise') || actions.includes('bet');
  const raiseLabel = actions.includes('bet') ? '下注' : '加注';
  const clamp = (v: number) => Math.max(minRaiseTo, Math.min(maxRaiseTo, Math.round(v)));
  const quick = [
    { label: '½ 底池', to: clamp(pot / 2 + toCall) },
    { label: '¾ 底池', to: clamp((pot * 3) / 4 + toCall) },
    { label: '底池', to: clamp(pot + toCall) },
    { label: '3 BB', to: clamp(bigBlind * 3) },
  ].filter((q, i, arr) => q.to > minRaiseTo - 1 && arr.findIndex((x) => x.to === q.to) === i);

  return (
    <div className="actionbar">
      {canRaise && (
        <div className="raise-row">
          <div className="quicks">
            {quick.map((q) => (
              <button key={q.label} onClick={() => setRaiseTo(q.to)} className={raiseTo === q.to ? 'on' : ''}>
                {q.label}
              </button>
            ))}
          </div>
          <div className="slider-row">
            <input
              type="range"
              min={minRaiseTo}
              max={maxRaiseTo}
              step={1}
              value={raiseTo}
              onChange={(e) => setRaiseTo(+e.target.value)}
            />
            <input
              className="amt"
              type="number"
              inputMode="numeric"
              value={raiseTo}
              onChange={(e) => setRaiseTo(clamp(+e.target.value))}
            />
          </div>
        </div>
      )}
      <div className="btn-row">
        <button className="act fold" onClick={() => onAct('fold')}>蓋牌</button>
        {toCall <= 0 ? (
          <button className="act check" onClick={() => onAct('check')}>過牌</button>
        ) : (
          <button className="act call" onClick={() => onAct('call')}>跟注 {toCall}</button>
        )}
        {canRaise ? (
          <button className="act raise" onClick={() => onAct('raise', raiseTo)}>
            {raiseTo >= maxRaiseTo ? 'All-in' : `${raiseLabel} ${raiseTo}`}
          </button>
        ) : (
          <button className="act raise" onClick={() => onAct('allin')}>All-in</button>
        )}
      </div>
    </div>
  );
}
