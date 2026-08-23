import crypto from 'node:crypto';
import { makeDeck } from './cards.js';

/**
 * Provably-fair deck generation.
 *
 * Before a hand starts the server commits to a random 32-byte seed by
 * publishing sha256(serverSeed). The shuffle also mixes in every player's
 * client seed and the hand number, so no single party controls the order.
 * After the hand the server seed is revealed and anybody can recompute the
 * exact deck with `deckFrom(...)` and check it against the commitment.
 */

export function newServerSeed() {
  return crypto.randomBytes(32).toString('hex');
}

export function commitmentOf(serverSeed) {
  return crypto.createHash('sha256').update(serverSeed).digest('hex');
}

/** Deterministic keyed random stream: HMAC-SHA256(seed, counter). */
function* byteStream(seed) {
  let counter = 0;
  for (;;) {
    const block = crypto.createHmac('sha256', seed).update(String(counter)).digest();
    for (const b of block) yield b;
    counter += 1;
  }
}

/** Unbiased integer in [0, max) drawn from the byte stream (rejection sampling). */
function nextInt(stream, max) {
  const range = 256 ** 4;
  const limit = range - (range % max);
  for (;;) {
    let v = 0;
    for (let i = 0; i < 4; i += 1) v = v * 256 + stream.next().value;
    if (v < limit) return v % max;
  }
}

export function deckFrom(serverSeed, clientSeeds, handNumber) {
  const seed = [serverSeed, ...[...clientSeeds].sort(), String(handNumber)].join('|');
  const stream = byteStream(seed);
  const deck = makeDeck();
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = nextInt(stream, i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
