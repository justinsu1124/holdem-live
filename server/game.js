import { evaluateBest, compareScore } from './cards.js';
import { newServerSeed, commitmentOf, deckFrom } from './shuffle.js';

export const STREETS = ['preflop', 'flop', 'turn', 'river'];

export function createRoom(code, mode, config) {
  return {
    code,
    mode, // 'chips' | 'deal'
    createdAt: Date.now(),
    hostId: null,
    config: {
      smallBlind: config.smallBlind ?? 1,
      bigBlind: config.bigBlind ?? 2,
      ante: config.ante ?? 0,
      startingStack: config.startingStack ?? 200,
    },
    players: [],
    dealerSeat: null,
    handNumber: 0,
    hand: null,
    lastResult: null,
    log: [],
  };
}

export function addLog(room, text) {
  room.log.push({ t: Date.now(), text });
  if (room.log.length > 200) room.log.shift();
}

export function seatedPlayers(room) {
  return [...room.players].sort((a, b) => a.seat - b.seat);
}

function inHand(room, p) {
  const h = room.hand;
  return h ? h.inHand.includes(p.id) : false;
}

function liveP(room) {
  const h = room.hand;
  return seatedPlayers(room).filter((p) => inHand(room, p) && !h.folded.includes(p.id));
}

function canActP(room) {
  const h = room.hand;
  return liveP(room).filter((p) => !h.allIn.includes(p.id));
}

function nextSeatWith(room, fromSeat, pool) {
  const seats = pool.map((p) => p.seat).sort((a, b) => a - b);
  if (seats.length === 0) return null;
  for (const s of seats) if (s > fromSeat) return s;
  return seats[0];
}

export function startHand(room, clientSeeds = []) {
  const eligible = seatedPlayers(room).filter((p) => p.stack > 0 && !p.sittingOut);
  if (eligible.length < 2) throw new Error('至少需要 2 位有籌碼的玩家');

  room.handNumber += 1;
  room.lastResult = null;

  const seats = eligible.map((p) => p.seat);
  room.dealerSeat = room.dealerSeat === null
    ? seats[0]
    : (nextSeatWith(room, room.dealerSeat, eligible) ?? seats[0]);

  const serverSeed = newServerSeed();
  const hand = {
    number: room.handNumber,
    street: 'preflop',
    inHand: eligible.map((p) => p.id),
    folded: [],
    allIn: [],
    acted: [],
    bets: {},
    committed: {},
    board: [],
    hole: {},
    pot: 0,
    currentBet: 0,
    minRaise: room.config.bigBlind,
    toActSeat: null,
    dealerSeat: room.dealerSeat,
    commitment: commitmentOf(serverSeed),
    clientSeeds,
    serverSeed: null,
    _serverSeed: serverSeed,
    deck: null,
    deckIndex: 0,
    awaitingWinnerPick: false,
  };
  for (const p of eligible) {
    hand.bets[p.id] = 0;
    hand.committed[p.id] = 0;
  }
  room.hand = hand;

  if (room.mode === 'deal') {
    hand.deck = deckFrom(serverSeed, clientSeeds, room.handNumber);
    for (const p of eligible) {
      hand.hole[p.id] = [hand.deck[hand.deckIndex++], hand.deck[hand.deckIndex++]];
    }
  }

  const { ante, smallBlind, bigBlind } = room.config;
  if (ante > 0) for (const p of eligible) postChips(room, p, ante);

  const heads = eligible.length === 2;
  const sbSeat = heads ? room.dealerSeat : nextSeatWith(room, room.dealerSeat, eligible);
  const bbSeat = nextSeatWith(room, sbSeat, eligible);
  const sb = eligible.find((p) => p.seat === sbSeat);
  const bb = eligible.find((p) => p.seat === bbSeat);
  postBlind(room, sb, smallBlind);
  postBlind(room, bb, bigBlind);
  hand.currentBet = Math.max(...Object.values(hand.bets));
  hand.minRaise = bigBlind;
  hand.bbSeat = bbSeat;

  hand.toActSeat = nextSeatWith(room, bbSeat, canActP(room));
  addLog(room, `第 ${room.handNumber} 手開始（莊家：${eligible.find((p) => p.seat === room.dealerSeat).name}）`);
  if (canActP(room).length <= 1) settleStreet(room);
  return hand;
}

