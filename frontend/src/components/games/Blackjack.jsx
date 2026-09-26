import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import useActiveBetFlag from "../../hooks/useActiveBetFlag";
import useGameDisabled from "../../hooks/useGameDisabled";
import BetLockBadge from "../common/BetLockBadge";
import DisabledGameStage from "./DisabledGameStage";
import BetError from "../common/BetError";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import styles from "./blackjack.module.css";

import paysSvg from "../../assets/blackjack/background.svg";
import cardBackSvg from "../../assets/blackjack/cardback.svg";

import heartsSvg from "../../assets/blackjack/hearts.svg";
import spadesSvg from "../../assets/blackjack/spades.svg";
import clubsSvg from "../../assets/blackjack/clubs.svg";
import diamondsSvg from "../../assets/blackjack/diamonds.svg";

// Action icons
import hitSvg from "../../assets/blackjack/Hit.svg";
import standSvg from "../../assets/blackjack/Stand.svg";
import splitSvg from "../../assets/blackjack/Split.svg";
import doubleSvg from "../../assets/blackjack/Double.svg";

// simple deck image
import deckEntityPng from "../../assets/blackjack/deckentity.png";

// ✅ Sounds
import cardMp3 from "../../assets/blackjack/Card.mp3";
import winMp3 from "../../assets/blackjack/Win.mp3";
import loseWav from "../../assets/blackjack/Lose.wav";
import flipMp3 from "../../assets/blackjack/Flip.mp3";

import useGameAudio from "../../hooks/useGameAudio";
import CurrencyIcon from "../common/CurrencyIcon";

const BJ_START_URL = "/api/games/blackjack/start";
const BJ_ACTION_URL = "/api/games/blackjack/action";

// animation timings (match CSS)
const DEAL_FLIGHT_MS = 400; // one card's flight, deck -> seat (dealIn)
// ONE card at a time, chained on the FLIP: the next card starts moving the
// instant the previous card ARRIVES and its deal-flip begins — not partway
// through that flip, not after it. A step is therefore exactly one flight:
//   P0 flies [0,400] → flip [400,820]   |  D0 flies [400,800] → flip [800,1220]
//   D0 starts at 400 = the moment P0's flip begins, and so on for every card.
// (Each card's flip therefore runs while the NEXT card is already on its way.)
const DEAL_STEP_MS = DEAL_FLIGHT_MS;
const DEAL_EXTRA_MS = 150; // lead-in before mid-round cards (hits, draws)
const DEAL_FLIP_MS = 420; // post-flight flip (dealFlipIn)
const FLIP_MS = 750; // hole-card reveal flip (flipWrap transition)
// Two frames of grace after a flip-based wait: the settled styling must land
// once the card is FULLY face-up — never on the flip's last frame.
const REVEAL_GRACE_MS = 40;
// Exit flight (new bet): one card's out-animation (cardOut) + the
// left-to-right stagger between the cards of a single hand
const EXIT_MS = 200;
const EXIT_STAGGER_MS = 100;

// Card geometry — the LIVE numbers are read from the CSS custom properties
// on the stage (--bj-card-w/h, --bj-overlap-x/y) so the fan seats AND the
// deck-origin math below can never drift from blackjack.module.css at any
// responsive size (phones shrink the cards). These are only the fallbacks
// for the very first paint, before the first measurement lands.
const CARD_GEOM_FALLBACK = { w: 114, h: 186, overlapX: 39, overlapY: 15 };

const readCardGeom = (stage) => {
  if (!stage?.ownerDocument?.defaultView?.getComputedStyle) return CARD_GEOM_FALLBACK;
  const cs = stage.ownerDocument.defaultView.getComputedStyle(stage);
  const num = (name, fallback) => {
    const v = Number.parseFloat(cs.getPropertyValue(name));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };
  return {
    w: num("--bj-card-w", CARD_GEOM_FALLBACK.w),
    h: num("--bj-card-h", CARD_GEOM_FALLBACK.h),
    overlapX: num("--bj-overlap-x", CARD_GEOM_FALLBACK.overlapX),
    overlapY: num("--bj-overlap-y", CARD_GEOM_FALLBACK.overlapY),
  };
};

// Deal-trajectory shaping: the raw vector runs deck-centre -> seat. The
// vertical component is kept under half and the horizontal one stretched, so
// every card reads as a mostly-horizontal slide with a slight vertical drop
// instead of the old steep ~45-degree diagonal. Touch ONLY these two numbers
// to retune the angle — see dealFromVars().
const DEAL_FLATTEN_X = 1.4;
const DEAL_FLATTEN_Y = 0.45;

// The total label's height (24px in blackjack.module.css); the DOM-measured
// value wins when one exists (measureDealGeom).
const LABEL_H_FALLBACK = 24;
// The shared outer gap never collapses below this, whatever the hand sizes.
const VGAP_MIN = 4;

// Sequential deal order: P0, D0, P1, D1 — one card flies at a time.
// Mid-round cards (hits, splits, dealer draws) use a short lead-in.
function dealerDealDelay(i) {
  if (i < 2) return (1 + i * 2) * DEAL_STEP_MS;
  return DEAL_EXTRA_MS + (i - 2) * DEAL_STEP_MS;
}

function playerDealDelay(handIdx, i) {
  if (handIdx === 0 && i < 2) return i * 2 * DEAL_STEP_MS;
  if (handIdx === 0) return DEAL_EXTRA_MS;
  return DEAL_EXTRA_MS + handIdx * DEAL_STEP_MS;
}

// ── Hand layout: the ONE place a hand's geometry is defined ────────────────
// A hand is a single GROUP: `count` cards, card i seated at
//   (x0 + i·overlapX, y0 + i·overlapY)
// with the group centred in its fan BOTH ways. Growing the group from n to
// n+1 cards therefore moves the cards already on the table half a cascade
// step LEFT and half a step UP while the incoming card flies to the seat that
// completes the group — one motion, starting the moment that card starts
// moving (see planHandLayouts + the .cardSlot transition in the stylesheet).
// The total label hangs off the same numbers: its right edge on the LAST
// card's right edge, its bottom edge on the FIRST card's top edge (the cards
// sit directly beneath it, no gap), so it travels with the hand for free.
// The full span a hand of `count` cards occupies (card + cascade steps).
const handSpan = (geom, count) => {
  const g = geom ?? CARD_GEOM_FALLBACK;
  const n = Math.max(1, count || 1);
  return { w: g.w + (n - 1) * g.overlapX, h: g.h + (n - 1) * g.overlapY };
};

// ONE outer gap for the whole table, in every state / hand configuration:
// the band above the dealer's total label and the band below every player
// hand's last card are always the same number. Each side's "centred" gap is
// what plain vertical centring would give it; the table takes the TIGHTEST
// of those (never below VGAP_MIN) and applies it on BOTH outer edges — the
// tighter side stays exactly where centring put it, the looser side closes
// in to match, so the two bands are equal by construction.
function tableVerticalGap(geom, fanTopH, fanBottomH, dealerCards, playerCards, labelH) {
  const gaps = [];
  if (Number.isFinite(fanTopH)) {
    gaps.push((fanTopH - handSpan(geom, dealerCards).h) / 2 - labelH);
  }
  if (Number.isFinite(fanBottomH)) {
    const counts = playerCards?.length ? playerCards : [1];
    for (const c of counts) gaps.push((fanBottomH - handSpan(geom, c).h) / 2);
  }
  if (!gaps.length) return VGAP_MIN;
  return Math.max(VGAP_MIN, Math.min(...gaps));
}

