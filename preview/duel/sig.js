// カードごとの専用演出（キャンバスに描く）。強力な制限カードの発動を、カード名と効果に合わせて見せる。
// playSignature() は演出が終わったら解決する Promise を返す。カードの位置は画面上の四角（getBoundingClientRect）で受け取る
import { cardImg, backImg } from './fx.js';
const TAU = Math.PI * 2;

/* ---------- どのカードにどの演出を使うか ---------- */
const SIG = {
  'ブラック・ホール': 'hole', 'ライトニング・ボルテックス': 'vortex', '激流葬': 'torrent', '聖なるバリアミラーフォース': 'mirror',
  '大嵐': 'storm', 'サイクロン': 'cyclone', 'ハーピィの羽根帚': 'harpie', 'ナイト・ショット': 'night', '神の宣告': 'judgment', '神の警告': 'warning',
  '強欲な壺': 'greed', '強欲で謙虚な壺': 'humble', '増援': 'reinforce', '封印の黄金櫃': 'sarco', '死者蘇生': 'revive',
  '早すぎた埋葬': 'burial', 'リビングデッドの呼び声': 'call', '超融合': 'superfusion', '未来融合フューチャー・フュージョン': 'future',
  '洗脳ブレインコントロール': 'brain', '光の護封剣': 'swords', '王宮のお触れ': 'decree', 'スキルドレイン': 'drain',
};
const norm = s => String(s || '').replace(/[\s－\-]/g, '');
/** カード名から専用演出の種類を返す（無ければ null） */
export function sigKey(name) { return SIG[norm(name)] || null; }

