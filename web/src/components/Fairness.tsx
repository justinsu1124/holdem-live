import { useState } from 'react';
import type { LastResult } from '../types';

/** Recompute sha256(serverSeed) in the browser to check the pre-hand commitment. */
async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function Fairness({ commitment, lastResult }: { commitment?: string; lastResult: LastResult | null }) {
  const [check, setCheck] = useState<string | null>(null);

  const verify = async () => {
    const f = lastResult?.fairness;
    if (!f?.serverSeed) return;
    const digest = await sha256Hex(f.serverSeed);
    setCheck(digest === f.commitment ? `✅ 驗證通過：sha256(seed) 等於開牌前公布的承諾值` : '❌ 驗證失敗，雜湊不符');
  };

  return (
    <div className="panel fairness">
      <h3>公平性驗證</h3>
      <p className="hint">
        每手牌開始前，伺服器會先公布 <code>sha256(伺服器種子)</code>；洗牌時再混入所有玩家的種子。
        牌局結束後種子公開，任何人都能重算出完全相同的牌序。
      </p>
      {commitment && (
        <div className="kv"><span>本手承諾值</span><code>{commitment.slice(0, 32)}…</code></div>
      )}
      {lastResult?.fairness?.serverSeed && (
        <>
          <div className="kv"><span>上一手種子</span><code>{lastResult.fairness.serverSeed.slice(0, 32)}…</code></div>
          <div className="kv"><span>玩家種子</span><code>{lastResult.fairness.clientSeeds.join(', ') || '—'}</code></div>
          <button onClick={verify}>驗證上一手</button>
          {check && <div className="verify-result">{check}</div>}
        </>
      )}
    </div>
  );
}
