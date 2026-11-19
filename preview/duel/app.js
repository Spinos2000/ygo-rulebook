// 対戦画面（第5段階：CPU対戦）。エンジンは ./engine/game.js、CPU は ./ai/cpu.js
// 画面の考え方：やることは画面下の「操作ドック」にまとめる。カードを押すと、PCは右の欄、スマホは下から出るシートに操作が出る。
import { idealThink, acesOf } from './ai/ideal.js';
import { lineFor } from './lines.js';
import { play, unlock, soundEnabled, setSoundEnabled } from './sound.js';
import { playBattle, playSummon, rarityOf } from './fx.js';
import { playSignature, sigKey } from './sig.js';
import {
  createGame, applyAction, legalActions, defOf, monstersOf, currentAtk, currentDef, PHASE_LABEL, tributesFor, setPool,
  actorOf, activatableList, whyIllegal,
} from './engine/game.js';
import { CARD_POOL } from './data/cardpool.js';
import { DECKS } from './data/decks.js';
import { SCRIPTS } from './cards/index.js';

// 画面の部品は、置き場所（Shadow DOM の中）から探す。boot() で決まる
let ROOT = document;
let OPTS = {};
const $ = s => ROOT.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

let S = null;          // 現在の状態
let history = [];      // 元に戻す用（自分が判断した場面だけ）
let selected = null;   // 選択中のカード uid
let pick = [];         // 選択中の答え（カード）
let sheet = null;      // スマホで開いているシート：'detail' | 'log' | null
let peek = false;      // 選択の途中でシートを閉じて盤面を見ている
let lastLp = [8000, 8000];
let trace = [];        // CPU の勝率の見積もりの記録（対戦後の振り返り用）：{ turn, rate, romance }
const CPU = 1;
const cpuMode = () => $('#mode').value === 'cpu';
const isCpu = p => cpuMode() && p === CPU;
const narrow = () => matchMedia('(max-width: 860px)').matches;
/** プレイヤーの呼び名：CPU対戦では「あなた」「CPU」 */
const NAME = p => (cpuMode() ? (p === 0 ? 'あなた' : 'CPU') : `P${p + 1}`);
let cpuTimer = null;

/* ---------- 効果音：ログに増えた行から、何が起きたかを読み取って鳴らす ---------- */
function kindOfName(name) {
  const d = Object.values(CARD_POOL).find(x => x.name === name);
  if (!d) return 'effect';
  if (d.kind === 'spell') return 'spell';
  if (d.kind === 'trap') return d.subtype === 'カウンター' ? 'counter' : 'trap';
  return 'effect';
}
function soundsFor(prev, next) {
  const lines = next.log.slice(prev.log.length).map(l => l.text);
  const out = [];
  const add = n => { if (!out.includes(n)) out.push(n); };
  for (const t of lines) {
    const nm = (t.match(/「([^」]+)」/) || [])[1];
    if (/の勝利/.test(t)) add(cpuMode() ? (next.winner === 0 ? 'win' : 'lose') : 'win');
    else if (/を無効にした/.test(t)) add('negate');
    else if (/の効果を発動（チェーン/.test(t)) add(kindOfName(nm) === 'effect' ? 'effect' : kindOfName(nm));
    else if (/を発動（チェーン/.test(t)) add(kindOfName(nm));
    else if (/を儀式召喚/.test(t)) add('ritual');
    else if (/を融合召喚/.test(t)) add('fusion');
    else if (/を特殊召喚/.test(t)) add('special');
    else if (/を(通常|アドバンス|反転)召喚する/.test(t)) add('summon');
    else if (/をセット$/.test(t)) add('set');
    else if (/ダイレクトアタック$|に攻撃$/.test(t)) add('attack');
    else if (/の(戦闘|効果)ダメージ/.test(t)) add('damage');
    else if (/を破壊/.test(t)) add('destroy');
    else if (/：ドロー$/.test(t)) add('draw');
  }
  return out;
}
/** 状態を進めて、起きたことに合わせて効果音を鳴らし、攻撃があれば演出を再生する */
function commit(next) {
  const prev = S;
  S = next;
  if (prev) play(soundsFor(prev, next));
  if (prev) queueBattleFx(prev, next);
  if (prev) queueMoves(prev, next);
}

/* ---------- 攻撃の演出：演出の間は画面の更新とCPUの手番を止め、終わったら続ける ---------- */
let fxN = 0;   // 再生中の演出の数（0 になった時だけ画面を更新する。演出が重なっても途中で描き直さない）
const fxMode = () => ($('#fxMode') && $('#fxMode').value) || 'full';
let pendingSummons = [];   // 画面を更新した後に再生する召喚の演出
function queueBattleFx(prev, next) {
  if (fxMode() === 'none' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const fresh = (next.anim || []).filter(x => x.seq > (prev.animSeq ?? 0));
  if (!fresh.length) return;
  // 融合・儀式の素材：召喚の前に墓地へ送られるので、元の場所（手札・場）を覚えておき、いつもの移動の演出はしない
  for (const u of next.animMats || []) {
    if (matRects.has(u)) continue;
    const el = ROOT.querySelector(`#board [data-uid="${u}"], #hand0 [data-uid="${u}"], #hand1 [data-uid="${u}"]`);
    if (el) { matRects.set(u, el.getBoundingClientRect()); sigSkip.add(u); }
  }
  // 攻撃：まだ画面に残っている前の状態の盤面（カードの位置）で再生する
  const battles = fresh.filter(x => x.kind === 'battle').map(x => { const j = battleInfo(prev, next, x); if (j) j.seq = x.seq; return j; }).filter(Boolean);
  // カードごとの専用演出（ブラック・ホールなど）：これも前の状態の盤面で再生する
  const sigs = fresh.filter(x => x.kind === 'resolve').map(x => sigInfo(prev, next, x, fresh)).filter(Boolean);
  sigs.forEach(j => j.skip.forEach(u => sigSkip.add(u)));
  const jobs = [...battles, ...sigs].sort((p, q) => p.seq - q.seq);
  // 召喚：素材のカードの位置は今のうちに覚えておき、召喚されたカードの位置は画面を更新してから調べる
  pendingSummons.push(...fresh.filter(x => x.kind === 'summon').map(x => summonInfo(prev, next, x)).filter(Boolean));
  pendingSummons.push(...fresh.filter(x => x.kind === 'search' && isCpu(x.player)).map(x => ({ search: true, uid: x.uid, p: x.player, d: defOf(next, x.uid) })));
  for (const p of [0, 1]) {
    const gone = fresh.filter(x => x.kind === 'discard' && x.player === p && !fanDoneUids.has(x.uid)).map(x => x.uid);
    if (!gone.length) continue;
    // 同じ処理の中でドローしてすぐ捨てたカードも、手札の中に入れて見せる
    const hand0 = [...new Set([...prev.players[p].hand, ...gone])];
    const hand = sortsHand(p) ? sortHand(next, hand0) : hand0;
    pendingSummons.push({ handOpen: true, p, gone, hand, faces: !isCpu(p), ds: Object.fromEntries(hand.map(u => [u, defOf(next, u)])) });
    gone.forEach(u => sigSkip.add(u));
  }
  if (!jobs.length) return;
  fxN++;
  (async () => {
    for (const j of jobs) {
      const hide = j.hide.map(el => { el.style.visibility = 'hidden'; return el; });
      const brd = j.sig ? ROOT.querySelector('#board') : null; if (brd) brd.classList.add('skin-on');
      try { await (j.sig ? playSignature(ROOT, j.info) : playBattle(ROOT, j.info)); } catch (e) { console.error(e); }
      if (brd) brd.classList.remove('skin-on');
      hide.forEach(el => { el.style.visibility = ''; });
    }
    fxN = Math.max(0, fxN - 1);
    render();
  })();
}
function summonInfo(prev, next, x) {
  const c = next.cards[x.uid];
  if (!c || !['mzone', 'emz'].includes(c.zone)) return null;
  // 相手の裏側のカードは中身を見せない
  const faceDown = !c.faceUp || x.how === 'set';
  const mats = (x.mats || []).map(u => {
    const pc = prev.cards[u];
    if (!pc) return null;
    // 場・手札にあればそのカード、無ければ（デッキ・EXなど）その置き場から。裏向きでも素材にしたカードは表を見せる
    const el = ROOT.querySelector(`#board [data-uid="${u}"], #hand0 [data-uid="${u}"], #hand1 [data-uid="${u}"]`) || pileEl(pc.owner, pc.zone);
    const saved = matRects.get(u); matRects.delete(u);
    if (!el && !saved) return null;
    return { rect: saved || el.getBoundingClientRect(), d: defOf(prev, u), atk: currentAtk(prev, u), def: currentDef(prev, u) };
  }).filter(Boolean);
  // 墓地・除外から特殊召喚した時は、その置き場の位置も渡す（そこから魂が昇る）
  const pc = prev.cards[x.uid], fromEl = pc && (x.from === 'gy' || x.from === 'banished') ? pileEl(pc.owner, x.from) : null;
  return { uid: x.uid, how: x.how, faceDown: faceDown && x.how !== 'flip', d: defOf(next, x.uid), mats, from: x.from, fromRect: fromEl ? fromEl.getBoundingClientRect() : null };
}
/** 画面を更新した後：召喚されたカードの場所で、召喚の演出を順に再生する */
function playPendingSummons() {
  if (!pendingSummons.length || (fxN > 0)) return false;
  const jobs = pendingSummons; pendingSummons = [];
  fxN++;
  (async () => {
    for (const j of jobs) {
      if (j.search) { try { await cpuSearchFx(j); } catch (e) { console.error(e); } continue; }
      if (j.handOpen) { try { await handOpenFx(j); } catch (e) { console.error(e); } continue; }
      if (j.handAdd) { try { await handAddFx(j); } catch (e) { console.error(e); } continue; }
      const el = ROOT.querySelector(`#board [data-uid="${j.uid}"]`);
      if (!el) continue;
      el.style.visibility = 'hidden';
      const flipFace = j.how === 'flip';
      try {
        await playSummon(ROOT, { rect: el.getBoundingClientRect(), track: () => el.isConnected ? el.getBoundingClientRect() : null, onLand: () => { el.style.visibility = ''; }, d: j.d, atk: currentAtk(S, j.uid), def: currentDef(S, j.uid), how: j.how, faceDown: j.faceDown || flipFace ? (flipFace ? true : j.faceDown) : false, mats: j.mats, from: j.from, fromRect: j.fromRect, mat: matCanvas(), speed: fxMode() === 'short' ? 2 : 1 });
      } catch (e) { console.error(e); }
      el.style.visibility = '';
    }
    fxN = Math.max(0, fxN - 1);
    render();
  })();
  return true;
}
/* ---------- カードごとの専用演出：発動したカード・破壊されるカード・盤面の位置を集める ---------- */
const sigSkip = new Set();
const matRects = new Map(); // 融合・儀式の素材が元あった場所（召喚の演出で、そこから渦へ集める）   // 専用演出で壊した（飛ばした）カード。いつもの移動の演出はしない
/** 盤面の地の柄を描くキャンバス（カードを置く枠より下） */
function matCanvas() {
  const b = ROOT.querySelector('#board'); if (!b) return null;
  let c = b.querySelector('.mat-skin');
  if (!c) { c = document.createElement('canvas'); c.className = 'mat-skin'; b.prepend(c); }
  return c;
}
function sigInfo(prev, next, x, fresh) {
  if (!x.act || !prev.cards[x.uid]) return null;
  const d = defOf(prev, x.uid), key = sigKey(d.name);
  if (!key) return null;
  const q = sel => ROOT.querySelector(sel);
  const elOf = u => q(`#board [data-uid="${u}"]`);
  const cardOf = u => {
    const el = elOf(u), c = prev.cards[u];
    if (!el || !c) return null;
    return { uid: u, el, rect: el.getBoundingClientRect(), d: defOf(prev, u), atk: currentAtk(prev, u), def: currentDef(prev, u),
      faceUp: !el.classList.contains('back'), defPos: c.position === 'def' && (c.zone === 'mzone' || c.zone === 'emz') };
  };
  const center = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const p = x.player, me = p === 0, boardEl = q('#board');
  if (!boardEl) return null;
  const br = boardEl.getBoundingClientRect(), mid = q('#board .row.r2');
  const rowY = cls => { const r = q(`#board .row.${cls}`); return r ? center(r).y : br.top + br.height / 2; };
  const board = { left: br.left, top: br.top, right: br.right, bottom: br.bottom, cx: br.left + br.width / 2, cy: mid ? center(mid).y : br.top + br.height / 2,
    myMonY: rowY(me ? 'r3' : 'r1'), oppMonY: rowY(me ? 'r1' : 'r3'), myStY: rowY(me ? 'r4' : 'r0') };
  const fieldMons = [0, 1].flatMap(pp => prev.players[pp].mzone).concat(prev.emz).filter(u => u !== null && u !== undefined);
  const destU = fresh.filter(y => y.kind === 'destroy' && y.src === x.uid).map(y => y.uid);
  const dest = destU.map(cardOf).filter(Boolean);
  const self = cardOf(x.uid);
  if (self) self.faceUp = true; // セットしていたカードも、発動したら表を見せる
  const att = key === 'mirror' && prev.battle ? cardOf(prev.battle.attacker) : null;
  const tgtU = (x.targets || [])[0];
  const target = tgtU !== undefined ? cardOf(tgtU) : null;
  const tgtOwner = tgtU !== undefined && prev.cards[tgtU] ? prev.cards[tgtU].owner : p;
  const mons = fieldMons.map(cardOf).filter(Boolean);
  const opp = mons.filter(c => prev.cards[c.uid].controller !== p);
  const traps = [0, 1].flatMap(pp => prev.players[pp].szone).filter(u => u !== null && u !== x.uid && (!prev.cards[u].faceUp || defOf(prev, u).kind === 'trap')).map(cardOf).filter(Boolean);
  // 強欲な壺：ドローしたカードは壺から飛ばすので、いつもの移動はしない
  const drawn = next.players[p].hand.filter(u => prev.cards[u] && prev.cards[u].zone === 'deck');
  const skip = [...dest.map(c => c.uid), ...(key === 'greed' ? drawn : [])];
  // 蘇生などで呼び出したモンスターが降りる場所（今の盤面の、そのマス）
  let land = null;
  const nt = tgtU !== undefined ? next.cards[tgtU] : null;
  if (nt && nt.zone === 'mzone' && nt.index !== null) {
    const nth = nt.controller === 0 ? nt.index + 2 : 6 - nt.index;
    land = center(q(`#board .row.${nt.controller === 0 ? 'r3' : 'r1'} > :nth-child(${nth})`));
  }
  return {
    sig: true, seq: x.seq, skip,
    hide: [self, ...dest, att].filter(Boolean).map(c => c.el),
    info: { key, name: d.name, kind: d.kind, subtype: d.subtype, me, speed: fxMode() === 'short' ? 2 : 1, board, mat: matCanvas(),
      self, dest, att, target, opp, mons, traps, drawn: drawn.length, land,
      deck: center(pileEl(p, 'deck')), gy: center(pileEl(tgtOwner, 'gy')), hand: center(q(`#hand${p}`)) },
  };
}
function battleInfo(prev, next, x) {
  const elOf = uid => ROOT.querySelector(`#board [data-uid="${uid}"]`);
  const aEl = elOf(x.attacker);
  if (!aEl || !prev.cards[x.attacker]) return null;
  const stats = uid => ({ atk: currentAtk(prev, uid), def: currentDef(prev, uid) });
  const atkP = prev.cards[x.attacker].controller, defP = 1 - atkP;
  const a = { rect: aEl.getBoundingClientRect(), d: defOf(next, x.attacker), ...stats(x.attacker) };
  let t, tEl = null;
  if (x.target === null) {
    // スマホではLPの帯が上にまとまっているので、盤面のすぐ外（自分なら下、相手なら上）をねらう
    const b = $('#board').getBoundingClientRect();
    t = { rect: narrow() ? { left: b.left + b.width * .25, width: b.width * .5, top: defP === 0 ? b.bottom + 6 : b.top - 66, height: 60, right: b.left + b.width * .75, bottom: defP === 0 ? b.bottom + 66 : b.top - 6 } : $(`#side${defP}`).getBoundingClientRect() };
  } else {
    tEl = elOf(x.target);
    if (!tEl) return null;
    t = { rect: tEl.getBoundingClientRect(), d: defOf(next, x.target), ...stats(x.target) };
  }
  const dmg = x.damage.reduce((m, d) => Math.max(m, d.amount), 0);
  const hurt = x.damage.length ? x.damage[0].player : defP;
  const r = hurt === atkP ? a.rect : t.rect;
  return {
    hide: [aEl, tEl].filter(Boolean),
    info: { a, t, destroyed: { a: x.destroyed.includes(x.attacker), t: x.target !== null && x.destroyed.includes(x.target) }, dmg, dmgAt: { x: r.left + r.width / 2 + 40, y: r.top + 10 }, speed: fxMode() === 'short' ? 2 : 1 },
  };
}

/* ---------- CPU の手番（速さはメニューで選べる） ---------- */
const SPEED = { slow: 1700, normal: 1000, fast: 450 };
function cpuDelay() {
  const base = SPEED[$('#cpuSpeed').value] ?? SPEED.normal;
  if (S.pending) return base * 0.6;                       // 対象やカードを選ぶ
  if (S.window.kind === 'priority') return base * 0.7;    // 応答するかどうか
  return base;                                            // 召喚・発動・攻撃・フェイズ移行
}
/* ---------- 理想のCPU：画面とは別の場所（Web Worker）で考える ---------- */
let worker = null, workerBroken = false, reqId = 0;
const waiting = new Map();
function getWorker() {
  if (worker || workerBroken) return worker;
  try {
    worker = new Worker(new URL('./ai/worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = e => { const w = waiting.get(e.data.id); if (w) { waiting.delete(e.data.id); w(e.data); } };
    worker.onerror = e => {
      console.warn('CPUの考える場所を作れませんでした。この画面の中で考えます', e);
      workerBroken = true; worker = null;
      for (const w of waiting.values()) w({ ok: false, retry: true });
      waiting.clear();
    };
  } catch (e) { console.warn(e); workerBroken = true; worker = null; }
  return worker;
}
const deckCodes = () => [$('#deck0').value, $('#deck1').value];
const deckNames = () => deckCodes().map(c => DECKS[c]?.name ?? '');
/** 今の状態で CPU の考えを出す（Worker が使えなければこの画面の中で） */
function think(state) {
  const local = () => new Promise(res => setTimeout(() => {
    try { res({ ok: true, thought: idealThink(state, { deckCodes: deckCodes() }, deckNames()) }); } catch (e) { res({ ok: false, error: e.message }); }
  }, 30));
  const w = getWorker();
  if (!w) return local();
  return new Promise(res => {
    const id = ++reqId;
    waiting.set(id, r => (r.retry ? local().then(res) : res(r)));
    try { w.postMessage({ id, state, deckNames: deckNames(), deckCodes: deckCodes() }); } catch { waiting.delete(id); local().then(res); }
  });
}
let thinking = null; // 考えている最中の状態（同じ状態で2回考えない）
function setThinking(on) { const el = $('#cpuThink'); if (el) el.hidden = !on; }
function scheduleCpu() {
  clearTimeout(cpuTimer);
  if (!S || S.winner !== null || !isCpu(actorOf(S))) return;
  if (thinking === S) return;
  // 考え終わった答えがあれば、考え直さずに指す（演出の後などで呼ばれ直した時）
  if (ready && ready.state === S) { const th = ready.th; cpuTimer = setTimeout(() => playCpu(S, th), cpuDelay() * 0.5); return; }
  const state = S, t0 = performance.now(), delay = cpuDelay();
  thinking = state;
  const showT = setTimeout(() => { if (thinking === state) setThinking(true); }, 450);
  think(state).then(r => {
    clearTimeout(showT);
    if (thinking === state) thinking = null;
    setThinking(false);
    if (S !== state || !S || S.winner !== null) return; // 考えている間に状態が変わった（元に戻す・新しいデュエルなど）
    if (!r.ok) { console.error(r.error); toast(`CPUのエラー：${r.error}`, true); return; }
    const th = r.thought;
    ready = { state, th };
    cpuTimer = setTimeout(() => playCpu(state, th), Math.max(0, delay - (performance.now() - t0)));
  });
}
let ready = null; // 考え終わった答え { state, th }
function playCpu(state, th) {
  if (S !== state) return;
  ready = null;
  let next;
  try { next = applyAction(S, th.action); } catch (e) { console.error(e); toast(`CPUのエラー：${e.message}`, true); return; }
  if (!state.pending && state.window.kind === 'open' && state.turnPlayer === CPU) trace.push({ turn: state.turn, rate: th.winRate, romance: th.romance });
  if (th.romance) speakRomance(state, next, th);
  commit(next);
  pick = [];
  render();
}

/* ---------- CPU の台詞 ---------- */
let speechT;
function speak(text, side = 'opp') {
  const el = $('#speech');
  if (!el || !text) return;
  el.querySelector('.speech-who').textContent = side === 'opp' ? NAME(CPU) : NAME(0);
  el.querySelector('.speech-text').textContent = text;
  el.dataset.side = side;
  el.hidden = true; void el.offsetWidth; el.hidden = false;
  clearTimeout(speechT);
  speechT = setTimeout(() => { el.hidden = true; }, 2900);
}
const cardNameOf = (s, u) => (u !== undefined && u !== null && s.cards[u] ? defOf(s, u).name : '');
/** p の表側の切り札（台詞の「迎え撃つ」用） */
function faceUpAce(s, p) {
  const aces = acesOf(s, p, deckNames()[p]);
  return monstersOf(s, p).find(u => s.cards[u].faceUp && aces.has(s.cards[u].code));
}
function speakRomance(prev, next, th) {
  const oppAce = faceUpAce(prev, 0);
  const kind = th.romance === 'ace' ? (oppAce !== undefined ? 'meet' : 'ace') : 'burst';
  speak(lineFor(deckCodes()[CPU], kind, { ace: cardNameOf(next, th.aceUid) || cardNameOf(prev, th.aceUid), opp: cardNameOf(prev, oppAce) }));
}
/** あなたが切り札を出した時、CPU が一言反応する */
function reactToAce(prev, next) {
  if (!cpuMode() || next.winner !== null) return;
  const aces = acesOf(next, 0, deckNames()[0]);
  const was = new Set(monstersOf(prev, 0).filter(u => prev.cards[u].faceUp).map(u => `${u}:${prev.cards[u].serial}`));
  const u = monstersOf(next, 0).find(x => next.cards[x].faceUp && aces.has(next.cards[x].code) && !was.has(`${x}:${next.cards[x].serial}`));
  if (u !== undefined) speak(lineFor(deckCodes()[CPU], 'react', { opp: cardNameOf(next, u) }));
}

/* ---------- 対戦後の振り返り：CPU から見た勝率の変化 ---------- */
function showReview() {
  const pts = trace.filter(x => Number.isFinite(x.rate));
  const box = $('#reviewBox');
  const head = '<div class="box-head"><h3 id="reviewTitle">勝率の振り返り（CPUから見た勝率）</h3><button class="btn small ghost" id="reviewClose">閉じる</button></div>';
  if (pts.length < 2) { box.innerHTML = head + '<p class="menu-note">記録が少ないため、グラフを描けません。</p>'; $('#reviewDlg').hidden = false; return; }
  const W = 600, H = 220, L = 38, R = 10, T = 12, B = 26;
  const x = i => L + (W - L - R) * (i / (pts.length - 1)), y = r => T + (H - T - B) * (1 - r);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.rate).toFixed(1)}`).join('');
  const area = `${line}L${x(pts.length - 1).toFixed(1)},${y(0)}L${x(0)},${y(0)}Z`;
  const turns = [...new Set(pts.map(p => p.turn))];
  const step = Math.ceil(turns.length / 8);
  const ticks = turns.filter((_, i) => i % step === 0).map(tn => { const i = pts.findIndex(p => p.turn === tn); return `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">T${tn}</text>`; }).join('');
  const roms = pts.map((p, i) => (p.romance ? `<circle class="rom" cx="${x(i)}" cy="${y(p.rate)}" r="5"><title>T${p.turn}：ロマンの手（勝率${Math.round(p.rate * 100)}%）</title></circle>` : '')).join('');
  const grid = [0, 0.25, 0.75, 1].map(r => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(r)}" y2="${y(r)}"/><text x="${L - 6}" y="${y(r) + 4}" text-anchor="end">${r * 100}%</text>`).join('');
  const svg = `<svg class="wr-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="CPUから見た勝率の変化">${grid}`
    + `<line class="half" x1="${L}" x2="${W - R}" y1="${y(0.5)}" y2="${y(0.5)}"/><text x="${L - 6}" y="${y(0.5) + 4}" text-anchor="end">50%</text>`
    + `<path class="area" d="${area}"/><path class="ln" d="${line}"/>${roms}${ticks}</svg>`;
  // 勝率が大きく動いた場面（勝負所）を3つ
  const swings = pts.slice(1).map((p, i) => ({ turn: p.turn, d: p.rate - pts[i].rate, from: pts[i].rate, to: p.rate }))
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 3).sort((a, b) => a.turn - b.turn);
  const pct = r => Math.round(r * 100) + '%';
  const list = swings.map(w => `<li>T${w.turn}：CPUの勝率 ${pct(w.from)} → <b>${pct(w.to)}</b>（${w.d > 0 ? 'CPUに有利' : 'あなたに有利'}になった場面）</li>`).join('');
  const nRom = pts.filter(p => p.romance).length;
  box.innerHTML = head + svg
    + '<p class="wr-note">● はCPUがロマンの手（切り札・大ダメージ）を選んだ場面。CPUは見えないカードを確率で推測して勝率を見積もっています。</p>'
    + `<h4>勝率が大きく動いた場面</h4><ol class="wr-list">${list}</ol><p class="wr-note">CPUがロマンを選んだ回数：${nRom}回</p>`;
  $('#reviewDlg').hidden = false;
}

