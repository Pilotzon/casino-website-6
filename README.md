# casino-website

Virtual-credits casino for a private friend group. React/Vite frontend, Node/Express + SQLite backend.

## Run it

```bash
# backend (port 5000)
cd backend
npm install
npm run init-db     # first time only: creates tables + the owner account from .env
npm run dev         # or: npm start

# frontend (port 3000, proxies /api to the backend)
cd frontend
npm install
npm run dev
```

## Crash — how the round works (server-authoritative)

Crash is a **solo** game (no multiplayer feed) and the backend owns every rule:

| Step | Endpoint | What happens |
|------|----------|--------------|
| poll state | `GET /api/games/crash/state` | full UI state (live round, last round, history, balance, cooldown); polled ~4×/s while a round is live |
| public snapshot | `GET /api/games/crash/last` | finished rounds only — used for the first paint, so a refresh can never flash a stale round |
| bet | `POST /api/games/crash/start` | debits atomically, commits `sha256(serverSeed:crashPoint)`, never sends the crash point |
| cash out | `POST /api/games/crash/cashout` | credits at the multiplier at that instant (capped by the crash point) |
| auto cash out | — | executed **server-side by a timer**, so it fires even if the tab is closed or the poll stalls |
| stop | `POST /api/games/crash/stop` | viewer-only: ends the animation after a cash-out |
| tick | `POST /api/games/crash/tick` | compatibility alias of the state poll |

* The crash point is revealed only **after** the round ends for that player.
* Every round is settled by a server timer; while a round is open it is also
  persisted in `crash_rounds`, so a backend restart resumes (or settles) it
  instead of losing the bet.
* After a round ends there is a **1 s cooldown** before the next bet
  (`retryInMs` is returned with a 429).
* `npm run test:crash` (in `backend/`) runs the 79-check engine smoke test
  against a throw-away database; `npm run test:http` boots the real server on a
  spare port and drives the same endpoints over HTTP (39 checks, also against a
  throw-away database — including `GET /api/dashboard/today`);
  `npm run test:keno` checks the Keno payout tables (147 checks). `npm test`
  runs all three.

### Toasts

One toast system for the whole site (`context/ToastContext.jsx`), with these
kinds: `success`, `error`, `info`, `warning` and **`loss`**. A lost round is an
outcome, not a failure — `toast.loss("You lost 20.00 $ this round")` renders the
"Loss" title with a falling-chart icon instead of the red "Error" cross
(`toast.error` stays for real failures: rejected bets, network problems, …).

Toasts **stack**: a new one appears at the top right and the ones already on
screen are pushed down by its height + the 10 px gutter (they slide, they are
never replaced or piled on top of each other). `react-hot-toast` positions each
toast with an absolutely positioned wrapper and *measures that wrapper* to
compute every offset — so the card itself has to stay **in flow** inside it
(`toast.css`: `position: relative`). An absolutely positioned card is out of
flow, reports a height of 0, and every toast then lands on exactly the same
spot.

### Disabled betting

When an administrator disables a game (or the site enters maintenance), every
game shows a red hazard badge on the top-right corner of its bet button. The
badge is a **sibling** of the button — a disabled `<button>` swallows clicks, so
a badge inside it could never work — and clicking it opens the same modal
anatomy as "Sign-up Disabled", explaining exactly why betting is off. Games wire
it with one line: `<BetLockBadge locked={isLocked} title={disabledTitle}
description={disabledDesc} />` inside a `.ui-bet-wrap` element.

That wrapper is why the button keeps its full sidebar width: several games style
their bet button as `inline-flex` (or leave the inline default), and an
inline-level box inside a plain block wrapper shrink-wraps to its own label —
`global.css` therefore gives `.ui-bet-wrap > button { width: 100% }`.

