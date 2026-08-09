import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import selfsigned from 'selfsigned';

import {
  createRoom, publicState, startHand, act, pickWinners, addLog, seatedPlayers,
} from './game.js';
import { deckFrom, commitmentOf } from './shuffle.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const WEB_DIST = path.join(ROOT, 'web', 'dist');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const CERT_DIR = process.env.CERT_DIR || path.join(DATA_DIR, 'certs');
const STATE_FILE = path.join(DATA_DIR, 'rooms.json');

const HTTP_PORT = Number(process.env.HTTP_PORT || 80);
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 443);
const ENABLE_HTTPS = process.env.ENABLE_HTTPS !== '0';

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(CERT_DIR, { recursive: true });
const ACME_ROOT = path.join(DATA_DIR, 'acme');
const ACME_CHALLENGE_DIR = path.join(ACME_ROOT, '.well-known', 'acme-challenge');
fs.mkdirSync(ACME_CHALLENGE_DIR, { recursive: true });

/** @type {Map<string, any>} */
const rooms = new Map();
/** playerId -> Set<ws> */
const sockets = new Map();

// ---------------------------------------------------------------- persistence

function saveRooms() {
  const dump = [...rooms.values()].map((r) => ({
    ...r,
    players: r.players.map((p) => ({ ...p, connected: false })),
  }));
  fs.writeFileSync(STATE_FILE, JSON.stringify(dump), 'utf8');
}

function loadRooms() {
  if (!fs.existsSync(STATE_FILE)) return;
  try {
    for (const r of JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))) rooms.set(r.code, r);
    console.log(`restored ${rooms.size} room(s)`);
  } catch (err) {
    console.error('failed to restore rooms:', err.message);
  }
}

// --------------------------------------------------------------------- helpers

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newCode() {
  for (;;) {
    const code = Array.from({ length: 4 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
    if (!rooms.has(code)) return code;
  }
}

function newId() {
  return crypto.randomBytes(9).toString('base64url');
}

function broadcast(room) {
  for (const p of room.players) {
    for (const ws of sockets.get(p.id) || []) {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'state', state: publicState(room, p.id) }));
    }
  }
  for (const ws of sockets.get(`spectator:${room.code}`) || []) {
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'state', state: publicState(room, null) }));
  }
}

function attach(id, ws) {
  if (!sockets.has(id)) sockets.set(id, new Set());
  sockets.get(id).add(ws);
}

function freeSeat(room) {
  const taken = new Set(room.players.map((p) => p.seat));
  for (let i = 0; i < 10; i += 1) if (!taken.has(i)) return i;
  throw new Error('房間已滿（最多 10 人）');
}

function requireHost(room, player) {
  if (!player || player.id !== room.hostId) throw new Error('只有主持人可以做這個操作');
}

// ------------------------------------------------------------------ ws handling