/* ---------- 新しいデュエル ---------- */
function deckOptions() { return Object.values(DECKS).map(d => `<option value="${esc(d.code)}">${d.format ? (d.format.kind === 'ryu' ? '🌏 ' : '🏫 ') : ''}${esc(d.name)}</option>`).join(''); }
/** デッキ選びの下に、在校生／留学生・留学生の理由・数えるカードを出す */
function showDeckFmt() {
  for (const i of [0, 1]) {
    const box = $(`#deckFmt${i}`), d = DECKS[$(`#deck${i}`).value], f = d && d.format;
    if (!box) continue;
    if (!f) { box.innerHTML = ''; continue; }
    const ctr = f.ctr.map(k => k === 'mag' ? '魔力カウンター' : k);
    box.innerHTML = (f.kind === 'ryu' ? `<b class="ryu">🌏 留学生デッキ</b><small>理由：${esc(f.why.join('、'))}</small>` : '<b class="std">🏫 在校生デッキ</b>')
      + `<small>🔢 数えるカード：${ctr.length ? esc(ctr.join('、')) : 'なし'}</small>`;
  }
}
function newDuel() {
  // 選ばれているデッキが無い場合（読み込み直後など）は最初のデッキを使う
  const first = Object.values(DECKS)[0];
  const d0 = DECKS[$('#deck0').value] ?? first, d1 = DECKS[$('#deck1').value] ?? first;
  const f = $('#first').value;
  S = createGame({ pool: CARD_POOL, decks: [d0, d1], firstPlayer: f === 'r' ? undefined : Number(f) });
  history = []; selected = null; pick = []; sheet = null; peek = false; lastLp = [S.players[0].lp, S.players[1].lp]; trace = []; thinking = null;
  closeMenu();
  render();
}

/* ---------- 行動の実行 ---------- */
function run(action) {
  if (S.winner === null && isCpu(actorOf(S))) { toast('CPUが考えています'); return; }
  try {
    const next = applyAction(S, action);
    reactToAce(S, next);
    history.push(S); commit(next); pick = []; peek = false;
    // スマホでは、操作したらシートを閉じて盤面に戻る
    if (narrow() && sheet === 'detail') { sheet = null; selected = null; }
    if (selected !== null && !(S.cards[selected] && ['hand', 'mzone', 'emz', 'szone', 'fzone'].includes(S.cards[selected].zone))) selected = null;
    render();
  } catch (e) {
    toast(e && e.name === 'RuleError' ? `できません：${e.message}` : `エラー：${e.message}`, true);
    if (!(e && e.name === 'RuleError')) console.error(e);
  }
}
// CPU の行動は記録しないので、元に戻すと自分が前に判断した場面まで戻る
function undo() { if (!history.length) return; clearTimeout(cpuTimer); closeFan(); S = history.pop(); pick = []; render(); }

let toastT;
function toast(msg, bad) {
  const t = $('#toast'); t.textContent = msg; t.dataset.bad = bad ? '1' : ''; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3200);
}

/* ---------- カード表示 ---------- */
function frameOf(d) { return d.kind === 'spell' ? 'spell' : d.kind === 'trap' ? 'trap' : d.frame; }
let canAct = new Set();
function cardHtml(uid, { hidden = false, field = false, style = '' } = {}) {
  const c = S.cards[uid];
  const st = style ? ` style="${style}"` : '';
  const d = defOf(S, uid);
  const cls = [uid === selected ? 'sel' : '', field && c.position === 'def' ? 'def' : '', canAct.has(uid) ? 'can' : '', pick.includes(uid) ? 'picked' : ''].join(' ');
  const badge = [field ? counterHtml(uid) : '', c.equippedTo !== null ? '<span class="badge eq">装備</span>' : ''].join('');
  if (hidden || (!c.faceUp && !(c.zone === 'hand' || c.zone === 'extra' || c.zone === 'deck' || field))) return `<button class="card back ${cls}" data-uid="${uid}"${st} aria-label="裏側のカード">${badge}</button>`;
  if (!c.faceUp && field && isCpu(c.controller)) return `<button class="card back ${cls}" data-uid="${uid}"${st} aria-label="裏側のカード">${badge}</button>`;
  if (!c.faceUp && field) return `<button class="card back ${cls}" data-uid="${uid}"${st} aria-label="裏側：${esc(d.name)}"><span class="bn">${esc(d.name)}</span>${badge}</button>`;
  return `<button class="${faceCls(d)} ${cls}" data-uid="${uid}"${st} aria-label="${esc(d.name)}">${faceHtml(uid, d, field)}${badge}</button>`;
}
/* ---------- カウンター・ターン数：カードの上に、今いくつ／あと何ターンかを見て分かるように出す ---------- */
const MAGIC_MAX = { '熟練の黒魔術師': 3, 'サイレント・マジシャン LV４': 5, '漆黒のパワーストーン': 3 };
/** あるターンのターンプレイヤー */
const tpAt = t => (t % 2 === 1 ? S.firstPlayer : 1 - S.firstPlayer);
/** 今のターンから数えて、プレイヤー p の n 回目のスタンバイフェイズまでの自分のターン数（今がそのスタンバイ前なら今のターンも数える） */
function ownTurnsUntil(p, target) { let n = 0; for (let t = S.turn + 1; t <= target; t++) if (tpAt(t) === p) n++; return n; }
function counterHtml(uid) {
  const c = S.cards[uid], d = defOf(S, uid), k = c.counters || {}, out = [];
  // 魔力カウンター：最大数ぶんの玉を並べ、溜まった数だけ光らせる
  if (k.magic !== undefined || MAGIC_MAX[d.name]) {
    const n = k.magic ?? 0, max = Math.max(n, MAGIC_MAX[d.name] ?? n);
    if (max > 0) {
      const orbs = Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
      let note = '';
      // サイレント・マジシャン LV４：5つ溜まったら、次の自分のターンにLV８へ
      if (d.name === 'サイレント・マジシャン LV４' && n >= 5) note = '<small>→LV8</small>';
      out.push(`<span class="ctr magic${note ? ' ready' : ''}" title="魔力カウンター ${n}/${max}${note ? '（次の自分のターンでLV８に）' : ''}"><span class="orbs">${orbs}</span><b>${n}</b>${note}</span>`);
    }
  }
  // 光の護封剣：相手ターンで数えて3ターン目のエンドフェイズに破壊
  if (d.name === '光の護封剣' && c.faceUp) {
    const left = 3 - (k.swordTurns ?? 0);
    out.push(`<span class="ctr turns" title="相手のエンドフェイズであと${left}回で破壊">⚔<b>${left}</b><small>相手T</small></span>`);
  }
  // 未来融合：発動から2ターン後のスタンバイで素材を墓地へ、4ターン後のスタンバイで融合召喚
  if (d.name === '未来融合－フューチャー・フュージョン' && c.faceUp && k.ffTurn !== undefined) {
    const p = c.controller, t1 = k.ffTurn + 2, t2 = k.ffTurn + 4;
    if (S.turn < t1) { const n = ownTurnsUntil(p, t1); out.push(`<span class="ctr turns" title="あと${n}回目の自分のスタンバイで素材を墓地へ">⏳<b>${n}</b><small>素材</small></span>`); }
    else if (S.turn < t2) { const n = ownTurnsUntil(p, t2); out.push(`<span class="ctr turns ready" title="あと${n}回目の自分のスタンバイで融合召喚">⏳<b>${n}</b><small>融合</small></span>`); }
  }
  // 幽獄の時計塔：時計カウンター（4つ以上で戦闘ダメージを受けない）
  if (d.name === '幽獄の時計塔' && c.faceUp) {
    const n = k.clock ?? 0;
    out.push(`<span class="ctr turns${n >= 4 ? ' ready' : ''}" title="時計カウンター ${n}（4つ以上で戦闘ダメージを受けない）">🕰<b>${n}</b><small>時計</small></span>`);
  }
  return out.join('');
}
/** 封印の黄金櫃で除外したカード：除外の置き場に「あと何回目のスタンバイで手札に戻るか」 */
function sarcoHtml(p) {
  const ls = (S.lingering || []).filter(l => l.type === 'returnAtStandby' && l.player === p && S.cards[l.uid] && S.cards[l.uid].zone === 'banished');
  if (!ls.length) return '';
  const n = Math.min(...ls.map(l => l.turnsLeft ?? 1));
  return `<span class="ctr turns sarco" title="封印の黄金櫃：あと${n}回目の自分のスタンバイで手札へ">🔒<b>${n}</b><small>櫃</small></span>`;
}

