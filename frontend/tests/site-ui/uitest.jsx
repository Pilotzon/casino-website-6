/* ============================================================================
 * Site-wide UI suite (jsdom).
 *
 * Covers the things that are not specific to the Crash board:
 *   §1  the "Loss" toast kind (title, card class, icon) — real ToastProvider
 *   §1b toasts STACK (the card stays in flow, so a new toast pushes the older
 *       ones down instead of landing on top of them)
 *   §2  games page: filter-row spacing (desktop) + centring (mobile)
 *   §3  admin panel: nothing scrolls sideways on a phone, icon-only row buttons
 *   §4  the hazard badge on the bet button opens the explanation modal —
 *       checked on EVERY game that has a bet button (and the button keeps its
 *       full sidebar width inside the new wrapper)
 *   §5  the app-wide "Scroll up" pill (bottom right, tooltip, mobile offset)
 *   §6  the "bypass disabled games/pages" permission in the UI
 *   §7  filled icons everywhere, the green currency mark, the mobile bottom
 *       nav (white bold labels) and the navbar balance box + today panel
 *   §8  Blackjack: a dealt blackjack (player OR dealer) reveals its hole card
 *       inside the deal, the win popup/payout styling waits for the flips, the
 *       bet button stays disabled while the dealer is still drawing, a natural
 *       21 settles in the standard win green (no gold state), the sidebar
 *       result readout lands only with the reveal ("Round lost", "Bet"), and
 *       the card geometry lives in the CSS tokens (smaller on phones)
 *   §8b Blackjack split hands: the turn indicator (plain light-blue result
 *       treatment) sits only on the active hand of a split and never moves
 *       mid-flip; Mines/Tower post-round tiles darken at +1s with a fade;
 *       wrap-proof control rows (margin-top: auto) everywhere
 *   §9  Dice / Limbo: the My-bets marker sits IN the pills row (pills left,
 *       marker right) and that row is an overlay — it can never push the game
 *       layout down
 *   §10 Blackjack: the deal chains on each flip, the hand re-centres as a
 *       group, and the total label rides that shift — and the label appears
 *       with the FIRST card (one-card total, one-card position), then glides
 *       into the two-card layout as the second card arrives
 *   §11 Slide + Hilo: registered scaffolding shells — the standard betting
 *       panel, the shared disabled screen, a truthful "coming soon" stage,
 *       and no fake round (Bet never moves the balance)
 *   §10 (extended) Blackjack: dealer label top-anchored, the symmetric table
 *       band rule in every state, the flattened deal diagonal, the pays sign
 *       as the lowest table layer
 *   §13 the pills row is universal: marker in the row (pills left, marker
 *       right), one constant gap, no gradient mask — the outgoing pill fades
 *       itself; Roulette's history stack is dynamic with a centred title
 *
 * Run:  npm run test:ui        (from frontend/)
 * ==========================================================================*/
import React from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

import { ToastProvider, useToast } from '../../src/context/ToastContext.jsx';
import { ActiveBetProvider } from '../../src/context/ActiveBetContext.jsx';
import { __toasts as stubToasts } from '../stubs/toastContext.jsx';
import { __auth } from '../stubs/authContext.jsx';
import { __site as __siteStatus, __dash } from '../stubs/gamesApi.js';
import { refreshSiteStatus } from '../../src/hooks/useSiteStatus.js';