function postChips(room, player, amount) {
  const h = room.hand;
  const amt = Math.min(amount, player.stack);
  player.stack -= amt;
  h.pot += amt;
  h.committed[player.id] += amt;
  if (player.stack === 0 && !h.allIn.includes(player.id)) h.allIn.push(player.id);
  return amt;
}

function postBlind(room, player, amount) {
  const h = room.hand;
  const amt = Math.min(amount, player.stack);
  player.stack -= amt;
  h.pot += amt;
  h.bets[player.id] += amt;
  h.committed[player.id] += amt;
  if (player.stack === 0 && !h.allIn.includes(player.id)) h.allIn.push(player.id);
}

export function playerToAct(room) {
  const h = room.hand;
  if (!h || h.toActSeat === null) return null;
  return room.players.find((p) => p.seat === h.toActSeat) || null;
}

export function legalActions(room, player) {
  const h = room.hand;
  if (!h || !player) return null;
  const toCall = h.currentBet - h.bets[player.id];
  const actions = ['fold'];
  if (toCall <= 0) actions.push('check');
  else actions.push('call');
  const maxTotal = h.bets[player.id] + player.stack;
  if (maxTotal > h.currentBet) actions.push(h.currentBet === 0 ? 'bet' : 'raise');
  actions.push('allin');
  return {
    actions,
    toCall: Math.min(toCall, player.stack),
    minRaiseTo: Math.min(h.currentBet + h.minRaise, maxTotal),
    maxRaiseTo: maxTotal,
    pot: h.pot,
  };
}

export function act(room, player, action, amount) {
  const h = room.hand;
  if (!h) throw new Error('目前沒有進行中的牌局');
  if (h.awaitingWinnerPick) throw new Error('等待主持人指定贏家');
  const actor = playerToAct(room);
  if (!actor || actor.id !== player.id) throw new Error('還沒輪到你');

  const toCall = h.currentBet - h.bets[player.id];

  if (action === 'fold') {
    h.folded.push(player.id);
    addLog(room, `${player.name} 蓋牌`);
  } else if (action === 'check') {
    if (toCall > 0) throw new Error('不能過牌，需要跟注');
    addLog(room, `${player.name} 過牌`);
  } else if (action === 'call') {
    const paid = postBlindLike(room, player, Math.min(toCall, player.stack));
    addLog(room, `${player.name} 跟注 ${paid}`);
  } else if (action === 'bet' || action === 'raise' || action === 'allin') {
    const maxTotal = h.bets[player.id] + player.stack;
    let target = action === 'allin' ? maxTotal : Number(amount);
    if (!Number.isFinite(target)) throw new Error('金額無效');
    target = Math.min(target, maxTotal);
    if (target <= h.currentBet && target < maxTotal) throw new Error('加注金額必須高於目前下注');
    const minTo = h.currentBet + h.minRaise;
    if (target < minTo && target < maxTotal) throw new Error(`最少要加注到 ${minTo}`);
    const raiseBy = target - h.currentBet;
    postBlindLike(room, player, target - h.bets[player.id]);
    if (raiseBy >= h.minRaise) {
      h.minRaise = raiseBy;
      h.acted = [];
    }
    h.currentBet = Math.max(h.currentBet, target);
    addLog(room, `${player.name} ${action === 'allin' ? 'All-in' : '加注'} 到 ${target}`);
  } else {
    throw new Error('未知的動作');
  }

  if (!h.acted.includes(player.id)) h.acted.push(player.id);
  advance(room);
}

function postBlindLike(room, player, amount) {
  const h = room.hand;
  const amt = Math.max(0, Math.min(amount, player.stack));
  player.stack -= amt;
  h.pot += amt;
  h.bets[player.id] += amt;
  h.committed[player.id] += amt;
  if (player.stack === 0 && !h.allIn.includes(player.id)) h.allIn.push(player.id);
  return amt;
}