function handLayout(geom, fan, count, y0Override) {
  const g = geom ?? CARD_GEOM_FALLBACK;
  const n = Math.max(1, count || 1);
  const stepsX = (n - 1) * g.overlapX;
  const stepsY = (n - 1) * g.overlapY;
  const width = g.w + stepsX;
  const height = g.h + stepsY;
  const fanW = Number.isFinite(fan?.w) ? fan.w : width;
  const fanH = Number.isFinite(fan?.h) ? fan.h : height;
  const x0 = (fanW - width) / 2;
  const y0 = Number.isFinite(y0Override) ? y0Override : (fanH - height) / 2;
  return {
    n,
    x0,
    y0,
    width,
    height,
    seatX: (i) => x0 + i * g.overlapX,
    seatY: (i) => y0 + i * g.overlapY,
    // the label, as CSS offsets from the fan's right / bottom edge
    labelRight: fanW - (x0 + width),
    labelBottom: fanH - y0,
  };
}

// The layout a card is RENDERED in: the hand's own count, except that a card
// still on its way (its index is not counted yet) is already seated where it
// will LAND — so the group re-centres UNDER it and it never jumps when the
// hand steps up to include it.
const cardLayout = (geom, fan, count, index, y0Of) => {
  const n = index + 1 > count ? index + 1 : count;
  return handLayout(geom, fan, n, y0Of ? y0Of(n) : undefined);
};

// HOW THE DEAL SOURCE POSITION WORKS (step-by-step):
//  1. stageRef/deckRef/fanTopRef/fanBottomRefs mark the stage, the deck
//     entity, and each fan; measureDealGeom() snapshots their rects
//     relative to the stage (on mount, every new round, every split — a new
//     fan mounts — and every window resize).
//  2. Each card seat is pure math (handLayout): the group centred in its fan
//     + index * overlap — the same numbers Card renders with, so seats are
//     exact by construction.
//  3. dealFromVars() returns the flight's start vector: deck-centre minus
//     seat top-left, with the vertical component scaled down and the
//     horizontal one scaled up (DEAL_FLATTEN_*) — a flattened diagonal.
//  4. The vector rides to CSS as --deal-from-x/--deal-from-y on .cardMotion;
//     the dealIn keyframes translate from it (falling back to the old
//     230/-270px constants before the first measurement lands).
// TO RETUNE: touch ONLY DEAL_FLATTEN_X/Y above — smaller Y flattens the
// drop, bigger X stretches the horizontal run, for every card at once.
function dealFromVars(dealGeom, fanGeom, index) {
  if (!dealGeom || !fanGeom) return undefined;
  const geom = dealGeom.geom ?? CARD_GEOM_FALLBACK;
  // the seat the card lands on = the hand's layout the moment it arrives
  // (its own index counts it — see cardLayout)
  const lay = handLayout(geom, fanGeom, index + 1);
  const seatX = fanGeom.x + lay.seatX(index);
  const seatY = fanGeom.y + lay.seatY(index);
  const deckCx = dealGeom.deck.x + dealGeom.deck.w / 2;
  const deckCy = dealGeom.deck.y + dealGeom.deck.h / 2;
  // scaled, not nudged: less vertical drop, more horizontal run (flattened
  // diagonal — see DEAL_FLATTEN_*)
  const fromX = Math.round((deckCx - geom.w / 2 - seatX) * DEAL_FLATTEN_X);
  const fromY = Math.round((deckCy - geom.h / 2 - seatY) * DEAL_FLATTEN_Y);
  return { "--deal-from-x": `${fromX}px`, "--deal-from-y": `${fromY}px` };
}

function isRedSuit(s) {
  return s === "hearts" || s === "diamonds";
}

function suitIconSrc(s) {
  if (s === "spades") return spadesSvg;
  if (s === "hearts") return heartsSvg;
  if (s === "diamonds") return diamondsSvg;
  return clubsSvg;
}

function toUiCard(c) {
  if (!c) return null;
  if (c.hidden) return { hidden: true };
  return {
    id: c.id,
    r: c.r ?? c.rank ?? c.value,
    s: c.s ?? c.suit,
    hidden: false,
  };
}

function cardKey(c, i) {
  if (!c) return `x-${i}`;
  if (c.hidden) return `hidden-${i}`;
  return c.id ?? `${c.r}-${c.s}-${i}`;
}

function summarizeResult(handOutcomes, totalPayout) {
  const outs = handOutcomes || [];
  if (outs.some((o) => o === "win")) return { status: "win", payout: totalPayout };
  if (outs.length > 0 && outs.every((o) => o === "push")) return { status: "push", payout: totalPayout };
  return { status: "lose", payout: 0 };
}

function sum(arr) {
  return (arr || []).reduce((a, b) => a + (Number(b) || 0), 0);
}

function rankValue(r) {
  if (r === "A") return 11;
  if (["K", "Q", "J"].includes(r)) return 10;
  const n = Number(r);
  return Number.isFinite(n) ? n : 0;
}

function handTotalUi(hand) {
  let total = 0;
  let aces = 0;

  for (const c of hand || []) {
    total += rankValue(c?.r);
    if (c?.r === "A") aces += 1;
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }

  return total;
}

// Pill text for a hand. Soft hands (an ace that can still count as 11)
// ALWAYS show BOTH totals — e.g. A+5 renders "6, 16".
function handTotalDisplay(hand) {
  const cards = hand || [];
  let low = 0;
  let aces = 0;

  for (const c of cards) {
    if (c?.r === "A") {
      aces += 1;
      low += 1;
    } else {
      low += rankValue(c?.r);
    }
  }

  const high = aces > 0 ? low + 10 : low;

  if (aces > 0 && cards.length > 1 && high <= 21) {
    return `${low}, ${high}`;
  }

  return `${high <= 21 ? high : low}`;
}

