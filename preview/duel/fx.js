// 攻撃の演出（キャンバスに描く）。種族ごとの攻撃・命中・カードの壊れ方と、神（幻神獣族・創造神族）の特別な演出。
// playBattle() は演出が終わったら解決する Promise を返す。カードの位置は画面上の四角（getBoundingClientRect）で受け取る
const TAU = Math.PI * 2;

/* ---------- 種族ごとの演出：[攻撃の種類, 色, 壊れ方] ---------- */
const RACE = {
  ドラゴン族: ['breath', '#9fe6ff', 'burn'], 魔法使い族: ['magic', '#c9a7ff', 'shatter'], アンデット族: ['souls', '#8dffb8', 'dissolve'],
  戦士族: ['slash', '#ffe08a', 'split'], 獣戦士族: ['beastslash', '#ff9a5c', 'split'], 獣族: ['claw', '#ffb070', 'shatter'],
  鳥獣族: ['wind', '#e8f4ff', 'shatter'], 悪魔族: ['dark', '#b45cff', 'dissolve'], 天使族: ['holy', '#fff2b0', 'dissolve'],
  昆虫族: ['swarm', '#c8e66a', 'dissolve'], 恐竜族: ['bite', '#ff7a4a', 'shatter'], 爬虫類族: ['venom', '#9cff5a', 'dissolve'],
  魚族: ['water', '#7fd6ff', 'shatter'], 海竜族: ['vortex', '#4fb6ff', 'shatter'], 水族: ['wave', '#8fe3ff', 'shatter'],
  炎族: ['fire', '#ff8a3c', 'burn'], 雷族: ['thunder', '#bfe4ff', 'shatter'], 岩石族: ['rocks', '#d8b48a', 'shatter'],
  植物族: ['vines', '#7ee07a', 'split'], 機械族: ['laser', '#ff5a5a', 'shatter'], サイキック族: ['psychic', '#ff8ad8', 'shatter'],
  幻竜族: ['breath', '#7affc8', 'burn'], サイバース族: ['cyber', '#5af0ff', 'dissolve'], 幻想魔族: ['prism', '#ffb3ff', 'shatter'],
};
/** 神の演出の種類（幻神獣族はカード名、創造神族は七色） */
function godKind(d) {
  if (d.race === '創造神族') return 'creator';
  if (d.race !== '幻神獣族') return null;
  if (d.name.includes('オシリス')) return 'red';
  if (d.name.includes('オベリスク')) return 'blue';
  return 'gold';
}
const GOD = { red: { c: '#ff4a3d', c2: '#ffb3a0' }, blue: { c: '#4f8dff', c2: '#c9dcff' }, gold: { c: '#ffc93d', c2: '#fff1b0' }, creator: { c: '#ffffff', c2: '#ffe9ff' } };

/* ---------- 下ごしらえ ---------- */
function hexA(h, a) { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }
const SPR = {};
function spr(c) {
  if (SPR[c]) return SPR[c];
  const o = document.createElement('canvas'); o.width = o.height = 64;
  const x = o.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, '#fff'); g.addColorStop(.18, c); g.addColorStop(.5, hexA(c, .35)); g.addColorStop(1, hexA(c, 0));
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); return (SPR[c] = o);
}
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
const FRAME = { normal: '#f1d98a', effect: '#e9a36f', ritual: '#9cb8ec', fusion: '#b9a3e0' };
const ATTR = { 闇: '#534ab7', 光: '#b8902a', 地: '#8a6a3a', 水: '#2f6fb0', 炎: '#c4473a', 風: '#2e8b57', 神: '#a9841f' };
/** カードの表面をキャンバスに描いた絵（演出の中で動かしたり、破片にしたりする） */
export function cardImg(d, atk, def) {
  const CW = 78, CH = 114, o = document.createElement('canvas'); o.width = CW * 2; o.height = CH * 2;
  const x = o.getContext('2d'); x.scale(2, 2);
  rr(x, 1, 1, CW - 2, CH - 2, 6); x.fillStyle = FRAME[d.frame] || '#e9a36f'; x.fill(); x.lineWidth = 1.6; x.strokeStyle = '#2c3244'; x.stroke();
  x.fillStyle = 'rgba(255,255,255,.62)'; rr(x, 5, 5, CW - 10, 22, 3); x.fill();
  x.fillStyle = '#262b3a'; x.font = '700 9px sans-serif'; x.fillText(d.name.slice(0, 7), 8, 15); x.fillText(d.name.slice(7, 14), 8, 25);
  x.fillStyle = ATTR[d.attribute] || '#6a6e7e'; x.beginPath(); x.arc(CW - 13, 13, 6.5, 0, TAU); x.fill();
  x.fillStyle = '#fff'; x.font = '700 8px sans-serif'; x.textAlign = 'center'; x.fillText(d.attribute || '', CW - 13, 16);
  x.fillStyle = 'rgba(255,255,255,.28)'; rr(x, 5, 31, CW - 10, 56, 3); x.fill();
  x.fillStyle = 'rgba(38,43,58,.3)'; x.font = '700 28px sans-serif'; x.fillText((d.race || '？').charAt(0), CW / 2, 70);
  x.fillStyle = 'rgba(255,255,255,.62)'; rr(x, 5, CH - 19, CW - 10, 14, 3); x.fill();
  x.fillStyle = '#262b3a'; x.font = '700 10px sans-serif'; x.fillText(`${atk}/${def}`, CW / 2, CH - 8);
  return o;
}

/* ---------- キャンバス ---------- */
let cv = null, ctx = null, W = 0, H = 0;
function ensureCanvas(root) {
  if (cv && cv.isConnected) return;
  cv = document.createElement('canvas'); cv.className = 'fx-layer';
  (root.querySelector('.droot') || root).appendChild(cv);
  ctx = cv.getContext('2d');
}
function fit() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/**
 * 攻撃の演出を再生する。
 * info = { a: {rect, d, atk, def}, t: {rect, d?, atk?, def?} （d が無ければダイレクトアタック）,
 *          destroyed: { a: bool, t: bool }, dmg: number, speed: 1 | 2 }
 */