**Who is actually blocked?** Only players *without* the admin-panel permission
**"Bypass disabled games/pages"**. The owner always bypasses; a user needs
`users.can_bypass_disabled`, which nobody has by default and which is granted
per user in Admin → Users. The rule lives in exactly one place per layer —
`services/gameAccess.js` (backend, carried with the request through
`AsyncLocalStorage`, so the deep engine checks and Crash's own start route all
agree) and `hooks/useGameDisabled.js` (frontend) — and the games grid does not
label a bypassable game "Unavailable" either.

### Admin panel on a phone

Nothing in the admin panel scrolls sideways: at ≤640 px the tables drop their
column headers, each row becomes a two-line card (name/key, then status + the
action buttons) and the row buttons turn **icon-only** — 44 × 44 tiles with
24 px icons, so the power / phone glyphs stay readable — while keeping their
`aria-label` and `title`, so the meaning survives the missing text.
* `npm run test:board` (in `frontend/`) runs the 104-check DOM test of the Crash
  board in jsdom (see `frontend/tests/crash-board/`) — it drives the real
  component (polling, cash-out, render pump) against a scripted server and
  measures what the board actually renders, including the history pills' slide.
* `npm run test:ui` (in `frontend/`) runs the 418-check site UI suite
  (`frontend/tests/site-ui/`): the toast kinds (and that they stack), the
  games-page filter row, the admin panel's phone layout, the bet-button hazard
  badge on **every** game, the Scroll-up pill, the bypass permission in the UI,
  the filled icon set, the currency mark, the mobile bottom bar and the balance
  box with its Today panel, the dealt-blackjack reveal + bet-button gate, the
  Dice/Limbo history overlay, the Blackjack deal chain / centred hand /
  travelling total label (appearing with the FIRST card, at the one-card
  position) with the symmetric table bands and the flattened deal diagonal,
  the universal pills row (marker in-row, self-fading exit), the Roulette
  history stack, and the Slide/Hilo scaffolding shells.
* `npm test` runs both frontend suites.

### Scroll up

Every page carries one app-wide pill in the bottom-right corner
(`components/common/BackToTop.jsx`, mounted in `App.jsx`): it slides up from
below the fold once the user scrolls past 300 px, scrolls smoothly back to the
top when clicked, and on a mouse-driven PC shows the same white tooltip as the
icon buttons in the toolbar under the game box ("Scroll up"). On phones it
floats above the fixed bottom navigation bar, and pages must not ship a second
back-to-top button of their own.

### Icons, the currency mark and the balance box

* **Icons** — every UI icon comes from `components/common/Icons.jsx`: solid
  ("filled") [Phosphor](https://phosphoricons.com) glyphs (MIT), one
  `<path fill="currentColor">` each, so an icon follows the colour of its text
  and is sized with the `size` prop or from CSS. Pure line glyphs (×, +, −,
  carets, arrows, search, menu) use Phosphor's *bold* weight — their fill weight
  keeps a hairline shaft that reads as an outline at UI sizes. Add new icons
  there (the file header says how) instead of inlining `<svg>` markup. Drawings
  that are artwork rather than icons (the Crash chart, the Snakes board) keep
  their strokes.
* **Currency mark** — wherever an amount carries the currency symbol as an icon
  (bet inputs, profit fields, chips, win popups, balances) use
  `components/common/CurrencyIcon.jsx`: a `#25E801` disc with the `$` **cut
  out** — a real hole, so the background shows through. The colour is the
  `--color-currency` token in `global.css`; `.sidebar-currency-icon` /
  `.sidebar-input-suffix` place it inside the game sidebars' inputs. Plain-text
  amounts ("$0.00" labels, toast messages) still use the `$` character.
* **Mobile bottom bar** — the labels are always white and bold; only the icon
  colour marks the active tab.
* **Balance box** (top bar, `components/layout/BalanceBox.jsx`) — no border, no
  shadow, two parts. The left one (`--color-balance-box-bg`, `#102230`) shows
  the balance, the currency mark and a chevron that opens a **Today** panel:
  today's profit, today's wagered amount (with the bet count) and the three most
  recent bets. The right one (`--color-balance-wallet-bg`, `#2874E1`) is a
  wallet button that opens the Dashboard. The panel refetches every time it
  opens (and when the balance changes while it is open) from
  `GET /api/dashboard/today?since=<ISO>`, where `since` is the browser's **local**
  midnight, so "today" is the player's own day; an unparseable value, one in the
  future or one more than 26 h old falls back to the server's UTC midnight. It
  counts casino rounds only, not custom bets.

### Board rules (frontend)

* The multiplier, the curve and the visible "camera" span are **pure functions
  of the current time**, so the number can never freeze while the graph keeps
  moving. The camera grows 10% ahead of the tip, so the tip never touches the
  right wall (no jump when it would). Once the crash point is known, the curve,
  the camera and the tip are clipped to that moment — nothing keeps travelling
  to the right after the crash.
* The board's clock is estimated from a **window of server samples** (best of
  the last few) and only ever corrected forward, so a slow response can never
  pull the multiplier, the curve or the tip backwards.
