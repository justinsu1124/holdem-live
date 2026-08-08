/** End-to-end smoke test against a running server: 3 clients play one full hand. */
import WebSocket from 'ws';

const URL = process.env.URL || 'ws://localhost:8080/ws';

function client(name) {
  const ws = new WebSocket(URL);
  const c = { name, ws, state: null, id: null, code: null };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.type === 'state') c.state = m.state;
    if (m.type === 'joined') {
      c.id = m.playerId;
      c.code = m.code;
    }
    if (m.type === 'error') console.error(`[${name}] error:`, m.message);
  });
  c.send = (o) => ws.send(JSON.stringify(o));
  c.ready = new Promise((r) => ws.on('open', r));
  return c;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, label) => {
  for (let i = 0; i < 100; i += 1) {
    if (fn()) return;
    await wait(50);
  }
  throw new Error(`timeout: ${label}`);
};

const host = client('host');
await host.ready;
host.send({ type: 'create', mode: 'deal', name: '主持', config: { smallBlind: 1, bigBlind: 2, startingStack: 200 } });
await until(() => host.code, 'room created');
console.log('room', host.code);

const others = [client('bob'), client('carol')];
for (const o of others) {
  await o.ready;
  o.send({ type: 'join', code: host.code, name: o.name });
}
await until(() => host.state?.players.length === 3, 'three players');

host.send({ type: 'startHand' });
await until(() => host.state?.hand, 'hand started');
console.log('commitment', host.state.hand.commitment.slice(0, 16));

const all = [host, ...others];
for (let guard = 0; guard < 60 && host.state.hand; guard += 1) {
  const actorId = host.state.hand.toActId;
  const me = all.find((c) => c.id === actorId);
  if (!me) break;
  const legal = me.state.you.legal;
  me.send({ type: 'action', action: legal.toCall > 0 ? 'call' : 'check' });
  await wait(60);
}

await until(() => !host.state.hand && host.state.lastResult, 'hand finished');
const r = host.state.lastResult;
console.log('board', r.board.join(' '));
console.log('winners', r.winners.map((id) => host.state.players.find((p) => p.id === id).name).join(', '));
console.log('seed revealed:', !!r.fairness.serverSeed);

const chips = host.state.players.reduce((s, p) => s + p.stack, 0);
if (chips !== 600) throw new Error(`chip leak: ${chips}`);
for (const c of all) if (c.state.you.hole) console.log(c.name, 'hole', c.state.you.hole.join(' '));

console.log('OK');
for (const c of all) c.ws.close();