function handleMessage(ws, msg) {
  const send = (obj) => ws.readyState === 1 && ws.send(JSON.stringify(obj));

  if (msg.type === 'create') {
    const code = newCode();
    const room = createRoom(code, msg.mode === 'chips' ? 'chips' : 'deal', msg.config || {});
    rooms.set(code, room);
    const player = {
      id: newId(),
      token: newId(),
      name: (msg.name || '主持人').slice(0, 12),
      seat: 0,
      stack: room.config.startingStack,
      buyIn: room.config.startingStack,
      connected: true,
      sittingOut: false,
      clientSeed: crypto.randomBytes(4).toString('hex'),
    };
    room.players.push(player);
    room.hostId = player.id;
    addLog(room, `房間 ${code} 已建立（${room.mode === 'chips' ? '純籌碼計算' : '手機發牌'}）`);
    ws.playerId = player.id;
    ws.roomCode = code;
    attach(player.id, ws);
    send({ type: 'joined', code, playerId: player.id, token: player.token });
    broadcast(room);
    saveRooms();
    return;
  }

  if (msg.type === 'join') {
    const room = rooms.get(String(msg.code || '').toUpperCase());
    if (!room) throw new Error('找不到房間代碼');
    let player = msg.token ? room.players.find((p) => p.token === msg.token) : null;
    if (!player) {
      if (msg.spectate) {
        ws.roomCode = room.code;
        ws.playerId = null;
        attach(`spectator:${room.code}`, ws);
        send({ type: 'joined', code: room.code, playerId: null, token: null });
        send({ type: 'state', state: publicState(room, null) });
        return;
      }
      player = {
        id: newId(),
        token: newId(),
        name: (msg.name || '玩家').slice(0, 12),
        seat: freeSeat(room),
        stack: room.config.startingStack,
        buyIn: room.config.startingStack,
        connected: true,
        sittingOut: !!room.hand,
        clientSeed: crypto.randomBytes(4).toString('hex'),
      };
      room.players.push(player);
      addLog(room, `${player.name} 加入房間`);
    }
    player.connected = true;
    ws.playerId = player.id;
    ws.roomCode = room.code;
    attach(player.id, ws);
    send({ type: 'joined', code: room.code, playerId: player.id, token: player.token });
    broadcast(room);
    saveRooms();
    return;
  }

  const room = rooms.get(ws.roomCode);
  if (!room) throw new Error('尚未加入房間');
  const player = room.players.find((p) => p.id === ws.playerId);
  if (!player) throw new Error('找不到你的座位');

  switch (msg.type) {
    case 'action':
      act(room, player, msg.action, msg.amount);
      break;
    case 'rename':
      player.name = String(msg.name || '').slice(0, 12) || player.name;
      break;
    case 'clientSeed':
      player.clientSeed = String(msg.seed || '').slice(0, 32);
      break;
    case 'sitOut':
      player.sittingOut = !!msg.value;
      break;
    case 'startHand': {
      requireHost(room, player);
      const seeds = room.players.filter((p) => !p.sittingOut).map((p) => p.clientSeed);
      startHand(room, seeds);
      break;
    }
    case 'pickWinners':
      requireHost(room, player);
      pickWinners(room, msg.winners || []);
      break;
    case 'addChips': {
      requireHost(room, player);
      const target = room.players.find((p) => p.id === msg.playerId);
      if (!target) throw new Error('找不到玩家');
      const amt = Math.round(Number(msg.amount) || 0);
      target.stack += amt;
      target.buyIn += Math.max(0, amt);
      addLog(room, `${target.name} 補碼 ${amt}`);
      break;
    }
    case 'setStack': {
      requireHost(room, player);
      const target = room.players.find((p) => p.id === msg.playerId);
      if (!target) throw new Error('找不到玩家');
      if (room.hand) throw new Error('牌局進行中不能改籌碼');
      target.stack = Math.max(0, Math.round(Number(msg.amount) || 0));
      addLog(room, `主持人把 ${target.name} 的籌碼調整為 ${target.stack}`);
      break;
    }
    case 'setConfig': {
      requireHost(room, player);
      if (room.hand) throw new Error('牌局進行中不能改盲注');
      const c = msg.config || {};
      room.config.smallBlind = Math.max(0, Math.round(Number(c.smallBlind) || room.config.smallBlind));
      room.config.bigBlind = Math.max(1, Math.round(Number(c.bigBlind) || room.config.bigBlind));
      room.config.ante = Math.max(0, Math.round(Number(c.ante) || 0));
      room.config.startingStack = Math.max(1, Math.round(Number(c.startingStack) || room.config.startingStack));
      addLog(room, `盲注改為 ${room.config.smallBlind}/${room.config.bigBlind}`);
      break;
    }
    case 'kick': {
      requireHost(room, player);
      if (room.hand) throw new Error('牌局進行中不能移除玩家');
      room.players = room.players.filter((p) => p.id !== msg.playerId);
      break;
    }
    case 'cancelHand':
      requireHost(room, player);
      if (room.hand) {
        for (const p of seatedPlayers(room)) p.stack += room.hand.committed[p.id] || 0;
        addLog(room, '主持人取消本手牌，籌碼已退回');
        room.hand = null;
      }
      break;
    default:
      throw new Error(`未知的訊息類型 ${msg.type}`);
  }
  broadcast(room);
  saveRooms();
}