* Stale responses cannot rewind the view: a payload older than what is on
  screen is dropped — except when it carries terminal news about the round on
  screen ("your cash-out was too late, it crashed"), which is always applied.
  That pair of rules is what removes the "shows Crashed, then goes back to
  running seconds later" glitch.
* History pills show the **crash point** of every finished round — green when
  the player won that round, gray when they lost.
* The post-round cooldown lives **on the button itself** (`Wait 1s`) — there is
  no extra sentence under it.
* The rectangular status box only appears when it has something to say:
  `Cashed Out 2.00×` (multiplier in green) after a cash-out, `Crashed` (white)
  once the round crashes; it disappears when the next bet is placed.
* A cash-out is applied **immediately** (before the response comes back), and a
  late response can never take it away again.
* `Total Ns` is **not** part of the chart: it is the elapsed time of the ROUND,
  taken from the round's own start time on the server — so it is identical on
  every device, survives a page refresh mid-round (it does not restart at 0), is
  unaffected by a cash-out, and stops at the crash. A round restored from the
  database (no timestamps) falls back to `ln(crashPoint) / k`, which is exactly
  how long it ran. It is rounded to the **nearest** second — the second the curve
  is currently on — so the clock and the X axis can never disagree (flooring made
  6.9s read as "6s" while the tip already sat next to the 7s tick). On phones the
  clock moves to the top right, under the history pills, which frees the whole
  axis row for the ticks.
* The X axis is labelled in **real seconds of the round**, positioned by the
  same `dispX` the curve is drawn with, so dropping a perpendicular from the tip
  of the graph onto the axis lands on the second that has really passed (the DOM
  suite asserts exactly that). Short rounds get **one tick per second**; the step
  coarsens (2s, 3s, 5s, 10s …) as the visible span grows, phones keep at most ~6
  labels, and the right-hand room is measured so the last label never collides
  with the clock.
* The Y tick labels sit in rounded `#253844` boxes with the (thicker) spine
  running through their centre; the curve carries ONE soft blurred shadow, and
  the tip dot is a plain circle with no outline ring that turns muted `#2E4552`
  with the line when the round crashes. The multiplier and the status box are the
  top layer of the board — above the curve and above the tip dot.
* Phones (≤900 px): the betting panel drops below the board, the chart gets an
  explicit height so it never collapses, labels/pills get a bigger font, and
  the history pills scroll horizontally with the newest round pinned at the
  right edge.
