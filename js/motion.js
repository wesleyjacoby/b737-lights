// Transitions between the systems grid and a system's panel.
//
// Opening: the other system tiles fade away, then the tile you pressed grows into the panel. The panel is
// laid out at its final size and revealed with a clip-path that starts at the tile's rectangle, so nothing
// is stretched. Closing runs the same thing backwards. All of it uses the Web Animations API and falls
// back to an instant switch when the user prefers reduced motion.

const $ = function (s) { return document.querySelector(s); };
const EASE_OUT = 'cubic-bezier(.22, .8, .2, 1)';
const EASE_IN_OUT = 'cubic-bezier(.5, 0, .2, 1)';

export function canAnimate() {
  return typeof Element.prototype.animate === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function done(list) {
  return Promise.all(list.map(function (a) { return a.finished.catch(function () { /* cancelled */ }); }));
}

function insetFrom(outer, inner, radius) {
  const t = Math.max(0, inner.top - outer.top);
  const l = Math.max(0, inner.left - outer.left);
  const r = Math.max(0, outer.right - inner.right);
  const b = Math.max(0, outer.bottom - inner.bottom);
  return 'inset(' + t + 'px ' + r + 'px ' + b + 'px ' + l + 'px round ' + radius + 'px)';
}

function overlay(work) {
  Object.assign(work.style, { position: 'absolute', top: '0', left: '0', width: '100%', zIndex: '2' });
}

function reset(work, inner, wrap) {
  work.getAnimations().forEach(function (a) { a.cancel(); });
  inner.getAnimations().forEach(function (a) { a.cancel(); });
  work.removeAttribute('style');
  inner.removeAttribute('style');
  wrap.style.minHeight = '';
}

// Home -> system. `fill` puts the system's content into the panel.
export async function expand(tile, fill) {
  const wrap = $('#stagewrap');
  const home = $('#home');
  const work = $('#work');
  const inner = $('#stageInner');
  const others = Array.from(document.querySelectorAll('.sys')).filter(function (t) { return t !== tile; });

  // 1. the other tiles and the heading fade away; the pressed tile loses its label
  const out = others.map(function (t, i) {
    return t.animate(
      [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.92)' }],
      { duration: 200, delay: Math.min(i * 10, 90), easing: 'ease-in', fill: 'forwards' });
  });
  out.push($('#homeCrumb').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }));
  Array.from(tile.children).forEach(function (c) {
    out.push(c.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }));
  });
  await done(out);

  // 2. lay the panel out at full size over the grid, hidden down to the tile's rectangle
  overlay(work);
  work.hidden = false;
  fill();
  inner.style.opacity = '0';
  const S = work.getBoundingClientRect();
  const T = tile.getBoundingClientRect();
  wrap.style.minHeight = Math.ceil(S.height) + 'px';
  const from = insetFrom(S, T, 10);
  work.style.clipPath = from;

  // 3. grow the tile into the panel, then bring the panel's contents in
  const grow = work.animate(
    [{ clipPath: from }, { clipPath: 'inset(0px 0px 0px 0px round 14px)' }],
    { duration: 540, easing: EASE_OUT, fill: 'forwards' });
  const show = inner.animate(
    [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }],
    { duration: 320, delay: 240, easing: 'ease-out', fill: 'forwards' });
  await done([grow, show]);

  // 4. settle: the panel becomes ordinary page content
  home.hidden = true;
  out.forEach(function (a) { a.cancel(); });
  reset(work, inner, wrap);
  window.scrollTo(0, 0);
  const title = $('#stageTitle');
  if (title) title.focus({ preventScroll: true });
}

// System -> home. `fill` rebuilds the grid. `sysId` is the system being closed.
export async function collapse(sysId, fill) {
  const wrap = $('#stagewrap');
  const home = $('#home');
  const work = $('#work');
  const inner = $('#stageInner');

  fill();
  home.hidden = false;
  const grid = $('#sysGrid');
  const tiles = Array.from(grid.children);
  tiles.forEach(function (t) { t.style.opacity = '0'; });
  const crumb = $('#homeCrumb');
  crumb.style.opacity = '0';

  overlay(work);
  const S = work.getBoundingClientRect();
  wrap.style.minHeight = Math.ceil(S.height) + 'px';
  const tile = grid.querySelector('[data-sys="' + sysId + '"]');
  const list = [];

  // contents leave, the panel shrinks into the tile's rectangle
  list.push(inner.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 170, easing: 'ease-in', fill: 'forwards' }));
  let shrink = null;
  if (tile) {
    const to = insetFrom(S, tile.getBoundingClientRect(), 10);
    shrink = work.animate(
      [{ clipPath: 'inset(0px 0px 0px 0px round 14px)' }, { clipPath: to }],
      { duration: 500, delay: 60, easing: EASE_IN_OUT, fill: 'forwards' });
    list.push(shrink);
  }

  // the grid comes back while the panel is still closing
  const back = tiles.map(function (t, i) {
    return t.animate(
      [{ opacity: 0, transform: 'scale(.92)' }, { opacity: 1, transform: 'scale(1)' }],
      { duration: 260, delay: 240 + Math.min(i * 14, 150), easing: 'ease-out', fill: 'forwards' });
  });
  back.push(crumb.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: 260, fill: 'forwards' }));

  await done(list);
  // the shrunken panel melts into the tile
  const melt = work.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' });
  await done(back.concat([melt]));

  work.hidden = true;
  back.forEach(function (a) { a.cancel(); });
  tiles.forEach(function (t) { t.style.opacity = ''; });
  crumb.style.opacity = '';
  reset(work, inner, wrap);
  if (tile) tile.focus({ preventScroll: true });
}

// Same view, different content: fade out, swap, fade in.
export async function crossfade(update) {
  const inner = $('#stageInner');
  const out = inner.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, easing: 'ease-in', fill: 'forwards' });
  await done([out]);
  update();
  const into = inner.animate(
    [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }],
    { duration: 220, easing: 'ease-out', fill: 'forwards' });
  await done([into]);
  out.cancel();
  into.cancel();
}

// Between the grid and the search results panel: a quick fade, no growing.
export async function fadeSwap(hideEl, showEl, fill) {
  const out = hideEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, fill: 'forwards' });
  await done([out]);
  hideEl.hidden = true;
  out.cancel();
  fill();
  showEl.hidden = false;
  const into = showEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: 'forwards' });
  await done([into]);
  into.cancel();
}
