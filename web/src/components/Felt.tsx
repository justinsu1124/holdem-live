import type { GameState } from '../types';
import { Card, CardBack } from './Card';

interface Props {
  state: GameState;
  peek: boolean;
  onPeekChange: (v: boolean) => void;
}

/** 小盲／大盲座位（跟 server 同一套規則） */
function blindSeats(state: GameState) {
  const inHand = state.players.filter((p) => p.inHand || p.folded || p.allIn);
  const seats = inHand.map((p) => p.seat).sort((a, b) => a - b);
  const d = state.dealerSeat;
  if (d === null || seats.length < 2) return { sb: null, bb: null };
  const after = (s: number) => seats[(seats.indexOf(s) + 1) % seats.length] ?? null;
  const sb = seats.length === 2 ? d : after(d);
  return { sb, bb: sb === null ? null : after(sb) };
}

export function Felt({ state, peek, onPeekChange }: Props) {
  const hand = state.hand;
  const dealMode = state.mode === 'deal';
  const you = state.you;
  const { sb, bb } = blindSeats(state);

  // 自己永遠在最下方，其他人依座位順序往左右環繞
  const ordered = [...state.players].sort((a, b) => a.seat - b.seat);
  const start = you ? ordered.findIndex((p) => p.id === you.id) : 0;
  const seats = start < 0
    ? ordered
    : [...ordered.slice(start), ...ordered.slice(0, start)];

  const n = Math.max(seats.length, 2);

  return (
    <div className="felt-oval">
      <div className="oval">
        <div className="oval-center">
          {dealMode && (
            <div className="board">
              {hand?.board.map((c) => <Card key={c} code={c} size="md" />)}
              {Array.from({ length: Math.max(0, 5 - (hand?.board.length ?? 0)) }).map((_, i) => (
                <div key={`slot${i}`} className="card card-md card-slot" />
              ))}
            </div>
          )}
          <div className="pot-pill">
            <span className="chip-icon" />
            底池 <b>{hand ? hand.pot : 0}</b>
          </div>
          {hand && <div className="street">{hand.streetLabel}</div>}
          {hand && hand.pots.length > 1 && state.players.some((p) => p.allIn) && (
            <div className="sidepots">
              {hand.pots.map((p, i) => (
                <span key={i}>{i === 0 ? '主池' : `邊池${i}`} {p.amount}</span>
              ))}
            </div>
          )}
        </div>

        {seats.map((p, i) => {
          const angle = (90 + (i * 360) / n) * (Math.PI / 180);
          const seatStyle = {
            left: `${50 + 43 * Math.cos(angle)}%`,
            top: `${50 + 42 * Math.sin(angle)}%`,
          };
          const betStyle = {
            left: `${50 + 26 * Math.cos(angle)}%`,
            top: `${50 + 25 * Math.sin(angle)}%`,
          };
          const isYou = p.id === you?.id;
          return (
            <div key={p.id}>
              <div
                className={[
                  'seat',
                  p.isActor ? 'actor' : '',
                  p.folded ? 'folded' : '',
                  isYou ? 'self' : '',
                  !p.connected ? 'offline' : '',
                ].join(' ')}
                style={seatStyle}
              >
                {dealMode && p.inHand && !isYou && (
                  <div className="seat-cards"><CardBack size="sm" /><CardBack size="sm" /></div>
                )}
                <div className="seat-avatar">{p.name.slice(0, 1)}</div>
                <div className="seat-name">{p.name}</div>
                <div className="seat-stack">{p.stack}</div>
                <div className="seat-badges">
                  {p.seat === state.dealerSeat && <span className="dealer">D</span>}
                  {p.seat === sb && <span className="blind-b sb">SB</span>}
                  {p.seat === bb && <span className="blind-b">BB</span>}
                </div>
                {p.allIn && <div className="seat-status allin">All-in</div>}
                {p.folded && <div className="seat-status">蓋牌</div>}
                {p.sittingOut && !hand && <div className="seat-status">觀望</div>}
                {state.lastResult?.hands[p.id] && (
                  <div className="seat-status win">{state.lastResult.hands[p.id].name}</div>
                )}
                {!!state.lastResult?.payouts[p.id] && (
                  <div className="seat-status win">+{state.lastResult.payouts[p.id]}</div>
                )}
              </div>
              {p.bet > 0 && (
                <div className="seat-bet" style={betStyle}><span className="chip-icon" />{p.bet}</div>
              )}
            </div>
          );
        })}
      </div>

      {dealMode && you?.hole && (
        <div className="myhand">
          <div
            className="myhand-cards"
            onPointerDown={() => onPeekChange(true)}
            onPointerUp={() => onPeekChange(false)}
            onPointerLeave={() => onPeekChange(false)}
          >
            {peek
              ? you.hole.map((c) => <Card key={c} code={c} size="lg" />)
              : you.hole.map((c) => <CardBack key={c} size="lg" />)}
          </div>
          <div className="hint">{peek ? '放開即隱藏' : '長按查看你的底牌'}</div>
        </div>
      )}
    </div>
  );
}
