# Frontend duplicate-element audit

Scope: every duplicated UI element found in the frontend audit, and what happened
to it. Shared implementations live in `frontend/src/components/common/` and
`frontend/src/styles/global.css`; game modules keep only game-specific layout.

Validation: `npm run build` + `npm test` (crash-board 104 checks, site-ui 416
checks) all pass after the migration.

## 1. Shared components (the single source of truth)

| Component | Replaces |
| --- | --- |
| `common/SidebarControls.jsx` (`SidebarField`, `BetAmountField`, `SidebarReadOnlyField`, `SidebarSelectField`, `SidebarModeToggle`, `SidebarBetButton`, `SidebarActionButton`) | Per-game bet input + ½/2× adjusters + inline `BetError` block, readonly profit fields, difficulty/segment selects, Manual/Auto toggles, bet/secondary/cashout buttons, icon action buttons (Hit/Stand/Split/Double/Heads/Tails/RPS choices) |
| `common/GameWinPopup.jsx` | Per-game win popups (`resultPopup`, `winPopup`, roulette/RussianRoulette/Snakes/Tower/Wheel/Keno/Dice/Limbo/Flip/Blackjack variants) |
| `common/HistoryPills.jsx` (+ `hooks/usePillSlide`, `hooks/usePillFadeOut`) | Per-game history pill rows in Crash, Dice, Limbo, Wheel (row, scroller, pill list, placeholder, My-bets marker, arrival slide, outgoing-pill fade) |
| `common/HoverStatField.jsx` | Hover-panel readonly stat fields (Payout / Profit on Win / Chance) in Keno, Plinko, Wheel, Snakes |

Shared class surfaces in `global.css`: `sidebar-*` (fields, selects, mode
toggle, bet button + `--cashout` variant, secondary button), `ui-action-*`
(action buttons, icon mask pipeline, markers), `ui-win-popup*`, `ui-history-*` /
`ui-hist-*`, `ui-hover-*`, `ui-modal-*`, balance-dropdown tokens.

## 2. Per-game JSX duplicates migrated (all 15 game components)

- Bet amount field + quick adjusters + inline validation → `BetAmountField`.
- Profit-on-win / totals readouts (Crash, Dice, Limbo, Mines, Tower, Flip,
  Blackjack, Slide, Hilo, Roulette, RPS) → `SidebarReadOnlyField`.
- Manual/Auto toggle markup → `SidebarModeToggle`.
- Bet button markup (incl. `betButton`/`bigButton` variants) → `SidebarBetButton`
  with `variant` (`primary` / `secondary` / `cashout`).
- Secondary actions (Random Pick, Clear Table, Roll, Continue, Cashout, End
  Animation/Stop, Place Shot Bet, Shoot) → `SidebarBetButton` variants.
- Icon actions (Blackjack Hit/Stand/Split/Double, Flip Heads/Tails, RPS choices,
  insurance choices) → `SidebarActionButton` (mask icons + marker dots).
- Win popups → `GameWinPopup`.
- History rows (Crash, Dice, Limbo, Wheel) → `HistoryPills`.
- Hover stat panels (Keno, Plinko, Wheel, Snakes) → `HoverStatField`.

## 3. CSS duplicates removed (dead after migration)

Wrapper classes that only re-composed a `global.css` class, or styled markup the
shared components replaced. Removed from every game module:

- **Mode toggle:** `.modeToggle`, `.modeBtn`, `.active`.
- **Sidebar controls:** `.controlGroup`, `.labelRow`, `.inputGroup`,
  `.inputWrapper`, `.splitButtons`, `.divider`, `.btcIcon`, `.btcChip`,
  `.coinChip`, `.coinChipSmall`, `.coinIcon`, `.readonlyInput`, `.hasCaret`,
  `.currency`, `.select`, `.controlsHeader`.
- **Buttons:** `.betButton`, `.bigButton`, `.cashoutBtn` (+`:hover`), `.stopBtn`,
  `.rollButton`, `.cashoutButton`, `.btnGhost`, `.btnGo`, `.continueBtn`,
  `.secondaryButton`, `.betInputLike`, `.betInputRow`.