/* ---------- カードの表面：カード名と属性／レベル（魔法・罠は種類）／種族の一文字／種族と種類／攻撃力・守備力 ---------- */
const ATTR_COLOR = { 闇: '#534ab7', 光: '#b8902a', 地: '#8a6a3a', 水: '#2f6fb0', 炎: '#c4473a', 風: '#2e8b57', 神: '#a9841f' };
const RACE_CHAR = { ドラゴン族: '竜', 魔法使い族: '魔', 機械族: '機', 戦士族: '戦', 悪魔族: '悪', 天使族: '天', アンデット族: '屍', 獣族: '獣', 獣戦士族: '獣', 鳥獣族: '鳥', 爬虫類族: '爬', 恐竜族: '恐', 水族: '水', 海竜族: '海', 魚族: '魚', 炎族: '炎', 雷族: '雷', 岩石族: '岩', 植物族: '植', 昆虫族: '虫', 幻神獣族: '神' };
const SPELL_MARK = { 通常: '✦', 速攻: '➶', 永続: '∞', 装備: '⚔', フィールド: '◈', 儀式: '✧' };
const TRAP_MARK = { 通常: '◆', 永続: '∞', カウンター: '↺' };
const FRAME_NAME = { normal: '通常', effect: '効果', ritual: '儀式', fusion: '融合' };
function faceHtml(uid, d, field) {
  // 初期のカードの配置：上にカード名と属性、レベルの星（魔法・罠は種類）、正方形のイラスト枠、下に種族の行と攻撃力・守備力
  const name = `<span class="n">${esc(d.name)}</span>`;
  if (d.kind !== 'monster') {
    const spell = d.kind === 'spell';
    const at = `<b class="at" style="background:${spell ? '#0f6e56' : '#993556'}">${spell ? '魔' : '罠'}</b>`;
    const mark = (spell ? SPELL_MARK : TRAP_MARK)[d.subtype] || (spell ? '✦' : '◆');
    const text = String(d.text || '').replace(/^[①-⑳]：/, '').replace(/\s+/g, '');
    return `<span class="top">${name}${at}</span><span class="sp">【${spell ? '魔法' : '罠'}カード】${esc(mark)}</span><span class="art" style="--atc:${spell ? '#14d6a8' : '#ff4fae'}">${mark}</span>`
      + `<span class="tb"><b>${esc(text.slice(0, 24))}</b><span class="kd">${esc(d.subtype)}${spell ? '魔法' : '罠'}</span></span>`;
  }
  const at = `<b class="at" style="background:${ATTR_COLOR[d.attribute] || '#6a6e7e'}">${esc(d.attribute || '？')}</b>`;
  const lvl = Math.min(12, d.level ?? 0);
  const race = d.race || '';
  const ch = RACE_CHAR[race] || race.charAt(0) || '？';
  const kind = FRAME_NAME[d.frame] || '効果';
  const atk = field ? currentAtk(S, uid) : d.atk, def = field ? currentDef(S, uid) : d.def;
  // フィールドで数値が上がっていれば緑、下がっていれば赤
  const cls = (now, base) => (!field || now === base ? '' : now > base ? ' class="up"' : ' class="dn"');
  return `<span class="top">${name}${at}</span><span class="lv">${'<i></i>'.repeat(lvl)}</span><span class="art" style="--atc:${ATTR_COLOR[d.attribute] || '#6a6e7e'}">${esc(ch)}</span>`
    + `<span class="tb"><b>【${esc(race)}／${kind}】</b><span class="ad"><span${cls(atk, d.atk)}><i>ATK/</i>${atk}</span><span${cls(def, d.def)}><i>DEF/</i>${def}</span></span></span>`;
}
/** カードの表側の class（種類の色とレア度） */
function faceCls(d) { return `card f-${frameOf(d)} r-${rarityOf(d)}`; }
function zone(uid, label, cls = '') {
  return `<div class="zone ${cls}">${uid !== null && uid !== undefined ? cardHtml(uid, { field: true }) : `<span class="zl">${label}</span>`}</div>`;
}
function pile(p, kind) {
  const list = S.players[p][kind];
  const label = { deck: 'デッキ', gy: '墓地', extra: 'EX', banished: '除外' }[kind];
  const top = list.length ? list[list.length - 1] : null;
  // 積み重なった厚み（6枚ごとに1段、最大7段）。下と右にカードの縁がのぞく
  const n = Math.min(7, Math.ceil(list.length / 6)), open = kind === 'gy' || kind === 'banished';
  const edges = Array.from({ length: n }, (_, k) => `${((k + 1) * .6).toFixed(1)}px ${((k + 1) * .9).toFixed(1)}px 0 ${open ? (k % 2 ? '#bdb5a3' : '#e6dfcf') : (k % 2 ? '#2a170a' : '#7a5634')}`);
  const stack = `box-shadow: ${[...edges, `${(n * .6 + 1).toFixed(1)}px ${(n * .9 + 2).toFixed(1)}px 4px rgba(0,0,0,.45)`].join(', ')}; translate: ${(-n * .3).toFixed(1)}px ${(-n * .45).toFixed(1)}px`;
  // 置き場のボタンの中にボタンは入れられない（ブラウザが外側のボタンを閉じてしまう）ので、一番上のカードは span にする
  const face = open && top !== null ? cardHtml(top, { style: stack }).replace(/^<button/, '<span').replace(/<\/button>$/, '</span>') : list.length ? `<span class="card back mini" style="${stack}"></span>` : '';
  return `<button class="zone pile" data-pile="${p}:${kind}" aria-label="${NAME(p)}の${label}（${list.length}枚）" title="長押しで一覧">${face}<span class="pl">${label}</span><span class="cnt">${list.length}</span>${kind === 'banished' ? sarcoHtml(p) : ''}</button>`;
}
function renderBoard() {
  const p1 = S.players[0], p2 = S.players[1];
  const emz = i => zone(S.emz[i], 'EX', 'emz');
  const rev = a => [...a].reverse();
  const rows = [
    pile(1, 'deck') + rev(p2.szone).map(u => zone(u, '魔・罠', 'st')).join('') + pile(1, 'extra'),
    pile(1, 'gy') + rev(p2.mzone).map(u => zone(u, 'モンスター', 'mz')).join('') + zone(p2.fzone, 'フィールド', 'fz'),
    `${pile(1, 'banished')}<div class="zone void"></div>${emz(0)}<div class="zone void"></div>${emz(1)}<div class="zone void"></div>${pile(0, 'banished')}`,
    zone(p1.fzone, 'フィールド', 'fz') + p1.mzone.map(u => zone(u, 'モンスター', 'mz')).join('') + pile(0, 'gy'),
    pile(0, 'extra') + p1.szone.map(u => zone(u, '魔・罠', 'st')).join('') + pile(0, 'deck'),
  ];
  $('#board').innerHTML = rows.map((r, i) => `<div class="row r${i}">${r}</div>`).join('');
}
/* ---------- 手札の並べ替え（自分の手札だけ。CPUの手札は並べ替えると種類が分かってしまうので、来た順のまま） ----------
 * モンスター（レベルの低い順）→ 儀式・特殊召喚系のモンスター → 魔法（通常・永続・装備・フィールド・儀式・速攻）→ 罠（通常・永続・カウンター）。
 * 同じ並びの中は、攻撃力の低い順 → 名前順 */