function pendingActors(room) {
  const h = room.hand;
  return canActP(room).filter(
    (p) => !h.acted.includes(p.id) || h.bets[p.id] < h.currentBet,
  );
}

function advance(room) {
  const h = room.hand;
  if (liveP(room).length === 1) {
    finishHand(room, liveP(room).map((p) => p.id), 'fold');
    return;
  }
  const pending = pendingActors(room);
  if (pending.length === 0) {
    settleStreet(room);
    return;
  }
  const from = h.toActSeat;
  h.toActSeat = nextSeatWith(room, from, pending) ?? pending[0].seat;
}

function settleStreet(room) {
  const h = room.hand;
  for (const id of Object.keys(h.bets)) h.bets[id] = 0;
  h.currentBet = 0;
  h.minRaise = room.config.bigBlind;
  h.acted = [];

  const idx = STREETS.indexOf(h.street);
  const noMoreBetting = canActP(room).length <= 1;

  if (idx === STREETS.length - 1) {
    showdown(room);
    return;
  }

  if (noMoreBetting) {
    // run the remaining board out, then showdown
    while (STREETS.indexOf(h.street) < STREETS.length - 1) {
      h.street = STREETS[STREETS.indexOf(h.street) + 1];
      dealStreetCards(room);
    }
    showdown(room);
    return;
  }

  h.street = STREETS[idx + 1];
  dealStreetCards(room);
  h.toActSeat = nextSeatWith(room, h.dealerSeat, canActP(room));
  addLog(room, `--- ${streetName(h.street)} ---`);
}

function streetName(s) {
  return { preflop: '翻牌前', flop: '翻牌 Flop', turn: '轉牌 Turn', river: '河牌 River' }[s];
}

function dealStreetCards(room) {
  const h = room.hand;
  if (room.mode !== 'deal') return;
  h.deckIndex += 1; // burn card
  const n = h.street === 'flop' ? 3 : 1;
  for (let i = 0; i < n; i += 1) h.board.push(h.deck[h.deckIndex++]);
}

/** Standard side-pot construction from per-player committed chips. */
export function buildPots(room) {
  const h = room.hand;
  const contenders = liveP(room).map((p) => p.id);
  const levels = [...new Set(Object.values(h.committed).filter((v) => v > 0))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const c of Object.values(h.committed)) {
      amount += Math.max(0, Math.min(c, level) - prev);
    }
    const eligible = contenders.filter((id) => h.committed[id] >= level);
    if (amount > 0) pots.push({ amount, eligible });
    prev = level;
  }
  // merge consecutive pots with identical eligibility
  const merged = [];
  for (const pot of pots) {
    const last = merged[merged.length - 1];
    if (last && last.eligible.join() === pot.eligible.join()) last.amount += pot.amount;
    else merged.push({ ...pot });
  }
  return merged;
}

function showdown(room) {
  const h = room.hand;
  h.street = 'showdown';
  if (room.mode === 'chips') {
    h.awaitingWinnerPick = true;
    addLog(room, '攤牌：請主持人指定贏家');
    return;
  }
  const evals = {};
  for (const p of liveP(room)) {
    evals[p.id] = evaluateBest([...h.hole[p.id], ...h.board]);
  }
  const pots = buildPots(room);
  const payouts = {};
  for (const pot of pots) {
    let best = null;
    let winners = [];
    for (const id of pot.eligible) {
      const s = evals[id].score;
      if (!best || compareScore(s, best) > 0) {
        best = s;
        winners = [id];
      } else if (compareScore(s, best) === 0) winners.push(id);
    }
    distribute(room, pot.amount, winners, payouts);
  }
  finishHand(room, Object.keys(payouts), 'showdown', evals, payouts);
}