// --------------------------------------------------------------------- express

const app = express();
app.use(express.json());
app.use('/.well-known/acme-challenge', express.static(ACME_CHALLENGE_DIR), express.static(ACME_ROOT));

app.get('/api/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

app.get('/api/room/:code', (req, res) => {
  const room = rooms.get(String(req.params.code).toUpperCase());
  if (!room) return res.status(404).json({ error: 'not found' });
  return res.json({ code: room.code, mode: room.mode, players: room.players.length });
});

/** Verify a revealed hand: recompute the deck and the commitment. */
app.post('/api/verify', (req, res) => {
  const { serverSeed, clientSeeds = [], handNumber } = req.body || {};
  if (!serverSeed) return res.status(400).json({ error: 'serverSeed required' });
  const deck = deckFrom(serverSeed, clientSeeds, handNumber);
  return res.json({ commitment: commitmentOf(serverSeed), deck });
});

app.use(express.static(WEB_DIST));
app.get(/.*/, (_req, res) => res.sendFile(path.join(WEB_DIST, 'index.html')));

// ---------------------------------------------------------------------- server

function loadTls() {
  const key = path.join(CERT_DIR, 'privkey.pem');
  const cert = path.join(CERT_DIR, 'fullchain.pem');
  if (fs.existsSync(key) && fs.existsSync(cert)) {
    return { key: fs.readFileSync(key), cert: fs.readFileSync(cert), selfSigned: false };
  }
  const attrs = [{ name: 'commonName', value: process.env.PUBLIC_HOST || 'localhost' }];
  const pems = selfsigned.generate(attrs, { days: 3650, keySize: 2048 });
  fs.writeFileSync(key, pems.private);
  fs.writeFileSync(cert, pems.cert);
  return { key: pems.private, cert: pems.cert, selfSigned: true };
}

function mountWs(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      try {
        handleMessage(ws, msg);
      } catch (err) {
        if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'error', message: err.message }));
      }
    });
    ws.on('close', () => {
      for (const [id, set] of sockets) {
        set.delete(ws);
        if (set.size === 0) sockets.delete(id);
      }
      const room = rooms.get(ws.roomCode);
      if (room) {
        const p = room.players.find((x) => x.id === ws.playerId);
        if (p && !sockets.has(p.id)) {
          p.connected = false;
          broadcast(room);
        }
      }
    });
  });
  const timer = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);
  wss.on('close', () => clearInterval(timer));
}

loadRooms();

if (ENABLE_HTTPS) {
  const tls = loadTls();
  const httpsServer = https.createServer({ key: tls.key, cert: tls.cert }, app);
  mountWs(httpsServer);
  httpsServer.listen(HTTPS_PORT, () => {
    console.log(`HTTPS on :${HTTPS_PORT}${tls.selfSigned ? ' (self-signed cert)' : ''}`);
  });

  // plain HTTP: ACME challenges + redirect everything else to HTTPS
  const redirect = express();
  redirect.use('/.well-known/acme-challenge', express.static(ACME_CHALLENGE_DIR), express.static(ACME_ROOT));
  redirect.use((req, res) => {
    const host = (req.headers.host || '').split(':')[0];
    res.redirect(308, `https://${host}${HTTPS_PORT === 443 ? '' : `:${HTTPS_PORT}`}${req.originalUrl}`);
  });
  http.createServer(redirect).listen(HTTP_PORT, () => console.log(`HTTP on :${HTTP_PORT} (redirect + ACME)`));
} else {
  const server = http.createServer(app);
  mountWs(server);
  server.listen(HTTP_PORT, () => console.log(`HTTP on :${HTTP_PORT}`));
}