* While a bet is live, `RefreshGuard` intercepts F5 / Ctrl+R / Cmd+R with a
  "Refreshing the page will not save" prompt (plus a `beforeunload` fallback for
  the browser's own reload button). Every game reports its own live bet through
  `useActiveBetFlag(key, active)`.

### History pills + the marker

Every game with pills (Crash, Dice, Limbo, Wheel) renders the same system: the
newest pill sits at the right edge, older rounds continue left, green = won,
grey = lost, followed by the My-bets icon and `‹ You`.

* **Arrival** is ONE motion for the whole row: the new pill starts off-view on
  the right and glides in with the older pills shifting left at the same time.
  `hooks/usePillSlide.js` measures the new pill and arms `--pill-slide-from`,
  the shared `ui-pills-slide` keyframes walk the row back to 0, and the
  container is remounted per arrival so it replays. The trigger is the newest
  pill's **identity**, never the row length — histories are capped, so a length
  key would silently stop sliding once the cap is reached.
* **The marker sits IN the pills row in EVERY pills game** (pills left,
  marker right) — Crash, Dice, Limbo and Wheel alike. Dice and Limbo float
  that row over the stage as an **overlay**: it is absolutely pinned to the
  stage's top strip and the stage reserves that strip with its own padding, so
  neither the pills nor the marker can ever push the game layout downward.
* **The gap between pills is one constant** (`gap: 6px`): it never compresses
  or stretches with a pill's own width, and no pill carries a margin.
* **No gradient mask.** The old static left-edge fade (Crash) is gone; the
  OUTGOING pill fades ITSELF — `hooks/usePillFadeOut.js` steps each pill's own
  opacity down as its right edge approaches the scroller's left boundary and
  to zero exactly when it leaves, tracking the arrival slide frame by frame.
* **Roulette's history stack is dynamic**: it is exactly as tall as the balls
  it currently holds (no reserved full-height column), and the "History"
  title is centred in the panel with a slightly tighter top padding.

### Blackjack (frontend)

The round is server-authoritative (`processBlackjack` / `blackjackAction` in
`services/gameEngine.js`); the board only replays what it is told, in order.

* **A natural 21 wears its own state.** A settled hand of exactly two cards
  worth 21 takes a gold outline (`--blackjack-gold`) and the matching total-pill
  tone (`cardOutlineBlackjack` / `totalBlackjack`) — deliberately different from
  the win green, the push orange and the loss red.
* **A blackjack dealt on the initial deal reveals its hole card in the deal.**
  The server ends the round on the spot and returns both dealer cards face-up;
  the board still deals the hole card FACE DOWN like any other second card,
  turns it over the moment it lands, and only after that flip finishes are the
  settled colours/outlines applied, the dealer's total stepped and the win/loss
  sound played — never before, never during.
* **Nothing reacts before the flips are done.** The reveal (win popup, settled
  outlines, pill tones, the win/lose sound) waits for the last of the player's
  cards to finish flipping *and* for the hole-card flip, plus a two-frame grace
  (40 ms) so the styling can never land on the animation's last frame.
* **The Bet button re-arms when the round is over for the eye, not when the
  JSON lands.** After Stand (or any settle) it stays disabled while the dealer
  is still drawing and flipping and comes back only once the reveal has fired;
  betting mid-draw used to wipe a round that was still being played out.
* **The deal is one card at a time, chained on the flip.** A card flies for
  `DEAL_FLIGHT_MS` (400 ms) and then deal-flips for `DEAL_FLIP_MS` (420 ms);
  the NEXT card starts moving on the very frame that flip begins
  (`DEAL_STEP_MS = DEAL_FLIGHT_MS`), so a card's flip always runs while the
  next card is already on its way — never partway through the flip, never
  after it. The opening deal is therefore P0 [0,400] → D0 [400,800] →
  P1 [800,1200] → D1 [1200,1600], each starting exactly when the previous
  card's flip starts.
* **A hand is a centred group.** `handLayout()` in `Blackjack.jsx` seats card
  i at `(x0 + i·overlapX, y0 + i·overlapY)` with the group centred in its fan
  on BOTH axes, so a hand of n cards sits dead centre whatever n is. When a
  card is added the hand's layout count steps up at that card's flight start:
  the cards already on the table glide half a cascade step **left and up**
  (`.cardSlot` transitions the transform over `--bj-shift` = one flight) while
  the new card travels to the seat that completes the group, and the two
  arrive together. The card on its way is already seated where it will land,
  so the step never moves it.
* **The total label tracks the hand.** It is anchored by its own right and
  bottom edges to the layout: right edge on the LAST (most recently added)
  card's right edge, bottom edge on the FIRST card's top edge — the cards sit
  directly beneath it, no gap. Because both offsets come from the same layout
  and transition over the same one-flight duration, the label travels with the
  hand (up and to the right as it grows) instead of being centred over it.
* **The total label appears with the FIRST card.** It counts cards the moment
  they LAND (never waiting for the flip): on the opening deal the pill is up
  as soon as card #1 finishes its flight, showing the single-card total while
  standing at the ONE-card alignment (right edge on that card, bottom edge on
  its top edge) — not pre-positioned at the two-card layout. When card #2
  starts flying, the label glides with the hand's re-centring glide into the
  two-card layout and counts the second card the instant it lands; it updates
  live on every later card the same way. The dealer's pill follows the same
  rule, except its face-down hole card only joins the total when the reveal
  turns it over. After a split, each new hand carries its card as already
  counted and counts its fresh card on landing. In other words the label
  updates the instant a card's MOVEMENT finishes arriving — never after its
  flip.
* **The table's vertical bands are symmetric, always.** The gap below the
  player's rightmost card and the gap above the dealer's total label are ONE
  shared number in every state and hand configuration (`tableVerticalGap` in
  `Blackjack.jsx`): each side's centred gap is computed, the tightest one
  (never below a small minimum) is applied to both outer edges, so the dealer
  block hangs top-banded and every player hand bottom-banded. The dealer pill
  is therefore TOP-anchored (its inline `top` is the shared band; its bottom
  edge still lands exactly on the first card's top), while the player pill
  keeps its bottom anchor.
* **The deal flies in on a flattened diagonal.** The deck-to-seat vector is
  scaled by `DEAL_FLATTEN_X = 1.4` / `DEAL_FLATTEN_Y = 0.45` — less than half
  the vertical drop, 40% more horizontal run — so each card reads as a mostly
  horizontal slide with a slight vertical component instead of the old steep
  dive.
* **The "Blackjack pays 3:2, Insurance pays 2:1" sign is table art, not a
  gameplay layer.** It carries the lowest z-index of the table (`z-index: 1`)
  while the dealer and player areas stack above it (`z-index: 2`, deck 10,
  popup 5) — cards never render underneath it.
* **Phones get a slightly taller table** (`min-height: 620px` on the stage at
  ≤900px).
* **Card geometry has one source of truth.** `blackjack.module.css` declares
  `--bj-card-w/h`, `--bj-overlap-x/y`, `--bj-rank-size`, `--bj-suit-size` and
  `--bj-shift`; `Blackjack.jsx` reads them with `getComputedStyle` for the fan
  seats, the deck-origin flight vectors and the label's anchors. Phones step
  the whole set down a size (≤600 px, then ≤420 px) — cards, cascade, rank and
  suit together.

### Slide & Hilo (scaffolding shells)

Both new games are registered end to end but are **not playable yet** —
pure scaffolding, so they exist in the lobby and on their own pages while the
real boards are built:

* **Backend:** the seed in `config/database.js` adds `slide` and `hilo` to the
  `games` table, so `GET /api/games` lists them, their pages open and the admin
  panel switches them like any other game. `POST /api/games/slide/play` and
  `/hilo/play` are registered behind the usual auth / maintenance middleware
  but always answer **501** — no engine, no RNG, no bet resolution, nothing
  touching a balance.
* **Frontend:** `components/games/Slide.jsx` and `Hilo.jsx` render the
  standard shell — the shared sidebar betting panel (bet amount with ½ / 2×,
  the Bet button on `.ui-bet-wrap`, the read-only profit readout, the
  lock badge when disabled) plus an info stage carrying the game's
  description and a "coming soon" notice. A valid Bet runs the standard
  validation and stops at that notice — it never calls the API, never moves
  the balance, never starts a round. Both games are wired into the games-page
  router / poster map / info copy, the home page and the side rail, with
  their own generated posters.
* `npm run test:http` asserts the registration and the 501 contract over real
  HTTP; the site-ui suite's §11 asserts the shells (standard panel, lock-down,
  truthful stage, no fake round).

## Database persistence — how it works

**Nothing in the database is ever reset by a restart.** Users, balances, rounds,
which games/pages are enabled, and the admin settings all live in one SQLite
file, and every startup path is non-destructive:

- **The file lives outside the project folder by default**, so updating the
  code, re-cloning, downloading a fresh ZIP or `git pull` can never delete it:

  | OS      | Location                                                   |
  |---------|------------------------------------------------------------|
  | Windows | `%APPDATA%\casino-website\casino.db`                       |
  | macOS   | `~/Library/Application Support/casino-website/casino.db`   |
  | Linux   | `~/.local/share/casino-website/casino.db`                  |

  The backend prints the exact path in its startup banner, together with a
  `📊 Persisted state: N user(s), … (X disabled)` line so you can verify
  after every restart that the same data was loaded.
- **Seeds only add what is missing** (`CREATE TABLE IF NOT EXISTS`,
  `INSERT OR IGNORE`). Disabling a game or a page, or changing a setting in
  the admin panel, is kept forever — the defaults in `classifiedConfig.js`
  are only used the very first time.
- **Crash-safe writes**: WAL journal + `synchronous=FULL`, and every way the
  process can stop (Ctrl+C, SIGTERM from a process manager / container,
  nodemon restarts, fatal errors) flushes and closes the database first.
- **Rolling backups**: `backups/casino-<timestamp>.db` next to the database,
  every 6 hours (keeps the last 14). If the live file ever goes missing the
  newest backup is restored automatically on the next start.
- **Automatic migration**: the first start with the new location copies an
  existing `backend/casino.db` from an older version, so nothing is lost when
  you upgrade. Uploaded custom-bet images move alongside it (`uploads/`).

### Configuration (`backend/.env`)

```ini
OWNER_EMAIL=            # login email of the owner/admin account
OWNER_PASSWORD=         # its login password (plain text here; stored hashed in the DB)
DATABASE_PATH=          # empty = the per-user location above
DATA_DIR=               # or: a folder for casino.db + backups/ + uploads/
DATABASE_BACKUP_INTERVAL_HOURS=6
DATABASE_BACKUP_KEEP=14
```

**The owner account follows `.env`.** It is created on first initialization, and
on every backend start the stored owner email/password are compared against
`OWNER_EMAIL` / `OWNER_PASSWORD` — anything that differs is synced (the password
is re-hashed; empty values are ignored). This means if you ever change the
owner credentials in `.env`, just restart the backend and log in with the new
values — no re-init needed.

`DATABASE_PATH` may be absolute or relative to `backend/` (never to the shell's
working directory, so it does not matter how the server is launched).

### Hosting providers (Render, Railway, Fly, Docker …)

Their default filesystem is **ephemeral** — it is wiped on every deploy and
often on every restart, and no application code can survive that. Mount a
persistent disk/volume and point the backend at it:

```ini
DATA_DIR=/var/data      # e.g. a Render disk mounted at /var/data
```

### Upgrading from an older checkout

Older versions kept `backend/casino.db` **inside the repository and tracked it in
git**, which is exactly what overwrote live data on every pull / re-download.
Before pulling this version, copy `backend/casino.db` (plus `-wal`/`-shm` if
present) somewhere safe. After pulling, either leave it at `backend/casino.db`
(it is migrated automatically on first start) or put it at the new location.
Make sure `backend/casino.db*` is no longer tracked: `git rm --cached backend/casino.db*`.
