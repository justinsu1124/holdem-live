export type Mode = 'chips' | 'deal';

export interface Legal {
  actions: string[];
  toCall: number;
  minRaiseTo: number;
  maxRaiseTo: number;
  pot: number;
}

export interface PlayerView {
  id: string;
  name: string;
  seat: number;
  stack: number;
  buyIn: number;
  connected: boolean;
  sittingOut: boolean;
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  bet: number;
  committed: number;
  isActor: boolean;
}

export interface Pot {
  amount: number;
  eligible: string[];
}

export interface HandView {
  number: number;
  street: string;
  streetLabel: string;
  board: string[];
  pot: number;
  currentBet: number;
  minRaise: number;
  toActId: string | null;
  awaitingWinnerPick: boolean;
  commitment: string;
  pots: Pot[];
}

export interface Fairness {
  commitment: string;
  serverSeed: string;
  clientSeeds: string[];
  handNumber: number;
}

export interface LastResult {
  handNumber: number;
  reason: 'fold' | 'showdown' | 'manual';
  board: string[];
  payouts: Record<string, number>;
  winners: string[];
  hole: Record<string, string[]>;
  hands: Record<string, { name: string; cards: string[] }>;
  fairness: Fairness;
}

export interface GameState {
  code: string;
  mode: Mode;
  config: { smallBlind: number; bigBlind: number; ante: number; startingStack: number };
  hostId: string;
  handNumber: number;
  dealerSeat: number | null;
  youAreHost: boolean;
  you: {
    id: string;
    name: string;
    seat: number;
    stack: number;
    buyIn: number;
    sittingOut: boolean;
    hole: string[] | null;
    legal: Legal | null;
  } | null;
  players: PlayerView[];
  hand: HandView | null;
  lastResult: LastResult | null;
  log: { t: number; text: string }[];
}
