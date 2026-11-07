# Bid Battle

A playable multiplayer prototype of a card-based trading game that teaches market-making, bid/ask
spreads, long and short positions, and risk management. Four traders estimate the combined value of
seven partially hidden cards, publish binding prices, trade with one another, and settle when the
cards are revealed. Fictional credits only.

## Quick start

Requires Node.js 20+ (developed on Node 26) and npm 10+.

```bash
npm install          # installs all workspaces
npm run dev          # server on http://localhost:3001, web client on http://localhost:5173
```

Open http://localhost:5173, enter a name and click **Create a private table**. Click **Start solo match
vs 3 AI** to play immediately, or share the room code / invite link so friends can join first.

New players get a five-step **How to play** walkthrough the first time they reach the table (reopen it
any time from the top bar). The table also shows a plain-language coach tip for the current moment
("Step 1: set your two prices", "your turn to trade (or pass)"), a rough guess of the total based on
your card, and suggested starter prices that are prefilled in the quote form.

Other root commands:

| Command | What it does |
| --- | --- |
| `npm run build` | Engine declarations, a bundled server (`packages/server/dist/index.js`) and the web build (`packages/web/dist`) |
| `npm start` | Runs the bundled server; it also serves the built web client on http://localhost:3001 |
| `npm run typecheck` | `tsc -b` across all packages |
| `npm test` | Vitest: engine, risk, bots, room driver (fake time) and Socket.IO transport tests |
| `npm run test:e2e` | Playwright: two browser contexts play through a settlement, plus a reconnect test. Run `npx playwright install chromium` once first |

Environment variables (see `.env.example`): `PORT`, `BOT_DELAY_MS`, `QUOTE_PREP_MS`, `TURN_MS`,
`COUNTER_MS`, `REVIEW_MS`, `ROUNDS`, `STATIC_DIR`, `AUDIT=1` (prints the private audit trail to stderr).

**Rooms live in memory only. Restarting the server clears every active match.**

## Playing from a second browser or device

1. Player one creates a table and reads the five-letter room code (or clicks **Copy invite link**).
2. On the same machine, open a second tab or a private window at http://localhost:5173 and join with
   the code. Sessions are stored per tab, so two tabs are two players.
3. From another device on the same network, open `http://<your-LAN-IP>:5173/?room=CODE`. Vite binds
   to localhost by default; run `npm run dev -w @bid-battle/web -- --host` (with the server running
   separately via `npm run dev -w @bid-battle/server`) to expose it. The Socket.IO connection is
   proxied through Vite, so only the web port needs to be reachable. With `npm run build && npm start`
   a single port (3001) serves both the client and the game server.
4. The host chooses each empty seat's AI difficulty (Easy / Normal / Hard, default Normal) and
   starts. Empty seats become AI. Nobody can join after the start; reconnecting is not a join.

## Rules

- Four seats, 100 credits each, ten rounds, three trading cycles per round. Highest final balance
  wins; ties share the win.
- Each round shuffles a 17-card deck: 1..15, −10, −20. One private card to each trader, three
  face-down community cards, ten unused cards never shown.
- **Settlement value V = the sum of all seven dealt cards** (four private + three community).
  Range −15 to 84; unconditional expectation 630/17 ≈ 37.06.
- Phases: LOBBY → DEAL → QUOTE_PREPARATION → TRADING → (next cycle | SETTLEMENT) → ROUND_REVIEW →
  (next round | MATCH_COMPLETE). Cycle 2 reveals community card 1, cycle 3 reveals card 2,
  settlement reveals card 3 and every private card. All quotes expire before each reveal.
- The first trading seat is random; it rotates by one after every cycle, across rounds.
- **Sealed quotes.** Each cycle starts with simultaneous private preparation: bid ("I buy at"),
  ask ("I sell at"), both, or none, each for exactly one contract. Integer prices inside the
  publicly possible range, bid strictly below ask, and affordable (below). Confirmation locks it;
  the timer produces no quote for anyone unconfirmed. Everything is revealed together.
- **Trading turn.** One primary action per seat per cycle: BUY someone's ask, SELL to someone's
  bid, COUNTER-OFFER (buy strictly below an ask or sell strictly above a bid; the target gets
  Accept / Decline, no counter-counter; the responder keeps their own turn), or PASS. Filling one
  side of a quote leaves the other side live. Crossing quotes never auto-match. No self-trades.
  Published quotes cannot be edited or pulled; they disappear only when filled, when the cycle ends,
  or through automatic risk cancellation.
- Contracts are cash settled: buying at P earns V − P, selling at P earns P − V. Net position stays
  within ±2. Selling first opens a short.

## Settlement and risk formulas

Per trader within a round: `B` = balance at round start, `q` = bought − sold, `C` = Σ sale prices −
Σ purchase prices. Trade prices are never deducted up front.

```
P&L(V)      = C + q × V
end balance = B + P&L(V)
```

Public bounds use only the revealed community cards `P`: remove them from the deck, let
`m = 7 − |P|`, then `L = ΣP + (m smallest remaining)` and `U = ΣP + (m largest remaining)`.
Before any reveal L = −15 and U = 84. Private cards are never used, so the limits cannot leak them.

```
worstLoss(portfolio) = max(0, −min(C + q·L, C + q·U))
```

A quote is affordable only if **every** fill subset (none, bid, ask, both) keeps `|q| ≤ 2` and
`worstLoss ≤ B`. The reserved risk shown in the UI is the maximum worstLoss across those subsets;
available credits = B − reserved. Executions validate both resulting portfolios atomically, then
re-check each party's remaining quote and deterministically cancel unsafe sides (the side adding
exposure in the direction of the position first), logging each cancellation publicly. An otherwise
safe trade is never rejected merely because it forces cancellation of the active player's own quote.

