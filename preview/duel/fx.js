// 攻撃の演出（キャンバスに描く）。種族ごとの攻撃・命中・カードの壊れ方と、神（幻神獣族・創造神族）の特別な演出。
// playBattle() は演出が終わったら解決する Promise を返す。カードの位置は画面上の四角（getBoundingClientRect）で受け取る
import { partnerLine } from './lines.js?v=20261122-0240-e8afb3d7b2';
const TAU = Math.PI * 2;

/* ---------- 相棒のひと言：着地したカードのそばに、短い吹き出しを2.4秒ほど出す ---------- */
function partnerSay(root, info, partner) {
  const r = (info.track && info.track()) || info.rect; if (!r) return;
  root.querySelectorAll('.partner-say').forEach(x => x.remove()); // 前の吹き出しが残っていたら消す（続けて出た時に重ならないように）
  const b = document.createElement('div');
  b.className = 'partner-say';
  b.setAttribute('role', 'status');
  const vw = innerWidth, w = Math.min(240, vw - 24), cx = r.left + r.width / 2;
  const left = Math.max(12, Math.min(vw - w - 12, cx - w / 2)), above = r.top > 120;
  Object.assign(b.style, { position: 'fixed', left: left + 'px', width: w + 'px', zIndex: 60, pointerEvents: 'none', boxSizing: 'border-box',
    background: 'var(--panel, #fffdf8)', color: 'var(--ink, #262b3a)', border: '2px solid #ffb35c', borderRadius: '14px', padding: '6px 10px',
    boxShadow: '0 6px 18px rgba(0,0,0,.35)', font: '700 13px/1.45 var(--display, sans-serif)', textAlign: 'center' });
  if (above) b.style.bottom = (innerHeight - r.top + 8) + 'px'; else b.style.top = (r.bottom + 8) + 'px';
  const who = document.createElement('small');
  Object.assign(who.style, { display: 'block', font: '700 10.5px/1.3 var(--body, sans-serif)', color: '#c9772b' });
  who.textContent = `🤝 相棒・${info.d.name}`;
  const line = document.createElement('span');
  line.textContent = `「${partnerLine(info.d.name)}」`;
  b.append(who, line);
  root.appendChild(b);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const a = b.animate([{ opacity: 0, transform: `translateY(${above ? 6 : -6}px) scale(.96)` }, { opacity: 1, transform: 'none', offset: .1 }, { opacity: 1, transform: 'none', offset: .85 }, { opacity: 0, transform: 'none' }],
    { duration: reduce ? 2400 : 2600 / (info.speed || 1), easing: 'ease-out' });
  a.finished.then(() => b.remove(), () => b.remove());
  setTimeout(() => b.remove(), 6000); // 動きが止まる環境でも、残り続けないように
}

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
const FRAME = { normal: '#f1d98a', effect: '#e9a36f', ritual: '#9cb8ec', fusion: '#b9a3e0', spell: '#5dbfa1', trap: '#d98bb2' };
const ATTR = { 闇: '#534ab7', 光: '#b8902a', 地: '#8a6a3a', 水: '#2f6fb0', 炎: '#c4473a', 風: '#2e8b57', 神: '#a9841f' };
/* 対戦卓のカード（app.js の faceHtml と duel-ui.js のカードの形）と同じ文字・記号 */
const RACE_CHAR = { ドラゴン族: '竜', 魔法使い族: '魔', 機械族: '機', 戦士族: '戦', 悪魔族: '悪', 天使族: '天', アンデット族: '屍', 獣族: '獣', 獣戦士族: '獣', 鳥獣族: '鳥', 爬虫類族: '爬', 恐竜族: '恐', 水族: '水', 海竜族: '海', 魚族: '魚', 炎族: '炎', 雷族: '雷', 岩石族: '岩', 植物族: '植', 昆虫族: '虫', 幻神獣族: '神' };
const SPELL_MARK = { 通常: '✦', 速攻: '➶', 永続: '∞', 装備: '⚔', フィールド: '◈', 儀式: '✧' };
const TRAP_MARK = { 通常: '◆', 永続: '∞', カウンター: '↺' };
const FRAME_NAME = { normal: '通常', effect: '効果', ritual: '儀式', fusion: '融合' };
const CARD_FONT = '"M PLUS Rounded 1c","Zen Kaku Gothic New","Hiragino Sans","Yu Gothic",sans-serif';
const CARD_DISPLAY = '"Zen Maru Gothic","M PLUS Rounded 1c","Hiragino Maru Gothic ProN",sans-serif';
const CARD_NUM = '"Fredoka","M PLUS Rounded 1c",sans-serif';
/** 幅に収まるように文字を切る（はみ出す分は …） */
function fitText(x, s, w) { if (x.measureText(s).width <= w) return s; let t = s; while (t.length > 1 && x.measureText(t + '…').width > w) t = t.slice(0, -1); return t + '…'; }
/** 2行に折り返す（2行目に入りきらない分は …） */
function twoLines(x, s, w) {
  let a = ''; for (const ch of s) { if (x.measureText(a + ch).width > w) break; a += ch; }
  const rest = s.slice(a.length); return rest ? [a, fitText(x, rest, w)] : [a];
}
/**
 * レア度：神（幻神獣族・創造神族）と攻撃力か守備力3000以上はシークレット、2500以上と汎用の魔法・罠はウルトラ、
 * 汎用の効果モンスターとテーマの魔法・罠は字レア、それ以外はノーマル。
 * 汎用かテーマかは、効果の文章に自分以外のカード名やテーマ名が「」で書いてあるかで見分ける
 */
export function rarityOf(d) {
  if (!d) return 'n';
  if (d.race === '幻神獣族' || d.race === '創造神族') return 'sec';
  const refs = [...String(d.text || '').matchAll(/「([^」]+)」/g)].map(m => m[1]).filter(n => n !== d.name);
  if ((d.kind || 'monster') === 'monster') {
    const mx = Math.max(Number(d.atk) || 0, Number(d.def) || 0);
    if (mx >= 3000) return 'sec';
    if (mx >= 2500) return 'ur';
    return d.frame === 'effect' && !refs.length ? 'rare' : 'n';
  }
  return refs.length ? 'rare' : 'ur';
}
/* 種類ごとの元の色（枠の上下のグラデーション）と、下の文章欄の色 */
const FRAME_GRAD = { normal: ['#e3be72', '#c99d4c'], effect: ['#d98a4e', '#b4652e'], ritual: ['#86b4e6', '#4f86c6'], fusion: ['#a988d4', '#7a5aac'], spell: ['#2fae93', '#127a64'], trap: ['#c46594', '#963f6c'] };
const BOX_COL = { normal: '#f3e6c4', effect: '#f1dfc8', ritual: '#e4ecf6', fusion: '#ebe4f3', spell: '#e2f0ea', trap: '#f3e2ea' };
/** 名前の文字の色：字レアは銀、ウルトラは金、シークレットは虹がかった銀 */
function foilGrad(x, x0, x1, r) {
  const g = x.createLinearGradient(x0, 0, x1, 0);
  const st = r === 'ur' ? ['#6b4c12', '#b98d33', '#f2d98a', '#fff6d0', '#d7ad52', '#8c6520', '#e2c06a']
    : r === 'sec' ? ['#7d8696', '#ffd6f0', '#d6f0ff', '#ffffff', '#f8f0c8', '#d0e8ff', '#ffd8ec']
      : ['#5a5f68', '#a9b0bb', '#eef2f7', '#ffffff', '#b9c0ca', '#6c727c', '#d4d9e0'];
  st.forEach((c, i) => g.addColorStop(i / (st.length - 1), c));
  return g;
}
/**
 * カードの表面をキャンバスに描いた絵（演出の中で動かしたり、破片にしたりする）。対戦卓のカードと同じ、初期の配置：
 * 上にカード名と属性、その下にレベルの星（魔法・罠は種類）、中央に正方形のイラスト枠、下に種族の行と攻撃力・守備力。
 * full=false（既定）はフィールドのカードと同じく、名前・イラスト・攻守だけ
 */