const SPELL_ORDER = { 通常: 0, 永続: 1, 装備: 2, フィールド: 3, 儀式: 4, 速攻: 5 };
const TRAP_ORDER = { 通常: 0, 永続: 1, カウンター: 2 };
function handKey(s, u) {
  const d = defOf(s, u), sc = SCRIPTS[s.cards[u].code] || {};
  if (d.kind === 'monster') {
    const special = d.frame === 'ritual' || d.frame === 'fusion' || !!sc.cannotNormalSummon;
    return [special ? 1 : 0, d.level ?? 0, d.atk ?? 0];
  }
  if (d.kind === 'spell') return [2, SPELL_ORDER[d.subtype] ?? 3, 0];
  return [3, TRAP_ORDER[d.subtype] ?? 1, 0];
}
function sortHand(s, uids) {
  return [...uids].sort((a, b) => {
    const x = handKey(s, a), y = handKey(s, b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return defOf(s, a).name.localeCompare(defOf(s, b).name, 'ja') || a - b;
  });
}
const sortsHand = p => !isCpu(p);
function renderHand(p) {
  const hide = cpuMode() ? p === CPU : $('#hideOpp').checked && p !== actorOf(S);
  const h = sortsHand(p) ? sortHand(S, S.players[p].hand) : S.players[p].hand;
  return h.length ? h.map(u => cardHtml(u, { hidden: hide })).join('') : '<span class="empty">手札なし</span>';
}
function renderSide() {
  [0, 1].forEach(p => {
    const el = $(`#side${p}`);
    const P = S.players[p];
    el.classList.toggle('acting', actorOf(S) === p && S.winner === null);
    el.querySelector('.who').textContent = NAME(p);
    const lp = el.querySelector('.lp');
    tweenLp(lp, p, P.lp);
    if (P.lp < lastLp[p]) { lp.classList.remove('hit'); void lp.offsetWidth; lp.classList.add('hit'); }
    else if (P.lp > lastLp[p]) lp.classList.remove('hit');
    lastLp[p] = P.lp;
    const tag = el.querySelector('.tag');
    tag.hidden = !(S.turnPlayer === p && S.winner === null);
    tag.textContent = 'ターン中';
    el.querySelector('.meta').textContent = `手札 ${P.hand.length}・デッキ ${P.deck.length}${S.turnPlayer === p && S.winner === null ? `・通常召喚 ${P.normalSummonUsed ? '済' : '未'}` : ''}`;
  });
  $('#hand0').innerHTML = renderHand(0);
  $('#hand1').innerHTML = renderHand(1);
  fanOut($('#hand0')); fanOut($('#hand1'));
}
/** 手札を扇形に並べる：少しずつ重ね、両端ほど傾けて下げる。枚数が増えたら重なりを深くして横幅に収める */
function fanOut(el) {
  const cs = [...el.querySelectorAll('.card')], n = cs.length;
  if (!n) return;
  const W = parseFloat(getComputedStyle(el).getPropertyValue('--cw')) || 84;
  const opp = el.classList.contains('opp');
  const spread = Math.min(30, n * 4.5);
  // 傾けた分だけ端のカードが外へはみ出すので、その分を差し引いて横幅に収める
  const spill = W * 86 / 59 * (opp ? 0.6 : 1.6) * Math.sin(spread / 2 * Math.PI / 180);
  const step = n > 1 ? Math.max(8, Math.min(W * (opp ? 0.5 : 0.66), (el.clientWidth - W - spill * 2 - 8) / (n - 1))) : 0;
  cs.forEach((c, i) => {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5;
    c.style.setProperty('--tx', (t * step * (n - 1)).toFixed(1) + 'px');
    c.style.setProperty('--ty', (t * t * 40 * W / 84).toFixed(1) + 'px');
    c.style.setProperty('--rot', (t * spread).toFixed(1) + 'deg');
    c.style.setProperty('--z', String(i + 1));
  });
}

/* ---------- フェイズ（上の帯） ---------- */
const PHASES = ['draw', 'standby', 'main1', 'battle', 'main2', 'end'];
const PH_SHORT = { draw: 'DP', standby: 'SP', main1: 'M1', battle: 'BP', main2: 'M2', end: 'EP' };
const STEP_LABEL = { declared: '攻撃宣言時', dsStart: 'ダメージステップ開始時', beforeCalc: 'ダメージ計算前', afterCalc: 'ダメージ計算後', dsEnd: 'ダメージステップ終了時', end: 'ダメージステップ終了時' };
const humanActing = () => S.winner === null && !isCpu(actorOf(S));

function renderTop() {
  const cur = PHASES.indexOf(S.phase);
  const legal = humanActing() && !S.pending ? legalActions(S) : [];
  // 移れるフェイズは押せるボタンにする
  $('#phases').innerHTML = PHASES.map((ph, i) => {
    const a = legal.find(x => x.type === 'nextPhase' && x.to === ph);
    const cls = i === cur ? 'cur' : i < cur ? 'past' : '';
    return `<li class="${cls}">${a ? `<button data-act='${esc(JSON.stringify(a))}' title="${PHASE_LABEL[ph]}へ進む">${PH_SHORT[ph]}</button>` : `<span title="${PHASE_LABEL[ph]}">${PH_SHORT[ph]}</span>`}</li>`;
  }).join('');
  $('#turnInfo').innerHTML = S.winner !== null ? '決着' : `<span class="tl">ターン</span><span class="ts">T</span>${S.turn}<span class="tl">・${esc(NAME(S.turnPlayer))}</span>`;
  $('#undo').disabled = history.length === 0;
}

/* ---------- 操作ドック ---------- */
/** 応答の聞き方：「「死者蘇生」にチェーンしますか？」のように、何に対して発動するかを書く */
const cardName = uid => (S.cards[uid].faceUp || S.cards[uid].zone === 'gy' || !isCpu(S.cards[uid].controller) ? `「${defOf(S, uid).name}」` : '裏側のカード');
function respondPrompt() {
  const w = S.window;
  const whose = p => (p === actorOf(S) ? '自分の' : `${NAME(p)}の`);
  if (S.chain.length) {
    const top = S.chain[S.chain.length - 1];
    return `${whose(top.player)}「${defOf(S, top.uid).name}」にチェーンしますか？`;
  }
  if (w.mode === 'summoning' && w.cont.type === 'summon') {
    const how = w.cont.how === 'flip' ? '反転召喚' : w.cont.how === 'advance' ? 'アドバンス召喚' : '召喚';
    return `${whose(w.cont.player)}${cardName(w.cont.uid)}の${how}に対して発動しますか？`;
  }
  if (S.battle && (w.cont.type === 'battle' || w.mode === 'damage')) {
    const b = S.battle;
    if (b.step === 'declared') return `${cardName(b.attacker)}の${b.target === null ? 'ダイレクトアタック' : `${cardName(b.target)}への攻撃`}に対して発動しますか？`;
    return `${STEP_LABEL[b.step] || 'バトル中'}に発動しますか？`;
  }
  if (w.cont.type === 'phase' || w.cont.type === 'endTurn') return `${PHASE_LABEL[S.phase]}を終える前に発動しますか？`;
  // 召喚・特殊召喚に成功した直後など
  const ev = [...S.lastEvents].reverse().find(e => e.type === 'summoned');
  if (ev) {
    const how = { normal: '召喚', advance: 'アドバンス召喚', flip: '反転召喚', special: '特殊召喚', ritual: '儀式召喚', fusion: '融合召喚' }[ev.how];
    return `${cardName(ev.uid)}の${how}成功に対して発動しますか？`;
  }
  return '直前の行動に対して発動しますか？';
}
/** 右下の「進む」ボタン：今の場面を先に進める行動（応答なら「発動しない」、フェイズなら次のフェイズ） */
function goAction(legal) {
  const has = x => legal.some(y => JSON.stringify(y) === JSON.stringify(x));
  if (S.window.kind === 'priority') return { label: '発動しない', sub: 'パスして進む', a: { type: 'pass' } };
  const me = S.turnPlayer;
  const attackers = monstersOf(S, me).some(u => S.cards[u].faceUp && S.cards[u].position === 'atk' && !S.cards[u].noAttack);
  const pick = (...list) => list.find(x => has(x.a)) || null;
  if (S.phase === 'main1') return pick(...(attackers ? [{ label: 'バトルへ', sub: 'バトルフェイズに進む', a: { type: 'nextPhase', to: 'battle' } }] : []), { label: 'エンドへ', sub: 'エンドフェイズに進む', a: { type: 'nextPhase', to: 'end' } });
  if (S.phase === 'battle') return pick({ label: 'メイン2へ', sub: 'メインフェイズ2に進む', a: { type: 'nextPhase', to: 'main2' } });
  if (S.phase === 'main2') return pick({ label: 'エンドへ', sub: 'エンドフェイズに進む', a: { type: 'nextPhase', to: 'end' } });
  return pick({ label: 'ターン終了', sub: '相手のターンへ', a: { type: 'endTurn' } });
}
function renderDock() {
  const dock = $('#dock');
  const actor = $('#actor'), hint = $('#actorHint'), btns = $('#phaseBtns'), go = $('#goBtn');
  const legal = humanActing() && !S.pending ? legalActions(S) : [];
  const has = a => legal.some(x => JSON.stringify(x) === JSON.stringify(a));
  const b = (label, a) => `<button class="btn" data-act='${esc(JSON.stringify(a))}'>${label}</button>`;
  const setGo = (label, sub, act, opts = {}) => {
    go.innerHTML = `${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
    go.disabled = !!opts.disabled;
    if (act) go.dataset.act = JSON.stringify(act); else delete go.dataset.act;
    go.dataset.again = opts.again ? '1' : '';
    go.dataset.reopen = opts.reopen ? '1' : '';
  };
  actor.classList.remove('thinking');
  dock.classList.toggle('mine', humanActing());
  hint.textContent = '';
  btns.innerHTML = '';
  $('#stopBtn').hidden = chainMode() === 'always' || S.winner !== null;
  $('#stopBtn').setAttribute('aria-pressed', String(stopNext));

  const rb = $('#reviewBtn'); if (rb) rb.hidden = !(S.winner !== null && cpuMode() && trace.length > 1);
  if (S.winner !== null) {
    actor.textContent = S.winner === 'draw' ? '引き分け' : `${NAME(S.winner)}の勝利`;
    hint.textContent = S.winReason || '';
    setGo('もう一度', '新しいデュエル', null, { again: true });
    return;
  }
  if (isCpu(actorOf(S))) {
    actor.textContent = S.pending ? 'CPUが選んでいます' : 'CPUが考えています';
    actor.classList.add('thinking');
    hint.textContent = S.window.kind === 'priority' && S.chain.length ? `チェーン${S.chain.length}に応答するか考えています` : `${PHASE_LABEL[S.phase]}`;
    setGo('CPUの番', '少し待ってください', null, { disabled: true });
    return;
  }
  if (S.pending) {
    actor.textContent = cpuMode() ? 'あなたの選択' : `${NAME(S.pending.request.player)}の選択`;
    hint.textContent = S.pending.request.prompt;
    if (narrow() && peek) setGo('選択に戻る', '選ぶ画面を開く', null, { reopen: true });
    else setGo('選択中', '出ている欄から選ぶ', null, { disabled: true });
    return;
  }
  const g = goAction(legal);
  if (S.window.kind === 'priority') {
    actor.textContent = respondPrompt();
    // 発動できるカードは左に並べる（効果が複数あるカードは効果名も出す）
    const acts = activatableList(S, actorOf(S));
    const multi = uid => acts.filter(x => x.uid === uid).length > 1;
    hint.textContent = acts.length ? '発動するなら左のボタン、しないなら右下の「発動しない」' : '';
    btns.innerHTML = acts.slice(0, 3).map(x => {
      const eff = (SCRIPTS[S.cards[x.uid].code]?.effects || []).find(e => e.id === x.effect);
      const label = `「${defOf(S, x.uid).name}」${multi(x.uid) && eff ? `の${eff.label}` : ''}を発動`;
      return b(esc(label), { type: 'activate', card: x.uid, effect: x.effect });
    }).join('');
    setGo(g.label, g.sub, g.a);
    return;
  }
  // 自分のターンで自由に行動できる：右下は「先に進む」、左はそれ以外の移り先
  const me = S.turnPlayer;
  actor.textContent = `${cpuMode() ? 'あなた' : NAME(me)}の${PHASE_LABEL[S.phase]}`;
  hint.textContent = S.turn === 1 && S.phase === 'main1' ? '先攻1ターン目はバトルフェイズに入れません' : S.phase === 'battle' ? '攻撃するモンスターを押す' : 'カードを押すと、できる操作が出ます';
  const others = [];
  if (S.phase === 'main1') { others.push({ l: 'バトルフェイズへ', a: { type: 'nextPhase', to: 'battle' } }, { l: 'エンドフェイズへ', a: { type: 'nextPhase', to: 'end' } }); }
  if (S.phase === 'battle') others.push({ l: 'エンドフェイズへ', a: { type: 'nextPhase', to: 'end' } });
  btns.innerHTML = others.filter(x => has(x.a) && (!g || JSON.stringify(x.a) !== JSON.stringify(g.a))).map(x => b(x.l, x.a)).join('');
  if (g) setGo(g.label, g.sub, g.a); else setGo('—', '', null, { disabled: true });
}

/* ---------- チェーンの確認：聞く場面を減らす ---------- */
const chainMode = () => ($('#chainMode') && $('#chainMode').value) || 'auto';
let stopNext = false;   // 「✋ 次で止める」
/** 今の応答の機会を、聞かずにパスしてよいか */
function shouldAutoPass() {
  if (!S || S.winner !== null || !humanActing() || S.pending || S.window.kind !== 'priority') return false;
  const mode = chainMode();
  if (mode === 'always' || stopNext) return false;
  if (mode === 'never') return true;
  // おまかせ：相手が動いた時だけ聞く（相手の発動・召喚・特殊召喚・攻撃宣言）
  const me = actorOf(S), w = S.window;
  const top = S.chain[S.chain.length - 1];
  if (top) return top.player === me;
  if (w.mode === 'summoning' && w.cont.type === 'summon') return w.cont.player === me;
  if (S.battle && S.battle.step === 'declared' && w.cont.type === 'battle' && w.cont.step === 'declared') return S.cards[S.battle.attacker].controller === me;
  const ev = S.lastEvents.find(e => e.type === 'summoned' || e.type === 'attackDeclared');
  if (ev) return ev.player === me;
  return true;
}
let autoT;
function scheduleAutoPass() {
  clearTimeout(autoT);
  if (!S || S.winner !== null) return;
  if (!shouldAutoPass()) {
    // 「次で止める」で止まったら、ボタンは元に戻す
    if (stopNext && humanActing() && !S.pending && S.window.kind === 'priority') { stopNext = false; $('#stopBtn').setAttribute('aria-pressed', 'false'); }
    return;
  }
  autoT = setTimeout(() => {
    if (!shouldAutoPass()) return;
    try { commit(applyAction(S, { type: 'pass' })); } catch (e) { console.error(e); return; }
    render();
  }, 60);
}

/* ---------- チェーン ---------- */
function renderChain() {
  const el = $('#chain');
  if (!S.chain.length) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<h3>チェーン（上から先に処理）</h3><ol>${S.chain.map((l, i) => `<li class="${l.player === 1 && cpuMode() ? 'opp' : ''}"><b>${i + 1}</b>${NAME(l.player)}：${esc(defOf(S, l.uid).name)}${l.negated ? '（無効）' : ''}${l.targets.length ? `<span class="tg">対象：${l.targets.map(t => esc(S.cards[t].faceUp || S.cards[t].zone === 'gy' ? defOf(S, t).name : '裏側のカード')).join('、')}</span>` : ''}</li>`).reverse().join('')}</ol>`;
}

/* ---------- カード詳細と操作 ---------- */
function describe(uid) {
  const c = S.cards[uid], d = defOf(S, uid);
  if (isCpu(c.controller) && (c.zone === 'hand' || ((c.zone === 'mzone' || c.zone === 'szone') && !c.faceUp))) {
    return { head: `<h3>裏側のカード</h3><p class="tl">${NAME(c.controller)}の${c.zone === 'hand' ? '手札' : 'フィールド'}のカードです。中身は見えません。</p>`, text: '' };
  }
  const typeLine = d.kind === 'monster'
    ? `${d.attribute}属性・${d.race}・★${d.level}・${(d.monsterTypes || []).join('／')}・攻${d.atk}／守${d.def}`
    : `${d.subtype}${d.kind === 'spell' ? '魔法' : '罠'}`;
  const where = { hand: '手札', mzone: 'モンスターゾーン', emz: 'エクストラモンスターゾーン', szone: '魔法＆罠ゾーン', fzone: 'フィールドゾーン', gy: '墓地', deck: 'デッキ', extra: 'EXデッキ', banished: '除外' }[c.zone];
  const state = c.zone === 'mzone' || c.zone === 'emz' ? `・${c.faceUp ? '表側' : '裏側'}${c.position === 'atk' ? '攻撃' : '守備'}表示・今の攻${currentAtk(S, uid)}／守${currentDef(S, uid)}` : (c.zone === 'szone' || c.zone === 'fzone') ? `・${c.faceUp ? '表側' : '裏側'}` : '';
  const extra = [];
  if (c.counters && c.counters.magic) extra.push(`魔力カウンター ${c.counters.magic}`);
  if (c.equippedTo !== null) extra.push(`${defOf(S, c.equippedTo).name}に装備`);
  if (c.noAttack) extra.push('攻撃できない');
  // 墓地・除外の儀式・融合モンスターが蘇生できるか（正規の召喚をしていないものは特殊召喚できない）
  if ((c.zone === 'gy' || c.zone === 'banished') && d.kind === 'monster' && (d.frame === 'ritual' || d.frame === 'fusion')) {
    const how = d.frame === 'ritual' ? '儀式召喚' : '融合召喚';
    if (SCRIPTS[c.code] && SCRIPTS[c.code].fusionOnly) extra.push('融合召喚でしか特殊召喚できないので、蘇生できません');
    else extra.push(c.proper ? `正規の${how}をしているので、蘇生できます` : `正規の${how}をしていないので、蘇生できません`);
  }
  return {
    head: `<h3>${esc(d.name)}</h3><p class="tl">${esc(typeLine)}</p><p class="tl">${NAME(c.controller)}の${where}${state}</p>${extra.length ? `<p class="tl">${esc(extra.join('・'))}</p>` : ''}`,
    text: `<p class="tx">${esc(d.text)}</p>`,
  };
}

function candidates(uid) {
  const c = S.cards[uid], d = defOf(S, uid);
  if (!humanActing() || S.pending) return [];
  const legal = legalActions(S);
  const actor = actorOf(S);
  const out = [];
  const add = (label, a, ok, primary) => out.push({ label, a, ok, primary });
  const nm = u => `「${defOf(S, u).name}」`;
  // 効果の発動
  const effs = (SCRIPTS[c.code] && SCRIPTS[c.code].effects || []).filter(e => e.type !== 'trigger');
  for (const e of effs) {
    const a = { type: 'activate', card: uid, effect: e.id };
    const ok = legal.some(x => x.type === 'activate' && x.card === uid && x.effect === e.id);
    if (ok || c.controller === actor) add(e.type === 'card' ? `発動：${e.label}` : `効果：${e.label}`, a, ok, ok);
  }
  if (c.controller !== S.turnPlayer || S.window.kind !== 'open') return out;
  // 召喚方法が決まった特殊召喚（混沌帝龍・暗黒界の龍神 グラファ①）
  const proc = SCRIPTS[c.code]?.procSummon;
  if (proc && proc.zones.includes(c.zone)) add(`特殊召喚する（${proc.label}）`, { type: 'procSummon', card: uid }, legal.some(a => a.type === 'procSummon' && a.card === uid), true);
  if (c.zone === 'hand') {
    if (d.kind === 'monster') {
      for (const type of SCRIPTS[c.code]?.cannotNormalSummon || d.frame === 'ritual' ? [] : ['normalSummon', 'setMonster']) {
        const label = type === 'normalSummon' ? '召喚する' : 'セットする';
        const vs = legal.filter(a => a.type === type && a.card === uid);
        if (vs.length) vs.forEach(a => add(a.tributes.length ? `${label}（リリース：${a.tributes.map(nm).join('・')}）` : label, a, true, type === 'normalSummon'));
        else add(label, { type, card: uid, tributes: [] }, false);
      }
      if (d.frame === 'ritual') out.push({ info: '儀式モンスターは儀式魔法で儀式召喚します。' });
      else if (SCRIPTS[c.code]?.cannotNormalSummon) out.push({ info: 'このカードは通常召喚できません。' });
      else if (tributesFor(S, uid) > 0) out.push({ info: `リリース${tributesFor(S, uid)}体が必要です。` });
      else if (S.players[S.turnPlayer].normalSummonUsed) out.push({ info: '通常召喚（セットを含む）は、このターンもう行いました。' });
    } else add('セットする', { type: 'setSpellTrap', card: uid }, legal.some(a => a.type === 'setSpellTrap' && a.card === uid));
  } else if (c.zone === 'mzone' || c.zone === 'emz') {
    const atks = legal.filter(a => a.type === 'attack' && a.attacker === uid);
    if (atks.length) atks.forEach(a => add(a.target === null ? 'ダイレクトアタック' : `${S.cards[a.target].faceUp ? nm(a.target) : '裏側守備表示モンスター'}に攻撃`, a, true, true));
    else {
      // 攻撃できない理由を、押さなくても見えるように出す
      const o = monstersOf(S, 1 - S.turnPlayer);
      const why = whyIllegal(S, { type: 'attack', attacker: uid, target: o.length ? o[0] : null });
      if (why && S.turn > 0) out.push({ info: `攻撃できません：${why}` });
    }
    const t = c.faceUp ? 'changePosition' : 'flipSummon';
    const okPos = legal.some(a => a.type === t && a.card === uid);
    if (okPos || S.phase !== 'battle') add(c.faceUp ? (c.position === 'atk' ? '守備表示にする' : '攻撃表示にする') : '反転召喚する', { type: t, card: uid }, okPos);
  }
  return out;
}

function renderChoice() {
  const r = S.pending.request;
  const who = cpuMode() ? 'あなたの選択' : `${NAME(r.player)}の選択`;
  const head = `<h3>${who}</h3><p class="prompt">${esc(r.prompt)}</p>`;
  if (r.kind === 'yesno') return head + `<div class="acts row2"><button class="btn act go" data-ans="true">はい</button><button class="btn act" data-ans="false">いいえ</button></div>`;
  if (r.kind === 'option') return head + `<div class="acts">${r.options.map((o, i) => `<button class="btn act${i === 0 ? ' go' : ''}" data-ans="${i}">${esc(o)}</button>`).join('')}</div>`;
  const where = u => ({ hand: '手札', deck: 'デッキ', gy: '墓地', mzone: 'フィールド', emz: 'フィールド', szone: 'フィールド', extra: 'EX', banished: '除外' }[S.cards[u].zone]);
  const label = u => { const c = S.cards[u]; return (c.faceUp || c.zone !== 'mzone' || c.controller === r.player) ? defOf(S, u).name : '裏側のモンスター'; };
  const range = r.min === r.max ? `${r.min}枚` : `${r.min}〜${r.max}枚`;
  const ok = pick.length >= r.min && pick.length <= r.max;
  return head + `<p class="tl">${range}選んでください（${pick.length}枚選択中）。盤面のカードを押しても選べます。</p><div class="optlist cards" role="listbox" aria-multiselectable="${r.max > 1}">${r.options.map(u => { const c = S.cards[u], show = c.faceUp || c.zone !== 'mzone' || c.controller === r.player; const d = defOf(S, u); return `<button class="opt cardopt${pick.includes(u) ? ' on' : ''}" data-opt="${u}" role="option" aria-selected="${pick.includes(u)}" aria-label="${esc(label(u))}"><span class="${show ? faceCls(d) : 'card back'}">${show ? faceHtml(u, d, false) : ''}</span><span class="on-mark" aria-hidden="true">✓</span><small>${esc(label(u))}</small><small class="wh">${NAME(c.controller)}・${where(u)}</small></button>`; }).join('')}</div>
    <button class="btn primary confirm" id="confirmPick" ${ok ? '' : 'disabled'}>決定</button>`;
}

function renderDetail() {
  const el = $('#detail');
  if (S.pending && isCpu(S.pending.request.player)) { el.innerHTML = `<h3>CPUが選んでいます</h3><p class="prompt">${esc(S.pending.request.prompt)}</p>`; return; }
  if (S.pending && isDeckPick(S.pending.request)) {
    el.innerHTML = `<h3>あなたの選択</h3><p class="prompt">${esc(S.pending.request.prompt)}</p><p class="tl">広げた${fanSrc(S.pending.request) === 'hand' ? '手札' : '山札'}から選んでください。</p>`;
    openFan();
    return;
  }
  if (S.pending) { el.innerHTML = renderChoice(); return; }
  if (selected === null) {
    el.innerHTML = `<h3>カードを押してください</h3><p class="tl">押したカードの効果と、今できる操作がここに出ます。光っているカードは今発動できます。次のフェイズへは、下のボタンか上の「BP・M2・EP」で進めます。</p>`;
    return;
  }
  // 操作ボタンはカード名のすぐ下に置き、効果テキストはその後（スマホでスクロールせずに押せるように）
  const list = candidates(selected);
  const dsc = describe(selected);
  el.innerHTML = dsc.head + (list.length ? `<div class="acts">${list.map(x => x.info ? `<p class="info">${esc(x.info)}</p>` : `<button class="btn act${x.ok ? (x.primary ? ' go' : '') : ' off'}" data-act='${esc(JSON.stringify(x.a))}'>${esc(x.label)}</button>`).join('')}</div>` : '') + dsc.text;
}

function renderLog() {
  const el = $('#log');
  el.innerHTML = S.log.slice(-200).map(l => `<li class="${l.text.startsWith('―') ? 'turn' : ''}">${esc(l.text)}</li>`).join('');
  el.scrollTop = el.scrollHeight;
}


/* ---------- デッキから選ぶ時：山札を扇形に広げて、カードを直接選ぶ ---------- */
let fan = null;           // { key, layer, sel, req }
const fanDur = ms => (fxMode() === 'short' ? ms / 2 : ms);
/** 扇を広げて選ぶ選択なら、広げる場所（'deck'：山札から選ぶ、'hand'：手札から捨てる・墓地へ送る）。演出が「なし」の時は、今までどおり文字の一覧 */
function fanSrc(r) {
  if (fxMode() === 'none' || !r || r.kind !== 'cards' || !r.options.length) return null;
  const every = z => r.options.every(u => S.cards[u].zone === z && S.cards[u].owner === r.player);
  if (every('deck')) return 'deck';
  if (every('hand') && /捨て|墓地/.test(r.prompt)) return 'hand';
  return null;
}
function isDeckPick(r) { return !!fanSrc(r); }
const rectOf = el => el.getBoundingClientRect();
const centerOf = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
function pileEl(p, kind) { return ROOT.querySelector(`[data-pile="${p}:${kind}"]`); }
/** 山札の並びが分からないように、種類と名前の順に並べる */
function sortForFan(list) {
  const rank = u => ({ monster: 0, spell: 1, trap: 2 }[defOf(S, u).kind] ?? 3);
  return [...list].sort((a, b) => rank(a) - rank(b) || defOf(S, a).name.localeCompare(defOf(S, b).name, 'ja') || a - b);
}
function fanCardHtml(uid, back) {
  const d = defOf(S, uid);
  if (back) return `<span class="card back" data-fanb="${uid}"></span>`;
  return `<span class="${faceCls(d)}" data-fan="${uid}">${faceHtml(uid, d, false)}</span>`;
}
/** カードを扇形（何段か）に並べる位置を決める */
function layoutFan(area, els, big = false, sorted = false) {
  const W = area.clientWidth, cw = big ? (narrow() ? 84 : 104) : narrow() ? 64 : 80, ch = cw * 86 / 59, n = els.length;
  const perRow = Math.max(5, Math.floor((W - cw) / (cw * .62)) + 1), rows = Math.ceil(n / perRow);
  els.forEach((el, i) => {
    const row = Math.floor(i / perRow), first = row * perRow, m = Math.min(perRow, n - first), idx = i - first;
    const t = m > 1 ? idx / (m - 1) - .5 : 0, step = m > 1 ? Math.min(cw * .7, (W - cw - 8) / (m - 1)) : 0;
    const x = W / 2 + t * step * (m - 1), y = row * ch * .66 + ch / 2 + 16 + t * t * 34, rot = t * 16;
    el.style.width = cw + 'px'; if (big) el.style.fontSize = (cw / 8).toFixed(1) + 'px'; el.style.left = (x - cw / 2) + 'px'; el.style.top = (y - ch / 2) + 'px';
    el.style.setProperty('--rot', rot.toFixed(1) + 'deg'); el.style.zIndex = String(i + 1);
    el.dataset.rot = rot.toFixed(1);
  });
  area.style.height = (rows * ch * .66 + ch * .45 + 40) + 'px';
}
/** 山札の場所から、扇の位置へ飛び出す */
function flyIn(els, from) {
  return Promise.all(els.map((el, i) => {
    const r = rectOf(el), c = centerOf(r), dx = from.x - c.x, dy = from.y - c.y;
    return el.animate([{ transform: `translate(${dx}px,${dy}px) scale(.6) rotate(0deg)`, opacity: .3 }, { transform: `rotate(${el.dataset.rot}deg)`, opacity: 1 }],
      { duration: fanDur(420), delay: fanDur(Math.min(i * 28, 700)), easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }).finished;
  }));
}
/** 指定の場所へ飛んでいく（残りのカードは山札へ戻る） */
function flyTo(el, to, opts = {}) {
  const c = centerOf(rectOf(el)), dx = to.x - c.x, dy = to.y - c.y;
  const a = el.animate([{ transform: el.classList.contains('picked') ? 'translateY(-20px) scale(1.12)' : `rotate(${el.dataset.rot || 0}deg)`, opacity: 1 },
    { transform: `translate(${dx}px,${dy}px) scale(${opts.scale ?? .5}) rotate(${opts.rot ?? 0}deg)`, opacity: opts.fade ? .2 : 1 }],
  { duration: fanDur(opts.dur ?? 420), delay: fanDur(opts.delay ?? 0), easing: opts.ease ?? 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' });
  return a.finished;
}
function shakePile(p) {
  const el = pileEl(p, 'deck');
  if (el) el.animate([{ transform: 'none' }, { transform: 'translateX(-5px) rotate(-6deg)' }, { transform: 'translateX(5px) rotate(6deg)' }, { transform: 'translateX(-3px) rotate(-3deg)' }, { transform: 'none' }], { duration: fanDur(480) });
}
function glowPile(p) {
  const el = pileEl(p, 'deck');
  if (el) el.animate([{ boxShadow: '0 0 0 0 rgba(255,224,138,0)' }, { boxShadow: '0 0 0 3px #ffe08a, 0 0 26px 8px rgba(255,224,138,.8)' }, { boxShadow: '0 0 0 0 rgba(255,224,138,0)' }], { duration: fanDur(650) });
}
function closeFan() { if (fan) { fan.layer.remove(); fan = null; } }
function openFan() {
  const r = S.pending.request, key = JSON.stringify([S.step, r.prompt, r.options, S.pending.answers.length]);
  if (fan && fan.key === key) return;
  closeFan();
  const p = r.player, src = fanSrc(r), all = src === 'hand' ? (sortsHand(p) ? sortHand(S, S.players[p].hand) : [...S.players[p].hand]) : sortForFan(S.players[p].deck);
  const layer = document.createElement('div');
  layer.className = 'fan-layer';
  const range = r.min === r.max ? `${r.min}枚選ぶ` : `${r.min}〜${r.max}枚選ぶ`;
  layer.innerHTML = `<div class="fan-head"><b>${esc(r.prompt)}</b><span>${src === 'hand' ? '手札' : '山札'} ${all.length}枚から${range}（明るいカードが選べます）</span></div><div class="fan-area"></div>`
    + `<div class="fan-btns">${history.length ? '<button class="btn ghost" data-fanundo aria-label="元に戻す">↶ 元に戻す</button>' : ''}${r.min === 0 ? '<button class="btn" data-fanskip>選ばない</button>' : ''}${r.max > 1 ? '<button class="btn primary" data-fanok disabled>決定</button>' : ''}</div>`;
  $('.droot').appendChild(layer);
  const area = layer.querySelector('.fan-area');
  area.innerHTML = all.map(u => fanCardHtml(u, false)).join('');
  const els = [...area.children];
  els.forEach(el => { if (!r.options.includes(Number(el.dataset.fan))) el.classList.add('dim'); });
  layoutFan(area, els, src === 'hand');
  fan = { key, layer, sel: [], req: r, p, src };
  // 山札（または手札）の場所から、カードが扇の形に開く
  const from = src === 'hand' ? $(`#hand${p}`) : pileEl(p, 'deck');
  if (src !== 'hand') glowPile(p);
  const opened = from ? flyIn(els, centerOf(rectOf(from))) : Promise.resolve();
  // 開き終わったら、選べるカードを下の段にまとめる（押しやすいように）
  if (src !== 'hand' && els.some(el => el.classList.contains('dim'))) opened.then(() => {
    if (!fan || fan.layer !== layer) return;
    const picks = sortForFan(els.filter(el => !el.classList.contains('dim')).map(el => Number(el.dataset.fan))).map(uid => els.find(el => Number(el.dataset.fan) === uid));
    const rest = els.filter(el => el.classList.contains('dim'));
    // 下の列へ：今の位置を覚えてから移し、そこから飛んでくるように動かす（FLIP）
    const row = document.createElement('div'); row.className = 'fan-pick';
    layer.insertBefore(row, layer.querySelector('.fan-btns'));
    const before = picks.map(el => el.getBoundingClientRect());
    picks.forEach(el => { el.style.left = ''; el.style.top = ''; el.style.width = ''; el.style.zIndex = ''; row.appendChild(el); });
    picks.forEach((el, i) => { const r = el.getBoundingClientRect(), b = before[i]; el.animate([{ transform: `translate(${b.left - r.left}px,${b.top - r.top}px) scale(${b.width / r.width}) rotate(${el.dataset.rot || 0}deg)` }, { transform: 'none' }], { duration: fanDur(520), delay: fanDur(i * 50), easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }); });
    area.classList.add('sorting');
    layoutFan(area, rest);
    setTimeout(() => area.classList.remove('sorting'), 600);
    const tip = layer.querySelector('.fan-head span'); if (tip && narrow()) tip.textContent = '下に並んだカードから選べます（1回目で効果、もう1回で決定）';
  });
}
/** 山札を広げている時に、押したカードの効果を見せる（もう一度押すと選ぶ） */
function fanPeek(el, u) {
  if (!fan) return;
  fan.peek = u;
  fan.layer.querySelectorAll('[data-fan]').forEach(x => x.classList.toggle('peek', x === el));
  let box = fan.layer.querySelector('.fan-info');
  if (!box) { box = document.createElement('div'); box.className = 'fan-info'; box.setAttribute('aria-live', 'polite'); fan.layer.insertBefore(box, fan.layer.querySelector('.fan-pick') || fan.layer.querySelector('.fan-btns')); }
  const d = defOf(S, u), ok = fan.req.options.includes(u);
  const type = d.kind === 'monster' ? `★${d.level ?? '-'}・${d.attribute || ''}・${d.race || ''}　ATK ${d.atk ?? '?'} / DEF ${d.def ?? '?'}` : `${d.subtype || ''}${d.kind === 'spell' ? '魔法' : '罠'}`;
  box.innerHTML = `<b>${esc(d.name)}</b><small>${esc(type)}</small><p>${esc(d.text || '')}</p><span class="fan-hint">${ok ? (fan.req.max > 1 ? 'もう一度押すと選びます' : 'もう一度押すと手札に加えます') : 'このカードは選べません'}</span>`;
}
function fanPick(u) {
  if (!fan || !fan.req.options.includes(u)) return;
  const r = fan.req;
  if (r.max === 1) { fanFinish([u]); return; }
  fan.sel = fan.sel.includes(u) ? fan.sel.filter(x => x !== u) : fan.sel.length < r.max ? [...fan.sel, u] : fan.sel;
  fan.layer.querySelectorAll('[data-fan]').forEach(el => el.classList.toggle('picked', fan.sel.includes(Number(el.dataset.fan))));
  const ok = fan.layer.querySelector('[data-fanok]');
  if (ok) ok.disabled = !(fan.sel.length >= r.min && fan.sel.length <= r.max);
}
/** 選んだカードを行き先（手札・墓地・場）へ飛ばし、残りを山札に戻してから答える */
async function fanFinish(sel) {
  if (!fan || fan.busy) return;
  fan.busy = true;
  const r = fan.req, p = fan.p, layer = fan.layer;
  layer.classList.add('done');
  const dest = /除外/.test(r.prompt) ? pileEl(p, 'banished') : /墓地|捨て/.test(r.prompt) ? pileEl(p, 'gy') : /特殊召喚|フィールド/.test(r.prompt) ? $('#board') : $(`#hand${p}`);
  const to = dest ? centerOf(rectOf(dest)) : { x: innerWidth / 2, y: innerHeight };
  const pile = fan.src === 'hand' ? $(`#hand${p}`) : pileEl(p, 'deck'), back = pile ? centerOf(rectOf(pile)) : to;
  const els = [...layer.querySelectorAll('[data-fan]')];
  const picked = els.filter(el => sel.includes(Number(el.dataset.fan)));
  picked.forEach(el => { el.classList.add('picked'); el.style.zIndex = '100'; });
  await new Promise(res => setTimeout(res, fanDur(200)));
  const rest = els.filter(el => !sel.includes(Number(el.dataset.fan)));
  rest.forEach((el, i) => flyTo(el, back, { dur: 360, delay: Math.min(i * 12, 300), fade: true, scale: .5, ease: 'ease-in' }));
  await Promise.all(picked.map(el => flyTo(el, to, { dur: 460, scale: .55, rot: -8 })));
  if (fan.src !== 'hand') shakePile(p);
  closeFan();
  fanDoneUids = new Set(sel);
  run({ type: 'answer', value: sel });
}

/* ---------- 手札から墓地へ：手札が扇の形に開き、送るカードが表になって墓地へ飛ぶ ---------- */
async function handOpenFx(j) {
  const hand = $(`#hand${j.p}`), gy = pileEl(j.p, 'gy');
  if (!hand || !gy) return;
  const pause = ms => new Promise(res => setTimeout(res, fanDur(ms)));
  const layer = document.createElement('div');
  layer.className = 'fan-layer cpu';
  layer.innerHTML = `<div class="fan-head"><b>${esc(NAME(j.p))}の手札</b></div><div class="fan-area"></div>`;
  $('.droot').appendChild(layer);
  const area = layer.querySelector('.fan-area');
  const face = u => `<span class="${faceCls(j.ds[u])}" data-fan="${u}">${faceHtml(u, j.ds[u], false)}</span>`;
  area.innerHTML = j.hand.map(u => (j.faces ? face(u) : `<span class="card back" data-fanb="${u}"></span>`)).join('');
  const els = [...area.children];
  layoutFan(area, els, true);
  await flyIn(els, centerOf(rectOf(hand)));
  await pause(250);
  const uidOf = el => Number(el.dataset.fan ?? el.dataset.fanb);
  const picked = els.filter(el => j.gone.includes(uidOf(el)));
  // 裏向きの手札（CPU）は、送るカードだけくるりと表に返す
  if (!j.faces) await Promise.all(picked.map(async el => {
    const u = uidOf(el), rot = `rotate(${el.dataset.rot || 0}deg)`;
    await el.animate([{ transform: rot }, { transform: `${rot} scaleX(0)` }], { duration: fanDur(170), fill: 'forwards' }).finished;
    el.className = faceCls(j.ds[u]); el.innerHTML = faceHtml(u, j.ds[u], false);
    await el.animate([{ transform: `${rot} scaleX(0)` }, { transform: rot }], { duration: fanDur(170), fill: 'forwards' }).finished;
  }));
  picked.forEach(el => { el.getAnimations().forEach(x => x.cancel()); el.classList.add('picked'); el.style.zIndex = '100'; });
  const names = j.gone.map(u => `「${j.ds[u].name}」`).join('');
  layer.querySelector('.fan-head b').textContent = `${NAME(j.p)}が${names}を墓地へ送ります`;
  await pause(800);
  const rest = els.filter(el => !picked.includes(el));
  rest.forEach((el, i) => flyTo(el, centerOf(rectOf(hand)), { dur: 360, delay: Math.min(i * 12, 300), fade: true, scale: .5, ease: 'ease-in' }));
  await Promise.all(picked.map(el => flyTo(el, centerOf(rectOf(gy)), { dur: 460, scale: .55, rot: -8 })));
  layer.remove();
}

/* ---------- 手札に加わった時：残りの手札を左に扇で、加わったカードを右に置いて大きく見せ、並べ替えてから手札へ ---------- */
async function handAddFx(j) {
  const hand = $(`#hand${j.p}`);
  if (!hand) return;
  const pause = ms => new Promise(res => setTimeout(res, fanDur(ms)));
  const layer = document.createElement('div');
  layer.className = 'fan-layer cpu hand-add';
  const names = j.added.map(u => `「${j.ds[u].name}」`).join('');
  const verb = j.drew ? 'ドロー' : '手札に加えた';
  layer.innerHTML = `<div class="fan-head"><b>${esc(verb)}：${esc(names)}</b><span>手札 ${j.kept.length + j.added.length}枚</span></div><div class="fan-area"></div>`;
  $('.droot').appendChild(layer);
  const area = layer.querySelector('.fan-area');
  const face = u => `<span class="${faceCls(j.ds[u])}${j.added.includes(u) ? ' new' : ''}" data-fan="${u}">${faceHtml(u, j.ds[u], false)}</span>`;
  const order0 = [...j.kept, ...j.added];
  area.innerHTML = order0.map(face).join('');
  const els = [...area.children];
  const elOf = u => els.find(el => Number(el.dataset.fan) === u);
  // 残りの手札は扇（左）、加わったカードは少し離して右に、大きく
  layoutHandAdd(area, j.kept.map(elOf), j.added.map(elOf));
  const deck = pileEl(j.p, 'deck');
  await Promise.all([
    flyIn(j.kept.map(elOf), centerOf(rectOf(hand))),
    flyIn(j.added.map(elOf), centerOf(rectOf(j.drew && deck ? deck : hand))),
  ]);
  await pause(900);
  // 並べ替え：今の位置を覚えて並べ直し、そこから動かす（FLIP）
  const sorted = sortHand(S, order0).filter(u => order0.includes(u)).map(elOf);
  const before = new Map(els.map(el => [el, rectOf(el)]));
  layoutFan(area, sorted, true);
  await Promise.all(sorted.map((el, i) => {
    const b = before.get(el), r = rectOf(el);
    return el.animate([{ transform: `translate(${b.left - r.left}px,${b.top - r.top}px)` }, { transform: `rotate(${el.dataset.rot}deg)` }],
      { duration: fanDur(480), delay: fanDur(i * 18), easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }).finished;
  }));
  await pause(450);
  const to = centerOf(rectOf(hand));
  await Promise.all(sorted.map((el, i) => flyTo(el, to, { dur: 380, delay: Math.min(i * 14, 200), scale: .55, ease: 'ease-in', fade: true })));
  layer.remove();
}
/** 残りの手札（左の扇）と加わったカード（右）を並べる */
function layoutHandAdd(area, kept, added) {
  const W = area.clientWidth, cw = narrow() ? 76 : 100, ch = cw * 86 / 59;
  const nk = kept.length, na = added.length;
  const right = Math.min(W - 8, W / 2 + (na * cw * .8 + nk * cw * .38) / 2 + cw * .3);
  // 加わったカード：右端から並べる
  added.forEach((el, i) => {
    const x = right - cw / 2 - (na - 1 - i) * cw * .82;
    place(el, x, ch / 2 + 22, 0, 50 + i);
  });
  // 残りの手札：加わったカードの左に扇形
  const leftEdge = Math.max(cw / 2 + 4, right - na * cw * .82 - cw * .35 - nk * cw * .42);
  const end = right - na * cw * .82 - cw * .45;
  nk && kept.forEach((el, i) => {
    const t = nk > 1 ? i / (nk - 1) : 1, x = leftEdge + (end - leftEdge) * t, rot = (t - .5) * 18;
    place(el, x, ch / 2 + 30 + (t - .5) ** 2 * 30, rot, i + 1);
  });
  area.style.height = (ch + 60) + 'px';
  function place(el, x, y, rot, z) {
    el.style.width = cw + 'px'; el.style.fontSize = (cw / 8).toFixed(1) + 'px';
    el.style.left = (x - cw / 2) + 'px'; el.style.top = (y - ch / 2) + 'px';
    el.style.setProperty('--rot', rot.toFixed(1) + 'deg'); el.dataset.rot = rot.toFixed(1); el.style.zIndex = String(z);
  }
}

/* ---------- CPUのサーチ：裏面の扇から1枚を見せて、手札へ ---------- */
async function cpuSearchFx(j) {
  const pile = pileEl(j.p, 'deck'), hand = $(`#hand${j.p}`);
  if (!pile || !hand) return;
  const layer = document.createElement('div');
  layer.className = 'fan-layer cpu';
  layer.innerHTML = `<div class="fan-head"><b>${esc(NAME(j.p))}がデッキからカードを探しています</b></div><div class="fan-area"></div>`;
  $('.droot').appendChild(layer);
  const area = layer.querySelector('.fan-area');
  area.innerHTML = Array.from({ length: 9 }, () => '<span class="card back"></span>').join('');
  const els = [...area.children];
  layoutFan(area, els);
  glowPile(j.p);
  await flyIn(els, centerOf(rectOf(pile)));
  await new Promise(res => setTimeout(res, fanDur(350)));
  const pick = els[4];
  pick.style.zIndex = '100';
  const rest = els.filter(el => el !== pick);
  rest.forEach((el, i) => flyTo(el, centerOf(rectOf(pile)), { dur: 340, delay: i * 15, fade: true, ease: 'ease-in' }));
  // くるりと表に返して、相手に見せる
  await pick.animate([{ transform: 'rotate(0deg) scale(1.3)' }, { transform: 'rotate(0deg) scale(1.3) scaleX(0)' }], { duration: fanDur(180), fill: 'forwards' }).finished;
  const d = j.d;
  pick.className = faceCls(d);
  pick.innerHTML = faceHtml(j.uid, d, false);
  layer.querySelector('.fan-head b').textContent = `${NAME(j.p)}が「${d.name}」を手札に加えます`;
  await pick.animate([{ transform: 'rotate(0deg) scale(1.3) scaleX(0)' }, { transform: 'rotate(0deg) scale(1.3)' }], { duration: fanDur(180), fill: 'forwards' }).finished;
  await new Promise(res => setTimeout(res, fanDur(900)));
  pick.dataset.rot = '0';
  await flyTo(pick, centerOf(rectOf(hand)), { dur: 420, scale: .4, fade: true });
  shakePile(j.p);
  layer.remove();
}


/* ---------- カードの移動・発動・無効・ターン・勝敗の演出 ----------
   画面を更新する前のカードの位置を覚えておき、更新した後の位置まで、カードの写しを飛ばす */
let pendingMoves = null;
let fanDoneUids = new Set();   // 扇から選んだカード（扇の演出で飛ばし済み）
const VIEWER = 0;              // 画面を見ている人（CPU対戦では P1）
const dur = ms => (fxMode() === 'short' ? ms / 2 : ms);
const wait = ms => new Promise(res => setTimeout(res, dur(ms)));
const PUBLIC = ['mzone', 'emz', 'szone', 'fzone', 'gy', 'banished'];
/** そのカードの表を、画面を見ている人が見てよいか */
function visibleTo(st, u) {
  const c = st.cards[u];
  if (!c) return false;
  if (PUBLIC.includes(c.zone)) return c.faceUp || (c.zone !== 'banished' && c.controller === VIEWER && cpuMode());
  if (c.zone === 'hand') return !cpuMode() || c.owner === VIEWER;
  return false;
}
function snapRects() {
  const m = new Map(), piles = {};
  ROOT.querySelectorAll('#board [data-uid], #hand0 [data-uid], #hand1 [data-uid]').forEach(el => m.set(Number(el.dataset.uid), el.getBoundingClientRect()));
  ROOT.querySelectorAll('#board [data-pile]').forEach(el => { piles[el.dataset.pile] = el.getBoundingClientRect(); });
  return { m, piles };
}
function linkKey(l) { return `${l.uid}:${l.serial}:${l.effect}`; }
function queueMoves(prev, next) {
  if (fxMode() === 'none' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const fresh = (next.anim || []).filter(x => x.seq > (prev.animSeq ?? 0));
  const skip = new Set([...fanDoneUids, ...sigSkip]); sigSkip.clear();
  // 扇で選んだカードは、実際に動くまで覚えておく（相手の選択を待ってから墓地へ送る効果がある）
  fanDoneUids = new Set([...fanDoneUids].filter(u => prev.cards[u] && next.cards[u] && prev.cards[u].zone === next.cards[u].zone));
  for (const x of fresh) {
    if (x.kind === 'summon' || x.kind === 'search') skip.add(x.uid);
    if (x.kind === 'summon') (x.mats || []).forEach(m => { if (x.how === 'fusion' || x.how === 'ritual' || x.how === 'advance') skip.add(m); });
    if (x.kind === 'battle') x.destroyed.forEach(u => skip.add(u));
  }
  // 自分の手札に加わったカード（ドロー・サーチなど）：引いたカードを右、残りの手札を左に扇で広げて大きく見せてから並べ替える
  for (const p of [0, 1]) {
    if (!sortsHand(p)) continue;
    const added = next.players[p].hand.filter(u => !prev.players[p].hand.includes(u) && prev.cards[u] && !fanDoneUids.has(u));
    if (!added.length) continue;
    // 引いた直後に手札から選ぶ（暗黒界の取引など）時は、選ぶ画面に手札が全部出るので、この演出はしない
    if (next.pending && next.pending.request.player === p && fanSrc(next.pending.request) === 'hand') { added.forEach(u => skip.add(u)); continue; }
    const from = Object.fromEntries(added.map(u => [u, prev.cards[u].zone]));
    const kept = sortHand(prev, prev.players[p].hand.filter(u => next.players[p].hand.includes(u)));
    pendingSummons.push({ handAdd: true, p, kept, added, from, drew: added.every(u => from[u] === 'deck') && (next.anim || []).every(x => !(x.kind === 'search' && added.includes(x.uid))),
      ds: Object.fromEntries([...kept, ...added].map(u => [u, defOf(next, u)])) });
    added.forEach(u => skip.add(u));
  }
  const negs = new Set(fresh.filter(x => x.kind === 'negate').map(x => x.uid));
  const destroys = new Set(fresh.filter(x => x.kind === 'destroy').map(x => x.uid));
  const moves = [];
  for (const k of Object.keys(next.cards)) {
    const u = Number(k), pc = prev.cards[u], nc = next.cards[u];
    if (!pc || skip.has(u)) continue;
    const same = pc.zone === nc.zone && pc.controller === nc.controller && (!['mzone', 'szone', 'emz'].includes(nc.zone) || pc.index === nc.index);
    if (same) continue;
    if (pc.zone === 'deck' && nc.zone === 'deck') continue;
    moves.push({ u, from: pc.zone, to: nc.zone, fromP: pc.controller, toP: nc.controller, face: visibleTo(prev, u) || visibleTo(next, u), d: defOf(next, u),
      destroy: destroys.has(u), negate: negs.has(u) });
  }
  const had = new Set((prev.chain || []).map(linkKey));
  const acts = (next.chain || []).filter(l => !had.has(linkKey(l))).map(l => ({ uid: l.uid, p: l.player, kind: l.cardKind, zone: next.cards[l.uid].zone, d: defOf(next, l.uid) }));
  const turn = next.turn !== prev.turn && next.winner === null ? next.turnPlayer : null;
  const win = prev.winner === null && next.winner !== null ? next.winner : null;
  if (!moves.length && !acts.length && turn === null && win === null) return;
  const snap = snapRects();
  if (!pendingMoves) pendingMoves = { from: snap.m, piles: snap.piles, moves: [], acts: [], turn: null, win: null };
  else snap.m.forEach((r, u) => { if (!pendingMoves.from.has(u)) pendingMoves.from.set(u, r); });
  // 同じカードが続けて動いた時は、最初の場所から最後の場所へ
  for (const m of moves) {
    const old = pendingMoves.moves.find(x => x.u === m.u);
    if (old) { old.to = m.to; old.toP = m.toP; old.face = old.face || m.face; old.destroy ||= m.destroy; old.negate ||= m.negate; }
    else pendingMoves.moves.push(m);
  }
  pendingMoves.acts.push(...acts);
  if (turn !== null) pendingMoves.turn = turn;
  if (win !== null) pendingMoves.win = win;
}
function flyLayer() {
  let l = $('.fly-layer');
  if (!l) { l = document.createElement('div'); l.className = 'fly-layer'; $('.droot').appendChild(l); }
  return l;
}
function ghost(m, rect) {
  const el = document.createElement('span');
  el.className = m.face ? faceCls(m.d) : 'card back';
  if (m.face) el.innerHTML = faceHtml(m.u, m.d, false);
  Object.assign(el.style, { position: 'fixed', left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', margin: 0, fontSize: Math.max(6, rect.width / 8.4) + 'px', zIndex: 2 });
  flyLayer().appendChild(el);
  return el;
}
/** カード1枚を、前の場所から今の場所へ飛ばす */
async function flyOne(m, P, i) {
  // これから召喚の演出をするカードは、ここでは飛ばさない（演出が始まるまで見えないままにする）
  if (pendingSummons.some(j => j && j.uid === m.u && !j.search && !j.handOpen && !j.handAdd)) {
    const el = ROOT.querySelector(`#board [data-uid="${m.u}"]`); if (el) el.style.visibility = 'hidden';
    return;
  }
  const pileRect = (p, z) => P.piles[`${p}:${z}`];
  const fromR = P.from.get(m.u) || pileRect(m.fromP, m.from);
  const destEl = ROOT.querySelector(`#board [data-uid="${m.u}"], #hand0 [data-uid="${m.u}"], #hand1 [data-uid="${m.u}"]`);
  const toR = destEl ? destEl.getBoundingClientRect() : (ROOT.querySelector(`#board [data-pile="${m.toP}:${m.to}"]`) || {}).getBoundingClientRect?.();
  if (!fromR || !toR) return;
  // 盤面のカードと同じ大きさの写しを作る（山札などのマスから出る時は、カードの大きさにそろえる）
  const w = destEl ? toR.width : Math.min(fromR.width, toR.width) * .72;
  const start = { left: fromR.left + (fromR.width - w) / 2, top: fromR.top + (fromR.height - w * 86 / 59) / 2, width: w };
  const g = ghost(m, start);
  if (destEl) destEl.style.visibility = 'hidden';
  await wait(i * 45);
  // 無効：赤い×印
  if (m.negate) {
    const x = document.createElement('span'); x.className = 'fx-cross';
    Object.assign(x.style, { left: fromR.left + 'px', top: fromR.top + 'px', width: fromR.width + 'px', height: fromR.height + 'px' });
    flyLayer().appendChild(x);
    await x.animate([{ transform: 'scale(1.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1, offset: .35 }, { transform: 'scale(1)', opacity: 1 }], { duration: dur(520), easing: 'ease-out' }).finished;
    x.remove();
  }
  // 効果で破壊：赤く光って震えてから
  if (m.destroy && ['mzone', 'emz', 'szone', 'fzone'].includes(m.from)) {
    await g.animate([{ transform: 'none', filter: 'none' }, { transform: 'translateX(-4px) rotate(-4deg)', filter: 'brightness(1.6) drop-shadow(0 0 10px #ff4a3d)' }, { transform: 'translateX(4px) rotate(4deg)', filter: 'brightness(1.6) drop-shadow(0 0 10px #ff4a3d)' }, { transform: 'none', filter: 'brightness(.7)' }], { duration: dur(300) }).finished;
  }
  const tx = toR.left + (toR.width - w) / 2 - start.left, ty = toR.top + (toR.height - w * 86 / 59) / 2 - start.top;
  const banish = m.to === 'banished', toPile = !destEl;
  const end = `translate(${tx}px,${ty}px) rotate(${toPile ? (m.to === 'gy' ? -8 : 0) : 0}deg) scale(${toPile ? .9 : 1})`;
  await g.animate([{ transform: 'none', opacity: 1, filter: m.destroy ? 'brightness(.7)' : 'none' },
    { transform: `translate(${tx * .5}px,${ty * .5 - 26}px) scale(1.08)`, opacity: 1, offset: .5 },
    { transform: end, opacity: banish ? 0 : 1, filter: banish ? 'hue-rotate(220deg) brightness(1.4) blur(1px)' : 'none' }],
  { duration: dur(toPile ? 460 : 400), easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }).finished;
  g.remove();
  if (destEl) destEl.style.visibility = '';
}
/** 発動：カードが光る。墓地で発動した時は、墓地からカードが浮かび上がる */
async function activateOne(a, P, i) {
  await wait(i * 120);
  const col = a.kind === 'spell' ? '#5dbfa1' : a.kind === 'trap' ? '#d98bb2' : '#ffd27a';
  const el = ROOT.querySelector(`#board [data-uid="${a.uid}"], #hand0 [data-uid="${a.uid}"], #hand1 [data-uid="${a.uid}"]`);
  if (a.zone === 'gy' || a.zone === 'banished' || !el) {
    const pile = ROOT.querySelector(`#board [data-pile="${a.p}:${a.zone}"]`);
    if (!pile) return;
    const r = pile.getBoundingClientRect(), w = r.width * .72;
    const g = ghost({ face: true, u: a.uid, d: a.d }, { left: r.left + (r.width - w) / 2, top: r.top + (r.height - w * 86 / 59) / 2, width: w });
    g.classList.add('fx-soul');
    await g.animate([{ transform: 'translateY(0) scale(.9)', opacity: 0, filter: 'drop-shadow(0 0 0 #b67cff)' },
      { transform: 'translateY(-34px) scale(1.15)', opacity: 1, filter: 'drop-shadow(0 0 14px #b67cff) brightness(1.15)', offset: .35 },
      { transform: 'translateY(-40px) scale(1.15)', opacity: 1, filter: 'drop-shadow(0 0 18px #b67cff) brightness(1.15)', offset: .8 },
      { transform: 'translateY(-50px) scale(1.2)', opacity: 0, filter: 'drop-shadow(0 0 24px #b67cff)' }], { duration: dur(1100), easing: 'ease-out' }).finished;
    g.remove();
    return;
  }
  const r = el.getBoundingClientRect(), ring = document.createElement('span');
  ring.className = 'fx-ring';
  Object.assign(ring.style, { left: (r.left + r.width / 2) + 'px', top: (r.top + r.height / 2) + 'px', borderColor: col });
  flyLayer().appendChild(ring);
  el.animate([{ filter: 'none', transform: getComputedStyle(el).transform === 'none' ? 'none' : getComputedStyle(el).transform }, { filter: `brightness(1.35) drop-shadow(0 0 12px ${col})` }, { filter: 'none' }], { duration: dur(700) });
  await ring.animate([{ transform: 'translate(-50%,-50%) scale(.4)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(2.4)', opacity: 0 }], { duration: dur(650), easing: 'ease-out' }).finished;
  ring.remove();
}
async function banner(text, cls, ms) {
  const b = document.createElement('div');
  b.className = `fx-banner ${cls}`;
  b.innerHTML = `<b>${esc(text)}</b>`;
  flyLayer().appendChild(b);
  await b.animate([{ transform: 'translate(-50%,-50%) scaleX(0)', opacity: 0 }, { transform: 'translate(-50%,-50%) scaleX(1)', opacity: 1, offset: .2 }, { transform: 'translate(-50%,-50%) scaleX(1)', opacity: 1, offset: .8 }, { transform: 'translate(-50%,-50%) scaleX(1.05)', opacity: 0 }], { duration: dur(ms), easing: 'ease-out' }).finished;
  b.remove();
}
/** 選んだカードにロックオンの演出（照準が縮んで重なり、光る）。色は効果の内容に合わせる */
async function lockOn(uids, prompt = '') {
  if (fxMode() === 'none' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const col = /破壊|墓地へ送/.test(prompt) ? '#ff5a4d' : /手札に戻|デッキに戻|除外/.test(prompt) ? '#5aa9ff' : /特殊召喚|蘇生|手札に加/.test(prompt) ? '#ffd24a' : /コントロール|奪/.test(prompt) ? '#c58cff' : '#ff8ad8';
  // 盤面・手札にあればそのカード、墓地・除外・デッキなどにあれば、その置き場をねらう
  const els = uids.map(u => ROOT.querySelector(`#board [data-uid="${u}"], #hand0 [data-uid="${u}"], #hand1 [data-uid="${u}"]`) || (S.cards[u] && pileEl(S.cards[u].owner, S.cards[u].zone))).filter(Boolean);
  if (!els.length) return;
  play(['target']);
  await Promise.all(els.map(async (el, i) => {
    const r = el.getBoundingClientRect(), ring = document.createElement('span');
    ring.className = 'fx-lock'; ring.style.setProperty('--lc', col);
    const sz = Math.max(r.width, r.height) * 1.25;
    Object.assign(ring.style, { left: (r.left + r.width / 2 - sz / 2) + 'px', top: (r.top + r.height / 2 - sz / 2) + 'px', width: sz + 'px', height: sz + 'px' });
    flyLayer().appendChild(ring);
    await wait(i * 90);
    await ring.animate([{ transform: 'scale(2.2) rotate(-90deg)', opacity: 0 }, { transform: 'scale(1) rotate(0deg)', opacity: 1, offset: .55 }, { transform: 'scale(.92)', opacity: 1, offset: .75 }, { transform: 'scale(1.05)', opacity: 0 }], { duration: dur(560), easing: 'cubic-bezier(.2,.8,.2,1)' }).finished;
    ring.remove();
    el.animate([{ filter: 'none' }, { filter: `brightness(1.6) drop-shadow(0 0 10px ${col})` }, { filter: 'none' }], { duration: dur(320) });
  }));
}
/** 画面を更新した後：たまっている移動・発動・ターン・勝敗の演出を再生する */
function playPendingMoves() {
  if (!pendingMoves || (fxN > 0)) return false;
  const P = pendingMoves; pendingMoves = null;
  fxN++;
  (async () => {
    try {
      await Promise.all(P.moves.map((m, i) => flyOne(m, P, i)));
      await Promise.all(P.acts.map((a, i) => activateOne(a, P, i)));
      if (P.win !== null) await banner(P.win === 'draw' ? '引き分け' : cpuMode() ? (P.win === 0 ? '勝利！' : '敗北…') : `${NAME(P.win)}の勝利！`, P.win === 0 || !cpuMode() ? 'win' : 'lose', 1800);
      else if (P.turn !== null) await banner(cpuMode() ? (P.turn === 0 ? 'あなたのターン' : 'CPUのターン') : `${NAME(P.turn)}のターン`, P.turn === 0 ? 'me' : 'opp', 1000);
    } catch (e) { console.error(e); }
    const l = $('.fly-layer'); if (l) l.innerHTML = '';
    fxN = Math.max(0, fxN - 1);
    render();
  })();
  return true;
}
/* LP：数字をなめらかに増減させる */
const lpShown = [null, null], lpAnim = [0, 0];
function tweenLp(el, p, to) {
  const from = lpShown[p] ?? to;
  lpShown[p] = to;
  if (from === to || fxMode() === 'none') { el.textContent = to; return; }
  const t0 = performance.now(), id = ++lpAnim[p], d = dur(600);
  const step = now => {
    if (id !== lpAnim[p]) return;
    const k = Math.min(1, (now - t0) / d), v = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
    el.textContent = v;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- シート（スマホ） ---------- */
function renderSheets() {
  const humanChoice = S.pending && !isCpu(S.pending.request.player);
  const detailOpen = narrow() && ((humanChoice && !peek && !fan) || (sheet === 'detail' && selected !== null));
  const logOpen = narrow() && sheet === 'log' && !detailOpen;
  $('#detailSheet').classList.toggle('open', detailOpen);
  $('#logSheet').classList.toggle('open', logOpen);
  $('#scrim').hidden = !(detailOpen || logOpen);
}
function closeSheets() {
  if (S.pending && !isCpu(S.pending.request.player)) peek = true;
  sheet = null; selected = null;
  render();
}

/* ---------- スマホの手札トレイ：上下のスワイプで開け閉め。閉じるとドック（エンドなど）が出る ---------- */
let trayOpen = true, trayAuto = false;
function setTray(open, auto = false) {
  trayOpen = open; trayAuto = auto && !open;
  const r = $('.droot'); if (!r) return;
  r.classList.toggle('tray-closed', !open);
  const h = $('#trayHandle'); if (h) h.setAttribute('aria-expanded', String(open));
  const n = S ? S.players[0].hand.length : 0;
  const l = $('#trayLbl'); if (l) l.textContent = open ? '下にスワイプでしまう' : `上にスワイプで手札（${n}枚）`;
  measureBottom();
}
function measureBottom() {
  const r = $('.droot'), t = $('#tray'), d = $('#dock'); if (!r || !t || !d) return;
  const dh = Math.ceil(d.getBoundingClientRect().height);
  r.style.setProperty('--dock-h', dh + 'px');
  const bh = narrow() ? (trayOpen ? Math.ceil(t.getBoundingClientRect().height) : dh + 62) : dh;
  r.style.setProperty('--bottom-h', bh + 'px');
  const b = $('#board');
  if (b && narrow() && !trayOpen) {
    const top = b.getBoundingClientRect().top - r.getBoundingClientRect().top;
    r.style.setProperty('--board-h', Math.max(220, Math.floor(window.innerHeight - top - bh - 10)) + 'px');
  }
}
/** 返事が要る時（チェーンの確認・選択・決着）は自動で閉じてボタンを見せ、自分の番に戻ったら開き直す */
function autoTray() {
  if (!narrow() || !S) return;
  const needs = S.winner !== null || (humanActing() && (S.pending || (S.window.kind === 'priority' && activatableList(S, actorOf(S)).length)));
  if (needs && trayOpen) setTray(false, true);
  else if (!needs && !trayOpen && trayAuto && humanActing() && S.turnPlayer === actorOf(S) && S.window.kind !== 'priority') setTray(true);
  else setTray(trayOpen, trayAuto);
}
/** 指の位置にある手札のカード（重なっている時は上のカード） */
function cardAt(x, y) {
  const cs = [...ROOT.querySelectorAll('#hand0 .card')];
  let best = null;
  for (const c of cs) { const r = c.getBoundingClientRect(); if (x >= r.left && x <= r.right && y >= r.top - 30 && y <= r.bottom + 30 && (!best || Number(c.style.getPropertyValue('--z')) > Number(best.style.getPropertyValue('--z')))) best = c; }
  if (best) return best;
  // カードの少し上下でも、横の位置がいちばん近いカード
  let d = 1e9;
  for (const c of cs) { const r = c.getBoundingClientRect(), k = Math.abs(x - (r.left + r.width / 2)); if (k < d && k < r.width) { d = k; best = c; } }
  return best;
}
/** カード1枚がパチッと震える */
function pachiCard(c) {
  play(['pachi1']);
  c.animate([{ translate: '0 0', rotate: '0deg' }, { translate: '0 -10px', rotate: '-3deg' }, { translate: '0 2px', rotate: '2deg' }, { translate: '0 -4px', rotate: '-1deg' }, { translate: '0 0', rotate: '0deg' }], { duration: 180, easing: 'ease-out' });
  if (navigator.vibrate) try { navigator.vibrate(6); } catch { /* 振動できない端末 */ }
}
/** 手札を左右にスワイプ：スワイプした向きに、カードが1枚ずつ震えてパチパチ鳴る */
let pachiBusy = false;
async function shakaPachi(toRight) {
  if (pachiBusy) return; pachiBusy = true;
  const cs = [...ROOT.querySelectorAll('#hand0 .card')]; if (!toRight) cs.reverse();
  for (const c of cs) {
    play(['pachi1']);
    c.animate([{ translate: '0 0', rotate: '0deg' }, { translate: '0 -9px', rotate: '-3deg' }, { translate: '0 2px', rotate: '2deg' }, { translate: '0 -4px', rotate: '-1deg' }, { translate: '0 0', rotate: '0deg' }], { duration: 170, easing: 'ease-out' });
    await wait(70);
  }
  pachiBusy = false;
}
/* 罠カードが手札に来たら、シャカパチ（手札が跳ねてパチパチ音） */
let handSeen = null;
function checkPachi() {
  const me = 0, h = S.players[me].hand; // 下の手札（#hand0）はいつもP1
  const prev = handSeen; handSeen = { p: me, set: new Set(h) };
  if (!prev || prev.p !== me) return;
  const fresh = h.filter(u => !prev.set.has(u) && defOf(S, u).kind === 'trap');
  if (!fresh.length) return;
  const el = $('#hand0'); if (!el) return;
  setTimeout(() => {
    fresh.forEach(u => { const c = el.querySelector(`.card[data-uid="${u}"]`); if (c) { c.classList.add('newtrap'); setTimeout(() => c.classList.remove('newtrap'), 1400); } });
    el.classList.remove('pachi'); void el.offsetWidth; el.classList.add('pachi');
    setTimeout(() => el.classList.remove('pachi'), 900);
    if (narrow() && !trayOpen) setTray(true);
    play(['pachi']);
  }, 450);
}
function render() {
  if ((fxN > 0)) { renderSheets(); return; } // 演出が終わってから画面を更新する（開いていたシートは先に閉じる）
  if (fan && !(S.pending && !isCpu(S.pending.request.player) && isDeckPick(S.pending.request))) closeFan();
  canAct = new Set(S.pending ? [] : activatableList(S, actorOf(S)).map(a => a.uid));
  renderBoard(); renderSide(); renderTop(); renderChain(); renderDetail(); renderLog(); renderDock(); renderSheets(); autoTray(); checkPachi();
  // これから召喚の演出をするカードは、演出が始まるまで盤面に出さない（先に置かれてから巻き戻って見えないように）
  for (const j of pendingSummons) if (j && j.uid != null && !j.search && !j.handOpen && !j.handAdd) { const el = ROOT.querySelector(`#board [data-uid="${j.uid}"]`); if (el) el.style.visibility = 'hidden'; }
  $('#result').hidden = S.winner === null;
  if (S.winner !== null) $('#result').textContent = S.winner === 'draw' ? `引き分け：${S.winReason}` : `${NAME(S.winner)}の勝利：${S.winReason}`;
  // カードの移動・召喚の演出があれば、それが終わるまでCPUの手番と自動パスを待つ
  if (playPendingMoves()) { saveSoon(); return; }
  if (playPendingSummons()) { saveSoon(); return; }
  scheduleCpu();
  scheduleAutoPass();
  saveSoon();
}

/* ---------- 途中のデュエルを、この端末に覚えておく（ページを閉じても続きから） ---------- */
const SAVE_V = 1;
let saveT;
function saveSoon() {
  if (!OPTS.storageKey) return;
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    try {
      if (!S || S.winner !== null) localStorage.removeItem(OPTS.storageKey);
      else localStorage.setItem(OPTS.storageKey, JSON.stringify({ v: SAVE_V, S, trace, mode: $('#mode').value, d0: $('#deck0').value, d1: $('#deck1').value }));
    } catch { /* 保存できない環境では覚えない */ }
  }, 400);
}
function loadSaved() {
  if (!OPTS.storageKey) return null;
  try { const j = JSON.parse(localStorage.getItem(OPTS.storageKey) || 'null'); return j && j.v === SAVE_V && j.S ? j : null; } catch { return null; }
}

/* ---------- 墓地・除外・EXデッキの中身 ---------- */
function showPile(p, kind) {
  const list = S.players[p][kind];
  const label = { deck: 'デッキ', gy: '墓地', extra: 'EXデッキ', banished: '除外' }[kind];
  const hiddenExtra = kind === 'extra' && isCpu(p);
  const body = kind === 'deck' || hiddenExtra ? `<p class="menu-note">中身は見られません（${list.length}枚）。</p>` :
    list.length ? `<div class="pilelist">${[...list].reverse().map(u => cardHtml(u)).join('')}</div>` : '<p class="menu-note">カードはありません。</p>';
  $('#pileBox').innerHTML = `<div class="box-head"><h3>${NAME(p)}の${label}（${list.length}枚）</h3><button class="btn small ghost" id="pileClose">閉じる</button></div>${body}`;
  $('#pileDlg').hidden = false;
}

/* ---------- メニュー ---------- */
function openMenu() { $('#menu').hidden = false; $('#menuBtn').setAttribute('aria-expanded', 'true'); disarm(); }
function closeMenu() { $('#menu').hidden = true; $('#menuBtn').setAttribute('aria-expanded', 'false'); disarm(); }
let armT;
function disarm() { const b = $('#surrender'); b.classList.remove('armed'); b.textContent = 'サレンダーする'; clearTimeout(armT); }
function surrender() {
  const b = $('#surrender');
  if (S.winner !== null) { closeMenu(); return; }
  // 押し間違いを防ぐため、2回押して確定する
  if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'もう一度押すとサレンダー'; armT = setTimeout(disarm, 3000); return; }
  disarm(); closeMenu();
  if (cpuMode()) { clearTimeout(cpuTimer); history.push(S); commit(applyAction(S, { type: 'surrender', player: 0 })); render(); return; }
  run({ type: 'surrender', player: actorOf(S) });
}

/* ---------- イベント（boot から呼ぶ） ---------- */
function wireSheets(root) {
  root.querySelectorAll('.sheet').forEach(sh => {
    let y0 = null, dy = 0, drag = false;
    sh.addEventListener('touchstart', e => { if (!narrow() || !sh.classList.contains('open') || e.touches.length !== 1) return; y0 = e.touches[0].clientY; dy = 0; drag = false; }, { passive: true });
    sh.addEventListener('touchmove', e => {
      if (y0 === null) return;
      dy = e.touches[0].clientY - y0;
      // 中身が一番上までスクロールしている時だけ、下へのドラッグでシートを動かす
      if (!drag && (dy < 8 || sh.scrollTop > 0)) { if (dy < 0 || sh.scrollTop > 0) y0 = null; return; }
      drag = true;
      if (e.cancelable) e.preventDefault();
      sh.style.transition = 'none';
      sh.style.transform = `translateY(${Math.max(0, dy)}px)`;
    }, { passive: false });
    const end = () => {
      if (y0 === null) return;
      y0 = null;
      if (!drag) return;
      sh.style.transition = ''; sh.style.transform = '';
      if (dy > 70) closeSheets();
    };
    sh.addEventListener('touchend', end); sh.addEventListener('touchcancel', end);
  });
}
function wireTray(root) {
  const t = root.querySelector('#tray'); if (!t) return;
  let y0 = null, x0 = 0, swiped = false;
  t.addEventListener('pointerdown', e => { if (!narrow()) return; y0 = e.clientY; x0 = e.clientX; swiped = false; });
  t.addEventListener('pointerup', e => {
    if (y0 === null) return;
    const dy = e.clientY - y0, dx = e.clientX - x0; y0 = null;
    swipeEnd(dx, dy);
  });
  t.addEventListener('pointercancel', () => { y0 = null; });
  // スマホのブラウザによっては指の動きが pointer で届かないので、touch でも受ける（同じ向きに何度開け閉めしても結果は同じ）
  let ty0 = null, tx0 = 0;
  // 横になぞっている間：指の下に来たカードを1枚ずつ震わせて鳴らす（同じカードは指が離れて戻るまで1回）
  let lastCard = null, strummed = false, sx = null, sy = 0;
  const strumStart = (x, y) => { lastCard = null; strummed = false; sx = x; sy = y; };
  const strumMove = (x, y) => {
    if (sx === null || !trayOpen || !narrow()) return;
    if (!strummed && (Math.abs(x - sx) < 8 || Math.abs(x - sx) < Math.abs(y - sy))) return;
    strummed = true;
    const c = cardAt(x, y);
    if (c && c !== lastCard) { lastCard = c; pachiCard(c); }
  };
  t.addEventListener('pointerdown', e => strumStart(e.clientX, e.clientY));
  t.addEventListener('pointermove', e => strumMove(e.clientX, e.clientY));
  t.addEventListener('touchmove', e => { const p = e.touches[0]; if (p) strumMove(p.clientX, p.clientY); }, { passive: true });
  t.addEventListener('touchstart', e => { const p = e.touches[0]; if (p) strumStart(p.clientX, p.clientY); }, { passive: true });
  ['pointerup', 'pointercancel', 'touchend'].forEach(ev => t.addEventListener(ev, () => { sx = null; }));
  const swipeEnd = (dx, dy) => {
    if (Math.abs(dy) > 28 && Math.abs(dy) > Math.abs(dx) * 1.2) { swiped = true; setTray(dy < 0); return; }
    if (strummed) swiped = true;
  };
  t.addEventListener('touchstart', e => { if (!narrow() || e.touches.length !== 1) return; ty0 = e.touches[0].clientY; tx0 = e.touches[0].clientX; }, { passive: true });
  t.addEventListener('touchend', e => { if (ty0 === null) return; const p = e.changedTouches[0], dy = p.clientY - ty0, dx = p.clientX - tx0; ty0 = null; swipeEnd(dx, dy); }, { passive: true });
  // スワイプした後の「押した」は、カードを選ばないようにする
  t.addEventListener('click', e => {
    if (swiped) { swiped = false; e.stopPropagation(); e.preventDefault(); return; }
    if (narrow() && !trayOpen && !e.target.closest('#trayHandle')) { e.stopPropagation(); e.preventDefault(); setTray(true); }
  }, true);
  root.querySelector('#trayHandle').addEventListener('click', e => { e.stopPropagation(); setTray(!trayOpen); });
}
function wire(root) {
/* 墓地・除外・デッキ・EX：長押し（パソコンは右クリックでも）で中身の一覧。スマホでは普通に押すと一番上のカードの説明 */
let pressT = null, pressEl = null, pressXY = null, pressFired = false;
function pressEnd() { clearTimeout(pressT); pressT = null; if (pressEl) pressEl.classList.remove('pressing'); pressEl = null; }
root.addEventListener('pointerdown', e => {
  pressFired = false; // 前の長押しの後に「押した」が来なかった時のため、押し始めで戻す
  const el = e.target.closest && e.target.closest('#board [data-pile]');
  if (!el || e.button > 0) return;
  pressEnd(); pressEl = el; pressXY = [e.clientX, e.clientY];
  el.classList.add('pressing');
  pressT = setTimeout(() => { const [p, k] = el.dataset.pile.split(':'); pressFired = true; pressEnd(); if (navigator.vibrate) try { navigator.vibrate(15); } catch { /* 振動できない端末 */ } showPile(Number(p), k); }, 450);
});
root.addEventListener('pointermove', e => { if (pressT && pressXY && Math.hypot(e.clientX - pressXY[0], e.clientY - pressXY[1]) > 10) pressEnd(); });
['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => root.addEventListener(ev, () => { if (pressT) pressEnd(); }));
root.addEventListener('contextmenu', e => {
  const el = e.target.closest && e.target.closest('#board [data-pile]');
  if (!el) return;
  e.preventDefault();
  if (!pressFired) { const [p, k] = el.dataset.pile.split(':'); showPile(Number(p), k); }
});
root.addEventListener('click', e => {
  // 長押しで一覧を開いた直後の「押した」は無視する
  if (pressFired) { pressFired = false; e.preventDefault(); return; }
  const t = e.target;
  if (t.closest('[data-fanok]')) { if (fan) fanFinish(fan.sel); return; }
  if (t.closest('[data-fanskip]')) { fanFinish([]); return; }
  if (t.closest('[data-fanundo]')) { closeFan(); undo(); return; }
  const fanEl = t.closest('[data-fan]');
  if (fanEl) {
    const fu = Number(fanEl.dataset.fan);
    if (narrow() && fan && (!fan.peek || fan.peek !== fu || !fan.req.options.includes(fu))) { fanPeek(fanEl, fu); return; }
    fanPick(fu); return;
  }
  if (t.closest('#again') || t.closest('[data-again="1"]')) { newDuel(); return; }
  if (t.closest('[data-reopen="1"]')) { peek = false; render(); return; }
  if (t.closest('#stopBtn')) { stopNext = !stopNext; renderDock(); return; }
  if (t.closest('#reviewBtn')) { showReview(); return; }
  if (t.closest('#reviewClose') || t.id === 'reviewDlg') { $('#reviewDlg').hidden = true; return; }
  if (t.closest('#closeDuel')) { clearTimeout(cpuTimer); OPTS.onClose?.(); return; }
  if (t.closest('#reopen')) { peek = false; render(); return; }
  if (t.closest('[data-close]') || t.id === 'scrim') { closeSheets(); return; }
  if (t.closest('#logBtn')) { sheet = sheet === 'log' ? null : 'log'; renderSheets(); return; }
  if (t.closest('#menuBtn')) { openMenu(); return; }
  if (t.closest('#menuClose') || t.id === 'menu') { closeMenu(); return; }
  if (t.closest('#surrender')) { surrender(); return; }
  const actEl = t.closest('[data-act]');
  if (actEl) {
    // カードの説明から操作した時は、説明を閉じて盤面の演出が見えるようにする
    if (actEl.closest('#detailSheet')) { sheet = null; selected = null; }
    run(JSON.parse(actEl.dataset.act)); return;
  }
  const ansEl = t.closest('[data-ans]');
  if (ansEl) { sheet = null; selected = null; run({ type: 'answer', value: JSON.parse(ansEl.dataset.ans) }); return; }
  const optEl = t.closest('[data-opt]');
  if (optEl) { togglePick(Number(optEl.dataset.opt)); return; }
  if (t.closest('#confirmPick')) {
    // 選ぶ画面を先に閉じて、盤面の選んだカードにロックオンしてから答える
    const chosen = pick.slice(), prompt = S.pending.request.prompt;
    sheet = null; selected = null; $('#detailSheet').classList.remove('open'); $('#scrim').hidden = true;
    lockOn(chosen, prompt).then(() => run({ type: 'answer', value: chosen }));
    return;
  }
  if (t.closest('#pileClose') || t.id === 'pileDlg') { $('#pileDlg').hidden = true; return; }
  // パソコン（広い画面）では、置き場を押すと一覧。スマホでは一番上のカードの説明（一覧は長押し）
  const pileHit = t.closest('#board [data-pile]');
  if (pileHit && !narrow() && !(S.pending && S.pending.request.kind === 'cards')) { const [p, k] = pileHit.dataset.pile.split(':'); showPile(Number(p), k); return; }
  const cardEl = t.closest('[data-uid]');
  if (cardEl) {
    const u = Number(cardEl.dataset.uid);
    // 選択中なら、盤面のカードを押しても選べる
    if (S.pending && S.pending.request.kind === 'cards' && S.pending.request.options.includes(u) && !isCpu(S.pending.request.player)) { togglePick(u); return; }
    selected = u; sheet = 'detail';
    if (cardEl.closest('#pileDlg')) $('#pileDlg').hidden = true;
    render();
    return;
  }
  const pileEl = t.closest('[data-pile]');
  if (pileEl) { const [p, k] = pileEl.dataset.pile.split(':'); showPile(Number(p), k); }
});
root.addEventListener('change', e => {
  if (e.target.id === 'hideOpp') renderSide();
  if (e.target.id === 'mode') { $('#hideOppRow').hidden = cpuMode(); render(); }
});
document.addEventListener('keydown', e => {
  if (OPTS.isOpen && !OPTS.isOpen()) return; // ルールページで対戦画面を閉じている間は反応しない
  // スペースキー：右下の「進む」ボタン（文字を入力している時は除く）
  if (e.key === ' ' && !/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test((e.composedPath()[0] || {}).tagName || '')) { const g = $('#goBtn'); if (g && !g.disabled) { e.preventDefault(); g.click(); } return; }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
  if (e.key === 'Escape') {
    if (!$('#pileDlg').hidden) $('#pileDlg').hidden = true;
    else if (!$('#menu').hidden) closeMenu();
    else closeSheets();
  }
});
$('#undo').onclick = undo;
$('#newDuel').onclick = newDuel;
// 効果音：ブラウザは操作の後でないと音を出せないので、最初に触った時に準備する
root.addEventListener('pointerdown', unlock, { passive: true });
$('#soundBtn').onclick = () => { setSoundEnabled(!soundEnabled()); renderSoundBtn(); if (soundEnabled()) play(['spell']); };
renderSoundBtn();
// CPUの速さは、この端末に覚えておく
try { const v = localStorage.getItem('gx-duel-cpu-speed'); if (v) $('#cpuSpeed').value = v; } catch { /* 保存できない環境 */ }
// 攻撃の演出も、この端末に覚えておく
try { const v = localStorage.getItem('gx-duel-fx'); if (v) $('#fxMode').value = v; } catch { /* 保存できない環境 */ }
$('#fxMode').onchange = () => { try { localStorage.setItem('gx-duel-fx', $('#fxMode').value); } catch { /* 保存できない環境 */ } };
// チェーンの確認も、この端末に覚えておく
try { const v = localStorage.getItem('gx-duel-chain-mode'); if (v) $('#chainMode').value = v; } catch { /* 保存できない環境 */ }
$('#chainMode').onchange = () => { try { localStorage.setItem('gx-duel-chain-mode', $('#chainMode').value); } catch { /* 保存できない環境 */ } if (S) render(); };
$('#cpuSpeed').onchange = () => { try { localStorage.setItem('gx-duel-cpu-speed', $('#cpuSpeed').value); } catch { /* 保存できない環境 */ } };
matchMedia('(max-width: 860px)').addEventListener('change', () => S && render());
// 画面の幅が変わったら、手札の扇を並べ直す
if (window.ResizeObserver) { const ro = new ResizeObserver(() => { fanOut($('#hand0')); fanOut($('#hand1')); }); ro.observe($('#hand0')); ro.observe($('#hand1')); }
}
function togglePick(u) {
  const r = S.pending.request;
  if (pick.includes(u)) pick = pick.filter(x => x !== u);
  else if (r.max === 1) pick = [u];
  else if (pick.length < r.max) pick = [...pick, u];
  renderDetail(); renderBoard(); renderSide();
}
function renderSoundBtn() { const on = soundEnabled(); $('#soundBtn').innerHTML = on ? '<span aria-hidden="true">🔊</span><span class="bl"> 音 オン</span>' : '<span aria-hidden="true">🔇</span><span class="bl"> 音 オフ</span>'; $('#soundBtn').setAttribute('aria-label', on ? '効果音 オン' : '効果音 オフ'); $('#soundBtn').setAttribute('aria-pressed', String(on)); }

/* ---------- 起動 ---------- */
/**
 * 対戦画面を root（Shadow DOM など）の中で動かす。
 * opts.onClose：「ルールブックに戻る」ボタンを出し、押されたら呼ぶ
 * opts.isOpen：画面が見えているか（見えていない間はキー操作に反応しない）
 * opts.storageKey：途中のデュエルをこの端末に覚えておくキー
 * opts.standalone：単独のページ（Claude の hot 保存を使う）
 */
export function boot(root, opts = {}) {
  ROOT = root; OPTS = opts;
  setPool(CARD_POOL);
  $('#deck0').innerHTML = deckOptions();
  $('#deck1').innerHTML = deckOptions();
  for (const i of [0, 1]) $(`#deck${i}`).addEventListener('change', showDeckFmt);
  $('#closeDuel').hidden = !opts.onClose;
  wire(root);
  // スマホでは、下に固定したドック・手札トレイの高さだけ盤面の下を空ける
  if (typeof ResizeObserver !== 'undefined') { const ro = new ResizeObserver(() => measureBottom()); ['#dock', '#tray'].forEach(q => { const e = root.querySelector(q); if (e) ro.observe(e); }); }
  wireTray(root);
  wireSheets(root);
  window.addEventListener('resize', () => measureBottom());
  measureBottom();
  const start = data => {
    if (data && data.mode) $('#mode').value = data.mode;
    if (data && data.d0 && DECKS[data.d0]) $('#deck0').value = data.d0;
    if (data && data.d1 && DECKS[data.d1]) $('#deck1').value = data.d1;
    $('#hideOppRow').hidden = cpuMode();
    showDeckFmt();
    if (data && data.S && (data.v === 4 || data.v === SAVE_V)) {
      try { S = data.S; history = data.history || []; trace = Array.isArray(data.trace) ? data.trace : []; lastLp = [S.players[0].lp, S.players[1].lp]; render(); return; }
      catch (e) { console.warn('保存していたデュエルを開けませんでした', e); }
    }
    newDuel();
    // ルールページでは、最初にデッキを選べるようにメニューを開く
    if (opts.menuFirst) openMenu();
  };
  // 動作確認用：開発者ツールから状態を読み書きできるようにする
  window.__duel = { get state() { return S; }, speak(t) { speak(t); }, act(a) { run(a); }, review(tr) { if (tr) trace = tr; showReview(); }, get cpu() { return { thinking: thinking === S, ready: !!ready, waiting: waiting.size, worker: !!worker, workerBroken, timer: cpuTimer, trace: trace.length }; }, load(s) { clearTimeout(cpuTimer); S = s; history = []; selected = null; pick = []; lastLp = [s.players[0].lp, s.players[1].lp]; render(); } };
  if (opts.standalone) {
    window.claude?.hot?.snapshot?.(() => ({ v: 4, S, history: history.slice(-30), mode: $('#mode').value }));
    window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
  } else start(loadSaved());
}
/** 画面を開き直した時：止めていたCPUの手番を再開する */
export function resume() { if (S) render(); }