Worked checks (all covered by tests): with B = 100 and no public cards, buying one at 36 reserves
51; two at 36 would reserve 102 and is refused; buying at 32 and selling at 36 locks +4 whatever V
is. Reference trade at V = 39: A buys from B at 32 and sells to C at 36 → A +4, B −7, C +3, D 0.
Total credits always stay at 400.

The round review pairs a player's buys and sells **FIFO** to separate locked profit from remaining
exposure; settlement itself always uses the aggregate formula above. The review also shows what
each trade looked like against the information available at the time (own card, public cards,
range, fair estimate) rather than judging by outcome.

## Architecture

```
packages/engine   Pure TypeScript, no framework or I/O
  config.ts       All constants (seats, credits, rounds, timers, deck)
  risk.ts         Public bounds, worst-loss, fill-subset reservation, deterministic trimming
  engine.ts       GameEngine: authoritative state machine, commands, timers via tick(now)
  view.ts         projectView (per-seat sanitised view) and buildBotObservation (structural
                  restriction: built field by field, so hidden data cannot be present)
  bots.ts         Easy / Normal / Hard decision code using the same command interface as humans
  review.ts       FIFO pairing for the educational breakdown
  simulate.ts     Deterministic all-AI matches (used by tests and tuning)
packages/server   Node + Socket.IO
  room.ts         Room: lobby, engine driver, bot scheduling, AI takeover, reconnect, command
                  de-duplication (command ids) and stale-phase rejection (phaseVersion)
  server.ts       In-memory room registry, socket transport, per-player view broadcast, static files
  clock.ts        Injectable clock (FakeClock for tests)
  validate.ts     Payload schema checks
packages/web      React + Vite client (Join → Lobby → Table → Round review → Results)
  coach.ts        Rough-guess, suggested quote and per-phase plain-language tips
  components/Tutorial.tsx  First-run "How to play" walkthrough
e2e/              Playwright browser tests
```

The server owns deck order, phases, turns, quotes, positions, balances, settlement, timers and bot
execution. Clients send commands (`{commandId, phaseVersion, action}`) and receive a view built for
their seat: own private card only, revealed community cards only, published quotes only during
trading, never unused cards or others' sealed submissions. Duplicate command ids return the cached
result; a command carrying an outdated phase version is rejected.

Disconnected humans keep their seat, cards, balance and quotes; at the next decision the room lets a
Normal bot act for them (the seat is marked "AI playing"). Reconnecting with the per-tab token
cancels any not-yet-fired AI action and hands control back without restarting anything. Host
control moves to another human if the host leaves the lobby; a running match never depends on the
host.

AI difficulties: Easy uses a noisy estimate (±6), wide spreads (5–8) and no counters. Normal uses the
exact conditional expectation `Σknown + unknown × mean(deck \ known)`, spreads of 3–4, inventory
skew and sensible counters. Hard additionally leans (capped at ±5) toward the market signal from
public quote midpoints and trade prices, quotes tighter (2–3), skews harder and demands more edge.
Difficulty is fixed for the match. Bots receive only a `BotObservation` and act through the same
engine commands with the same validation.

## Testing

- `npm test` runs 45 Vitest tests: deck/deal, bounds, reservation subsets, negative prices,
  reference trade, independent sides, self-trade rejection, position limits, counter accept/decline/
  timeout, quote expiry order, rotation across rounds, exactly-once settlement, view sanitisation,
  structurally restricted bot observation, 150 seeded all-AI matches with invariants (total 400,
  no negative balances, |q| ≤ 2, matched counterparties), the room driver with fake time (solo
  match, duplicate commands, wrong seat / stale phase / malformed payloads, AI takeover and
  reconnect), and a real Socket.IO session with two clients (join, hidden information, trade,
  duplicate command, reconnect, state agreement).
- `npm run test:e2e` runs the browser smoke test: create room → join from a second context → set AI
  difficulties → start → sealed quotes (opponent's prices hidden until publication) → trade with
  preview → settlement → both clients agree on cards, value and balances → ready for round 2; plus
  a reload/reconnect test. The Playwright web server runs the production build with 100 ms bot
  delays and shortened turn/counter timers.

## Design decisions and assumptions

- Positions and cashflow are public (all trades are public anyway); balances change only at
  settlement.
- Counter-offers are validated against both parties' public risk at proposal time so pointless
  offers cannot be sent; acceptance re-validates atomically.
- Automatic cancellation order: if the trader is long, the bid goes first; if short, the ask; if
  flat, the side with the larger stand-alone worst loss (ask on ties).
- Timers: quote preparation 20 s, turn 20 s, counter response 10 s, review 30 s (ends early when all
  humans are ready). All server-side; the client only renders the deadline.
- A zero-balance trader stays seated and can only post riskless quotes; no top-ups.

## Known limitations

- In-memory rooms: a server restart ends all matches. Idle rooms with no connected humans are
  swept after 10 minutes.
- No accounts, matchmaking, spectators, persistence, or deployment configuration.
- Reconnect tokens live in the tab's `sessionStorage`; closing the tab loses the seat (the AI
  plays it out).
- The action panel offers the best bid/ask to hit; countering lets you target any trader's quote.
- Bot tuning is heuristic. Over 200 seeded matches Hard averages ≈110 credits, Normal ≈100 and
  Easy ≈89, with roughly 27 trades per match.
