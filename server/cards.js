export const SUITS = ['s', 'h', 'd', 'c'];
export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
export const RANK_CHARS = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
  10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

export function makeDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(RANK_CHARS[r] + s);
  return deck;
}

export function rankOf(card) {
  const c = card[0];
  const entry = Object.entries(RANK_CHARS).find(([, ch]) => ch === c);
  return Number(entry[0]);
}

export function suitOf(card) {
  return card[1];
}

const CATEGORY_NAMES = [
  '高牌', '一對', '兩對', '三條', '順子', '同花', '葫蘆', '四條', '同花順',
];

function evaluate5(cards) {
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  const suits = cards.map(suitOf);
  const isFlush = suits.every((s) => s === suits[0]);

  const uniq = [...new Set(ranks)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 14 && uniq[1] === 5 && uniq[4] === 2) straightHigh = 5;
  }

  const counts = new Map();
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
  // sort by count desc, then rank desc
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const shape = groups.map(([, n]) => n).join('');

  if (isFlush && straightHigh) return [8, straightHigh];
  if (shape === '41') return [7, groups[0][0], groups[1][0]];
  if (shape === '32') return [6, groups[0][0], groups[1][0]];
  if (isFlush) return [5, ...ranks];
  if (straightHigh) return [4, straightHigh];
  if (shape === '311') return [3, groups[0][0], groups[1][0], groups[2][0]];
  if (shape === '221') return [2, groups[0][0], groups[1][0], groups[2][0]];
  if (shape === '2111') return [1, groups[0][0], groups[1][0], groups[2][0], groups[3][0]];
  return [0, ...ranks];
}

export function compareScore(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

/** Best 5-card hand out of 5..7 cards. Returns { score, cards, name }. */
export function evaluateBest(cards) {
  if (cards.length < 5) throw new Error('need at least 5 cards');
  let best = null;
  const n = cards.length;
  const combo = (start, picked) => {
    if (picked.length === 5) {
      const score = evaluate5(picked);
      if (!best || compareScore(score, best.score) > 0) {
        best = { score, cards: [...picked] };
      }
      return;
    }
    for (let i = start; i < n; i += 1) {
      picked.push(cards[i]);
      combo(i + 1, picked);
      picked.pop();
    }
  };
  combo(0, []);
  return { ...best, name: CATEGORY_NAMES[best.score[0]] };
}
