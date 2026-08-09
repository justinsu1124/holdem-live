import { useEffect, useState } from 'react';
import type { Legal } from '../types';

interface Props {
  legal: Legal;
  bigBlind: number;
  onAct: (action: string, amount?: number) => void;
}

const bb = (v: number, big: number) => `${(v / big).toFixed(v % big === 0 ? 0 : 1)}BB`;

export function ActionBar({ legal, bigBlind, onAct }: Props) {
  const { toCall, minRaiseTo, maxRaiseTo, pot, actions } = legal;
  const [raiseTo, setRaiseTo] = useState(minRaiseTo);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setRaiseTo(minRaiseTo);
    setOpen(false);
  }, [minRaiseTo, toCall, pot]);

  const canRaise = actions.includes('raise') || actions.includes('bet');
  const raiseLabel = actions.includes('bet') ? '下注' : '加注';
  const clamp = (v: number) => Math.max(minRaiseTo, Math.min(maxRaiseTo, Math.round(v)));
  // 底池加注：先跟注，再依剩下的底池比例加大
  const potRaise = (frac: number) => clamp(toCall + Math.round((pot + toCall) * frac));
  const potOdds = toCall > 0 ? Math.round((toCall / (pot + toCall)) * 100) : 0;

  const quick = [
    { label: 'Min', to: minRaiseTo },
    { label: '⅓ 池', to: potRaise(1 / 3) },
    { label: '½ 池', to: potRaise(1 / 2) },
    { label: '⅔ 池', to: potRaise(2 / 3) },
    { label: '池', to: potRaise(1) },
    { label: 'All-in', to: maxRaiseTo },
  ].filter((q, i, arr) => arr.findIndex((x) => x.to === q.to) === i);

  return (
    <div className="actionbar">
      {canRaise && open && (
        <div className="raise-row">
          <div className="raise-head">
            <span className="raise-to">{raiseTo}</span>
            <span className="raise-bb">{bb(raiseTo, bigBlind)}</span>
            {toCall > 0 && <span className="raise-odds">底池賠率 {potOdds}%</span>}
          </div>
          <div className="quicks">
            {quick.map((q) => (
              <button key={q.label} onClick={() => setRaiseTo(q.to)} className={raiseTo === q.to ? 'on' : ''}>
                {q.label}
              </button>
            ))}
          </div>
          <div className="slider-row">
            <button className="step" onClick={() => setRaiseTo((v) => clamp(v - bigBlind))}>−</button>
            <input
              type="range"
              min={minRaiseTo}
              max={maxRaiseTo}
              step={1}
              value={raiseTo}
              onChange={(e) => setRaiseTo(+e.target.value)}
            />
            <button className="step" onClick={() => setRaiseTo((v) => clamp(v + bigBlind))}>＋</button>
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

      {!open && (
        <div className="info-row">
          <span>底池 {pot}</span>
          {toCall > 0
            ? <span>需跟 {toCall}（{bb(toCall, bigBlind)}）· 賠率 {potOdds}%</span>
            : <span>可免費看牌</span>}
        </div>
      )}

      <div className="btn-row">
        <button className="act fold" onClick={() => onAct('fold')}>蓋牌</button>
        {toCall <= 0 ? (
          <button className="act check" onClick={() => onAct('check')}>過牌</button>
        ) : (
          <button className="act call" onClick={() => onAct('call')}>
            跟注<b>{toCall}</b>
          </button>
        )}
        {canRaise ? (
          open ? (
            <button className="act raise" onClick={() => onAct('raise', raiseTo)}>
              {raiseTo >= maxRaiseTo ? 'All-in' : raiseLabel}<b>{raiseTo}</b>
            </button>
          ) : (
            <button className="act raise" onClick={() => setOpen(true)}>{raiseLabel}</button>
          )
        ) : (
          <button className="act raise" onClick={() => onAct('allin')}>All-in</button>
        )}
      </div>
    </div>
  );
}