/* ---------- 下ごしらえ ---------- */
function hexA(h, a) { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }
const SPR = {}, HSPR = {};
function spr(c) {
  if (SPR[c]) return SPR[c];
  const o = document.createElement('canvas'); o.width = o.height = 64;
  const x = o.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, '#fff'); g.addColorStop(.18, c); g.addColorStop(.5, hexA(c, .35)); g.addColorStop(1, hexA(c, 0));
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); return (SPR[c] = o);
}
/** 虹色の光（色相 h） */
function hspr(h) {
  h = Math.round((((h % 360) + 360) % 360) / 15) * 15 % 360;
  if (HSPR[h]) return HSPR[h];
  const o = document.createElement('canvas'); o.width = o.height = 64;
  const x = o.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, '#fff'); g.addColorStop(.2, `hsla(${h},100%,65%,1)`); g.addColorStop(.5, `hsla(${h},100%,60%,.35)`); g.addColorStop(1, `hsla(${h},100%,60%,0)`);
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); return (HSPR[h] = o);
}
let SMOKE = null;
function smoke() {
  if (SMOKE) return SMOKE;
  const o = document.createElement('canvas'); o.width = o.height = 64;
  const x = o.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(40,36,34,.7)'); g.addColorStop(1, 'rgba(40,36,34,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return (SMOKE = o);
}
const hsl = (h, l, a) => `hsla(${((h % 360) + 360) % 360},100%,${l}%,${a})`;
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
const SPELL = '#5dbfa1', TRAP = '#d98bb2';
const ST_IMG = {};
/** 魔法・罠カードの表面 */
function stImg(d) {
  const k = d.name;
  if (ST_IMG[k]) return ST_IMG[k];
  const CW = 78, CH = 114, o = document.createElement('canvas'); o.width = CW * 2; o.height = CH * 2;
  const x = o.getContext('2d'); x.scale(2, 2);
  const spell = d.kind === 'spell';
  rr(x, 1, 1, CW - 2, CH - 2, 6); x.fillStyle = spell ? SPELL : TRAP; x.fill(); x.lineWidth = 1.6; x.strokeStyle = '#24150b'; x.stroke();
  x.fillStyle = 'rgba(255,255,255,.62)'; rr(x, 5, 5, CW - 10, 22, 3); x.fill();
  x.fillStyle = '#262b3a'; x.font = '700 9px sans-serif'; x.fillText(d.name.slice(0, 7), 8, 15); x.fillText(d.name.slice(7, 14), 8, 25);
  x.fillStyle = 'rgba(255,255,255,.28)'; rr(x, 5, 31, CW - 10, 56, 3); x.fill();
  x.fillStyle = 'rgba(38,43,58,.3)'; x.font = '700 30px sans-serif'; x.textAlign = 'center'; x.fillText(spell ? '✦' : '◆', CW / 2, 70);
  x.fillStyle = 'rgba(255,255,255,.62)'; rr(x, 5, CH - 19, CW - 10, 14, 3); x.fill();
  x.fillStyle = '#262b3a'; x.font = '700 9px sans-serif'; x.fillText(`${d.subtype || ''}${spell ? '魔法' : '罠'}`, CW / 2, CH - 8);
  return (ST_IMG[k] = o);
}
/** app.js から受け取ったカード（{rect, d, atk, def, faceUp, defPos}）を、演出で動かすカードにする */
function mk(c) {
  if (!c || !c.rect) return null;
  const r = c.rect, def = !!c.defPos;
  const img = !c.faceUp ? backImg() : cardImg(c.d, c.atk, c.def);
  // 守備表示のカードは横向き（画面の四角は横長なので、縦横を入れ替えて回す）
  return { uid: c.uid, img, x: r.left + r.width / 2, y: r.top + r.height / 2, w: def ? r.height : r.width, h: def ? r.width : r.height,
    rot: 0, base: def ? Math.PI / 2 : 0, s: 1, sy: 1, a: 1, flip: 1, glow: 0, gc: '#fff', def };
}

/* ---------- キャンバス ---------- */
let cv = null, ctx = null, W = 0, H = 0;
function ensureCanvas(root) {
  if (!cv || !cv.isConnected) {
    cv = document.createElement('canvas'); cv.className = 'fx-layer';
    (root.querySelector('.droot') || root).appendChild(cv);
    ctx = cv.getContext('2d');
  }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/**
 * カードの専用演出を再生する。
 * info = { key, name, kind, me（発動したのが画面の下の人か）, speed,
 *          self（発動したカード）, dest（この効果で破壊されるカード）, att（攻撃してきたモンスター）, target（対象のカード）,
 *          opp（相手のモンスター）, mons（フィールドのモンスター）, traps（フィールドの罠）,
 *          board: {left, top, right, bottom, cx, cy, myMonY, oppMonY, myStY}, deck, gy, hand（それぞれ {x, y}）, drawn（ドローした枚数） }
 */
export function playSignature(root, info) {
  ensureCanvas(root);
  return new Promise(resolve => {
    const S = setup(info);
    cv.style.display = 'block';
    const step = now => {
      if (S.done) return;
      tick(S, now);
      if (S.t > S.end) { S.done = true; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); cv.style.display = 'none'; resolve(); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

function setup(I) {
  const B = I.board, bw = B.right - B.left;
  const S = { I, B, U: Math.max(.7, Math.min(1.6, bw / 420)), t: 0, last: 0, speed: (I.speed || 1) * (window.__fxSlow || 1), end: 2800, done: false,
    cards: [], tints: [], zaps: [], parts: [], rings: [], ev: [], hooks: [], shards: [], cracks: [], fire: [], bolts: [],
    shake: 0, flash: 0, flashC: '255,255,255', dark: 0, invert: 0, freeze: 0, chroma: 0, title: null };
  S.dir = I.me ? -1 : 1; // 相手の方向（画面の上が相手なら -1）
  S.self = mk(I.self);
  if (!S.self) {
    // 手札から直接発動した時など、フィールドに見当たらない時は手札の辺りから出す
    const h = I.hand || { x: B.cx, y: I.me ? B.bottom : B.top }, w = 60 * S.U;
    S.self = { img: cardImg({ name: I.name, kind: I.kind, subtype: I.subtype }), x: h.x, y: h.y, w, h: w * 86 / 59, rot: 0, base: 0, s: 1, sy: 1, a: 1, flip: 1, glow: 0, gc: '#fff' };
  }
  S.cards.push(S.self);
  const add = c => { const o = mk(c); if (o) S.cards.push(o); return o; };
  S.dest = (I.dest || []).map(add).filter(Boolean);
  const known = new Map(S.dest.map(c => [c.uid, c]));
  S.att = I.att ? (known.get(I.att.uid) || add(I.att)) : null;
  S.target = I.target ? (known.get(I.target.uid) || null) : null;
  activate(S);
  (FX[I.key] || FX.generic)(S);
  return S;
}

/* ---------- 共通の動き ---------- */
function at(S, t, f) { S.ev.push([t, f]); }
function hook(S, f) { S.hooks.push(f); }
const ease = x => 1 - Math.pow(1 - x, 3);
function P(S, o) { o.max = o.life; o.drag = o.drag || .96; o.grav = o.grav || 0; o.sz = o.sz || 3; o.k = o.k || 'glow'; if (S.parts.length < 2200) S.parts.push(o); }
function burst(S, x, y, n, cols, sp, life, sz, k) {
  for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = sp * S.U * (.3 + Math.random()); P(S, { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (.6 + Math.random() * .7), sz: sz * S.U * (.5 + Math.random()), c: cols[i % cols.length], drag: .92, grav: .06, k }); }
}
function rainbow(S, x, y, n, sp, life, sz, k) {
  for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = sp * S.U * (.3 + Math.random()); P(S, { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (.6 + Math.random() * .7), sz: sz * S.U * (.5 + Math.random()), hue: Math.random() * 360, drag: .92, grav: .05, k }); }
}
/** 激しい命中：一瞬の静止・白黒反転・画面のひび・閃光・衝撃波 */
function impact(S, x, y, pow, col) {
  S.freeze = Math.max(S.freeze, 60 + 50 * pow); S.invert = 1; S.shake = Math.max(S.shake, (14 + 16 * pow) * S.U);
  S.flash = 1; S.flashC = pow > .8 ? '255,80,60' : '255,255,255'; S.chroma = Math.max(S.chroma, pow);
  S.rings.push({ x, y, r: 8, v: (12 + 10 * pow) * S.U, a: 1, c: '#ffffff', lw: 5 });
  S.rings.push({ x, y, r: 4, v: (8 + 6 * pow) * S.U, a: 1, c: col || '#ff8a3c', lw: 8 });
  const cr = { t: S.t, lines: [] };
  for (let i = 0; i < 7 + Math.round(pow * 6); i++) {
    const a = Math.random() * TAU, L = (60 + Math.random() * 120 * pow) * S.U, pts = [[x, y]]; let px = x, py = y;
    for (let j = 0; j < 4; j++) { const aa = a + (Math.random() - .5) * .6; px += Math.cos(aa) * L / 4; py += Math.sin(aa) * L / 4; pts.push([px, py]); }
    cr.lines.push(pts);
  }
  S.cracks.push(cr);
}
/** カードが爆発して破片と煙になる（rb：虹色） */
function explode(S, c, col, rb) {
  if (!c || c.a <= 0) return;
  c.a = 0;
  for (let i = 0; i < 16; i++) {
    const cx = (Math.random() - .5) * c.w, cy = (Math.random() - .5) * c.h, pts = [];
    for (let k = 0; k < 3; k++) { const a = Math.random() * TAU, d = (6 + Math.random() * 10) * c.w / 52; pts.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d]); }
    S.shards.push({ c, x: c.x, y: c.y, pts, vx: cx * .3 + (Math.random() - .5) * 8, vy: cy * .25 - 4 - Math.random() * 5, rot: c.base || 0, vr: (Math.random() - .5) * .5, a: 1, col: col || '#ff8a3c', hue: rb ? Math.random() * 360 : null });
  }
  if (rb) { rainbow(S, c.x, c.y, 60, 10, 40, 3.5); rainbow(S, c.x, c.y, 22, 14, 22, 1.8, 'streak'); }
  else { burst(S, c.x, c.y, 50, ['#fff1c4', '#ffd27a', '#ff8a3c', '#ff4a1a'], 10, 40, 3.5); burst(S, c.x, c.y, 22, ['#ffffff', '#ffe9b0'], 14, 22, 1.8, 'streak'); }
  for (let s = 0; s < 10; s++) { const a = Math.random() * TAU; P(S, { x: c.x, y: c.y, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2 - 1, life: 70, sz: (10 + Math.random() * 10) * S.U, k: 'smoke', drag: .97, grav: -.02 }); }
  S.fire.push({ x: c.x, y: c.y, t: S.t, rb });
}
function move(S, c, to, ms, o = {}) {
  const f = { x: c.x, y: c.y, rot: c.rot, s: c.s, a: c.a, sy: c.sy }, t0 = S.t;
  hook(S, t => {
    const p = Math.min(1, (t - t0) / ms), e = o.lin ? p : o.inq ? p * p * p : ease(p);
    c.x = f.x + (to.x - f.x) * e; c.y = f.y + (to.y - f.y) * e - (o.arc ? Math.sin(p * Math.PI) * o.arc : 0);
    c.rot = f.rot + ((o.rot || 0) - f.rot) * e;
    if (o.s != null) c.s = f.s + (o.s - f.s) * e;
    if (o.sy != null) c.sy = f.sy + (o.sy - f.sy) * e;
    if (o.a != null) c.a = f.a + (o.a - f.a) * e;
    return p < 1;
  });
}
/** 発動：カードが表になって光り、カード名の帯が入る */
function activate(S) {
  const c = S.self, col = S.I.kind === 'trap' ? TRAP : SPELL;
  c.flip = 0; const t0 = S.t;
  hook(S, t => { const p = Math.min(1, (t - t0) / 180); c.flip = Math.abs(Math.cos((1 - p) * 1.57)); return p < 1; });
  S.title = { text: S.I.name, col: S.I.key === 'mirror' ? '#bfe6ff' : col, t: S.t };
  S.shake = 6; S.rings.push({ x: c.x, y: c.y, r: 20, v: 7 * S.U, a: 1, c: col, lw: 4 });
  c.glow = 1; c.gc = col;
}
function newCard(S, img, x, y, o = {}) {
  const w = (o.w || 60) * S.U;
  const c = { img, x, y, w, h: w * 86 / 59, rot: 0, base: 0, s: 1, sy: 1, a: 1, flip: 1, glow: 0, gc: '#fff', ...o, w, h: w * 86 / 59 };
  S.cards.push(c); return c;
}
/** 破壊されるカードを順番に壊す（演出で壊していない残りは最後にまとめて） */
function finishRest(S, t, col, rb) { at(S, t, () => S.dest.forEach(c => { if (c.a > 0) { impact(S, c.x, c.y, .6, col); explode(S, c, col, rb); } })); }

/* ---------- カードごとの演出 ---------- */
const FX = {
  generic(S) { finishRest(S, 700, '#ff8a3c'); S.end = 1800; },

  /* ブラック・ホール：フィールドの中央に穴が開き、モンスターを全て吸い込んで爆ぜる */
  hole(S) {
    const B = S.B, cx = B.cx, cy = B.cy, U = S.U, OPEN = 350, PULL = 950;
    at(S, OPEN, () => { S.dark = .85; S.hole = { r: 0, x: cx, y: cy, t: S.t }; S.shake = 10; });
    // 穴に近いカードから順に、渦を巻きながら引きずり込む（向き：穴の左右で逆回り）
    const order = [...S.dest].sort((p, q) => Math.hypot(p.x - cx, p.y - cy) - Math.hypot(q.x - cx, q.y - cy));
    order.forEach((c, i) => { c.pull = { a0: Math.atan2(c.y - cy, c.x - cx), r0: Math.hypot(c.x - cx, c.y - cy), x0: c.x, y0: c.y, start: PULL + i * 110, dur: 950, spin: c.x < cx ? 1 : -1 }; });
    const last = PULL + (order.length - 1) * 110 + 950;
    hook(S, t => {
      if (!S.hole) return t < OPEN;
      const h = S.hole;
      if (!h.collapse) h.r = Math.min(58 * U, (t - OPEN) / 12 * U);
      S.shake = Math.max(S.shake, 3 + h.r / 9);
      // 周りの光が渦を巻いて吸い込まれる
      for (let i = 0; i < 14; i++) { const ang = Math.random() * TAU, d = (170 + Math.random() * 150) * U; P(S, { x: 0, y: 0, orbit: { cx, cy, a: ang, d, sp: .07 + Math.random() * .07 }, life: 60, sz: 2.4 * U, c: Math.random() < .5 ? '#c27bff' : '#ffb05a' }); }
      if (Math.random() < .4) S.arcs = (S.arcs || []).concat([{ a: Math.random() * TAU, t }]);
      for (const c of order) {
        const p = c.pull; if (c.a <= 0) continue;
        if (t < p.start) {
          // 引っ張られて震え、少しずつ穴の方へ傾く
          const k = Math.max(0, Math.min(1, (t - OPEN - 150) / (p.start - OPEN - 150)));
          c.x = p.x0 + (cx - p.x0) * .12 * k + (Math.random() - .5) * 3 * k; c.y = p.y0 + (cy - p.y0) * .12 * k + (Math.random() - .5) * 3 * k;
          c.rot = Math.sin(t / 30) * .06 * k + (p.a0 + Math.PI / 2) * 0; c.sy = 1 + .15 * k;
          // カードのふちが剥がれて、穴へ流れていく
          if (k > .3 && Math.random() < .6) P(S, { x: c.x + (Math.random() - .5) * c.w, y: c.y + (Math.random() - .5) * c.h, vx: (cx - c.x) * .03, vy: (cy - c.y) * .03, life: 34, sz: 2 * U, c: Math.random() < .5 ? '#ffb05a' : '#ffffff', drag: 1 });
          continue;
        }
        // 渦を巻いて落ちていく：近づくほど速く回り、穴へ向かって細長く引き伸ばされ、暗くなる
        const q = Math.min(1, (t - p.start) / p.dur), r = p.r0 * (1 - q * q * (1.6 - .6 * q)), ang = p.a0 + p.spin * (q * 2.2 + q * q * 5);
        c.x = cx + Math.cos(ang) * r; c.y = cy + Math.sin(ang) * r * .72;
        c.rot = ang - Math.PI / 2; c.s = Math.max(.02, 1 - .92 * q); c.sy = 1 + 3.2 * q * q; c.a = q < .85 ? 1 : Math.max(0, 1 - (q - .85) / .15); c.burn = q;
        for (let k2 = 0; k2 < 3; k2++) P(S, { x: c.x + (Math.random() - .5) * 10 * U, y: c.y + (Math.random() - .5) * 10 * U, vx: (cx - c.x) * .05, vy: (cy - c.y) * .05, life: 22, sz: 2.2 * U, c: Math.random() < .5 ? '#c27bff' : '#ff6bd6', drag: 1 });
        if (q >= 1) { c.a = 0; S.shake = Math.max(S.shake, 9); S.rings.push({ x: cx, y: cy, r: h.r * .8, v: 3 * U, a: .9, c: '#c27bff', lw: 3 }); }
      }
      return t < last + 900;
    });
    // 全部呑み込むと、穴が縮んでから弾ける
    at(S, last + 120, () => { S.hole.collapse = S.t; });
    hook(S, t => { if (!S.hole || !S.hole.collapse) return t < last + 900; S.hole.r = Math.max(4 * U, S.hole.r * .86); return t < last + 380; });
    at(S, last + 400, () => {
      const r = S.hole.r; S.hole = null; S.arcs = [];
      impact(S, cx, cy, 1, '#c27bff');
      burst(S, cx, cy, 170, ['#c27bff', '#ffb05a', '#ffffff', '#ff6bd6'], 16, 60, 3.4); burst(S, cx, cy, 40, ['#ffffff'], 20, 26, 2, 'streak');
      for (let i = 0; i < 3; i++) S.rings.push({ x: cx, y: cy, r: r + i * 12, v: (16 - i * 4) * U, a: 1, c: i ? '#c27bff' : '#ffffff', lw: 5 });
    });
    S.end = last + 1300;
  },

  /* ライトニング・ボルテックス：嵐の中、相手のモンスターに次々と雷が落ちる */
  vortex(S) {
    at(S, 250, () => { S.dark = .8; S.storm = 1; });
    // 黄色の雷が、相手のモンスター全部に一気に落ちる
    at(S, 750, () => {
      S.dest.forEach(c => { S.bolts.push({ x: c.x, y: c.y, t: S.t, gold: 1 }); impact(S, c.x, c.y, .9, '#ffe08a'); explode(S, c, '#ffe08a'); });
      S.flash = 1; S.flashC = '255,236,150'; S.freeze = 140;
    });
    const tEnd = 750;
    at(S, tEnd + 200, () => { S.bolts.push(...S.dest.map(c => ({ x: c.x, y: c.y, t: S.t, after: 1, gold: 1 }))); });
    at(S, tEnd + 600, () => { S.storm = 0; });
    S.end = tEnd + 1300;
  },

  /* 激流葬：激流が画面を横切り、モンスターを全て押し流して砕く */
  torrent(S) {
    // 発動した人の側から相手の側へ、炎のようにとがった激しい波が駆け上がる（相手が発動した時は上から下へ）
    const B = S.B, U = S.U, up = S.I.me, START = 380, CROSS = 1150;
    const y0 = up ? B.bottom + 70 * U : B.top - 70 * U, y1 = up ? B.top - 160 * U : B.bottom + 160 * U;
    at(S, 250, () => { S.dark = .65; S.shake = 6; });
    at(S, START, () => { S.surge = { t0: S.t, up, y0, y1, front: y0, fade: null }; });
    hook(S, t => {
      const w = S.surge; if (!w) return t < START;
      const p = Math.min(1, (t - w.t0) / CROSS);
      w.front = y0 + (y1 - y0) * (p * (1.15 - .15 * p));
      S.shake = Math.max(S.shake, p < 1 ? 9 * U : 0);
      // 波の先から、しぶきが前へ跳ねる
      if (p < 1) for (let i = 0; i < 30; i++) { const x = B.left - 20 + Math.random() * (B.right - B.left + 40); P(S, { x, y: w.front, vx: (Math.random() - .5) * 4, vy: (up ? -1 : 1) * (5 + Math.random() * 8), life: 26, sz: (2 + Math.random() * 2.4) * U, c: ['#bff3ff', '#ffffff', '#4fb6ff', '#2a6fd6'][i % 4], drag: .95, grav: (up ? 1 : -1) * .25 }); }
      // 波の先が届いたカードから、呑まれて砕ける
      S.dest.forEach(c => { if (c.a > 0 && !c.hit && (up ? c.y > w.front - 12 * U : c.y < w.front + 12 * U)) { c.hit = 1; impact(S, c.x, c.y, .6, '#4fb6ff'); explode(S, c, '#7fd6ff'); } });
      if (p >= 1 && w.fade === null) w.fade = t;
      if (w.fade !== null && t - w.fade > 600) { S.surge = null; return false; }
      return true;
    });
    S.end = START + CROSS + 1100;
  },

  /* 聖なるバリア －ミラーフォース－：虹色の波が広がってドームになり、攻撃を受け止めて跳ね返す */
  mirror(S) {
    const B = S.B, A = S.att, U = S.U;
    // ドームの土台は発動した人の魔法・罠の列、高さはモンスターの列を覆うくらい
    const base = B.myStY, R = Math.min((B.right - B.left) * .48, 260 * U);
    S.dome = { cx: B.cx, cy: base, R, Ry: Math.max(Math.abs(base - B.myMonY) * 1.9, 90 * U), up: S.dir < 0, v: 0, ripples: [], dent: 0 };
    const D = S.dome;
    const uOf = x => Math.max(.18, Math.min(.82, Math.acos(Math.max(-1, Math.min(1, D.up ? (D.cx - x) / D.R : (x - D.cx) / D.R))) / Math.PI));
    D.hitU = A ? uOf(A.x) : .5;
    const HIT = 1350, PUSH = 1850;
    if (A) move(S, A, { x: A.x, y: A.y - S.dir * 30 * U }, 300, { s: 1.12 });
    at(S, 300, () => { S.dark = .65; D.t0 = S.t; S.shake = 8; });
    // 攻撃：力を溜めてから、太い光線がバリアにぶつかり続ける
    at(S, 1000, () => { S.charge = { t: S.t }; });
    at(S, 1200, () => { S.beam = { t: S.t }; S.charge = null; });
    at(S, HIT, () => { const hp = domePt(D, D.hitU); D.hit = { x: hp.x, y: hp.y, t: S.t }; impact(S, hp.x, hp.y, .6, '#bfe6ff'); S.flashC = '230,245,255'; });
    hook(S, t => {
      if (!D.hit || t > PUSH) return !D.hit || t <= PUSH;
      // ぶつかっている間：バリアがへこみ、火花が表面を走り、波紋が広がる
      D.dent = Math.min(1, (t - HIT) / 300); S.shake = Math.max(S.shake, 10 * U);
      for (let i = 0; i < 8; i++) { const a2 = Math.random() * TAU, sp = (4 + Math.random() * 7) * U; P(S, { x: D.hit.x, y: D.hit.y, vx: Math.cos(a2) * sp, vy: Math.sin(a2) * sp * .6, life: 22, sz: 2.4 * U, c: Math.random() < .5 ? '#ffffff' : '#ffb05a', drag: .9, k: 'streak' }); }
      if (Math.random() < .25) D.ripples.push({ t });
      return true;
    });
    // 跳ね返す：バリアが白く激しく輝き、光線を攻撃表示のモンスターへはね返す
    at(S, PUSH, () => {
      S.beam = null; D.dent = 0; D.pulse = S.t; S.refl = { t: S.t };
      impact(S, D.hit.x, D.hit.y, 1, '#ffffff'); S.flashC = '235,248,255'; S.flash = 1;
      for (let i = 0; i < 4; i++) D.ripples.push({ t: S.t + i * 60 });
      burst(S, D.hit.x, D.hit.y, 80, ['#ffffff', '#d6f0ff', '#9fd4ff'], 12, 40, 3, 'streak');
    });
    S.dest.forEach((c, i) => at(S, PUSH + 160 + i * 120, () => { impact(S, c.x, c.y, .95, '#d6f0ff'); explode(S, c, '#d6f0ff'); }));
    const tEnd = PUSH + 160 + S.dest.length * 120;
    at(S, tEnd + 350, () => { S.refl = null; D.fade = S.t; });
    S.end = tEnd + 1250;
  },

  /* 大嵐：竜巻が横切り、魔法・罠を巻き上げて砕く */
  storm(S) {
    const B = S.B;
    at(S, 300, () => { S.dark = .75; S.tornado = { x: B.left - 60 * S.U }; S.rain = 1; });
    hook(S, t => {
      if (!S.tornado) return t < 300;
      S.tornado.x += (B.right - B.left) / 70; S.shake = Math.max(S.shake, 6);
      for (let i = 0; i < 18; i++) { const a = Math.random() * TAU, h = Math.random(); P(S, { x: S.tornado.x + Math.cos(a) * (10 + h * 70) * S.U, y: B.top + h * (B.bottom - B.top), vx: Math.sin(a) * 6, vy: -3, life: 18, sz: 2 * S.U, c: Math.random() < .6 ? '#d8eaff' : '#9fb8d8', drag: .95, k: 'streak' }); }
      if (Math.random() < .12) S.bolts.push({ x: S.tornado.x + (Math.random() - .5) * 60, y: B.cy + (Math.random() - .5) * 150, t });
      S.dest.forEach(c => { if (!c.gone && Math.abs(c.x - S.tornado.x) < 36 * S.U) { c.gone = 1; move(S, c, { x: c.x + 40, y: c.y - 120 * S.U }, 300, { rot: 6, s: 1.3 }); at(S, S.t + 300, () => { impact(S, c.x, c.y, .5, '#9fb8d8'); explode(S, c, '#d8eaff'); }); } });
      if (S.tornado.x > B.right + 80 * S.U) { S.tornado = null; S.rain = 0; return false; }
      return true;
    });
    finishRest(S, 2600, '#d8eaff');
    S.end = 3200;
  },

  /* サイクロン：自分のカードを中心に竜巻が巻き起こり、その頂点から雷が一瞬で落ちて対象を撃ち砕く */
  cyclone(S) {
    const me = S.self, U = S.U, STRIKE = 1500;
    S.twister = { t0: 300, top: { x: me.x, y: Math.max(30, me.y - 170 * U) } };
    const top = S.twister.top;
    at(S, 250, () => { S.dark = .65; });
    hook(S, t => {
      const e = t - 300; if (e < 0) return true;
      const grow = Math.min(1, e / 450), hgt = me.y - top.y;
      if (t < STRIKE + 300) for (let q = 0; q < 14; q++) { const h = Math.random(), a = Math.random() * TAU, rad = (12 + h * 70) * U * grow; P(S, { x: me.x + Math.cos(a) * rad, y: me.y + 40 * U - h * (hgt + 40 * U) * grow + Math.sin(a) * rad * .25, vx: -Math.sin(a) * 5, vy: -1.5 - Math.random() * 2.5, life: 18, sz: (1.6 + h * 2.2) * U, c: Math.random() < .6 ? '#9df5c8' : '#e9fff4', drag: .95, k: 'streak' }); }
      if (t < STRIKE) { me.rot += .04 + grow * .25; S.shake = Math.max(S.shake, 2 + 3 * grow); }
      else me.rot *= .88;
      // 雷の力が頂点に溜まる
      if (t > STRIKE - 450 && t < STRIKE && Math.random() < .5) S.zaps.push({ pts: zigzag(top.x + (Math.random() - .5) * 40 * U, top.y - 10, top.x + (Math.random() - .5) * 60 * U, top.y + 40 * U, 5, 20 * U), t, life: 80, w: 1.5 * U });
      return t < STRIKE + 900;
    });
    S.dest.forEach((c, i) => at(S, STRIKE + i * 140, () => {
      for (let k = 0; k < 3; k++) S.zaps.push({ pts: zigzag(top.x, top.y, c.x + (Math.random() - .5) * 6, c.y, 14, 46 * U), t: S.t + k * 40, life: 260, w: (k ? 2.2 : 4.5) * U });
      S.zaps.push({ pts: zigzag(c.x, -20, c.x, c.y, 10, 30 * U), t: S.t, life: 200, w: 3 * U });
      impact(S, c.x, c.y, 1, '#bfe9ff'); S.flashC = '200,235,255'; S.freeze = 110; S.shake = 30 * U;
      explode(S, c, '#bfe9ff');
    }));
    at(S, STRIKE + 300 + S.dest.length * 140, () => { S.twister.fade = S.t; });
    S.end = STRIKE + 1300 + S.dest.length * 140;
  },

  /* ハーピィの羽根帚：羽根の嵐と斬撃で、相手の魔法・罠を次々に断ち切る */
  harpie(S) {
    at(S, 350, () => { S.dark = .55; });
    S.dest.forEach((c, i) => at(S, 600 + i * 170, () => {
      for (let k = 0; k < 3; k++) S.slashes = (S.slashes || []).concat([{ x: c.x, y: c.y, ang: -.5 + k * .5, t: S.t + k * 40 }]);
      for (let f = 0; f < 24; f++) P(S, { x: c.x - 60 * S.U, y: c.y + (Math.random() - .5) * 60 * S.U, vx: 10 + Math.random() * 6, vy: (Math.random() - .5) * 3, life: 26, sz: 5 * S.U, c: Math.random() < .5 ? '#ff7ac0' : '#ffffff', k: 'feather', drag: .97 });
      at(S, S.t + 120, () => { impact(S, c.x, c.y, .6, '#ff7ac0'); explode(S, c, '#ff7ac0'); });
    }));
    S.end = 600 + S.dest.length * 170 + 1300;
  },

  /* ナイト・ショット：照準が絞られ、狙撃でセットされたカードを撃ち抜く */
  night(S) {
    const T = S.dest[0];
    if (!T) return FX.generic(S);
    at(S, 300, () => { S.scope = { c: T, t: S.t }; S.dark = .85; });
    at(S, 1250, () => { S.scope = null; S.shot = { t: S.t, from: { x: S.self.x, y: S.self.y }, to: T }; S.flash = .6; });
    at(S, 1360, () => { S.shot = null; impact(S, T.x, T.y, 1, '#ffd27a'); explode(S, T, '#ffd27a'); });
    S.end = 2500;
  },

  /* 神の宣告：天から金の雷が落ち、光の柱の中で砕く */
  judgment(S) {
    at(S, 300, () => { S.dark = .8; });
    S.dest.forEach((c, i) => at(S, 1000 + i * 200, () => { S.bolts.push({ x: c.x, y: c.y, t: S.t, gold: 1 }); impact(S, c.x, c.y, 1, '#ffe08a'); explode(S, c, '#ffe08a'); S.pillar = { x: c.x, t: S.t }; }));
    at(S, 1700 + S.dest.length * 200, () => { S.pillar = null; });
    S.end = 2600 + S.dest.length * 200;
  },

  /* 神の警告：警報が鳴り響き、赤い光線が召喚を撃ち抜く */
  warning(S) {
    at(S, 300, () => { S.alarm = { t: S.t }; S.dark = .6; });
    at(S, 1200, () => { S.alarm = null; S.beamDown = S.dest.map(c => ({ x: c.x, y: c.y, t: S.t })); });
    S.dest.forEach(c => at(S, 1350, () => { impact(S, c.x, c.y, 1, '#ff4a3d'); explode(S, c, '#ff6b6b'); }));
    at(S, 1700, () => { S.beamDown = null; });
    S.end = 2600;
  },

  /* 強欲な壺：壺が現れ、カードを2枚吐き出して割れる */
  greed(S) {
    const B = S.B, hand = S.I.hand || { x: B.cx, y: B.bottom }, n = Math.max(1, S.I.drawn || 2);
    at(S, 400, () => { S.pot = { x: B.cx, y: B.cy, t: S.t, c: '#7ee07a' }; });
    for (let i = 0; i < n; i++) at(S, 1000 + i * 250, () => {
      const c = newCard(S, backImg(), B.cx, B.cy - 10 * S.U);
      move(S, c, { x: hand.x - 30 * S.U + i * 60 * S.U, y: hand.y }, 600, { arc: 90 * S.U, rot: i ? .15 : -.15, a: .2 });
      burst(S, B.cx, B.cy - 20 * S.U, 16, ['#7ee07a', '#ffffff'], 4, 30, 2.5);
    });
    at(S, 1300 + n * 250, () => { if (S.pot) { burst(S, S.pot.x, S.pot.y, 50, ['#7ee07a', '#ffffff', '#2c3244'], 8, 40, 3); S.shake = 8; S.pot = null; } });
    S.end = 2300 + n * 250;
  },

  /* 強欲で謙虚な壺：橙の壺から、デッキの上のカードが立ちのぼる */
  humble(S) {
    const B = S.B;
    at(S, 400, () => { S.pot = { x: B.cx, y: B.cy, t: S.t, c: '#ffb070' }; });
    for (let i = 0; i < 3; i++) at(S, 950 + i * 150, () => { const c = newCard(S, backImg(), B.cx, B.cy, { s: .6 }); move(S, c, { x: B.cx + (i - 1) * 70 * S.U, y: B.cy - 80 * S.U }, 500, { s: 1, a: .9 }); });
    at(S, 1900, () => { S.pot = null; S.cards.forEach(c => { if (c !== S.self && !S.dest.includes(c)) move(S, c, S.I.deck || { x: B.right, y: B.cy }, 500, { a: 0, s: .5 }); }); });
    S.end = 2600;
  },

  /* 増援：デッキから金色の光が差し、戦士を呼ぶ */
  reinforce(S) {
    const dk = S.I.deck || { x: S.B.right, y: S.B.cy };
    at(S, 400, () => { S.dark = .4; S.rays = { x: dk.x, y: dk.y, t: S.t, c: '#ffd27a' }; });
    at(S, 1000, () => burst(S, dk.x, dk.y, 60, ['#ffd27a', '#ffffff'], 7, 40, 3));
    at(S, 1600, () => { S.rays = null; });
    S.end = 2200;
  },

  /* 封印の黄金櫃：黄金の櫃が開き、カードを納めて封をする */
  sarco(S) {
    const B = S.B, dk = S.I.deck || { x: B.right, y: B.cy };
    at(S, 400, () => { S.chest = { x: B.cx, y: B.cy, t: S.t }; S.dark = .45; });
    at(S, 900, () => { const c = newCard(S, backImg(), dk.x, dk.y, { s: .8 }); move(S, c, { x: B.cx, y: B.cy - 15 * S.U }, 600, { arc: 60 * S.U, s: .7 }); at(S, S.t + 700, () => { move(S, c, { x: B.cx, y: B.cy + 5 * S.U }, 300, { s: .4, a: 0 }); S.chest.close = S.t; }); });
    at(S, 2100, () => { S.chest.lock = S.t; S.rings.push({ x: B.cx, y: B.cy + 5 * S.U, r: 20, v: 5 * S.U, a: 1, c: '#ffd75a', lw: 4 }); burst(S, B.cx, B.cy, 40, ['#ffd75a', '#ffffff'], 6, 40, 2.6); });
    S.end = 3300;
  },

  /* 死者蘇生：墓地に光が宿り、光の柱が降りる */
  revive(S) {
    const B = S.B, gy = S.I.gy || { x: B.right, y: B.myMonY };
    const L = S.I.land || { x: B.cx, y: B.myMonY };
    // 降りるマスの上空に、生命の印（アンク）がゆっくり回りながら浮かぶ。墓地から光が流れ込み、満ちると光の柱になって降りる
    const ay = Math.max(70 * S.U, L.y - 130 * S.U);
    at(S, 300, () => { S.dark = .6; S.sigil = { x: L.x, y: ay, t: S.t }; S.ankh = { x: gy.x, y: gy.y }; });
    hook(S, t => {
      if (!S.sigil) return t < 300;
      const sg = S.sigil, e = t - sg.t;
      // 印のまわりを光の粒が回る
      if (Math.random() < .7) { const a = Math.random() * TAU, d = (70 + Math.random() * 40) * S.U; P(S, { x: sg.x + Math.cos(a) * d, y: sg.y + Math.sin(a) * d * .5, vx: -Math.sin(a) * 1.4, vy: Math.cos(a) * .7 - .3, life: 40, sz: 2 * S.U, c: Math.random() < .5 ? '#9fe6ff' : '#fff2b0', drag: .99 }); }
      // 墓地から印へ、光の帯が流れ込む
      if (e > 500 && e < 1400) for (let i = 0; i < 3; i++) P(S, { x: gy.x + (Math.random() - .5) * 20 * S.U, y: gy.y + (Math.random() - .5) * 26 * S.U, vx: (sg.x - gy.x) * .03, vy: (sg.y - gy.y) * .03 - 1, life: 34, sz: 3 * S.U, c: '#fff2b0', k: 'feather', drag: .995 });
      return !!S.sigil;
    });
    at(S, 1550, () => { S.sigil.flare = S.t; S.flash = .6; S.shake = 6; S.rings.push({ x: L.x, y: ay, r: 20, v: 9 * S.U, a: 1, c: '#fff2b0', lw: 4 }); S.pillar = { x: L.x, t: S.t, c: '#fff2b0' }; burst(S, L.x, ay, 50, ['#fff2b0', '#9fe6ff', '#ffffff'], 6, 40, 2.8); });
    at(S, 2300, () => { S.sigil = null; S.ankh = null; });
    at(S, 2500, () => { S.pillar = null; });
    S.end = 2800;
  },

  /* 早すぎた埋葬：大地がひび割れ、土を跳ね上げる */
  burial(S) {
    const B = S.B;
    const L = S.I.land || { x: B.cx, y: B.myMonY };
    at(S, 400, () => { S.dark = .45; S.crack = { x: L.x, y: L.y + 20 * S.U, t: S.t }; });
    at(S, 1000, () => { S.shake = 10; burst(S, L.x, L.y + 20 * S.U, 60, ['#8a6a4a', '#d8b48a', '#5a4030'], 6, 44, 3.2); });
    at(S, 1800, () => { S.crack = null; });
    S.end = 2200;
  },

  /* リビングデッドの呼び声：墓地から魂が舞い上がる */
  call(S) {
    const B = S.B, gy = S.I.gy || { x: B.right, y: B.myMonY };
    at(S, 400, () => { S.dark = .55; S.souls = { x: gy.x, y: gy.y }; });
    at(S, 1300, () => { for (let i = 0; i < 30; i++) P(S, { x: gy.x, y: gy.y, vx: ((S.I.land ? S.I.land.x : B.cx) - gy.x) * .025 + (Math.random() - .5) * 3, vy: -2 - Math.random() * 3, life: 50, sz: 3 * S.U, c: '#8dffb8' }); });
    at(S, 1800, () => { S.souls = null; });
    S.end = 2200;
  },

  /* 超融合：チェーンを封じ、七色の渦がモンスターを呑み込む */
  superfusion(S) {
    const B = S.B;
    at(S, 300, () => { S.lock = { t: S.t }; S.dark = .6; });
    at(S, 700, () => { S.swirl = { x: B.cx, y: B.cy }; });
    at(S, 1800, () => { S.flash = .9; S.shake = 14; burst(S, B.cx, B.cy, 90, ['#ff6b6b', '#ffd25a', '#7aff8a', '#6bd0ff', '#c08bff'], 8, 50, 3); S.swirl = null; S.lock = null; });
    S.end = 2400;
  },

  /* 未来融合－フューチャー・フュージョン：時計の針が回り、素材が墓地へ */
  future(S) {
    const B = S.B;
    at(S, 400, () => { S.clock = { x: B.cx, y: B.cy }; S.dark = .5; });
    at(S, 2300, () => { S.clock = null; });
    S.end = 2700;
  },

  /* 洗脳－ブレインコントロール：念波が相手のモンスターを包む */
  brain(S) {
    const T = S.I.target;
    if (!T || !T.rect) return FX.generic(S);
    const tp = { x: T.rect.left + T.rect.width / 2, y: T.rect.top + T.rect.height / 2 };
    at(S, 450, () => { S.waves = { from: S.self, to: tp, t: S.t }; S.dark = .5; });
    at(S, 1400, () => { S.waves = null; S.tints.push({ r: T.rect, c: '#c08bff', t: S.t }); S.rings.push({ x: tp.x, y: tp.y, r: 16, v: 5 * S.U, a: 1, c: '#c08bff', lw: 4 }); burst(S, tp.x, tp.y, 50, ['#c08bff', '#ffffff'], 6, 40, 3); });
    S.end = 2400;
  },

  /* 光の護封剣：光の剣が相手のモンスターに降り注ぐ */
  swords(S) {
    const opp = (S.I.opp || []).filter(c => c.rect);
    at(S, 400, () => { S.dark = .45; });
    let n = 0;
    for (let k = 0; k < 3; k++) opp.forEach(c => {
      const r = c.rect, x = r.left + r.width / 2 + (k - 1) * r.width * .32, y = r.top + r.height / 2;
      at(S, 600 + n++ * 90, () => { S.swd = (S.swd || []).concat([{ x, y, t: S.t }]); S.shake = 5; });
    });
    at(S, 700 + n * 90, () => { S.counter = { x: S.self.x + S.self.w * .55, y: S.self.y - S.self.h * .5, t: S.t }; });
    S.end = 1900 + n * 90;
  },

  /* 王宮のお触れ：お触れ書きが広がり、罠に封印の鎖 */
  decree(S) {
    at(S, 400, () => { S.dark = .45; S.scroll = { t: S.t }; });
    at(S, 1500, () => { S.seal = { t: S.t }; S.shake = 8; });
    at(S, 1800, () => (S.I.traps || []).forEach(c => c.rect && S.tints.push({ r: c.rect, c: '#808080', t: S.t, chain: 1 })));
    S.end = 3000;
  },

  /* スキルドレイン：モンスターの力が吸い取られる */
  drain(S) {
    at(S, 400, () => { S.dark = .55; });
    at(S, 600, () => { S.drain = { t: S.t, to: S.self }; });
    at(S, 2000, () => { S.drain = null; (S.I.mons || []).forEach(c => c.rect && S.tints.push({ r: c.rect, c: '#606878', t: S.t })); S.rings.push({ x: S.self.x, y: S.self.y, r: 16, v: 6 * S.U, a: 1, c: '#b45cff', lw: 4 }); });
    S.end = 2900;
  },
};
/** ジグザグの稲妻の点 */
function zigzag(x0, y0, x1, y1, seg, jit) { const pts = [[x0, y0]]; for (let i = 1; i < seg; i++) { const u = i / seg; pts.push([x0 + (x1 - x0) * u + (Math.random() - .5) * jit, y0 + (y1 - y0) * u + (Math.random() - .5) * jit * .4]); } pts.push([x1, y1]); return pts; }
/** ドームの縁の点（u：0〜1） */
function domePt(D, u) { const a = D.up ? Math.PI + u * Math.PI : u * Math.PI; return { x: D.cx + Math.cos(a) * D.R, y: D.cy + Math.sin(a) * D.Ry }; }
function domeArc(D, r, ry) { ctx.beginPath(); ctx.ellipse(D.cx, D.cy, r, ry, 0, D.up ? Math.PI : 0, D.up ? TAU : Math.PI); }

/* ---------- 1コマ進める ---------- */
function tick(S, now) {
  const dt = Math.min(32, now - (S.last || now)) * S.speed; S.last = now;
  if (S.freeze > 0) { S.freeze -= dt; draw(S); return; }
  S.t += dt; const t = S.t;
  // 処理の中で予約し直した分も失わないように、先に取り出してから実行する
  const due = S.ev.filter(e => t >= e[0]); S.ev = S.ev.filter(e => t < e[0]); due.forEach(e => e[1]());
  const hs = S.hooks; S.hooks = []; const keep = hs.filter(f => f(t)); S.hooks = keep.concat(S.hooks);
  const D = S.dome;
  if (D && D.t0 != null) {
    D.v = D.fade ? Math.max(0, 1 - (t - D.fade) / 700) : Math.min(1, (t - D.t0) / 800);
    if (t - D.t0 < 900) for (let i = 0; i < 6; i++) { const u = Math.random(), pt = domePt(D, u), k = Math.min(1, (t - D.t0) / 800); P(S, { x: D.cx + (pt.x - D.cx) * k, y: D.cy + (pt.y - D.cy) * k, vx: (pt.x - D.cx) * .01, vy: S.dir * (1 + Math.random()), life: 30, sz: 2.4 * S.U, c: Math.random() < .5 ? '#ffffff' : '#bfe6ff' }); }
    if (S.beam && S.att) { const hp = domePt(D, D.hitU), A = S.att; for (let j = 0; j < 10; j++) { const u = Math.random(); P(S, { x: A.x + (hp.x - A.x) * u, y: A.y + (hp.y - A.y) * u, vx: (Math.random() - .5) * 2, vy: (Math.random() - .5) * 2, life: 14, sz: 3 * S.U, c: '#ffb05a' }); } }
    if (S.refl && D.hit) S.dest.forEach(c => { if (c.a <= 0) return; for (let j = 0; j < 4; j++) { const u = Math.random(); P(S, { x: D.hit.x + (c.x - D.hit.x) * u, y: D.hit.y + (c.y - D.hit.y) * u, vx: (Math.random() - .5) * 2, vy: (Math.random() - .5) * 2, life: 12, sz: 2.6 * S.U, c: Math.random() < .5 ? '#ffffff' : '#bfe6ff' }); } });
  }
  if (S.drain) (S.I.mons || []).forEach(m => { if (!m.rect || Math.random() > .5) return; const x = m.rect.left + m.rect.width / 2 + (Math.random() - .5) * 40, y = m.rect.top + m.rect.height / 2 + (Math.random() - .5) * 50; P(S, { x, y, vx: (S.self.x - x) * .03, vy: (S.self.y - y) * .03, life: 40, sz: 2.6 * S.U, c: '#b45cff', drag: 1 }); });
  S.parts.forEach(p => {
    if (p.orbit) { const o = p.orbit; o.a += o.sp; o.d *= .93; p.x = o.cx + Math.cos(o.a) * o.d; p.y = o.cy + Math.sin(o.a) * o.d * .6; }
    else { p.x += p.vx; p.y += p.vy; p.vx *= p.drag; p.vy = p.vy * p.drag + p.grav; }
    if (p.k === 'smoke') p.sz *= 1.02; p.life--;
  });
  S.parts = S.parts.filter(p => p.life > 0);
  S.shards.forEach(s => { s.x += s.vx; s.y += s.vy; s.vy += .3; s.rot += s.vr; s.a -= .016; }); S.shards = S.shards.filter(s => s.a > 0);
  S.rings.forEach(r => { r.r += r.v; r.v *= .96; r.a *= .94; }); S.rings = S.rings.filter(r => r.a > .03);
  S.shake *= .85; S.flash *= .82; S.invert *= .5; S.chroma *= .88;
  if (t > S.end - 500) S.dark *= .9;
  draw(S);
}

/* ---------- 描く ---------- */
function glow(x, y, r, c, a) { ctx.globalAlpha = Math.max(0, Math.min(1, a)); ctx.drawImage(spr(c), x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1; }
function glowH(x, y, r, h, a) { ctx.globalAlpha = Math.max(0, Math.min(1, a)); ctx.drawImage(hspr(h), x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1; }
function bolt(x0, y0, x1, y1, c, w, al, fork) {
  const pts = [[x0, y0]], n = 10;
  for (let i = 1; i < n; i++) { const u = i / n; pts.push([x0 + (x1 - x0) * u + (Math.random() - .5) * 34, y0 + (y1 - y0) * u + (Math.random() - .5) * 12]); }
  pts.push([x1, y1]); ctx.lineCap = 'round';
  [[w * 4, .22], [w * 1.6, .6], [w * .6, 1]].forEach((l, i) => { ctx.strokeStyle = i === 2 ? '#fff' : c; ctx.globalAlpha = al * l[1]; ctx.lineWidth = l[0]; ctx.beginPath(); pts.forEach((p, j) => (j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); });
  if (fork) for (let f = 0; f < 3; f++) { const s = pts[2 + ((Math.random() * 6) | 0)]; ctx.lineWidth = 1.5; ctx.strokeStyle = c; ctx.globalAlpha = al * .8; ctx.beginPath(); ctx.moveTo(s[0], s[1]); let fx = s[0], fy = s[1]; for (let k = 0; k < 4; k++) { fx += (Math.random() - .5) * 40; fy += 12 + Math.random() * 12; ctx.lineTo(fx, fy); } ctx.stroke(); }
  ctx.globalAlpha = 1;
}
/** 死者蘇生の印：ゆっくり回るアンク（生命の印）と、文字の刻まれた二重の光の輪 */
function ankhPath(s) {
  ctx.beginPath(); ctx.ellipse(0, -34 * s, 13 * s, 17 * s, 0, 0, TAU);
  ctx.moveTo(0, -17 * s); ctx.lineTo(0, 46 * s); ctx.moveTo(-26 * s, -8 * s); ctx.lineTo(26 * s, -8 * s);
}
function drawSigil(S, sg, t, U) {
  const e = t - sg.t, fin = Math.min(1, e / 600), fl = sg.flare ? Math.max(0, 1 - (t - sg.flare) / 700) : 0;
  const out = sg.flare ? Math.max(0, 1 - Math.max(0, t - sg.flare - 300) / 450) : 1, al = fin * out, s = U * (.75 + .25 * ease(fin)) * (1 + .15 * fl);
  ctx.save(); ctx.translate(sg.x, sg.y + Math.sin(e / 400) * 4 * U);
  // 文字の刻まれた二重の輪（傾けて回す）
  ctx.save(); ctx.scale(1, .42);
  for (let k = 0; k < 2; k++) {
    const R = (78 + k * 18) * U, rot = (k ? -1 : 1) * e / (k ? 1500 : 1100);
    ctx.strokeStyle = hsl(195 + k * 25, 80, .55 * al); ctx.lineWidth = 2 * U; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
    for (let j = 0; j < 16; j++) { const a = rot + j / 16 * TAU; ctx.fillStyle = hsl(45 + k * 150, 90, .8 * al); ctx.fillRect(Math.cos(a) * R - 2 * U, Math.sin(a) * R - 2 * U, 4 * U, 4 * U); }
  }
  ctx.restore();
  glow(0, 0, (90 + 60 * fl) * U, '#9fe6ff', .35 * al); glow(0, -10 * U, (50 + 40 * fl) * U, '#fff2b0', .55 * al);
  // 回る印：横幅を cos で縮めて、ゆっくり回転しているように見せる
  const sx = Math.max(.12, Math.abs(Math.cos(e / 900)));
  ctx.scale(sx, 1);
  [[14, .22, '#9fe6ff'], [8, .45, '#fff2b0'], [3.2, 1, '#ffffff']].forEach(l => { ctx.strokeStyle = l[2]; ctx.globalAlpha = l[1] * al * (1 + fl); ctx.lineWidth = l[0] * U / Math.max(.35, sx) * .6 + l[0] * U * .4; ctx.lineCap = 'round'; ankhPath(s); ctx.stroke(); });
  ctx.globalAlpha = 1; ctx.restore();
}
function drawCard(c) {
  if (c.a <= 0 || !c.img) return;
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate((c.rot || 0) + (c.base || 0)); ctx.scale(c.s * c.flip, c.s * c.sy); ctx.globalAlpha = Math.max(0, Math.min(1, c.a));
  if (c.glow) { ctx.shadowColor = c.gc; ctx.shadowBlur = 22; }
  ctx.drawImage(c.img, -c.w / 2, -c.h / 2, c.w, c.h); ctx.restore();
}
const FONT = '"Zen Maru Gothic","M PLUS Rounded 1c","Hiragino Sans","Yu Gothic",sans-serif';
function draw(S) {
  const t = S.t, B = S.B, U = S.U;
  ctx.save(); ctx.clearRect(-50, -50, W + 100, H + 100);
  ctx.translate((Math.random() - .5) * S.shake, (Math.random() - .5) * S.shake);
  if (S.dark > .01) { ctx.fillStyle = `rgba(0,0,0,${S.dark * .65})`; ctx.fillRect(-50, -50, W + 100, H + 100); }
  if (S.storm || S.rain) { ctx.strokeStyle = 'rgba(180,200,230,.35)'; ctx.lineWidth = 1; for (let i = 0; i < 60; i++) { const rx = (i * 53 + t * .9) % (W + 40) - 20, ry = (i * 97 + t * 1.6) % H; ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 6, ry + 16); ctx.stroke(); } }
  if (S.crack) { const k = Math.min(1, (t - S.crack.t) / 300); ctx.strokeStyle = 'rgba(30,15,5,.85)'; ctx.lineWidth = 2.5; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; ctx.beginPath(); ctx.moveTo(S.crack.x, S.crack.y); ctx.lineTo(S.crack.x + Math.cos(a) * 70 * U * k, S.crack.y + Math.sin(a) * 22 * U * k); ctx.stroke(); } }
  // 色を変えたカード（洗脳・スキルドレイン・お触れ）
  S.tints.forEach(g => {
    const k = Math.min(1, (t - g.t) / 300), r = g.r; ctx.fillStyle = hexA(g.c, .45 * k); rr(ctx, r.left, r.top, r.width, r.height, 5); ctx.fill();
    if (g.chain) { ctx.strokeStyle = `rgba(200,200,210,${k})`; ctx.lineWidth = 3; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(r.left, r.top); ctx.lineTo(r.left + r.width, r.top + r.height); ctx.moveTo(r.left + r.width, r.top); ctx.lineTo(r.left, r.top + r.height); ctx.stroke(); ctx.setLineDash([]); }
  });
  // ブラック・ホール：何も映さない黒い中心と、まわりの光のゆがみ
  if (S.hole && S.hole.r > 1) {
    const h = S.hole, g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, h.r * 1.6);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(.62, 'rgba(0,0,0,1)'); g.addColorStop(.8, 'rgba(40,0,60,.85)'); g.addColorStop(1, 'rgba(40,0,60,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(h.x, h.y, h.r * 1.6, 0, TAU); ctx.fill();
  }
  S.cards.forEach(c => { drawCard(c); if (c.burn && c.a > 0) { ctx.save(); ctx.translate(c.x, c.y); ctx.rotate((c.rot || 0) + (c.base || 0)); ctx.scale(c.s, c.s * c.sy); ctx.globalAlpha = Math.min(.85, c.burn) * c.a; ctx.fillStyle = '#1a0628'; ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h); ctx.restore(); } });
  if (S.surge) {
    const w = S.surge, up = w.up, sgn = up ? -1 : 1, fa = w.fade !== null ? Math.max(0, 1 - (t - w.fade) / 600) : 1;
    const L0 = B.left, R0 = B.right, band = 240 * U, back = w.front - sgn * band;
    // 盤面の中だけに描く
    ctx.save(); rr(ctx, B.left, B.top, B.right - B.left, B.bottom - B.top, 16); ctx.clip();
    // 波の帯：先が濃く、後ろほど透ける
    const g = ctx.createLinearGradient(0, w.front, 0, back);
    g.addColorStop(0, 'rgba(11,37,71,.92)'); g.addColorStop(.45, 'rgba(16,70,120,.6)'); g.addColorStop(1, 'rgba(16,70,120,0)');
    ctx.globalAlpha = fa; ctx.fillStyle = g; ctx.fillRect(L0, Math.min(w.front, back), R0 - L0, band);
    // 炎の舌のような波頭：幅・高さ・傾きがばらばらで、先が揺らぐ。明るい層ほど前へ伸びる
    w.layers = w.layers || [[0, '#d8f8ff', .95, 58], [12, '#5cc8f0', .95, 48], [26, '#1f7fbf', 1, 38], [40, '#0d3466', 1, 28]].map(([off, col, al, tall], li) => {
      const sp = []; let x = L0 - 20;
      while (x < R0 + 20) { const ww = (10 + Math.random() * 18) * U; sp.push({ x, w: ww, h: tall * (.45 + Math.random() * .75), ph: Math.random() * TAU, lean: (Math.random() - .5) * 1.2 }); x += ww * (.55 + Math.random() * .35); }
      return { off, col, al, sp };
    });
    w.layers.forEach((ly, li) => {
      const fy = w.front - sgn * ly.off * U;
      ctx.beginPath(); ctx.moveTo(L0 - 30, fy - sgn * 20 * U);
      ly.sp.forEach(q => {
        const flick = .75 + .25 * Math.sin(t / 55 + q.ph), h = q.h * U * flick, lean = (q.lean + .35 * Math.sin(t / 80 + q.ph)) * q.w;
        ctx.lineTo(q.x, fy);
        ctx.quadraticCurveTo(q.x + q.w * .2, fy + sgn * h * .65, q.x + q.w * .5 + lean, fy + sgn * h);
        ctx.quadraticCurveTo(q.x + q.w * .78 + lean * .3, fy + sgn * h * .3, q.x + q.w, fy);
      });
      ctx.lineTo(R0 + 30, fy - sgn * 20 * U); ctx.lineTo(R0 + 30, fy - sgn * 40 * U); ctx.lineTo(L0 - 30, fy - sgn * 40 * U); ctx.closePath();
      ctx.globalAlpha = fa * ly.al; ctx.fillStyle = ly.col; ctx.fill();
      if (li === 0) { ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 1.6 * U; ctx.stroke(); }
    });
    // うねる筋（水の中の流れ）
    ctx.globalAlpha = fa * .4; ctx.strokeStyle = '#bff3ff'; ctx.lineWidth = 1.4 * U;
    for (let k = 0; k < 5; k++) { const yy = w.front - sgn * (55 + k * 36) * U; ctx.beginPath(); for (let x = L0; x <= R0; x += 10) ctx.lineTo(x, yy + Math.sin(x / 22 + t / 50 + k) * 5 * U); ctx.stroke(); }
    ctx.restore();
  }
  S.shards.forEach(s => {
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot); ctx.globalAlpha = Math.max(0, s.a);
    ctx.beginPath(); s.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
    ctx.save(); ctx.clip(); ctx.drawImage(s.c.img, -s.c.w / 2, -s.c.h / 2, s.c.w, s.c.h); ctx.restore();
    ctx.strokeStyle = s.hue != null ? hsl(s.hue, 70, .95) : hexA(s.col, .95); ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore();
  });
  S.parts.forEach(p => { if (p.k !== 'smoke') return; ctx.globalAlpha = Math.min(.8, p.life / p.max); ctx.drawImage(smoke(), p.x - p.sz, p.y - p.sz, p.sz * 2, p.sz * 2); });
  ctx.globalAlpha = 1;
  // 壺と黄金の櫃（光を足し合わせない普通の絵）
  if (S.pot) {
    const p = S.pot, k = Math.min(1, (t - p.t) / 350), z = U * 1.4; ctx.save(); ctx.translate(p.x, p.y + 30 * (1 - k)); ctx.scale(k * z, k * z);
    ctx.fillStyle = hexA(p.c, .92); ctx.strokeStyle = '#2c3244'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-18, -30); ctx.quadraticCurveTo(-34, -6, -30, 16); ctx.quadraticCurveTo(-24, 34, 0, 34); ctx.quadraticCurveTo(24, 34, 30, 16); ctx.quadraticCurveTo(34, -6, 18, -30); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2c3244'; ctx.fillRect(-22, -36, 44, 7);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(-12, -4, 4, 12, -.3, 0, TAU); ctx.fill();
    ctx.restore();
  }
  if (S.chest) {
    const ch = S.chest, o = ch.close ? Math.max(0, 1 - (t - ch.close) / 300) : Math.min(1, (t - ch.t) / 400), z = U * 1.3;
    ctx.save(); ctx.translate(ch.x, ch.y); ctx.scale(z, z); ctx.fillStyle = '#8a6a1a'; ctx.strokeStyle = '#ffd75a'; ctx.lineWidth = 2;
    rr(ctx, -36, 0, 72, 40, 4); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.translate(-36, 0); ctx.rotate(-1.2 * o); rr(ctx, 0, -16, 72, 16, 4); ctx.fill(); ctx.stroke(); ctx.restore();
    if (ch.lock) { ctx.fillStyle = '#ffd75a'; ctx.fillRect(-7, 10, 14, 12); ctx.strokeStyle = '#ffd75a'; ctx.beginPath(); ctx.arc(0, 10, 6, Math.PI, 0); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = `500 14px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('2回目のスタンバイに手札へ', 0, 62); ctx.textAlign = 'left'; }
    ctx.restore();
  }
  if (S.scroll) {
    const k2 = Math.min(1, (t - S.scroll.t) / 600), sw = 200 * U, sh = 130 * U, y0 = B.cy - sh / 2;
    ctx.fillStyle = '#f3e6c4'; ctx.strokeStyle = '#8a6a1a'; ctx.lineWidth = 2; ctx.fillRect(B.cx - sw / 2 * k2, y0, sw * k2, sh); ctx.strokeRect(B.cx - sw / 2 * k2, y0, sw * k2, sh);
    if (k2 > .9) { ctx.fillStyle = '#5a3a10'; ctx.textAlign = 'center'; ctx.font = `500 ${17 * U}px ${FONT}`; ctx.fillText('お触れ', B.cx, y0 + 34 * U); ctx.font = `${12 * U}px ${FONT}`; ctx.fillText('罠の効果を禁ずる', B.cx, y0 + 62 * U); ctx.textAlign = 'left'; }
    if (S.seal) { const k3 = Math.min(1, (t - S.seal.t) / 200); ctx.fillStyle = `rgba(196,38,46,${k3})`; ctx.beginPath(); ctx.arc(B.cx + 55 * U, y0 + sh - 28 * U, 20 * U * (2 - k3), 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = `500 ${14 * U}px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('令', B.cx + 55 * U, y0 + sh - 23 * U); ctx.textAlign = 'left'; }
  }
  if (S.counter) { const c = S.counter; ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(c.x, c.y, 13 * U, 0, TAU); ctx.fill(); ctx.fillStyle = '#1d1405'; ctx.font = `500 ${15 * U}px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('3', c.x, c.y + 5 * U); ctx.textAlign = 'left'; }

  ctx.globalCompositeOperation = 'lighter';
  if (S.hole) {
    const hr = S.hole.r, hx = S.hole.x, hy = S.hole.y;
    // まわりの紫のもや（中心は後で真っ黒に塗るので、外側だけが光って見える）
    glow(hx, hy, hr * 4.2, '#7a2bd6', .55);
    // 傾いた平たい光の円盤：流れる点線で、渦を巻いて流れ込んでいるように見せる
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(-.28);
    [[2.9, .62, '#ffb05a', 5], [2.3, .5, '#ff6bd6', 4], [1.75, .4, '#ffe9c8', 3]].forEach(([rx, ry, c, w], i) => {
      ctx.strokeStyle = c; ctx.globalAlpha = .75; ctx.lineWidth = w * U; ctx.setLineDash([14 * U, 9 * U]); ctx.lineDashOffset = -t / (6 + i * 3);
      ctx.beginPath(); ctx.ellipse(0, 0, hr * rx, hr * ry, 0, 0, TAU); ctx.stroke();
    });
    ctx.setLineDash([]); ctx.restore(); ctx.globalAlpha = 1;
    // 事象の地平線のふち：細い光の輪
    ctx.strokeStyle = 'rgba(255,240,220,.95)'; ctx.lineWidth = 2 * U; ctx.beginPath(); ctx.arc(hx, hy, hr * 1.03, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,176,90,.6)'; ctx.lineWidth = 6 * U; ctx.beginPath(); ctx.arc(hx, hy, hr * 1.2, 0, TAU); ctx.stroke();
    (S.arcs || []).forEach(q => { if (t - q.t < 90) bolt(hx + Math.cos(q.a) * hr * 1.1, hy + Math.sin(q.a) * hr * 1.1, hx + Math.cos(q.a) * hr * 2.6, hy + Math.sin(q.a) * hr * 1.4, '#c27bff', 2, 1 - (t - q.t) / 90); });
  }
  S.fire.forEach(f => { const el = t - f.t; if (el < 500) { if (f.rb) { glowH(f.x, f.y, (44 + el * .15) * U, el * .6, 1 - el / 500); glowH(f.x, f.y, 18 * U, 0, 1 - el / 500); } else { glow(f.x, f.y, (40 + el * .15) * U, '#ff8a3c', 1 - el / 500); glow(f.x, f.y, (18 + el * .05) * U, '#fff1c4', 1 - el / 500); } } });
  S.bolts.forEach(b => {
    const el = t - b.t, life = b.after ? 400 : 220;
    if (el >= life) return;
    if (b.after) { if (Math.random() < .5) bolt(b.x + (Math.random() - .5) * 40, b.y - 30, b.x + (Math.random() - .5) * 40, b.y + 30, b.gold ? '#ffe08a' : '#bfe4ff', 1.5, .8); }
    else { bolt(b.x + (Math.random() - .5) * 20, -20, b.x, b.y, b.gold ? '#ffe08a' : '#bfe4ff', (b.gold ? 9 : 6) * U, 1 - el / life, 1); glow(b.x, b.y, 90 * U, b.gold ? '#ffe08a' : '#bfe4ff', 1 - el / life); }
  });
  if (S.wave && false) {
    const wx = S.wave.x, gr = ctx.createLinearGradient(wx - 200 * U, 0, wx + 30, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.7, 'rgba(30,110,200,.55)'); gr.addColorStop(1, 'rgba(160,225,255,.9)'); ctx.fillStyle = gr;
    ctx.beginPath(); ctx.moveTo(wx - 200 * U, B.bottom); for (let y = B.bottom; y > B.top; y -= 10) ctx.lineTo(wx + Math.sin(y / 20 + t / 60) * 12, y); ctx.lineTo(wx - 200 * U, B.top); ctx.closePath(); ctx.fill();
  }
  // 薄い青のバリアのドーム（ミラーフォース）
  const D = S.dome;
  if (D && D.t0 != null) {
    const el = t - D.t0, d = D.v, pulse = D.pulse ? Math.max(0, 1 - (t - D.pulse) / 700) : 0, ry = r => r * D.Ry / D.R;
    // 張られる時：薄い青の輪が中心から広がってドームになる
    for (let w = 0; w < 4; w++) { const k = Math.min(1, Math.max(0, (el - w * 120) / 650)); if (k <= 0 || k >= 1 || D.fade) continue; const r2 = D.R * ease(k); ctx.lineWidth = (6 - w) * U; ctx.strokeStyle = `rgba(200,235,255,${.8 - w * .15})`; domeArc(D, r2, ry(r2)); ctx.stroke(); }
    if (d > 0) {
      ctx.save(); domeArc(D, D.R, D.Ry); ctx.closePath(); ctx.clip();
      // ドームの面：中心ほど透け、縁ほど白く光る薄い青
      const g = ctx.createRadialGradient(D.cx, D.cy, D.R * .1, D.cx, D.cy, D.R * 1.02);
      g.addColorStop(0, `rgba(150,210,255,${.06 * d})`); g.addColorStop(.75, `rgba(170,220,255,${(.16 + .3 * pulse) * d})`); g.addColorStop(1, `rgba(235,248,255,${(.55 + .4 * pulse) * d})`);
      ctx.fillStyle = g; ctx.fillRect(D.cx - D.R, D.cy - D.Ry - 10, D.R * 2, D.Ry * 2 + 20);
      // 六角形の模様（バリアの網目）がうっすら光る
      ctx.strokeStyle = `rgba(220,240,255,${(.18 + .35 * pulse) * d})`; ctx.lineWidth = 1 * U;
      const hs = 16 * U;
      for (let row = 0, yy = D.cy - D.Ry; yy < D.cy + D.Ry; row++, yy += hs * 1.5) for (let xx = D.cx - D.R + (row % 2) * hs * .87; xx < D.cx + D.R; xx += hs * 1.73) { ctx.beginPath(); for (let k = 0; k < 6; k++) { const ang = k / 6 * TAU + Math.PI / 6; ctx.lineTo(xx + Math.cos(ang) * hs, yy + Math.sin(ang) * hs); } ctx.closePath(); ctx.stroke(); }
      // 表面を走る白い光
      for (let s2 = 0; s2 < 2; s2++) { const sw = ((t / 1300) + s2 / 2) % 1; ctx.lineWidth = 4 * U; ctx.strokeStyle = `rgba(255,255,255,${.4 * (1 - sw) * d})`; domeArc(D, D.R * sw, ry(D.R * sw)); ctx.stroke(); }
      // ぶつかった所から広がる波紋
      if (D.hit) D.ripples.forEach(rp => { const e2 = t - rp.t; if (e2 < 0 || e2 > 700) return; const r3 = e2 * .5 * U; ctx.strokeStyle = `rgba(255,255,255,${1 - e2 / 700})`; ctx.lineWidth = 3 * U; ctx.beginPath(); ctx.ellipse(D.hit.x, D.hit.y, r3, r3 * .6, 0, 0, TAU); ctx.stroke(); });
      ctx.restore();
      // 白く光る縁
      ctx.lineCap = 'round';
      [[16, .18], [8, .45], [3.5, 1]].forEach(([lw, al]) => { ctx.strokeStyle = `rgba(${al === 1 ? '255,255,255' : '190,230,255'},${al * d * (1 + .6 * pulse)})`; ctx.lineWidth = lw * U * (1 + .5 * pulse); domeArc(D, D.R, D.Ry); ctx.stroke(); });
      glow(D.cx, D.cy + S.dir * D.Ry * .5, D.R * (1 + .3 * pulse), '#bfe6ff', (.22 + .6 * pulse) * d);
      // 跳ね返す瞬間：ドームから白い光の筋が放たれる
      if (pulse > 0) for (let k = 0; k < 14; k++) { const u = k / 13, p = domePt(D, u), dx = p.x - D.cx, dy = p.y - D.cy, L = Math.hypot(dx, dy) || 1, len = 70 * U * pulse; ctx.strokeStyle = `rgba(255,255,255,${.7 * pulse})`; ctx.lineWidth = 3 * U; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + dx / L * len, p.y + dy / L * len * .8); ctx.stroke(); }
    }
    // 攻撃：力を溜める光、ぶつかり続ける太い光線
    if (S.charge && S.att) { const k = Math.min(1, (t - S.charge.t) / 200); glow(S.att.x, S.att.y, 60 * U * k, '#ffb05a', .9); }
    if (S.beam && S.att) {
      const hp = domePt(D, D.hitU), A2 = S.att, k2 = Math.min(1, (t - S.beam.t) / 150), ex = A2.x + (hp.x - A2.x) * k2, ey = A2.y + (hp.y - A2.y) * k2, wob = 1 + .2 * Math.sin(t / 18);
      ctx.lineCap = 'round'; [[30, .25, '#ff6b3c'], [16, .6, '#ffb05a'], [6, 1, '#ffffff']].forEach(l => { ctx.strokeStyle = l[2]; ctx.globalAlpha = l[1]; ctx.lineWidth = l[0] * U * wob; ctx.beginPath(); ctx.moveTo(A2.x, A2.y); ctx.lineTo(ex, ey); ctx.stroke(); });
      ctx.globalAlpha = 1; glow(ex, ey, 70 * U * wob, '#ffb05a', 1); glow(ex, ey, 34 * U, '#ffffff', 1);
    }
    // ぶつかった所の白い光
    if (D.hit) { const he = t - D.hit.t; if (he < 1000) glow(D.hit.x, D.hit.y, (60 + 60 * D.dent) * U * (S.beam ? 1 : (1 - he / 1600)), '#ffffff', S.beam ? .9 : 1 - he / 1000); }
    // 跳ね返す光線：白と薄い青
    if (S.refl && D.hit) {
      const f2 = D.hit, k3 = Math.min(1, (t - S.refl.t) / 120);
      S.dest.forEach(c => { const ex2 = f2.x + (c.x - f2.x) * k3, ey2 = f2.y + (c.y - f2.y) * k3; ctx.lineCap = 'round'; [[30, .2, '#9fd4ff'], [16, .5, '#d6f0ff'], [6, 1, '#ffffff']].forEach(l => { ctx.strokeStyle = l[2]; ctx.globalAlpha = l[1]; ctx.lineWidth = l[0] * U * (1 + .15 * Math.sin(t / 20)); ctx.beginPath(); ctx.moveTo(f2.x, f2.y); ctx.lineTo(ex2, ey2); ctx.stroke(); }); ctx.globalAlpha = 1; });
      glow(f2.x, f2.y, 90 * U, '#ffffff', 1);
    }
  }
  // サイクロン：自分のカードの竜巻と、頂点に溜まる雷・落ちる稲妻
  if (S.twister) {
    const tw = S.twister, me = S.self, e = t - tw.t0;
    if (e > 0) {
      const grow = Math.min(1, e / 450), fa = tw.fade ? Math.max(0, 1 - (t - tw.fade) / 500) : 1, hgt = me.y - tw.top.y;
      if (fa > 0) {
        for (let l = 0; l < 11; l++) { const yy = me.y + 40 * U - l * (hgt + 40 * U) / 10 * grow, rw = (10 + l * 7) * U * grow; ctx.strokeStyle = hexA(l % 2 ? '#9df5c8' : '#e9fff4', (.25 + l * .05) * fa); ctx.lineWidth = 3 * U; ctx.beginPath(); ctx.ellipse(me.x + Math.sin(t / 55 + l) * 6 * U, yy, rw, rw * .28, 0, 0, TAU); ctx.stroke(); }
        glow(me.x, me.y, 70 * U, '#9df5c8', .45 * fa);
        if (e > 700) glow(tw.top.x, tw.top.y, (50 + 20 * Math.sin(t / 30)) * U, '#bfe9ff', .8 * fa);
      }
    }
  }
  S.zaps = S.zaps.filter(z => t - z.t < z.life);
  S.zaps.forEach(z => {
    const age = t - z.t; if (age < 0) return; const al = 1 - age / z.life;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    [[z.w * 5, .18, '#bfe9ff'], [z.w * 2, .55, '#bfe9ff'], [z.w * .8, 1, '#ffffff']].forEach(l => { ctx.strokeStyle = l[2]; ctx.globalAlpha = al * l[1]; ctx.lineWidth = l[0]; ctx.beginPath(); z.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); });
    ctx.globalAlpha = 1;
  });
  if (S.tornado) { const tx = S.tornado.x, hh = (B.bottom - B.top) / 10; for (let l = 0; l < 10; l++) { ctx.strokeStyle = `rgba(216,234,255,${.3 + l * .05})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(tx + Math.sin(t / 80 + l) * 8, B.top + l * hh + hh / 2, (16 + l * 9) * U, (6 + l * 2) * U, 0, 0, TAU); ctx.stroke(); } }
  if (S.slashes) S.slashes.forEach(s => { const el = t - s.t; if (el < 0 || el > 260) return; const p = Math.min(1, el / 90), fa = 1 - Math.max(0, (el - 100) / 160); ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.ang); [[14, .35, '#ff7ac0'], [4, 1, '#ffffff']].forEach(l => { ctx.strokeStyle = l[2]; ctx.globalAlpha = fa * l[1]; ctx.lineWidth = l[0] * U; ctx.beginPath(); ctx.moveTo(-50 * U, 0); ctx.lineTo((-50 + 100 * p) * U, 0); ctx.stroke(); }); ctx.restore(); ctx.globalAlpha = 1; });
  if (S.shot) { const k6 = Math.min(1, (t - S.shot.t) / 110), sx = S.shot.from.x + (S.shot.to.x - S.shot.from.x) * k6, sy = S.shot.from.y + (S.shot.to.y - S.shot.from.y) * k6; ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 4 * U; ctx.beginPath(); ctx.moveTo(S.shot.from.x, S.shot.from.y); ctx.lineTo(sx, sy); ctx.stroke(); glow(sx, sy, 26 * U, '#ffd27a', 1); glow(S.shot.from.x, S.shot.from.y, 50 * U, '#ffb05a', 1 - k6); }
  if (S.pillar) { const k7 = S.pillar.c ? Math.min(1, (t - S.pillar.t) / 300) : Math.max(0, 1 - (t - S.pillar.t) / 600), pw = 50 * U, gp = ctx.createLinearGradient(S.pillar.x - pw, 0, S.pillar.x + pw, 0); gp.addColorStop(0, 'rgba(0,0,0,0)'); gp.addColorStop(.5, hexA(S.pillar.c || '#ffe08a', .8 * k7)); gp.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gp; ctx.fillRect(S.pillar.x - pw, -10, pw * 2, H + 20); }
  if (S.beamDown) S.beamDown.forEach(b => { const k8 = Math.max(0, 1 - (t - b.t) / 500); ctx.fillStyle = hexA('#ff4a3d', .8 * k8); ctx.fillRect(b.x - 30 * U, -10, 60 * U, b.y + 10); ctx.fillStyle = `rgba(255,255,255,${k8})`; ctx.fillRect(b.x - 6 * U, -10, 12 * U, b.y + 10); });
  if (S.rays) { ctx.save(); ctx.translate(S.rays.x, S.rays.y); ctx.rotate(t / 700); for (let i = 0; i < 12; i++) { ctx.rotate(TAU / 12); ctx.globalAlpha = .25; ctx.fillStyle = S.rays.c; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(180 * U, -9 * U); ctx.lineTo(180 * U, 9 * U); ctx.closePath(); ctx.fill(); } ctx.restore(); ctx.globalAlpha = 1; glow(S.rays.x, S.rays.y, 60 * U, S.rays.c, .8); }
  if (S.ankh) glow(S.ankh.x, S.ankh.y, 60 * U, '#fff2b0', .9);
  if (S.sigil) drawSigil(S, S.sigil, t, U);
  if (S.souls) for (let i = 0; i < 6; i++) { const a = t / 300 + i * 1.05; glow(S.souls.x + Math.cos(a) * 30 * U, S.souls.y - 20 * U + Math.sin(a * 1.3) * 30 * U, 16 * U, '#8dffb8', .8); }
  if (S.swirl) for (let v = 0; v < 5; v++) { ctx.strokeStyle = ['#ff6b6b', '#ffd25a', '#7aff8a', '#6bd0ff', '#c08bff'][v]; ctx.globalAlpha = .6; ctx.lineWidth = 3 * U; ctx.beginPath(); for (let a = 0; a < TAU * 2; a += .15) { const r3 = (6 + a * 9 + v * 5) * U, xx = S.swirl.x + Math.cos(a - t / 100 + v) * r3, yy = S.swirl.y + Math.sin(a - t / 100 + v) * r3 * .6; if (a) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); } ctx.stroke(); ctx.globalAlpha = 1; }
  if (S.lock) glow(B.cx, B.cy, 90 * U, '#ffffff', .2);
  if (S.clock) {
    const ck = S.clock, R0 = 46 * U; ctx.strokeStyle = '#c9a7ff'; ctx.lineWidth = 3 * U; ctx.beginPath(); ctx.arc(ck.x, ck.y, R0, 0, TAU); ctx.stroke();
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; ctx.beginPath(); ctx.moveTo(ck.x + Math.cos(a) * R0 * .83, ck.y + Math.sin(a) * R0 * .83); ctx.lineTo(ck.x + Math.cos(a) * R0, ck.y + Math.sin(a) * R0); ctx.stroke(); }
    ctx.lineWidth = 4 * U; ctx.beginPath(); ctx.moveTo(ck.x, ck.y); ctx.lineTo(ck.x + Math.cos(t / 150) * R0 * .74, ck.y + Math.sin(t / 150) * R0 * .74); ctx.stroke();
    ctx.lineWidth = 5 * U; ctx.beginPath(); ctx.moveTo(ck.x, ck.y); ctx.lineTo(ck.x + Math.cos(t / 1200) * R0 * .48, ck.y + Math.sin(t / 1200) * R0 * .48); ctx.stroke();
    glow(ck.x, ck.y, 80 * U, '#c9a7ff', .4);
  }
  if (S.waves) for (let i = 0; i < 4; i++) { const k9 = ((S.t - S.waves.t) / 500 + i / 4) % 1, wx2 = S.waves.from.x + (S.waves.to.x - S.waves.from.x) * k9, wy2 = S.waves.from.y + (S.waves.to.y - S.waves.from.y) * k9; ctx.strokeStyle = `rgba(192,139,255,${1 - k9})`; ctx.lineWidth = 3 * U; ctx.beginPath(); ctx.ellipse(wx2, wy2, (12 + k9 * 20) * U, (6 + k9 * 8) * U, 0, 0, TAU); ctx.stroke(); }
  if (S.swd) S.swd.forEach(s => { const k10 = Math.min(1, (t - s.t) / 180), yy2 = -40 + (s.y + 40) * k10; ctx.fillStyle = 'rgba(255,246,200,.9)'; ctx.fillRect(s.x - 2 * U, yy2 - 40 * U, 4 * U, 48 * U); ctx.fillRect(s.x - 8 * U, yy2 + 4 * U, 16 * U, 3 * U); glow(s.x, yy2, 16 * U, '#fff6c8', .8); });
  if (S.drain) glow(S.self.x, S.self.y, 60 * U, '#b45cff', .6);
  S.rings.forEach(r => { ctx.strokeStyle = r.c; ctx.globalAlpha = r.a; ctx.lineWidth = (r.lw || 4) * r.a + 1; ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r, r.r * .55, 0, 0, TAU); ctx.stroke(); });
  ctx.globalAlpha = 1;
  S.parts.forEach(p => {
    if (p.k === 'smoke') return;
    const al = Math.min(1, p.life / p.max * 1.6); ctx.globalAlpha = al;
    if (p.k === 'streak') { ctx.strokeStyle = p.hue != null ? hsl(p.hue, 70, al) : p.c; ctx.lineWidth = p.sz; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 3, p.y - p.vy * 3); ctx.stroke(); }
    else if (p.k === 'feather') { ctx.fillStyle = p.c; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.sz * 1.5, p.sz * .4, Math.atan2(p.vy, p.vx), 0, TAU); ctx.fill(); }
    else if (p.hue != null) { ctx.globalAlpha = 1; glowH(p.x, p.y, p.sz * 2.6, p.hue, al); }
    else { const r = p.sz * 2.6; ctx.drawImage(spr(p.c), p.x - r, p.y - r, r * 2, r * 2); }
  });
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  if (S.hole && S.hole.r > 1) {
    const h = S.hole, g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, h.r);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(.85, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU); ctx.fill();
  }
  // 画面のひび
  S.cracks.forEach(c => {
    const fa = Math.max(0, 1 - (t - c.t) / 900); if (fa <= 0) return;
    ctx.strokeStyle = `rgba(255,255,255,${.85 * fa})`; ctx.lineWidth = 1.6; c.lines.forEach(pts => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); });
    ctx.strokeStyle = `rgba(0,0,0,${.5 * fa})`; ctx.lineWidth = .8; c.lines.forEach(pts => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0] + 1, p[1] + 1) : ctx.moveTo(p[0] + 1, p[1] + 1))); ctx.stroke(); });
  });
  ctx.restore();
  // 照準（ナイト・ショット）
  if (S.scope) { const c = S.scope.c, k9 = Math.min(1, (t - S.scope.t) / 500), R = Math.max(60 * U, (260 - 200 * k9) * U); ctx.fillStyle = 'rgba(0,0,0,.85)'; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(c.x, c.y, R, 0, TAU, true); ctx.fill(); ctx.strokeStyle = '#ff5a5a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, TAU); ctx.moveTo(c.x - R, c.y); ctx.lineTo(c.x + R, c.y); ctx.moveTo(c.x, c.y - R); ctx.lineTo(c.x, c.y + R); ctx.stroke(); ctx.beginPath(); ctx.arc(c.x, c.y, 8, 0, TAU); ctx.stroke(); }
  // 警報（神の警告）
  if (S.alarm) { const ph = (t - S.alarm.t) / 130, z = 1.3 * U; ctx.fillStyle = `rgba(255,40,30,${.18 + .14 * Math.sin(ph)})`; ctx.fillRect(0, 0, W, H); ctx.fillStyle = 'rgba(255,74,61,.95)'; ctx.beginPath(); ctx.moveTo(B.cx, B.cy - 40 * z); ctx.lineTo(B.cx + 38 * z, B.cy + 26 * z); ctx.lineTo(B.cx - 38 * z, B.cy + 26 * z); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = `500 ${34 * z}px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('!', B.cx, B.cy + 18 * z); ctx.textAlign = 'left'; }
  if (S.lock) { ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = `500 ${13 * U}px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('チェーン不可', B.cx, B.cy - 70 * U); ctx.textAlign = 'left'; }
  if (S.clock) { ctx.fillStyle = '#fff'; ctx.font = `500 ${13 * U}px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('2回目のスタンバイに融合召喚', S.clock.x, S.clock.y + 72 * U); ctx.textAlign = 'left'; }
  if (S.chroma > .03) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,30,30,${S.chroma * .25})`; ctx.fillRect(-8 * S.chroma, 0, W, H); ctx.fillStyle = `rgba(30,120,255,${S.chroma * .25})`; ctx.fillRect(8 * S.chroma, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
  if (S.invert > .05) { ctx.globalCompositeOperation = 'difference'; ctx.fillStyle = `rgba(255,255,255,${Math.min(1, S.invert)})`; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
  if (S.flash > .01) { ctx.fillStyle = `rgba(${S.flashC},${S.flash * .5})`; ctx.fillRect(0, 0, W, H); }
  // カード名の帯
  if (S.title) {
    const T = S.title, k = Math.min(1, (t - T.t) / 160), fo = Math.max(0, Math.min(1, (T.t + 1300 - t) / 250)), y = B.cy, bh = Math.max(34, 40 * U), fs = Math.min(26, Math.max(16, 21 * U));
    ctx.globalAlpha = k * fo; ctx.save(); ctx.translate((1 - k) * 40, 0); ctx.transform(1, 0, -.18, 1, 0, 0);
    ctx.fillStyle = 'rgba(10,10,14,.9)'; ctx.fillRect(-60, y - bh / 2, W + 200, bh);
    if (T.rb) { const g = ctx.createLinearGradient(0, 0, W, 0); for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, hsl(i * 60, 62, 1)); ctx.fillStyle = g; } else ctx.fillStyle = T.col;
    ctx.fillRect(-60, y - bh / 2, W + 200, 3); ctx.fillRect(-60, y + bh / 2 - 3, W + 200, 3);
    ctx.restore(); ctx.fillStyle = '#fff'; ctx.font = `500 ${fs}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(T.text, W / 2, y + 1); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = 1;
  }
}