export function cardImg(d, atk, def, full = false) {
  const CW = 78, CH = 114, SC = 3, o = document.createElement('canvas'); o.width = CW * SC; o.height = CH * SC;
  const x = o.getContext('2d'); x.scale(SC, SC);
  const kind = d.kind || 'monster', mon = kind === 'monster', frame = mon ? (d.frame || 'effect') : kind, rar = rarityOf(d);
  const fg = FRAME_GRAD[frame] || FRAME_GRAD.effect;
  // 枠：種類ごとの色のグラデーションと、細い斜めの地模様
  rr(x, .75, .75, CW - 1.5, CH - 1.5, 5); const g = x.createLinearGradient(0, 0, CW * .4, CH); g.addColorStop(0, fg[0]); g.addColorStop(1, fg[1]); x.fillStyle = g; x.fill();
  x.save(); x.clip(); x.strokeStyle = 'rgba(0,0,0,.035)'; x.lineWidth = 1.4; for (let k = -CH; k < CW; k += 4) { x.beginPath(); x.moveTo(k, CH); x.lineTo(k + CH, 0); x.stroke(); }
  const sh = x.createLinearGradient(0, 0, CW, CH); sh.addColorStop(0, 'rgba(255,255,255,.16)'); sh.addColorStop(1, 'rgba(0,0,0,.14)'); x.fillStyle = sh; x.fillRect(0, 0, CW, CH); x.restore();
  const L = CW * .055, W2 = CW - L * 2;
  // 上：カード名（枠の上に直接、細い枠つき）と属性の丸
  const tY = CH * .036, tH = full ? CH * .084 : CH * .145;
  // レアは名前の枠を暗くして、金・銀の文字を読みやすく
  x.fillStyle = rar === 'n' ? 'rgba(255,255,255,.12)' : 'rgba(26,18,8,.78)'; x.fillRect(L, tY, W2, tH); x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = .8; x.strokeRect(L, tY, W2, tH);
  const atR = (full ? tH : CH * .084) * .42, atX = L + W2 - atR - 1.5, atY = tY + (full ? tH / 2 : atR + 1.5);
  x.textBaseline = 'middle'; x.textAlign = 'left';
  // 全部見せる時は1行、フィールドの大きさでは2行まで
  x.font = `700 ${full ? 6.6 : 6.4}px ${CARD_FONT}`;
  const lines = full ? [fitText(x, d.name || '', W2 - atR * 2 - 5)] : twoLines(x, d.name || '', W2 - atR * 2 - 5);
  const lineY = i => (lines.length > 1 ? tY + 3.6 + i * 6.8 : atY + .3);
  if (rar !== 'n') { x.fillStyle = 'rgba(0,0,0,.55)'; lines.forEach((l, i) => x.fillText(l, L + 2.2, lineY(i) + .4)); x.fillStyle = foilGrad(x, L, L + W2 * .9, rar); } else x.fillStyle = '#1b1b1b';
  lines.forEach((l, i) => x.fillText(l, L + 2, lineY(i)));
  x.fillStyle = mon ? (ATTR[d.attribute] || '#6a6e7e') : kind === 'spell' ? '#0f6e56' : '#993556';
  x.beginPath(); x.arc(atX, atY, atR, 0, TAU); x.fill(); x.lineWidth = .7; x.strokeStyle = 'rgba(0,0,0,.4)'; x.stroke();
  x.fillStyle = '#fff'; x.font = `700 ${atR * 1.1}px ${CARD_FONT}`; x.textAlign = 'center'; x.fillText(mon ? (d.attribute || '？') : kind === 'spell' ? '魔' : '罠', atX, atY + .4);
  // レベルの星（モンスター）・【魔法カード】【罠カード】（全部見せる時だけ）
  if (full) {
    const sy = CH * .16;
    if (mon) { const lv = Math.min(12, d.level ?? 0), r = 2.3; for (let i = 0; i < lv; i++) { const cx = L + W2 - r - 1 - i * (r * 2 + .5); const sg = x.createRadialGradient(cx - .6, sy - .6, 0, cx, sy, r); sg.addColorStop(0, '#ffb35a'); sg.addColorStop(1, '#d0451c'); x.fillStyle = sg; x.beginPath(); x.arc(cx, sy, r, 0, TAU); x.fill(); } }
    else { x.font = `700 5.6px ${CARD_FONT}`; x.textAlign = 'right'; x.fillStyle = kind === 'spell' ? '#04342c' : '#4b1528'; x.fillText(`【${kind === 'spell' ? '魔法' : '罠'}カード】${(kind === 'spell' ? SPELL_MARK : TRAP_MARK)[d.subtype] || ''}`, L + W2, sy); }
  }
  // 中央：正方形のイラスト枠（種族の一文字、魔法・罠は記号）
  const aW = CW * (full ? .78 : .76), aX = (CW - aW) / 2, aY = full ? CH * .205 : CH * .2;
  const ag = x.createLinearGradient(aX, aY, aX + aW * .6, aY + aW); ag.addColorStop(0, '#3a3f52'); ag.addColorStop(1, '#1c2030');
  x.fillStyle = ag; x.fillRect(aX, aY, aW, aW);
  const ch = mon ? (RACE_CHAR[d.race] || (d.race || '？').charAt(0)) : ((kind === 'spell' ? SPELL_MARK : TRAP_MARK)[d.subtype] || (kind === 'spell' ? '✦' : '◆'));
  x.fillStyle = 'rgba(255,255,255,.22)'; x.font = `400 ${aW * .55}px ${CARD_DISPLAY}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, CW / 2, aY + aW / 2 + 1);
  // ウルトラ・シークレット：イラストに鈍く光るホロ
  if (rar === 'ur' || rar === 'sec') {
    x.save(); x.beginPath(); x.rect(aX, aY, aW, aW); x.clip(); x.globalCompositeOperation = 'overlay';
    if (rar === 'ur') { for (let k = -aW; k < aW * 2; k += 7) { const hg = x.createLinearGradient(aX + k, 0, aX + k + 7, 0); hg.addColorStop(0, 'hsla(40,80%,70%,0)'); hg.addColorStop(.5, `hsla(${(k * 9) % 360},70%,70%,.45)`); hg.addColorStop(1, 'hsla(40,80%,70%,0)'); x.fillStyle = hg; x.save(); x.translate(aX + k, aY); x.transform(1, 0, -.45, 1, 0, 0); x.fillRect(0, 0, 7, aW); x.restore(); } }
    else { x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = .5; for (let k = -aW; k < aW * 2; k += 2.2) { x.beginPath(); x.moveTo(aX + k, aY + aW); x.lineTo(aX + k + aW, aY); x.stroke(); } const pg = x.createLinearGradient(aX, aY, aX + aW, aY + aW); ['hsla(330,80%,75%,.5)', 'hsla(200,80%,75%,.5)', 'hsla(60,80%,75%,.5)', 'hsla(280,70%,75%,.5)'].forEach((c, i) => pg.addColorStop(i / 3, c)); x.fillStyle = pg; x.fillRect(aX, aY, aW, aW); }
    x.globalCompositeOperation = 'soft-light'; const hl = x.createRadialGradient(aX + aW * .3, aY + aW * .25, 0, aX + aW * .3, aY + aW * .25, aW * .6); hl.addColorStop(0, 'rgba(255,255,240,.6)'); hl.addColorStop(1, 'rgba(255,255,240,0)'); x.fillStyle = hl; x.fillRect(aX, aY, aW, aW);
    x.restore();
  }
  x.lineWidth = 1.2; x.strokeStyle = 'rgba(0,0,0,.5)'; x.strokeRect(aX, aY, aW, aW); x.lineWidth = .7; x.strokeStyle = 'rgba(255,255,255,.35)'; x.strokeRect(aX + 1.2, aY + 1.2, aW - 2.4, aW - 2.4);
  // 下：文章欄（全部見せる時は種族の行も）と、攻撃力・守備力
  const bY = aY + aW + CH * .02, bH = CH - CH * .036 - bY;
  x.fillStyle = BOX_COL[frame] || '#f1dfc8'; x.fillRect(L, bY, W2, bH); x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = .8; x.strokeRect(L, bY, W2, bH);
  x.textAlign = 'left'; x.textBaseline = 'top'; x.fillStyle = '#262626';
  if (full) {
    x.font = `700 5.4px ${CARD_FONT}`;
    const ty = mon ? `【${d.race || ''}／${FRAME_NAME[d.frame] || '効果'}】` : String(d.text || '').replace(/^[①-⑳]：/, '').replace(/\s+/g, '');
    x.fillText(fitText(x, ty, W2 - 3), L + 1.5, bY + 1.2);
  }
  if (mon) {
    const a = String(atk ?? d.atk ?? 0), df = String(def ?? d.def ?? 0), ly = bY + bH - (full ? 6.6 : bH * .5 + 3.2);
    if (full) { x.strokeStyle = 'rgba(0,0,0,.6)'; x.lineWidth = .6; x.beginPath(); x.moveTo(L + 1.5, ly - .8); x.lineTo(L + W2 - 1.5, ly - .8); x.stroke(); }
    x.font = `600 ${full ? 5.6 : 7.4}px ${CARD_NUM}`; x.textAlign = full ? 'right' : 'center'; x.fillStyle = '#1b1b1b';
    x.fillText(full ? `ATK/${a}  DEF/${df}` : `${a} / ${df}`, full ? L + W2 - 1.5 : CW / 2, ly);
  } else if (!full) {
    x.font = `700 6.4px ${CARD_FONT}`; x.textAlign = 'center'; x.fillStyle = kind === 'spell' ? '#04342c' : '#4b1528'; x.fillText(`${d.subtype || ''}${kind === 'spell' ? '魔法' : '罠'}`, CW / 2, bY + bH / 2 - 3.2);
  }
  // こげ茶の枠
  rr(x, .75, .75, CW - 1.5, CH - 1.5, 5); x.lineWidth = 1.5; x.strokeStyle = '#24150b'; x.stroke();
  x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  return o;
}



/* ---------- 演出はプレイマット（盤面）の中だけに描く：描いた後、盤面の外を消す ---------- */
let clipR = null;
function setClip(root) { const b = root.querySelector('#board'); clipR = b ? b.getBoundingClientRect() : null; }
/** 盤面の外（画面全体）にも、演出と同じ暗さ・白いベールをかける（MASTER：暗転と明転は画面全体で） */
function veilOutside(fill) {
  if (!clipR || !fill) return;
  const dpr = cv.width / (window.innerWidth || 1), b = clipR, r = 14;
  ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = fill; ctx.beginPath(); ctx.rect(-10, -10, W + 20, H + 20);
  ctx.moveTo(b.left + r, b.top); ctx.arcTo(b.left, b.top, b.left, b.bottom, r); ctx.arcTo(b.left, b.bottom, b.right, b.bottom, r); ctx.arcTo(b.right, b.bottom, b.right, b.top, r); ctx.arcTo(b.right, b.top, b.left, b.top, r); ctx.closePath();
  ctx.fill('evenodd'); ctx.restore();
}
const veilOf = S => (S.dark > .01 ? (S.tone === 'holy' ? `rgba(255,248,228,${S.dark * .5})` : `rgba(0,0,0,${S.dark * (S.tone === 'abyss' ? .82 : .6)})`) : null);
function maskToBoard() {
  if (!clipR) return;
  const dpr = cv.width / (window.innerWidth || 1);
  ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = '#000'; rr(ctx, clipR.left, clipR.top, clipR.width, clipR.height, 14); ctx.fill();
  ctx.restore();
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
  ensureCanvas(root); fit(); setClip(root);
  const god = godKind(info.a.d);
  return new Promise(resolve => {
    const S = setup(info, god);
    cv.style.display = 'block';
    const step = now => {
      if (S.done) return;
      frame(S, now); maskToBoard(); veilOutside(veilOf(S));
      const left = S.end - S.t; cv.style.opacity = left < 800 ? String(Math.max(0, left / 800)) : '';
      if (S.t > S.end) { S.done = true; ctx.clearRect(0, 0, W, H); cv.style.display = 'none'; cv.style.opacity = ''; resolve(); return; }
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
  const side = !direct && info.t.pos === 'def';
  const D = { x: rt.left + rt.width / 2, y: rt.top + rt.height / 2, w: direct ? ra.width : side ? rt.height : rt.width, h: direct ? ra.height : side ? rt.width : rt.height, a: 1, rot: side ? Math.PI / 2 : 0, rot0: side ? Math.PI / 2 : 0, burn: 0, dis: 0, img: direct ? null : cardImg(info.t.d, info.t.atk, info.t.def) };
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
  if (D.wobble != null) D.rot = (D.rot0 || 0) + Math.sin((t - D.wobble) / 30) * .08 * Math.max(0, 1 - (t - D.wobble) / 500);
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
  // 茶色い枠（画面の裏面と同じ）
  const fw = CW * 3.4 / 59; x.beginPath(); x.rect(0, 0, CW, CH); x.rect(fw, CH - fw, CW - fw * 2, -(CH - fw * 2)); x.fillStyle = '#8a5a2b'; x.fill('evenodd');
  x.strokeStyle = 'rgba(192,138,78,.8)'; x.lineWidth = .7; x.strokeRect(1.6, 1.6, CW - 3.2, CH - 3.2);
  x.strokeStyle = '#2a170a'; x.lineWidth = 1.1; x.strokeRect(fw, fw, CW - fw * 2, CH - fw * 2);
  x.strokeStyle = '#24150b'; x.lineWidth = 1.6; rr(x, 1, 1, CW - 2, CH - 2, 6); x.stroke();
  return (BACK = o);
}
const SUMMON_COLOR = { normal: '#ffe08a', set: '#d9a35a', advance: '#ffd27a', special: '#9fe6ff', flip: '#ffffff', ritual: '#7fb2ff', fusion: '#c9a7ff', god: '#ffc93d' };
const SUMMON_LAND = { normal: 420, set: 300, advance: 900, special: 1100, flip: 500, ritual: 1800, fusion: 2700, god: 2700, ace: 2300, partner: 1500 };
/* エース（2体以上のリリースが必要なモンスター・レベル7以上）：
   暗転と黒帯 → リリースした素材が光になって天へ → 魔法陣と光の柱 → 上空から大きく降臨して着地 → 名前と攻撃力の帯 */
const ACE_COLOR = { 闇: '#b07cff', 光: '#ffd75a', 地: '#e0b47a', 水: '#6bd0ff', 炎: '#ff7a4a', 風: '#7aff9a' };
const ACE = { circle: 350, pillar: 900, drop: 1350 };
/* 切り札の5分類（MASTERのチェック表）：分類ごとに登場の仕方と色を変える。
   大きい演出＝そのカードが初めて場に出た時。2回目からと、表の無いデッキの予備の判定は、短い演出（光の輪と札）だけ */
/* 切り札の5分類：MASTERの豪華さの表（2026-11-21）。L＝着地までの長さ、tail＝着地の後（ゆっくり消える分も含む）、fx＝使う効果
   dark 暗くする／bars 上下の黒い帯／shake 揺れ／circle 魔法陣／pillar 光の柱／parts 光の粒／slow スローモーション／big 大きく映す／land 着地の光／plate 名前の帯 */
export const ACE_CLS = {
  god: { label: '神', how: 'god', tail: 900, fx: { dark: 1, bars: 1, shake: 1, circle: 1, pillar: 1, parts: 1, slow: 1, big: 1, land: 1, plate: 1 } },
  roman: { label: 'ロマンエース', how: 'ace', L: 2000, tail: 1000, fx: { dark: 1, bars: 1, shake: 1, pillar: 1, parts: 1, big: 1, land: 1, plate: 1 } },
  top: { label: 'トップエース', how: 'ace', L: 2000, tail: 1000, fx: { dark: 1, shake: 1, pillar: 1, parts: 1, big: 1, land: 1, plate: 1 } },
  ace: { label: 'エース', how: 'ace', L: 1250, tail: 750, fx: { dark: 1, circle: 1, parts: 1, land: 1, plate: 1 } },
  // 相棒は★の順番に入れない特別枠：ゆれない・暗くしすぎない。場の仲間から絆の光が集まって、並び立つ
  partner: { label: '相棒', how: 'partner', L: 1350, tail: 700, c: '#ffb35c', fx: { plate: 1 } },
};
/* 色（神以外）：闇は黒が基調の深淵っぽい感じ、光は白が基調の神々しい感じ。地・水・炎・風は属性の色のまま */
const ACE_TONE = { 闇: { c: '#9a74ff', tone: 'abyss' }, 光: { c: '#ffe7a0', tone: 'holy' } };
/* 相棒：手元（プレイヤーの側）から光が立ちのぼる → 相棒が光の中で振り返るように大きく映る → 自分のマスへ降りて、手元と絆の光でつながる */
const PARTNER = { beam: 500, turn: 350, turnEnd: 900 };
/** 文字の帯・札を、消え始める前にそのまま見せる長さ（ミリ秒） */
const PLATE_HOLD = 1600;
/** 文字は、見せ終わったら速く消す（そのあとで画面と演出がゆっくり消える。MASTER：文字までゆっくり消えると違和感） */
const TEXT_OUT = 250;
/** 文字の消え方：textEnd の TEXT_OUT 前から速く消えて、textEnd で0 */
const textFade = (S, t) => Math.max(0, Math.min(1, (S.textEnd - t) / TEXT_OUT));
/* 融合：素材が渦の中心へ集まる → 渦に巻き込まれて回りながら混ざる → 光って融合モンスターが現れる → 自分のマスへ降りる */
const FU = { gather: 450, mix: 1750, born: 1950 };
const FU_COLS = ['#c9a7ff', '#7f77dd', '#ff8ad8', '#6bd0ff', '#ffffff', '#b45cff'];
const lerp = (a, b, k) => a + (b - a) * k;

/* ---------- プレイマットの柄：大きな召喚（エース・儀式・融合・神）の間だけ、盤面の地を召喚に合わせた柄に変える。
   カードを置く枠は盤面の上に残る。短い召喚（通常・セット・アドバンス・特殊・反転）は変えない ---------- */
function sumMatStart(S, root, cvEl) {
  if (!cvEl || !SUM_MAT[S.how]) return;
  const r = cvEl.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1), x = cvEl.getContext('2d');
  cvEl.width = Math.max(1, r.width * dpr); cvEl.height = Math.max(1, r.height * dpr); x.setTransform(dpr, 0, 0, dpr, 0, 0);
  S.mat = { cv: cvEl, ctx: x, w: r.width, h: r.height, ox: r.left, oy: r.top, fn: SUM_MAT[S.how], seed: Array.from({ length: 140 }, () => [Math.random(), Math.random(), Math.random()]) };
  S.board = root.querySelector('#board'); if (S.board) S.board.classList.add('skin-on');
}
function sumMatEnd(S) { if (!S.mat) return; S.mat.ctx.clearRect(0, 0, S.mat.w, S.mat.h); if (S.board) S.board.classList.remove('skin-on'); }
function sumMatAlpha(S) { const t = S.t; return Math.min(1, Math.max(0, (t - 100) / 450)) * (t > S.end - 650 ? Math.max(0, (S.end - t) / 650) : 1); }
function sumMatDraw(S) {
  const m = S.mat; if (!m) return;
  const x = m.ctx, al = sumMatAlpha(S); x.clearRect(0, 0, m.w, m.h); if (al <= 0) return;
  x.save(); x.globalAlpha = al; m.fn(S, x, m.w, m.h, S.t); x.restore();
}
const mloc = (S, px, py) => ({ x: px - S.mat.ox, y: py - S.mat.oy });
/** 夜空の地：中心ほど色が明るい */
function skySky(x, w, h, cx, cy, col, k) {
  x.fillStyle = '#05060c'; x.fillRect(0, 0, w, h);
  const R = Math.hypot(w, h), g = x.createRadialGradient(cx, cy, 0, cx, cy, R * .75);
  g.addColorStop(0, hexA(col, .5 * k)); g.addColorStop(.45, hexA(col, .2 * k)); g.addColorStop(1, hexA(col, .04)); x.fillStyle = g; x.fillRect(0, 0, w, h);
}
function skyStars(S, x, w, h, t, n, col) { S.mat.seed.slice(0, n).forEach(([a, b, s]) => { const tw = .35 + .65 * Math.abs(Math.sin(t / (380 + s * 400) + s * 20)); x.fillStyle = col || `rgba(255,255,255,${.75 * tw})`; x.globalAlpha *= 1; x.fillRect(a * w, b * h, 1 + s * 1.2, 1 + s * 1.2); }); }
/** 魔法陣：二重の輪・目盛り・星形（n=5）か六芒星（n=6）・内側の輪。rot で回す */
function magicCircle(x, cx, cy, R, rot, col, n, lw) {
  x.save(); x.translate(cx, cy); x.rotate(rot); x.strokeStyle = col; x.shadowColor = col; x.shadowBlur = 10; x.lineWidth = lw;
  const ring = r => { x.beginPath(); x.arc(0, 0, r, 0, TAU); x.stroke(); };
  ring(R); ring(R * .9); ring(R * .62); ring(R * .3);
  // 外側の帯の文字のような目盛り
  x.lineWidth = lw * .8; for (let i = 0; i < 48; i++) { const a = i / 48 * TAU, l = i % 4 ? .04 : .07; x.beginPath(); x.moveTo(Math.cos(a) * R * .9, Math.sin(a) * R * .9); x.lineTo(Math.cos(a) * R * (.9 + l), Math.sin(a) * R * (.9 + l)); x.stroke(); }
  x.lineWidth = lw;
  if (n === 5) { x.beginPath(); for (let j = 0; j <= 5; j++) { const a = j * 2 / 5 * TAU - Math.PI / 2; x.lineTo(Math.cos(a) * R * .9, Math.sin(a) * R * .9); } x.stroke(); }
  else for (let i = 0; i < 2; i++) { x.beginPath(); for (let j = 0; j <= 3; j++) { const a = j / 3 * TAU + i * Math.PI / 3 - Math.PI / 2; x.lineTo(Math.cos(a) * R * .9, Math.sin(a) * R * .9); } x.stroke(); }
  // 頂点の小さな輪
  for (let j = 0; j < n; j++) { const a = j / n * TAU - Math.PI / 2; x.beginPath(); x.arc(Math.cos(a) * R * .9, Math.sin(a) * R * .9, R * .07, 0, TAU); x.stroke(); }
  x.rotate(-rot * 2.5); x.setLineDash([R * .05, R * .04]); ring(R * .48); x.setLineDash([]);
  for (let j = 0; j < 12; j++) { const a = j / 12 * TAU; x.beginPath(); x.moveTo(Math.cos(a) * R * .3, Math.sin(a) * R * .3); x.lineTo(Math.cos(a) * R * .62, Math.sin(a) * R * .62); x.stroke(); }
  x.restore();
}
const SUM_MAT = {
  partner(S, x, w, h, t) { SUM_MAT.ace(S, x, w, h, t); },
  /* エース：属性の色の夜空に、大きな魔法陣がゆっくり回る。墓地からの時は、墓地の側から光の粒が昇る */
  ace(S, x, w, h, t) {
    const c = mloc(S, S.x, S.y), col = S.c, R = Math.min(w, h) * .46 * (.6 + .4 * ease(Math.min(1, t / 900)));
    skySky(x, w, h, c.x, c.y, col, 1); skyStars(S, x, w, h, t, 90);
    // 遠くの大きな輪（ゆっくり逆回り）
    x.save(); x.globalAlpha *= .35; magicCircle(x, c.x, c.y, Math.max(w, h) * .62, -t / 9000, hexA(col, .8), 6, 1.2); x.restore();
    x.save(); x.globalAlpha *= .85; magicCircle(x, c.x, c.y, R, t / 5000, hexA(col, .95), 5, 2); x.restore();
    const g = x.createRadialGradient(c.x, c.y, 0, c.x, c.y, R * .5); g.addColorStop(0, hexA(col, .45)); g.addColorStop(1, hexA(col, 0)); x.fillStyle = g; x.fillRect(c.x - R, c.y - R, R * 2, R * 2);
    if (S.soul0) {
      const s = mloc(S, S.soul0.x, S.soul0.y);
      S.mat.seed.slice(0, 70).forEach(([a, b, q], i) => {
        const f = ((t / 1600) * (.5 + q) + b) % 1, px = s.x + (a - .5) * 70 + (c.x - s.x) * f * .55 + Math.sin(t / 300 + i) * 6, py = s.y - f * h * .9;
        x.fillStyle = i % 3 ? hexA(col, .8 * (1 - f)) : `rgba(255,255,255,${.85 * (1 - f)})`; x.beginPath(); x.arc(px, py, 1.2 + q * 2.4, 0, TAU); x.fill();
      });
      const g2 = x.createRadialGradient(s.x, s.y, 0, s.x, s.y, 90); g2.addColorStop(0, hexA(col, .5)); g2.addColorStop(1, hexA(col, 0)); x.fillStyle = g2; x.fillRect(s.x - 90, s.y - 90, 180, 180);
    }
  },
  /* 儀式：青い夜空に、儀式の魔法陣（六芒星）の線が浮かぶ */
  ritual(S, x, w, h, t) {
    const c = mloc(S, S.x, S.y), R = Math.min(w, h) * .44 * (.7 + .3 * ease(Math.min(1, t / 700)));
    x.fillStyle = '#040b1e'; x.fillRect(0, 0, w, h);
    const g = x.createRadialGradient(c.x, c.y, 0, c.x, c.y, Math.hypot(w, h) * .7); g.addColorStop(0, 'rgba(70,120,230,.55)'); g.addColorStop(.5, 'rgba(30,60,150,.3)'); g.addColorStop(1, 'rgba(10,20,60,.1)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    skyStars(S, x, w, h, t, 80);
    // 星座のような細い線
    x.strokeStyle = 'rgba(170,205,255,.18)'; x.lineWidth = 1; const pts = S.mat.seed.slice(80, 96);
    x.beginPath(); pts.forEach(([a, b], i) => (i % 4 ? x.lineTo(a * w, b * h) : x.moveTo(a * w, b * h))); x.stroke();
    magicCircle(x, c.x, c.y, R, t / 7000, 'rgba(160,200,255,.9)', 6, 1.6);
    // 陣の線を光がなぞる
    const a = t / 500; x.fillStyle = '#e4f0ff'; x.shadowColor = '#7fb2ff'; x.shadowBlur = 12;
    for (let i = 0; i < 3; i++) { const q = a + i * TAU / 3; x.beginPath(); x.arc(c.x + Math.cos(q) * R, c.y + Math.sin(q) * R, 3, 0, TAU); x.fill(); }
    x.shadowBlur = 0;
  },
  /* 融合：紫・ピンク・水色の渦の模様が、中心へ流れ込む */
  fusion(S, x, w, h, t) {
    const c = mloc(S, S.C.x, S.C.y), R = Math.hypot(w, h) * .8, spin = t / 900 + (t / 2600) ** 2 * 3;
    x.fillStyle = '#0d0618'; x.fillRect(0, 0, w, h);
    const g = x.createRadialGradient(c.x, c.y, 0, c.x, c.y, R * .7); g.addColorStop(0, 'rgba(201,167,255,.55)'); g.addColorStop(.35, 'rgba(120,60,190,.3)'); g.addColorStop(1, 'rgba(20,10,40,.1)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    const cols = ['rgba(180,92,255,', 'rgba(255,138,216,', 'rgba(107,208,255,'];
    x.save(); x.globalCompositeOperation = 'lighter';
    for (let v = 0; v < 9; v++) {
      x.strokeStyle = cols[v % 3] + '.45)'; x.lineWidth = 10 - (v % 3) * 2.5; x.beginPath();
      for (let r = 8; r < R; r *= 1.06) { const ang = Math.log(r) * 1.9 - spin * 2.2 + v / 9 * TAU; const px = c.x + Math.cos(ang) * r, py = c.y + Math.sin(ang) * r * .75; r === 8 ? x.moveTo(px, py) : x.lineTo(px, py); }
      x.stroke();
    }
    // 渦に沿って中心へ流れ込む光の粒
    S.mat.seed.slice(0, 90).forEach(([a, b, q], i) => {
      const f = ((t / 1400) * (.6 + q) + b) % 1, r = (1 - f) * R * .75 + 6, ang = Math.log(r) * 1.9 - spin * 2.2 + a * TAU;
      x.fillStyle = cols[i % 3] + (.9 * f).toFixed(2) + ')'; x.beginPath(); x.arc(c.x + Math.cos(ang) * r, c.y + Math.sin(ang) * r * .75, 1.4 + q * 2, 0, TAU); x.fill();
    });
    x.restore();
  },
  /* 神：神ごとの色（オシリスは赤、オベリスクは青、ラーは金、ホルアクティは七色）の雷雲が渦巻く */
  god(S, x, w, h, t) {
    const c = mloc(S, S.x, S.y), g0 = godKind(S.d), creator = g0 === 'creator';
    const col = creator ? null : GOD[g0 || 'gold'].c, tint = (a, i = 0) => creator ? `hsla(${(t / 8 + i * 47) % 360},90%,65%,${a})` : hexA(col, a);
    x.fillStyle = '#050407'; x.fillRect(0, 0, w, h);
    const g = x.createRadialGradient(c.x, c.y, 0, c.x, c.y, Math.hypot(w, h) * .7); g.addColorStop(0, tint(.7)); g.addColorStop(.5, tint(.3, 3)); g.addColorStop(1, tint(.08, 5)); x.fillStyle = g; x.fillRect(0, 0, w, h);
    // 雷雲：大きな雲のかたまりが中心のまわりを渦巻く
    S.mat.seed.slice(0, 26).forEach(([a, b, q], i) => {
      const r = (.15 + b * .85) * Math.max(w, h) * .62, ang = a * TAU + t / (1300 + r * 6), px = c.x + Math.cos(ang) * r, py = c.y + Math.sin(ang) * r * .7, cr = 60 + q * 90;
      // 雲の上側（光が当たる側）は明るく、下は暗い
      const gc = x.createRadialGradient(px - cr * .25, py - cr * .3, 0, px, py, cr); gc.addColorStop(0, i % 3 ? 'rgba(120,112,132,.6)' : tint(.55, i)); gc.addColorStop(.45, i % 3 ? 'rgba(62,56,74,.55)' : tint(.25, i)); gc.addColorStop(1, 'rgba(20,18,26,0)');
      x.fillStyle = gc; x.fillRect(px - cr, py - cr, cr * 2, cr * 2);
    });
    // 雲の中を走る稲妻（ときどき、雲全体が光る）
    const m = S.mat;
    if (!m.bolt || t - m.bolt.t > 260) if (Math.random() < .06) {
      const a = Math.random() * TAU, r = (.3 + Math.random() * .6) * Math.max(w, h) * .55; let px = c.x + Math.cos(a) * r, py = c.y + Math.sin(a) * r * .7; const pts = [[px, py]];
      for (let k = 0; k < 9; k++) { px += (c.x - px) * .14 + (Math.random() - .5) * 40; py += (c.y - py) * .14 + (Math.random() - .5) * 30; pts.push([px, py]); }
      m.bolt = { t, pts, i: Math.random() * 7 | 0 };
    }
    if (m.bolt && t - m.bolt.t < 260) {
      const k = 1 - (t - m.bolt.t) / 260; x.fillStyle = tint(.22 * k, m.bolt.i); x.fillRect(0, 0, w, h);
      [[7, .45], [2, 1]].forEach(([lw, al], j) => { x.strokeStyle = j ? `rgba(255,255,255,${al * k})` : tint(al * k, m.bolt.i); x.lineWidth = lw; x.beginPath(); m.bolt.pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.stroke(); });
    }
    const gl = x.createRadialGradient(c.x, c.y, 0, c.x, c.y, 120); gl.addColorStop(0, tint(.6)); gl.addColorStop(1, tint(0)); x.fillStyle = gl; x.fillRect(c.x - 120, c.y - 120, 240, 240);
  },
};

/** 召喚の演出の色：神は神ごとの色、切り札は闇＝深淵の紫・光＝神々しい白金・ほかは属性の色、ふつうの召喚は召喚のしかたの色 */
function summonCol(how, A, d) {
  if (how === 'god') { const g = godKind(d); return g ? GOD[g].c : A ? (ACE_TONE[d.attribute]?.c || ACE_COLOR[d.attribute] || SUMMON_COLOR.god) : SUMMON_COLOR.god; }
  if (A && A.c) return A.c;
  if (how === 'ace' || A) return ACE_TONE[d.attribute]?.c || ACE_COLOR[d.attribute] || '#ffd27a';
  return SUMMON_COLOR[how] || '#9fe6ff';
}
export function playSummon(root, info) {
  ensureCanvas(root); fit(); setClip(root);
  // 相棒（MASTERの決定 2026-11-21）：大きな光・揺れ・名前の帯はやめて、ふつうの召喚の見た目にする。
  // 特別感は、着地した時の相棒だけの音（呼ぶ側が鳴らす）と、初めて出た時だけのひと言の吹き出しで出す
  const partner = !info.faceDown && info.ace && info.ace.cls === 'partner' ? info.ace : null;
  if (partner) {
    const land = info.onLand, say = partner.big && !partner.fallback;
    info = { ...info, ace: null, onLand: () => { if (land) land(); if (say) partnerSay(root, info, partner); } };
  }
  return new Promise(resolve => {
    const r = info.rect, U = Math.max(.6, Math.min(1.3, r.width / 78));
    let how = info.how;
    if (!info.faceDown && (info.d.race === '幻神獣族' || info.d.race === '創造神族') && how !== 'set') how = 'god';
    if (info.faceDown) how = how === 'flip' ? 'flip' : 'set';
    // 切り札（表で決めた5分類）：初めて出た時は分類ごとの大きい登場。儀式・融合はいつもの演出のあとに名前の帯だけ出す。
    // 2回目から・予備の判定・裏側の時は、いつもの演出に短い光の輪と札を足すだけ
    const A = !info.faceDown && info.ace && ACE_CLS[info.ace.cls] ? { ...ACE_CLS[info.ace.cls], ...info.ace } : null;
    const big = !!(A && A.big && !A.fallback);
    if (big && ['normal', 'advance', 'special', 'flip'].includes(how) && how !== 'god') how = A.how;
    const fr = info.fromRect;
    const S = { soul: (how === 'ace' || how === 'partner') && fr ? { x: fr.left + fr.width / 2, y: fr.top + fr.height / 2 } : null, how, c: summonCol(how, A, info.d), U, d: info.d, atk: info.atk, def: info.def, pos: info.pos, x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height,
      img: info.faceDown && how !== 'flip' ? backImg() : cardImg(info.d, info.atk, info.def), parts: [], rings: [], shake: 0, flash: 0, dark: 0, quake: 0, t: 0, last: 0,
      speed: (info.speed || 1) * (window.__fxSlow || 1), L: SUMMON_LAND[how] || 600, hit: false, bolt: null, done: false,
      mats: (info.mats || []).map(m => ({ x: m.rect.left + m.rect.width / 2, y: m.rect.top + m.rect.height / 2, w: m.rect.width, h: m.rect.height, img: cardImg(m.d, m.atk, m.def), a: 1, s: 1 })) };
    S.fromDef = !!info.fromDef; // No.14：反転召喚の前が裏側守備表示（横向き）だった
    S.end = S.L + (how === 'god' ? 900 : how === 'ace' ? 1100 : how === 'partner' ? 1100 : how === 'set' ? 250 : 650);
    if (A && big) {
      S.plate = { label: A.label, side: A.side || '' };
      if (how === 'ritual' || how === 'fusion') S.end = Math.max(S.end, S.L + 1100);
      const cfg = ACE_CLS[A.cls];
      if (how === 'ace' || how === 'partner' || how === 'god') {
        S.fx = cfg.fx; if (cfg.L) S.L = cfg.L; S.end = S.L + cfg.tail;
        S.plateAt = S.L - 700; // カードが降りてくる途中で、早めに帯を出す
        S.tone = how === 'partner' || godKind(info.d) ? '' : ACE_TONE[info.d.attribute]?.tone || '';
        S.T = { circle: S.L * .15, pillar: S.L * .4, drop: S.L * .6 };
      }
    }
    if (A && !big) { S.chip = { label: `★${A.label}`, c: A.c || ACE_COLOR[info.d.attribute] || '#ffd27a' }; S.end = Math.max(S.end, S.L + 750); }
    S.onLand = info.onLand || null; S.landed = false;
    // 融合の渦の中心：召喚するマスと画面の中央の間
    if (how === 'fusion') S.C = { x: (S.x + W / 2) / 2, y: (S.y + H / 2) / 2 };
    if (S.soul) S.soul0 = { x: S.soul.x, y: S.soul.y };
    // 終わり方：いきなり明るくせず、最後に画面全体（暗さ・光の粒・帯）をだんだん消していく。切り札は少し長めに
    S.fade = A ? 1400 : 500; if (A && !S.fx) S.end += 400;
    // 帯・札（文字）は、出てから1.5秒以上そのまま見せて、そのあと0.8秒でゆっくり消す（MASTER：読み終われるだけ長く）
    // 文字（帯・札）：早めに出す → 1.6秒そのまま → 0.25秒で速く消す → そのあと画面と演出が S.fade かけてゆっくり消える
    if (S.plate) { if (S.plateAt == null) S.plateAt = S.L - 400; S.textEnd = S.plateAt + 220 + PLATE_HOLD + TEXT_OUT; S.end = Math.max(S.end, S.textEnd + S.fade); }
    if (S.chip) { S.chipAt = S.L - 200; S.textEnd = S.chipAt + 150 + PLATE_HOLD + TEXT_OUT; S.end = Math.max(S.end, S.textEnd + S.fade); }
    S.safe = info.safe || null;
    sumMatStart(S, root, info.mat);
    cv.style.display = 'block'; cv.style.opacity = '';
    const step = now => {
      if (S.done) return;
      let dt = Math.min(32, now - (S.last || now)) * S.speed; S.last = now;
      if (S.fx && S.fx.slow && S.t > S.L - 350 && S.t < S.L + 100) dt *= .35; // 神：着地の直前をスローモーションに
      S.t += dt;
      if (info.track && !S.hit) { const q = info.track(); if (q && q.width) { S.x = q.left + q.width / 2; S.y = q.top + q.height / 2; S.w = q.width; S.h = q.height; } }
      summonTick(S); summonDraw(S); maskToBoard(); veilOutside(veilOf(S)); sumMatDraw(S);
      const left = S.end - S.t; cv.style.opacity = left < S.fade ? String(Math.max(0, left / S.fade)) : '';
      if (S.t > S.end) { S.done = true; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); cv.style.display = 'none'; cv.style.opacity = ''; sumMatEnd(S); resolve(); return; }
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
  if (k === 'fusion') fusionTick(S);
  if (k === 'ace') aceTick(S);
  if (k === 'partner') partnerTick(S);
  if (k === 'ritual') S.mats.forEach(m => {
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
  if (t > L + 200) S.dark *= .985;
  if (!S.hit && t >= L) {
    S.hit = true;
    if (S.onLand) { try { S.onLand(); } catch { /* 置けなくても演出は続ける */ } S.onLand = null; }
    if (S.chip) { S.rings.push({ x, y: y + S.h / 2 - 4, r: S.w * .45, v: 6 * U, a: 1, c: S.chip.c }); S.rings.push({ x, y: y + S.h / 2 - 4, r: S.w * .3, v: 4 * U, a: .8, c: '#ffffff' }); }
    const big = k === 'god' || k === 'ace' ? 1 : k === 'partner' ? .3 : k === 'advance' || k === 'ritual' || k === 'fusion' ? .75 : k === 'set' ? .1 : .45;
    S.flash = big; S.shake = k === 'set' ? 1 : k === 'partner' ? 0 : S.fx && !S.fx.shake ? 3 : 18 * big;
    S.rings.push({ x, y: y + S.h / 2 - 4, r: S.w * .5, v: k === 'set' ? 2 : (9 * big + 3) * U, a: 1, c: k === 'normal' || k === 'advance' ? '#e8d2a8' : c });
    if (k !== 'set') sburst(S, x, y + S.h / 2 - 6, k === 'normal' ? 36 : 70 * big + 20, k === 'normal' ? ['#d8c3a0', '#bfa27c', '#ffffff'] : [c, '#ffffff'], (k === 'normal' ? 5 : 8 * big + 3) * U, 40, 3, k === 'normal');
    if (k === 'god') { for (let i = 0; i < 3; i++) S.rings.push({ x, y, r: 20 + i * 20, v: (14 - i * 3) * U, a: 1, c: i ? c : '#ffffff' }); sburst(S, x, y, 120, [c, '#fff1b0', '#ffffff'], 11 * U, 60, 3.5); }
  }
  S.parts.forEach(p => { p.x += p.vx; p.y += p.vy; p.vx *= p.drag; p.vy = p.vy * p.drag + p.grav; p.life--; }); S.parts = S.parts.filter(p => p.life > 0);
  S.rings.forEach(r => { r.r += r.v; r.v *= .96; r.a *= .94; }); S.rings = S.rings.filter(r => r.a > .03);
  S.shake *= .85; S.flash *= .88;
}
function aceTick(S) {
  const t = S.t, x = S.x, y = S.y, U = S.U, c = S.c, L = S.L, F = S.fx || {}, T = S.T || ACE, sky = { x, y: Math.max(30, y - (F.big ? 230 : 140) * U) };
  S.dark = F.dark ? (t < L + 500 ? Math.min(S.tone === 'abyss' ? .92 : .78, t / 500) : S.dark * .985) : 0;
  S.bars = F.bars ? (t < L + 600 ? Math.min(1, t / 400) : Math.max(0, 1 - (t - L - 600) / 400)) : 0;
  const c2 = S.tone === 'holy' ? '#ffd96a' : '#ffffff';
  // リリースした素材：光の粒になって天へ昇る
  S.mats.forEach(m => {
    m.a = Math.max(0, 1 - t / 700); m.s = 1 + .15 * (t / 700);
    if (t < 700) for (let i = 0; i < 5; i++) SP(S, { x: m.x + (Math.random() - .5) * m.w, y: m.y + (Math.random() - .5) * m.h, vx: (sky.x - m.x) * .022 + (Math.random() - .5), vy: (sky.y - m.y) * .022, life: 50, sz: 2.6, c: Math.random() < .5 ? c : '#ffffff', drag: .985 });
  });
  // 墓地（除外）から：魂が置き場から抜け出して上空へ昇る
  if (S.soul && t < T.drop) { const p = ease(t / T.drop), sx = lerp(S.soul.x, x, p), sy = lerp(S.soul.y, sky.y, p) - Math.sin(p * Math.PI) * 40 * U; S.soul.cx = sx; S.soul.cy = sy; for (let i = 0; i < 4; i++) SP(S, { x: sx + (Math.random() - .5) * S.w * .6, y: sy + (Math.random() - .5) * S.h * .5, vx: (Math.random() - .5) * .8, vy: .6 + Math.random(), life: 36, sz: 2.6, c: Math.random() < .5 ? c : '#ffffff', drag: .97 }); }
  // 魔法陣から光が立ちのぼる
  if (F.circle && t > T.circle && t < L) for (let q = 0; q < 5; q++) { const a = Math.random() * TAU, r = (60 + Math.random() * 50) * U; SP(S, { x: x + Math.cos(a) * r, y: y + S.h * .35 + Math.sin(a) * r * .32, vx: 0, vy: -2.5 - Math.random() * 3, life: 34, sz: 2.8, c: Math.random() < .5 ? c : '#ffffff', drag: .99, grav: -.02 }); }
  // 天から光が降り注ぐ
  if (F.pillar && t > T.pillar && t < L) for (let g = 0; g < 6; g++) SP(S, { x: x + (Math.random() - .5) * 70 * U, y: sky.y - 40, vx: 0, vy: 7 + Math.random() * 5, life: 40, sz: 2.2, c: Math.random() < .5 ? c : c2, drag: 1 });
  S.quake = F.shake && t > T.pillar && t < L ? 1.5 : 0;
  // 着地の瞬間：大きな衝撃波と地割れ
  if (!S.aceHit && t >= L) {
    S.aceHit = true;
    for (let i = 0; i < 3; i++) S.rings.push({ x, y: y + S.h / 2 - 4, r: S.w * .5 + i * 14, v: (15 - i * 3) * U, a: 1, c: i ? c : '#ffffff' });
    sburst(S, x, y, F.big ? 90 : 50, [c, c2, '#fff1b0'], (F.big ? 11 : 7) * U, 55, 3.4);
    if (!F.shake) return; // 揺れを使わない分類（エース）は地割れなし
    S.cracks = []; for (let i = 0; i < 9; i++) { const a = Math.random() * TAU, pts = [[x, y + S.h * .45]]; let px = x, py = y + S.h * .45; for (let j = 0; j < 4; j++) { const aa = a + (Math.random() - .5) * .7; px += Math.cos(aa) * 26 * U; py += Math.sin(aa) * 9 * U; pts.push([px, py]); } S.cracks.push(pts); }
  }
}
/* 相棒：ゆれない・あたたかい色。光の粒がゆっくり集まって、カードが光の中から浮かび上がり、そっと降りる */
/** 相棒の「手元」：自分の側なら画面の下（手札・ボタンの上）、CPUの側なら上の帯の下。横は相棒のマスの真下 */
function partnerHome(S) { const sf = S.safe || { top: 0, bottom: H }; const low = S.y > (clipR ? clipR.top + clipR.height / 2 : H / 2); return { x: S.x, y: low ? Math.min(H - 10, sf.bottom) : Math.max(10, sf.top) }; }
function partnerTick(S) {
  const t = S.t, U = S.U, c = S.c, L = S.L;
  if (!S.home) { S.home = partnerHome(S); S.stage = { x: S.x, y: lerp(S.home.y, S.y, .45) }; }
  const P = S.home, C = S.stage;
  S.dark = t < L + 300 ? Math.min(.35, t / 500) : S.dark * .985;
  S.bars = 0;
  S.mats.forEach(m => { m.a = Math.max(0, 1 - t / 500); });
  // 手元から立ちのぼる光の粒
  if (t < L) { const head = lerp(P.y, C.y, ease(Math.min(1, t / PARTNER.beam))); for (let q = 0; q < 3; q++) SP(S, { x: P.x + (Math.random() - .5) * 46 * U, y: lerp(P.y, head, Math.random()), vx: (Math.random() - .5) * .4, vy: -1.5 - Math.random() * 2, life: 30, sz: 2.6, c: q % 2 ? c : '#fff3d6', drag: .98 }); }
  // 着地：相棒のマスと手元が、いっしょに光る（一緒に戦う絆）
  if (!S.bondHit && t >= L) { S.bondHit = true; S.rings.push({ x: P.x, y: P.y - 6, r: 24 * U, v: 4 * U, a: 1, c }); S.rings.push({ x: S.x, y: S.y + S.h / 2 - 4, r: S.w * .45, v: 5 * U, a: 1, c: '#fff3d6' }); sburst(S, S.x, S.y, 40, [c, '#fff3d6'], 6 * U, 45, 3, true); }
}
function fusionTick(S) {
  const t = S.t, C = S.C, U = S.U, n = Math.max(1, S.mats.length), R0 = 115 * U;
  S.mats.forEach((m, i) => {
    const a0 = i / n * TAU - Math.PI / 2;
    if (t < FU.gather) {
      // 手札・フィールドから浮き上がって、渦のふちへ
      const p = ease(t / FU.gather);
      m.dx = lerp(m.x, C.x + Math.cos(a0) * R0, p); m.dy = lerp(m.y, C.y + Math.sin(a0) * R0 * .55, p) - Math.sin(p * Math.PI) * 30 * U;
      m.s = 1 + .1 * p; m.rot = 0; m.a = 1; m.mix = 0;
    } else if (t < FU.mix) {
      // 回りながら中心へ。回るほど速く、色が混ざっていく
      const p = (t - FU.gather) / (FU.mix - FU.gather), r = R0 * (1 - easeIn(p) * .94), ang = a0 + p * 4 + p * p * 16;
      m.dx = C.x + Math.cos(ang) * r; m.dy = C.y + Math.sin(ang) * r * .55; m.s = 1.1 - .65 * p; m.rot = (ang - a0) * .35; m.a = 1; m.mix = p;
      if (Math.random() < .9) SP(S, { x: m.dx, y: m.dy, vx: 0, vy: 0, life: 22, sz: 3.2, c: FU_COLS[(i + (t / 90 | 0)) % FU_COLS.length], drag: .9 });
    } else m.a = 0;
  });
  // 周りの光の粒が渦に吸い込まれる
  if (t > 250 && t < FU.mix) for (let q = 0; q < 7; q++) {
    const a = Math.random() * TAU, d = (150 + Math.random() * 90) * U, px = C.x + Math.cos(a) * d, py = C.y + Math.sin(a) * d * .55;
    SP(S, { x: px, y: py, vx: (C.x - px) * .035 - Math.sin(a) * 4, vy: (C.y - py) * .035 + Math.cos(a) * 2.2, life: 34, sz: 2.4, c: FU_COLS[q % FU_COLS.length], drag: .985 });
  }
  if (!S.mixed && t >= FU.mix) {
    S.mixed = true; S.flash = .85; S.shake = 14;
    for (let i = 0; i < 3; i++) S.rings.push({ x: C.x, y: C.y, r: 10 + i * 16, v: (12 - i * 3) * U, a: 1, c: i ? FU_COLS[i] : '#ffffff' });
    sburst(S, C.x, C.y, 110, FU_COLS, 10 * U, 50, 3.2);
  }
  S.dark = Math.min(.6, t / 500);
}
function sImg(S, img, x, y, s, a, sx) { ctx.save(); ctx.translate(x, y); ctx.scale(s * (sx == null ? 1 : sx), s); ctx.globalAlpha = Math.max(0, Math.min(1, a)); ctx.drawImage(img, -S.w / 2, -S.h / 2, S.w, S.h); ctx.restore(); }
/** 名前の帯の高さ：盤面のうち、手札・ボタン・チェーンの欄に隠れていない所（safe）の、出てきたカードと反対側の半分の真ん中 */
function plateY(S) {
  let top = clipR ? clipR.top : 0, bot = clipR ? clipR.bottom : H;
  if (S.safe) { top = Math.max(top, S.safe.top); bot = Math.min(bot, S.safe.bottom); }
  top = Math.max(top, 30); bot = Math.min(bot, H - 30);
  if (bot - top < 80) return (top + bot) / 2;
  const mid = (top + bot) / 2;
  return S.y > mid ? (top + mid) / 2 : (mid + bot) / 2;
}
/** 二重の魔法陣（回る輪と星形）。start から広がる */
function aceCircle(S, start) {
  const t = S.t, x = S.x, y = S.y, U = S.U, c = S.c, L = S.L;
    const cy = y + S.h * .35, o = Math.min(1, Math.max(0, (t - start) / 450)), fa = t > L + 300 ? Math.max(0, 1 - (t - L - 300) / 500) : 1;
    if (o > 0 && fa > 0) {
      // 二重の魔法陣（回る輪と星形）
      ctx.save(); ctx.translate(x, cy); ctx.scale(1, .32); ctx.rotate(t / 900); ctx.strokeStyle = hexA(c, .95 * fa);
      const R1 = 120 * o * U, R2 = 100 * o * U, R3 = 70 * o * U;
      ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, R1, 0, TAU); ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, R2, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, R3, 0, TAU); ctx.stroke();
      ctx.beginPath(); for (let j = 0; j <= 5; j++) { const a = j * 2 / 5 * TAU - 1.57; ctx.lineTo(Math.cos(a) * R2, Math.sin(a) * R2); } ctx.stroke();
      for (let j = 0; j < 12; j++) { const a = j / 12 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * R2, Math.sin(a) * R2); ctx.lineTo(Math.cos(a) * R1, Math.sin(a) * R1); ctx.stroke(); }
      ctx.restore(); glow(x, cy, 110 * o * U, c, .55 * fa);
    }
}
function summonDraw(S) {
  const t = S.t, k = S.how, c = S.c, x = S.x, y = S.y, L = S.L, U = S.U, sh = S.shake + S.quake;
  const dpr = cv.width / W; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H); ctx.save();
  ctx.translate((Math.random() - .5) * sh, (Math.random() - .5) * sh);
  // 暗転：マットの柄が出ている間は、盤面の上は暗くしない（柄が地の代わり）
  if (S.dark > .01) { ctx.fillStyle = S.tone === 'holy' ? `rgba(255,248,228,${S.dark * .5})` : `rgba(0,0,0,${S.dark * (S.tone === 'abyss' ? .82 : .6)})`; ctx.beginPath(); ctx.rect(-30, -30, W + 60, H + 60); if (S.mat && sumMatAlpha(S) > .5) rr(ctx, S.mat.ox, S.mat.oy, S.mat.w, S.mat.h, 14); ctx.fill('evenodd'); }
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
  if (k === 'ace' || k === 'god') {
    const F = S.fx || {}, T = S.T || ACE;
    if (F.circle) aceCircle(S, k === 'god' ? 600 : T.circle);
    if (k === 'ace' && F.pillar && t > T.pillar && t < L + 500) {
      const pa = Math.min(1, (t - T.pillar) / 300) * (t > L ? Math.max(0, 1 - (t - L) / 500) : 1), pw = 70 * U, gr = ctx.createLinearGradient(x - pw, 0, x + pw, 0);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.5, hexA(c, .65 * pa)); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.fillRect(x - pw, -20, pw * 2, y + S.h);
      ctx.fillStyle = `rgba(255,255,255,${.5 * pa})`; ctx.fillRect(x - 6 * U, -20, 12 * U, y + S.h);
    }
  }
  if (k === 'fusion' && t < FU.born + 500) {
    const C = S.C, fa = Math.min(1, t / 350) * (t > FU.mix ? Math.max(0, 1 - (t - FU.mix) / 500) : 1);
    const p = Math.min(1, t / FU.mix), spin = t / 1000 * (2 + p * 9);
    for (let v = 0; v < 6; v++) {
      ctx.strokeStyle = FU_COLS[v]; ctx.globalAlpha = fa * .65; ctx.lineWidth = (5 - v * .5) * U; ctx.beginPath();
      for (let a = 0; a < TAU * 1.6; a += .1) { const r3 = (10 + a * 15) * U * (1 - p * .25), ang = a + spin + v / 6 * TAU; const xx = C.x + Math.cos(ang) * r3, yy = C.y + Math.sin(ang) * r3 * .55; if (a) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1; glow(C.x, C.y, (60 + 60 * p) * U, '#c9a7ff', .8 * fa); glow(C.x, C.y, 26 * U * (1 + p), '#ffffff', fa);
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
  S.mats.forEach((m, i) => {
    if (m.a <= 0) return;
    ctx.save(); ctx.translate(m.dx ?? m.x, m.dy ?? m.y); ctx.rotate(m.rot || 0); ctx.scale(m.s, m.s); ctx.globalAlpha = m.a; ctx.drawImage(m.img, -m.w / 2, -m.h / 2, m.w, m.h);
    // 混ざっていく：カードが渦の色に染まって光る
    if (m.mix) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = m.mix * .75; ctx.fillStyle = FU_COLS[(i * 2 + (S.t / 120 | 0)) % FU_COLS.length]; ctx.fillRect(-m.w / 2, -m.h / 2, m.w, m.h); ctx.globalCompositeOperation = 'source-over'; }
    ctx.restore();
  });
  const img = S.img;
  // 着地した後は本物の盤面のカードが見えるので、演出のカードは描かない（2枚重なって見えないように）
  if (S.hit) { /* 描かない */ }
  else if (k === 'normal' || k === 'advance') { if (!(k === 'advance' && t < 300)) { const p = Math.min(1, t / L), s = 1 + 1.1 * (1 - easeIn(p)); sImg(S, img, x, y - 160 * U * (1 - easeIn(p)), s, Math.min(1, t / 150)); } }
  else if (k === 'set') { const p = Math.min(1, t / L); sImg(S, img, x - (1 - ease(p)) * 120 * U, y, 1, p); }
  else if (k === 'special') { if (t > 200) { const p = Math.min(1, (t - 200) / (L - 200)); ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, y + S.h / 2); ctx.clip(); sImg(S, img, x, y + S.h * (1 - ease(p)), 1, 1); ctx.restore(); } }
  else if (k === 'flip') {
    // No.14（ボスの報告：反転召喚の時にカードがずれる）：裏側守備表示のカードは盤面で横向き。演出も横向きの裏から始めて、裏返りながら縦に起き上がる
    const p = Math.min(1, t / L), sx = Math.cos(p * Math.PI), s = 1 + .15 * Math.sin(p * Math.PI);
    ctx.save(); ctx.translate(x, y - 10 * Math.sin(p * Math.PI)); if (S.fromDef) ctx.rotate(Math.PI / 2 * (1 - ease(p))); // 盤面の守備表示と同じ向き（右へ90度）から
    ctx.scale(s * Math.abs(sx), s); ctx.drawImage(sx > 0 ? backImg() : img, -S.w / 2, -S.h / 2, S.w, S.h); ctx.restore();
  }
  else if (k === 'ritual') { if (t > L * .5) { const p = Math.min(1, (t - L * .5) / (L * .5)); sImg(S, img, x, y - 40 * U * (1 - ease(p)), .6 + .4 * ease(p), p); } }
  else if (k === 'fusion') {
    const C = S.C;
    if (t > FU.mix && t <= FU.born + 250) { const p = Math.min(1, (t - FU.mix) / (FU.born + 250 - FU.mix)); sImg(S, img, C.x, C.y, .2 + 1.05 * ease(p), Math.min(1, p * 2)); }
    else if (t > FU.born + 250) { const p = Math.min(1, (t - FU.born - 250) / (L - FU.born - 250)); sImg(S, img, lerp(C.x, x, ease(p)), lerp(C.y, y, easeIn(p)), 1.25 - .25 * ease(p), 1); }
  }
  else if (k === 'ace') {
    const T = S.T || ACE, F = S.fx || {}, s0 = F.big ? 1.8 : 1.2, up = (F.big ? 230 : 140) * U;
    if (S.soul && t < T.drop && S.soul.cx != null) {
      // 墓地から抜け出した魂（半透明のカード）が上空へ
      const p = t / T.drop; ctx.globalCompositeOperation = 'lighter'; glow(S.soul.cx, S.soul.cy, 60 * U, c, .7); ctx.globalCompositeOperation = 'source-over';
      sImg(S, img, S.soul.cx, S.soul.cy, .7 + 1.1 * ease(p), .35 + .3 * Math.sin(p * Math.PI));
    }
    if (t > T.drop) {
      // 上空から降りてくる（大きく映す分類は、より上から大きく。残像つき）
      const p = Math.min(1, (t - T.drop) / (L - T.drop)), top = Math.max(30, y - up);
      for (let g = 3; g >= 1; g--) { const q = Math.max(0, p - g * .07); if (p < 1) sImg(S, img, x, lerp(top, y, easeIn(q)), s0 - (s0 - 1) * ease(q), .18 * (4 - g) / 4); }
      sImg(S, img, x, lerp(top, y, easeIn(p)), s0 - (s0 - 1) * ease(p), Math.min(1, p * 4));
    }
  }
  else if (k === 'partner') {
    const P = S.home, C = S.stage;
    if (P && C) {
      // 手元から立ちのぼる光の柱（相棒が出てくるまで伸び、着地のあとも少し残って、ゆっくり消える）
      const head = lerp(P.y, C.y, ease(Math.min(1, t / PARTNER.beam))), fa = t > L + 300 ? Math.max(0, 1 - (t - L - 300) / 900) : 1, pw = 42 * U;
      if (fa > 0) { ctx.globalCompositeOperation = 'lighter'; const gr = ctx.createLinearGradient(P.x - pw, 0, P.x + pw, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.5, hexA(c, .55 * fa)); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.fillRect(P.x - pw, Math.min(P.y, head), pw * 2, Math.abs(P.y - head)); glow(P.x, P.y, 60 * U, c, .7 * fa); ctx.globalCompositeOperation = 'source-over'; }
      // 着地のあと：手元と相棒が、絆の光の線でつながる
      if (t > L && t < L + 1200) { const k3 = Math.min(1, (t - L) / 250) * Math.max(0, 1 - (t - L - 600) / 600); ctx.globalCompositeOperation = 'lighter'; [[7 * U, .25], [2.4 * U, .9]].forEach(([lw, al]) => { ctx.strokeStyle = hexA(c, al * k3); ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.lineTo(x, y); ctx.stroke(); }); ctx.globalCompositeOperation = 'source-over'; }
      // 相棒：光の中で振り返るように（裏から表へくるりと）大きく映り、そのあと自分のマスへ降りる
      if (t > PARTNER.turn && t <= PARTNER.turnEnd) {
        const p = (t - PARTNER.turn) / (PARTNER.turnEnd - PARTNER.turn), a = Math.PI * (1 - ease(p)), sx = Math.abs(Math.cos(a));
        ctx.globalCompositeOperation = 'lighter'; glow(C.x, C.y, 110 * U, c, .7); ctx.globalCompositeOperation = 'source-over';
        sImg(S, a > Math.PI / 2 ? backImg() : img, C.x, C.y, 1.7, Math.min(1, p * 3), Math.max(.04, sx));
      } else if (t > PARTNER.turnEnd) {
        const p = Math.min(1, (t - PARTNER.turnEnd) / (L - PARTNER.turnEnd));
        sImg(S, img, lerp(C.x, x, ease(p)), lerp(C.y, y, ease(p)), 1.7 - .7 * ease(p), 1);
      }
    }
  }
  else if (k === 'god') { if (t > 1700) { const p = Math.min(1, (t - 1700) / (L - 1700)); sImg(S, img, x, y - 220 * (1 - easeIn(p)), 1.6 - .6 * ease(p), Math.min(1, p * 3)); } }
  if (k === 'ace' && S.cracks && t >= L) { ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, .8 - (t - L) / 900)})`; ctx.lineWidth = 2; S.cracks.forEach(pts => { ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke(); }); }
  if (t >= L && t < L + 500 && k !== 'set') { ctx.globalCompositeOperation = 'lighter'; glow(x, y, 130 * U, c, .5 * (1 - (t - L) / 500)); ctx.globalCompositeOperation = 'source-over'; }
  ctx.restore();
  if (S.flash > .01) { ctx.fillStyle = `rgba(255,255,255,${S.flash * .4})`; ctx.fillRect(0, 0, W, H); }
  if (k === 'ace' || k === 'partner') {
    const bh = 40 * S.bars;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh);
  }
  // 切り札の名前の帯：着地の少し前から、斜めに滑りこむ
  if (S.plate && t > S.plateAt && t < S.textEnd) {
    const k2 = Math.min(1, (t - S.plateAt) / 220), fo = textFade(S, t);
    // 盤面の外は切り取られるので、帯と文字は盤面の真ん中にそろえる（PCでは盤面が画面より狭い）
    const bl = clipR ? clipR.left : 0, bw = clipR ? clipR.width : W, cx = bl + bw / 2, yb = plateY(S);
    ctx.globalAlpha = k2 * fo; ctx.save(); ctx.translate((1 - k2) * -60, 0); ctx.transform(1, 0, -.2, 1, 0, 0);
    ctx.fillStyle = 'rgba(10,10,14,.88)'; ctx.fillRect(-40, yb - 26, W + 120, 52); ctx.fillStyle = S.c; ctx.fillRect(-40, yb - 26, W + 120, 3); ctx.fillRect(-40, yb + 23, W + 120, 3);
    ctx.restore(); ctx.textAlign = 'center'; ctx.fillStyle = S.c; ctx.font = '700 11px sans-serif';
    const head = `${S.plate.side ? `${S.plate.side}の` : ''}${S.plate.label}`, info = S.d.level != null ? `　★${S.d.level} ${S.d.attribute || ''}属性 ${S.d.race || ''}` : '';
    const hl = `― ${head} ―${info}`; let hz = 11; while (hz > 9 && ctx.measureText(hl).width > bw - 16) { hz -= 1; ctx.font = `700 ${hz}px sans-serif`; }
    ctx.fillText(fitText(ctx, hl, bw - 16), cx, yb - 8);
    // カード名と攻撃力：幅に収まらない時は、まず文字を小さくして（11pxまで）、それでも入らない時だけ「…」で切る
    const line = `${S.d.name}　${S.pos === 'def' ? `DEF ${S.def}` : `ATK ${S.atk}`}`;
    let fz = Math.min(22, Math.max(14, bw / 22)); ctx.font = `700 ${fz}px sans-serif`;
    while (fz > 11 && ctx.measureText(line).width > bw - 16) { fz -= 1; ctx.font = `700 ${fz}px sans-serif`; }
    ctx.fillStyle = '#fff'; ctx.fillText(fitText(ctx, line, bw - 16), cx, yb + 15); ctx.textAlign = 'left'; ctx.globalAlpha = 1;
  }
  // 短い演出：着地した後、カードの上に小さい札「★エース」
  if (S.chip && t >= S.chipAt && t < S.textEnd) {
    const a = Math.min(1, (t - S.chipAt) / 150) * textFade(S, t), fs = Math.max(12, Math.min(15, S.w * .18));
    ctx.font = `700 ${fs}px sans-serif`; const tw = ctx.measureText(S.chip.label).width + 14, bx = x - tw / 2, by = y - S.h / 2 - fs - 12 - 6 * ease(Math.min(1, (t - S.chipAt) / 250));
    ctx.globalAlpha = a; rr(ctx, bx, by, tw, fs + 8, (fs + 8) / 2); ctx.fillStyle = 'rgba(10,10,14,.85)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = S.chip.c; ctx.stroke();
    ctx.fillStyle = S.chip.c; ctx.textAlign = 'center'; ctx.fillText(S.chip.label, x, by + fs + 1); ctx.textAlign = 'left'; ctx.globalAlpha = 1;
  }
  if (k === 'god') {
    const bh = 44 * Math.min(1, t / 400) * (t > S.end - 400 ? Math.max(0, (S.end - t) / 400) : 1);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh);
    if (bh > 20) { ctx.fillStyle = '#fff1b0'; ctx.font = '700 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(godKind(S.d) ? '― 神 の 降 臨 ―' : '― 降 臨 ―', W / 2, bh - 16); ctx.textAlign = 'left'; }
  }
}