export function playBattle(root, info) {
  ensureCanvas(root); fit();
  const god = godKind(info.a.d);
  return new Promise(resolve => {
    const S = setup(info, god);
    cv.style.display = 'block';
    const step = now => {
      if (S.done) return;
      frame(S, now);
      if (S.t > S.end) { S.done = true; ctx.clearRect(0, 0, W, H); cv.style.display = 'none'; resolve(); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

function setup(info, god) {
  const ra = info.a.rect, rt = info.t.rect;
  const U = Math.max(.65, Math.min(1.3, ra.width / 78));
  const A = { x: ra.left + ra.width / 2, y: ra.top + ra.height / 2, w: ra.width, h: ra.height, x0: 0, y0: 0, s: 1, glow: 0, img: cardImg(info.a.d, info.a.atk, info.a.def), a: 1 };
  A.x0 = A.x; A.y0 = A.y;
  const direct = !info.t.d;
  const D = { x: rt.left + rt.width / 2, y: rt.top + rt.height / 2, w: direct ? ra.width : rt.width, h: direct ? ra.height : rt.height, a: 1, rot: 0, burn: 0, dis: 0, img: direct ? null : cardImg(info.t.d, info.t.atk, info.t.def) };
  const r = RACE[info.a.d.race] || ['slash', '#ffe08a', 'shatter'];
  const S = { info, god, A, D, U, direct, act: r[0], c: god ? GOD[god].c : r[1], c2: god ? GOD[god].c2 : '#ffffff', kill: god ? 'shatter' : r[2],
    parts: [], rings: [], fx: [], shards: [], ghosts: [], bolts: [], stars: [], ev: [],
    shake: 0, quake: 0, flash: 0, chroma: 0, freeze: 0, dark: 0, bars: 0, zoom: 0, dmgT: -1,
    t: 0, last: 0, speed: info.speed || 1, HIT: god ? 2600 : 1180, ret: -1, dash: null, done: false };
  S.end = S.HIT + (god ? 2100 : 1500);
  // 相手（下から上へ攻撃しているか）
  S.dir = D.y < A.y ? -1 : 1;
  if (god) for (let i = 0; i < 50; i++) S.stars.push({ x: Math.random() * W, y: Math.random() * H, p: Math.random() * TAU });
  // 命中
  at(S, S.HIT, () => {
    hitstop(S, god ? 180 : 110, 1, god ? 26 : 18); S.zoom = 1; S.dmgT = 0; if (god) { S.chroma = 1; S.dome = S.t; }
    for (let i = 0; i < (god ? 3 : 1); i++) S.rings.push({ x: D.x, y: D.y, r: 10 + i * 20, v: (god ? 15 : 13) - i * 3, a: 1, c: i ? S.c : '#ffffff', lw: god ? 5 : 3, flat: 1 });
    burst(S, D.x, D.y, god ? 140 : 60, [S.c, S.c2, '#ffe9b0'], god ? 12 : 8, god ? 70 : 48, 3.2);
    if (info.destroyed.t && !direct) destroy(S, D, god ? 'shatter' : S.kill);
    if (info.destroyed.a) at(S, S.HIT + 300, () => destroy(S, A, 'shatter'));
    if (!info.destroyed.t && !direct) D.wobble = S.t;
  });
  at(S, S.HIT + (god ? 1500 : 380), () => { S.ret = S.t; });
  if (god) godSetup(S); else (ACT[S.act] || ACT.slash)(S);
  return S;
}
function at(S, t, f) { S.ev.push([t, f]); }
function hitstop(S, ms, fl, sh) { S.freeze = ms; S.flash = Math.max(S.flash, fl); S.shake = Math.max(S.shake, sh); }
function P(S, o) { o.max = o.life; o.drag = o.drag || .96; o.grav = o.grav || 0; o.sz = o.sz || 3; o.k = o.k || 'glow'; if (S.parts.length < 1500) S.parts.push(o); }
function burst(S, x, y, n, cols, sp, life, sz, k) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = sp * (.25 + Math.random()); P(S, { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (.6 + Math.random() * .7), sz: sz * (.5 + Math.random()), c: cols[i % cols.length], drag: .92, grav: .06, k }); } }
function stream(S, fx, fy, tx, ty, n, cols, sp, sz, life, jit) {
  for (let i = 0; i < n; i++) {
    const dx = tx - fx + (Math.random() - .5) * jit, dy = ty - fy + (Math.random() - .5) * jit, L = Math.hypot(dx, dy) || 1, s = sp * (.8 + Math.random() * .5);
    P(S, { x: fx + (Math.random() - .5) * 8, y: fy + (Math.random() - .5) * 8, vx: dx / L * s, vy: dy / L * s, life: life * (.8 + Math.random() * .4), sz: sz * (.6 + Math.random() * .8), c: cols[i % cols.length], drag: .995 });
  }
}
function destroy(S, o, kind) {
  if (kind === 'burn') o.burnT = S.t;
  else if (kind === 'dissolve') o.disT = S.t;
  else if (kind === 'split') o.split = { t: 0, ang: -.2 };
  else {
    o.a = 0;
    for (let i = 0; i < 18; i++) {
      const cx = (Math.random() - .5) * o.w, cy = (Math.random() - .5) * o.h, pts = [];
      for (let k = 0; k < 3; k++) { const a = Math.random() * TAU, d = (8 + Math.random() * 14) * S.U; pts.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d]); }
      S.shards.push({ o, x: o.x, y: o.y, pts, vx: cx * .15 + (Math.random() - .5) * 4, vy: cy * .12 - 2 - Math.random() * 3, rot: 0, vr: (Math.random() - .5) * .3, a: 1 });
    }
  }
}

/* ---------- 種族ごとの攻撃 ---------- */
const slash = (S, ang, w, off) => { S.fx.push({ k: 'slash', t: S.t, ang, w, off }); burst(S, S.D.x, S.D.y, 22, [S.c, '#ffffff'], 6, 34, 2.4, 'streak'); };
const roar = S => { S.shake = 12; S.flash = .3; for (let i = 0; i < 4; i++) S.rings.push({ x: S.A.x, y: S.A.y + S.dir * 40, r: 16 + i * 14, v: 9 + i * 2, a: 1, c: S.c, lw: 6 }); };
const ACT = {
  breath: S => { at(S, 650, () => roar(S)); S.fx.push({ k: 'stream', from: 820, to: 1500 }); },
  fire: S => { S.fx.push({ k: 'stream', from: 700, to: 1500, fire: 1 }); },
  slash: S => { S.dash = [600, 180]; [880, 1030, S.HIT].forEach((t, i) => at(S, t, () => { slash(S, [-.6, .55, -.15][i], i === 2 ? 1.4 : 1, 0); if (i < 2) hitstop(S, 55, .45, 9); })); },
  beastslash: S => { S.dash = [600, 160]; [960, S.HIT].forEach((t, i) => at(S, t, () => { slash(S, i ? -.75 : .75, 1.3, 0); if (!i) hitstop(S, 60, .5, 10); })); },
  claw: S => { S.dash = [650, 170]; at(S, S.HIT, () => { for (let k = -1; k <= 1; k++) slash(S, -.5, .8, k * 16); }); },
  bite: S => { at(S, 650, () => { S.shake = 14; S.fx.push({ k: 'cracks', t: S.t }); }); S.dash = [820, 150]; at(S, S.HIT - 60, () => S.fx.push({ k: 'jaws', t: S.t })); },
  venom: S => { S.dash = [700, 160]; at(S, S.HIT - 60, () => S.fx.push({ k: 'jaws', t: S.t, small: 1 })); at(S, S.HIT, () => burst(S, S.D.x, S.D.y, 40, [S.c, '#3d8f2a'], 4, 60, 4)); },
  magic: S => { S.fx.push({ k: 'circle', from: 200, to: 1300 }); at(S, 950, () => S.fx.push({ k: 'orb', t: S.t, dur: 230 })); },
  psychic: S => { for (let i = 0; i < 5; i++) at(S, 700 + i * 90, () => S.rings.push({ x: S.A.x, y: S.A.y + S.dir * 50, r: 12, v: 7 * S.dir, a: 1, c: S.c, move: 1, lw: 4 })); },
  laser: S => { S.fx.push({ k: 'reticle', from: 300, to: S.HIT }); S.fx.push({ k: 'beam', from: S.HIT - 140, to: S.HIT + 260, w: 7 }); },
  cyber: S => { S.fx.push({ k: 'cyberOn', from: 650, to: S.HIT }); S.fx.push({ k: 'beam', from: S.HIT - 100, to: S.HIT + 160, w: 4, cyber: 1 }); },
  holy: S => { S.fx.push({ k: 'pillar', from: 800, to: S.HIT + 500, w: 46 }); },
  dark: S => { S.fx.push({ k: 'darkorb', from: 500, to: S.HIT }); },
  souls: S => { for (let i = 0; i < 9; i++) S.fx.push({ k: 'soul', from: 650 + i * 45, dur: 520, side: (i % 2 ? 1 : -1) * (30 + Math.random() * 60) }); },
  swarm: S => { S.fx.push({ k: 'swarmOn', from: 650, to: S.HIT + 100 }); },
  wind: S => { S.fx.push({ k: 'windOn', from: 650, to: S.HIT + 120 }); },
  water: S => { for (let i = 0; i < 6; i++) at(S, 700 + i * 80, () => S.fx.push({ k: 'orb', t: S.t, dur: 200, small: 1 })); },
  vortex: S => { S.fx.push({ k: 'vortex', from: 700, to: S.HIT + 400 }); },
  wave: S => { S.fx.push({ k: 'stream', from: 700, to: S.HIT + 80, water: 1 }); S.fx.push({ k: 'vortex', from: S.HIT - 150, to: S.HIT + 300, small: 1 }); },
  thunder: S => { at(S, 500, () => { S.dark = .7; }); [S.HIT - 160, S.HIT - 70, S.HIT].forEach((t, i) => at(S, t, () => { S.fx.push({ k: 'bolt', t: S.t, main: i === 2 }); S.flash = i === 2 ? 1 : .6; })); },
  rocks: S => { for (let i = 0; i < 6; i++) S.fx.push({ k: 'rock', from: 650 + i * 85, dur: 300, dx: (Math.random() - .5) * 60, r: 10 + Math.random() * 12, rot: Math.random() * 6 }); },
  vines: S => { S.fx.push({ k: 'vine', from: 650, to: S.HIT + 250 }); at(S, S.HIT, () => slash(S, -.35, 1.2, 0)); },
  prism: S => { for (let i = 0; i < 10; i++) S.fx.push({ k: 'crystal', from: 650 + i * 45, dur: 330, c: ['#ffb3ff', '#9fe6ff', '#fff3a0', '#b3ffcf'][i % 4], dx: (Math.random() - .5) * 120, rot: Math.random() * 6 }); },
};

/* ---------- 神の演出 ---------- */
function godSetup(S) {
  const g = S.god;
  if (g === 'red') [2150, 2300, 2420].forEach(t => at(S, t, () => { S.bolts.push({ t: S.t, x: S.D.x + (Math.random() - .5) * 160 }); S.flash = .4; }));
  if (g === 'blue') at(S, 1700, () => { S.crack = S.t; S.flash = .5; S.shake = 10; });
}

/* ---------- 1コマ進めて描く ---------- */
const ease = x => 1 - Math.pow(1 - x, 3);
function frame(S, now) {
  const dt = Math.min(32, now - (S.last || now)) * S.speed; S.last = now;
  if (S.freeze > 0) { S.freeze -= dt; draw(S); return; }
  S.t += dt; const t = S.t, A = S.A, D = S.D;
  S.ev = S.ev.filter(e => { if (t >= e[0]) { e[1](); return false; } return true; });
  if (S.god) godTick(S, t); else raceTick(S, t);
  // 壊れ方
  for (const o of [A, D]) {
    if (o.burnT != null) { const b = (t - o.burnT) / 1000; o.burn = Math.min(1.3, b * 1.1); o.rot = Math.sin(t / 35) * .025 * Math.max(0, 1 - b); if (b > .55) { o.a = Math.max(0, 1 - (b - .55) / .6); if (b < 1.15) for (let k = 0; k < 4; k++) P(S, { x: o.x + (Math.random() - .5) * o.w, y: o.y + (Math.random() - .5) * o.h, vx: (Math.random() - .5), vy: -1 - Math.random() * 2.5, life: 45, sz: 2.4, c: Math.random() < .6 ? '#ff8a3c' : '#ffd27a', drag: .98, grav: -.02 }); } }
    if (o.disT != null) { const d = (t - o.disT) / 1000; o.dis = Math.min(1, d); o.a = Math.max(0, 1 - d * 1.1); if (d < .9) for (let k = 0; k < 5; k++) P(S, { x: o.x + (Math.random() - .5) * o.w, y: o.y + (Math.random() - .5) * o.h, vx: (Math.random() - .5) * 1.4, vy: -.6 - Math.random() * 1.6, life: 50, sz: 2, c: Math.random() < .5 ? S.c : '#ffffff', drag: .985, grav: -.015 }); }
    if (o.split) o.split.t = Math.min(1.3, o.split.t + dt / 700);
  }
  if (D.wobble != null) D.rot = Math.sin((t - D.wobble) / 30) * .08 * Math.max(0, 1 - (t - D.wobble) / 500);
  S.shards.forEach(s => { s.x += s.vx; s.y += s.vy; s.vy += .22; s.vx *= .99; s.rot += s.vr; s.a -= .012; }); S.shards = S.shards.filter(s => s.a > 0);
  S.rings.forEach(g => { if (g.move) { g.y += g.v; g.r += 2.2; } else { g.r += g.v; g.v *= .985; } g.a *= g.move ? .985 : .955; }); S.rings = S.rings.filter(g => g.a > .03);
  S.ghosts.forEach(g => { g.a *= .8; }); S.ghosts = S.ghosts.filter(g => g.a > .03);
  S.parts.forEach(p => { if (p.k === 'bug') { p.ph += .4; p.vx = Math.sin(p.ph) * 3 + (D.x - p.x) * .03; p.vy += (D.y - p.y) * .004; } p.x += p.vx; p.y += p.vy; p.vx *= p.drag; p.vy = p.vy * p.drag + p.grav; p.life--; });
  S.parts = S.parts.filter(p => p.life > 0);
  S.shake *= .86; S.flash *= .88; S.chroma *= .9; S.zoom *= .9; if (S.dmgT >= 0) S.dmgT += dt;
  draw(S);
}
function raceTick(S, t) {
  const A = S.A, D = S.D, c = S.c;
  if (t < 650) {
    const q = t / 650; A.glow = q; A.s = 1 + .1 * q; S.dark = Math.max(S.dark, .4 * q);
    for (let i = 0; i < 3; i++) { const a = Math.random() * TAU, d = (60 + Math.random() * 40) * S.U; P(S, { x: A.x + Math.cos(a) * d, y: A.y + Math.sin(a) * d, vx: -Math.cos(a) * 3.2, vy: -Math.sin(a) * 3.2, life: 20, sz: 2.2, c: Math.random() < .5 ? c : '#ffffff', drag: .99 }); }
  } else if (S.ret < 0) A.glow = Math.max(.6, A.glow);
  const near = { x: D.x, y: D.y - S.dir * (D.h * .5 + A.h * .55 + 6) };
  if (S.dash && t >= S.dash[0] && S.ret < 0) { const p = Math.min(1, (t - S.dash[0]) / S.dash[1]); A.x = A.x0 + (near.x - A.x0) * ease(p); A.y = A.y0 + (near.y - A.y0) * ease(p); S.ghosts.push({ x: A.x, y: A.y, a: .45 }); }
  if (S.ret >= 0) { const r = Math.min(1, (t - S.ret) / 420); if (S.dash) { A.x = near.x + (A.x0 - near.x) * ease(r); A.y = near.y + (A.y0 - near.y) * ease(r); } A.s = 1.1 - .1 * r; A.glow = Math.max(0, .6 * (1 - r)); S.dark *= .92; }
  const from = { x: A.x, y: A.y + S.dir * A.h * .45 };
  S.fx.forEach(f => {
    if (f.k === 'stream' && t >= f.from && t < f.to) {
      const cols = f.fire ? ['#fff1c4', '#ffd27a', '#ff8a3c', '#ff4a1a'] : f.water ? [c, '#ffffff', '#4fb6ff'] : [c, '#ffffff', c];
      stream(S, from.x, from.y, D.x, D.y, f.fire ? 12 : 10, cols, 8 * S.U, 5 * S.U, 26, 40);
    }
    if (f.k === 'swarmOn' && t >= f.from && t < f.to) for (let i = 0; i < 6; i++) { const ph = Math.random() * TAU; P(S, { x: from.x + (Math.random() - .5) * 30, y: from.y, vx: Math.sin(ph) * 3, vy: S.dir * (6 + Math.random() * 2), life: 34, sz: 1.6, c: Math.random() < .7 ? '#2c3a12' : c, k: 'bug', drag: .99, ph }); }
    if (f.k === 'windOn' && t >= f.from && t < f.to) for (let j = 0; j < 5; j++) P(S, { x: from.x + (Math.random() - .5) * 60, y: from.y, vx: (Math.random() - .5) * 2 + (D.x - from.x) * .02, vy: S.dir * (9 + Math.random() * 3), life: 28, sz: Math.random() < .4 ? 5 : 2, c: '#ffffff', k: Math.random() < .4 ? 'feather' : 'streak', drag: .99 });
    if (f.k === 'cyberOn' && t >= f.from && t < f.to) for (let m = 0; m < 5; m++) P(S, { x: A.x + (Math.random() - .5) * 80, y: from.y + S.dir * Math.random() * 60, vx: 0, vy: S.dir * 2, life: 24, sz: 3, c, k: 'sq', drag: 1 });
  });
}
function godTick(S, t) {
  const A = S.A, D = S.D, g = S.god, c = S.c, HIT = S.HIT;
  if (S.ret < 0) { S.bars = Math.min(1, t / 500); S.dark = Math.min(.85, t / 900); S.quake = t < HIT ? Math.min(1, t / 1200) * 3 : 0; A.s = 1 + .18 * Math.min(1, t / 900); A.glow = Math.min(1, t / 800); }
  else { const r = Math.min(1, (t - S.ret) / 600); S.bars = 1 - r; S.dark = .85 * (1 - r); A.s = 1.18 - .18 * r; A.glow = 1 - r; }
  if (t < HIT - 300) for (let i = 0; i < 6; i++) { const a = Math.random() * TAU, d = (110 + Math.random() * 80) * S.U; P(S, { x: A.x + Math.cos(a) * d, y: A.y + Math.sin(a) * d, vx: -Math.cos(a) * 4.5, vy: -Math.sin(a) * 4.5, life: 24, sz: 2.4, c: Math.random() < .5 ? c : '#ffffff', drag: .995 }); }
  const top = { x: A.x, y: A.y + S.dir * (A.h * .5 + 40) };
  if (g === 'red') {
    if (t > 900 && t < HIT) { const o = Math.min(1, (t - 900) / 900); S.orb = { x: top.x, y: top.y, r: 10 + 30 * o }; if (Math.random() < .5) S.bolts.push({ t, x: top.x, y: top.y, arc: 1 }); } else S.orb = null;
    if (t >= HIT - 420 && t < HIT + 500) { S.beam = Math.min(1, (t - (HIT - 420)) / 120) * (t > HIT + 300 ? Math.max(0, 1 - (t - HIT - 300) / 200) : 1); for (let j = 0; j < 10; j++) { const u = Math.random(); P(S, { x: top.x + (D.x - top.x) * u + (Math.random() - .5) * 30, y: top.y + (D.y - top.y) * u, vx: (Math.random() - .5) * 3, vy: (Math.random() - .5) * 3, life: 18, sz: 3, c: Math.random() < .5 ? c : S.c2, drag: .94 }); } } else S.beam = 0;
  }
  if (g === 'blue') {
    const f = Math.max(0, Math.min(1, (t - 1900) / (HIT - 1900)));
    S.fist = t > 1900 && t < HIT + 80 ? { y: -120 + (D.y + 20 + 120) * f * f } : null;
    if (S.fist && t < HIT) for (let j = 0; j < 8; j++) P(S, { x: D.x + (Math.random() - .5) * 140, y: S.fist.y - 40 - Math.random() * 60, vx: 0, vy: -6 - Math.random() * 4, life: 14, sz: 2, c: S.c2, k: 'streak', drag: 1 });
  }
  if (g === 'gold' || g === 'creator') {
    const sy0 = Math.min(A.y, D.y) + Math.abs(A.y - D.y) * .5;
    if (t > 700 && t < HIT - 380) { const rise = Math.min(1, (t - 700) / 800); S.sun = { x: (A.x + D.x) / 2, y: sy0 - 110 * rise, r: 16 + 26 * rise }; }
    if (t > 1500 && t < HIT - 380 && S.sun) { const w = Math.min(1, (t - 1500) / 500); for (let j = 0; j < 12; j++) { const side = j % 2 ? 1 : -1, u = Math.random(), ang = -.3 - u * 1.1; P(S, { x: S.sun.x + side * Math.cos(ang) * 170 * u * w, y: S.sun.y + Math.sin(ang) * 90 * u * w + 30 * u, vx: side * 1.5, vy: -1 + Math.random(), life: 26, sz: 3.6 * (1 - u * .5), c: g === 'creator' ? ['#ff6b6b', '#ffd25a', '#7aff8a', '#6bd0ff', '#c08bff'][j % 5] : (Math.random() < .5 ? c : '#ff8a3c'), drag: .96, grav: -.02 }); } }
    if (t > HIT - 380 && t < HIT) { const dv = (t - (HIT - 380)) / 380, y0 = sy0 - 110; S.sun = { x: (A.x + D.x) / 2 + (D.x - (A.x + D.x) / 2) * dv, y: y0 + (D.y - y0) * dv * dv, r: 42 }; for (let j = 0; j < 14; j++) P(S, { x: S.sun.x + (Math.random() - .5) * 40, y: S.sun.y - 20, vx: (Math.random() - .5) * 4, vy: -4 - Math.random() * 4, life: 24, sz: 4, c: Math.random() < .5 ? c : '#ff8a3c', drag: .96 }); }
    if (t >= HIT) S.sun = null;
    S.pillar = t > HIT && t < HIT + 1100 ? Math.min(1, (t - HIT) / 150) * Math.min(1, (HIT + 1100 - t) / 400) : 0;
  }
  S.bolts = S.bolts.filter(b => t - b.t < (b.arc ? 90 : 180));
}

function glow(x, y, r, c, a) { ctx.globalAlpha = Math.max(0, Math.min(1, a)); ctx.drawImage(spr(c), x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1; }
function bolt(x0, y0, x1, y1, c, w, al) {
  const pts = [[x0, y0]], n = 10;
  for (let i = 1; i < n; i++) { const u = i / n; pts.push([x0 + (x1 - x0) * u + (Math.random() - .5) * 30, y0 + (y1 - y0) * u + (Math.random() - .5) * 12]); }
  pts.push([x1, y1]); ctx.lineCap = 'round';
  [[w * 3, .25], [w * 1.4, .6], [w * .5, 1]].forEach((l, i) => { ctx.strokeStyle = i === 2 ? '#ffffff' : c; ctx.globalAlpha = al * l[1]; ctx.lineWidth = l[0]; ctx.beginPath(); pts.forEach((p, j) => (j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); });
  ctx.globalAlpha = 1;
}
function drawCard(o, clipSign, ang) {
  if (!o.img || o.a <= 0) return;
  ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.rot || 0); ctx.scale(o.s || 1, o.s || 1); ctx.globalAlpha = o.a;
  if (clipSign) { ctx.save(); ctx.rotate(ang); ctx.beginPath(); ctx.rect(-400, clipSign > 0 ? 0 : -400, 800, 400); ctx.restore(); ctx.clip(); }
  ctx.drawImage(o.img, -o.w / 2, -o.h / 2, o.w, o.h);
  if (o.burn > 0) { ctx.globalCompositeOperation = 'source-atop'; const g = ctx.createLinearGradient(0, o.h / 2, 0, -o.h / 2), b = Math.min(1, o.burn); g.addColorStop(0, `rgba(20,8,2,${Math.min(1, o.burn * 1.3)})`); g.addColorStop(b, 'rgba(255,120,30,.9)'); g.addColorStop(Math.min(1, b + .12), 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h); }
  if (o.dis > 0) { ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = `rgba(255,255,255,${Math.min(.8, o.dis)})`; ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h); }
  ctx.restore();
}
function drawSplit(o) {
  const s = o.split, e = ease(Math.min(1, s.t)), fd = Math.max(0, 1 - Math.max(0, s.t - .3) / .8), nx = Math.cos(s.ang + 1.57) * 30 * e, ny = Math.sin(s.ang + 1.57) * 30 * e;
  drawCard({ ...o, x: o.x - nx - 8 * e, y: o.y - ny + 40 * e * e, rot: -.3 * e, a: fd, burn: 0, dis: 0 }, -1, s.ang);
  drawCard({ ...o, x: o.x + nx + 8 * e, y: o.y + ny + 60 * e * e, rot: .25 * e, a: fd, burn: 0, dis: 0 }, 1, s.ang);
}

function draw(S) {
  const A = S.A, D = S.D, c = S.c, t = S.t;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  const dpr = cv.width / W; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.save();
  const z = 1 + (S.god ? .08 : .06) * S.zoom, sh = S.shake + S.quake;
  ctx.translate(D.x, D.y); ctx.scale(z, z); ctx.translate(-D.x, -D.y); ctx.translate((Math.random() - .5) * sh, (Math.random() - .5) * sh);
  // 暗転（元の画面の上に重ねる）
  if (S.dark > .01) { ctx.fillStyle = `rgba(0,0,0,${S.dark * .6})`; ctx.fillRect(-60, -60, W + 120, H + 120); }
  // 相手のカード・破片
  if (!S.direct) { if (D.split) drawSplit(D); else drawCard(D); }
  S.shards.forEach(sh => { ctx.save(); ctx.translate(sh.x, sh.y); ctx.rotate(sh.rot); ctx.globalAlpha = Math.max(0, sh.a); ctx.beginPath(); sh.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.save(); ctx.clip(); ctx.drawImage(sh.o.img, -sh.o.w / 2, -sh.o.h / 2, sh.o.w, sh.o.h); ctx.restore(); ctx.strokeStyle = hexA(c, .9); ctx.lineWidth = 1; ctx.stroke(); ctx.restore(); });
  ctx.globalCompositeOperation = 'lighter';
  if (S.god) drawGod(S, t); else drawRace(S, t);
  S.rings.forEach(r => { ctx.strokeStyle = r.c; ctx.globalAlpha = r.a; ctx.lineWidth = (r.lw || 5) * r.a + 1; ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r * S.U, r.r * S.U * (r.flat ? .5 : .45), 0, 0, TAU); ctx.stroke(); }); ctx.globalAlpha = 1;
  S.parts.forEach(p => {
    const al = Math.min(1, p.life / p.max * 1.6);
    if (p.k === 'streak') { ctx.strokeStyle = p.c; ctx.globalAlpha = al; ctx.lineWidth = p.sz * .8; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 3, p.y - p.vy * 3); ctx.stroke(); }
    else if (p.k === 'sq') { ctx.fillStyle = p.c; ctx.globalAlpha = al; ctx.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz); }
    else if (p.k === 'bug') { ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = p.c; ctx.globalAlpha = al; ctx.beginPath(); ctx.ellipse(p.x, p.y, 2.4, 1.4, Math.atan2(p.vy, p.vx), 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'lighter'; }
    else if (p.k === 'feather') { ctx.fillStyle = p.c; ctx.globalAlpha = al * .8; ctx.beginPath(); ctx.ellipse(p.x, p.y, 6, 2, p.life / 6, 0, TAU); ctx.fill(); }
    else if (p.k === 'rock') { ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = p.c; ctx.globalAlpha = al; ctx.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz); ctx.globalCompositeOperation = 'lighter'; }
    else { ctx.globalAlpha = al; const r = p.sz * 2.6; ctx.drawImage(spr(p.c), p.x - r, p.y - r, r * 2, r * 2); }
  });
  ctx.globalAlpha = 1;
  if (A.glow > 0) glow(A.x, A.y, (S.god ? 170 : 110) * A.s * S.U, c, (S.god ? .55 : .45) * A.glow);
  ctx.globalCompositeOperation = 'source-over';
  S.ghosts.forEach(gh => { ctx.globalAlpha = gh.a * .5; ctx.drawImage(A.img, gh.x - A.w * .55, gh.y - A.h * .55, A.w * 1.1, A.h * 1.1); }); ctx.globalAlpha = 1;
  if (A.split) drawSplit(A); else drawCard(A);
  if (S.flash > .05) { ctx.globalCompositeOperation = 'lighter'; glow(D.x, D.y, 180 * S.U, c, S.flash * .6); ctx.globalCompositeOperation = 'source-over'; }
  // ダメージの数字
  const dmg = S.info.dmg;
  if (dmg > 0 && S.dmgT >= 0 && S.dmgT < 1400) {
    const k = S.dmgT / 1400, sc = S.dmgT < 140 ? .5 + S.dmgT / 140 * .9 : 1.4 - .3 * k;
    ctx.save(); ctx.translate(S.info.dmgAt.x, S.info.dmgAt.y - 34 * k); ctx.scale(sc * (S.god ? 1.25 : 1), sc * (S.god ? 1.25 : 1)); ctx.globalAlpha = 1 - Math.max(0, (k - .6) / .4);
    ctx.font = '700 30px "Fredoka", sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 6; ctx.strokeStyle = '#2a0606'; ctx.strokeText('-' + dmg, 0, 0); ctx.fillStyle = S.god ? S.c2 : '#ff6b6b'; ctx.fillText('-' + dmg, 0, 0); ctx.restore();
  }
  ctx.restore();
  if (S.chroma > .02) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,40,40,${S.chroma * .22})`; ctx.fillRect(-6 * S.chroma, 0, W, H); ctx.fillStyle = `rgba(40,120,255,${S.chroma * .22})`; ctx.fillRect(6 * S.chroma, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
  if (S.flash > .01) { ctx.fillStyle = `rgba(255,255,255,${S.flash * .5})`; ctx.fillRect(0, 0, W, H); }
  if (S.bars > 0) {
    const bh = 44 * ease(S.bars); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh);
    if (S.bars > .5 && S.ret < 0) { ctx.fillStyle = hexA(S.c2, Math.min(1, (S.bars - .5) * 2) * .9); ctx.font = '700 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('― 神 の 一 撃 ―', W / 2, bh - 16); ctx.textAlign = 'left'; }
  }
}
function drawRace(S, t) {
  const A = S.A, D = S.D, c = S.c, U = S.U, from = { x: A.x, y: A.y + S.dir * A.h * .45 };
  S.fx.forEach(f => {
    const lt = t - (f.from || 0), el = f.t != null ? t - f.t : 0;
    if (f.k === 'cracks') { const k = Math.min(1, el / 300), fa = Math.max(0, 1 - (el - 600) / 600); ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = `rgba(20,10,5,${.6 * fa})`; ctx.lineWidth = 2; for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + .3, L = (40 + i * 9) * U; ctx.beginPath(); ctx.moveTo(A.x0, A.y0); ctx.lineTo(A.x0 + Math.cos(a) * L * .5 * k, A.y0 + Math.sin(a) * L * .25 * k); ctx.lineTo(A.x0 + Math.cos(a + .2) * L * k, A.y0 + Math.sin(a + .2) * L * .5 * k); ctx.stroke(); } ctx.globalCompositeOperation = 'lighter'; }
    if (f.k === 'circle' && t >= f.from && t < f.to) { const k = Math.min(1, lt / 250), fa = t > f.to - 200 ? (f.to - t) / 200 : 1, cy = from.y + S.dir * 30; ctx.save(); ctx.translate(A.x, cy); ctx.scale(1, .42); ctx.rotate(t / 400); ctx.globalAlpha = fa; ctx.strokeStyle = c; ctx.lineWidth = 2.5; const R1 = 46 * k * U; ctx.beginPath(); ctx.arc(0, 0, R1, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, R1 * .74, 0, TAU); ctx.stroke(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * R1, Math.sin(a) * R1); ctx.lineTo(Math.cos(a + 2.09) * R1, Math.sin(a + 2.09) * R1); ctx.stroke(); } ctx.restore(); glow(A.x, cy, 60 * k * U, c, .5 * fa); }
    if (f.k === 'orb' && el >= 0 && el < f.dur) { const p = el / f.dur, x = from.x + (D.x - from.x) * p, y = from.y + (D.y - from.y) * p; glow(x, y, (f.small ? 16 : 30) * U, c, 1); glow(x, y, (f.small ? 6 : 12) * U, '#ffffff', 1); stream(S, x, y, x, y - S.dir * 30, 2, [c], 1, 3, 12, 30); }
    if (f.k === 'reticle' && t >= f.from && t < f.to) { const k = Math.min(1, lt / 300); ctx.save(); ctx.translate(D.x, D.y); ctx.rotate(t / 300); ctx.strokeStyle = c; ctx.lineWidth = 2; const r2 = (60 - 24 * k) * U; ctx.beginPath(); ctx.arc(0, 0, r2, 0, TAU); ctx.stroke(); for (let i = 0; i < 4; i++) { ctx.rotate(1.57); ctx.beginPath(); ctx.moveTo(r2 - 8, 0); ctx.lineTo(r2 + 10, 0); ctx.stroke(); } ctx.restore(); }
    if (f.k === 'beam' && t >= f.from && t < f.to) { const fa = Math.min(1, (t - f.from) / 60) * Math.min(1, (f.to - t) / 120); ctx.save(); ctx.lineCap = 'round'; [[f.w * 4, .25], [f.w * 2, .5], [f.w * .7, 1]].forEach((l, i) => { ctx.strokeStyle = i === 2 ? '#ffffff' : c; ctx.globalAlpha = fa * l[1]; ctx.lineWidth = l[0] * U * (1 + .15 * Math.sin(t / 20)); ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(D.x, D.y); ctx.stroke(); }); ctx.restore(); if (f.cyber) for (let q = 0; q < 3; q++) { const u = Math.random(); P(S, { x: from.x + (D.x - from.x) * u + (Math.random() - .5) * 16, y: from.y + (D.y - from.y) * u, vx: 0, vy: 0, life: 12, sz: 3, c, k: 'sq', drag: 1 }); } glow(D.x, D.y, 50 * U, c, .7 * fa); }
    if (f.k === 'pillar' && t >= f.from && t < f.to) { const k = Math.min(1, (t - f.from) / 200), fa = Math.min(1, (f.to - t) / 300), w = f.w * U, gr = ctx.createLinearGradient(D.x - w, 0, D.x + w, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.5, hexA(c, .75)); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.globalAlpha = fa; ctx.fillStyle = gr; ctx.fillRect(D.x - w, -40, w * 2, (D.y + 60) * k + 40); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(D.x - w * .12, -40, w * .24, (D.y + 60) * k + 40); ctx.globalAlpha = 1; glow(D.x, D.y, 80 * U, c, .6 * fa); if (Math.random() < .6) P(S, { x: D.x + (Math.random() - .5) * w, y: D.y + 40, vx: 0, vy: -3 - Math.random() * 3, life: 30, sz: 2.4, c, drag: .99 }); }
    if (f.k === 'darkorb' && t >= f.from && t < f.to + 200) { const gg = Math.min(1, (t - f.from) / 500), fly = Math.max(0, Math.min(1, (t - (f.to - 220)) / 220)), sx = A.x, sy = from.y + S.dir * 40, x2 = sx + (D.x - sx) * fly, y2 = sy + (D.y - sy) * fly, rad = (14 + 22 * gg) * U; ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = 'rgba(20,0,30,.85)'; ctx.beginPath(); ctx.arc(x2, y2, rad, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'lighter'; glow(x2, y2, rad * 2.2, c, .9); for (let j = 0; j < 3; j++) { const a = Math.random() * TAU, d = rad * 2.5; P(S, { x: x2 + Math.cos(a) * d, y: y2 + Math.sin(a) * d, vx: -Math.cos(a) * 3, vy: -Math.sin(a) * 3, life: 16, sz: 2, c, drag: .99 }); } }
    if (f.k === 'soul' && t >= f.from && t < f.from + f.dur) { const p = (t - f.from) / f.dur, bx = from.x + (D.x - from.x) * p + f.side * Math.sin(p * Math.PI), by = from.y + (D.y - from.y) * p; glow(bx, by, 22 * U, c, .9); glow(bx, by, 8 * U, '#ffffff', .9); P(S, { x: bx, y: by, vx: (Math.random() - .5), vy: -S.dir, life: 16, sz: 3, c, drag: .96 }); }
    if (f.k === 'vortex' && t >= f.from && t < f.to) { const fa = Math.min(1, (t - f.from) / 250) * Math.min(1, (f.to - t) / 250); for (let i = 0; i < 4; i++) { ctx.strokeStyle = c; ctx.globalAlpha = fa * (.7 - i * .12); ctx.lineWidth = 4 - i * .6; ctx.beginPath(); for (let a = 0; a < TAU * 2; a += .15) { const r3 = (8 + a * 7 + i * 6) * U * (f.small ? .7 : 1), x3 = D.x + Math.cos(a + t / 90 + i) * r3, y3 = D.y + Math.sin(a + t / 90 + i) * r3 * .55; if (a) ctx.lineTo(x3, y3); else ctx.moveTo(x3, y3); } ctx.stroke(); } ctx.globalAlpha = 1; if (!f.small) stream(S, from.x, from.y, D.x, D.y, 3, [c, '#ffffff'], 7, 4, 24, 30); }
    if (f.k === 'bolt' && el < 160) { const pts = [[D.x + (Math.random() - .5) * 40, -20]]; while (pts[pts.length - 1][1] < D.y) { const lp = pts[pts.length - 1]; pts.push([lp[0] + (D.x - lp[0]) * .25 + (Math.random() - .5) * 36, lp[1] + 22 + Math.random() * 16]); } pts.push([D.x, D.y]); ctx.lineCap = 'round'; [[14, .25], [6, .6], [2.5, 1]].forEach((l, i) => { ctx.strokeStyle = i === 2 ? '#ffffff' : c; ctx.globalAlpha = l[1] * (1 - el / 160); ctx.lineWidth = l[0]; ctx.beginPath(); pts.forEach((p, j) => (j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); }); ctx.globalAlpha = 1; glow(D.x, D.y, (f.main ? 110 : 60) * U, c, .8 * (1 - el / 160)); }
    if (f.k === 'vine' && t >= f.from && t < f.to) { const p = Math.min(1, (t - f.from) / 420), fa = Math.min(1, (f.to - t) / 250); ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'round'; for (let v = 0; v < 3; v++) { const ox = (v - 1) * 26 * U, cx1 = from.x + ox - 60 + v * 40, cy1 = from.y + S.dir * 100, ex = from.x + (D.x - from.x) * p + ox * .4, ey = from.y + (D.y - from.y) * p; ctx.strokeStyle = `rgba(40,110,40,${fa})`; ctx.lineWidth = 6 * U; ctx.beginPath(); ctx.moveTo(from.x + ox * .5, from.y); ctx.quadraticCurveTo(cx1, cy1, ex, ey); ctx.stroke(); ctx.strokeStyle = hexA(c, fa); ctx.lineWidth = 2 * U; ctx.stroke(); } ctx.globalCompositeOperation = 'lighter'; }
    if (f.k === 'rock' && t >= f.from && t < f.from + f.dur + 200) { const p = Math.min(1, (t - f.from) / f.dur), x5 = D.x + f.dx * (1 - p * .6), y5 = -30 + (D.y + 10 + 30) * p * p; ctx.globalCompositeOperation = 'source-over'; ctx.save(); ctx.translate(x5, y5); ctx.rotate(f.rot + p * 3); ctx.fillStyle = '#7a6248'; ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i < 7; i++) { const a = i / 7 * TAU, r5 = f.r * U * (.75 + .25 * Math.sin(i * 2.3 + f.rot)); if (i) ctx.lineTo(Math.cos(a) * r5, Math.sin(a) * r5); else ctx.moveTo(Math.cos(a) * r5, Math.sin(a) * r5); } ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); ctx.globalCompositeOperation = 'lighter'; if (p >= 1 && !f.hit) { f.hit = 1; S.shake = Math.max(S.shake, 10); burst(S, x5, y5, 14, ['#d8b48a', '#8a6a4a'], 4, 30, 3, 'rock'); } }
    if (f.k === 'crystal' && t >= f.from && t < f.from + f.dur) { const p = (t - f.from) / f.dur, x6 = D.x + f.dx * (1 - p), y6 = -20 + (D.y + 20) * p; ctx.save(); ctx.translate(x6, y6); ctx.rotate(f.rot + p * 4); ctx.fillStyle = hexA(f.c, .75); ctx.beginPath(); ctx.moveTo(0, -14 * U); ctx.lineTo(6 * U, 0); ctx.lineTo(0, 14 * U); ctx.lineTo(-6 * U, 0); ctx.closePath(); ctx.fill(); ctx.restore(); glow(x6, y6, 16 * U, f.c, .7); }
    if (f.k === 'jaws' && el < 420) { const p = Math.min(1, el / 160), fa = 1 - Math.max(0, (el - 200) / 220), gap = 40 * (1 - p), sc = (f.small ? .7 : 1) * U; ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = hexA(c, .9 * fa); [-1, 1].forEach(s1 => { ctx.save(); ctx.translate(D.x, D.y + s1 * (gap + 10) * sc); ctx.scale(sc, s1 * sc); for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * 13 - 6, -10); ctx.lineTo(i * 13 + 6, -10); ctx.lineTo(i * 13, 12); ctx.closePath(); ctx.fill(); } ctx.fillRect(-48, -22, 96, 12); ctx.restore(); }); ctx.globalCompositeOperation = 'lighter'; }
    if (f.k === 'slash' && el < 420) { const p = Math.min(1, el / 130), fa = 1 - Math.max(0, (el - 150) / 270); ctx.save(); ctx.translate(D.x + (f.off || 0) * Math.cos(f.ang + 1.57), D.y + (f.off || 0) * Math.sin(f.ang + 1.57)); ctx.rotate(f.ang); ctx.scale(U, U); for (let L = 0; L < 3; L++) { ctx.globalAlpha = fa * [1, .55, .28][L]; ctx.fillStyle = L ? c : '#ffffff'; const wd = [3, 9, 20][L] * f.w, R2 = 95, a0 = -1.25, a1 = -1.25 + 2.5 * p; ctx.beginPath(); ctx.arc(-10, 42, R2, a0, a1); ctx.arc(-10, 42 - wd, R2 - wd * .25, a1, a0, true); ctx.closePath(); ctx.fill(); } ctx.restore(); ctx.globalAlpha = 1; }
  });
}
function drawGod(S, t) {
  const A = S.A, D = S.D, c = S.c, U = S.U, g = S.god, top = { x: A.x, y: A.y + S.dir * (A.h * .5 + 40) };
  S.stars.forEach(s => glow(s.x, s.y, 4, S.c2, S.dark * (.4 + .4 * Math.sin(t / 300 + s.p))));
  if (g === 'blue' && S.crack != null) { const e = Math.min(1, (t - S.crack) / 300), fa = Math.max(0, 1 - (t - S.crack - 900) / 800); ctx.strokeStyle = hexA(S.c2, fa); ctx.lineWidth = 3; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(D.x, -5); let x = D.x, y = -5; for (let k = 0; k < 6; k++) { x += (Math.random() - .5) * 40 + (i - 2.5) * 8; y += 18 * e; ctx.lineTo(x, y); } ctx.stroke(); } glow(D.x, 0, 160 * e, c, .7 * fa); }
  // 神の紋様の輪
  const aura = A.glow;
  if (aura > 0) {
    ctx.save(); ctx.translate(A.x, A.y + A.h * .3); ctx.scale(1, .38);
    [[110, t / 900, 24], [86, -t / 700, 16]].forEach(r => { ctx.save(); ctx.rotate(r[1]); ctx.strokeStyle = hexA(c, .8 * aura); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, r[0] * U, 0, TAU); ctx.stroke(); for (let i = 0; i < r[2]; i++) { ctx.rotate(TAU / r[2]); ctx.fillStyle = hexA(S.c2, .9 * aura); ctx.fillRect(r[0] * U - 10, -2, i % 3 ? 6 : 12, 4); } ctx.restore(); });
    ctx.restore();
    for (let b = 0; b < 5; b++) { const a = t / 600 + b * TAU / 5; glow(A.x + Math.cos(a) * 120 * U, A.y + A.h * .3 + Math.sin(a) * 42 * U, 10, S.c2, .9 * aura); }
  }
  if (S.orb) { glow(S.orb.x, S.orb.y, S.orb.r * 3 * U, c, 1); glow(S.orb.x, S.orb.y, S.orb.r * U, '#ffffff', 1); }
  S.bolts.forEach(b => { const el = t - b.t; if (b.arc) { const a = Math.random() * TAU; bolt(b.x + Math.cos(a) * 90, b.y + Math.sin(a) * 60, b.x, b.y, c, 3, 1 - el / 90); } else { bolt(b.x, -20, b.x + (D.x - b.x) * .6, D.y + 30, c, 5, 1 - el / 180); glow(b.x + (D.x - b.x) * .6, D.y + 30, 60, c, .7 * (1 - el / 180)); } });
  if (S.beam > 0) { const w = S.beam; ctx.lineCap = 'round'; [[70, .18], [40, .35], [20, .7], [8, 1]].forEach((l, i) => { ctx.strokeStyle = i === 3 ? '#ffffff' : i === 2 ? S.c2 : c; ctx.globalAlpha = l[1] * w; ctx.lineWidth = l[0] * U * w * (1 + .12 * Math.sin(t / 15)); ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(D.x, D.y); ctx.stroke(); }); ctx.globalAlpha = 1; for (let q = 0; q < 3; q++) bolt(top.x + (Math.random() - .5) * 20, top.y, D.x + (Math.random() - .5) * 50, D.y, S.c2, 2, w); glow(D.x, D.y, 120 * U, c, w); }
  if (S.fist) { const fy = S.fist.y, grd = ctx.createLinearGradient(0, fy - 260, 0, fy); grd.addColorStop(0, hexA(c, 0)); grd.addColorStop(1, hexA(c, .55)); ctx.fillStyle = grd; ctx.fillRect(D.x - 60 * U, fy - 260, 120 * U, 260); for (let k = 0; k < 4; k++) { glow(D.x + (k - 1.5) * 30 * U, fy - 6, 30 * U, c, .9); glow(D.x + (k - 1.5) * 30 * U, fy - 6, 12 * U, '#ffffff', .9); } glow(D.x, fy - 40, 90 * U, c, .9); glow(D.x, fy - 40, 40 * U, S.c2, .9); }
  if (S.sun) { glow(S.sun.x, S.sun.y, S.sun.r * 4 * U, g === 'creator' ? '#ffffff' : '#ff8a3c', .6); glow(S.sun.x, S.sun.y, S.sun.r * 2.4 * U, c, 1); glow(S.sun.x, S.sun.y, S.sun.r * U, '#ffffff', 1); ctx.save(); ctx.translate(S.sun.x, S.sun.y); ctx.rotate(t / 900); for (let i = 0; i < 16; i++) { ctx.rotate(TAU / 16); ctx.globalAlpha = .18; ctx.fillStyle = g === 'creator' ? ['#ff6b6b', '#ffd25a', '#7aff8a', '#6bd0ff', '#c08bff'][i % 5] : c; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(220, -10); ctx.lineTo(220, 10); ctx.closePath(); ctx.fill(); } ctx.restore(); ctx.globalAlpha = 1; }
  if (S.pillar > 0) { const pw = 90 * U, gr = ctx.createLinearGradient(D.x - pw, 0, D.x + pw, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.5, hexA(c, .8)); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.globalAlpha = S.pillar; ctx.fillStyle = gr; ctx.fillRect(D.x - pw, -60, pw * 2, D.y + 120); ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillRect(D.x - 10, -60, 20, D.y + 120); ctx.globalAlpha = 1; }
  if (S.dome != null) { const de = (t - S.dome) / 900; if (de < 1) { const rad = (40 + 260 * ease(de)) * U; glow(D.x, D.y, rad, c, (1 - de) * .9); glow(D.x, D.y, rad * .5, '#ffffff', 1 - de); } }
}

/* =====================================================================
 * 召喚の演出：通常・セット・アドバンス・特殊・反転・儀式・融合・神
 * info = { rect（召喚されたカードの場所）, d（カード）, atk, def, how, faceDown, mats: [{rect, d, atk, def}], speed }
 * ===================================================================== */
let BACK = null;
export function backImg() {
  if (BACK) return BACK;
  const CW = 78, CH = 114, o = document.createElement('canvas'); o.width = CW * 2; o.height = CH * 2;
  const x = o.getContext('2d'); x.scale(2, 2);
  rr(x, 1, 1, CW - 2, CH - 2, 6); x.fillStyle = '#5e3517'; x.fill(); x.save(); x.clip();
  for (let k = 0; k < 14; k++) { x.strokeStyle = ['#b5743a', '#6e3f1c', '#d0914c', '#4a2a10'][k % 4]; x.lineWidth = 7; x.beginPath(); for (let t = 0; t < 14; t += .2) { const r = 1 + t * 4.5, a = t + k * .45; x.lineTo(CW / 2 + Math.cos(a) * r * .8, CH / 2 + Math.sin(a) * r); } x.stroke(); }
  x.restore(); x.fillStyle = '#0f0905'; x.strokeStyle = '#d9a35a'; x.lineWidth = 1.2; x.beginPath(); x.ellipse(CW / 2, CH / 2, 18, 25, 0, 0, TAU); x.fill(); x.stroke();
  x.strokeStyle = '#24150b'; x.lineWidth = 1.6; rr(x, 1, 1, CW - 2, CH - 2, 6); x.stroke();
  return (BACK = o);
}
const SUMMON_COLOR = { normal: '#ffe08a', set: '#d9a35a', advance: '#ffd27a', special: '#9fe6ff', flip: '#ffffff', ritual: '#7fb2ff', fusion: '#c9a7ff', god: '#ffc93d' };
const SUMMON_LAND = { normal: 420, set: 300, advance: 900, special: 1100, flip: 500, ritual: 1800, fusion: 1800, god: 2700 };

export function playSummon(root, info) {
  ensureCanvas(root); fit();
  return new Promise(resolve => {
    const r = info.rect, U = Math.max(.6, Math.min(1.3, r.width / 78));
    let how = info.how;
    if (!info.faceDown && (info.d.race === '幻神獣族' || info.d.race === '創造神族') && how !== 'set') how = 'god';
    if (info.faceDown) how = how === 'flip' ? 'flip' : 'set';
    const S = { how, c: SUMMON_COLOR[how] || '#9fe6ff', U, x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height,
      img: info.faceDown && how !== 'flip' ? backImg() : cardImg(info.d, info.atk, info.def), parts: [], rings: [], shake: 0, flash: 0, dark: 0, quake: 0, t: 0, last: 0,
      speed: info.speed || 1, L: SUMMON_LAND[how] || 600, hit: false, bolt: null, done: false,
      mats: (info.mats || []).map(m => ({ x: m.rect.left + m.rect.width / 2, y: m.rect.top + m.rect.height / 2, w: m.rect.width, h: m.rect.height, img: cardImg(m.d, m.atk, m.def), a: 1, s: 1 })) };
    S.end = S.L + (how === 'god' ? 900 : how === 'set' ? 250 : 650);
    cv.style.display = 'block';
    const step = now => {
      if (S.done) return;
      const dt = Math.min(32, now - (S.last || now)) * S.speed; S.last = now; S.t += dt;
      summonTick(S); summonDraw(S);
      if (S.t > S.end) { S.done = true; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); cv.style.display = 'none'; resolve(); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
function SP(S, o) { o.max = o.life; o.drag = o.drag || .96; o.grav = o.grav || 0; o.sz = o.sz || 3; if (S.parts.length < 1200) S.parts.push(o); }
function sburst(S, x, y, n, cols, sp, life, sz, flat) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = sp * (.3 + Math.random()); SP(S, { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * (flat ? .35 : 1), life: life * (.6 + Math.random() * .7), sz: sz * (.5 + Math.random()), c: cols[i % cols.length], drag: .92, grav: flat ? 0 : .04 }); } }
const easeIn = x => x * x * x;
function summonTick(S) {
  const t = S.t, k = S.how, c = S.c, x = S.x, y = S.y, L = S.L, U = S.U;
  if (k === 'advance' && t < 800) S.mats.forEach(m => {
    m.a = Math.max(0, 1 - t / 600);
    if (t < 600) for (let i = 0; i < 4; i++) SP(S, { x: m.x + (Math.random() - .5) * m.w, y: m.y + (Math.random() - .5) * m.h, vx: (x - m.x) * .02 + (Math.random() - .5), vy: (y - m.y) * .02 - 1, life: 40, sz: 2.4, c: Math.random() < .5 ? c : '#ffffff', drag: .97 });
  });
  if (k === 'fusion' || k === 'ritual') S.mats.forEach(m => {
    const p = Math.min(1, t / (L * .8)), ang = Math.atan2(m.y - y, m.x - x) + p * 6, d0 = Math.hypot(m.x - x, m.y - y), r = d0 * (1 - easeIn(p));
    m.dx = x + Math.cos(ang) * r; m.dy = y + Math.sin(ang) * r * .7; m.a = 1 - Math.max(0, (p - .7) / .3); m.s = 1 - .5 * p;
    if (Math.random() < .6) SP(S, { x: m.dx, y: m.dy, vx: 0, vy: 0, life: 18, sz: 3, c, drag: .9 });
  });
  if (k === 'ritual' && t > 200 && t < L) for (let q = 0; q < 6; q++) { const a = q / 6 * TAU + t / 600; SP(S, { x: x + Math.cos(a) * 100 * U, y: y + S.h * .35 + Math.sin(a) * 34 * U, vx: (Math.random() - .5) * .6, vy: -2 - Math.random() * 2.5, life: 30, sz: 3.6, c: Math.random() < .5 ? c : '#d6ecff', drag: .98, grav: -.02 }); }
  if (k === 'special' && t > 150 && t < L) for (let s = 0; s < 5; s++) SP(S, { x: x + (Math.random() - .5) * 60 * U, y: y + S.h * .45, vx: 0, vy: -4 - Math.random() * 4, life: 28, sz: 2.6, c: Math.random() < .5 ? c : '#ffffff', drag: .99 });
  if (k === 'god') {
    S.dark = Math.min(.85, t / 700);
    if (t > 600 && t < L && Math.random() < .25) S.bolt = { t, x: x + (Math.random() - .5) * 240 };
    if (t > 1400 && t < L) for (let g = 0; g < 8; g++) SP(S, { x: x + (Math.random() - .5) * 90 * U, y: -10, vx: 0, vy: 8 + Math.random() * 6, life: 60, sz: 2.4, c: Math.random() < .5 ? c : '#fff1b0', drag: 1 });
    S.quake = t < L ? Math.min(1, t / 1200) * 3 : 0;
  }
  if (k === 'ritual' || k === 'fusion') S.dark = Math.min(.55, t / 600);
  if (t > L + 200) S.dark *= .9;
  if (!S.hit && t >= L) {
    S.hit = true;
    const big = k === 'god' ? 1 : k === 'advance' || k === 'ritual' || k === 'fusion' ? .75 : k === 'set' ? .1 : .45;
    S.flash = big; S.shake = k === 'set' ? 1 : 18 * big;
    S.rings.push({ x, y: y + S.h / 2 - 4, r: S.w * .5, v: k === 'set' ? 2 : (9 * big + 3) * U, a: 1, c: k === 'normal' || k === 'advance' ? '#e8d2a8' : c });
    if (k !== 'set') sburst(S, x, y + S.h / 2 - 6, k === 'normal' ? 36 : 70 * big + 20, k === 'normal' ? ['#d8c3a0', '#bfa27c', '#ffffff'] : [c, '#ffffff'], (k === 'normal' ? 5 : 8 * big + 3) * U, 40, 3, k === 'normal');
    if (k === 'god') { for (let i = 0; i < 3; i++) S.rings.push({ x, y, r: 20 + i * 20, v: (14 - i * 3) * U, a: 1, c: i ? c : '#ffffff' }); sburst(S, x, y, 120, [c, '#fff1b0', '#ffffff'], 11 * U, 60, 3.5); }
  }
  S.parts.forEach(p => { p.x += p.vx; p.y += p.vy; p.vx *= p.drag; p.vy = p.vy * p.drag + p.grav; p.life--; }); S.parts = S.parts.filter(p => p.life > 0);
  S.rings.forEach(r => { r.r += r.v; r.v *= .96; r.a *= .94; }); S.rings = S.rings.filter(r => r.a > .03);
  S.shake *= .85; S.flash *= .88;
}
function sImg(S, img, x, y, s, a, sx) { ctx.save(); ctx.translate(x, y); ctx.scale(s * (sx == null ? 1 : sx), s); ctx.globalAlpha = Math.max(0, Math.min(1, a)); ctx.drawImage(img, -S.w / 2, -S.h / 2, S.w, S.h); ctx.restore(); }
function summonDraw(S) {
  const t = S.t, k = S.how, c = S.c, x = S.x, y = S.y, L = S.L, U = S.U, sh = S.shake + S.quake;
  const dpr = cv.width / W; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H); ctx.save();
  ctx.translate((Math.random() - .5) * sh, (Math.random() - .5) * sh);
  if (S.dark > .01) { ctx.fillStyle = `rgba(0,0,0,${S.dark * .6})`; ctx.fillRect(-30, -30, W + 60, H + 60); }
  ctx.globalCompositeOperation = 'lighter';
  if (k === 'special' && t < L + 300) {
    const o = Math.min(1, t / 250), fa = t > L ? 1 - (t - L) / 300 : 1;
    ctx.save(); ctx.translate(x, y + S.h * .45); ctx.scale(1, .32); ctx.strokeStyle = hexA(c, .9 * fa); ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 70 * o * U, 0, TAU); ctx.stroke(); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 52 * o * U, 0, TAU); ctx.stroke(); ctx.restore();
    const gr = ctx.createLinearGradient(x - 50 * U, 0, x + 50 * U, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.5, hexA(c, .5 * fa * o)); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.fillRect(x - 50 * U, y - 260, 100 * U, 260 + S.h * .5);
  }
  if (k === 'ritual' && t < L + 600) {
    const o = Math.min(1, t / 400), fa = t > L ? Math.max(0, 1 - (t - L) / 600) : 1, cy = y + S.h * .35;
    ctx.save(); ctx.translate(x, cy); ctx.scale(1, .34); ctx.rotate(t / 1200); ctx.strokeStyle = hexA(c, .9 * fa); ctx.lineWidth = 3; const R1 = 110 * o * U, R2 = 92 * o * U;
    ctx.beginPath(); ctx.arc(0, 0, R1, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, R2, 0, TAU); ctx.stroke();
    for (let i = 0; i < 2; i++) { ctx.beginPath(); for (let j = 0; j <= 3; j++) { const a = j / 3 * TAU + i * Math.PI / 3 - 1.57; ctx.lineTo(Math.cos(a) * R2, Math.sin(a) * R2); } ctx.stroke(); }
    ctx.restore(); for (let q = 0; q < 6; q++) { const a = q / 6 * TAU + t / 600; glow(x + Math.cos(a) * 100 * U, cy + Math.sin(a) * 34 * U, 16 * U, c, .9 * fa); }
  }
  if (k === 'fusion' && t < L + 400) {
    const fa = t > L ? Math.max(0, 1 - (t - L) / 400) : Math.min(1, t / 300);
    for (let v = 0; v < 4; v++) { ctx.strokeStyle = c; ctx.globalAlpha = fa * (.7 - v * .13); ctx.lineWidth = 4 - v * .7; ctx.beginPath(); for (let a = 0; a < TAU * 2.2; a += .12) { const r3 = (6 + a * 11 + v * 7) * U, xx = x + Math.cos(a - t / 120 + v) * r3, yy = y + Math.sin(a - t / 120 + v) * r3 * .6; if (a) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); } ctx.stroke(); }
    ctx.globalAlpha = 1; glow(x, y, 70 * U, c, .7 * fa);
  }
  if (k === 'god') {
    if (S.bolt && t - S.bolt.t < 120) {
      const b = S.bolt, pts = [[b.x, -10]];
      while (pts[pts.length - 1][1] < y - 60) { const l = pts[pts.length - 1]; pts.push([l[0] + (Math.random() - .5) * 34, l[1] + 20 + Math.random() * 14]); }
      [[8, .4, c], [2.5, 1, '#ffffff']].forEach(l => { ctx.strokeStyle = l[2]; ctx.lineWidth = l[0]; ctx.globalAlpha = (1 - (t - b.t) / 120) * l[1]; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); });
      ctx.globalAlpha = 1;
    }
    if (t > 1300) {
      const fa = Math.min(1, (t - 1300) / 400) * (t > L + 500 ? Math.max(0, 1 - (t - L - 500) / 400) : 1), gr = ctx.createLinearGradient(x - 80 * U, 0, x + 80 * U, 0);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.5, hexA(c, .7 * fa)); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.fillRect(x - 80 * U, -20, 160 * U, y + S.h);
      ctx.fillStyle = `rgba(255,255,255,${.6 * fa})`; ctx.fillRect(x - 8 * U, -20, 16 * U, y + S.h);
    }
  }
  S.rings.forEach(r => { ctx.strokeStyle = r.c; ctx.globalAlpha = r.a; ctx.lineWidth = 5 * r.a + 1; ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r, r.r * .32, 0, 0, TAU); ctx.stroke(); }); ctx.globalAlpha = 1;
  S.parts.forEach(p => { ctx.globalAlpha = Math.min(1, p.life / p.max * 1.6); const rad = p.sz * 2.6; ctx.drawImage(spr(p.c), p.x - rad, p.y - rad, rad * 2, rad * 2); }); ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  S.mats.forEach(m => { if (m.a > 0) { ctx.save(); ctx.translate(m.dx ?? m.x, m.dy ?? m.y); ctx.scale(m.s, m.s); ctx.globalAlpha = m.a; ctx.drawImage(m.img, -m.w / 2, -m.h / 2, m.w, m.h); ctx.restore(); } });
  const img = S.img;
  if (k === 'normal' || k === 'advance') { if (!(k === 'advance' && t < 300)) { const p = Math.min(1, t / L), s = 1 + 1.1 * (1 - easeIn(p)); sImg(S, img, x, y - 160 * U * (1 - easeIn(p)), s, Math.min(1, t / 150)); } }
  else if (k === 'set') { const p = Math.min(1, t / L); sImg(S, img, x - (1 - ease(p)) * 120 * U, y, 1, p); }
  else if (k === 'special') { if (t > 200) { const p = Math.min(1, (t - 200) / (L - 200)); ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, y + S.h / 2); ctx.clip(); sImg(S, img, x, y + S.h * (1 - ease(p)), 1, 1); ctx.restore(); } }
  else if (k === 'flip') { const p = Math.min(1, t / L), sx = Math.cos(p * Math.PI); sImg(S, sx > 0 ? backImg() : img, x, y - 10 * Math.sin(p * Math.PI), 1 + .15 * Math.sin(p * Math.PI), 1, Math.abs(sx)); }
  else if (k === 'ritual') { if (t > L * .5) { const p = Math.min(1, (t - L * .5) / (L * .5)); sImg(S, img, x, y - 40 * U * (1 - ease(p)), .6 + .4 * ease(p), p); } }
  else if (k === 'fusion') { if (t > L * .8) { const p = Math.min(1, (t - L * .8) / (L * .2)); sImg(S, img, x, y - 20 * (1 - p), .3 + .7 * ease(p), p); } }
  else if (k === 'god') { if (t > 1700) { const p = Math.min(1, (t - 1700) / (L - 1700)); sImg(S, img, x, y - 220 * (1 - easeIn(p)), 1.6 - .6 * ease(p), Math.min(1, p * 3)); } }
  if (t >= L && t < L + 500 && k !== 'set') { ctx.globalCompositeOperation = 'lighter'; glow(x, y, 130 * U, c, .5 * (1 - (t - L) / 500)); ctx.globalCompositeOperation = 'source-over'; }
  ctx.restore();
  if (S.flash > .01) { ctx.fillStyle = `rgba(255,255,255,${S.flash * .4})`; ctx.fillRect(0, 0, W, H); }
  if (k === 'god') {
    const bh = 44 * Math.min(1, t / 400) * (t > S.end - 400 ? Math.max(0, (S.end - t) / 400) : 1);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh);
    if (bh > 20) { ctx.fillStyle = '#fff1b0'; ctx.font = '700 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('― 神 の 降 臨 ―', W / 2, bh - 16); ctx.textAlign = 'left'; }
  }
}
