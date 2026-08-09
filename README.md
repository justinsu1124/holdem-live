# 德州撲克現場助手 (holdem-live)

現場玩德州撲克時用的手機輔助系統。開局時選一種模式：

| 模式 | 用途 |
| --- | --- |
| **純籌碼計算** | 用實體撲克牌發牌，手機只負責盲注、下注、底池／邊池計算、記分與結算。攤牌後由主持人指定贏家派彩。 |
| **手機發牌** | 每個人用自己的手機看底牌，公牌顯示在所有人畫面上。伺服器用可驗證的公平 RNG 洗牌，並自動比牌派彩。 |

同一桌的人連到同一個網址、掃 QR code 或輸入 4 碼房號即可入座，最多 10 人。

## 公平發牌（commit–reveal）

每手牌開始前伺服器：

1. 產生 32 bytes 隨機 `serverSeed`（`crypto.randomBytes`），
2. 立刻公布 `sha256(serverSeed)` 作為承諾值，
3. 洗牌時的實際亂數種子是 `serverSeed | 各玩家 clientSeed（排序後） | 手數`，
4. 以 `HMAC-SHA256(seed, counter)` 產生位元組流，用**拒絕採樣**做無偏 Fisher–Yates 洗牌。

牌局結束後 `serverSeed` 公開。任何人都可以在 App 的「公平性」分頁驗證雜湊，或用 API 重算整副牌：

```bash
curl -X POST https://<host>/api/verify -H 'content-type: application/json' \
  -d '{"serverSeed":"...","clientSeeds":["..."],"handNumber":3}'
```

因為承諾值在發牌前就公布、且種子混入了每位玩家的 clientSeed，伺服器無法事後改牌，玩家也無法單方面操縱牌序。

## 架構

```
server/    Node + Express + ws（遊戲引擎、WebSocket、HTTP/HTTPS）
  cards.js     牌型評估（7 選 5）
  shuffle.js   可驗證公平洗牌
  game.js      德州撲克規則引擎（盲注、下注輪、邊池、攤牌）
  index.js     WebSocket 協定、房間管理、靜態檔、TLS
web/       React + TypeScript + Vite（手機優先 UI）
test/      引擎單元測試 + WebSocket 端對端煙霧測試
```

前端與後端由同一個行程提供服務，所以只需要開一個 port。

## 本機開發

```bash
npm install
npm run build            # 建置前端到 web/dist
npm run dev:server       # http://localhost:8080（無 TLS）
node test/ws-smoke.mjs   # 端對端測試
npm test                 # 引擎單元測試
```

前端熱重載開發時另開一個終端機跑 `npm run dev:web`（Vite 會把 `/ws` 與 `/api` 代理到 8080）。

## 正式部署

```bash
npm install && npm run build
HTTP_PORT=80 HTTPS_PORT=443 PUBLIC_HOST=<你的網域> npm start
```

- 沒有憑證時會自動產生自簽憑證放在 `data/certs/`；把 Let's Encrypt 的 `privkey.pem` / `fullchain.pem` 放進同一個目錄即可換成正式憑證。
- port 80 只做 ACME challenge 與 308 轉址到 HTTPS；`data/acme/` 就是 webroot（certbot `--webroot -w <DATA_DIR>/acme`）。
- 房間狀態會存到 `data/rooms.json`，重啟後自動還原。

取得正式憑證（以 nip.io 網域為例）：

```bash
docker run --rm -v holdem-data:/data certbot/certbot certonly --webroot -w /data/acme \
  -d <ip-with-dashes>.nip.io --agree-tos -m <email> --non-interactive \
  --config-dir /data/letsencrypt --work-dir /data/le-work --logs-dir /data/le-logs
# 再把 live/<domain>/{fullchain,privkey}.pem 複製到 /data/certs/ 並重啟 container
```

Windows + Docker Desktop 注意：若防火牆提示被按過「取消」，會留下 `Docker Desktop Backend` 的 **Block** 規則，外網連不進已發布的 port（LAN 正常）。需停用該 block 規則並改為 allow。

## 環境變數

| 變數 | 預設 | 說明 |
| --- | --- | --- |
| `HTTP_PORT` | `80` | HTTP port |
| `HTTPS_PORT` | `443` | HTTPS port |
| `ENABLE_HTTPS` | `1` | 設 `0` 只跑 HTTP（本機開發用） |
| `PUBLIC_HOST` | `localhost` | 自簽憑證的 CN |
| `DATA_DIR` | `./data` | 房間狀態、憑證、ACME challenge |