export default function Blackjack({ gameRow, soundEnabled = true, soundVolume = 0.8 }) {
  const auth = useAuth();
  const { user, isAuthenticated, openLoginModal, updateBalance } = auth;
  const toast = useToast();

  const sfx = useGameAudio(
    {
      card: cardMp3,
      win: winMp3,
      lose: loseWav,
      flip: flipMp3,
    },
    { enabled: soundEnabled, volume: soundVolume }
  );

  const [betAmount, setBetAmount] = useState("");
  const { isDisabled, isMobileDisabled, isLocked, disabledTitle, disabledDesc, betErrorMessage } = useGameDisabled(gameRow);
  const [betLockedError, setBetLockedError] = useState("");
  useEffect(() => {
    if (isLocked && String(betAmount).trim() !== "") setBetLockedError(betErrorMessage);
    else setBetLockedError("");
  }, [betAmount, isLocked, betErrorMessage]);

  const [betError, setBetError] = useState(null);

  // inline bet errors clear themselves as soon as they are resolved

  useEffect(() => {

    setBetError((cur) => {

      if (!cur) return cur;

      if (cur === "Log in to place a bet") return isAuthenticated ? null : cur;

      const amt = parseFloat(betAmount) || 0;

      return amt > 0 && amt <= (user?.balance ?? 0) ? null : cur;

    });

  }, [betAmount, isAuthenticated, user?.balance]);
  const revealTimerRef = useRef(null);
  // the single "turn the dealt hole card over" timer (own ref: the totals
  // pass clears its own list and must not swallow this one)
  const holeRevealTimerRef = useRef(null);
  const dealerTotalTimersRef = useRef([]);
  const playerTotalTimersRef = useRef([]);
  // one timer per card that still has to START FLYING: each one steps its
  // hand's layout up so the re-centre glide begins with that card's movement
  // (see planHandLayouts)
  const layoutTimersRef = useRef([]);

  // ✅ Card deal sound timers (initial deal)
  const dealSoundTimersRef = useRef([]);

  // ✅ Dealer draw/flip sound timers (after stand / settlement)
  const dealerSoundTimersRef = useRef([]);

  const [ui, setUi] = useState(() => ({
    phase: "idle", // idle | playerTurn | settled
    roundId: null,

    dealer: [],
    playerHands: [[]],
    activeHandIndex: 0,

    handTotals: [],
    handBets: [],
    handOutcomes: [],

    // how many dealer cards the pill counts (the count-up steps it; a
    // face-down hole card joins only once it has been turned over)
    dealerShownCount: 0,
    dealerTotal: 0,
    // per-hand count of cards the player's total label counts. A card joins
    // the moment it LANDS (its flight ends) — the pill is up and showing the
    // card the instant it is on the table, never waiting for its flip: on
    // the opening deal it therefore appears with the FIRST card's one-card
    // total, and updates as each further card arrives.
    playerLandedCounts: [],

    // Is the dealer's hole card allowed to show its face? Always true
    // except while a DEALT blackjack replays its reveal: the hole lands
    // face-down with the rest of the deal and only turns over once it has
    // arrived (see applyServerState / holeReveal).
    holeUp: true,

    // How many cards each hand is LAID OUT for right now (the dealer's hands
    // plus one entry per player hand). A hand grows the moment a new card
    // starts flying — the cards already down glide left+up to re-centre the
    // group under it, and the total label glides with them (see handLayout
    // and planHandLayouts).
    handLayouts: { dealer: 1, hands: [1] },

    settled: false,
    payout: 0,

    busy: false,

    showResult: false,
    resultStatus: null, // "win" | "lose" | "push"
    resultPayout: 0,
    pendingOutcomes: null,
    pendingPayout: 0,

    // exit snapshot while a new bet clears the table (null otherwise)
    exiting: null,
    // settle-only shift (ms) delaying the WHOLE dealer turn so it starts
    // as its own phase when the player's new card arrives (double-down)
    dealerShiftMs: 0,
  }));

  // ---- Deal-origin geometry (see dealFromVars() above for the guide) ----
  const stageRef = useRef(null);
  const deckRef = useRef(null);
  const fanTopRef = useRef(null);
  const fanBottomRefs = useRef([]);
  const [dealGeom, setDealGeom] = useState(null);

  const measureDealGeom = () => {
    const stage = stageRef.current;
    const deck = deckRef.current;
    const fanTop = fanTopRef.current;
    if (!stage || !deck || !fanTop) return;
    const s = stage.getBoundingClientRect();
    const rel = (el) => {
      const b = el.getBoundingClientRect();
      return { x: b.left - s.left, y: b.top - s.top, w: b.width, h: b.height };
    };
    setDealGeom({
      deck: rel(deck),
      fanTop: rel(fanTop),
      fansBottom: fanBottomRefs.current.filter(Boolean).map(rel),
      // live card size + cascade steps (CSS custom properties, see
      // blackjack.module.css) — measured with the rects so the seats and the
      // flight vectors always agree with what is actually on screen
      geom: readCardGeom(stage),
      // the total label's own height — the symmetry gap is measured to ITS
      // top edge; 0 in layout-less environments -> LABEL_H_FALLBACK
      labelH: stage.querySelector("[data-dealer-pill]")?.offsetHeight || 0,
    });
  };

  // Fans + deck are always mounted (even with no cards), so the initial
  // deal already has exact vectors; splits mount a new fan (playerHands
  // grows) and mid-round cards all carry 150ms+ delays, so the re-measure
  // always lands before their flights start.
  useLayoutEffect(() => {
    measureDealGeom();
    window.addEventListener("resize", measureDealGeom);
    return () => window.removeEventListener("resize", measureDealGeom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.roundId, ui.playerHands.length]);

  const bet = useMemo(() => Number.parseFloat(betAmount) || 0, [betAmount]);

  // The bet button is armed by the ROUND being over for the eye, not by the
  // response having landed: after a Stand (and after every other settle) the
  // dealer's cards are still flying and flipping and the result is not on
  // screen yet, so the button stays disabled until the reveal has fired —
  // only then may a new bet be placed. (Betting mid-dealer-draw also let a
  // new deal wipe the cards while the old round was still being drawn.)
  const revealDone = ui.showResult;
  const canDeal = !ui.busy && (ui.phase === "idle" || (ui.phase === "settled" && revealDone));
  const canAct = !ui.busy && ui.phase === "playerTurn" && !ui.settled;

  // exit render: while a new bet clears the table, both areas render the
  // frozen snapshot (exiting) instead of the live hands
  const exiting = ui.exiting;
  const shownDealer = exiting ? exiting.dealer ?? [] : ui.dealer;
  const shownHands = exiting ? exiting.playerHands ?? [[]] : ui.playerHands;

  // Live card size + cascade steps (measured from the CSS custom properties,
  // see readCardGeom) — the seats, the deal-origin vectors and the total
  // label all use exactly these numbers (see handLayout).
  const cardGeom = dealGeom?.geom ?? CARD_GEOM_FALLBACK;

  // How many cards each hand is laid out for RIGHT NOW (see planHandLayouts).
  // Clamped to the cards actually on the table so a stale count can never seat
  // a card that is not there; the exit snapshot carries its own counts.
  const layoutCounts = exiting?.layouts ?? ui.handLayouts;
  const handCount = (hIdx, len) =>
    len ? Math.min(Math.max(1, Number(layoutCounts?.hands?.[hIdx]) || 1), len) : 1;
  const dealerCount = shownDealer.length
    ? Math.min(Math.max(1, Number(layoutCounts?.dealer) || 1), shownDealer.length)
    : 1;
  // The table's one shared outer gap (symmetry rule): the band above the
  // dealer label == the band below every player hand's last card, always.
  const labelH = dealGeom?.labelH > 0 ? dealGeom.labelH : LABEL_H_FALLBACK;
  const vGap = tableVerticalGap(
    cardGeom,
    dealGeom?.fanTop?.h,
    dealGeom?.fansBottom?.[0]?.h,
    dealerCount,
    shownHands.map((h, i) => handCount(i, h.length)),
    labelH
  );
  const dealerY0 = () => vGap + labelH;
  const playerY0 = (fanH) => (n) => fanH - vGap - handSpan(cardGeom, n).h;
  const dealerLay = handLayout(cardGeom, dealGeom?.fanTop, dealerCount, dealerY0());

  const activeHand = ui.playerHands?.[ui.activeHandIndex] ?? [];

  const canHit = canAct;
  const canStand = canAct;

  const canDouble =
    canAct &&
    activeHand.length === 2 &&
    (Number.isFinite(bet) ? (user?.balance ?? 0) >= bet : true);

  const canSplit =
    canAct &&
    activeHand.length === 2 &&
    activeHand?.[0]?.r &&
    activeHand?.[0]?.r === activeHand?.[1]?.r &&
    (Number.isFinite(bet) ? (user?.balance ?? 0) >= bet : true);

  const adjustBet = (mult) => {
    const curr = Number.parseFloat(betAmount) || 0;
    setBetAmount((curr * mult).toFixed(2));
  };

  const getAccessToken = () => {
    const ctxToken = auth?.accessToken || auth?.token || auth?.authToken || auth?.user?.accessToken;
    if (ctxToken) return ctxToken;

    return (
      localStorage.getItem("accessToken") ||
      localStorage.getItem("access_token") ||
      localStorage.getItem("token") ||
      ""
    );
  };

  const apiPost = async (url, body) => {
    const token = getAccessToken();

    if (!token) {
      openLoginModal?.();
      throw new Error("Please log in again");
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
      body: JSON.stringify(body ?? {}),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const msg = data?.message || `Request failed (${res.status})`;
      if (msg.toLowerCase().includes("access token required")) openLoginModal?.();
      throw new Error(msg);
    }

    if (!data) throw new Error("Empty response from server");
    return data;
  };

  const clearDealerTotalTimers = () => {
    dealerTotalTimersRef.current.forEach((t) => clearTimeout(t));
    dealerTotalTimersRef.current = [];
  };

  const clearPlayerTotalTimers = () => {
    playerTotalTimersRef.current.forEach((t) => clearTimeout(t));
    playerTotalTimersRef.current = [];
  };

  const clearLayoutTimers = () => {
    layoutTimersRef.current.forEach((t) => clearTimeout(t));
    layoutTimersRef.current = [];
  };

  // ── Hand re-centring ────────────────────────────────────────────────────
  // A hand grows when a new card STARTS FLYING, never when it lands: each
  // card beyond what the hand already lays out gets one timer at that card's
  // own flight start, which steps the hand's layout count up. The cards
  // already on the table are rendered from that count (see handLayout), so
  // they glide left+up into the re-centred group during exactly the time the
  // new card travels toward them — and the total label, hanging off the same
  // numbers, travels with them.
  // `ui` is the state BEFORE this response: a dealer draw or a hit leaves the
  // cards already down where they are and only the fresh ones step the hand up.
  const planHandLayouts = (gs, shiftMs, { initialDeal } = {}) => {
    const prevDealer = initialDeal ? 0 : (ui.dealer?.length ?? 0);
    const prevHands = initialDeal ? [] : (ui.playerHands ?? []);
    const dealerCards = (gs.dealerHand ?? []).length;
    const hands = gs.playerHands ?? [[]];

    const plan = (prevLen, len) => {
      if (!len) return { start: 0, steps: [] };
      const start = Math.min(Math.max(prevLen || 0, 1), len);
      const steps = [];
      for (let i = start; i < len; i++) steps.push(i);
      return { start, steps };
    };

    const dealerPlan = plan(prevDealer, dealerCards);
    const handPlans = hands.map((hand, hIdx) => plan(prevHands[hIdx]?.length ?? 0, hand?.length ?? 0));

    clearLayoutTimers();

    dealerPlan.steps.forEach((i) => {
      layoutTimersRef.current.push(
        setTimeout(() => {
          setUi((prev) => ({ ...prev, handLayouts: { ...prev.handLayouts, dealer: i + 1 } }));
        }, dealerDealDelay(i) + shiftMs)
      );
    });

    handPlans.forEach((p, hIdx) => {
      p.steps.forEach((i) => {
        layoutTimersRef.current.push(
          setTimeout(() => {
            setUi((prev) => {
              const counts = [...(prev.handLayouts?.hands ?? [])];
              counts[hIdx] = i + 1;
              return { ...prev, handLayouts: { ...prev.handLayouts, hands: counts } };
            });
          }, playerDealDelay(hIdx, i))
        );
      });
    });

    // the counts the FIRST render of this state uses: every hand that still
    // has cards keeps the layout it already had (it is only stepping up when
    // the next card moves); a fresh round starts at its first card
    return { dealer: dealerPlan.start, hands: handPlans.map((p) => p.start) };
  };

  // Steps a hand's total the instant a card LANDS (its flight ends). Never
  // counts a card that is still flying — and the pill appears with the first
  // card that lands, not with the second card of the deal.
  const schedulePlayerTotalStep = (handIdx, atMs, newCount) => {
    playerTotalTimersRef.current.push(
      setTimeout(() => {
        setUi((prev) => {
          const counts = [...(prev.playerLandedCounts ?? [])];
          counts[handIdx] = Math.max(counts[handIdx] ?? 0, newCount);
          return { ...prev, playerLandedCounts: counts };
        });
      }, atMs)
    );
  };

  // Initial deal: every card joins its label as it LANDS. The player's pill
  // therefore appears with the first card (one-card total) and counts the
  // second as it arrives; the dealer's pill appears the same way, but its
  // face-down hole card stays out of the total until the reveal turns it over
  // (see scheduleDealerTotalCountUp).
  const scheduleInitialTotalCountUps = (gs) => {
    clearDealerTotalTimers();
    clearPlayerTotalTimers();

    const p0 = (gs?.playerHands ?? [[]])[0]?.length ?? 0;
    for (let i = 0; i < p0; i++) {
      schedulePlayerTotalStep(0, playerDealDelay(0, i) + DEAL_FLIGHT_MS, i + 1);
    }

    const dealerCount = (gs?.dealerHand ?? []).length;
    if (dealerCount > 0) {
      dealerTotalTimersRef.current.push(
        setTimeout(() => {
          setUi((prev) => ({
            ...prev,
            dealerShownCount: Math.max(prev.dealerShownCount ?? 0, 1),
          }));
        }, dealerDealDelay(0) + DEAL_FLIGHT_MS)
      );
    }
  };

  const clearDealSoundTimers = () => {
    dealSoundTimersRef.current.forEach((t) => clearTimeout(t));
    dealSoundTimersRef.current = [];
  };

  const clearDealerSoundTimers = () => {
    dealerSoundTimersRef.current.forEach((t) => clearTimeout(t));
    dealerSoundTimersRef.current = [];
  };

  const scheduleDealSounds = (gs) => {
    clearDealSoundTimers();

    // one swish per card flight, in deal order (P0, D0, P1, D1, …)
    const hands = gs?.playerHands ?? [[]];
    const dealerCount = (gs?.dealerHand ?? []).length;
    const p0 = hands[0]?.length ?? 0;
    const delays = [];
    for (let i = 0; i < Math.max(p0, dealerCount); i++) {
      if (i < p0) delays.push(playerDealDelay(0, i));
      if (i < dealerCount) delays.push(dealerDealDelay(i));
    }
    for (let h = 1; h < hands.length; h++) {
      const n = hands[h]?.length ?? 0;
      for (let i = 0; i < n; i++) delays.push(playerDealDelay(h, i));
    }
    for (const d of delays) {
      dealSoundTimersRef.current.push(
        setTimeout(() => {
          sfx.play("card", { volume: 1 });
        }, d)
      );
    }
  };

  // holeRevealAt (ms): a DEALT blackjack whose hole card flips as part of the
  // initial deal. The deal's own card swishes are already scheduled by
  // scheduleDealSounds, so this only adds the flip — at the exact moment the
  // hole has landed and starts turning over.
  const scheduleDealerRevealSounds = ({ gs, hadHoleCardHidden, shift = 0, holeRevealAt = null }) => {
    clearDealerSoundTimers();

    const dealerCount = (gs?.dealerHand ?? []).length;

    if (holeRevealAt != null) {
      dealerSoundTimersRef.current.push(
        setTimeout(() => {
          sfx.play("flip", { volume: 1 });
        }, holeRevealAt)
      );

      for (let i = 2; i < dealerCount; i++) {
        dealerSoundTimersRef.current.push(
          setTimeout(() => {
            sfx.play("card", { volume: 1 });
          }, dealerDealDelay(i) + shift)
        );
      }

      return;
    }

    if (hadHoleCardHidden) {
      dealerSoundTimersRef.current.push(
        setTimeout(() => {
          sfx.play("flip", { volume: 1 });
        }, shift)
      );

      for (let i = 2; i < dealerCount; i++) {
        dealerSoundTimersRef.current.push(
          setTimeout(() => {
            sfx.play("card", { volume: 1 });
          }, dealerDealDelay(i) + shift)
        );
      }
    } else {
      for (let i = 1; i < dealerCount; i++) {
        const delay = i < 2 ? shift : dealerDealDelay(i) + shift;
        dealerSoundTimersRef.current.push(
          setTimeout(() => {
            sfx.play("card", { volume: 1 });
          }, delay)
        );
      }
    }
  };

  // holeRevealEnd (ms): end of a DEALT hole-card reveal (see scheduleReveal).
  // The second dealer card of a dealt blackjack joins the pill only then.
  const scheduleDealerTotalCountUp = ({ gs, hadHoleCardHidden, shift = 0, holeRevealEnd = 0 }) => {
    clearDealerTotalTimers();

    const dealer = (gs.dealerHand ?? []).map(toUiCard).filter(Boolean);
    if (dealer.length === 0) return;

    if (hadHoleCardHidden) {
      // the hole joins the total only once its reveal flip completes —
      // the pill must never show the full value while a card is face-down
      dealerTotalTimersRef.current.push(
        setTimeout(() => {
          setUi((prev) => ({
            ...prev,
            dealerShownCount: Math.min(2, dealer.length),
          }));
        }, FLIP_MS + shift)
      );

      for (let i = 2; i < dealer.length; i++) {
        // each draw joins the total as its flip completes (not on landing)
        const delay = dealerDealDelay(i) + DEAL_FLIGHT_MS + DEAL_FLIP_MS + shift;

        dealerTotalTimersRef.current.push(
          setTimeout(() => {
            setUi((prev) => ({
              ...prev,
              dealerShownCount: i + 1,
            }));
          }, delay)
        );
      }

      return;
    }

    for (let i = 1; i < dealer.length; i++) {
      // card #2 IS the hole card: it joins the pill only once it is face-up —
      // at the end of its reveal flip — never while it is still turning over.
      // Every other dealer card counts as it lands, like the player's.
      const delay = i < 2
        ? (holeRevealEnd || DEAL_EXTRA_MS + shift)
        : dealerDealDelay(i) + DEAL_FLIGHT_MS + shift;

      dealerTotalTimersRef.current.push(
        setTimeout(() => {
          setUi((prev) => ({
            ...prev,
            dealerShownCount: i + 1,
          }));
        }, delay)
      );
    }
  };

  const scheduleReveal = ({
    gs,
    outcomes,
    payout,
    hadHoleCardHidden,
    shift = 0,
    playerFlipEnd = null,
    holeRevealEnd = 0,
  }) => {
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }

    const { status, payout: summaryPayout } = summarizeResult(outcomes, payout);

    // the reveal waits for every card still animating: the hole flip, any
    // dealer draws flipping face-up one by one, a hole card revealed as part
    // of the INITIAL deal (a dealt blackjack) and — ONLY when this very
    // action dealt a player card (double-down) — that card's flip.
    // Outcomes land once all totals are final, but a settle with no new
    // player card (stand) never idles on a flip that doesn't exist.
    const dealerDraws = Math.max(0, (gs.dealerHand ?? []).length - 2);
    const drawEnd = dealerDraws > 0
      ? DEAL_EXTRA_MS + (dealerDraws - 1) * DEAL_STEP_MS + DEAL_FLIGHT_MS + DEAL_FLIP_MS + shift
      : 0;
    const playerNewEnd = playerFlipEnd ?? 0;

    // A reveal that ends on a CSS animation (the hole flip) gets a couple of
    // frames of grace: the settled colours/outlines must land AFTER the card
    // is fully face-up, never on its last frame.
    const flipWait = Math.max(hadHoleCardHidden ? FLIP_MS + shift : 0, holeRevealEnd);

    const delay = Math.max(flipWait, drawEnd, playerNewEnd) + REVEAL_GRACE_MS;

    revealTimerRef.current = setTimeout(() => {
      if (status === "win") sfx.play("win", { volume: 1 });
      else if (status === "lose") sfx.play("lose", { volume: 1 });

      setUi((prev) => ({
        ...prev,
        showResult: true,
        resultStatus: status,
        resultPayout: summaryPayout,
        handOutcomes: prev.pendingOutcomes ?? prev.handOutcomes,
      }));
      revealTimerRef.current = null;
    }, delay);
  };

  // dealerShiftMs delays the WHOLE dealer turn (hole, draws, sounds,
  // totals, reveal) so a double-down plays as its own phase starting the
  // instant the player's new card ARRIVES — never mushed with it, and
  // never gated on its flip. playerFlipEnd (ms) is set only when this
  // very action dealt a player card whose flip the reveal must await.
  // initialDeal marks the FIRST deal of a round (handleDeal): if that deal
  // already ended the round (a natural on either side) its hole card is
  // revealed right there, as part of the deal (see holeRevealAt below).
  const applyServerState = (data, { dealerShiftMs = 0, playerFlipEnd = null, initialDeal = false } = {}) => {
    const gs = data.gameState;
    if (!gs) throw new Error("Invalid server response (missing gameState)");

    if (typeof gs.balance === "number") updateBalance?.(gs.balance);

    const settled = gs.status === "finished";

    const dealer = (gs.dealerHand ?? []).map(toUiCard).filter(Boolean);
    const playerHands = (gs.playerHands ?? [[]]).map((hand) => (hand ?? []).map(toUiCard).filter(Boolean));

    const serverOutcomes = gs.handOutcomes ?? [];
    const serverPayout = gs.payout ?? 0;

    // "Was a dealer card face-down?" only means something while the SAME hand
    // is moving on (hit / stand / double / split settling it). A brand-new
    // deal replaces the cards, so it never inherits the last round's hole —
    // otherwise a busted-out round (dealer card left face-down) would make
    // the next dealt blackjack reveal its hole early.
    const hadHoleCardHidden = !initialDeal && ui.dealer?.some((c) => c?.hidden);

    // ── A blackjack dealt on the initial deal (either side) ───────────────
    // The server hands the finished round back with BOTH dealer cards up, but
    // on the table the hole card is dealt FACE DOWN with the rest of the deal
    // and is turned over immediately — as soon as it lands, right there in the
    // deal phase, never waiting for a player turn that is never going to
    // happen. The flip starts when the card has arrived (deck-origin flight
    // included, plus the double-down shift when one is in play) and its end is
    // the moment everything else may react: the loss styling, the outlines,
    // the dealer's total and the popup all wait for it (scheduleReveal).
    const holeRevealAt = initialDeal && settled && dealer.length === 2
      ? dealerDealDelay(1) + DEAL_FLIGHT_MS + Math.max(0, dealerShiftMs)
      : null;
    const holeRevealEnd = holeRevealAt != null ? holeRevealAt + FLIP_MS : 0;

    // how many cards each hand is laid out for right now, plus the timers
    // that step it up at each fresh card's flight start (see planHandLayouts)
    const handLayouts = planHandLayouts(gs, dealerShiftMs, { initialDeal });

    setUi((s) => ({
      ...s,
      phase: settled ? "settled" : "playerTurn",
      roundId: gs.roundId ?? s.roundId,

      dealer,
      playerHands,
      activeHandIndex: gs.activeHandIndex ?? 0,

      handTotals: gs.handTotals ?? [],
      handBets: gs.handBets ?? [],

      handOutcomes: settled ? [] : serverOutcomes,

      // shown counts are stepped ONLY by the flip-end timers (initial deal,
      // hits, splits, reveal) — never stamped from the server snapshot, or
      // a pill would count cards still flying, flipping, or face-down
      dealerShownCount: s.dealerShownCount,
      dealerTotal: typeof gs.dealerTotal === "number" ? gs.dealerTotal : 0,

      settled,
      payout: serverPayout,
      busy: false,

      pendingOutcomes: settled ? serverOutcomes : null,
      pendingPayout: settled ? serverPayout : 0,

      // the fresh state is on screen: any exit snapshot is gone, and the
      // settle carries this action's dealer shift (0 except double-down)
      exiting: null,
      dealerShiftMs: settled ? dealerShiftMs : 0,

      // a dealt blackjack's hole stays face-down until its flip is due
      holeUp: holeRevealAt == null,

      handLayouts,

      ...(settled ? null : { showResult: false, resultStatus: null, resultPayout: 0 }),
    }));

    if (settled) {
      scheduleDealerRevealSounds({ gs, hadHoleCardHidden, shift: dealerShiftMs, holeRevealAt });
      scheduleDealerTotalCountUp({ gs, hadHoleCardHidden, shift: dealerShiftMs, holeRevealEnd });
      scheduleReveal({
        gs,
        outcomes: serverOutcomes,
        payout: serverPayout,
        hadHoleCardHidden,
        shift: dealerShiftMs,
        playerFlipEnd,
        holeRevealEnd,
      });
    }

    // last: the totals/sounds passes clear their own timer lists, so this
    // timer is scheduled once everything else has settled (see the ref note)
    if (holeRevealAt != null) {
      holeRevealTimerRef.current = setTimeout(() => {
        holeRevealTimerRef.current = null;
        setUi((prev) => ({ ...prev, holeUp: true }));
      }, holeRevealAt);
    }
  };

  const handleDeal = async () => {
    if (isLocked) { setBetLockedError(betErrorMessage); return; }
    if (!isAuthenticated) { setBetError("Log in to place a bet"); return; }

    if (!Number.isFinite(bet) || bet <= 0) { setBetError("Invalid bet amount"); return; }
    if (bet > (user?.balance ?? 0)) { setBetError("Insufficient balance"); return; }
    if (!canDeal) return;

    const prevBalance = user?.balance ?? 0;

    updateBalance?.((b) => b - bet);

    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    if (holeRevealTimerRef.current) {
      clearTimeout(holeRevealTimerRef.current);
      holeRevealTimerRef.current = null;
    }
    clearDealerTotalTimers();
    clearPlayerTotalTimers();
    clearLayoutTimers();
    clearDealSoundTimers();
    clearDealerSoundTimers();

    // A NEW bet first clears the old table: every hand's cards slide out
    // down-left in parallel — each hand staggers its own cards left to
    // right (200ms apart), all hands starting at the same moment — while
    // every total label fades. The bet request runs DURING the exit; the
    // fresh deal starts the moment BOTH are done (no cards = no wait).
    // the snapshot carries the layout counts too: the old cards keep the
    // seats they were last laid out in while they fly out of the way
    const snapshot = { dealer: ui.dealer ?? [], playerHands: ui.playerHands ?? [], layouts: ui.handLayouts };
    const maxCards = Math.max(0, snapshot.dealer.length, ...snapshot.playerHands.map((h) => h?.length ?? 0));
    const exitMs = maxCards > 0 ? (maxCards - 1) * EXIT_STAGGER_MS + EXIT_MS : 0;

    // NOTE: the shown counts are NOT reset here — the old totals stay up
    // (frozen) while they fade out with the exiting cards.
    setUi((s) => ({
      ...s,
      busy: true,
      exiting: maxCards > 0 ? snapshot : null,
      showResult: false,
      resultStatus: null,
      resultPayout: 0,
      pendingOutcomes: null,
      pendingPayout: 0,
      handOutcomes: [],
      dealerShiftMs: 0,
    }));

    try {
      const [data] = await Promise.all([
        apiPost(BJ_START_URL, { betAmount: bet }),
        new Promise((r) => setTimeout(r, exitMs)),
      ]);

      // exit finished: counts restart at zero for the fresh deal (batched
      // with the state below, so the pills never flash mid-swap)
      setUi((s) => ({ ...s, dealerShownCount: 0, playerLandedCounts: [] }));

      scheduleDealSounds(data.gameState);
      scheduleInitialTotalCountUps(data.gameState);

      // Both of the player's cards must have finished flipping before the
      // dealt round may react (the win popup is the loud one): this is the
      // end of the LAST card's flight + its deal-flip.
      const p0 = (data.gameState?.playerHands ?? [[]])[0]?.length ?? 0;
      const playerFlipEnd = p0 > 0
        ? playerDealDelay(0, p0 - 1) + DEAL_FLIGHT_MS + DEAL_FLIP_MS
        : 0;

      applyServerState(data, { initialDeal: true, playerFlipEnd });
    } catch (e) {
      console.error("Blackjack deal failed:", e);
      updateBalance?.(prevBalance);
      toast.error(e.message || "Failed to start blackjack");
      setUi((s) => ({ ...s, busy: false, exiting: null }));
    }
  };

  const handleAction = async (action) => {
    if (!ui.roundId) return;
    if (!["hit", "stand", "double", "split"].includes(action)) return;
    if (ui.busy) return;

    const prevBalance = user?.balance ?? 0;
    const extraCost = action === "double" || action === "split" ? bet : 0;

    if (extraCost > 0) {
      if (extraCost > prevBalance) { setBetError("Insufficient balance"); return; }
      updateBalance?.((b) => b - extraCost);
    }

    try {
      setUi((s) => ({ ...s, busy: true }));

      const data = await apiPost(BJ_ACTION_URL, {
        roundId: ui.roundId,
        action,
        handIndex: ui.activeHandIndex ?? 0,
      });

      // settle timing for THIS action: the reveal awaits a fresh player
      // card's flip only if one was actually dealt; a double-down also
      // shifts the whole dealer turn to its own arrival-triggered phase
      let dealerShiftMs = 0;
      let playerFlipEnd = null;

      if (action === "hit" || action === "double") {
        setTimeout(() => sfx.play("card", { volume: 1 }), DEAL_EXTRA_MS);
        const hIdx = ui.activeHandIndex ?? 0;
        const len = data.gameState?.playerHands?.[hIdx]?.length ?? 0;
        const prevLen = ui.playerHands?.[hIdx]?.length ?? 0;
        if (len > prevLen) {
          const flipEnd = playerDealDelay(hIdx, len - 1) + DEAL_FLIGHT_MS + DEAL_FLIP_MS;
          // the label counts it the moment it lands, even though the reveal
          // (and a double-down's dealer turn) waits for its flip
          schedulePlayerTotalStep(hIdx, playerDealDelay(hIdx, len - 1) + DEAL_FLIGHT_MS, len);
          if (data.gameState?.status === "finished") {
            playerFlipEnd = flipEnd;
            if (action === "double") dealerShiftMs = flipEnd - DEAL_FLIP_MS;
          }
        }
      }
      if (action === "split") {
        setTimeout(() => sfx.play("card", { volume: 1 }), 0);
        setTimeout(() => sfx.play("card", { volume: 1 }), DEAL_EXTRA_MS + DEAL_STEP_MS);
        setTimeout(() => sfx.play("card", { volume: 1 }), 2 * DEAL_STEP_MS);
        // split rearranges cards between hands: recount each hand from the
        // already-visible carry-overs now, then step the fresh card(s) in
        // as their flips complete (a plain max() would count them early)
        const ck = (c) => c?.id ?? `${c?.r ?? c?.rank}-${c?.s ?? c?.suit}`;
        const hands = data.gameState?.playerHands ?? [];
        const prevHands = ui.playerHands ?? [];
        // a card carried into its new hand is already on the table, so it is
        // already counted: each hand's label starts at its carried card and
        // then counts its own fresh card as that card LANDS
        const counts = [...(ui.playerLandedCounts ?? [])];
        hands.forEach((hand, hIdx) => {
          const prevIds = new Set((prevHands[hIdx] ?? []).map(ck));
          const carry = (hand ?? []).filter((c) => prevIds.has(ck(c))).length;
          counts[hIdx] = carry;
          for (let i = carry; i < (hand?.length ?? 0); i++) {
            schedulePlayerTotalStep(hIdx, playerDealDelay(hIdx, i) + DEAL_FLIGHT_MS, i + 1);
          }
          if ((hand?.length ?? 0) > carry) {
            const flipEnd = playerDealDelay(hIdx, (hand?.length ?? 1) - 1) + DEAL_FLIGHT_MS + DEAL_FLIP_MS;
            // split-aces auto-settles: the reveal must await these flips
            playerFlipEnd = Math.max(playerFlipEnd ?? 0, flipEnd);
          }
        });
        setUi((s) => ({ ...s, playerLandedCounts: counts }));
      }

      applyServerState(data, { dealerShiftMs, playerFlipEnd });
    } catch (e) {
      console.error("Blackjack action failed:", e);
      if (extraCost > 0) updateBalance?.(prevBalance);
      toast.error(e.message || "Action failed");
      setUi((s) => ({ ...s, busy: false }));
    }
  };

  // Warn before a page refresh while a bet is live (see RefreshGuard).
  // (a dealt hand is not persisted client-side: refreshing mid-hand loses it)
  useActiveBetFlag(
    "blackjack",
    Boolean(ui.roundId) && !ui.settled && ui.phase !== "idle" && ui.phase !== "settled"
  );

  return (
    <div className={styles.container}>
      <div className={styles.sidebar}>
        <div className={styles.modeToggle}>
          <button className={`${styles.modeBtn} ${styles.active}`} type="button">
            Manual
          </button>
          <button className={`${styles.modeBtn} sidebar-mode-auto-disabled`} type="button" disabled>
            Auto
          </button>
        </div>

        <div className={styles.controlGroup}>
          <div className={styles.labelRow}>
            <span>Bet Amount</span>
            <span>$0.00</span>
          </div>

          <div className={styles.inputGroup}>
            <div className={styles.inputWrapper}>
              <input
                type="number"
                placeholder="0.00" value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                step="0.00000001"
              />
            </div>

            <CurrencyIcon className={styles.btcIcon} />

            <div className={styles.splitButtons}>
              <button onClick={() => adjustBet(0.5)}>½</button>
              <div className={styles.divider} />
              <button onClick={() => adjustBet(2)}>2×</button>
            </div>
          </div>
          <BetError message={betLockedError} />
          <BetError message={betError} />
        </div>

        <div className={styles.actionGrid}>
          <button className={`${styles.actionButton} ${styles.actionHit}`} onClick={() => handleAction("hit")} disabled={!canHit}>
            Hit
            <img className={styles.actionIcon} src={hitSvg} alt="" draggable="false" />
          </button>

          <button className={`${styles.actionButton} ${styles.actionStand}`} onClick={() => handleAction("stand")} disabled={!canStand}>
            Stand
            <img className={styles.actionIcon} src={standSvg} alt="" draggable="false" />
          </button>

          <button className={`${styles.actionButton} ${styles.actionSplit}`} onClick={() => handleAction("split")} disabled={!canSplit}>
            Split
            <img className={styles.actionIcon} src={splitSvg} alt="" draggable="false" />
          </button>

          <button className={`${styles.actionButton} ${styles.actionDouble}`} onClick={() => handleAction("double")} disabled={!canDouble}>
            Double
            <img className={styles.actionIcon} src={doubleSvg} alt="" draggable="false" />
          </button>
        </div>

        <span className="ui-bet-wrap">
          <button className={styles.betButton} onClick={handleDeal} disabled={isLocked || !canDeal} data-bet-sound="true" title={isLocked ? betErrorMessage : undefined}>
            {ui.busy ? "..." : "Bet"}
          </button>
          <BetLockBadge locked={isLocked} title={disabledTitle} description={disabledDesc} />
        </span>
      </div>

      <div className={styles.gameStage} ref={stageRef}>
        {isLocked ? (
          <DisabledGameStage title={disabledTitle} message={disabledDesc} mobile={isMobileDisabled} />
        ) : (
          <>
            <div className={styles.deckEntity} aria-hidden="true" ref={deckRef}>
              <img className={styles.deckEntityImg} src={deckEntityPng} alt="" draggable="false" />
            </div>

            {/* Only WINS get a popup — losses and pushes are carried by the
            total pills' tones + sounds, never a popup (global rule: the
            "lost" popup variant is gone from every game). */}
            {ui.showResult && ui.resultStatus === "win" && (
              <div
                className={`${styles.resultPopup} ${styles.popupWin}`}
              >
                <div className={styles.resultPopupMult}>
                  {(sum(ui.handBets) > 0
                    ? Number(ui.resultPayout || 0) / sum(ui.handBets)
                    : 0
                  ).toFixed(2)}×
                </div>
                <div className={styles.resultPopupDivider} aria-hidden="true" />
                <div className={styles.resultPopupAmount}>{Number(ui.resultPayout || 0).toFixed(2)}<CurrencyIcon /></div>
              </div>
            )}

            <div className={styles.dealerArea}>
              {/* The dealer's hole card occupies slot 1 of the same fan; the
                  total pill is positioned from the hand's layout — right edge
                  on the last card, bottom edge on the first card's top. */}
              <div className={styles.fanTop} ref={fanTopRef}>
                {/* Dealer total stays neutral dark — the win/loss highlight
                belongs only on the settled player's own total pill. The pill
                appears once the first card has flipped face-up and never
                counts flying, flipping, or face-down cards. */}
                {ui.roundId && (ui.dealerShownCount ?? 0) > 0 ? (
                  <div
                    data-dealer-pill="true"
                    className={`${styles.totalPillDark} ${exiting ? styles.totalOut : ""}`}
                    style={{ right: `${dealerLay.labelRight}px`, top: `${vGap}px` }}
                  >
                    {handTotalDisplay(
                      shownDealer
                        .filter((c) => !c?.hidden)
                        .slice(0, ui.dealerShownCount)
                    )}
                  </div>
                ) : null}

                {shownDealer.map((c, i) => {
                  // a card still flying is seated where it will land; the ones
                  // already down stay in the hand's current layout and glide
                  // left+up the moment this one moves (cardLayout)
                  const lay = cardLayout(cardGeom, dealGeom?.fanTop, dealerCount, i, dealerY0);
                  return (
                    <Card
                      key={
                        i === 1
                          ? `dealer-hole-${ui.roundId ?? "x"}`
                          : `${ui.roundId ?? "x"}-${cardKey(c, i)}`
                      }
                      index={i}
                      x={lay.seatX(i)}
                      y={lay.seatY(i)}
                      card={c}
                      hidden={!!c.hidden}
                      outline="none"
                      animate
                      cardBackSrc={cardBackSvg}
                      flip={i === 1}
                      // the hole card is the one card whose face is under the
                      // board's control: hidden for the player's whole turn, and
                      // on a DEALT result it lands face-down and flips once its
                      // flight is over (ui.holeUp) — never already-face-up
                      faceUp={!c?.hidden && (i !== 1 || ui.holeUp)}
                      flipDelayMs={i === 1 ? (ui.dealerShiftMs ?? 0) : 0}
                      dealDelayMs={dealerDealDelay(i) + (ui.dealerShiftMs ?? 0)}
                      dealFrom={dealFromVars(dealGeom, dealGeom?.fanTop, i)}
                      exiting={!!exiting}
                      exitDelayMs={i * EXIT_STAGGER_MS}
                    />
                  );
                })}
              </div>
            </div>

            <div className={styles.ribbon} aria-hidden="true">
              <img className={styles.ribbonSvg} src={paysSvg} alt="" />
            </div>

            <div className={styles.playerArea}>
              <div className={styles.handsRow}>
                {shownHands.map((hand, hIdx) => {
                  // the pill counts every card that has LANDED and hides
                  // until the first one does — so on the opening deal it is up
                  // (one-card total) as soon as card #1 arrives, at card #1's
                  // own position, and it then rides the hand's re-centring
                  // glide into the two-card layout as card #2 arrives
                  const shown = ui.playerLandedCounts?.[hIdx] ?? 0;
                  const total = handTotalDisplay(hand.slice(0, shown));
                  const outcome = ui.handOutcomes?.[hIdx] ?? null;

                  const settled = ui.showResult && ui.phase === "settled";
                  // A hand of exactly two cards worth 21 is a NATURAL
                  // blackjack: it wears its own gold state — deliberately
                  // different from the win green, the push orange and the
                  // loss red — on the cards AND on the total pill.
                  const isNatural21 = hand.length === 2 && handTotalUi(hand) === 21;
                  const outline = settled
                    ? outcome === "win"
                      ? (isNatural21 ? "blackjack" : "win")
                      : outcome === "lose"
                        ? "lose"
                        : outcome === "push"
                          ? "push"
                          : "none"
                    : "none";

                  const pillTone = settled
                    ? outcome === "win"
                      ? (isNatural21 ? styles.totalBlackjack : styles.totalWin)
                      : outcome === "lose"
                        ? styles.totalLose
                        : outcome === "push"
                          ? styles.totalPush
                          : ""
                    : "";

                  const fanGeom = dealGeom?.fansBottom?.[hIdx] ?? dealGeom?.fansBottom?.[0] ?? null;
                  const count = handCount(hIdx, hand.length);
                  const y0Of = playerY0(fanGeom?.h);
                  const lay = handLayout(cardGeom, fanGeom, count, y0Of(count));

                  return (
                    <div key={hIdx} className={styles.handWrap}>
                      <div className={styles.fanBottom} ref={(el) => { fanBottomRefs.current[hIdx] = el; }}>
                        {/* The total label rides the hand: its right edge on
                            the last card's right edge, its bottom edge on the
                            first card's top edge (no gap). Both offsets come
                            from the same layout as the seats, so it moves with
                            the hand — and its own right/bottom transition keeps
                            it in step with the cards' glide. */}
                        {ui.roundId && shown > 0 ? (
                          <div
                            className={`${styles.totalPillPlayer} ${pillTone} ${exiting ? styles.totalOut : ""}`}
                            style={{ right: `${lay.labelRight}px`, bottom: `${lay.labelBottom}px` }}
                          >
                            {total}
                          </div>
                        ) : null}

                        {hand.map((c, i) => {
                          // see cardLayout: a card still on its way is
                          // already seated where it lands, the rest glide
                          // under it
                          const cardLay = cardLayout(cardGeom, fanGeom, count, i, y0Of);
                          return (
                            <Card
                              key={`${ui.roundId ?? "x"}-${cardKey(c, i)}`}
                              index={i}
                              x={cardLay.seatX(i)}
                              y={cardLay.seatY(i)}
                              card={c}
                              hidden={false}
                              outline={outline}
                              animate
                              cardBackSrc={cardBackSvg}
                              dealDelayMs={playerDealDelay(hIdx, i)}
                              dealFrom={dealFromVars(dealGeom, fanGeom, i)}
                              exiting={!!exiting}
                              exitDelayMs={i * EXIT_STAGGER_MS}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Card({ index, x = 0, y = 0, card, hidden, outline = "none", animate = false, cardBackSrc, flip = false, faceUp = true, dealDelayMs = 0, dealFrom = null, exiting = false, exitDelayMs = 0, flipDelayMs = 0 }) {
  const r = card?.r;
  const s = card?.s;
  const red = s ? isRedSuit(s) : false;
  const suitSrc = s ? suitIconSrc(s) : null;

  const showFlip = !!flip;

  const frontFace = (
    <>
      <div className={styles.corner}>
        <div className={`${styles.rank} ${red ? styles.redText : styles.blackText}`}>{r}</div>
      </div>

      <div className={styles.center}>
        {suitSrc ? (
          <img
            className={`${styles.centerSuitIconLarge} ${red ? styles.suitIconRed : styles.suitIconBlack}`}
            src={suitSrc}
            alt=""
            draggable="false"
          />
        ) : null}
      </div>
    </>
  );

  const backFace = (
    <div className={styles.cardBackWrap}>
      <img className={styles.cardBackImg} src={cardBackSrc} alt="" draggable="false" />
    </div>
  );


  return (
    <div
      className={styles.cardSlot}
      style={{
        // the seat comes from the hand's layout (handLayout); the stylesheet
        // transitions this transform, so stepping the layout up glides the
        // cards already on the table into the re-centred group
        transform: `translate(${x}px, ${y}px)`,
        zIndex: 10 + index,
      }}
    >
      <div
        className={`${styles.cardMotion} ${exiting ? styles.cardOut : animate ? styles.cardDeal : ""}`}
        style={exiting ? { animationDelay: `${exitDelayMs}ms` } : animate ? { animationDelay: `${dealDelayMs}ms`, ...(dealFrom || {}) } : undefined}
      >
        <div
          className={`${styles.card} ${hidden ? styles.cardNoClip : ""} ${outline === "blackjack" ? styles.cardOutlineBlackjack : outline === "win" ? styles.cardOutlineWin : outline === "lose" ? styles.cardOutlineLose : outline === "push" ? styles.cardOutlinePush : ""
            }`}
        >
          {showFlip ? (
            <div
              className={`${styles.flipWrap} ${faceUp ? styles.flipFaceUp : ""}`}
              style={flipDelayMs > 0 ? { transitionDelay: `${flipDelayMs}ms`, animationDelay: `${flipDelayMs}ms` } : undefined}
            >
              <div className={`${styles.flipFace} ${styles.flipFront}`}>{frontFace}</div>
              <div className={`${styles.flipFace} ${styles.flipBack}`}>{backFace}</div>
            </div>
          ) : !hidden ? (
            /* Dealt face-down at the deck, flown to its seat, and flipped
               face-up only after the flight completes (the hole card keeps
               the old reveal path — it never deal-flips). */
            <div
              className={`${styles.flipWrap} ${animate ? styles.dealFlipDo : styles.flipFaceUp}`}
              style={animate ? { "--deal-flip-delay": `${dealDelayMs + DEAL_FLIGHT_MS}ms` } : undefined}
            >
              <div className={`${styles.flipFace} ${styles.flipFront}`}>{frontFace}</div>
              <div className={`${styles.flipFace} ${styles.flipBack}`}>{backFace}</div>
            </div>
          ) : (
            backFace
          )}
        </div>
      </div>
    </div>
  );
}