import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import type { GameState } from '../types';
import { Card, CardBack } from './Card';
import { ActionBar } from './ActionBar';
import { HostPanel } from './HostPanel';
import { Fairness } from './Fairness';

interface Props {
  state: GameState;
  send: (msg: Record<string, unknown>) => void;
  onLeave: () => void;
  connected: boolean;
}

type Tab = 'table' | 'host' | 'ledger' | 'fair';

export function Table({ state, send, onLeave, connected }: Props) {
  const [tab, setTab] = useState<Tab>('table');
  const [peek, setPeek] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [winners, setWinners] = useState<string[]>([]);
  const qrRef = useRef<HTMLCanvasElement>(null);

  const joinUrl = `${window.location.origin}/?room=${state.code}`;

  useEffect(() => {
    if (showQr && qrRef.current) {
      QRCode.toCanvas(qrRef.current, joinUrl, { width: 220, margin: 1 });
    }
  }, [showQr, joinUrl]);

  useEffect(() => setWinners([]), [state.handNumber]);

  const you = state.you;
  const hand = state.hand;
  const yourTurn = !!you?.legal;
  const dealMode = state.mode === 'deal';

  const totals = useMemo(
    () => state.players.map((p) => ({ ...p, net: p.stack - p.buyIn })).sort((a, b) => b.net - a.net),
    [state.players],
  );

  return (
    <div className="table-screen">
      <header className="topbar">
        <div className="tb-left">
          <button className="chip-btn" onClick={() => setShowQr(true)}>房號 {state.code}</button>
          <span className="mode-tag">{dealMode ? '手機發牌' : '純籌碼'}</span>
        </div>
        <div className="tb-right">
          <span className="blinds">{state.config.smallBlind}/{state.config.bigBlind}{state.config.ante ? ` +${state.config.ante}` : ''}</span>
          <span className={`dot ${connected ? 'ok' : 'bad'}`} title={connected ? '已連線' : '連線中斷'} />
        </div>
      </header>

      {showQr && (
        <div className="modal" onClick={() => setShowQr(false)}>
          <div className="modal-body" onClick={(e) => e.stopPropagation()}>
            <h3>掃描加入</h3>
            <canvas ref={qrRef} />
            <p className="url">{joinUrl}</p>
            <p className="big-code">{state.code}</p>
            <button className="primary" onClick={() => setShowQr(false)}>關閉</button>
          </div>
        </div>
      )}

      {tab === 'table' && (
        <main className="felt">
          <div className="pot-area">
            <div className="pot-label">底池</div>
            <div className="pot-value">{hand ? hand.pot : 0}</div>
            {hand && <div className="street">{hand.streetLabel}</div>}
            {hand && hand.pots.length > 1 && (
              <div className="sidepots">
                {hand.pots.map((p, i) => (
                  <span key={i}>{i === 0 ? '主池' : `邊池${i}`} {p.amount}</span>
                ))}
              </div>
            )}
          </div>

          {dealMode && (
            <div className="board">
              {hand?.board.map((c) => <Card key={c} code={c} size="lg" />)}
              {Array.from({ length: Math.max(0, 5 - (hand?.board.length ?? 0)) }).map((_, i) => (
                <div key={`slot${i}`} className="card card-lg card-slot" />
              ))}
            </div>
          )}

          <div className="players">
            {state.players.map((p) => (
              <div
                key={p.id}
                className={[
                  'player',
                  p.isActor ? 'actor' : '',
                  p.folded ? 'folded' : '',
                  p.id === you?.id ? 'self' : '',
                  !p.connected ? 'offline' : '',
                ].join(' ')}
              >
                <div className="p-main">
                  <span className="p-name">
                    {p.seat === state.dealerSeat && <span className="dealer">D</span>}
                    {p.name}
                    {p.id === state.hostId && <span className="badge">主持</span>}
                  </span>
                  <span className="p-stack">{p.stack}</span>
                </div>
                <div className="p-sub">
                  {p.allIn && <span className="tag allin">All-in</span>}
                  {p.folded && <span className="tag">已蓋牌</span>}
                  {p.sittingOut && !hand && <span className="tag">觀望</span>}
                  {p.bet > 0 && <span className="bet">下注 {p.bet}</span>}
                  {state.lastResult?.hands[p.id] && (
                    <span className="tag win">{state.lastResult.hands[p.id].name}</span>
                  )}
                  {state.lastResult?.payouts[p.id] && (
                    <span className="tag win">+{state.lastResult.payouts[p.id]}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {dealMode && you?.hole && (
            <div className="myhand">
              <div className="myhand-cards" onPointerDown={() => setPeek(true)} onPointerUp={() => setPeek(false)} onPointerLeave={() => setPeek(false)}>
                {peek ? you.hole.map((c) => <Card key={c} code={c} size="lg" />) : you.hole.map((c) => <CardBack key={c} size="lg" />)}
              </div>
              <div className="hint">{peek ? '放開即隱藏' : '長按查看你的底牌'}</div>
            </div>
          )}

          {!hand && state.lastResult && (
            <div className="result">
              <b>第 {state.lastResult.handNumber} 手結束</b>
              {dealMode && state.lastResult.reason === 'showdown' && (
                <div className="showdown">
                  {Object.entries(state.lastResult.hole).map(([id, cards]) => {
                    const pl = state.players.find((x) => x.id === id);
                    if (!pl || !state.lastResult!.hands[id]) return null;
                    return (
                      <div key={id} className="sd-row">
                        <span>{pl.name}</span>
                        {cards.map((c) => <Card key={c} code={c} size="sm" />)}
                        <span className="tag">{state.lastResult!.hands[id].name}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {hand?.awaitingWinnerPick && (
            <div className="panel">
              <h3>誰贏了這手？</h3>
              {state.youAreHost ? (
                <>
                  <div className="winner-pick">
                    {state.players.filter((p) => p.inHand).map((p) => (
                      <button
                        key={p.id}
                        className={winners.includes(p.id) ? 'on' : ''}
                        onClick={() => setWinners((w) => (w.includes(p.id) ? w.filter((x) => x !== p.id) : [...w, p.id]))}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                  <button className="primary" disabled={!winners.length} onClick={() => send({ type: 'pickWinners', winners })}>
                    確認派彩（{winners.length > 1 ? '平分底池' : '獨贏'}）
                  </button>
                </>
              ) : (
                <p className="hint">等待主持人指定贏家…</p>
              )}
            </div>
          )}

          {!hand && !state.youAreHost && <p className="waiting">等待主持人發牌…</p>}
          {!hand && state.youAreHost && (
            <button className="primary big" onClick={() => send({ type: 'startHand' })}>
              {state.handNumber === 0 ? '開始第一手' : '發下一手牌'}
            </button>
          )}

          <details className="log">
            <summary>牌局紀錄</summary>
            {[...state.log].reverse().map((l, i) => <div key={i}>{l.text}</div>)}
          </details>
        </main>
      )}

      {tab === 'host' && (state.youAreHost
        ? <HostPanel state={state} send={send} />
        : <div className="panel"><p className="hint">只有主持人可以使用控制台。</p></div>)}

      {tab === 'ledger' && (
        <div className="panel">
          <h3>結算表</h3>
          <table className="ledger">
            <thead><tr><th>玩家</th><th>買入</th><th>目前籌碼</th><th>損益</th></tr></thead>
            <tbody>
              {totals.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.buyIn}</td>
                  <td>{p.stack}</td>
                  <td className={p.net >= 0 ? 'pos' : 'neg'}>{p.net >= 0 ? '+' : ''}{p.net}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="danger" onClick={onLeave}>離開房間</button>
        </div>
      )}

      {tab === 'fair' && <Fairness commitment={hand?.commitment} lastResult={state.lastResult} />}

      {yourTurn && tab === 'table' && (
        <ActionBar legal={you!.legal!} bigBlind={state.config.bigBlind} onAct={(a, amt) => send({ type: 'action', action: a, amount: amt })} />
      )}

      <nav className="tabbar">
        <button className={tab === 'table' ? 'on' : ''} onClick={() => setTab('table')}>牌桌</button>
        <button className={tab === 'host' ? 'on' : ''} onClick={() => setTab('host')}>控制台</button>
        <button className={tab === 'ledger' ? 'on' : ''} onClick={() => setTab('ledger')}>結算</button>
        <button className={tab === 'fair' ? 'on' : ''} onClick={() => setTab('fair')}>公平性</button>
      </nav>
    </div>
  );
}
