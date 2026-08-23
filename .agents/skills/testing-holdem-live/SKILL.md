---
name: testing-holdem-live
description: How to run and end-to-end test the holdem-live app locally (server + web build, multi-player simulation with WebSocket bots, mobile viewport UI checks).
---

# Testing holdem-live locally

## Run the app
```bash
cd <repo>
npm install
npm --prefix web install && npm --prefix web run build   # backend serves web/dist statically
DATA_DIR=/tmp/hl-test ENABLE_HTTPS=0 HTTP_PORT=8080 node server/index.js
```
Open http://localhost:8080/ . `ENABLE_HTTPS=0` is required, otherwise the plain HTTP port only
redirects to HTTPS with a self-signed cert. Rooms persist in `$DATA_DIR/rooms.json`; delete it for
a clean slate.

This is a phone-first app — test with a ~390x844 mobile viewport (browser mobile emulation).

## Simulating other players (WebSocket bots)
`test/ws-smoke.mjs` is a working example. A handy generic bot driver (put it in the **repo root** so
`import WebSocket from 'ws'` resolves — a script under /tmp cannot resolve the dependency):

```js
// bots.mjs — node bots.mjs ROOMCODE Name:call Name:allin Name:raise ...
// join: {type:'join',code,name}; act: {type:'action',action:'call'|'check'|'fold'|'raise'|'allin',amount}
// host-only: {type:'startHand'}, {type:'pickWinners',winners}, {type:'addChips',playerId,amount}
```
Set `DUMP=<botName>` to print that bot's raw `state` payload — the cleanest way to prove hole-card
privacy (other players' entries must contain no `hole` key).

Gotchas learned the hard way:
- A player who joins **while a hand is running** gets `sittingOut: true` and it is never cleared
  automatically, so they sit out every later hand too. Add bots only between hands, or send
  `{type:'sitOut', value:false}`.
- Host-only actions require the host socket; bots cannot start hands.
- To create uneven stacks for side-pot tests, use the host 控制台 → 補碼 with a **negative** amount
  (`setStack` is not exposed in the UI; `addChips` accepts negatives and leaves buy-in untouched).

## UI paths
- Home → 開新牌局 → pick 手機發牌 (deal) or 純籌碼計算 (chips) → nickname → 建立房間 → 4-char room code.
- Table tabs: 牌桌 / 控制台 (host) / 結算 (ledger, chip conservation check) / 公平性.
- Raise helper: tap 加注 to expand quick sizes (Min/⅓/½/⅔/池/All-in), slider, ±1BB, number input.

## Long-press gestures (peek at hole cards)
The browser tool's `click` fires pointerdown+pointerup instantly, so it cannot hold a press. Use
xdotool on the X display and screenshot while held:
```bash
# get client rect via the page, then: screen_y = client_y + <chrome height>
DISPLAY=:0 xdotool mousemove <x> <y> mousedown 1 ; sleep 1 ; # screenshot ; then
DISPLAY=:0 xdotool mouseup 1
```
Calibrate the offset once: add a `mousemove` listener, move the pointer to a known screen point and
read back `clientX/clientY` (x was 1:1, y offset ≈ browser chrome height).

## Known/likely issues to re-check
- Oval seat layout is fine up to 6 players at 390px; at **7+ players** the left/right seats overlap
  the community-card row (`Felt.tsx` places seats at a fixed 43%/42% radius).
- The `池` quick-size in `ActionBar.tsx` computes raise-TO as `toCall + (pot + toCall)`, which
  ignores chips the player already has in front (blinds / previous bet), so it is undersized by
  that amount. Verify with the heads-up SB (pot 3, toCall 1 → shows 5, true pot raise is 6).
- Community cards disappear from the felt once the hand ends (Felt renders `hand?.board`, and
  `hand` is null after showdown), so the showdown list has no board to reference.

## Devin Secrets Needed
None — everything runs locally with no credentials.
