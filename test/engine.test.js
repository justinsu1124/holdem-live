import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateBest, compareScore } from '../server/cards.js';
import { deckFrom, newServerSeed, commitmentOf } from '../server/shuffle.js';
import { createRoom, startHand, act, buildPots, playerToAct, publicState } from '../server/game.js';

function room(nPlayers, mode = 'deal', stack = 200) {
  const r = createRoom('TEST', mode, { smallBlind: 1, bigBlind: 2, startingStack: stack });
  for (let i = 0; i < nPlayers; i += 1) {
    r.players.push({
      id: `p${i}`, token: `t${i}`, name: `P${i}`, seat: i,
      stack, buyIn: stack, connected: true, sittingOut: false, clientSeed: `s${i}`,
    });
  }
  r.hostId = 'p0';
  return r;
}

const P = (r, id) => r.players.find((x) => x.id === id);

test('hand evaluator ranks categories correctly', () => {
  const sf = evaluateBest(['9s', 'Ts', 'Js', 'Qs', 'Ks', '2h', '3d']);
  assert.equal(sf.name, '同花順');
  const quads = evaluateBest(['9s', '9h', '9d', '9c', 'Ks', '2h', '3d']);
  assert.equal(quads.name, '四條');
  const boat = evaluateBest(['9s', '9h', '9d', 'Kc', 'Ks', '2h', '3d']);
  assert.equal(boat.name, '葫蘆');
  const wheel = evaluateBest(['As', '2h', '3d', '4c', '5s', 'Kh', 'Qd']);
  assert.equal(wheel.name, '順子');
  assert.equal(wheel.score[1], 5, 'A-5 straight is five-high');
  assert.ok(compareScore(quads.score, boat.score) > 0);
});

test('deck shuffle is deterministic, complete and commitment verifies', () => {
  const seed = newServerSeed();
  const a = deckFrom(seed, ['x', 'y'], 3);
  const b = deckFrom(seed, ['y', 'x'], 3);
  assert.deepEqual(a, b, 'client seed order must not matter');
  assert.equal(new Set(a).size, 52);
  assert.notDeepEqual(a, deckFrom(seed, ['x', 'y'], 4));
  assert.equal(commitmentOf(seed).length, 64);
});

test('shuffle is not obviously biased', () => {
  const counts = new Array(52).fill(0);
  for (let i = 0; i < 2000; i += 1) {
    const d = deckFrom(newServerSeed(), [], i);
    counts[d.indexOf('As')] += 1;
  }
  const expected = 2000 / 52;
  assert.ok(Math.max(...counts) < expected * 3, 'no position should dominate');
  assert.ok(Math.min(...counts) > 0, 'every position should occur');
});

test('blinds are posted and action starts under the gun', () => {
  const r = room(3);
  startHand(r);
  assert.equal(r.hand.pot, 3);
  assert.equal(P(r, 'p1').stack, 199); // SB
  assert.equal(P(r, 'p2').stack, 198); // BB
  assert.equal(playerToAct(r).id, 'p0'); // UTG = dealer in 3-handed
  assert.equal(r.hand.hole.p0.length, 2);
});

test('everyone folding to the big blind awards the pot uncontested', () => {
  const r = room(3);
  startHand(r);
  act(r, P(r, 'p0'), 'fold');
  act(r, P(r, 'p1'), 'fold');
  assert.equal(r.hand, null);
  assert.equal(P(r, 'p2').stack, 201);
  assert.deepEqual(r.lastResult.winners, ['p2']);
});

test('a full hand runs through every street to showdown', () => {
  const r = room(3);
  startHand(r);
  act(r, P(r, 'p0'), 'call');
  act(r, P(r, 'p1'), 'call');
  act(r, P(r, 'p2'), 'check');
  assert.equal(r.hand.street, 'flop');
  assert.equal(r.hand.board.length, 3);
  for (const id of ['p1', 'p2', 'p0']) act(r, P(r, id), 'check');
  assert.equal(r.hand.board.length, 4);
  for (const id of ['p1', 'p2', 'p0']) act(r, P(r, id), 'check');
  assert.equal(r.hand.board.length, 5);
  for (const id of ['p1', 'p2', 'p0']) act(r, P(r, id), 'check');
  assert.equal(r.hand, null);
  const total = r.players.reduce((s, p) => s + p.stack, 0);
  assert.equal(total, 600, 'chips are conserved');
  assert.equal(r.lastResult.reason, 'showdown');
});

test('re-raise reopens the action for players who already acted', () => {
  const r = room(3);
  startHand(r);
  act(r, P(r, 'p0'), 'raise', 6);
  act(r, P(r, 'p1'), 'call');
  act(r, P(r, 'p2'), 'raise', 20);
  assert.equal(playerToAct(r).id, 'p0', 'p0 must act again after the re-raise');
  act(r, P(r, 'p0'), 'fold');
  act(r, P(r, 'p1'), 'fold');
  assert.equal(r.hand, null);
});

test('side pots split correctly when a short stack is all-in', () => {
  const r = room(3);
  P(r, 'p0').stack = 50;
  P(r, 'p1').stack = 200;
  P(r, 'p2').stack = 200;
  startHand(r);
  act(r, P(r, 'p0'), 'allin');
  act(r, P(r, 'p1'), 'call');
  act(r, P(r, 'p2'), 'call');

  const pots = buildPots(r);
  assert.equal(pots.length, 1);
  assert.equal(pots[0].amount, 150, 'main pot is capped at 3x the short stack');
  assert.equal(pots[0].eligible.length, 3);

  // p1 bets into the side pot; the all-in short stack cannot win those chips
  act(r, P(r, 'p1'), 'bet', 30);
  act(r, P(r, 'p2'), 'call');
  const side = buildPots(r);
  assert.equal(side.length, 2);
  assert.deepEqual(side[1].eligible.sort(), ['p1', 'p2']);
  assert.equal(side[1].amount, 60);

  while (r.hand) {
    const actor = playerToAct(r);
    act(r, actor, 'check');
  }
  const total = r.players.reduce((s, p) => s + p.stack, 0);
  assert.equal(total, 450, 'chips are conserved across side pots');
  assert.ok(!r.lastResult.payouts.p0 || r.lastResult.payouts.p0 <= 150, 'short stack cannot win the side pot');
});

test('chips-only mode deals no cards and waits for the host to pick a winner', () => {
  const r = room(3, 'chips');
  startHand(r);
  assert.deepEqual(r.hand.hole, {});
  act(r, P(r, 'p0'), 'call');
  act(r, P(r, 'p1'), 'call');
  act(r, P(r, 'p2'), 'check');
  for (let street = 0; street < 3; street += 1) {
    for (const id of ['p1', 'p2', 'p0']) act(r, P(r, id), 'check');
  }
  assert.equal(r.hand.board.length, 0);
  assert.equal(r.hand.awaitingWinnerPick, true);
});

test('players only ever see their own hole cards', () => {
  const r = room(3);
  startHand(r);
  const view = publicState(r, 'p0');
  assert.equal(view.you.hole.length, 2);
  assert.equal(JSON.stringify(view).includes(r.hand.hole.p1[0]), false);
});