- **Action-icon pipeline:** `.actionButton`, `.actionIcon`, `.actionHit`,
  `.actionStand`, `.actionSplit`, `.actionDouble`, `.choiceSmallIcon`,
  `.choiceSmallActive`, `.activeSide`, `.textSide`, `.dotHeads`, `.dotTails`.
- **Win popups:** `.winPopup`, `.winPopupTitle`, `.winPopupAmount`,
  `.winPopupMult`, `.winPopupDivider` (+ mobile rules).
- **Local modal chrome** (superseded by `common/Modal`): `.modalOverlay`,
  `.modalCard`, `.modalTitle`, `.bucketModalCard`, `.bucketModalOverlay`,
  `.bucketModalTitle`, `.mobileBlocker`, `.mobileBlockerCard`.
- **History rows:** per-game `.historyScroll`, `.historyPills`, `.histPill`
  wrappers (Crash's local row) — the shared `ui-history-*` row owns the markup.
- **Hover stat fields:** `.hoverBox`, `.hoverLabel`, `.hoverField`,
  `.hoverInput`, `.hoverSuffix`, `.hoverSuffixGem` (+ `bucketHover*`,
  `wheelHover*` wrappers) — shared `ui-hover-*` + `HoverStatField`.
- **Profit/readonly fills:** `.profitInput`, `.moneyValue`, `.readonlyMoney`,
  `.playerHistoryBase`.
- **Pre-existing dead code found by the audit:** `.bulletPoint`, `.slotTop`
  (RussianRoulette), `.hitCellActive` (Keno), `.smallMuted` (RussianRoulette),
  `.hoverField` media leftover (Wheel).

Per-module removal counts: RPS 16, Snakes 12, Blackjack 15, Dice 15, Flip 17,
Hilo 11, Keno 16, Limbo 8, Mines 15, Plinko 15, Roulette 8, Slide 11, Tower 12,
Wheel 16, RussianRoulette 3, Crash 10 (plus earlier migration line drops in the
JSX/CSS diffs).

## 4. Deliberately retained local classes (not duplicates)

- Game layout/animation CSS (blackjack fans/cards, crash chart, plinko buckets,
  roulette wheel/pockets/chips, snake board, tower grid, dice slider, …).
- Roulette's vertical history **ball stack** (`.historyStack`, `.histBall`,
  `.histColor_*`, `.historyCol`, `.historyLabel`) — a different widget from the
  pills row, still Roulette-specific.
- Roulette `resultColor_*`, RussianRoulette player slot `p0..p4` (dynamic
  `styles[...]` lookups).
- Crash `btnMult` (live multiplier inside the shared bet button) and the board
  classes pinned by the crash-board suite.
- Blackjack `insuranceOffer/insuranceHint/insuranceChoice`,
  `handWrapActive/totalActive`, `cardSplitMove/totalSplitMove` (new feature UI).

## 5. Styling/behaviour duplicates resolved elsewhere

- **BalanceBox dropdown:** surface/border/divider/skeleton colors moved to
  `--color-balance-dropdown-*` tokens in `global.css`; the amount side keeps the
  canonical `--color-balance-box-bg` (#102230) and the wallet keeps
  `--color-balance-wallet-bg` (#2874E1).
- **Action colors:** one token pair (`--color-action-hit` #ff9d00,
  `--color-action-stand` #9000ff, `--color-action-heads` #fca311,
  `--color-action-tails` #3b82f6) feeds every icon/marker through
  `SidebarActionButton`'s `iconColor`/`markerColor`.
- **Toast-only connection errors:** Crash bet/cashout and Wheel layout/spin now
  report connection failures exclusively through the shared toast system (no
  inline red error banner); Wheel's duplicated error banner was removed.
- **Tests:** crash-board and site-ui hooks/assertions were re-pointed at the
  shared surfaces (`.sidebar-bet-button`, `.ui-win-popup`, `.ui-history-*`,
  `.sidebar-readonly-input`, `HistoryPills.jsx` source contracts) — same
  behaviour checks, no duplicated implementation hooks left in production CSS.