function distribute(room, amount, winners, payouts) {
  const each = Math.floor(amount / winners.length);
  let rem = amount - each * winners.length;
  const ordered = [...winners].sort(
    (a, b) => room.players.find((p) => p.id === a).seat - room.players.find((p) => p.id === b).seat,
  );
  for (const id of ordered) {
    let give = each;
    if (rem > 0) {
      give += 1;
      rem -= 1;
    }
    const pl = room.players.find((p) => p.id === id);
    pl.stack += give;
    payouts[id] = (payouts[id] || 0) + give;
  }
}

export function pickWinners(room, winnerIds) {
  const h = room.hand;
  if (!h || !h.awaitingWinnerPick) throw new Error('現在不能指定贏家');
  const live = liveP(room).map((p) => p.id);
  const valid = winnerIds.filter((id) => live.includes(id));
  if (valid.length === 0) throw new Error('請至少選一位仍在牌局中的玩家');
  const payouts = {};
  for (const pot of buildPots(room)) {
    const w = valid.filter((id) => pot.eligible.includes(id));
    distribute(room, pot.amount, w.length ? w : pot.eligible, payouts);
  }
  h.awaitingWinnerPick = false;
  finishHand(room, Object.keys(payouts), 'manual', null, payouts);
}

function finishHand(room, winnerIds, reason, evals = null, payouts = null) {
  const h = room.hand;
  if (!payouts) {
    payouts = {};
    distribute(room, h.pot, winnerIds, payouts);
  }
  h.serverSeed = h._serverSeed;
  const names = winnerIds.map((id) => room.players.find((p) => p.id === id)?.name).join('、');
  addLog(room, `第 ${h.number} 手結束：${names} 贏得 ${Object.values(payouts).reduce((a, b) => a + b, 0)}`);
  room.lastResult = {
    handNumber: h.number,
    reason,
    board: h.board,
    payouts,
    winners: winnerIds,
    hole: room.mode === 'deal' ? h.hole : {},
    hands: evals
      ? Object.fromEntries(Object.entries(evals).map(([id, e]) => [id, { name: e.name, cards: e.cards }]))
      : {},
    fairness: {
      commitment: h.commitment,
      serverSeed: h.serverSeed,
      clientSeeds: h.clientSeeds,
      handNumber: h.number,
    },
  };
  room.hand = null;
}

export function publicState(room, viewerId) {
  const h = room.hand;
  const me = room.players.find((p) => p.id === viewerId) || null;
  const actor = playerToAct(room);
  return {
    code: room.code,
    mode: room.mode,
    config: room.config,
    hostId: room.hostId,
    handNumber: room.handNumber,
    dealerSeat: room.dealerSeat,
    youAreHost: !!me && me.id === room.hostId,
    you: me
      ? {
        id: me.id, name: me.name, seat: me.seat, stack: me.stack,
        buyIn: me.buyIn, sittingOut: me.sittingOut,
        hole: h && room.mode === 'deal' ? h.hole[me.id] || null : null,
        legal: h && actor && actor.id === me.id ? legalActions(room, me) : null,
      }
      : null,
    players: seatedPlayers(room).map((p) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      stack: p.stack,
      buyIn: p.buyIn,
      connected: p.connected,
      sittingOut: p.sittingOut,
      inHand: h ? h.inHand.includes(p.id) && !h.folded.includes(p.id) : false,
      folded: h ? h.folded.includes(p.id) : false,
      allIn: h ? h.allIn.includes(p.id) : false,
      bet: h ? h.bets[p.id] || 0 : 0,
      committed: h ? h.committed[p.id] || 0 : 0,
      isActor: !!actor && actor.id === p.id,
    })),
    hand: h
      ? {
        number: h.number,
        street: h.street,
        streetLabel: h.street === 'showdown' ? '攤牌' : streetName(h.street),
        board: h.board,
        pot: h.pot,
        currentBet: h.currentBet,
        minRaise: h.minRaise,
        toActId: actor ? actor.id : null,
        awaitingWinnerPick: h.awaitingWinnerPick,
        commitment: h.commitment,
        pots: buildPots(room),
      }
      : null,
    lastResult: room.lastResult,
    log: room.log.slice(-40),
  };
}