const here = typeof __TEST_DIR__ === 'string' ? __TEST_DIR__ : process.cwd();

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${label}`); }
  else { fail += 1; console.log(`  ❌ ${label} ${extra}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (cond, timeout = 2000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (cond()) return true;
    await sleep(40);
  }
  return false;
};
const setInputValue = (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
};
const readCss = (rel) => readFileSync(resolve(here, '../..', rel), 'utf8');
const block = (css, header) => {
  const i = css.indexOf(header);
  if (i < 0) return '';
  // pseudo-block for media queries: take the whole rest, the regexes are specific
  return css.slice(i);
};
const firstRule = (css, selector) => {
  const m = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`).exec(css);
  return m ? m[1] : '';
};

const mounted = [];
const mount = (node) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  root.render(node);
  mounted.push({ host, root });
  return host;
};
const unmountAll = () => {
  while (mounted.length) {
    const { host, root } = mounted.pop();
    try { root.unmount(); } catch { /* already gone */ }
    host.remove();
  }
};

/* ---------------------------------------------------------------- §1 loss */
function LossTrigger() {
  const toast = useToast();
  return React.createElement(
    'button',
    { className: 'css-lossBtn', onClick: () => toast.loss('You lost 20.00 $ this round') },
    'fire'
  );
}

/* ------------------------------------------------------------- §1b stacking */
function TwoToastTriggers() {
  const toast = useToast();
  return React.createElement(
    'div',
    null,
    React.createElement('button', { className: 'css-toastOne', onClick: () => toast.info('first toast') }, 'one'),
    React.createElement('button', { className: 'css-toastTwo', onClick: () => toast.info('second toast') }, 'two')
  );
}

async function main() {
  console.log('\n=== 1. the "Loss" toast kind ===');
  {
    const host = mount(
      React.createElement(ToastProvider, null, React.createElement(LossTrigger))
    );
    await sleep(120);
    host.querySelector('.css-lossBtn').click();
    const shown = await waitFor(() => !!document.querySelector('.appToast--loss'), 2000);
    ok(shown, 'a loss toast appears');
    const card = document.querySelector('.appToast--loss');
    ok(!!card, 'toast uses the loss variant class', card?.className);
    ok(card?.querySelector('.appToast__title')?.textContent === 'Loss',
      'its title is "Loss", not "Error"', card?.querySelector('.appToast__title')?.textContent);
    ok(/You lost 20\.00 \$/.test(card?.querySelector('.appToast__msg')?.textContent ?? ''),
      'the message is the round result', card?.querySelector('.appToast__msg')?.textContent);
    ok(!!card?.querySelector('.appToast__accent svg'), 'it carries its own icon');
    ok(!document.querySelector('.appToast--error'), 'nothing was rendered as an error');

    const css = readCss('src/context/toast.css');
    ok(/\.appToast--loss\s+\.appToast__accent\s+\.appToast__icon/.test(css), 'loss has its own icon colour');
    ok(/\.appToast--loss\s+\.appToast__progress/.test(css), 'loss has its own progress colour');

    const ctx = readCss('src/context/ToastContext.jsx');
    ok(/loss: <IconTrendDown \/>/.test(ctx), 'the loss icon is a falling chart, not a cross');
    ok(/const loss = \(message, opts\)/.test(ctx) && /title: opts\?\.title \|\| "Loss"/.test(ctx),
      'the provider exposes loss() with a "Loss" default title');

    // the games that used to report a loss as an error
    const rr = readCss('src/components/games/RussianRoulette.jsx');
    ok(!/toast\.error\(`You lost/.test(rr) && (rr.match(/toast\.loss\(/g) || []).length === 2,
      'Russian Roulette reports losses with the Loss kind');
    const crash = readCss('src/components/games/Crash.jsx');
    // Crash is a NO-TOAST game: a lost cash-out race is an outcome, not an
    // error or a loss notification — the board (and the tip dot) say it.
    ok(!/toast\.loss\(/.test(crash) && !/toast\.success\(/.test(crash),
      'Crash raises no win/loss toasts at all');
    ok(/sfx\.play\('win'\)/.test(crash) && /assets\/crash\/Win\.mp3/.test(crash),
      'Cash Out plays assets/crash/Win.mp3 instead');

    unmountAll();
    // clean up any lingering toast container
    await sleep(3200);
  }

  /* ------------------------------------------- §1b toasts STACK, never pile */
  console.log('\n=== 1b. toasts stack: a new toast pushes the older ones down ===');
  {
    // react-hot-toast positions every toast with an absolutely positioned
    // wrapper and MEASURES that wrapper to work out the offsets — an
    // absolutely positioned card reports height 0, and every toast then
    // lands on the same spot (overlap / "replaced"). The card must be in flow.
    const card = firstRule(readCss('src/context/toast.css'), '.appToast').replace(/\/\*[\s\S]*?\*\//g, '');
    ok(/position:\s*relative/.test(card),
      'the toast card stays IN FLOW inside the library wrapper (measurable height)',
      card.replace(/\s+/g, ' ').slice(0, 120));
    ok(!/position:\s*absolute/.test(card),
      'never absolute — that is what made every toast report height 0');

    const host = mount(
      React.createElement(ToastProvider, null, React.createElement(TwoToastTriggers))
    );
    await sleep(120);
    host.querySelector('.css-toastOne').click();
    await sleep(120);
    host.querySelector('.css-toastTwo').click();
    await sleep(160);
    const cards = [...document.querySelectorAll('.appToast')]
      .filter((c) => /first toast|second toast/.test(c.textContent));
    ok(cards.length === 2, 'both toasts are on screen at the same time', String(cards.length));
    ok(cards.some((c) => /first toast/.test(c.textContent)) && cards.some((c) => /second toast/.test(c.textContent)),
      'the older toast is still there — the new one did not replace it');
    unmountAll();
    await sleep(3400);
  }

  /* ------------------------------------------------- games page filter row */
  console.log('\n=== 2. games page: Search + Sort row ===');
  {
    const css = readCss('src/pages/games.module.css');
    const base = firstRule(css, '.searchFilterRow');
    ok(/margin-top:\s*1[0-9]px/.test(base), 'desktop: the row has breathing room above it', base);
    const mobile = block(css, '@media (max-width: 600px)');
    const rowRule = /\.searchFilterRow\s*\{([^}]*)\}/.exec(mobile)?.[1] ?? '';
    ok(/margin:\s*0 auto/.test(rowRule), 'mobile: the row is centred, not shifted sideways', rowRule);
    ok(!/margin:\s*0 -/.test(rowRule), 'mobile: the old negative-margin offset is gone', rowRule);
    ok(/width:\s*100%/.test(rowRule), 'mobile: it spans the container (same axis as the grid)', rowRule);
    ok(/justify-content:\s*center/.test(rowRule), 'mobile: contents centred in the row', rowRule);
  }

  /* ------------------------------------------------------ admin on phones */
  console.log('\n=== 3. admin panel: no sideways scrolling on a phone ===');
  {
    const css = readCss('src/pages/admin.module.css');
    const mobile = css.slice(css.indexOf('@media (max-width: 640px)'));
    ok(mobile.length > 0, 'a phone breakpoint block exists for tables');
    ok(/\.table\s*\{[^}]*overflow:\s*hidden/.test(mobile), 'the table card clips instead of scrolling');
    ok(/\.tableHead\s*\{\s*display:\s*none/.test(mobile), 'column headers are dropped on phones');
    ok(/\.tableRow[^{]*\{[^}]*flex-wrap:\s*wrap/.test(mobile), 'rows wrap into two lines');
    ok(/\.tableRow\s*>\s*div:first-child\s*\{[^}]*flex:\s*1 1 100%/.test(mobile),
      'the first cell owns the whole first line');
    ok(/\.tableActions\s*\{[^}]*margin-left:\s*auto/.test(mobile), 'actions are pushed to the right');
    ok(/\.smallBtn\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s.test(mobile), 'row buttons become square tiles');
    ok(/\.btnText\s*\{\s*display:\s*none/.test(mobile), 'their text label is hidden (icon-only)');

    // no rule may force a width wider than a phone any more
    ok(!/min-width:\s*480px/.test(css), 'the old 480px row floor is gone');
    ok(/@media \(min-width: 641px\)[\s\S]*?min-width:\s*520px/.test(css),
      'the wide-screen row floor only applies above the phone breakpoint');

    // the buttons really are icon-only capable + accessible
    const jsx = readCss('src/pages/Admin.jsx');
    ok(/aria-label=\{g\.is_enabled \? "Disable game" : "Enable game"\}/.test(jsx),
      'the game toggle button is labelled for screen readers');
    ok(/aria-label=\{g\.is_mobile_enabled !== 0 \? "Disable mobile" : "Enable mobile"\}/.test(jsx),
      'the mobile toggle button is labelled too');
    ok(/aria-label=\{p\.is_enabled \? "Disable page" : "Enable page"\}/.test(jsx),
      'the page toggle button is labelled too');
    const labels = (jsx.match(/styles\.btnText/g) || []).length;
    ok(labels >= 3, 'every row button wraps its text in the hideable span', String(labels));
    ok((jsx.match(/<IconPower size=\{16\} \/>/g) || []).length >= 2,
      'a (filled) power icon is on the enable/disable buttons');
    ok(/g\.is_mobile_enabled !== 0 \? <IconDeviceMobileSlash size=\{16\} \/> : <IconDeviceMobile size=\{16\} \/>/.test(jsx),
      'the phone icon gets a slash when mobile is on');

    // nothing else in the panel may reintroduce a sideways scrollbar
    const phoneCss = css.slice(css.indexOf('@media (max-width: 640px)'));
    const bases = css.slice(0, css.indexOf('@media (max-width: 640px)'));
    ok(!/overflow-x:\s*(auto|scroll)/.test(phoneCss),
      'no rule after the breakpoint turns a scroller back on', (phoneCss.match(/overflow-x:[^;]+/g) || []).join(' | '));
    const floors = (phoneCss.match(/min-width:\s*(\d+)px/g) || [])
      .map((m) => parseInt(m.match(/(\d+)px/)[1], 10)).filter((n) => n >= 300);
    ok(floors.length === 0, 'no phone-block rule forces a width a phone cannot fit', floors.join(','));
    ok(/overflow-x:\s*auto/.test(bases), 'the desktop table keeps its scroll fallback', '');
    ok(!/\.smallBtn\s*\{[^}]*height:\s*34px/s.test(phoneCss),
      'the 34px text-button sizing no longer squashes the icon tiles');
    ok(/\.smallBtn\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s.test(phoneCss),
      'the icon tiles are a comfortable 44x44 tap target');
    ok(/\.smallBtn\s+svg\s*\{[^}]*width:\s*24px[^}]*height:\s*24px/s.test(phoneCss),
      'the icon inside them is 24px (not the 16px inline attribute)');
  }

  /* ------------------------------------------- hazard badge on every game */
  console.log('\n=== 4. the bet-button hazard badge opens the explanation modal ===');
  const games = [
    'Blackjack', 'Crash', 'Dice', 'Flip', 'Hilo', 'Keno', 'Limbo', 'Mines',
    'Plinko', 'RPS', 'Roulette', 'RussianRoulette', 'Slide', 'Snakes', 'Tower',
    'Wheel',
  ];
  let mountedCount = 0;
  for (const name of games) {
    let Game;
    try {
      ({ default: Game } = await import(`../../src/components/games/${name}.jsx`));
    } catch (e) {
      ok(false, `${name}: module loads`, String(e).slice(0, 160));
      continue;
    }
    // 1) not locked: no badge at all
    let host;
    try {
      host = mount(
        React.createElement(ToastProvider, null,
          React.createElement(ActiveBetProvider, null,
            React.createElement(Game, {
              gameRow: { name: name.toLowerCase(), display_name: name, is_enabled: 1, is_mobile_enabled: 1 },
            })
          )
        )
      );
      await sleep(120);
    } catch (e) {
      ok(false, `${name}: mounts unlocked`, String(e).slice(0, 160));
      unmountAll();
      continue;
    }
    const unlockedBadge = host.querySelector('.ui-hazard-corner');
    const btn = host.querySelector('.css-uitest-bet') || host.querySelector('button');
    ok(!unlockedBadge, `${name}: no hazard badge while the game is enabled`);
    unmountAll();

    // 2) disabled by the admin: badge on the bet button, click → modal
    try {
      host = mount(
        React.createElement(ToastProvider, null,
          React.createElement(ActiveBetProvider, null,
            React.createElement(Game, {
              gameRow: { name: name.toLowerCase(), display_name: name, is_enabled: 0, is_mobile_enabled: 1 },
            })
          )
        )
      );
      await sleep(160);
    } catch (e) {
      ok(false, `${name}: mounts when disabled`, String(e).slice(0, 160));
      unmountAll();
      continue;
    }
    const wrap = host.querySelector('.css-ui-bet-wrap') || host.querySelector('.ui-bet-wrap');
    const badge = host.querySelector('.ui-hazard-corner');
    const lockedBtn = wrap?.querySelector('button');
    ok(!!wrap && !!badge, `${name}: hazard badge sits next to the bet button`);
    ok(lockedBtn?.disabled === true, `${name}: the bet button is disabled`);
    if (badge) {
      badge.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await sleep(150);
      const card = document.querySelector('.ui-modal-card');
      const heading = document.querySelector('.ui-modal-heading')?.textContent ?? '';
      ok(!!card, `${name}: clicking the badge opens a modal`);
      ok(/disabled/i.test(heading), `${name}: the modal explains why`, heading);
      ok(/ui-modal-icon|ui-modal-head/.test(card?.innerHTML ?? '') || !!card?.querySelector('svg'),
        `${name}: the modal has the hazard icon`);
      // close it again
      const x = document.querySelector('.ui-modal-close') || document.querySelector('.ui-modal-card button');
      x?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await sleep(120);
    }
    mountedCount += 1;
    unmountAll();
    await sleep(30);
  }
  ok(mountedCount === games.length, 'every game with a bet button was checked', `${mountedCount}/${games.length}`);

  /* maintenance mode: same badge, maintenance wording, even though the game
     itself is enabled */
  {
    __siteStatus.status = { signup_enabled: true, maintenance_mode: true };
    await refreshSiteStatus();          // push the switch through the shared cache
    const { default: Crash } = await import('../../src/components/games/Crash.jsx');
    const host = mount(
      React.createElement(ToastProvider, null,
        React.createElement(ActiveBetProvider, null,
          React.createElement(Crash, { gameRow: { name: 'crash', display_name: 'Crash', is_enabled: 1, is_mobile_enabled: 1 } })
        )
      )
    );
    ok(await waitFor(() => !!host.querySelector('.ui-hazard-corner'), 2500),
      'maintenance mode shows the badge on an enabled game');
    host.querySelector('.ui-hazard-corner')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await sleep(150);
    const heading = document.querySelector('.ui-modal-heading')?.textContent ?? '';
    ok(/maintenance/i.test(heading), 'its modal explains maintenance', heading);
    unmountAll();
    await sleep(200);
    __siteStatus.status = { signup_enabled: true, maintenance_mode: false };
    await refreshSiteStatus();
  }

  // the badge must be a sibling (a disabled button swallows clicks)
  const global = readCss('src/styles/global.css');
  ok(/\.ui-bet-wrap\s*\{[^}]*position:\s*relative/.test(global), '.ui-bet-wrap is a positioned host');
  ok(/\.ui-bet-wrap\s*>\s*button\s*\{[^}]*width:\s*100%/s.test(global),
    'the action button stretches to the wrapper width (no shrink-wrapped button)');
  {
    // …and in the real DOM the button really is a direct child of the wrapper
    __auth.user = { id: 1, username: 'tester', role: 'user', balance: 100 };
    const { default: Dice } = await import('../../src/components/games/Dice.jsx');
    const host = mount(
      React.createElement(ToastProvider, null,
        React.createElement(ActiveBetProvider, null,
          React.createElement(Dice, { gameRow: { name: 'dice', display_name: 'Dice', is_enabled: 1, is_mobile_enabled: 1 } })
        )
      )
    );
    await sleep(160);                       // let React flush the tree
    const wrap = host.querySelector('.css-ui-bet-wrap') || host.querySelector('.ui-bet-wrap');
    ok(!!wrap, 'the wrapper is rendered', host.innerHTML.slice(0, 120));
    ok(!!wrap?.querySelector(':scope > button'),
      'the bet button is a direct child of .ui-bet-wrap (so width:100% lands on it)');
    ok(wrap?.children.length === 1,
      'nothing else sits in the wrapper next to the button while betting is allowed',
      String(wrap?.children.length));
    unmountAll();
  }

  const badgeSrc = readCss('src/components/common/BetLockBadge.jsx');
  ok(/<HazardBadge corner/.test(badgeSrc) && /<Modal/.test(badgeSrc),
    'BetLockBadge renders the badge + the shared Modal');
  ok(/description=\{body\}/.test(badgeSrc), 'the modal uses the same icon/title/description anatomy');

  /* ------------------------------------------------------- §5 scroll up pill */
  console.log('\n=== 5. the app-wide "Scroll up" pill ===');
  {
    const css = readCss('src/components/common/BackToTop.module.css');
    const rule = firstRule(css, '.backToTop');
    ok(/position:\s*fixed/.test(rule), 'it is pinned to the viewport');
    ok(/right:\s*18px/.test(rule), 'it sits in the bottom-RIGHT corner', rule.replace(/\s+/g, ' ').slice(0, 90));
    ok(/bottom:\s*18px/.test(rule), 'and at the bottom edge');
    ok(!/^\s*left:/m.test(css) || /right:\s*14px/.test(css), 'it is never anchored to the left edge');
    ok(/border-radius:\s*999px/.test(rule), 'it is a pill', rule.replace(/\s+/g, ' ').slice(0, 120));
    ok(/transform:\s*translateY\(28px\)/.test(rule), 'it starts parked below the fold', '');
    ok(/\.backToTop\.visible\s*\{[^}]*translateY\(0\)/s.test(css), 'and slides up into view');

    // tooltip: same white plate as the game-toolbar icon buttons, PC only
    const toolbar = firstRule(readCss('src/pages/games.module.css'), '.toolBtn::after');
    const hover = css.slice(css.indexOf('@media (hover: hover) and (pointer: fine)'));
    const tip = firstRule(hover, '.backToTop::after');
    ok(/content:\s*attr\(data-tip\)/.test(tip), 'the tooltip text comes from data-tip');
    for (const prop of ['background: #fff', 'color: #0f212e', 'font-size: 12px', 'font-weight: 700',
      'padding: 4px 8px', 'border-radius: 4px', 'white-space: nowrap']) {
      ok(new RegExp(prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ';?').test(toolbar), `toolbar tooltip uses ${prop}`, toolbar.replace(/\s+/g, ' '));
      ok(new RegExp(prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ';?').test(tip), `the pill tooltip matches: ${prop}`, tip.replace(/\s+/g, ' '));
    }
    ok(/\.backToTop:hover::after\s*\{\s*opacity:\s*1/s.test(hover), 'it appears on hover');
    ok(/@media \(hover: hover\) and \(pointer: fine\)/.test(css), 'and only on devices that really hover (a PC)');

    // mobile: above the fixed bottom navigation bar
    const phone = css.slice(css.indexOf('@media (max-width: 1024px)'));
    ok(/\.backToTop\s*\{[^}]*bottom:\s*calc\(64px/.test(phone),
      'on phones it floats above the 64px bottom nav', phone.slice(0, 140).replace(/\s+/g, ' '));

    const jsx = readCss('src/components/common/BackToTop.jsx');
    ok(/data-tip="Scroll up"/.test(jsx) && /aria-label="Scroll up"/.test(jsx),
      'the label is "Scroll up" (tooltip + screen readers)');
    ok(/<IconArrowUp \/>/.test(jsx) && /IconArrowUp = createIcon\("IconArrowUp", "[^"]+"\); \/\/ arrow-up-bold/.test(readCss('src/components/common/Icons.jsx')),
      'the icon is a solid (bold, filled-path) arrow pointing up');
    ok(/SHOW_AFTER = 300/.test(jsx) && /window\.scrollY > SHOW_AFTER/.test(jsx),
      'it only appears once the user actually scrolls down');
    ok(/window\.addEventListener\("scroll"/.test(jsx) && /removeEventListener\("scroll"/.test(jsx),
      'the scroll listener is cleaned up');
    ok(/scrollTo\(\{ top: 0, behavior: "smooth" \}\)/.test(jsx), 'clicking it scrolls back to the top');

    const app = readCss('src/App.jsx');
    ok(/<BackToTop \/>/.test(app), 'App renders the pill for every route');

    // no page may carry a second, competing back-to-top button
    const betJsx = readCss('src/components/customBets/Pages/Bet.jsx');
    const betCss = readCss('src/components/customBets/Pages/Bet.module.css');
    ok(!/backTop/.test(betJsx) && !/backTop/.test(betCss),
      'the custom-bets page dropped its duplicate back-to-top (one pill per page)');

    // --- behaviour in the DOM
    const { default: BackToTop } = await import('../../src/components/common/BackToTop.jsx');
    let scrolled = null;
    window.scrollTo = (opts) => { scrolled = opts; };
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true });

    const host = mount(React.createElement(BackToTop));
    await sleep(80);
    ok(!host.querySelector('button'), 'it is not rendered while the page is at the top');

    window.scrollY = 900;
    window.dispatchEvent(new window.Event('scroll'));
    ok(await waitFor(() => /visible/.test(host.querySelector('button')?.className ?? ''), 1500),
      'scrolling down brings it in');
    const pill = host.querySelector('button');
    ok(pill?.getAttribute('data-tip') === 'Scroll up', 'it carries the tooltip text', pill?.getAttribute('data-tip'));
    pill.click();
    ok(scrolled && scrolled.top === 0 && scrolled.behavior === 'smooth', 'clicking scrolls to the top', JSON.stringify(scrolled));

    window.scrollY = 0;
    window.dispatchEvent(new window.Event('scroll'));
    ok(await waitFor(() => !host.querySelector('button'), 1500), 'scrolling back to the top hides it again');
    unmountAll();
  }

  /* ------------------------------------------------- §6 bypass permission */
  console.log('\n=== 6. the "bypass disabled games/pages" permission ===');
  {
    const { default: Dice } = await import('../../src/components/games/Dice.jsx');
    const row = { name: 'dice', display_name: 'Dice', is_enabled: 0, is_mobile_enabled: 1 };
    const mountDice = () => mount(
      React.createElement(ToastProvider, null,
        React.createElement(ActiveBetProvider, null, React.createElement(Dice, { gameRow: row }))
      )
    );

    // a normal player: the game is locked
    __auth.user = { id: 1, username: 'tester', role: 'user', balance: 100 };
    let host = mountDice();
    await sleep(120);
    ok(await waitFor(() => !!host.querySelector('.ui-hazard-corner'), 2000),
      'a player without the permission gets the hazard badge');
    ok(host.querySelector('.ui-bet-wrap > button')?.disabled === true, 'and a disabled bet button');
    unmountAll();

    // the permission holder: nothing is locked
    __auth.user = { id: 1, username: 'tester', role: 'user', balance: 100, can_bypass_disabled: 1 };
    host = mountDice();
    await sleep(120);
    ok(!host.querySelector('.ui-hazard-corner'), 'a permission holder sees no badge on a disabled game');
    ok(host.querySelector('.ui-bet-wrap > button')?.disabled === false, 'and can press the bet button');
    unmountAll();

    // the owner always has it
    __auth.user = { id: 1, username: 'owner', role: 'owner', balance: 100 };
    host = mountDice();
    await sleep(120);
    ok(!host.querySelector('.ui-hazard-corner'), 'the owner bypasses disabled games too');
    unmountAll();
    __auth.user = { id: 1, username: 'tester', role: 'user', balance: 100 };

    // the games grid must not call a bypassable game "Unavailable"
    const games = readCss('src/pages/Games.jsx');
    ok(/canBypassDisabled = user\?\.role === "owner" \|\| Boolean\(user\?\.can_bypass_disabled\)/.test(games),
      'the games grid reads the permission');
    ok(/!isImplemented \|\| \(!Boolean\(game\.is_enabled\) && !canBypassDisabled\)/.test(games),
      'and only marks a game Unavailable when the player cannot bypass it');

    // the backend: the same rule, everywhere a game is checked
    const access = readCss('../backend/src/services/gameAccess.js');
    ok(/function canBypassUser\(user\)/.test(access) && /user\.role === "owner"/.test(access),
      'the backend has one bypass rule (owner or the explicit permission)');
    ok(/AsyncLocalStorage/.test(access), 'it travels with the request instead of a global flag');
    const engine = readCss('../backend/src/services/gameEngine.js');
    ok(!/!game\.is_enabled/.test(engine), 'every engine check goes through isGameBlocked()');
    ok((engine.match(/isGameBlocked\(game\)/g) || []).length >= 17,
      'all of them, in all games', String((engine.match(/isGameBlocked\(game\)/g) || []).length));
    const crash = readCss('../backend/src/services/crashHandler.js');
    ok(/if \(isGameBlocked\(game\)\) return fail\(res, 403/.test(crash),
      'crash honours the permission on its own start route');
    const auth = readCss('../backend/src/middleware/auth.js');
    ok(/runWithGameAccess\(canBypassUser\(user\)/.test(auth),
      'authenticateToken opens the scope for the whole request');
  }


  /* ------------------------ §7 filled icons, currency mark, nav + balance */
  console.log('\n=== 7. filled icons, the currency mark, bottom nav + balance box ===');
  {
    const SRC = resolve(here, '../../src');
    const rel = (p) => relative(SRC, p);
    // dead code that nothing imports (see README) is not part of the live UI
    const DEAD = /[/\\](autobet|stocks)[/\\]|components[/\\]dashboard[/\\]|Poker/;
    const walk = (dir) => readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
    const files = walk(SRC).filter((p) => !DEAD.test(p));
    const jsxFiles = files.filter((p) => /\.jsx?$/.test(p));
    const cssFiles = files.filter((p) => /\.css$/.test(p));
    const read = (p) => readFileSync(p, 'utf8');
    const global = readCss('src/styles/global.css');

    // --- 7a: no outlined icon survives anywhere in the live UI
    const outlined = jsxFiles.filter((p) => {
      const t = read(p);
      return /fill="none"\s+stroke="currentColor"/.test(t)
        || /<(path|line|polyline|rect|circle)\b[^>]*\bstroke="currentColor"/.test(t)
        || /<svg\b[^>]*\bstrokeWidth=/.test(t);
    });
    ok(outlined.length === 0, 'no outlined (stroke-drawn) icon is left in any component', outlined.map(rel).join(', '));
    const forced = cssFiles.filter((p) => /svg\s*\{[^}]*(fill:\s*none|stroke:\s*currentColor)/.test(read(p)));
    ok(forced.length === 0, 'no stylesheet forces fill:none / stroke on icon svgs', forced.map(rel).join(', '));
    const strokedUris = cssFiles.filter((p) => /data:image\/svg\+xml[^")]*stroke=/.test(read(p)));
    ok(strokedUris.length === 0, 'CSS data-URI icons (select carets, maintenance badge) are filled too', strokedUris.map(rel).join(', '));

    // --- 7b: the shared icon set: every icon is a solid currentColor shape
    const iconsSrc = readCss('src/components/common/Icons.jsx');
    ok(!/stroke/i.test(iconsSrc.replace(/\/\*[\s\S]*?\*\//g, '')), 'the icon module contains no strokes at all');
    ok(/Phosphor Icons/.test(iconsSrc) && /MIT License/.test(iconsSrc), 'the icon source + licence are credited');
    const Icons = await import('../../src/components/common/Icons.jsx');
    const names = Object.keys(Icons).filter((k) => /^Icon[A-Z]/.test(k));
    ok(names.length >= 50, 'the set covers the whole site', String(names.length));
    {
      const host = mount(React.createElement('div', null, names.map((n) => React.createElement(Icons[n], { key: n }))));
      await sleep(60);
      const svgs = [...host.querySelectorAll('svg')];
      const bad = svgs.filter((svg) => svg.getAttribute('fill') !== 'currentColor'
        || svg.querySelectorAll('path').length !== 1
        || !(svg.querySelector('path')?.getAttribute('d') || '').length
        || svg.querySelector('[stroke]'));
      ok(svgs.length === names.length && bad.length === 0, 'every icon renders ONE filled currentColor path',
        bad.map((b) => b.getAttribute('data-icon')).join(','));
      ok(svgs.every((svg) => svg.getAttribute('aria-hidden') === 'true'), 'icons are decorative by default (aria-hidden)');
      unmountAll();
    }

    // --- 7c: the currency mark: green disc with the "$" cut out
    const { default: CurrencyIcon, CURRENCY_COLOR } = await import('../../src/components/common/CurrencyIcon.jsx');
    {
      const host = mount(React.createElement('div', null,
        React.createElement(CurrencyIcon),
        React.createElement(CurrencyIcon, { size: 20, className: 'extra' })));
      await sleep(40);
      const [a, b] = host.querySelectorAll('svg');
      const path = a?.querySelector('path');
      ok(a?.classList.contains('currency-icon') && a?.getAttribute('viewBox') === '0 0 24 24', 'CurrencyIcon renders the 24x24 mark');
      ok(CURRENCY_COLOR.toUpperCase() === '#25E801' && path?.getAttribute('fill')?.toUpperCase() === '#25E801', 'it is #25E801 green');
      ok(path?.getAttribute('fill-rule') === 'evenodd' && (path?.getAttribute('d').match(/Z/g) || []).length === 2,
        'the "$" is a HOLE in the disc (two contours, even-odd), not paint on top');
      ok(b?.classList.contains('extra') && b?.style.width === '20px' && b?.style.height === '20px', 'size + className props work');
      unmountAll();
    }
    ok(/--color-currency:\s*#25E801/i.test(global) && /\.currency-icon path\s*\{\s*fill:\s*var\(--color-currency\)/.test(global),
      'one token drives the colour of every currency mark');

    // --- 7d: no "$" glyph is used as the currency icon any more
    const moneyFiles = jsxFiles.filter((p) => /[/\\](games|layout)[/\\]|pages[/\\](Home|Dashboard|Admin)\.jsx$/.test(p));
    const glyphs = moneyFiles.filter((p) => { const t = read(p); return />\s*\$\s*<\//.test(t) || /\}\s+\$<\//.test(t); });
    ok(glyphs.length === 0, 'no "$" text glyph stands in for the currency icon', glyphs.map(rel).join(', '));
    {
      __auth.user = { id: 1, username: 'tester', role: 'user', balance: 100 };
      const { default: Dice } = await import('../../src/components/games/Dice.jsx');
      const host = mount(
        React.createElement(ToastProvider, null,
          React.createElement(ActiveBetProvider, null,
            React.createElement(Dice, { gameRow: { name: 'dice', display_name: 'Dice', is_enabled: 1, is_mobile_enabled: 1 } })))
      );
      await sleep(160);
      const coins = host.querySelectorAll('svg.currency-icon');
      ok(coins.length >= 2, 'the game sidebar shows the green mark (bet amount + profit)', String(coins.length));
      const bare = [...host.querySelectorAll('span, div')].filter((el) => !el.children.length && el.textContent.trim() === '$');
      ok(bare.length === 0, 'and no bare "$" is left in it', String(bare.length));
      unmountAll();
    }

    // --- 7e: action icons wear their signature colours through the SHARED
    // icon pipeline (mask + --ui-action-icon-color bound to the accent tokens)
    const bjJsxSrc = readCss('src/components/games/Blackjack.jsx');
    ok(/iconColor="var\(--color-action-hit\)"/.test(bjJsxSrc)
      && /--color-action-hit:\s*#ff9d00/i.test(global),
      'Blackjack: Hit icon is orange #ff9d00');
    ok(/iconColor="var\(--color-action-stand\)"/.test(bjJsxSrc)
      && /--color-action-stand:\s*#9000ff/i.test(global),
      'Blackjack: Stand icon is purple #9000ff');
    const bjSplitBtn = /label="Split"[\s\S]{0,240}?<\/SidebarActionButton>/.exec(bjJsxSrc)?.[0] ?? 'X';
    const bjDoubleBtn = /label="Double"[\s\S]{0,240}?<\/SidebarActionButton>/.exec(bjJsxSrc)?.[0] ?? 'X';
    ok(!/iconColor/.test(bjSplitBtn) && !/iconColor/.test(bjDoubleBtn)
      && /--ui-action-icon-color,\s*currentColor/.test(global),
      'Blackjack: Split / Double icons stay white');
    ok(!/iconColor/.test(readCss('src/components/games/RPS.jsx'))
      && /--ui-action-icon-color,\s*currentColor/.test(global),
      'RPS: the rock / paper / scissors marks are white');
    const flipJsxSrc = readCss('src/components/games/Flip.jsx');
    ok(/markerColor="var\(--color-action-heads\)"/.test(flipJsxSrc)
      && /markerColor="var\(--color-action-tails\)"/.test(flipJsxSrc)
      && /--color-action-heads:\s*#fca311/i.test(global) && /--color-action-tails:\s*#3b82f6/i.test(global),
      'Flip: heads marker is gold #fca311, tails marker is blue #3b82f6');
    ok(/\.multSuffix\s*\{\s*composes:\s*sidebar-input-suffix from global/.test(readCss('src/components/games/crash.module.css'))
      && /color:\s*var\(--color-text-primary\)/.test(firstRule(global, '.sidebar-input-suffix')), "Crash: the × suffix is plain white");
    ok(!/--bitcoin|--accent-warning|color:/.test(firstRule(global, '.sidebar-currency-icon')), 'the sidebar currency slot is no longer orange');

    // --- 7f: mobile bottom nav — labels always white + bold, only icons change
    const bn = readCss('src/components/layout/BottomNav.module.css');
    const label = firstRule(bn, '.label');
    ok(/color:\s*var\(--color-text-primary\)/.test(label), 'bottom-nav labels are always white');
    ok(/font-weight:\s*700/.test(label) && /-webkit-text-stroke:\s*0\.25px currentColor/.test(label), 'and bold (heaviest face + hairline)');
    ok(!/\.(tabActive|tab:hover|tab:active)[^{]*\.label/.test(bn), 'no tab state re-colours the label');
    ok(/color:\s*var\(--color-text-secondary\)/.test(firstRule(bn, '.tab'))
      && /color:\s*var\(--color-text-primary\)/.test(firstRule(bn, '.tabActive')), 'the icon goes secondary -> white on the active tab');
    ok(!/fill:\s*none/.test(bn) && !/(^|[^-])stroke:/.test(bn.replace(/-webkit-text-stroke[^;]*;/g, '')), 'no outline styling on the tab icons');
    const { MemoryRouter, useLocation } = await import('react-router-dom');
    {
      const { default: BottomNav } = await import('../../src/components/layout/BottomNav.jsx');
      const host = mount(React.createElement(MemoryRouter, { initialEntries: ['/games/dice'] }, React.createElement(BottomNav)));
      await sleep(100);
      const tabs = [...host.querySelectorAll('nav button')];
      ok(tabs.length === 4, 'a player sees Home, Casino, Dashboard, Custom Bets', String(tabs.length));
      const active = tabs.filter((b) => b.getAttribute('aria-current') === 'page');
      ok(active.length === 1 && /Casino/.test(active[0].textContent), 'Casino is active on a game route');
      ok(tabs.every((b) => b.querySelector('svg[fill="currentColor"][data-icon]') && !b.querySelector('[stroke]')), 'every tab icon is filled');
      const labelClasses = new Set(tabs.map((b) => b.lastElementChild?.className));
      ok(labelClasses.size === 1, 'active and inactive labels share one class (same white, bold look)', [...labelClasses].join('|'));
      unmountAll();
    }

    // --- 7g: navbar balance box
    const navSrc = readCss('src/components/layout/Navigation.jsx');
    ok(/<BalanceBox \/>/.test(navSrc) && !/styles\.balanceLabel/.test(navSrc), 'the navbar renders the new balance box (readonly field gone)');
    const bcss = readCss('src/components/layout/balanceBox.module.css');
    const boxRule = firstRule(bcss, '.box');
    ok(/border:\s*none/.test(boxRule) && /box-shadow:\s*none/.test(boxRule), 'the box has no border and no shadow');
    ok(/border-radius:\s*var\(--radius-md\)/.test(boxRule), 'its corners are slightly rounded (8px)');
    ok(/background:\s*var\(--color-balance-box-bg\)/.test(firstRule(bcss, '.balanceBtn'))
      && /--color-balance-box-bg:\s*#102230/i.test(global), 'the amount side is #102230');
    ok(/background:\s*var\(--color-balance-wallet-bg\)/.test(firstRule(bcss, '.walletBtn'))
      && /--color-balance-wallet-bg:\s*#2874E1/i.test(global), 'the wallet side is #2874E1');
    const minW = Number((/min-width:\s*(\d+)px/.exec(firstRule(bcss, '.balanceBtn')) || [])[1]);
    const walletW = Number((/width:\s*(\d+)px/.exec(firstRule(bcss, '.walletBtn')) || [])[1]);
    const share = minW / (minW + walletW);
    ok(share >= 0.6 && share <= 0.72, 'the amount side takes ~60-70% of the box', share.toFixed(2));
    ok(/@media \(max-width: 768px\)/.test(bcss) && /@media \(max-width: 380px\)/.test(bcss) && /@media \(max-width: 480px\)/.test(bcss),
      'it has phone breakpoints (and a full-width panel on small phones)');

    const { default: BalanceBox } = await import('../../src/components/layout/BalanceBox.jsx');
    let where = '';
    function Where() { where = useLocation().pathname; return null; }
    const sqlAgo = (ms) => new Date(Date.now() - ms).toISOString().slice(0, 19).replace('T', ' ');
    const TODAY = {
      since: new Date().toISOString(), bets: 6, wagered: 9.5, payout: 12, profit: 2.5,
      recent: [
        { id: 6, game_name: 'limbo', game_display_name: 'Limbo', bet_amount: 2, payout_amount: 0, profit: -2, multiplier: 0, created_at: sqlAgo(120000) },
        { id: 5, game_name: 'dice', game_display_name: 'Dice', bet_amount: 1.5, payout_amount: 3, profit: 1.5, multiplier: 2, created_at: sqlAgo(3 * 3600000) },
        { id: 4, game_name: 'mines', game_display_name: 'Mines', bet_amount: 1, payout_amount: 1, profit: 0, multiplier: 1, created_at: sqlAgo(10000) },
      ],
    };
    const mountBox = () => mount(React.createElement(MemoryRouter, { initialEntries: ['/games/dice'] },
      React.createElement(BalanceBox), React.createElement(Where)));
    const q = (host, id) => host.querySelector(`[data-testid="${id}"]`);

    __auth.user = { id: 1, username: 'tester', role: 'user', balance: 1234.5 };
    __dash.calls.length = 0;
    __dash.fail = false;
    __dash.today = TODAY;
    {
      const host = mountBox();
      await sleep(80);
      const toggle = q(host, 'balance-toggle');
      ok(!!toggle && /1,234\.50/.test(toggle.textContent), 'the amount side shows the balance', toggle?.textContent);
      const order = [...(toggle?.children || [])].map((el) => el.getAttribute('data-icon') || el.querySelector('svg')?.getAttribute('data-icon') || 'amount');
      ok(order.join('>') === 'amount>CurrencyIcon>IconCaretDown', 'amount, then the currency mark, then the small dropdown caret', order.join('>'));
      const wallet = q(host, 'balance-wallet');
      ok(!!wallet?.querySelector('svg[data-icon="IconWallet"]'), 'the right part is a wallet button');
      ok(!q(host, 'balance-panel') && toggle.getAttribute('aria-expanded') === 'false', 'the panel starts closed');
      ok(__dash.calls.length === 0, 'nothing is fetched until it is opened');

      toggle.click();
      ok(await waitFor(() => !!q(host, 'balance-recent'), 2000), "opening it loads today's activity");
      ok(toggle.getAttribute('aria-expanded') === 'true', 'the toggle reports it is open');
      const mid = new Date(); mid.setHours(0, 0, 0, 0);
      ok(__dash.calls.length === 1 && __dash.calls[0]?.since === mid.toISOString(),
        '"today" starts at the LOCAL midnight', JSON.stringify(__dash.calls));
      const panel = q(host, 'balance-panel');
      ok(/\+2\.50/.test(q(host, 'balance-profit')?.textContent), "today's profit, signed", q(host, 'balance-profit')?.textContent);
      ok(/9\.50/.test(q(host, 'balance-wagered')?.textContent) && /6 bets/.test(q(host, 'balance-wagered')?.textContent),
        "today's wagered amount (and bet count)", q(host, 'balance-wagered')?.textContent);
      const rows = [...panel.querySelectorAll('[data-testid="balance-recent"] li')];
      ok(rows.length === 3, 'the 3 most recent bets are listed', String(rows.length));
      ok(/Limbo/.test(rows[0]?.textContent) && /\u22122\.00/.test(rows[0]?.textContent) && /0\.00×/.test(rows[0]?.textContent)
        && /2m ago/.test(rows[0]?.textContent) && /Bet 2\.00/.test(rows[0]?.textContent),
        'each row: game, result, multiplier, time, stake', rows[0]?.textContent);
      ok(/\+1\.50/.test(rows[1]?.textContent) && /3h ago/.test(rows[1]?.textContent), 'wins read as +, older ones in hours', rows[1]?.textContent);
      ok(/just now/.test(rows[2]?.textContent), 'and a moment ago reads "just now"', rows[2]?.textContent);
      ok(panel.querySelectorAll('svg.currency-icon').length >= 5, 'amounts carry the green currency mark');
      ok(!panel.querySelector('input'), 'no readonly-input look: the panel has no inputs at all');

      panel.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
      await sleep(60);
      ok(!!q(host, 'balance-panel'), 'pressing inside the panel keeps it open');
      document.body.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
      ok(await waitFor(() => !q(host, 'balance-panel'), 1000), 'pressing outside closes it');

      toggle.click();
      ok(await waitFor(() => __dash.calls.length === 2, 1000), 'reopening fetches fresh numbers');
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      ok(await waitFor(() => !q(host, 'balance-panel'), 1000), 'Escape closes it');

      toggle.click();
      await waitFor(() => !!q(host, 'balance-panel'), 1000);
      wallet.click();
      ok(await waitFor(() => where === '/dashboard', 1000), 'the wallet button opens the Dashboard', where);
      ok(await waitFor(() => !q(host, 'balance-panel'), 1000), 'and navigating away closes the panel');
      unmountAll();
    }
    {
      // failure -> message + Retry; retry recovers
      __dash.fail = true;
      const host = mountBox();
      await sleep(60);
      q(host, 'balance-toggle').click();
      ok(await waitFor(() => /Stats are down/.test(q(host, 'balance-panel')?.textContent || ''), 1500), 'a failed load says so');
      const retry = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Retry');
      ok(!!retry, 'and offers Retry');
      __dash.fail = false;
      retry?.click();
      ok(await waitFor(() => !!q(host, 'balance-recent'), 1500), 'Retry loads the stats');
      unmountAll();
    }
    {
      // a new player: zeros + a friendly empty state
      __dash.today = { since: TODAY.since, bets: 0, wagered: 0, payout: 0, profit: 0, recent: [] };
      const host = mountBox();
      await sleep(60);
      q(host, 'balance-toggle').click();
      ok(await waitFor(() => /No bets yet/.test(q(host, 'balance-panel')?.textContent || ''), 1500), 'no bets -> an empty state, not a blank list');
      ok(/0\.00/.test(q(host, 'balance-profit')?.textContent) && !/[+\u2212]/.test(q(host, 'balance-profit')?.textContent),
        'zero profit is unsigned', q(host, 'balance-profit')?.textContent);
      unmountAll();
    }
    __auth.user = { id: 1, username: 'tester', role: 'user', balance: 100 };
    __dash.today = null;
  }

  /* ------------------------------------------- §8 blackjack round timing */
  console.log('\n=== 8. Blackjack: dealt blackjack + the reveal gate on the bet button ===');
  {
    const { default: Blackjack } = await import('../../src/components/games/Blackjack.jsx');
    // NOTE: `globalThis`, never `global` — esbuild hoists the §7 CSS string
    // also named `global` into this scope and the reference would hit it.
    const realFetch = globalThis.fetch;
    const C = (r, s = 'spades') => ({ id: `${r}-${s}`, r, s });
    let answer = null;                    // what the next fetch resolves with
    globalThis.fetch = async () => ({ ok: true, json: async () => answer });

    const bjRow = { name: 'blackjack', display_name: 'Blackjack', is_enabled: 1, is_mobile_enabled: 1 };
    const mountBj = () => mount(
      React.createElement(ToastProvider, null,
        React.createElement(ActiveBetProvider, null,
          React.createElement(Blackjack, { gameRow: bjRow })))
    );
    const betBtn = (host) => host.querySelector('.sidebar-bet-button');
    const standBtn = (host) => [...host.querySelectorAll('button')].find((b) => /Stand/.test(b.textContent));
    const bet = async (host, payload) => {
      answer = payload;
      setInputValue(host.querySelector('input[type=number]'), '10');
      await sleep(60);
      betBtn(host)?.click();
    };
    // the dealer's second card is the hole card (last slot of the top fan)
    const holeUp = (host) => /css-flipFaceUp/.test(
      host.querySelectorAll('.css-fanTop .css-cardSlot')[1]?.querySelector('.css-flipWrap')?.className ?? ''
    );
    const playerCards = (host) => host.querySelector('.css-fanBottom .css-cardSlot .css-card')?.className ?? '';

    // --- a DEALT blackjack: the standard win treatment (no gold state) +
    //     popup only once the cards have finished flipping, and the hole
    //     turns over inside the deal
    const host = mountBj();
    await sleep(80);
    await bet(host, {
      success: true,
      gameState: {
        roundId: 'bj1', status: 'finished', activeHandIndex: 0,
        playerHands: [[C('A', 'spades'), C('K', 'hearts')]],
        dealerHand: [C('9', 'clubs'), C('7', 'diamonds')],
        handTotals: [21], handBets: [10], handOutcomes: ['win'], payout: 25,
        dealerTotal: 16, dealerShownTotal: 16, balance: 125,
      },
    });
    await sleep(560);
    ok(betBtn(host)?.disabled === true, 'a dealt round keeps the bet button disabled');
    ok(!host.querySelector('.ui-win-popup'), 'no win popup while the cards are still dealing');
    ok(!/cardOutlineWin/.test(playerCards(host)), 'no outcome border before the cards land');
    ok(!holeUp(host), 'the hole card is still face-down while it flies');
    await sleep(1500);                    // the player's cards have flipped, the hole is turning
    ok(holeUp(host), 'the dealt hole card is turned over during the deal itself');
    ok(!host.querySelector('.ui-win-popup'), 'still no popup while that reveal is running');
    ok(await waitFor(() => !!host.querySelector('.ui-win-popup'), 2500),
      'the win popup lands only after the flips are done');
    ok(/cardOutlineWin/.test(playerCards(host)), 'a natural 21 settles in the standard win green', playerCards(host));
    ok(!!host.querySelector('.css-totalWin'), 'and the standard win total tone');
    ok(!/cardOutlinePush|cardOutlineLose/.test(playerCards(host)),
      'a natural 21 wears no push/loss border and nothing gold');
    ok(await waitFor(() => betBtn(host)?.disabled === false, 1500),
      'the bet button re-arms once the round is fully revealed');
    unmountAll();
    await sleep(60);

    // --- Stand: the dealer draws in the same response, so the bet button
    //     must stay disabled until that whole turn has been revealed
    const host2 = mountBj();
    await sleep(80);
    await bet(host2, {
      success: true,
      gameState: {
        roundId: 'bj2', status: 'player_turn', activeHandIndex: 0,
        playerHands: [[C('10', 'spades'), C('9', 'hearts')]],
        dealerHand: [C('5', 'clubs'), { hidden: true }],
        handTotals: [19], handBets: [10], handOutcomes: [null], payout: 0,
        dealerTotal: 15, dealerShownTotal: 5, balance: 115,
      },
    });
    await sleep(200);
    ok(!!standBtn(host2) && !standBtn(host2).disabled, 'the hand is playable');
    answer = {
      success: true,
      gameState: {
        roundId: 'bj2', status: 'finished', activeHandIndex: 0,
        playerHands: [[C('10', 'spades'), C('9', 'hearts')]],
        dealerHand: [C('5', 'clubs'), C('2', 'diamonds'), C('K', 'spades')],
        handTotals: [19], handBets: [10], handOutcomes: ['lose'], payout: 0,
        dealerTotal: 17, dealerShownTotal: 17, balance: 115,
      },
    };
    standBtn(host2).click();
    await sleep(400);
    ok(betBtn(host2)?.disabled === true, 'the bet button stays disabled while the dealer is still drawing');
    ok(!/cardOutlineLose/.test(playerCards(host2)), 'and the cards are not styled as a loss yet');
    ok(/Profit on Win/.test(host2.textContent) && /at risk/.test(host2.textContent)
      && !/Round lost|Round won|Round settled|Net Result/.test(host2.textContent),
      'the sidebar keeps the in-progress readout while the dealer draws — the result is not leaked early',
      host2.textContent.slice(0, 200));
    ok(await waitFor(() => betBtn(host2)?.disabled === false, 2500),
      'it re-arms only once the round result is on screen');
    ok(/cardOutlineLose/.test(playerCards(host2)), 'the loss border arrives with the reveal');
    ok(/Net Result/.test(host2.textContent) && /Round lost/.test(host2.textContent),
      'the settled readout lands with the reveal and says Round lost', host2.textContent.slice(0, 200));
    ok(betBtn(host2)?.textContent.trim() === 'Bet',
      'the re-armed bet button says Bet (the settled label is not New Bet)', betBtn(host2)?.textContent);
    unmountAll();
    await sleep(60);

    // --- a DEALER blackjack: the hole turns over inside the deal — before any
    //     player option — and the loss styling may only land after that flip
    //     has completely finished (never with it)
    const host3 = mountBj();
    await sleep(80);
    await bet(host3, {
      success: true,
      gameState: {
        roundId: 'bj3', status: 'finished', activeHandIndex: 0,
        playerHands: [[C('10', 'spades'), C('9', 'hearts')]],
        dealerHand: [C('A', 'clubs'), C('K', 'diamonds')],
        handTotals: [19], handBets: [10], handOutcomes: ['lose'], payout: 0,
        dealerTotal: 21, dealerShownTotal: 21, balance: 115,
      },
    });
    // deal: P0 [0,400] D0 [500,900] P1 [1000,1400] D1 [1500,1900] → flip 1900-2650
    await sleep(1250);
    ok(betBtn(host3)?.disabled === true, 'a dealt dealer blackjack keeps the bet button disabled');
    ok(standBtn(host3)?.disabled === true, 'and the player can not act while the hole card is down');
    ok(!holeUp(host3), 'the dealer hole card is face-down when it lands');
    ok(!/cardOutlineLose/.test(playerCards(host3)), 'the cards are not styled as a loss yet');
    await sleep(750);
    ok(holeUp(host3), 'the hole is turned over INSIDE the deal (right after it lands)');
    ok(!/cardOutlineLose/.test(playerCards(host3)) && !host3.querySelector('.css-totalLose'),
      'and NOTHING wears the loss styling while that flip is still running');
    ok(await waitFor(() => /cardOutlineLose/.test(playerCards(host3)), 2500),
      'the loss border lands once the second card is fully revealed');
    ok(!!host3.querySelector('.css-totalLose'), 'the total pill takes the loss tone with it');
    ok(betBtn(host3)?.disabled === false, 'and only then is a new bet armed');
    unmountAll();
    await sleep(60);

    // --- card geometry: one source of truth (the CSS tokens), stepped down
    //     for phones so the JS number and the stylesheet can never drift
    const bjCss = readCss('src/components/games/blackjack.module.css');
    const desktop = firstRule(bjCss, '.container');
    const phone = bjCss.slice(bjCss.indexOf('@media (max-width: 600px)'), bjCss.indexOf('@media (max-width: 420px)'));
    const token = (src, name) => Number.parseFloat(new RegExp(`--${name}:\\s*([0-9.]+)px`).exec(src)?.[1] ?? 'NaN');
    ok(token(desktop, 'bj-card-w') > token(phone, 'bj-card-w') && token(desktop, 'bj-card-h') > token(phone, 'bj-card-h'),
      'phones step the card size down',
      `${token(desktop, 'bj-card-w')}x${token(desktop, 'bj-card-h')} -> ${token(phone, 'bj-card-w')}x${token(phone, 'bj-card-h')}`);
    ok(token(phone, 'bj-rank-size') < token(desktop, 'bj-rank-size')
      && token(phone, 'bj-suit-size') < token(desktop, 'bj-suit-size')
      && token(phone, 'bj-overlap-x') < token(desktop, 'bj-overlap-x'),
      'rank, suit and the cascade follow the smaller card');
    ok(/width:\s*var\(--bj-card-w\)/.test(bjCss) && /height:\s*var\(--bj-card-h\)/.test(bjCss),
      'cards and slots read the tokens instead of hard-coding a size');
    const bjJsx = readCss('src/components/games/Blackjack.jsx');
    ok(/getComputedStyle/.test(bjJsx) && /--bj-card-w/.test(bjJsx) && /--bj-overlap-x/.test(bjJsx),
      'the fan seats + deck flight are measured from the same tokens');

    // --- contracts: the split-hand indicator is the result-state treatment
    //     in plain light blue, a natural 21 settles as a plain win, the total
    //     pill carries no outline, insurance buttons carry no icons, and the
    //     sidebar result readout is gated on the reveal
    ok(!/handWrapActive/.test(bjCss) && !/content:\s*["']YOUR TURN/.test(bjCss),
      'no glow / "YOUR TURN" pill chrome survives — the indicator is outline + pill only');
    ok(/cardOutlineActive/.test(bjCss) && /\.totalActive/.test(bjCss) && /cardOutlineActive/.test(bjJsx),
      'the active split hand wears the plain outline + pill treatment');
    ok(!/cardOutlineBlackjack|totalBlackjack|blackjack-gold/.test(bjCss) && !/cardOutlineBlackjack|totalBlackjack/.test(bjJsx),
      'a natural 21 has no state of its own — it settles as a plain win');
    ok(!/0 0 0 2px var\(--color-bg-game\)/.test(bjCss),
      'the total pill carries no outline / border ring in any state');
    const globals = readCss('src/styles/global.css');
    ok(!/color-blackjack-active:\s*var\(--color-accent-red\)/.test(globals)
      && /color-blackjack-active:\s*#[0-9a-fA-F]{6}/.test(globals),
      'the turn indicator token is a plain light blue, not the accent red');
    ok(!/marker=/.test(bjJsx), 'insurance buttons carry no marker icons — single-row labels');
    ok(/resultShown = ui\.showResult/.test(bjJsx),
      'the sidebar result readout is gated on the reveal, not on the stand response');

    unmountAll();
    globalThis.fetch = realFetch;
    await sleep(60);
  }

  /* ------------- §8b split turn indicator + tile dim + wrap-proof rows ---- */
  console.log('\n=== 8b. Split-hand turn indicator timing + post-round tile dim + wrap-proof rows ===');
  {
    const { default: Blackjack } = await import('../../src/components/games/Blackjack.jsx');
    const realFetch = globalThis.fetch;
    const C = (r, s = 'spades') => ({ id: `${r}-${s}`, r, s });
    let answer = null;
    globalThis.fetch = async () => ({ ok: true, json: async () => answer });

    const bjRow = { name: 'blackjack', display_name: 'Blackjack', is_enabled: 1, is_mobile_enabled: 1 };
    const mountBj = () => mount(
      React.createElement(ToastProvider, null,
        React.createElement(ActiveBetProvider, null,
          React.createElement(Blackjack, { gameRow: bjRow })))
    );
    const betBtn = (host) => host.querySelector('.sidebar-bet-button');
    const btn = (host, re) => [...host.querySelectorAll('button')].find((b) => re.test(b.textContent));
    const handWraps = (host) => [...host.querySelectorAll('.css-handWrap')];
    const turnOn = (host, i) => handWraps(host)[i]?.getAttribute('aria-current') === 'step';

    // --- split hands: standing on the first hand must NOT shove the turn
    //     indicator onto the next hand while card flips are still running
    const host = mountBj();
    await sleep(80);
    answer = {
      success: true,
      gameState: {
        roundId: 'sp1', status: 'player_turn', activeHandIndex: 0,
        playerHands: [[C('8', 'spades'), C('8', 'hearts')]],
        dealerHand: [C('5', 'clubs'), { hidden: true }],
        handTotals: [16], handBets: [10], handOutcomes: [null], payout: 0,
        dealerTotal: 5, dealerShownTotal: 5, balance: 105,
      },
    };
    setInputValue(host.querySelector('input[type=number]'), '10');
    await sleep(60);
    betBtn(host)?.click();
    await sleep(250);
    answer = {
      success: true,
      gameState: {
        roundId: 'sp1', status: 'player_turn', activeHandIndex: 0,
        playerHands: [[C('8', 'spades'), C('2', 'diamonds')], [C('8', 'hearts'), C('3', 'clubs')]],
        dealerHand: [C('5', 'clubs'), { hidden: true }],
        handTotals: [10, 11], handBets: [10, 10], handOutcomes: [null, null], payout: 0,
        dealerTotal: 5, dealerShownTotal: 5, balance: 95,
      },
    };
    btn(host, /Split/)?.click();
    await sleep(120);
    ok(turnOn(host, 0), 'a fresh split shows the indicator on the first hand');
    ok(!turnOn(host, 1), 'and never on two hands at once');
    // stand IMMEDIATELY — the split's fresh cards are still flipping
    answer = {
      success: true,
      gameState: {
        roundId: 'sp1', status: 'player_turn', activeHandIndex: 1,
        playerHands: [[C('8', 'spades'), C('2', 'diamonds')], [C('8', 'hearts'), C('3', 'clubs')]],
        dealerHand: [C('5', 'clubs'), { hidden: true }],
        handTotals: [10, 11], handBets: [10, 10], handOutcomes: [null, null], payout: 0,
        dealerTotal: 5, dealerShownTotal: 5, balance: 95,
      },
    };
    btn(host, /Stand/)?.click();
    await sleep(150);
    ok(turnOn(host, 0), 'standing on hand 1 keeps the indicator there while card flips are still running');
    ok(!turnOn(host, 1), 'it has not jumped to the next hand mid-flip');
    ok(await waitFor(() => turnOn(host, 1), 3500),
      'and it moves to the next hand only once the flips are fully complete');
    ok(!turnOn(host, 0), 'exactly one hand wears the indicator');
    unmountAll();
    await sleep(60);

    // --- a normal single hand NEVER wears the turn indicator
    const hostSolo = mountBj();
    await sleep(80);
    answer = {
      success: true,
      gameState: {
        roundId: 'sp2', status: 'player_turn', activeHandIndex: 0,
        playerHands: [[C('10', 'spades'), C('9', 'hearts')]],
        dealerHand: [C('5', 'clubs'), { hidden: true }],
        handTotals: [19], handBets: [10], handOutcomes: [null], payout: 0,
        dealerTotal: 5, dealerShownTotal: 5, balance: 105,
      },
    };
    setInputValue(hostSolo.querySelector('input[type=number]'), '10');
    await sleep(60);
    betBtn(hostSolo)?.click();
    await sleep(300);
    ok(!turnOn(hostSolo, 0), 'a single (unsplit) hand never wears the turn indicator');
    unmountAll();
    globalThis.fetch = realFetch;
    await sleep(60);

    // --- post-round tile dim: clicked tiles stay bright; the other revealed
    //     tiles darken only from 1s after the round end, with a brief fade
    const minesCss = readCss('src/components/games/mines.module.css');
    const minesJsx = readCss('src/components/games/Mines.jsx');
    ok(/POST_ROUND_DIM_MS = 1000/.test(minesJsx) && /armPostRoundDim/.test(minesJsx),
      'Mines arms its post-round darkening 1s after the round ends');
    ok(/postRoundDim && isRevealed && !userPressed/.test(minesJsx),
      'only the auto-revealed tiles darken — clicked tiles keep normal opacity');
    ok(/transition: transform 0s ease, background-color 0.35s ease, opacity 0.3s ease/.test(minesCss),
      'the darkening is a brief fade, never an instant dim');
    const towerCss = readCss('src/components/games/tower.module.css');
    ok(/\.tile\.tileAutoRevealed/.test(towerCss) && /opacity: 0\.7/.test(towerCss)
      && /\.tile \{[^}]*transition: opacity 0.3s ease/.test(towerCss),
      "Tower's auto-revealed tiles fade into the dim as they land, never popping dark");

    // --- wrap-proof control rows: when a label wraps to two lines the row's
    //     buttons shift down together (margin-top: auto bottom-aligns the
    //     controls) in every [label above control] layout
    ok(/margin-top: auto/.test(readCss('src/components/games/dice.module.css'))
      && /margin-top: auto/.test(readCss('src/components/games/limbo.module.css'))
      && /margin-top: auto/.test(readCss('src/styles/global.css'))
      && /margin-top: auto/.test(readCss('src/pages/games.module.css')),
      'dice, limbo, the shared hover boxes and the games stats grid bottom-align their controls');
  }

  /* --------------------- §9 Dice / Limbo: pills + marker in ONE overlay row */
  console.log('\n=== 9. Dice / Limbo: the history marker sits in the pills row (overlay) ===');
  {
    for (const [name, cssFile] of [['Dice', 'dice'], ['Limbo', 'limbo']]) {
      const { default: Game } = await import(`../../src/components/games/${name}.jsx`);
      const host = mount(
        React.createElement(ToastProvider, null,
          React.createElement(ActiveBetProvider, null,
            React.createElement(Game, {
              gameRow: { name: name.toLowerCase(), display_name: name, is_enabled: 1, is_mobile_enabled: 1 },
            })))
      );
      await sleep(140);
      const row = host.querySelector('.ui-history-row');
      ok(!!row?.querySelector('.ui-history-scroll'), `${name}: the pills scroller renders inside the row`);
      ok(!!row?.querySelector('.ui-history-meta'),
        `${name}: the My-bets marker is in the SAME row as the pills`);
      ok(row?.querySelector('.ui-history-meta')?.previousElementSibling?.className.includes('ui-history-scroll'),
        `${name}: pills first, marker after them (pills left, marker right)`);
      unmountAll();

      const css = readCss(`src/components/games/${cssFile}.module.css`);
      const globalCss = readCss('src/styles/global.css');
      const scopedRow = /\.ui-history-row--overlay\s*\{([^}]*)\}/.exec(globalCss)?.[1] ?? '';
      ok(/position:\s*absolute/.test(scopedRow),
        `${name}: the row is an overlay (absolute), so it never joins the layout flow`, scopedRow.replace(/\s+/g, ' '));
      ok(/top:\s*var\(--stage-pad/.test(scopedRow) && /left:\s*var\(--stage-pad/.test(scopedRow)
        && /right:\s*var\(--stage-pad/.test(scopedRow),
        `${name}: it is pinned to the stage's top strip`);
      const scopedMeta = /\.ui-history-row \.ui-history-meta\s*\{([^}]*)\}/.exec(globalCss)?.[1] ?? '';
      ok(/margin:\s*0/.test(scopedMeta),
        `${name}: the marker adds no extra height to the row`, scopedMeta.replace(/\s+/g, ' '));
      const stage = /\.gameStage\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
      ok(/--history-strip:/.test(stage) && /padding-top:\s*calc\(var\(--stage-pad\)\s*\+\s*var\(--history-strip\)\)/.test(stage),
        `${name}: the stage RESERVES the strip with padding, so the overlay can never push the game down`);
    }
  }

  /* --- §10 Blackjack: the deal chain, the centred hand, the travelling label */
  console.log('\n=== 10. Blackjack: chained deal, a centred hand, a total label that tracks it ===');
  {
    const { default: Blackjack } = await import('../../src/components/games/Blackjack.jsx');
    const realFetch = globalThis.fetch;
    let answer = null;
    globalThis.fetch = async () => ({ ok: true, json: async () => answer });
    const C = (r, s = 'spades') => ({ id: `${r}-${s}`, r, s });
    const bjRow = { name: 'blackjack', display_name: 'Blackjack', is_enabled: 1, is_mobile_enabled: 1 };

    const host = mount(
      React.createElement(ToastProvider, null,
        React.createElement(ActiveBetProvider, null,
          React.createElement(Blackjack, { gameRow: bjRow })))
    );
    await sleep(80);

    // ---- the stylesheet contracts: the glide and the label's anchors
    const bjCss = readCss('src/components/games/blackjack.module.css');
    const slotRule = /\.cardSlot\s*\{([^}]*)\}/.exec(bjCss)?.[1] ?? '';
    const shiftMs = /--bj-shift:\s*([0-9]+)ms/.exec(bjCss)?.[1];
    // the width the layout uses: the CSS token (what Blackjack.jsx reads, and
    // what its CARD_GEOM_FALLBACK mirrors — jsdom cannot read custom props)
    const cardW = Number.parseFloat(/--bj-card-w:\s*([0-9.]+)px/.exec(bjCss)?.[1] ?? 'NaN');
    const cardH = Number.parseFloat(/--bj-card-h:\s*([0-9.]+)px/.exec(bjCss)?.[1] ?? 'NaN');
    ok(/transition:\s*transform\s+var\(--bj-shift/.test(slotRule),
      'a card glides between seats — that is the hand re-centring itself', slotRule.replace(/\s+/g, ' ').slice(0, 90));
    ok(shiftMs === '400',
      'the glide lasts exactly one deal flight, so it ends the moment the new card lands', shiftMs);
    const pillRule = /\.totalPillDark,[\s\S]*?\{([^}]*)\}/.exec(bjCss)?.[1] ?? '';
    ok(/right:\s*0/.test(pillRule) && /bottom:\s*100%/.test(pillRule),
      'the player total label is anchored by its own right/bottom edges');
    const darkRule = /\.totalPillDark\s*\{([^}]*)\}/.exec(bjCss.replace(/\.totalPillDark,/, '.totalPillDarkX,'))?.[1] ?? '';
    ok(/top:\s*0/.test(darkRule) && /bottom:\s*auto/.test(darkRule) && /top\s+var\(--bj-shift/.test(darkRule),
      'the dealer label is top-anchored and transitions its top edge with the glide',
      darkRule.replace(/\s+/g, ' ').slice(0, 90));
    ok(/\.ribbon\s*\{[^}]*z-index:\s*1/.test(bjCss)
      && /\.dealerArea\s*\{[^}]*z-index:\s*2/.test(bjCss)
      && /\.playerArea\s*\{[^}]*z-index:\s*2/.test(bjCss),
      'the pays-3:2 sign is the lowest gameplay layer — both card areas stack above it');
    const bjJsxFlat = readCss('src/components/games/Blackjack.jsx');
    ok(/const fromX = Math\.round\(deckCx - geom\.w \/ 2 - seatX\);/.test(bjJsxFlat)
      && /const fromY = Math\.round\(deckCy - geom\.h \/ 2 - seatY\);/.test(bjJsxFlat)
      && !/DEAL_FLATTEN/.test(bjJsxFlat),
      'every card starts flying from the deck entity centre — one shared origin for dealer and player (no reshaped diagonal)');
    ok(/var\(--deal-from-x, 230px\), var\(--deal-from-y, -270px\)/.test(bjCss),
      'and the pre-measurement fallback vector is the same deck-origin diagonal');
    ok(/playerInset - dealerInset/.test(bjJsxFlat),
      'the dealer band is shifted by the measured stage insets, so the VISIBLE gap above the dealer label equals the visible gap below the player hand');
    ok(!/translateX\(-50%\)/.test(pillRule) && !/left:\s*50%/.test(pillRule),
      '...never by a centred translate (it is no longer centred over the hand)');
    const bjJsx = readCss('src/components/games/Blackjack.jsx');
    ok(/const DEAL_STEP_MS = DEAL_FLIGHT_MS;/.test(bjJsx),
      'the deal step IS one flight (see below for what it chains to)');

    // ---- the deal chain: every card starts moving the instant the previous
    //      card ARRIVES and its flip begins
    answer = {
      success: true,
      gameState: {
        roundId: 'c1', status: 'player_turn', activeHandIndex: 0,
        playerHands: [[C('10', 'spades'), C('9', 'hearts')]],
        dealerHand: [C('5', 'clubs'), { hidden: true }],
        handTotals: [19], handBets: [10], handOutcomes: [null], payout: 0,
        dealerTotal: 15, dealerShownTotal: 5, balance: 115,
      },
    };
    setInputValue(host.querySelector('input[type=number]'), '10');
    await sleep(60);
    const t0 = Date.now();
    host.querySelector('.sidebar-bet-button').click();
    await sleep(160);

    const motions = [...host.querySelectorAll('.css-cardMotion')].map((m) => {
      const wrap = m.querySelector('.css-flipWrap');
      return {
        start: Number.parseFloat(m.style.animationDelay),
        flip: Number.parseFloat(wrap?.style.getPropertyValue('--deal-flip-delay') ?? ''),
      };
    }).filter((r) => Number.isFinite(r.start)).sort((a, b) => a.start - b.start);

    ok(motions.length === 4, 'the opening deal puts four cards on its way', String(motions.length));
    ok(motions.every((m, i) => i === 0 || Math.abs((m.start - motions[i - 1].start) - 400) < 0.01),
      'each card starts exactly one flight (400ms) after the card before it',
      JSON.stringify(motions.map((m) => m.start)));
    const flipped = motions.filter((m) => Number.isFinite(m.flip));
    ok(flipped.length === 3, 'three of them deal-flip (the hole card waits for its reveal)', String(flipped.length));
    ok(flipped.every((m, i) => Math.abs(m.flip - motions[i + 1].start) < 0.01),
      'and the NEXT card starts on the very frame that flip begins — never partway through it, never after it',
      JSON.stringify(flipped.map((m) => `${m.flip}->${motions[flipped.indexOf(m) + 1]?.start}`)));

    // ---- the hand is a centred group, and the label tracks it
    const tr = (el) => {
      const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(el?.style.transform ?? '');
      return m ? { x: Number.parseFloat(m[1]), y: Number.parseFloat(m[2]) } : null;
    };
    const playerCards = () => [...host.querySelectorAll('.css-fanBottom .css-cardSlot')];
    const playerPill = () => host.querySelector('.css-totalPillPlayer');
    const pillBox = (p) => ({ right: Number.parseFloat(p.style.right), bottom: Number.parseFloat(p.style.bottom) });
    const pillTop = (p) => Number.parseFloat(p.style.top);
    // jsdom measures the fans at height 0, so the app's own band below the
    // player's last card is -(lastY + cardH) — the same number the app puts
    // on the dealer pill's top edge (tableVerticalGap).
    const playerGapBelow = () => {
      const cards = playerCards();
      const last = tr(cards[cards.length - 1]);
      return -(last.y + cardH);
    };
    const LABEL_H = 24; // blackjack.module.css pill height (jsdom has no layout)

    // ---- the label is UP WITH THE FIRST CARD, and it starts at the
    //      one-card position (it must not spawn at the two-card layout)
    ok(await waitFor(() => !!playerPill(), 900),
      'the total label is on the table as soon as the FIRST card lands');
    const first = { pill: pillBox(playerPill()), text: playerPill().textContent, c0: tr(playerCards()[0]), c1: tr(playerCards()[1]) };
    ok(/^10$/.test(first.text), "…showing that card's single-card total, not the two-card one", first.text);
    ok(Math.abs(-first.pill.right - (first.c0.x + cardW)) < 0.01,
      "its right edge sits on the first card's right edge (the one-card alignment)",
      `label ${-first.pill.right} vs card ${first.c0.x + cardW}`);
    ok(Math.abs(-first.pill.bottom - first.c0.y) < 0.01,
      "its bottom edge on the first card's top edge (no gap), and NOT on the incoming card yet",
      `label ${-first.pill.bottom} vs card ${first.c0.y}`);
    ok(Math.abs(-first.pill.right - (first.c1.x + cardW)) > 1,
      'it is not standing at the two-card position while the hand still holds one card');

    // ---- the moment the SECOND card starts flying the hand re-centres and
    //      the label travels with it (still not counting the card in flight)
    ok(await waitFor(() => Math.abs(pillBox(playerPill()).right - first.pill.right) > 1, 1200),
      'the label then moves with the hand as the second card arrives');
    const second = { pill: pillBox(playerPill()), text: playerPill().textContent, c0: tr(playerCards()[0]), c1: tr(playerCards()[1]) };
    ok(Math.abs(-second.pill.right - (second.c1.x + cardW)) < 0.01,
      "its right edge is now on the NEW last card's right edge (the two-card alignment)",
      `label ${-second.pill.right} vs card ${second.c1.x + cardW}`);
    ok(Math.abs(-second.pill.bottom - second.c0.y) < 0.01,
      "its bottom edge still on the (moved) first card's top edge",
      `label ${-second.pill.bottom} vs card ${second.c0.y}`);
    ok(Math.abs((second.pill.right - first.pill.right) - (second.c0.x - first.c0.x)) < 0.01,
      'it travels exactly as far as the cards shift — one motion',
      `label ${first.pill.right} -> ${second.pill.right}, card ${first.c0.x} -> ${second.c0.x}`);
    ok(second.text === first.text,
      'the arriving card is NOT counted while it is still in the air', `${first.text} -> ${second.text}`);

    // ---- the dealer's label follows the same rule. Its first card lands at
    //      800ms (player card #2 lands at 1200ms), so this samples inside the
    //      dealer's own one-card window — never waiting for the hole card
    const dealerCards = () => [...host.querySelectorAll('.css-fanTop .css-cardSlot')];
    const dealerPill = () => host.querySelector('.css-totalPillDark');
    ok(await waitFor(() => !!dealerPill(), 1000),
      "the dealer's label is up with ITS first card too");
    const dFirst = { pill: pillBox(dealerPill()), top: pillTop(dealerPill()), text: dealerPill().textContent, c0: tr(dealerCards()[0]) };
    ok(/^5$/.test(dFirst.text),
      'showing only the card that has landed (the hole card stays out of the total)',
      dFirst.text);
    ok(Math.abs(-dFirst.pill.right - (dFirst.c0.x + cardW)) < 0.01
      && Math.abs(dFirst.c0.y - dFirst.top - LABEL_H) < 0.01,
      "anchored to ITS OWN hand's one card — right edge on it, bottom edge on its top (top-anchored one label-height up)",
      JSON.stringify({ pill: dFirst.pill, top: dFirst.top, c0: dFirst.c0 }));
    ok(Math.abs(-dFirst.pill.right - (tr(dealerCards()[1]).x + cardW)) > 1,
      'and not yet standing at the hole card it has not counted');
    ok(Math.abs(dFirst.top - playerGapBelow()) < 0.01,
      'SYMMETRY: the band above the dealer label equals the band below the player\'s last card',
      `dealer ${dFirst.top} vs player ${playerGapBelow()}`);

    ok(await waitFor(() => /^19$/.test(playerPill()?.textContent ?? ''), 900),
      'the player total counts the second card the moment it lands (live, no wait for the flip)',
      playerPill()?.textContent);

    // the dealer's hand steps up as its hole card arrives, and the label rides
    // along with it (its own hand — never the player's)
    ok(await waitFor(() => Math.abs(tr(dealerCards()[0]).x - dFirst.c0.x) > 1, 900),
      'the dealer hand then steps up as its hole card arrives');
    ok(Math.abs(tr(dealerCards()[0]).y - pillTop(dealerPill()) - LABEL_H) < 0.01,
      'and the label keeps tracking that hand as it re-centres',
      JSON.stringify({ top: pillTop(dealerPill()), c0: tr(dealerCards()[0]) }));
    ok(Math.abs(pillTop(dealerPill()) - playerGapBelow()) < 0.01,
      'SYMMETRY holds after the draw too (always-on rule)',
      `dealer ${pillTop(dealerPill())} vs player ${playerGapBelow()}`);

    const before = { c0: tr(playerCards()[0]), c1: tr(playerCards()[1]), pill: pillBox(playerPill()) };
    ok(!!playerPill() && playerPill().parentElement.className.includes('css-fanBottom'),
      'the label lives inside the hand it belongs to');
    ok(Math.abs(-before.pill.right - (before.c1.x + cardW)) < 0.01,
      "its right edge is exactly on the last card's right edge",
      `label ${-before.pill.right} vs card ${before.c1.x + cardW}`);
    ok(Math.abs(-before.pill.bottom - before.c0.y) < 0.01,
      "and its bottom edge exactly on the first card's top edge (no vertical gap)",
      `label ${-before.pill.bottom} vs card ${before.c0.y}`);

    // a HIT: the third card starts flying 150ms after the response
    answer = {
      success: true,
      gameState: {
        roundId: 'c1', status: 'player_turn', activeHandIndex: 0,
        playerHands: [[C('10', 'spades'), C('9', 'hearts'), C('2', 'diamonds')]],
        dealerHand: [C('5', 'clubs'), { hidden: true }],
        handTotals: [21], handBets: [10], handOutcomes: [null], payout: 0,
        dealerTotal: 15, dealerShownTotal: 5, balance: 115,
      },
    };
    [...host.querySelectorAll('button')].find((b) => /Hit/.test(b.textContent)).click();
    // the response lands in a frame; the card's flight only starts at 150ms, so
    // this is sampled well before the hand moves (poll instead of a blind sleep)
    ok(await waitFor(() => !!playerCards()[2], 130), 'the new card is on the table straight away');
    const midState = { c0: tr(playerCards()[0]), c2: tr(playerCards()[2]), pill: pillBox(playerPill()) };
    ok(Math.abs(midState.c0.x - before.c0.x) < 0.01 && Math.abs(midState.c0.y - before.c0.y) < 0.01,
      'the cards already on the table stay put until the new card actually moves',
      JSON.stringify(midState.c0));
    ok(Math.abs(midState.pill.right - before.pill.right) < 0.01
      && Math.abs(midState.pill.bottom - before.pill.bottom) < 0.01,
      'so does the label');

    await sleep(220);                         // the step has fired (150ms), the card is flying
    const after = { c0: tr(playerCards()[0]), c1: tr(playerCards()[1]), c2: tr(playerCards()[2]), pill: pillBox(playerPill()) };
    const stepX = before.c1.x - before.c0.x;  // the cascade step, read off the table
    const stepY = before.c1.y - before.c0.y;
    ok(Math.abs((after.c0.x - before.c0.x) + stepX / 2) < 0.01
      && Math.abs((after.c0.y - before.c0.y) + stepY) < 0.01,
      'when it moves, the existing cards shift half a step LEFT and a full step UP — the hand stays bottom-banded (the band below its last card IS the table\'s shared gap)',
      `${JSON.stringify(before.c0)} -> ${JSON.stringify(after.c0)}`);
    ok(Math.abs((after.c1.x - before.c1.x) + stepX / 2) < 0.01
      && Math.abs((after.c1.y - before.c1.y) + stepY) < 0.01,
      'every existing card shifts by the same amount — the group moves as one');
    ok(Math.abs(after.c2.x - midState.c2.x) < 0.01 && Math.abs(after.c2.y - midState.c2.y) < 0.01,
      'the incoming card was already seated where it lands, so the step does not move it');
    ok(Math.abs(-after.pill.right - (after.c2.x + cardW)) < 0.01,
      "the label's right edge ends up on the NEW last card's right edge",
      `label ${-after.pill.right} vs card ${after.c2.x + cardW}`);
    ok(Math.abs(-after.pill.bottom - after.c0.y) < 0.01,
      "its bottom edge on the first card's top edge — still no gap",
      `label ${-after.pill.bottom} vs card ${after.c0.y}`);
    ok(after.pill.right < before.pill.right && after.pill.bottom > before.pill.bottom,
      'the label travelled with the hand: further right and further up',
      `${JSON.stringify(before.pill)} -> ${JSON.stringify(after.pill)}`);

    // ---- the dealer's hand is the same animal: a STAND draws a third card
    answer = {
      success: true,
      gameState: {
        roundId: 'c1', status: 'finished', activeHandIndex: 0,
        playerHands: [[C('10', 'spades'), C('9', 'hearts'), C('2', 'diamonds')]],
        dealerHand: [C('5', 'clubs'), C('2', 'hearts'), C('K', 'spades')],
        handTotals: [21], handBets: [10], handOutcomes: ['win'], payout: 25,
        dealerTotal: 17, dealerShownTotal: 17, balance: 140,
      },
    };
    const dBefore = { c0: tr(dealerCards()[0]), pill: pillBox(dealerPill()) };
    [...host.querySelectorAll('button')].find((b) => /Stand/.test(b.textContent)).click();
    ok(await waitFor(() => dealerCards().length === 3, 130), 'the dealer draw is on the table');
    ok(Math.abs(tr(dealerCards()[0]).x - dBefore.c0.x) < 0.01,
      'the dealer hand waits for its draw to move too');
    await sleep(220);
    const dAfter = { c0: tr(dealerCards()[0]), c1: tr(dealerCards()[1]), c2: tr(dealerCards()[2]), pill: pillBox(dealerPill()) };
    ok(Math.abs((dAfter.c0.x - dBefore.c0.x) + (dAfter.c1.x - dAfter.c0.x) / 2) < 0.01
      && Math.abs(dAfter.c0.y - dBefore.c0.y) < 0.01,
      'the dealer hand re-centres horizontally when it draws while its top band stays the shared gap',
      `${JSON.stringify(dBefore.c0)} -> ${JSON.stringify(dAfter.c0)}`);
    ok(Math.abs(-dAfter.pill.right - (dAfter.c2.x + cardW)) < 0.01
      && Math.abs(dAfter.c0.y - pillTop(dealerPill()) - LABEL_H) < 0.01,
      "and the dealer's label is pinned to its hand's last right edge / first top edge",
      `${JSON.stringify(dAfter.pill)} top ${pillTop(dealerPill())}`);
    ok(Math.abs(pillTop(dealerPill()) - playerGapBelow()) < 0.01,
      'SYMMETRY holds after the player hit as well (every state)',
      `dealer ${pillTop(dealerPill())} vs player ${playerGapBelow()}`);

    unmountAll();
    globalThis.fetch = realFetch;
    await sleep(60);
  }


  /* --- §11 Slide + Hilo: registered scaffolding shells --- */
  console.log('\n=== 11. Slide + Hilo: registered scaffolding shells with the standard betting panel ===');
  {
    __auth.user = { id: 1, username: 'tester', role: 'user', balance: 100 };
    for (const [slug, name] of [['slide', 'Slide'], ['hilo', 'Hilo']]) {
      const { default: Game } = await import(`../../src/components/games/${name}.jsx`);
      const row = { name: slug, display_name: name, is_enabled: 1, is_mobile_enabled: 1 };
      const host = mount(
        React.createElement(ToastProvider, null,
          React.createElement(ActiveBetProvider, null,
            React.createElement(Game, { gameRow: row })))
      );
      await sleep(120);

      // the standard betting panel, same conventions as every other game
      const betInput = host.querySelector('input[type=number]');
      ok(!!betInput, `${name}: the standard bet amount input is there`);
      const wrap = host.querySelector('.ui-bet-wrap');
      const betBtn = wrap?.querySelector('button');
      ok(!!wrap && !!betBtn && /^Bet$/.test(betBtn.textContent.trim()),
        `${name}: a Bet button on the shared .ui-bet-wrap`);
      ok(betBtn?.disabled === false, `${name}: the button is armed while the game is enabled`);
      const halves = [...host.querySelectorAll('button')].filter((b) => ['½', '2×'].includes(b.textContent.trim()));
      ok(halves.length === 2, `${name}: the ½ / 2× adjusters follow the lobby convention`, String(halves.length));
      ok(!!host.querySelector('.sidebar-readonly-input input[readonly]'),
        `${name}: the profit-on-win readout is a read-only field`);

      // the stage is a truthful info shell — description + coming soon, no fake board
      const stage = host.querySelector('.css-gameStage');
      ok(!!stage && /coming soon/i.test(stage.textContent), `${name}: the stage is the coming-soon placeholder`);
      ok(/higher|track|multiplier/i.test(stage.textContent),
        `${name}: ...and it carries the game's description section`);

      // scaffolding rule: a valid Bet validates like the other shells but never
      // plays — no balance moved, no fake round, just the notice
      setInputValue(betInput, '10');
      await sleep(40);
      const balanceBefore = __auth.user.balance;
      betBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      ok(await waitFor(() => [...document.querySelectorAll('.appToast')]
        .some((t) => new RegExp(`${name} is coming soon`, 'i').test(t.textContent)), 1500),
        `${name}: a valid bet stops at the coming-soon notice`);
      ok(__auth.user.balance === balanceBefore,
        `${name}: ...and the balance never moves (there is no fake round)`,
        `${balanceBefore} -> ${__auth.user.balance}`);

      // and the standard inline validation still guards the input
      setInputValue(betInput, '0');
      await sleep(40);
      betBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await sleep(60);
      ok([...host.querySelectorAll('.bet-error')].some((e) => /Invalid bet amount/.test(e.textContent)),
        `${name}: an invalid amount still shows the standard inline error`);
      unmountAll();
      await sleep(40);

      // switched off by the admin: the shared lock-down, same as every game
      const host2 = mount(
        React.createElement(ToastProvider, null,
          React.createElement(ActiveBetProvider, null,
            React.createElement(Game, { gameRow: { ...row, is_enabled: 0 } })))
      );
      await sleep(120);
      ok(!!host2.querySelector('.ui-hazard-corner'), `${name}: the admin-off badge sits on its bet button`);
      ok(host2.querySelector('.ui-bet-wrap button')?.disabled === true,
        `${name}: and the bet button locks with it`);
      ok(/temporarily disabled/i.test(host2.querySelector('.css-gameStage')?.textContent ?? ''),
        `${name}: the stage swaps to the shared disabled screen`);
      unmountAll();
      await sleep(40);
    }

    // present everywhere the lobby shows a game: routed, implemented,
    // poster and page copy
    const lobby = readCss('src/pages/Games.jsx');
    for (const [key, comp] of [['slide', 'Slide'], ['hilo', 'Hilo']]) {
      ok(new RegExp(`${key}: ${comp},`).test(lobby), `${key} is routed to its shell on the games page`);
      ok(new RegExp(`"${key}",`).test(lobby), `${key} is an implemented page (opens, never "Unavailable")`);
      ok(new RegExp(`${key}: ${key}Poster,`).test(lobby), `${key} carries its own poster in the grid`);
      ok(new RegExp(`^  ${key}: \{`, 'm').test(lobby), `${key} has its own copy for the info panel`);
    }
    const home = readCss('src/pages/Home.jsx');
    ok(/name: "slide"/.test(home) && /name: "hilo"/.test(home), 'the home page lists both shells');
    const nav = readCss('src/components/layout/SideNav.jsx');
    ok(/"slide", "hilo"/.test(nav), 'the side rail links both games');

    // the backend registers them too (covered over HTTP by npm run test:http):
    // seed + routes exist, and the betting entry answers 501.
    const seed = readCss('../backend/src/config/database.js');
    ok(/name: "slide", display_name: "Slide"/.test(seed) && /name: "hilo", display_name: "Hilo"/.test(seed),
      'the backend seeds both games into the games table');
    const routes = readCss('../backend/src/routes/games.js');
    ok(/"\/slide\/play"/.test(routes) && /"\/hilo\/play"/.test(routes)
      && /status\(501\)/.test(routes),
      'their betting routes are registered and answer 501 (no engine behind them)');
  }


  /* --- §13 universal pills row + Roulette history stack --- */
  console.log('\n=== 13. pills row (every game): marker in the row, constant gaps, the outgoing pill fades itself ===');
  {
    const globalCss = readCss('src/styles/global.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const crashCss = readCss('src/components/games/crash.module.css').replace(/\/\*[\s\S]*?\*\//g, '');
    ok(!/mask-image/.test(/\.ui-history-pills\s*\{([^}]*)\}/.exec(globalCss)?.[1] ?? 'X'),
      'no static gradient mask on the shared pills row');
    ok(!/mask-image/.test(/\.historyPills\s*\{([^}]*)\}/.exec(crashCss)?.[1] ?? 'X'),
      "and Crash's local row dropped its mask too");

    // constant gaps: one fixed `gap`, no space-* distribution, no pill margins
    const pillsRule = /\.ui-history-pills\s*\{([^}]*)\}/.exec(globalCss)?.[1] ?? '';
    ok(/gap:\s*6px/.test(pillsRule) && !/justify-content:\s*space/.test(pillsRule),
      'the gap between pills is one fixed value, whatever each pill\'s width');
    const pillItem = /\.ui-hist-pill\s*\{([^}]*)\}/.exec(globalCss)?.[1] ?? '';
    ok(!/margin/.test(pillItem), 'and no pill carries a margin that would compress or stretch with content');
    ok(!/margin/.test(/\.histPill\s*\{([^}]*)\}/.exec(crashCss)?.[1] ?? ''), "Crash's pills are margin-free too");

    // the exit fade is per-pill and wired in every pills game
    const pillsSrc = readCss('src/components/common/HistoryPills.jsx');
    ok(/usePillFadeOut\(scrollRef, slideKey\);/.test(pillsSrc),
      'every pills game: the outgoing pill fades itself (usePillFadeOut on the shared scroller)');
    const hook = readCss('src/hooks/usePillFadeOut.js');
    ok(/getBoundingClientRect/.test(hook) && /style\.opacity/.test(hook),
      'the hook fades each pill by its own distance out of the scroller');

    // marker IN the pills row, right after the scroller — every pills game
    __auth.user = { id: 1, username: 'tester', role: 'user', balance: 100 };
    for (const [file, name] of [['Crash', 'crash'], ['Wheel', 'wheel'], ['Dice', 'dice'], ['Limbo', 'limbo']]) {
      const { default: Game } = await import(`../../src/components/games/${file}.jsx`);
      const host = mount(
        React.createElement(ToastProvider, null,
          React.createElement(ActiveBetProvider, null,
            React.createElement(Game, { gameRow: { name, display_name: file, is_enabled: 1, is_mobile_enabled: 1 } })))
      );
      await sleep(140);
      const row = host.querySelector('.ui-history-row');
      const meta = host.querySelector('.ui-history-meta');
      ok(!!row && !!meta && row.contains(meta), `${file}: the My-bets marker sits IN the pills row`);
      ok(!!row && row.lastElementChild === meta && row.firstElementChild?.className.includes('ui-history-scroll'),
        `${file}: pills left, marker right, one row`, row?.innerHTML.slice(0, 60));
      unmountAll();
      await sleep(30);
    }

    // Roulette: the stack is only as tall as the balls it holds; centred title
    const rlx = readCss('src/components/games/Roulette.jsx');
    const stackBlock = /historyStack[^>]*>([\s\S]*?)<\/div>/.exec(rlx)?.[1] ?? '';
    ok(/historyShown\.map/.test(stackBlock) && !/histPlaceholder/.test(stackBlock),
      'Roulette: the stack renders exactly the balls it has (dynamic height)');
    const rlCss = readCss('src/components/games/roulette.module.css');
    ok(/padding:\s*8px 12px 12px/.test(/\.historyCol\s*\{([^}]*)\}/.exec(rlCss)?.[1] ?? ''),
      "Roulette: the title's top padding is slightly reduced (sides keep 12px)");
    const labRule = /\.historyLabel\s*\{([^}]*)\}/.exec(rlCss)?.[1] ?? '';
    ok(/text-align:\s*center/.test(labRule) && /align-self:\s*center/.test(labRule),
      'Roulette: the History title is centred inside the panel');
    const { default: Roulette } = await import('../../src/components/games/Roulette.jsx');
    const rHost = mount(
      React.createElement(ToastProvider, null,
        React.createElement(ActiveBetProvider, null,
          React.createElement(Roulette, { gameRow: { name: 'roulette', display_name: 'Roulette', is_enabled: 1, is_mobile_enabled: 1 } })))
    );
    await sleep(160);
    const stack = rHost.querySelector('.css-historyStack');
    ok(!!stack && stack.children.length === 0,
      'with no results yet the stack is empty — no reserved full height', String(stack?.children.length));
    unmountAll();
  }

  console.log(`\n──────────── ${pass} passed, ${fail} failed ────────────\n`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('RUNNER FAILED', e); process.exit(1); });
