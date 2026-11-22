// 対戦画面（第5段階：CPU対戦）。エンジンは ./engine/game.js、CPU は ./ai/cpu.js
// 画面の考え方：やることは画面下の「操作ドック」にまとめる。カードを押すと、PCは右の欄、スマホは下から出るシートに操作が出る。
import { aceInfo, aceCodes } from './ai/aces.js?v=20261123-0838-30c7db42b4';
import { fullThink } from './ai/levels.js?v=20261123-0838-30c7db42b4';
import { lineFor, effectLine, randomPersona, PERSONA_KEYS } from './lines.js?v=20261123-0838-30c7db42b4';
import { play, unlock, soundEnabled, setSoundEnabled } from './sound.js?v=20261123-0838-30c7db42b4';
import { playBattle, playSummon, rarityOf } from './fx.js?v=20261123-0838-30c7db42b4';
import { playSignature, sigKey } from './sig.js?v=20261123-0838-30c7db42b4';
import { playerName, whoText, whoNames, resultText, oppWord } from './names.js?v=20261123-0838-30c7db42b4';
import { firstEntrance } from './aces.js?v=20261123-0838-30c7db42b4';
import { RULINGS } from './data/rulings.js?v=20261123-0838-30c7db42b4';
import { rulingsFor, nameIndex, linkNames, rulingsHtml } from './rulings.js?v=20261123-0838-30c7db42b4';
import { GUIDE_KEY, guidePages, guideHtml } from './guide.js?v=20261123-0838-30c7db42b4';
import { DuelLink, tabRoom, BUILD_FP } from './net/duel-link.js?v=20261123-0838-30c7db42b4';
import { joinSiteRoom } from './net/site-room.js?v=20261123-0838-30c7db42b4';
import {
  createGame, applyAction, legalActions, defOf, monstersOf, currentAtk, currentDef, PHASE_LABEL, tributesFor, setPool,
  actorOf, activatableList, whyIllegal,
} from './engine/game.js?v=20261123-0838-30c7db42b4';
import { CARD_POOL } from './data/cardpool.js?v=20261123-0838-30c7db42b4';
import { DECKS } from './data/decks.js?v=20261123-0838-30c7db42b4';
import { SCRIPTS } from './cards/index.js?v=20261123-0838-30c7db42b4';

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
/* ---------- 自分の席（画面を見ている人の席）：CPU戦・2人対戦は0。オンライン対戦の子は1になる ----------
 * 画面の下（手札の欄 #hand0・帯 #side0・盤面の下の段）はいつも「自分の席」、上は「相手の席」 */
let mySeat = 0;
let net = null; // オンライン対戦の時だけ：{ link, oppName }（スイッチ ONLINE が入っている時だけ作る）
const ME = () => mySeat;
const OPP = () => 1 - mySeat;
/** 長押しと見なすまでの時間（ミリ秒）。手札・置き場（墓地など）・カードを選ぶ扇、ぜんぶ同じ長さ（No.3 ボスの注文：そろえて少し早く） */
const LONG_PRESS_MS = 300;
const netMode = () => !!net;
/** 画面の上の段・相手の欄に出すプレイヤーか（CPU、またはオンラインの相手）：中身を見せない・操作させない */
const isRemote = p => (netMode() ? p !== mySeat : cpuMode() && p === CPU);
const handEl = p => $(p === mySeat ? '#hand0' : '#hand1');
const sideEl = p => $(p === mySeat ? '#side0' : '#side1');
const cpuMode = () => $('#mode').value === 'cpu';
const isCpu = p => cpuMode() && p === CPU;
const narrow = () => matchMedia('(max-width: 860px)').matches;
/** プレイヤーの呼び名：CPU対戦では「あなた」「CPU」 */
const NAME = p => (netMode() ? (p === ME() ? 'あなた' : (net.oppName || '相手')) : playerName(p, cpuMode()));
/** エンジンが作った文の「P1」「P2」を画面の呼び名に置きかえる（記録・勝ち負けの理由・結果・知らせ） */
const WHO = t => (netMode() ? whoNames(t, [NAME(0), NAME(1)], ME()) : whoText(t, cpuMode()));
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
    if (/の勝利/.test(t)) add(cpuMode() || netMode() ? (next.winner === ME() ? 'win' : 'lose') : 'win');
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
/* ---------- CPU対戦の結果：サイトの戦績・実績へ渡す ----------
 * opts.onResult(rec) を、1回の対戦につき1回呼ぶ。「ひとつ戻す」を使った対戦は undo:true（実績には数えない） */
let undoUsed = false, resultSent = false;
/** 切り札の判定（MEMEの src/ai/aces.ts。CPUのロマン・セリフと同じ判定）。見る人は「あなた」（0）：CPUの手札・裏側のカードには何も返さない。
 *  返り値 { cls: 演出に使う1つ, kinds: 付いている分類ぜんぶ, fallback: 表の無いデッキの予備の判定 } か null */
const aceDecks = () => ({ codes: deckCodes(), names: deckNames() });
function aceOf(st, uid) {
  try { return st && st.cards[uid] ? aceInfo(st, uid, ME(), aceDecks()) : null; } catch { return null; }
}
let aceSeen = new Set(); // この対戦で大きい登場を見せたカード（uid）
/** 自分のデッキの切り札の名前 */
function acesNamesOf(st) {
  try { const codes = aceCodes(st, ME(), aceDecks()); const names = new Set(); for (const c of Object.values(st.cards)) if (c.owner === ME() && codes.has(c.code)) names.add(defOf(st, c.uid).name); return [...names].slice(0, 4); } catch { return []; }
}
function reportResult(prev, next) {
  if (!cpuMode() || placeholder || resultSent || !OPTS.onResult) return;
  resultSent = true;
  const d0 = DECKS[$('#deck0').value] || {}, d1 = DECKS[$('#deck1').value] || {};
  // 切り札でとどめ：最後に相手のLPを0にしたのが、自分のデッキの切り札の攻撃だったか
  let aceFinish = false;
  if (next.winner === 0) {
    const fresh = (next.anim || []).filter(x => x.seq > (prev.animSeq ?? 0) && x.kind === 'battle' && next.cards[x.attacker]?.controller === 0 && (x.damage || []).some(d => d.player === 1));
    const last = fresh[fresh.length - 1];
    if (last) { try { aceFinish = !!aceOf(next, last.attacker); } catch { /* 切り札が分からない */ } }
  }
  const rec = {
    at: Date.now(), result: next.winner === 0 ? 'win' : next.winner === 1 ? 'lose' : 'draw', level: cpuLevel,
    myDeck: d0.theme || d0.name || '', myCode: d0.code || '', cpuDeck: d1.theme || d1.name || '', cpuCode: d1.code || '', cpuOwner: d1.owner || '',
    first: next.log.some(l => /先攻はP1/.test(l.text)), turn: next.turn, myLp: next.players[0].lp, cpuLp: next.players[1].lp,
    undo: undoUsed, aceFinish, persona, surrender: /サレンダー/.test(next.winReason || ''), aces: acesNamesOf(next),
  };
  try { OPTS.onResult(rec); } catch (e) { console.warn('戦績に渡せませんでした', e); }
}
function commit(next) {
  const prev = S;
  S = next;
  if (prev && prev.winner === null && next.winner !== null) reportResult(prev, next);
  if (prev) play(soundsFor(prev, next));
  if (prev) queueBattleFx(prev, next);
  if (prev) queueMoves(prev, next);
  if (prev) { narrate(prev, next); phaseCue(prev, next); }
  // No.10：ネクロバレーで効果が無効になった時は、帯で理由を出す（発動はできて、処理の時に墓地のカードへ及ぶ部分だけ無効。公式Q&A [10691]）。演出を切っていても出す
  if (prev) for (const x of (next.anim || []).filter(a => a.seq > (prev.animSeq ?? 0))) if (x.kind === 'negate' && x.by != null && next.cards[x.uid] && next.cards[x.by]) toast(`「${defOf(next, x.uid).name}」の効果は、「${defOf(next, x.by).name}」の効果で無効になりました（墓地のカードには効果が及びません）`);
}

/* ---------- 攻撃の演出：演出の間は画面の更新とCPUの手番を止め、終わったら続ける ---------- */
let fxN = 0;   // 再生中の演出の数（0 になった時だけ画面を更新する。演出が重なっても途中で描き直さない）
/** 演出の間は、画面のどこを押しても何も起きないようにする（MASTER：途中で飛ばす操作もなし） */
function fxBlock() { const r = ROOT && ROOT.querySelector('.droot'); if (r) r.classList.toggle('fx-busy', fxN > 0); }
/** 召喚・攻撃・カードの演出の間（引く・手札に加える演出は除く）：スマホを横にした時は、盤面にかぶる手札を下へしまう */
/**
 * 演出の記録（見張り用・COLOの道具が読む）：演出が始まるたびに { t, kind, uid, ... } を1件。最大2000件で古いのから消える。
 * kind：glow（元の場所で光る）／soul（墓地・除外で光る）／sig（専用演出。dest＝巻きこまれるカード）／fly（カードが飛ぶ。from・to＝置き場）／summon／battle／render（盤面を描き直した）。
 * 記録をつけるだけで、演出の中身や順番は変えない。window.__duel.fxLog で読み、__duel.fxLogClear() で空にする
 */
const fxLog = [];
function fxRec(kind, uid, extra) { fxLog.push({ t: performance.now(), kind, uid: uid ?? null, ...(extra || {}) }); if (fxLog.length > 2000) fxLog.splice(0, fxLog.length - 2000); }
/** No.26：専用演出の場所は、発動した時に測っておく。演出が始まるまでに盤面が動いた（手札が閉じた等）時は、カードの写しが元のマスからずれて見えるので、盤面が動いた分だけ全部の場所をずらす */
function followBoard(info) {
  const b = ROOT && ROOT.querySelector('#board'); if (!b || !info || !info.board) return;
  const r = b.getBoundingClientRect(), dx = r.left - info.board.left, dy = r.top - info.board.top;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
  const seen = new Set();
  const card = c => { if (!c || !c.rect || seen.has(c)) return; seen.add(c); const q = c.rect; c.rect = { left: q.left + dx, top: q.top + dy, right: q.right + dx, bottom: q.bottom + dy, width: q.width, height: q.height, x: q.left + dx, y: q.top + dy }; };
  const pt = o => { if (o && typeof o.x === 'number' && typeof o.y === 'number' && !seen.has(o)) { seen.add(o); o.x += dx; o.y += dy; } };
  [info.self, info.att, info.target].forEach(card);
  [info.dest, info.opp, info.mons, info.traps].forEach(list => (list || []).forEach(card));
  [info.land, info.deck, info.gy, info.hand].forEach(pt);
  const B = info.board;
  info.board = { ...B, left: B.left + dx, right: B.right + dx, cx: B.cx + dx, top: B.top + dy, bottom: B.bottom + dy, cy: B.cy + dy, myMonY: B.myMonY + dy, oppMonY: B.oppMonY + dy, myStY: B.myStY + dy };
}
function fxStage(on) { const r = ROOT && ROOT.querySelector('.droot'); if (r) r.classList.toggle('fx-stage', on); }
/** 演出の文字の帯を置いてよい範囲：上の帯の下から、手札・ボタン・チェーンの欄の上まで */
function safeArea() {
  const vh = innerHeight; let top = 0, bottom = vh;
  const tb = $('.top'); if (tb) top = Math.max(top, tb.getBoundingClientRect().bottom);
  for (const q of ['#dock', '#tray', '#chain']) { const e = $(q); if (!e || e.hidden) continue; const r = e.getBoundingClientRect(); if (r.height && r.top > vh * .35 && r.top < vh) bottom = Math.min(bottom, r.top); }
  return { top, bottom };
}
const fxMode = () => ($('#fxMode') && $('#fxMode').value) || 'full';
let pendingSummons = [];   // 画面を更新した後に再生する召喚の演出
let heldAnims = [];
/** コストの見た目（No.7の続き・CODEの決まり：発動の光 → コストのカードが動く → 効果の処理）。
 *  glowDone：発動の手続きを始めた時にもう光らせたカード（チェーンに乗った時・処理の時に二重に光らせない）。costShown：専用演出の前に飛ばしたコストのカード */
const glowDone = new Set(), costShown = new Set();
const earlySummon = new Set(); // 置いた時に召喚の演出を済ませたカード        // 効果の処理の途中で選んでいる間、待たせているカードの演出
function queueBattleFx(prev, next) {
  if (fxMode() === 'none' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let fresh = (next.anim || []).filter(x => x.seq > (prev.animSeq ?? 0));
  // 効果の処理の途中で選ぶこと（死者蘇生の表示形式など）がある間は、カードの演出を待たせ、選び終わってから召喚の演出と続けて流す
  // 待たせるのは、いま処理中で選び待ちになっている最後の1つだけ。それより前に処理が終わったカード（ミラーフォースなど）の演出は、その場で先に流す
  // （No.7：ミラーフォースのあと黒き森のウィッチで選び待ちになり、ミラーフォースの演出が出る前にモンスターが墓地へ飛んでいた）
  // 待たせるのは、その選び待ちが「まだ処理中のカード」のものの時だけ（チェーンに残っている＝処理の途中）。
  // 処理が終わってチェーンから外れたカード（チェーンした神の宣告など）の演出は、あとの別の選び待ち（墓守の審神者の効果など）で待たせない（MIMIの見張り）
  if (next.pending) { const last = fresh.filter(x => x.kind === 'resolve').pop(); if (last && (next.chain || []).some(l => l.uid === last.uid)) { heldAnims.push(last); fresh = fresh.filter(x => x !== last); } }
  else if (heldAnims.length) { fresh = [...heldAnims, ...fresh]; heldAnims = []; }
  // 召喚（通常・アドバンス・反転・決まった手順の特殊召喚）は、カードを場に置いた時にすぐ召喚の演出をする。
  // 召喚が成功した時（相手の応答の後）に、もう一度演出してカードが2回出てくるように見えないようにする
  for (const pp of [0, 1]) for (const u of next.players[pp].mzone) {
    if (u === null || earlySummon.has(u)) continue;
    const c = next.cards[u], pc = prev.cards[u];
    if (!c || !c.summoning) continue;
    const onField = pc && pc.zone === 'mzone';
    if (onField && pc.faceUp === c.faceUp) continue; // もう置いてあって、向きも変わっていない
    const j = summonInfo(prev, next, { uid: u, how: onField ? 'flip' : 'normal', mats: next.animMats ?? [], from: pc ? pc.zone : null });
    if (j) { pendingSummons.push(j); earlySummon.add(u); }
  }
  fresh = fresh.filter(x => !(x.kind === 'summon' && earlySummon.delete(x.uid)));
  for (const u of [...earlySummon]) { const c = next.cards[u]; if (!c || c.zone !== 'mzone' || !c.summoning) earlySummon.delete(u); }
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
  // 専用演出の前に光らせるカードの場所（盤面か手札。演出が始まる前の画面で覚えておく）
  for (const j of sigs) {
    const x = fresh.find(f => f.kind === 'resolve' && f.seq === j.seq);
    if (!x || !prev.cards[x.uid]) continue;
    const el = ROOT.querySelector(`#board [data-uid="${x.uid}"], #hand0 [data-uid="${x.uid}"], #hand1 [data-uid="${x.uid}"]`), d = defOf(prev, x.uid);
    if (el && !glowDone.has(x.uid)) j.glow = { uid: x.uid, d, kind: d.kind, rect: el.getBoundingClientRect() };
    glowDone.delete(x.uid);
    // この専用演出より前に払ったコスト（手札を捨てる・リリースなど）：専用演出の前に、元の場所から置き場へ飛ばす
    j.costs = fresh.filter(c => ((c.kind === 'discard' && c.cost) || (c.kind === 'cost' && !c.proc)) && c.seq < j.seq && !fanDoneUids.has(c.uid) && prev.cards[c.uid]).map(c => {
      const ce = ROOT.querySelector(`#board [data-uid="${c.uid}"], #hand0 [data-uid="${c.uid}"], #hand1 [data-uid="${c.uid}"]`), pc = prev.cards[c.uid];
      return ce && !ce.closest('[data-pile]') ? { u: c.uid, d: defOf(prev, c.uid), face: true, el: ce, rect: ce.getBoundingClientRect(), to: `${pc.owner}:${c.kind === 'discard' ? 'gy' : c.to}` } : null;
    }).filter(Boolean);
    j.costs.forEach(c => { sigSkip.add(c.u); costShown.add(c.u); });
  }
  const jobs = [...battles, ...sigs].sort((p, q) => p.seq - q.seq);
  // 召喚：素材のカードの位置は今のうちに覚えておき、召喚されたカードの位置は画面を更新してから調べる
  pendingSummons.push(...fresh.filter(x => x.kind === 'summon').map(x => summonInfo(prev, next, x)).filter(Boolean));
  pendingSummons.push(...fresh.filter(x => x.kind === 'search' && isRemote(x.player)).map(x => ({ search: true, uid: x.uid, p: x.player, d: defOf(next, x.uid) })));
  for (const p of [0, 1]) {
    const gone = fresh.filter(x => x.kind === 'discard' && x.player === p && !x.cost && !fanDoneUids.has(x.uid)).map(x => x.uid); // コストで捨てた手札は、光った後にふつうの移動で飛ばす
    if (!gone.length) continue;
    // 同じ処理の中でドローしてすぐ捨てたカードも、手札の中に入れて見せる
    const hand0 = [...new Set([...prev.players[p].hand, ...gone])];
    const hand = sortsHand(p) ? sortHand(next, hand0) : hand0;
    pendingSummons.push({ handOpen: true, p, gone, hand, faces: !isRemote(p), ds: Object.fromEntries(hand.map(u => [u, defOf(next, u)])) });
    gone.forEach(u => sigSkip.add(u));
  }
  if (!jobs.length) return;
  fxN++; fxBlock();
  (async () => {
    for (const j of jobs) {
      fxStage(true);
      // 専用演出の前に、発動したカードを元の場所で光らせる（No.7：発動の光 → 専用演出 → 墓地へ。CODEの決まり）
      // 手札から発動して、その場で処理まで進んだ魔法（ブラック・ホールなど）は、盤面に無いので手札の場所で光らせる
      if (j.sig && j.glow && j.glow.rect) { try { await preGlow(j.glow, null, 0); } catch (e) { console.error(e); } }
      if (j.sig && j.costs && j.costs.length) { try { await flyCosts(j.costs); } catch (e) { console.error(e); } }
      const hide = j.hide.map(el => { el.style.visibility = 'hidden'; return el; });
      const brd = j.sig ? ROOT.querySelector('#board') : null; if (brd) brd.classList.add('skin-on');
      if (j.sig) fxRec('sig', j.glow ? j.glow.uid : j.info.self ? j.info.self.uid : null, { key: j.info.key, dest: (j.info.dest || []).map(c => c.uid) }); else fxRec('battle', null);
      if (j.sig) followBoard(j.info); // No.26：場所を測った後に盤面が動いていたら、その分だけ写しの場所をずらす
      try { await (j.sig ? playSignature(ROOT, j.info) : playBattle(ROOT, j.info)); } catch (e) { console.error(e); }
      if (brd) brd.classList.remove('skin-on');
      hide.forEach(el => { el.style.visibility = ''; });
    }
    fxStage(false);
    fxN = Math.max(0, fxN - 1); fxBlock();
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
  // 切り札：表側で出た時だけ（裏側のカードは中身が分かってしまうので、何も出さない）
  const a = !faceDown || x.how === 'flip' ? aceOf(next, x.uid) : null;
  const ace = a ? { cls: a.cls, fallback: a.fallback, big: firstEntrance(aceSeen, x.uid, a.fallback), side: NAME(c.controller) } : null;
  // No.14：反転召喚の前が裏側守備表示（盤面では横向き）だったか。演出は横向きから起き上がる形にする
  const fromDef = x.how === 'flip' && !!pc && pc.position === 'def';
  return { uid: x.uid, how: x.how, faceDown: faceDown && x.how !== 'flip', d: defOf(next, x.uid), mats, from: x.from, fromRect: fromEl ? fromEl.getBoundingClientRect() : null, ace, fromDef };
}
/** 画面を更新した後：召喚されたカードの場所で、召喚の演出を順に再生する */
function playPendingSummons() {
  if (!pendingSummons.length || (fxN > 0)) return false;
  const jobs = pendingSummons; pendingSummons = [];
  fxN++; fxBlock();
  (async () => {
    for (const j of jobs) {
      if (j.search) { try { await cpuSearchFx(j); } catch (e) { console.error(e); } continue; }
      if (j.handOpen) { try { await handOpenFx(j); } catch (e) { console.error(e); } continue; }
      if (j.handAdd) { try { await handAddFx(j); } catch (e) { console.error(e); } continue; }
      const el = ROOT.querySelector(`#board [data-uid="${j.uid}"]`);
      if (!el) continue;
      fxStage(true);
      el.style.visibility = 'hidden';
      const flipFace = j.how === 'flip';
      try {
        const bigAce = j.ace && j.ace.big && !j.ace.fallback;
        // 相棒：場の仲間（同じ側の表側のモンスター）の位置を渡す（絆の光がそこから集まる）
        const allies = bigAce && j.ace.cls === 'partner' && S.cards[j.uid] ? [...ROOT.querySelectorAll('#board [data-uid]')].filter(e => { const u = Number(e.dataset.uid), c = S.cards[u]; return u !== j.uid && c && c.zone === 'mzone' && c.faceUp && c.controller === S.cards[j.uid].controller; }).map(e => e.getBoundingClientRect()) : [];
        fxRec('summon', j.uid);
        await playSummon(ROOT, { rect: el.getBoundingClientRect(), track: () => el.isConnected ? el.getBoundingClientRect() : null, allies, onLand: () => { el.style.visibility = ''; if (j.ace && j.ace.cls === 'partner' && !j.faceDown) play(['aceBond']); /* 相棒：2回目からも相棒の音（見た目はふつう、ひと言は初めてだけ） */ else if (bigAce) play([j.ace.cls === 'god' ? 'aceGod' : 'aceLand']); }, d: j.d, atk: currentAtk(S, j.uid), def: currentDef(S, j.uid), pos: S.cards[j.uid] && S.cards[j.uid].position, how: j.how, faceDown: j.faceDown || flipFace ? (flipFace ? true : j.faceDown) : false, mats: j.mats, from: j.from, fromRect: j.fromRect, ace: j.ace, safe: safeArea(), mat: matCanvas(), speed: fxMode() === 'short' ? 2 : 1 });
      } catch (e) { console.error(e); }
      el.style.visibility = '';
    }
    fxStage(false);
    fxN = Math.max(0, fxN - 1); fxBlock();
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
  const p = x.player, me = p === ME(), boardEl = q('#board');
  if (!boardEl) return null;
  const br = boardEl.getBoundingClientRect(), mid = q('#board [data-pile="0:banished"]');
  const rowY = key => { const r = q(`#board [data-zone="${key}"]`); return r ? center(r).y : br.top + br.height / 2; };
  const board = { left: br.left, top: br.top, right: br.right, bottom: br.bottom, cx: br.left + br.width / 2, cy: mid ? center(mid).y : br.top + br.height / 2,
    myMonY: rowY(`${p}:mz:0`), oppMonY: rowY(`${1 - p}:mz:0`), myStY: rowY(`${p}:st:0`) };
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
    land = center(q(`#board [data-zone="${nt.controller}:mz:${nt.index}"]`));
  }
  return {
    sig: true, seq: x.seq, skip,
    hide: [self, ...dest, att].filter(Boolean).map(c => c.el),
    info: { key, name: d.name, kind: d.kind, subtype: d.subtype, me, speed: fxMode() === 'short' ? 2 : 1, board, mat: matCanvas(),
      self, dest, att, target, opp, mons, traps, drawn: drawn.length, land,
      deck: center(pileEl(p, 'deck')), gy: center(pileEl(tgtOwner, 'gy')), hand: center(q(p === mySeat ? '#hand0' : '#hand1')) },
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
    const hh = b.height * .16, top = defP === ME() ? b.bottom - hh - b.height * .04 : b.top + b.height * .04;
    t = { rect: narrow() ? { left: b.left + b.width * .3, width: b.width * .4, top, height: hh, right: b.left + b.width * .7, bottom: top + hh } : sideEl(defP).getBoundingClientRect() };
  } else {
    tEl = elOf(x.target);
    if (!tEl) return null;
    t = { rect: tEl.getBoundingClientRect(), d: defOf(next, x.target), pos: prev.cards[x.target].position, ...stats(x.target) };
  }
  const dmg = x.damage.reduce((m, d) => Math.max(m, d.amount), 0);
  const hurt = x.damage.length ? x.damage[0].player : defP;
  const r = hurt === atkP ? a.rect : t.rect;
  return {
    hide: [aEl, tEl].filter(Boolean),
    info: { a, t, destroyed: { a: x.destroyed.includes(x.attacker), t: x.target !== null && x.destroyed.includes(x.target) }, dmg, dmgAt: { x: Math.min(innerWidth - 70, Math.max(70, r.left + r.width / 2 + 40)), y: Math.min(innerHeight - 60, Math.max(70, r.top + 10)) }, speed: fxMode() === 'short' ? 2 : 1 },
  };
}

/* ---------- CPU の手番（速さはメニューで選べる） ---------- */
const SPEED = { slow: 2500, normal: 1500, fast: 700 }; // 処理を見て分かるように、前より約1.5倍ゆっくり
let cpuHold = 0; // CPU が話している間などに、次の処理の前に足す待ち時間
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
    worker = new Worker(new URL('./ai/worker.js?v=20261123-0838-30c7db42b4', import.meta.url), { type: 'module' });
    worker.onmessage = e => {
      // 考えている途中の知らせ（0.3秒ごと）：表示だけ変えて、答えの待ちは続ける
      if (e.data && e.data.progress) { if (e.data.id === reqId) thinkProgress(e.data.frac, e.data.critical); return; }
      const w = waiting.get(e.data.id); if (w) { waiting.delete(e.data.id); w(e.data); }
    };
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
  if (state.askZone) state = { ...state, askZone: undefined };
  const local = () => new Promise(res => setTimeout(() => {
    try { res({ ok: true, thought: fullThink(state, { deckCodes: deckCodes() }, deckNames()) }); /* CPUはいつも全力（考える場所が使えない時の予備も同じ） */ } catch (e) { res({ ok: false, error: e.message }); }
  }, 30));
  const w = getWorker();
  if (!w) return local();
  return new Promise(res => {
    const id = ++reqId;
    waiting.set(id, r => (r.retry ? local().then(res) : res(r)));
    try { w.postMessage({ id, state, deckNames: deckNames(), deckCodes: deckCodes(), level: cpuLevel, progress: true }); } catch { waiting.delete(id); local().then(res); }
  });
}
let thinking = null; // 考えている最中の状態（同じ状態で2回考えない）
/** 相手の帯の「考え中…」：出す時は進み具合の線を0から。消す時は、線を最後まで伸ばしてから */
function setThinking(on) { const el = $('#cpuThink'); if (!el) return; if (on) { el.textContent = '考え中…'; el.classList.remove('deep'); el.style.setProperty('--p', '0'); } else el.style.setProperty('--p', '1'); el.hidden = !on; }
/** CPUが考えている途中の知らせ：進み具合（0〜1）を線で、勝負所の時は「じっくり考え中…」。どのカードを使うかの手がかりは出さない */
function thinkProgress(frac, critical) { const el = $('#cpuThink'); if (!el) return; el.style.setProperty('--p', String(Math.max(0, Math.min(1, Number(frac) || 0)))); const t = critical ? 'じっくり考え中…' : '考え中…'; if (el.textContent !== t) el.textContent = t; el.classList.toggle('deep', !!critical); }
const logPaused = () => narrow() && sheet === 'log'; // No.25：スマホでログを開いている間は、デュエルを止める（閉じたら続きから）
const pausedUi = () => setupOpen() || ($('#menu') && !$('#menu').hidden) || ($('#guideDlg') && !$('#guideDlg').hidden) || logPaused();
function scheduleCpu() {
  clearTimeout(cpuTimer);
  if (pausedUi()) return;
  if (!S || S.winner !== null || !isCpu(actorOf(S))) return;
  if (thinking === S) return;
  // 考え終わった答えがあれば、考え直さずに指す（演出の後などで呼ばれ直した時）
  if (ready && ready.state === S) { const th = ready.th; cpuTimer = setTimeout(() => playCpu(S, th), cpuDelay() * 0.5); return; }
  const state = S, t0 = performance.now(), delay = cpuDelay() + cpuHold; cpuHold = 0;
  thinking = state;
  // 「考え中…」は、考えている間だけでなく、指すまでの待ち時間も出し続ける（0.45秒より長くかかる時。下の欄の「CPUが考え中」とそろえる）
  clearTimeout(thinkShowT); thinkShowT = setTimeout(() => { if (S === state && isCpu(actorOf(S))) setThinking(true); }, 450);
  think(state).then(r => {
    if (thinking === state) thinking = null;
    thinkProgress(1, false); // 考え終わった：線は最後まで（表示は、指す時に消す）
    if (S !== state || !S || S.winner !== null) return; // 考えている間に状態が変わった（元に戻す・新しいデュエルなど）
    if (!r.ok) { console.error(r.error); toast(`CPUのエラー：${WHO(r.error)}`, true); return; }
    const th = r.thought;
    ready = { state, th };
    if (pausedUi() || fxN > 0) return; // 準備画面・メニュー・演出の間は指さない（終わったら、この答えで指す）
    cpuTimer = setTimeout(() => playCpu(state, th), Math.max(0, delay - (performance.now() - t0)));
  });
}
let ready = null; // 考え終わった答え { state, th }
let endArmT = null, autoEnd = false;
function endTap() {
  const b = $('#endBtn'); if (!b) return;
  if (!b.classList.contains('armed')) {
    b.classList.add('armed'); b.textContent = 'もう1回';
    clearTimeout(endArmT); endArmT = setTimeout(() => { b.classList.remove('armed'); b.textContent = 'エンド'; }, 2000);
    return;
  }
  clearTimeout(endArmT); b.classList.remove('armed'); b.textContent = 'エンド';
  const legal = legalActions(S);
  const fin = legal.find(x => x.type === 'endTurn'), toEnd = legal.find(x => x.type === 'nextPhase' && x.to === 'end');
  if (fin) { run(fin); return; }
  if (toEnd) { autoEnd = true; run(toEnd); }
}
/** エンドを押した後：エンドフェイズで自由に行動できるようになったら、そのままターンを終える（途中で選ぶことがあれば、それが済んでから） */
function continueEnd() {
  if (!autoEnd || !S) return;
  if (S.winner !== null || isRemote(S.turnPlayer) || S.turnPlayer !== actorOf(S) && !S.pending && S.window.kind === 'open') { autoEnd = false; return; }
  if (!humanActing() || S.pending || S.window.kind !== 'open' || S.phase !== 'end') return;
  const fin = legalActions(S).find(x => x.type === 'endTurn');
  if (fin) { autoEnd = false; setTimeout(() => { if (S && legalActions(S).some(x => x.type === 'endTurn')) run(fin); }, 120); }
}
let thinkShowT = null; // 「考え中…」を出すまでの待ち
function playCpu(state, th) {
  clearTimeout(thinkShowT); setThinking(false);
  if (S !== state) return;
  if (fxN > 0 || pausedUi()) return; // 演出・準備画面・メニューの間は指さない（終わった時に、考えた答えで指し直す）
  ready = null;
  let next;
  try { next = applyAction(S, th.action); } catch (e) { console.error(e); toast(`CPUのエラー：${WHO(e.message)}`, true); return; }
  if (!state.pending && state.window.kind === 'open' && state.turnPlayer === CPU) trace.push({ turn: state.turn, rate: th.winRate, romance: th.romance });
  if (th.romance) speakRomance(state, next, th);
  commit(next);
  pick = [];
  render();
}


/* ---------- CPU の性格と、場面ごとの台詞 ----------
 * 性格は対戦ごとにランダム（デッキとは関係ない）。CPU がカードを発動した時は、カード名と効果を性格の口調で話す。
 * 攻撃・ダイレクトアタック・大きなダメージ・優勢／劣勢（ターンの始め）・勝ち負けでも一言。CPU のモンスターの召喚では話さない */
let persona = (() => { try { return localStorage.getItem('duel-persona'); } catch { return null; } })();
if (!PERSONA_KEYS.includes(persona)) persona = randomPersona();
function newPersona() { persona = randomPersona(); try { localStorage.setItem('duel-persona', persona); } catch { /* 保存できない環境 */ } }
let moodTurn = -1;
const KIND_JA = { spell: '魔法カード', trap: '罠カード', monster: 'モンスター効果' };
function effLabel(s, l) { const e = (SCRIPTS[s.cards[l.uid].code]?.effects || []).find(x => x.id === l.effect); return e ? e.label : ''; }
function narrate(prev, next) {
  if (!cpuMode()) return;
  const say = (kind, vars) => { const t = lineFor(persona, kind, vars); if (t) speak(t); return !!t; };
  // カードの発動（チェーンに新しく積まれた CPU のカード）
  const added = next.chain.length > prev.chain.length ? next.chain.slice(prev.chain.length).filter(l => l.player === CPU) : [];
  if (added.length) {
    const l = added[added.length - 1];
    say('act', { card: defOf(next, l.uid).name, kind: KIND_JA[l.cardKind] || '効果', what: effectLine(persona, effLabel(next, l)) });
    cpuHold = 1200; // 話している間は、次の処理まで少し待つ
    return;
  }
  // 決着の台詞は、真ん中の「あなたの負け…」などの帯が消えてから（No.6：同じ場所に重なって読めなかった）
  if (next.winner !== null && prev.winner === null) { endSpeech = next.winner === CPU ? 'win' : 'lose'; clearTimeout(endSpeechT); endSpeechT = setTimeout(flushEndSpeech, 4000); return; }
  // あなたの罠で切り返された（攻撃が止まった・モンスターが破壊された・ダメージを受けた）
  const done = prev.chain.filter(l => l.player === 0 && l.cardKind === 'trap' && !next.chain.some(n => n.uid === l.uid && n.serial === l.serial));
  if (done.length) {
    const lostMon = monstersOf(prev, CPU).some(u => !monstersOf(next, CPU).includes(u));
    const hit = next.players[CPU].lp < prev.players[CPU].lp;
    const stopped = prev.battle && next.cards[prev.battle.attacker]?.controller === CPU && (!next.battle || next.battle.attacker !== prev.battle.attacker);
    if (lostMon || hit || stopped) { say('foiled', { card: defOf(next, done[done.length - 1].uid).name }); return; }
  }
  const lost = prev.players[CPU].lp - next.players[CPU].lp;
  if (lost >= 1500 && next.winner === null) { say('hurt', { dmg: lost }); return; }
  const b = next.battle;
  if (b && b.step === 'declared' && (!prev.battle || prev.battle.attacker !== b.attacker || prev.battle.step !== 'declared') && next.cards[b.attacker]?.controller === CPU) {
    if (b.target === null) say('direct'); else if (Math.random() < .5) say('attack');
    return;
  }
  // ターンの始め：優勢・劣勢
  if (next.turn !== prev.turn && next.turnPlayer === CPU && moodTurn !== next.turn && next.winner === null) {
    const me = next.players[CPU].lp, you = next.players[0].lp;
    const kind = (me <= 2000 && you > me) || you - me >= 3000 ? 'behind' : me - you >= 3000 ? 'ahead' : null;
    if (kind && Math.random() < .7) { moodTurn = next.turn; say(kind); }
  }
}

/* ---------- 相手のフェイズの告知 ---------- */
/* 告知は順番待ちにして、1つ出し切ってから次を出す（ターンの帯 → ドロー → スタンバイ → メイン1 …）。出している間は、画面の更新とCPUの手番も待つ */
const PHASE_ORDER = ['draw', 'standby', 'main1', 'battle', 'main2', 'end'];
let cueQ = [];
function phaseCue(prev, next) {
  if (!cpuMode() || next.winner !== null || next.turnPlayer !== CPU) return;
  if (prev.phase === next.phase && prev.turn === next.turn) return;
  // 1回の処理でドロー・スタンバイを通り過ぎた時も、通ったフェイズを1つずつ告知する
  const to = PHASE_ORDER.indexOf(next.phase), from = prev.turn !== next.turn ? 0 : PHASE_ORDER.indexOf(prev.phase) + 1;
  for (let i = Math.max(0, from); i < to; i++) if (i <= 1) cueQ.push(PHASE_ORDER[i]);
  cueQ.push(next.phase);
}
function playPendingCues() {
  if (!cueQ.length || fxN > 0) return false;
  const q = cueQ; cueQ = [];
  fxN++; fxBlock();
  (async () => {
    for (const ph of q) {
      const el = document.createElement('div');
      el.className = 'phase-cue';
      // 何も起きないフェイズ（ドロー・スタンバイ・エンド）は短め、メイン・バトルは長め
      const ms = ['draw', 'standby', 'end'].includes(ph) ? 800 : 1300;
      el.style.animationDuration = ms + 'ms';
      el.innerHTML = `<small>相手のターン</small><b>${esc(PHASE_LABEL[ph] || ph)}</b>`;
      shownPhase = ph; renderTop();
      $('.droot').appendChild(el);
      await new Promise(r => setTimeout(r, ms + 80));
      el.remove();
    }
    shownPhase = null;
    fxN = Math.max(0, fxN - 1); fxBlock();
    render();
  })();
  return true;
}

/* ---------- 対象の矢印：チェーン中のカードが対象にしたカードへ、点線の矢印を出す ---------- */
let tgFollowT = null;
function renderTargets() {
  clearTimeout(tgFollowT);
  let layer = $('.tg-layer');
  const links = S.chain.filter(l => l.targets.length);
  if (!links.length) { if (layer) layer.remove(); return; }
  // No.26：盤面が動いても（手札の開け閉め・画面のスクロールなど）、対象の枠と矢印がカードからずれないように、出ている間は測り直し続ける
  tgFollowT = setTimeout(() => { if (S && ROOT && ROOT.querySelector('.droot')) renderTargets(); }, 250);
  if (!layer) { layer = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); layer.setAttribute('class', 'tg-layer'); layer.setAttribute('aria-hidden', 'true'); $('.droot').appendChild(layer); }
  const mid = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  let paths = '';
  for (const l of links) {
    const src = ROOT.querySelector(`#board [data-uid="${l.uid}"]`);
    const from = src ? mid(src.getBoundingClientRect()) : null;
    const col = l.player === CPU && cpuMode() ? 'opp' : 'me';
    for (const t of l.targets) {
      const el = ROOT.querySelector(`#board [data-uid="${t}"]`);
      if (!el) continue;
      const r = el.getBoundingClientRect(), to = mid(r);
      paths += `<rect class="tg-ring ${col}" x="${(r.left - 4).toFixed(0)}" y="${(r.top - 4).toFixed(0)}" width="${(r.width + 8).toFixed(0)}" height="${(r.height + 8).toFixed(0)}" rx="8"/>`;
      if (from) {
        const mx = (from.x + to.x) / 2 + (to.y - from.y) * .15, my = (from.y + to.y) / 2 - Math.abs(to.x - from.x) * .2 - 20;
        paths += `<path class="tg-line ${col}" marker-end="url(#tgHead${col})" d="M${from.x.toFixed(0)},${from.y.toFixed(0)} Q${mx.toFixed(0)},${my.toFixed(0)} ${to.x.toFixed(0)},${to.y.toFixed(0)}"/>`;
      }
    }
  }
  if (layer.dataset.paths === paths) return; // 場所が同じなら書きかえない（点線の動きが止まらないように）
  layer.dataset.paths = paths;
  layer.innerHTML = `<defs>${['opp', 'me'].map(c => `<marker id="tgHead${c}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path class="tg-head ${c}" d="M0,0 L10,5 L0,10 z"/></marker>`).join('')}</defs>${paths}`;
}

/* ---------- CPU の台詞 ---------- */
let speechT;
let endSpeech = null, endSpeechT = null; // 決着の台詞：帯が消えるまで待つ（帯が出ない時も4秒で出す）
function flushEndSpeech() {
  clearTimeout(endSpeechT); endSpeechT = null;
  const k = endSpeech; endSpeech = null;
  if (k && S && S.winner !== null && cpuMode()) speak(lineFor(persona, k));
}
function speak(text, side = 'opp') {
  const el = $('#speech');
  if (!el || !text) return;
  el.querySelector('.speech-who').textContent = side === 'opp' ? NAME(CPU) : NAME(0);
  el.querySelector('.speech-text').textContent = text;
  el.dataset.side = side;
  el.classList.toggle('long', text.length > 22);
  el.hidden = true; void el.offsetWidth; el.hidden = false;
  clearTimeout(speechT);
  speechT = setTimeout(() => { el.hidden = true; }, text.length > 22 ? 3800 : 2900);
}
const cardNameOf = (s, u) => (u !== undefined && u !== null && s.cards[u] ? defOf(s, u).name : '');
/** p の表側の切り札（台詞の「迎え撃つ」用） */
function faceUpAce(s, p) {
  return monstersOf(s, p).find(u => s.cards[u].faceUp && aceOf(s, u));
}
function speakRomance(prev, next, th) {
  const oppAce = faceUpAce(prev, 0);
  if (th.romance === 'ace') return; // CPU のモンスターの召喚では話さない
  const kind = 'burst';
  speak(lineFor(persona, kind, { ace: cardNameOf(next, th.aceUid) || cardNameOf(prev, th.aceUid), opp: cardNameOf(prev, oppAce) }));
}
/** あなたが切り札を出した時、CPU が一言反応する */
function reactToAce(prev, next) {
  if (!cpuMode() || next.winner !== null) return;
  const was = new Set(monstersOf(prev, 0).filter(u => prev.cards[u].faceUp).map(u => `${u}:${prev.cards[u].serial}`));
  const u = monstersOf(next, 0).find(x => next.cards[x].faceUp && aceOf(next, x) && !was.has(`${x}:${next.cards[x].serial}`));
  if (u !== undefined) speak(lineFor(persona, 'react', { opp: cardNameOf(next, u) }));
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

/* ---------- デュエルの準備（CPU対戦）：電卓と同じように、1ページに1つずつ選んで「▶ デュエル開始」へ ----------
 * あなたのデッキ（持ち主 → テーマ）→ CPUのデッキ（持ち主 → テーマ。🎲おまかせも可）→ 先攻・後攻 → 確認してスタート */
/* 準備画面のページ。CPUの強さを選ぶページ（'level'）は、MASTERの決定で「CPUはいつも全力」になったので外した（作りは残してある） */
const SU_PAGES = ['p0own', 'p0deck', 'p1own', 'p1deck', 'first', 'go'];
const LEVEL_LABEL = { easy: 'やさしい', normal: 'ふつう', hard: '全力' };
/** 準備画面に「本気」を出すか（MASTERの決定：本気が合格するまでは隠す。作りは残す） */
const SHOW_HARD = false;
/** CPUはいつも全力（MASTERの決定：麻雀と同じで、みんな全力だから面白い）。やさしい・ふつうの作りは残すが、選べない */
const CPU_LEVEL = 'hard';
let cpuLevel = CPU_LEVEL; // いまの対戦のCPUの強さ（いつも全力）
let SU = null;
let placeholder = false; // 準備画面の後ろにある、まだ始めていない仮の対戦（保存しない）
let suReturn = false; // 準備画面から設定（メニュー）を開いた：閉じたら準備画面に戻る
const ownerOf = d => d.owner || 'その他';
const owners = () => [...new Set(Object.values(DECKS).map(ownerOf))];
const decksOf = o => Object.values(DECKS).filter(d => ownerOf(d) === o);
const themeOf = d => d.theme || d.name;
const fmtTag = d => (d.format ? (d.format.kind === 'ryu' ? '🌏 留学生' : '🏫 在校生') : '');
const setupOpen = () => { const el = $('#setup'); return !!el && !el.hidden; };
let suKeep = null; // ⚙️（メニュー）を開いている間、準備画面で選んだ内容を覚えておく
/** ホーム画面のスイッチ（No.15。お試し版（URLに /preview/）ではふだんから出す。本番は URL に ?home を付けた時だけ。MASTER 11-22 10:04） */
const HOME_ON = (() => { try { return new URLSearchParams(location.search).has('home') || location.pathname.indexOf('/preview/') >= 0; } catch { return false; } })();
function openSetup(page = HOME_ON ? 'home' : 'p0own') {
  if (netMode()) return; // t26：オンライン対戦の最中・再戦の間は、準備画面（ホーム画面）を開かない。抜ける時は netQuit が net を空にしてから開く
  let last = null; try { last = JSON.parse(localStorage.getItem('gx-duel-setup') || 'null'); } catch { /* 保存できない環境 */ }
  const d0 = DECKS[last?.p0] || DECKS[$('#deck0').value] || Object.values(DECKS)[0], d1 = DECKS[last?.p1] || DECKS[$('#deck1').value] || d0;
  SU = suKeep ? { ...suKeep, page } : { page, hist: [], p0own: ownerOf(d0), p0: d0.code, p1own: ownerOf(d1), p1: d1.code, rand: !!last?.rand, first: last?.first ?? $('#first').value, level: (SHOW_HARD ? ['easy', 'normal', 'hard'] : ['easy', 'normal']).includes(last?.level) ? last.level : 'normal' };
  suKeep = null;
  if (skipOwner() && SU.page === 'p0own') { SU.p0own = owners()[0]; SU.page = 'p0deck'; }
  if (page === 'home') SU.hist = [];
  if (page === 'go') SU.hist = SU_PAGES.slice(0, -1).filter(x => !(skipOwner() && x.endsWith('own')));
  closeMenu();
  clearTimeout(cpuTimer); thinking = null; // 準備の間はCPUを止める
  $('#setup').hidden = false;
  renderSetup();
}
/** デッキの切り札の名前（準備画面で見せる。自動で決めたもの） */
const aceCache2 = new Map();
function deckAces(d) {
  if (!d || !d.code) return [];
  if (aceCache2.has(d.code)) return aceCache2.get(d.code);
  let names = [];
  // 表（MASTERのチェック表）のあるデッキ：分類の強い順（神→ロマン→エース→相棒→トップ）に全部。多い時は5枚まで出して「ほか○枚」
  if (d.aces) {
    const ORDER = ['god', 'roman', 'ace', 'partner', 'top'], rank = ks => Math.min(...ks.map(k => { const i = ORDER.indexOf(k); return i < 0 ? 9 : i; }));
    const all = Object.entries(d.aces).filter(([, ks]) => ks.length).sort((x, y) => rank(x[1]) - rank(y[1])).map(([code]) => CARD_POOL[code]?.name).filter(Boolean);
    names = all.length > 5 ? [...all.slice(0, 5), `ほか${all.length - 5}枚`] : all;
  } else try { const st = createGame({ pool: CARD_POOL, decks: [d, d], firstPlayer: 0 }); names = acesNamesOf(st); } catch { /* 分からない */ }
  aceCache2.set(d.code, names); return names;
}
function closeSetup() { $('#setup').hidden = true; SU = null; render(); }
const skipOwner = () => owners().length <= 1;
function suGo(page) {
  SU.hist.push(SU.page);
  if (skipOwner() && page === 'p1own') { SU.p1own = owners()[0]; page = 'p1deck'; }
  SU.page = page; renderSetup();
}
function renderSetup() {
  if (!SU) return;
  const el = $('#setup .su-body'), p = SU.page;
  $('#suBack').hidden = !SU.hist.length;
  $('#suDots').innerHTML = SU_PAGES.map(x => `<i class="${x === p ? 'on' : SU_PAGES.indexOf(x) < SU_PAGES.indexOf(p) ? 'done' : ''}"></i>`).join('');
  const opt = (act, icon, title, sub, on) => `<button type="button" class="su-opt${on ? ' on' : ''}" data-su="${esc(act)}"><span>${icon}</span><b>${esc(title)}</b><small>${esc(sub)}</small></button>`;
  const deckBtn = (act, d, on) => `<button type="button" class="su-deck${on ? ' on' : ''}" data-su="${esc(act)}"><b>${esc(themeOf(d))}</b><small>${esc(fmtTag(d))}${d.theme && d.theme !== d.name ? `・${esc(d.name)}` : ''}</small></button>`;
  $('#suTitle').textContent = p === 'home' ? '🏠 デュエル卓' : '⚔️ デュエルの準備';
  $('#suDots').hidden = p === 'home';
  if (p === 'home') {
    el.innerHTML = '<p class="su-q">どちらで遊びますか？</p><div class="su-home">'
      + '<button type="button" class="su-big cpu" data-su="cpu"><span>🤖</span><b>CPU対戦</b><small>全力のCPUと1人で練習</small></button>'
      + (ONLINE ? '<button type="button" class="su-big net" data-su="net"><span>👥</span><b>オンライン対戦</b><small>キー番号・招待でほかの人と</small></button>' : '')
      + '</div><div class="su-mini">'
      + (OPTS.onRecords ? '<button type="button" class="btn small ghost" data-su="records">📊 戦績</button>' : '')
      + '<button type="button" class="btn small ghost" data-su="guide">📖 遊び方</button></div>';
    return;
  }
  if (p === 'p0own' || p === 'p1own') {
    const me = p === 'p0own';
    el.innerHTML = `<p class="su-q">${me ? 'あなたが使うのは、だれのデッキ？' : 'CPUが使うのは、だれのデッキ？'}</p><div class="su-opts">`
      + (me ? '' : opt('rand', '🎲', 'おまかせ', 'あなたと違うデッキからランダムに選ぶ', SU.rand))
      + owners().map(o => opt(`own:${o}`, '👤', o, `デッキ ${decksOf(o).length}個`, !(!me && SU.rand) && (me ? SU.p0own : SU.p1own) === o)).join('') + '</div>';
  } else if (p === 'p0deck' || p === 'p1deck') {
    const me = p === 'p0deck', o = me ? SU.p0own : SU.p1own;
    el.innerHTML = `<p class="su-q">${me ? 'あなたが使うデッキは？' : 'CPUが使うデッキは？'}<small>${esc(o)}のデッキテーマ</small></p>`
      + (!me && skipOwner() ? `<div class="su-opts su-rand">${opt('rand', '🎲', 'おまかせ', 'あなたと違うデッキからランダムに選ぶ', SU.rand)}</div>` : '')
      + `<div class="su-grid">` + decksOf(o).map(d => deckBtn(`deck:${d.code}`, d, (me ? SU.p0 : SU.p1) === d.code && (me || !SU.rand))).join('') + '</div>'
      + ryuHelp();
  } else if (p === 'first') {
    el.innerHTML = `<p class="su-q">先攻・後攻は？</p><div class="su-opts">`
      + opt('first:0', '🙋', 'あなたが先攻', '最初のターンはドローなし', SU.first === '0')
      + opt('first:1', '🤖', 'CPUが先攻', 'あなたは後攻からスタート', SU.first === '1')
      + opt('first:r', '🎲', 'ランダム', 'デュエル開始の時に決める', SU.first === 'r') + '</div>';
  } else if (p === 'level') {
    el.innerHTML = `<p class="su-q">CPUの強さは？</p><div class="su-opts">`
      + opt('level:easy', '🐣', 'やさしい', 'ときどき最善でない手を選ぶ。操作に慣れたい時に', SU.level === 'easy')
      + opt('level:normal', '🤖', 'ふつう', '見えないカードを推測して、勝ちやすい手を選ぶ', SU.level === 'normal')
      + (SHOW_HARD ? opt('level:hard', '🔥', '本気', 'ロマンより勝ちを優先して、じっくり考える。1手に数秒かかることがある', SU.level === 'hard') : '') + '</div>';
  } else {
    const d0 = DECKS[SU.p0], d1 = DECKS[SU.p1];
    const firstTxt = { 0: 'あなたが先攻', 1: 'CPUが先攻', r: 'ランダム（開始の時に決める）' }[SU.first];
    el.innerHTML = `<p class="su-q">この内容でデュエルを始めます</p><div class="su-sum">`
      + `<div><span>あなた</span><b>${esc(themeOf(d0))}</b><small>${esc(ownerOf(d0))}・${esc(fmtTag(d0))}</small>${(() => { const a = deckAces(d0); return a.length ? `<small>👑 切り札：${esc(a.map(n => (/^ほかd+枚$/.test(n) ? n : `「${n}」`)).join('／'))}</small>` : ''; })()}</div>`
      + `<div><span>CPU</span><b>${SU.rand ? '🎲 おまかせ' : esc(themeOf(d1))}</b><small>${SU.rand ? 'あなたと違うデッキからランダム（開始の時に発表）' : `${esc(ownerOf(d1))}・${esc(fmtTag(d1))}`}</small></div>`
      + `<div><span>先攻</span><b>${esc(firstTxt)}</b></div>`
      + `</div><p class="su-note">🤖 CPUは、いつも全力で戦います</p>`
      + `<button type="button" class="su-start" data-su="start">▶ デュエル開始</button>`
      + `<button type="button" class="su-more" data-su="more">⚙️ 発動の聞き方・演出・CPUの速さ</button>`;
  }  // スイッチ ONLINE が入っている時だけ、最初のページに「👥 人と対戦」
  // オンライン対戦の入口：ホーム画面のスイッチが付いている時はホームに。付いていない時は今までどおり、最初のページに「👥 人と対戦」
  if (!HOME_ON && ONLINE && (p === 'p0own' || (p === 'p0deck' && skipOwner()))) el.insertAdjacentHTML('afterbegin', '<button type="button" class="su-opt su-net" data-su="net"><span>👥</span><b>人と対戦（オンライン）</b><small>キー番号でつなぐ・電卓のリンク対戦と同じ</small></button>');
}
/** 準備画面の「🏫 在校生・🌏 留学生とは？」：2行の説明と、ルールブックの「🌏 留学生デッキ」への案内（サイトの中の時だけ） */
function ryuHelp() {
  return `<details class="su-help"><summary>🏫 在校生・🌏 留学生とは？</summary>`
    + '<p>🏫 <b>在校生デッキ</b>：この環境のルール（GXまでのテーマ・カード規制）に沿ったデッキ。</p>'
    + '<p>🌏 <b>留学生デッキ</b>：ルールや規制には沿っていないけれど、環境のトップにならないように調整して、遊びに来たデッキ。</p>'
    + (OPTS.onClose ? '<button type="button" class="btn small ghost" data-su="ryu">📖 ルールブックで読む</button>' : '') + '</details>';
}
/** 準備画面を横に払った時の行き先（No.5 ボスの注文）。左に払う＝次へ（いま選んでいる内容のまま）、右に払う＝ひとつ戻る。行けない時は null */
function suSwipeTarget(su, dir, skip = false) {
  if (dir > 0) return su.hist.length ? su.hist[su.hist.length - 1] : null;
  const p = su.page;
  if (p === 'home') return null;
  if (p === 'p0own') return su.p0own ? 'p0deck' : null;
  if (p === 'p0deck') return su.p0 ? (skip ? 'p1deck' : 'p1own') : null;
  if (p === 'p1own') return su.rand ? 'first' : su.p1own ? 'p1deck' : null;
  if (p === 'p1deck') return su.rand || su.p1 ? 'first' : null;
  if (p === 'first' || p === 'level') return su.first != null ? 'go' : null;
  return null;
}
let suSwipe = null, suSwiped = false;
function suSwipeEnd(x, y) {
  const sw = suSwipe; suSwipe = null;
  if (!sw || !SU || !setupOpen()) return;
  const dx = x - sw.x, dy = y - sw.y;
  if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return; // 横にはっきり払った時だけ
  const to = suSwipeTarget(SU, dx > 0 ? 1 : -1, skipOwner());
  if (!to) return;
  suSwiped = true; setTimeout(() => { suSwiped = false; }, 400); // 払った指を離した時の「押した」で、選び直さないように
  if (dx > 0) { SU.page = SU.hist.pop(); renderSetup(); } else { SU.hist.push(SU.page); SU.page = to; renderSetup(); }
}
function setupClick(t) {
  const b = t.closest('[data-su]'); if (!b || !SU) return false;
  if (suSwiped) return true;
  const [k, v] = b.dataset.su.split(/:(.*)/);
  const me = SU.page === 'p0own' || SU.page === 'p0deck';
  if (k === 'net') { closeSetup(); openNet(); return true; }
  if (k === 'cpu') { suGo(skipOwner() ? 'p0deck' : 'p0own'); if (skipOwner()) SU.p0own = owners()[0]; return true; }
  if (k === 'guide') { closeSetup(); openGuide(0); return true; }
  if (k === 'records') { try { OPTS.onRecords(); } catch (e) { console.error(e); } return true; }
  if (k === 'rand') { SU.rand = true; suGo('first'); return true; }
  if (k === 'own') { if (me) SU.p0own = v; else { SU.p1own = v; SU.rand = false; } suGo(me ? 'p0deck' : 'p1deck'); return true; }
  if (k === 'deck') { if (me) SU.p0 = v; else { SU.p1 = v; SU.rand = false; } suGo(me ? 'p1own' : 'first'); return true; }
  if (k === 'first') { SU.first = v; suGo('go'); return true; }
  if (k === 'level') { SU.level = v; suGo('go'); return true; }
  if (k === 'ryu') { $('#setup').hidden = true; try { OPTS.onClose(); } catch { /* 閉じられない時はそのまま */ } setTimeout(() => { location.hash = '#ryu'; }, 0); return true; }
  if (k === 'more') { suKeep = SU; $('#setup').hidden = true; suReturn = true; openMenu(); $('#menu').classList.add('from-setup'); return true; }
  if (k === 'start') {
    const all = Object.keys(DECKS);
    $('#mode').value = 'cpu'; $('#hideOppRow').hidden = true;
    $('#deck0').value = SU.p0;
    const pool = all.filter(c => c !== SU.p0), pick = SU.rand ? (pool.length ? pool : all)[Math.floor(Math.random() * (pool.length || all.length))] : SU.p1;
    $('#deck1').value = pick;
    $('#first').value = SU.first;
    cpuLevel = CPU_LEVEL;
    netForget(); // CPU戦を始めた：オンライン対戦の続きの覚えは消す
    try { localStorage.setItem('gx-duel-setup', JSON.stringify({ p0: SU.p0, p1: SU.p1, rand: SU.rand, first: SU.first, level: cpuLevel })); } catch { /* 保存できない環境 */ }
    placeholder = false;
    showDeckFmt();
    const go = () => { $('#setup').hidden = true; SU = null; newDuel(); maybeGuide(); };
    if (!SU.rand) { go(); return true; }
    // 🎲 おまかせ：CPUのデッキを発表してから始める
    const d = DECKS[pick];
    $('#setup .su-body').innerHTML = `<div class="su-reveal"><small>🎲 CPUのデッキは…</small><b>${esc(themeOf(d))}</b><span>${esc(ownerOf(d))}・${esc(fmtTag(d))}</span></div>`;
    setTimeout(go, 1500);
    return true;
  }
  return false;
}

/** デュエル開始の演出：先攻のターンの帯 → 先攻・後攻が分かる開始のセリフ。終わるまで画面の更新とCPUの手番を待つ */
function startCue() {
  const g = S;
  clearTimeout(cpuTimer); // 開始の演出の前に予約されていたCPUの手番は取り消す（演出の後に考え直す）
  fxN++; fxBlock();
  (async () => {
    try {
      await wait(250);
      await banner(S.turnPlayer === 0 ? 'あなたの先攻' : 'CPUの先攻', S.turnPlayer === 0 ? 'me' : 'opp', 1100);
      if (S === g) { const t = lineFor(persona, S.turnPlayer === CPU ? 'first' : 'second'); speak(t); await new Promise(r => setTimeout(r, t.length > 22 ? 3000 : 2400)); }
    } catch (e) { console.error(e); }
    fxN = Math.max(0, fxN - 1); fxBlock();
    render();
  })();
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
function newDuel(quiet = false) {
  // 選ばれているデッキが無い場合（読み込み直後など）は最初のデッキを使う
  const first = Object.values(DECKS)[0];
  const d0 = DECKS[$('#deck0').value] ?? first, d1 = DECKS[$('#deck1').value] ?? first;
  const f = $('#first').value;
  S = createGame({ pool: CARD_POOL, decks: [d0, d1], firstPlayer: f === 'r' ? undefined : Number(f) });
  S.askZone = netMode() ? [0, 1] : cpuMode() ? [0] : [0, 1]; // オンライン：2台とも同じ [0, 1]（席ごとにちがうと、マスの答えの数がずれて「ずれ」になる。MIMIの確かめ）
  history = []; selected = null; pick = []; sheet = null; peek = false; lastLp = [S.players[0].lp, S.players[1].lp]; glowDone.clear(); costShown.clear(); heldAnims = []; trace = []; thinking = null; aceSeen = new Set();
  closeMenu();
  render();
  newPersona(); moodTurn = -1; undoUsed = false; resultSent = false;
  if (cpuMode() && !quiet && !setupOpen() && $('#menu').hidden) startCue();
}

/* ---------- 行動の実行 ---------- */
function run(action) {
  if (S.winner === null && isRemote(actorOf(S))) { toast(netMode() ? `${NAME(OPP())}の番です` : 'CPUが考え中です'); return; }
  try {
    const next = applyAction(S, action);
    if (netMode()) { if (!net.link || !net.link.send(action)) { toast(`${NAME(OPP())}の番です`); return; } commit(net.link.state); pick = []; peek = false; render(); return; }
    reactToAce(S, next);
    history.push(S); commit(next); pick = []; peek = false;
    // スマホでは、操作したらシートを閉じて盤面に戻る
    if (narrow() && sheet === 'detail') { sheet = null; selected = null; }
    if (selected !== null && !(S.cards[selected] && ['hand', 'mzone', 'emz', 'szone', 'fzone'].includes(S.cards[selected].zone))) selected = null;
    render();
  } catch (e) {
    toast(e && e.name === 'RuleError' ? `できません：${WHO(e.message)}` : `エラー：${WHO(e.message)}`, true);
    if (!(e && e.name === 'RuleError')) console.error(e);
  }
}
// CPU の行動は記録しないので、元に戻すと自分が前に判断した場面まで戻る
function undo() { if (netMode() || !history.length) return; undoUsed = true; clearTimeout(cpuTimer); clearTimeout(offerT); cueQ = []; closeFan(); heldAnims = []; tombIntent = null; S = history.pop(); pick = []; render(); }

let toastT;
function toast(msg, bad) {
  const t = $('#toast'); t.textContent = msg; t.dataset.bad = bad ? '1' : ''; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3200);
}

/* ---------- カード表示 ---------- */
/* ---------- 左手のイラスト（手首から先。手のひらをこちらに向けた左手なので、親指は右側） ----------
 * 座標は 1単位 ≒ 1.21mm（カードの幅 59mm ＝ 49単位、手のひらの幅 約85mm ＝ 70単位）。viewBox は 0 0 130 200 */
const HAND_UNIT_CARD_W = 49;
const SKIN = { base: '#eab894', shade: '#d49a73', line: '#6e452f', light: '#f6d2b5' };
/** 指1本（付け根の中心 bx,by から長さ len、太さ w、傾き deg） */
function fingerPath(bx, by, len, w, deg) {
  return `<g transform="rotate(${deg} ${bx} ${by})"><rect x="${bx - w / 2}" y="${by - len}" width="${w}" height="${len + 6}" rx="${w / 2}" fill="${SKIN.base}" stroke="${SKIN.line}" stroke-width="1.6"/>`
    + `<path d="M${bx - w / 2 + 2},${by - len * .42} q${w / 2 - 2},3 ${w - 4},0 M${bx - w / 2 + 2.5},${by - len * .7} q${w / 2 - 2.5},2.5 ${w - 5},0" fill="none" stroke="${SKIN.shade}" stroke-width="1.1" stroke-linecap="round"/></g>`;
}
/** 手のひら・手首・4本の指（カードの後ろになる部分） */
function handBack(holding = false) {
  // 持っている時は、指をカードの裏に曲げているので短く見える
  const k = holding ? .55 : 1;
  const fingers = [
    fingerPath(40, 98, 44 * k, 13, -12),  // 小指
    fingerPath(54, 90, 58 * k, 14.5, -5), // 薬指
    fingerPath(69, 88, 64 * k, 15, 1),    // 中指
    fingerPath(84, 92, 56 * k, 14.5, 7),  // 人差し指
  ].join('');
  return fingers
    + `<path d="M44,200 L46,166 C34,160 30,148 31,130 C32,112 34,98 44,92 C56,85 84,84 96,92 C104,98 106,112 104,128 C102,148 98,160 88,166 L90,200 Z" fill="${SKIN.base}" stroke="${SKIN.line}" stroke-width="1.8" stroke-linejoin="round"/>`
    + `<path d="M40,124 C52,118 66,120 78,128 M46,140 C58,132 74,134 90,140 M70,104 C66,118 64,132 66,150" fill="none" stroke="${SKIN.shade}" stroke-width="1.4" stroke-linecap="round"/>`
    + `<path d="M50,160 C60,166 78,166 88,160" fill="none" stroke="${SKIN.shade}" stroke-width="1.2"/>`;
}
/** 親指（カードを押さえる。カードの手前） */
function handThumb(holding) {
  // 持っている時：手のひらの右下から、カードの上を左上へ斜めに押さえる。空の時：右へ開く
  return holding
    ? `<path d="M100,138 C106,124 102,112 92,106 C84,101 72,100 66,104 C61,107 62,114 68,115 C76,116 84,118 88,126 C91,132 92,138 92,142 Z" fill="${SKIN.base}" stroke="${SKIN.line}" stroke-width="1.8" stroke-linejoin="round"/>`
      + `<path d="M69,105 C72,103 76,103 78,106 C77,109 72,110 69,109 Z" fill="${SKIN.light}" stroke="${SKIN.shade}" stroke-width="1"/>`
    : `<path d="M96,140 C104,132 112,120 118,106 C121,99 128,100 128,108 C127,122 118,140 106,152 Z" fill="${SKIN.base}" stroke="${SKIN.line}" stroke-width="1.8" stroke-linejoin="round"/>`
      + `<path d="M108,128 q5,-3 9,-1" fill="none" stroke="${SKIN.shade}" stroke-width="1.2" stroke-linecap="round"/>`;
}
const MINI_FRAME = { normal: '#c9a24a', effect: '#c76a2a', ritual: '#3f7fd6', fusion: '#8a46c8', spell: '#109f80', trap: '#b8247a' };
/** 扇形に持ったカード（裏ではなく表の色。自分の手札） */
function heldFan(cards) {
  const n = Math.min(cards.length, 10), W = HAND_UNIT_CARD_W, H = W * 86 / 59;
  if (!n) return '';
  const spread = Math.min(56, 10 + n * 6), px = 70, py = 150; // 扇の要（手のひらの下の方）
  return cards.slice(0, n).map((f, i) => {
    const t = n === 1 ? 0 : i / (n - 1) - .5, a = t * spread;
    return `<g transform="rotate(${a.toFixed(1)} ${px} ${py})"><rect x="${px - W / 2}" y="${py - H - 34}" width="${W}" height="${H}" rx="2.5" fill="${MINI_FRAME[f] || '#888'}" stroke="#1b1508" stroke-width="1.4"/>`
      + `<rect x="${px - W / 2 + 4}" y="${py - H - 34 + 11}" width="${W - 8}" height="${W - 10}" fill="#2a3040" opacity=".85"/>`
      + `<rect x="${px - W / 2 + 4}" y="${py - H - 34 + 3.5}" width="${W - 8}" height="5" fill="rgba(0,0,0,.35)"/></g>`;
  }).join('');
}
/** 手札を持った左手（手札を閉じた時） */
function holdingHandSvg(frames) {
  // 手のイラストはいったんやめて、扇形の手札だけを見せる
  return `<svg viewBox="-12 2 164 128" aria-hidden="true">${heldFan(frames)}</svg>`;
}
/** 空っぽの左手（手札を持ち上げた時） */
function emptyHandSvg() {
  return `<svg viewBox="0 0 130 200" aria-hidden="true">${handBack()}${handThumb(false)}</svg>`;
}

function frameOf(d) { return d.kind === 'spell' ? 'spell' : d.kind === 'trap' ? 'trap' : d.frame; }
let canAct = new Set();
/** No.18：相手のフィールドの裏側のモンスターで、前に表側でいたことがある（エンジンの lastUp。サーチして手札から伏せたカードには付かない。2台で同じ・読み直しても残る）。攻守はカードに書いてある元々の攻守。手札に戻ったカードには出さない */
const prevUp = uid => { const c = S.cards[uid]; return !!c && !!c.lastUp && !c.faceUp && (c.zone === 'mzone' || c.zone === 'emz') && isRemote(c.controller); };
/** No.18：攻守はカードに書いてある元の数字（MASTERの答え 11-22 朝。裏にする直前の数字は使わない） */
const prevUpText = (name, d) => `前に表だった時：「${name}」（攻${d.atk}／守${d.def}）`;
function cardHtml(uid, { hidden = false, field = false, style = '' } = {}) {
  const c = S.cards[uid];
  const st = style ? ` style="${style}"` : '';
  const d = defOf(S, uid);
  const cls = [uid === selected ? 'sel' : '', field && c.position === 'def' ? 'def' : '', canAct.has(uid) ? 'can' : '', pick.includes(uid) ? 'picked' : ''].join(' ');
  const badge = [field ? counterHtml(uid) : '', c.equippedTo !== null ? '<span class="badge eq">装備</span>' : ''].join('');
  if (hidden || (!c.faceUp && !(c.zone === 'hand' || c.zone === 'extra' || c.zone === 'deck' || field))) return `<button class="card back ${cls}" data-uid="${uid}"${st} aria-label="裏側のカード">${badge}</button>`;
  if (!c.faceUp && field && isRemote(c.controller)) return prevUp(uid)
    ? `<button class="card back ${cls}" data-uid="${uid}"${st} aria-label="裏側のカード（前に表だった時：${esc(d.name)}）"><span class="bn pu">前：${esc(d.name)}</span>${badge}</button>`
    : `<button class="card back ${cls}" data-uid="${uid}"${st} aria-label="裏側のカード">${badge}</button>`;
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
  if (!c.faceUp && ['mzone', 'szone', 'fzone', 'emz'].includes(c.zone)) return ''; // 裏側の間は出さない（自分の伏せカードも、相手と同じ見た目に）
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
function zone(uid, label, cls = '', key = '', at = '') {
  return `<div class="zone ${cls}"${key ? ` data-zone="${key}"` : ''}${at ? ` style="${at}"` : ''}>${uid !== null && uid !== undefined ? cardHtml(uid, { field: true }) : `<span class="zl">${label}</span>`}</div>`;
}
/** 盤面の格子の位置（列 1〜7、段は半分の高さ 1〜10） */
const gridAt = (col, row) => `grid-column:${col};grid-row:${row} / span 2`;
function pile(p, kind, place = '') {
  const list = S.players[p][kind];
  const label = { deck: 'デッキ', gy: '墓地', extra: 'EX', banished: '除外' }[kind];
  const top = list.length ? list[list.length - 1] : null;
  // 積み重なった厚み（6枚ごとに1段、最大7段）。下と右にカードの縁がのぞく
  const n = Math.min(7, Math.ceil(list.length / 6)), open = kind === 'gy' || kind === 'banished';
  const edges = Array.from({ length: n }, (_, k) => `${((k + 1) * .6).toFixed(1)}px ${((k + 1) * .9).toFixed(1)}px 0 ${open ? (k % 2 ? '#bdb5a3' : '#e6dfcf') : (k % 2 ? '#2a170a' : '#7a5634')}`);
  const stack = `box-shadow: ${[...edges, `${(n * .6 + 1).toFixed(1)}px ${(n * .9 + 2).toFixed(1)}px 4px rgba(0,0,0,.45)`].join(', ')}; translate: ${(-n * .3).toFixed(1)}px ${(-n * .45).toFixed(1)}px`;
  // 置き場のボタンの中にボタンは入れられない（ブラウザが外側のボタンを閉じてしまう）ので、一番上のカードは span にする
  const face = open && top !== null ? cardHtml(top, { style: stack }).replace(/^<button/, '<span').replace(/<\/button>$/, '</span>') : list.length ? `<span class="card back mini" style="${stack}"></span>` : '';
  return `<button class="zone pile${p !== ME() ? ' opp' : ''}" data-pile="${p}:${kind}"${place ? ` style="${place}"` : ''} aria-label="${NAME(p)}の${kind === 'extra' ? 'EXデッキ' : label}（${list.length}枚）" title="長押しで一覧">${face}<span class="pl">${label}</span><span class="cnt">${list.length}</span>${kind === 'banished' ? sarcoHtml(p) : ''}</button>`;
}
function renderBoard() {
  const me = ME(), op = OPP(), p1 = S.players[me], p2 = S.players[op];
  // 真ん中：上から 相手の魔法・罠／相手のモンスター／自分のモンスター／自分の魔法・罠（相手側は左右が逆）
  const cells = [
    ...p2.szone.map((u, i) => zone(u, '魔・罠', 'st opp', `${op}:st:${i}`, gridAt(6 - i, 2))),
    ...p2.mzone.map((u, i) => zone(u, 'モンスター', 'mz opp', `${op}:mz:${i}`, gridAt(6 - i, 4))),
    ...p1.mzone.map((u, i) => zone(u, 'モンスター', 'mz', `${me}:mz:${i}`, gridAt(i + 2, 6))),
    ...p1.szone.map((u, i) => zone(u, '魔・罠', 'st', `${me}:st:${i}`, gridAt(i + 2, 8))),
    // 左の列：相手の山札・相手の墓地・相手の除外・フィールド・EX
    pile(op, 'deck', gridAt(1, 1)), pile(op, 'gy', gridAt(1, 3)), pile(op, 'banished', gridAt(1, 5)),
    zone(p1.fzone, 'フィールド', 'fz', `${me}:fz:0`, gridAt(1, 7)), pile(me, 'extra', gridAt(1, 9)),
    // 右の列：相手のEX・相手のフィールド・自分の除外・墓地・山札
    pile(op, 'extra', gridAt(7, 1)), zone(p2.fzone, 'フィールド', 'fz opp', `${op}:fz:0`, gridAt(7, 3)), pile(me, 'banished', gridAt(7, 5)),
    pile(me, 'gy', gridAt(7, 7)), pile(me, 'deck', gridAt(7, 9)),
  ];
  const keep = $('#board .mat-skin');
  $('#board').innerHTML = cells.join('');
  if (keep) $('#board').prepend(keep);
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
  // 並べる時は逆順：左から 罠 → 魔法 → 特殊召喚系 → 高レベル → 低レベル（低レベルのモンスターが一番右の手前）
  return [...uids].sort((b, a) => {
    const x = handKey(s, a), y = handKey(s, b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return defOf(s, a).name.localeCompare(defOf(s, b).name, 'ja') || a - b;
  });
}
const sortsHand = p => !isRemote(p);
/** これから手札に加わる演出をするカード（演出が終わるまで手札に出さない） */
const comingToHand = p => new Set(pendingSummons.filter(j => j && j.handAdd && j.p === p).flatMap(j => j.added));
function renderHand(p) {
  const hide = cpuMode() || netMode() ? isRemote(p) : $('#hideOpp').checked && p !== actorOf(S);
  const coming = comingToHand(p);
  const h = (sortsHand(p) ? sortHand(S, S.players[p].hand) : S.players[p].hand).filter(u => !coming.has(u));
  return h.length ? h.map(u => cardHtml(u, { hidden: hide })).join('') : '<span class="empty">手札なし</span>';
}
function renderSide() {
  [0, 1].forEach(p => {
    const el = sideEl(p);
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
    el.querySelector('.meta').textContent = `手札${P.hand.length}・デッキ${P.deck.length}${S.turnPlayer === p && S.winner === null ? `・召喚${P.normalSummonUsed ? '済' : '未'}` : ''}`;
  });
  $('#hand0').innerHTML = renderHand(ME());
  $('#hand1').innerHTML = renderHand(OPP());
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
/** 今のフェイズだけは、はじめての人にも読めるように日本語で出す（ほかは略字のまま） */
const PH_JP = { draw: 'ドロー', standby: 'スタンバイ', main1: 'メイン1', battle: 'バトル', main2: 'メイン2', end: 'エンド' };
/** ダメージステップの細かいタイミングの、はじめての人向けの一言 */
const STEP_HINT = { dsStart: '攻撃の勝ち負けを決める前', beforeCalc: '攻撃力を比べる直前', afterCalc: '攻撃力を比べた直後', dsEnd: '戦闘の後かたづけの前', end: '戦闘の後かたづけの前' };
const STEP_LABEL = { declared: '攻撃宣言時', dsStart: 'ダメージステップ開始時', beforeCalc: 'ダメージ計算前', afterCalc: 'ダメージ計算後', dsEnd: 'ダメージステップ終了時', end: 'ダメージステップ終了時' };
const humanActing = () => S.winner === null && !isRemote(actorOf(S));

let shownPhase = null; // 告知を順番に出している間、上のフェイズ表示もその告知に合わせる
function renderTop() {
  const cur = PHASES.indexOf(shownPhase ?? (pendingMoves && pendingMoves.turn !== null ? 'end' : cueQ.length ? cueQ[0] : S.phase));
  const legal = humanActing() && !S.pending ? legalActions(S) : [];
  // 移れるフェイズは押せるボタンにする
  $('#phases').innerHTML = PHASES.map((ph, i) => {
    const a = legal.find(x => x.type === 'nextPhase' && x.to === ph);
    const cls = i === cur ? `cur${PH_JP[ph].length > 4 ? ' long' : ''}` : i < cur ? 'past' : '';
    return `<li class="${cls}">${a ? `<button data-act='${esc(JSON.stringify(a))}' title="${PHASE_LABEL[ph]}へ進む">${PH_SHORT[ph]}</button>` : `<span title="${PHASE_LABEL[ph]}">${i === cur ? PH_JP[ph] : PH_SHORT[ph]}</span>`}</li>`;
  }).join('');
  $('#turnInfo').innerHTML = S.winner !== null ? '決着' : `<span class="tl">ターン</span><span class="ts">T</span>${S.turn}<span class="tl">・${esc(NAME(S.turnPlayer))}</span>`;
  $('#undo').disabled = history.length === 0;
}

/* ---------- 操作ドック ---------- */
/** 応答の聞き方：「「死者蘇生」にチェーンしますか？」のように、何に対して発動するかを書く */
const cardName = uid => (S.cards[uid].faceUp || S.cards[uid].zone === 'gy' || !isRemote(S.cards[uid].controller) ? `「${defOf(S, uid).name}」` : '裏側のカード');
function respondPrompt() {
  const w = S.window;
  const whose = p => (p === actorOf(S) ? '自分の' : `${NAME(p)}の`);
  if (S.chain.length) {
    const top = S.chain[S.chain.length - 1];
    return top.player === actorOf(S) ? `自分の「${defOf(S, top.uid).name}」に続けて、さらにカードを発動しますか？` : `${NAME(top.player)}が「${defOf(S, top.uid).name}」を発動しました。対抗して、カードを発動しますか？`;
  }
  if (w.mode === 'summoning' && w.cont.type === 'summon') {
    const how = w.cont.how === 'flip' ? '反転召喚' : w.cont.how === 'advance' ? 'アドバンス召喚' : '召喚';
    return `${whose(w.cont.player)}${cardName(w.cont.uid)}の${how}に対して、カードを発動しますか？`;
  }
  if (S.battle && (w.cont.type === 'battle' || w.mode === 'damage')) {
    const b = S.battle;
    if (b.step === 'declared') return `${cardName(b.attacker)}の${b.target === null ? 'ダイレクトアタック' : `${cardName(b.target)}への攻撃`}に対して発動しますか？`;
    return `${STEP_LABEL[b.step] || 'バトル中'}${STEP_HINT[b.step] ? `（${STEP_HINT[b.step]}）` : ''}に、カードを発動しますか？`;
  }
  if (w.cont.type === 'phase' || w.cont.type === 'endTurn') return `${PHASE_LABEL[S.phase]}を終える前に発動しますか？`;
  // 召喚・特殊召喚に成功した直後など
  const ev = [...S.lastEvents].reverse().find(e => e.type === 'summoned');
  if (ev) {
    const how = { normal: '召喚', advance: 'アドバンス召喚', flip: '反転召喚', special: '特殊召喚', ritual: '儀式召喚', fusion: '融合召喚' }[ev.how];
    return `${cardName(ev.uid)}の${how}が成功しました。今、カードを発動しますか？`;
  }
  return '直前の行動に対して発動しますか？';
}
/** 右下の「進む」ボタン：今の場面を先に進める行動（応答なら「発動しない」、フェイズなら次のフェイズ） */
function goAction(legal) {
  const has = x => legal.some(y => JSON.stringify(y) === JSON.stringify(x));
  if (S.window.kind === 'priority') return { label: '発動しない', sub: 'このまま進む', a: { type: 'pass' } };
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
  // CPUの番でない時（あなたの番・決着）は、相手の帯の「考え中…」を消す
  // オンライン対戦：相手の番は、帯に「○○さんが考え中…／選んでいます…」（CPUの進み具合の線は出さない）
  if (netMode() && S && S.winner === null && isRemote(actorOf(S))) { const el = $('#cpuThink'); if (el) { el.hidden = false; el.classList.remove('deep'); el.style.setProperty('--p', '0'); el.textContent = `${NAME(OPP())}が${S.pending ? '選んでいます…' : '考え中…'}`; } }
  else if (!S || S.winner !== null || !isCpu(actorOf(S))) { clearTimeout(thinkShowT); setThinking(false); }
  const actor = $('#actor'), hint = $('#actorHint'), btns = $('#phaseBtns'), go = $('#goBtn');
  const legal = humanActing() && !S.pending ? legalActions(S) : [];
  const has = a => legal.some(x => JSON.stringify(x) === JSON.stringify(a));
  const b = (label, a, cls = '') => `<button class="btn${cls ? ' ' + cls : ''}" data-act='${esc(JSON.stringify(a))}'>${label}</button>`;
  const setGo = (label, sub, act, opts = {}) => {
    go.innerHTML = `${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
    go.disabled = !!opts.disabled;
    if (act) go.dataset.act = JSON.stringify(act); else delete go.dataset.act;
    go.dataset.again = opts.again ? '1' : '';
    go.dataset.reopen = opts.reopen ? '1' : '';
    if (opts.net) go.dataset.net = opts.net; else delete go.dataset.net; // オンライン対戦の終わり：知らせの帯と同じ動き（data-net）
  };
  actor.classList.remove('thinking');
  dock.classList.toggle('mine', humanActing());
  dock.classList.remove('free');
  const eb = $('#endBtn'); if (eb) { eb.hidden = true; eb.classList.remove('armed'); eb.textContent = 'エンド'; }
  const oi = $('#oppInfo'); if (oi) { const O = S.players[OPP()]; oi.textContent = `${NAME(OPP())}：手札${O.hand.length}・墓地${O.gy.length}・除外${O.banished.length}`; }
  hint.textContent = '';
  btns.innerHTML = '';
  $('#stopBtn').hidden = chainMode() === 'always' || S.winner !== null;
  $('#stopBtn').setAttribute('aria-pressed', String(stopNext));
  $('#stopBtn').textContent = stopNext ? '✋ 聞く予定' : '✋ 次は聞いて';

  const rb = $('#reviewBtn'); if (rb) rb.hidden = !(S.winner !== null && cpuMode() && trace.length > 1);
  const hb = $('#homeBtn'); if (hb) hb.hidden = !(HOME_ON && S.winner !== null && OPTS.menuFirst && !netMode()); // t26：オンラインは窓の中の「🏠 ホームへ」（対戦を抜けてから開く）を使う。決着のあと：ホームへ戻れる（決着のあとに固まった時の逃げ道にも）
  if (S.winner !== null) {
    actor.textContent = resultText(S.winner, cpuMode() || netMode(), ME());
    hint.textContent = WHO(S.winReason);
    // オンライン対戦：「新しいデュエル」ではなく、同じ相手との「もう一度」（申し込み中なら押せない）
    if (netMode()) { const asked = !!(net.link && net.link.rematchRequested); setGo(asked ? '申し込みました' : net.oppAsked ? '受ける（もう一度）' : 'もう一度（同じ相手と）', asked ? '相手が受けると始まります' : net.oppAsked ? `${net.oppName}さんの申し込みを受ける` : 'もう一度を申し込む', null, { net: 'ask', disabled: asked || net.stopped }); return; }
    setGo('新しいデュエル', '準備画面を開く', null, { again: true });
    return;
  }
  if (isRemote(actorOf(S))) {
    actor.textContent = netMode() ? `${NAME(OPP())}が${S.pending ? '選んでいます' : '考え中'}` : 'CPUが考え中';
    actor.classList.add('thinking');
    hint.textContent = S.window.kind === 'priority' && S.chain.length ? `チェーン${S.chain.length}に応答するか考え中` : S.pending ? '何を選ぶか考え中' : `${PHASE_LABEL[S.phase]}`;
    setGo(netMode() ? `${NAME(OPP())}の番` : 'CPUの番', '考え中…', null, { disabled: true });
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
    hint.textContent = acts.length ? '発動するなら、発動するカードのボタンを押す。しないなら「発動しない」を押す' : '';
    btns.innerHTML = acts.slice(0, 3).map(x => {
      const eff = (SCRIPTS[S.cards[x.uid].code]?.effects || []).find(e => e.id === x.effect);
      const label = `「${defOf(S, x.uid).name}」${multi(x.uid) && eff ? `の${eff.label}` : ''}を発動`;
      // 発動するボタンは、カードの種類の色で目立たせる（罠：赤紫、魔法：緑、モンスター効果：橙）
      const k = defOf(S, x.uid).kind;
      return b(esc(label), { type: 'activate', card: x.uid, effect: x.effect }, `act-card ${k === 'trap' ? 'k-trap' : k === 'spell' ? 'k-spell' : 'k-mon'}`);
    }).join('');
    setGo(g.label, g.sub, g.a);
    return;
  }
  // 自分のターンで自由に行動できる：右下は「先に進む」、左はそれ以外の移り先
  const me = S.turnPlayer;
  dock.classList.add('free');
  if (eb) eb.hidden = !legal.some(x => x.type === 'endTurn' || (x.type === 'nextPhase' && x.to === 'end'));
  actor.innerHTML = `<span class="who">${esc(cpuMode() ? 'あなた' : NAME(me))}の</span>${esc(PHASE_LABEL[S.phase])}`; // 狭い画面（360以下）では「あなたの」を出さない（欠けて読めないので）
  hint.textContent = S.turn === 1 && S.phase === 'main1' ? '先攻1ターン目はバトルフェイズに入れません' : S.phase === 'battle' ? '攻撃するモンスターを押す' : 'カードを押すと、できる操作が出ます';
  const others = [];
  if (S.phase === 'main1') { others.push({ l: 'バトルへ', a: { type: 'nextPhase', to: 'battle' } }, { l: 'エンドへ', a: { type: 'nextPhase', to: 'end' } }); }
  if (S.phase === 'battle') others.push({ l: 'エンドへ', a: { type: 'nextPhase', to: 'end' } });
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
  // 自分がダメージを受けた・自分のカードが破壊された直後で、発動できるカードがある時も聞く（ダメージ・ゲート、復活の墓穴など）
  const hit = S.lastEvents.some(e => (e.type === 'damage' && e.player === me) || (e.type === 'destroyed' && S.cards[e.uid] && S.cards[e.uid].owner === me));
  if (hit && activatableList(S, me).length) return false;
  if (w.mode === 'summoning' && w.cont.type === 'summon') return w.cont.player === me;
  if (S.battle && S.battle.step === 'declared' && w.cont.type === 'battle' && w.cont.step === 'declared') return S.cards[S.battle.attacker].controller === me;
  const ev = S.lastEvents.find(e => e.type === 'summoned' || e.type === 'attackDeclared');
  if (ev) return ev.player === me;
  return true;
}
let offerT;
function scheduleOffer() {
  clearTimeout(offerT);
  const due = () => S && S.winner === null && cpuMode() && !S.pending && S.turnPlayer === 0 && S.window.kind === 'open' && S.window.respondDue
    && S.lastEvents.some(e => e.type === 'summoned' && e.player === 0) && fxN === 0 && !fxSoon();
  if (!due()) return;
  offerT = setTimeout(() => {
    if (!due()) return;
    try { commit(applyAction(S, { type: 'offer' })); } catch (e) { console.warn(e); return; }
    render();
  }, 500);
}
let autoT;
function scheduleAutoPass() {
  clearTimeout(autoT);
  if (!S || S.winner !== null) return;
  if (!shouldAutoPass()) {
    // 「次で止める」で止まったら、ボタンは元に戻す
    if (stopNext && humanActing() && !S.pending && S.window.kind === 'priority') { stopNext = false; $('#stopBtn').setAttribute('aria-pressed', 'false'); $('#stopBtn').textContent = '✋ 次は聞いて'; }
    return;
  }
  autoT = setTimeout(() => {
    if (!shouldAutoPass()) return;
    // オンライン：自動のパスも、通信の部品を通して相手に届ける（画面の盤面だけに入れると、相手はこちらのパスを待ったまま止まる。MEMEの見つけた穴）
    if (netMode()) { if (net.link && net.link.send({ type: 'pass' })) { commit(net.link.state); render(); } return; }
    try { commit(applyAction(S, { type: 'pass' })); } catch (e) { console.error(e); return; }
    render();
  }, 60);
}

/* ---------- チェーン ---------- */
function renderChain() {
  const el = $('#chain');
  if (!S.chain.length) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<h3>発動したカード（チェーン。上から順に効果が出る）</h3><ol>${S.chain.map((l, i) => `<li class="${l.player === 1 && cpuMode() ? 'opp' : ''}"><b>${i + 1}</b>${NAME(l.player)}：${esc(defOf(S, l.uid).name)}${l.negated ? '（無効）' : ''}${l.targets.length ? `<span class="tg">対象：${l.targets.map(t => esc(S.cards[t].faceUp || S.cards[t].zone === 'gy' ? defOf(S, t).name : '裏側のカード')).join('、')}</span>` : ''}</li>`).reverse().join('')}</ol>`;
}

/* ---------- カード詳細と操作 ---------- */
/* ---------- オンライン対戦（人どうし）：MOMOの下書き（docs/momo-notebook.md）どおり。電卓のリンク対戦と同じ並び・言葉 ----------
 * スイッチ ONLINE：仕上がるまでは切ったまま（URL に ?online-test を付けた時だけ「👥 人と対戦」が出る）
 * 部屋：サイトから OPTS.room（電卓と同じ room()）・OPTS.uid・OPTS.userName をもらえばサイトの部屋、無ければ同じPCのタブどうし（試す用） */
const ONLINE = (() => { try { return new URLSearchParams(location.search).has('online-test'); } catch { return false; } })();
const NET_AWAY_SHOW = 45000; // 相手の知らせがこれだけ来なかったら「つながりが切れたかも」を出す（3分で終わりは通信の部品が決める）
let netUi = null; // 相手を探している間：{ step, key, myKey, deck, mode, host, room, link, status, peerName }
/** 版の印：「duel-ui.js の版の文字」-「指紋」（scripts/build.mjs が書きこむ。同じ印を net/duel-link.js の BUILD_FP にも書きこむ） */
const DUEL_BUILD = '20261123-0838-30c7db42b4';
const BUILT = !DUEL_BUILD.startsWith('__');
/** オンライン対戦の版：版の印（作っていない時は画面の版の文字）。印がちがう相手とは「版ちがい」で始めない */
const netVer = () => (BUILT ? DUEL_BUILD : (($('.ver') && $('.ver').textContent) || '').replace(/^版：/, '').trim() || 'dev');
/** 自分のページの中の食いちがい：app.js・通信の部品・画面の版の文字のどれかが古いまま（ブラウザが古いファイルを覚えている） */
const selfStale = () => {
  if (!BUILT) return false;
  const v = (($('.ver') && $('.ver').textContent) || '').replace(/^版：/, '').trim();
  return BUILD_FP !== DUEL_BUILD || (!!v && !DUEL_BUILD.startsWith(v + '-'));
};
const STALE_MSG = 'このページの中に、古いファイルが残っています。ページを読み直してください（新しい版が出た直後は、古い画面を覚えていることがあります）。';
function netUid() {
  if (OPTS.uid) return OPTS.uid;
  try { let u = sessionStorage.getItem('gx-net-uid'); if (!u) { u = 't' + Math.random().toString(36).slice(2, 10); sessionStorage.setItem('gx-net-uid', u); } return u; } catch { return 't' + Math.random().toString(36).slice(2, 10); }
}
const netMyName = () => OPTS.userName || 'ゲスト'; // サイトではログインの名前。試す時（同じPCのタブ）は「ゲスト」
const netJoin = key => (OPTS.room ? joinSiteRoom(OPTS.room, key) : Promise.resolve(tabRoom('ygo-duel-' + key, netUid())));
/* 待合室：待っている親が「名前・キー番号・公式／練習」を書く所（電卓の「📡 いま待っている人」と同じ考え方）。3分より古い書きこみは出さない */
const NET_LOBBY = 'ygo-duel-lobby';
let lobby = null; // { room, off, peers: [{ uid, name, key, mode }], beat }
async function lobbyOpen() {
  if (lobby) return;
  lobby = { room: null, off: null, peers: [], beat: null };
  const me = lobby;
  try { me.room = OPTS.room ? await OPTS.room.join(NET_LOBBY) : tabRoom(NET_LOBBY, netUid()); } catch (e) { console.warn('待合室に入れませんでした', e); return; }
  if (lobby !== me) { try { me.room.leave(); } catch { /* */ } return; }
  me.off = me.room.onPeers(({ peers }) => {
    // 生きているか：書きかわったのを受け取った時刻（自分の時計）で見る。相手の時計は2台でずれていることがあるので、
    // 初めて見た時だけ「相手の時刻が今から3分以内（前後とも）」なら今いるとみなし、そうでなければ次に書きかわる（1分ごと）のを待つ
    const now = Date.now(); me.seen = me.seen || {};
    for (const p of peers) {
      const s = me.seen[p.uid];
      if (!s) me.seen[p.uid] = { at: p.updatedAt, t: Math.abs(now - (p.updatedAt || 0)) < 180000 ? now : 0 };
      else if (s.at !== p.updatedAt) { s.at = p.updatedAt; s.t = now; }
    }
    me.peers = peers.filter(p => !p.isMe && p.presence && p.presence.wait && p.presence.v === netVer() && now - me.seen[p.uid].t < 150000).map(p => ({ uid: p.uid, name: p.presence.name || 'ゲスト', key: p.presence.key, mode: p.presence.mode }));
    if (netUi && netUi.step === 'key') renderNet();
  });
}
/** 親として待っている間は、待合室に「待っています」を書く（1分ごとに書き直す）。on=false で消す */
function lobbyWait(on) {
  if (!lobby || !lobby.room) return;
  clearInterval(lobby.beat); lobby.beat = null;
  const write = () => lobby && lobby.room && lobby.room.presence(on && netUi ? { wait: true, name: netMyName(), key: netUi.myKey, mode: netUi.mode, v: netVer() } : { wait: false });
  write(); if (on) lobby.beat = setInterval(write, 60000);
}
function lobbyClose() { if (!lobby) return; const l = lobby; lobby = null; clearInterval(l.beat); try { l.off && l.off(); } catch { /* */ } try { l.room && l.room.presence({ wait: false }); l.room && l.room.leave(); } catch { /* */ } }
/* 読み直し・閉じて開き直した時に、対戦の続きに戻る（💜MIMIの見つけた穴：親が読み直すとキーが新しくなり、同じ部屋に親として戻れなかった。
   閉じて開き直すと、タブの番号 gx-net-uid も新しくなり、別の人として入っていた）。CODEの決定 02:06：
   - 対戦が始まったら「キー・親か子か・デッキ・遊び方・自分の番号（uid）」を、タブ（sessionStorage）とブラウザ（localStorage）に覚える（15秒ごとに時刻を新しく）
   - 読み直した時（同じタブ）：タブの覚えから、自動で同じキー・同じ側で入り直す
   - 閉じて開き直した時（新しいタブ）：ブラウザの覚えがあれば「📡 さっきの対戦に戻る」を出す。本人が押した時だけ、同じキー・同じ側・同じ番号で入り直す
   - 同じPCの2つのタブで試す時に親と子の覚えがぶつからないよう、親の分と子の分を分けて覚える。今も開いているタブの分は出さない（タブどうしで聞く）
   - 決着した時・止まった時・自分でやめた時・CPU戦を始めた時は、両方の覚えを消す。3分（相手が「いなくなった」と決める時間）より古い覚えは使わない */
const NET_RESUME = 'gx-net-resume', NET_RESUME_MS = 180000;
const netResumeKey = host => NET_RESUME + (host ? ':host' : ':guest');
function netRemember(u) {
  if (!u) return;
  const r = JSON.stringify({ myKey: u.myKey, key: u.key, host: !!u.host, deck: u.deck, mode: u.mode, uid: netUid(), at: Date.now(), giveUp: u.giveUp || null });
  try { sessionStorage.setItem(NET_RESUME, r); } catch { /* 覚えられない環境 */ }
  try { localStorage.setItem(netResumeKey(!!u.host), r); } catch { /* 覚えられない環境 */ }
}
function netForget() {
  try { sessionStorage.removeItem(NET_RESUME); } catch { /* */ }
  for (const h of [true, false]) try { localStorage.removeItem(netResumeKey(h)); } catch { /* */ }
}
const netResumeOk = r => !!r && /^\d{4}$/.test(String(r.host ? r.myKey : r.key)) && typeof r.uid === 'string' && Date.now() - (r.at || 0) < NET_RESUME_MS && (!OPTS.uid || r.uid === OPTS.uid);
/** 同じタブの読み直し：タブの覚え（自動で戻る）／無ければ null */
function netSavedTab() {
  let r = null;
  try { r = JSON.parse(sessionStorage.getItem(NET_RESUME) || 'null'); if (netResumeOk(r) && r.uid === netUid()) return r; } catch { /* */ }
  if (r && r.giveUp && r.uid === netUid()) { netRecordGiveUp(r); netForget(); return null; } // 降参を送ったまま3分すぎた：負けを書く（ブラウザの覚えも同じものなので消す）
  try { sessionStorage.removeItem(NET_RESUME); } catch { /* */ }
  return null;
}
/** 閉じて開き直した時の候補：ブラウザの覚え（親の分・子の分）。古いものは消す。新しい順 */
function netSavedBrowser() {
  const out = [];
  for (const h of [true, false]) {
    try { const r = JSON.parse(localStorage.getItem(netResumeKey(h)) || 'null'); if (netResumeOk(r)) out.push(r); else { if (r && r.giveUp && (!OPTS.uid || r.uid === OPTS.uid)) netRecordGiveUp(r); localStorage.removeItem(netResumeKey(h)); } } catch { /* */ }
  }
  return out.sort((x, y) => y.at - x.at);
}
/* 今も対戦しているタブ：ほかのタブから「対戦中の番号は？」と聞かれたら、自分の番号を返す（そのタブの分は「戻る」に出さない） */
let netAliveCh = null;
try { netAliveCh = new BroadcastChannel('gx-net-alive'); netAliveCh.onmessage = e => { if (e.data && e.data.ask && net && !net.stopped && S && S.winner === null) netAliveCh.postMessage({ uid: netUid() }); }; } catch { netAliveCh = null; }
function netAliveUids(ms = 400) {
  return new Promise(res => {
    if (!netAliveCh) { res(new Set()); return; }
    const got = new Set(), ch = new BroadcastChannel('gx-net-alive');
    ch.onmessage = e => { if (e.data && e.data.uid) got.add(e.data.uid); };
    ch.postMessage({ ask: true });
    setTimeout(() => { ch.close(); res(got); }, ms);
  });
}
/** 覚えた部屋に、同じキー・同じ側で入り直す。入り直している間は「対戦に戻っています…」と［やめてCPU戦へ］ */
function netResume(r) {
  if (setupOpen()) closeSetup();
  if ($('#menu') && !$('#menu').hidden) closeMenu();
  openNet();
  const u = netUi; u.myKey = String(r.myKey); u.key = String(r.key || ''); u.deck = DECKS[r.deck] ? r.deck : u.deck; u.mode = r.mode === 'practice' ? 'practice' : 'official'; u.resuming = true; u.resumeFrom = r; u.giveUp = r.giveUp || null;
  netConnect(!!r.host);
  // しばらく戻れなかった時：閉じこめないように、言葉を変える（ボタンはずっと出ている）
  setTimeout(() => { if (netUi === u && !netMode() && u.resuming) { u.resumeSlow = true; renderNet(); } }, 12000);
}
/** ページを開いた時：同じタブの読み直しなら自動で戻る（true）。閉じて開き直した時は、今も開いているタブの分を除いて「📡 さっきの対戦に戻る」を出す */
function netResumeOnOpen() {
  if (!ONLINE) return false;
  const r = netSavedTab();
  if (r) { netResume(r); return true; }
  const list = netSavedBrowser(); if (!list.length) return false;
  netAliveUids().then(alive => {
    const r2 = list.find(x => !alive.has(x.uid));
    if (!r2 || net || netUi) return; // 今も開いているタブの分だけ／もう別の対戦の準備をしている
    if (setupOpen()) closeSetup();
    if ($('#menu') && !$('#menu').hidden) closeMenu();
    openNet(); netUi.step = 'resumeAsk'; netUi.saved = r2; renderNet();
  });
  return false; // 招待リンクで開いた時は、そちらを先に（「戻る」は相手を待っていない時だけ出る）
}
function openNet() {
  const myKey = String(1000 + Math.floor(Math.random() * 9000));
  netUi = { step: 'key', myKey, key: '', deck: $('#deck0').value || Object.keys(DECKS)[0], mode: 'official', host: false, room: null, link: null, status: '', peerName: '' };
  renderNet(); $('#netDlg').hidden = false; lobbyOpen();
}
function closeNet() { if (netUi && netUi.inv) { try { netUi.inv.cancel(); } catch { /* */ } } if (netUi) clearTimeout(netUi.invT); if (netUi && netUi.link && !netMode()) { try { netUi.link.close(); } catch { /* もう閉じている */ } } lobbyClose(); netUi = null; $('#netDlg').hidden = true; }
function renderNet() {
  const u = netUi; if (!u) return;
  { const ki = $('[data-net-key]'); if (ki && u.step === 'key') u.key = ki.value.trim(); } // No.21：作り直しても、入れかけのキー番号を消さない
  const deckOpts = Object.values(DECKS).map(d => `<option value="${esc(d.code)}"${d.code === u.deck ? ' selected' : ''}>${esc(themeOf(d))}（${esc(ownerOf(d))}）</option>`).join('');
  let body = '';
  if (u.step === 'key') {
    body = `<label class="net-row">あなたのデッキ<select data-net="deck">${deckOpts}</select></label>`
      + `<div class="net-key"><small>あなたのキー</small><b>${u.myKey}</b><small>相手にこの番号を入れてもらうと、あなたが<strong>親</strong>（試合を設定する人）になります</small></div>`
      + `<p class="net-q">どんな試合？</p><div class="net-modes"><button type="button" class="btn${u.mode === 'official' ? ' primary' : ''}" data-net="mode:official">🏆 公式試合<small>戦績・実績に残る</small></button><button type="button" class="btn${u.mode === 'practice' ? ' primary' : ''}" data-net="mode:practice">📝 練習<small>記録しない</small></button></div>`
      + `<button type="button" class="btn primary net-wide" data-net="host">⏳ このキーで相手を待つ（親）</button>`
      + `<p class="net-q">📡 いま待っている人（タップでつなぐ）</p>` + (lobby && lobby.peers.length ? `<div class="net-lobby">${lobby.peers.map(p => `<button type="button" class="net-lb" data-net="lb:${esc(p.key)}"><b>${esc(p.name)}</b><span>が待っています・${p.mode === 'practice' ? '📝練習' : '🏆公式'}</span><i>対戦する ▶</i></button>`).join('')}</div>` : '<p class="net-none">いま待っている人はいません</p>')
      + `<p class="net-q">相手のキーを入れる（入れた人は<strong>子</strong>）</p><div class="net-join"><input type="text" inputmode="numeric" maxlength="4" placeholder="0000" aria-label="相手のキー番号" data-net-key value="${esc(u.key)}"><button type="button" class="btn primary" data-net="join">つなぐ</button></div>`;
  } else if (u.step === 'choose' && u.choose) {
    // 先攻・後攻を決める人：2人の名前を交互に光らせ、止まった人が選ぶ（No.16）
    const c = u.choose, opp = esc(u.peerName || '相手');
    body = `<p class="net-q">${c.round > 1 ? 'もう一度：' : ''}先攻・後攻を決める人は…</p>`
      + `<div class="net-roul${c.done ? ' done' : ''}"><span class="nr${c.lit === 'me' ? ' on' : ''}">あなた</span><span class="nr${c.lit === 'opp' ? ' on' : ''}">${opp}</span></div>`
      + (!c.done ? '' : c.me
        ? (c.sent ? `<p class="net-st">⏳ ${c.sent === 'first' ? '先攻' : '後攻'}を選びました。始まります…</p>`
          : `<p class="net-q">あなたが選びます。どちらにしますか？</p><div class="net-modes"><button type="button" class="btn primary" data-net="pick:first">⚔️ 先攻<small>先に動く</small></button><button type="button" class="btn primary" data-net="pick:second">🛡️ 後攻<small>先にドローする</small></button></div>`)
        : `<p class="net-st">⏳ ${opp}さんが先攻・後攻を選んでいます…</p>`);
  } else if (u.step === 'inv') {
    // 👥 招待する：だれを招待しますか？（電卓と同じ言葉。招待した人が親）
    const ms = (OPTS.inviteApi && OPTS.inviteApi.members()) || [];
    body = `<p class="net-q">だれを招待しますか？</p><p class="net-none">招待した人が<strong>親</strong>になります。相手がこのサイトを開いていると、画面に通知が出ます。</p>`
      + (ms.length ? `<div class="net-lobby">${ms.map(m => `<button type="button" class="net-lb" data-net="inv:${esc(m.uid)}"><b>${esc(m.name)}</b><span></span><i>招待する ▶</i></button>`).join('')}</div>` : '<p class="net-none">まだほかのメンバーがいません。</p>')
      + `<button type="button" class="btn ghost net-wide" data-net="invback">← 戻る</button>`;
  } else if (u.step === 'resumeAsk' && u.saved) {
    // 閉じて開き直した時（サイト）：対戦の続きがある
    body = `<p class="net-q">📡 さっきの対戦の続きがあります（キー ${esc(String(u.saved.host ? u.saved.myKey : u.saved.key))}・あなたは${u.saved.host ? '親' : '子'}）。戻りますか？</p>`
      + `<button type="button" class="btn primary net-wide" data-net="resumeGo">📡 さっきの対戦に戻る</button>`
      + `<button type="button" class="btn ghost net-wide" data-net="resumeQuit">やめてCPU戦へ</button>`;
  } else if (u.step === 'wait' && u.resuming && !u.stopped) {
    body = `<p class="net-st">⏳ ${u.resumeSlow ? '対戦に戻れていません。相手がもう抜けたかもしれません（3分たつと対戦は終わりになります）' : '対戦に戻っています…'}</p>`
      + `<button type="button" class="btn ghost net-wide" data-net="resumeQuit">やめてCPU戦へ</button>`;
  } else if (u.step === 'wait' && u.stopped) {
    // 始まる前に止まった（版ちがいなど）：もう押せないボタンは出さず、何をすればよいかだけ
    body = `<p class="net-err">${esc(u.err)}</p>` + (u.stopped === 'reload' ? '<button type="button" class="btn primary net-wide" data-net="reload">ページを読み直す</button>' : '');
  } else if (u.step === 'wait') {
    body = `<p class="net-st">⏳ ${u.host ? `相手を待っています（キー ${u.myKey}）` : esc(u.status || 'つないでいます…')}</p>`
      + (u.host && OPTS.inviteApi ? `<button type="button" class="btn net-wide" data-net="invopen">👥 招待する</button>` : '')
      + (u.host ? `<button type="button" class="btn net-wide" data-net="invlink">🔗 招待リンクを送る</button>${u.invSt ? `<p class="net-q">${esc(u.invSt)}</p>` : ''}` : '')
      // No.22：相手の名前が届く前は「相手」と呼ぶ（前は「親さん」と出ていた）
      + (!u.host && u.link && !u.ready ? `<p class="net-q">${esc(u.peerName || '相手')}さんの部屋につながりました。準備ができたら押してください。</p><button type="button" class="btn primary net-wide" data-net="ready">準備OK</button>` : '')
      + (!u.host && u.ready ? `<p class="net-q">⏳ ${esc(u.peerName || '相手')}さんが始めるのを待っています…</p>` : '');
  }
  if (u.err && !(u.step === 'wait' && u.stopped)) body += `<p class="net-err">${esc(u.err)}</p>`;
  // 対戦に戻っている間・「戻りますか？」の窓：見出しを変え、上の「やめる」は出さない（やめる道は［やめてCPU戦へ］の1つ。CODE 02:19・02:31）
  const back = u.step === 'wait' && u.resuming && !u.stopped ? '📡 対戦に戻っています' : u.step === 'resumeAsk' && u.saved ? '📡 さっきの対戦の続き' : '';
  const html = `<div class="box-head"><h3>${back || '👥 人と対戦の準備'}</h3>${back ? '' : '<button type="button" class="btn small ghost" data-net="close">やめる</button>'}</div>${body}`;
  // No.21：待合室の知らせ（1分ごと）などで中身が同じまま作り直すと、押している途中のボタンが入れかわって押しが消える。
  // 書きこむ中身の全部が前と同じ時は書きかえない（一部だけ比べると、戻っている間などの小さな文言の変化が残らないので、全部で比べる。MEME 16:43）
  const box = $('#netBox');
  if (box.innerHTML !== '' && box.dataset.netHtml === html) return;
  box.dataset.netHtml = html; box.innerHTML = html;
}
async function netConnect(host) {
  const u = netUi; if (!u) return;
  const key = host ? u.myKey : u.key;
  if (!/^\d{4}$/.test(key)) { u.err = 'キー番号は4桁の数字です'; renderNet(); return; }
  if (selfStale()) { u.err = STALE_MSG; u.stopped = 'reload'; u.step = 'wait'; renderNet(); return; } // 片方だけ古い時は、つながずに読み直してもらう
  u.err = ''; u.stopped = ''; u.host = host; u.step = 'wait'; u.status = 'つないでいます…'; renderNet();
  lobbyWait(host && !u.resuming); // 親は待合室に「待っています」を書く（子は何も書かない。続きに戻る時も書かない）
  try { u.room = await netJoin(key); } catch (e) { u.err = '部屋に入れませんでした：' + (e && e.message || e); u.step = 'key'; renderNet(); return; }
  if (netUi !== u) { try { u.room.leave(); } catch { /* もう閉じている */ } return; }
  u.lastSeen = Date.now();
  u.peerOff = u.room.onPeers(({ peers }) => { const o = peers.find(p => !p.isMe); if (o) { /* 相手の欄が書きかわったのを受け取った時刻（自分の時計）で数える。相手の機械の時計（updatedAt）は2台でずれていることがあるので、比べない */ if (o.updatedAt !== u.peerAt) { u.peerAt = o.updatedAt; u.lastSeen = Date.now(); } if (o.presence && o.presence.name) { u.peerName = o.presence.name; if (net) net.oppName = o.presence.name; } if (o.presence && o.presence.deck) u.peerDeck = o.presence.deck; } if (netUi === u && !netMode()) renderNet(); });
  u.link = new DuelLink({ room: u.room, uid: netUid(), host, version: netVer(), name: netMyName(), deck: u.deck, mode: u.mode, ready: host, chooseFirst: true, on: e => netEvent(u, e) });
  u.status = host ? '' : 'つながりました'; renderNet();
}
/** 招待リンク：開いた人が子になって、すぐつながる（電卓の招待リンクと同じ送り方。電卓の ?duel= とぶつからないよう ?vs=キー） */
/** 👥 招待する：電卓の招待と同じ通知を送る（3分で返事がなければ知らせる）。送るのはサイトの inviteApi */
async function netInvite(uid) {
  const u = netUi; if (!u || !OPTS.inviteApi) return;
  const m = (OPTS.inviteApi.members() || []).find(x => x.uid === uid), name = m ? m.name : 'メンバー';
  if (u.inv) { try { u.inv.cancel(); } catch { /* */ } u.inv = null; }
  u.step = 'wait'; u.invSt = '📨 送っています…'; renderNet();
  try {
    u.inv = await OPTS.inviteApi.send(uid, u.myKey, () => { if (netUi === u && !netMode()) { u.invSt = `😢 ${name}さんは、いまは対戦できないようです。`; renderNet(); } });
    u.invSt = `📨 ${name}さんを招待しました。相手の画面に通知が出ます（サイトを開いていないと届きません。そのときは「🔗 招待リンクを送る」が便利です）。`; renderNet();
    clearTimeout(u.invT); u.invT = setTimeout(() => { if (netUi === u && !netMode()) { u.invSt = '⌛ 返事がありませんでした。もう一度招待するか、招待リンクを送ってください。'; renderNet(); } }, 180000);
  } catch (e) { u.invSt = '招待を送れませんでした。'; renderNet(); }
}
async function netInviteLink() {
  const u = netUi; if (!u) return;
  const base = OPTS.inviteUrl ? OPTS.inviteUrl(u.myKey) : location.origin + location.pathname + '?vs=' + u.myKey + (ONLINE ? '&online-test' : '');
  const txt = `あのころ遊戯王のデュエル卓で対戦しよう！このリンクを開くと、すぐにつながります（キー ${u.myKey}）`;
  try { if (navigator.share) { await navigator.share({ title: 'デュエル卓の招待', text: txt, url: base }); u.invSt = '📨 招待リンクを送りました。相手が開くと自動でつながります。'; renderNet(); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(txt + '\n' + base); u.invSt = '📋 招待リンクをコピーしました。LINEなどに貼り付けて送ってください。'; } catch { u.invSt = 'このリンクを送ってください：' + base; }
  renderNet();
}
/** 先攻・後攻を決める人のルーレット（約2秒）。止まったら、決める人には［先攻］［後攻］ */
function netChooser(u, e) {
  clearTimeout(u.chooseT);
  const me = e.me != null ? !!e.me : e.chooser === mySeatOf(u);
  u.choose = { me, lit: 'me', done: false, sent: null, round: e.round || 1 };
  u.step = 'choose'; $('#netDlg').hidden = false; netNote('');
  if (setupOpen()) { $('#setup').hidden = true; SU = null; } // t26：再戦の先攻・後攻を選ぶ時に、準備画面（ホーム画面）が開いていたら閉じる
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gaps = reduce ? [] : [90, 90, 100, 110, 120, 140, 160, 190, 230, 280, 340];
  let k = 0; const c = u.choose;
  const step = () => {
    if (netUi !== u || u.choose !== c) return;
    if (k < gaps.length) { c.lit = c.lit === 'me' ? 'opp' : 'me'; renderNet(); u.chooseT = setTimeout(step, gaps[k++]); return; }
    c.lit = me ? 'me' : 'opp'; c.done = true; renderNet();
    play([me ? 'aceLand' : 'summon']);
  };
  step();
}
/** 自分の席（始まる前は、親が席0・子が席1） */
const mySeatOf = u => (u.host ? 0 : 1);
function netEvent(u, e) {
  if (e.type === 'chooser') { netChooser(u, e); return; }
  if (e.type === 'start') {
    u.choose = null; clearTimeout(u.chooseT); u.resuming = false; u.resumeSlow = false;
    $('#netDlg').hidden = true; lobbyClose(); // 始まったら、待合室からは消える
    if (setupOpen()) { $('#setup').hidden = true; SU = null; } // t26：始まった時（再戦も）に、準備画面（ホーム画面）が開いていたら閉じる
    netRemember(u); // 読み直した時に、同じ部屋・同じ側で戻れるように覚える
    if (u.inv) { try { u.inv.cancel(); } catch { /* */ } u.inv = null; } clearTimeout(u.invT);
    mySeat = e.seat; net = { link: u.link, oppName: u.peerName || '相手', mode: e.mode, ui: u };
    $('#mode').value = 'hot'; $('.droot').classList.add('net-on');
    S = e.state; // 通信の部品が作った盤面には書きこまない（マスを聞く相手 askZone は、部品が2台とも [0, 1] で作る。2台で必ず同じに）
    if (JSON.stringify(S.askZone) !== JSON.stringify([0, 1])) console.warn('オンラインの盤面の askZone が [0, 1] ではありません', S.askZone);
    history = []; selected = null; pick = []; sheet = null; peek = false; lastLp = [S.players[0].lp, S.players[1].lp]; glowDone.clear(); costShown.clear(); heldAnims = []; trace = []; thinking = null; aceSeen = new Set(); undoUsed = false; resultSent = false;
    netNote(''); render();
    // 読み直して同じ部屋に入り直した時（resumed）：開始の帯は出さず、「つなぎ直しました」を少し出す（MEMEの知らせの形）
    if (e.resumed && u.link && u.link.giveUpPending) netNote('<b>🏳 降参しています…</b><span>相手の画面に届くと決着します</span><button type="button" class="btn small ghost" data-net="quit">やめてCPU戦へ</button>'); // 降参を送ったあとに読み直した
    else if (e.resumed) { netNote('<b>📡 つなぎ直しました。続きから再開します</b>'); const nt = net; setTimeout(() => { if (net === nt && $('#netNote') && /つなぎ直しました/.test($('#netNote').textContent)) netNote(''); }, 3000); }
    else banner(S.turnPlayer === ME() ? 'あなたの先攻' : `${NAME(OPP())}の先攻`, S.turnPlayer === ME() ? 'me' : 'opp', 1100);
  } else if (e.type === 'remote') { if (net) { u.lastSeen = Date.now(); commit(e.state); render(); } }
  else if (e.type === 'end') { netForget(); if (net) netEndNote(e.winner); }
  else if (e.type === 'rematchAsked') { if (net) net.oppAsked = true; if (net && S && S.winner !== null) renderDock(); if (net && S && S.winner !== null) netNote(`<b>${esc(net.oppName)}さんが、もう一度を申し込んでいます</b><button type="button" class="btn small primary" data-net="ask">受ける</button><button type="button" class="btn small ghost" data-net="quit">やめる</button>`); }
  // 先攻・後攻を3分選ばなかった時（MEMEの reason: 'nochoose'）：決める人だった側と相手の側で言葉を分ける
  else if (e.type === 'away' && e.reason === 'nochoose') netStop(u.choose && u.choose.me ? '先攻・後攻を3分以内に選ばなかったので、この対戦は始まりませんでした。' : `${u.peerName || '相手'}さんが先攻・後攻を選ばなかったので、この対戦は始まりませんでした。`);
  else if (e.type === 'away') netStop('相手がいなくなったので、この対戦は終わりです。戦績には残りません。');
  else if (e.type === 'version') netStop('相手と版がちがいます。2人ともページを読み直してください（新しい版が出た直後は、古い画面を覚えていることがあります）。', true);
  else if (e.type === 'desync') { console.warn('オンライン対戦のずれ', e.detail); netStop('2人の画面がずれてしまいました。この対戦は終わりです（戦績には残りません）。'); }
}
/** 上の知らせの帯（つながりが切れたかも／終わりの知らせ） */
function netNote(html) { const el = $('#netNote'); if (!el) return; el.innerHTML = html; el.hidden = !html; }
/** サイトの戦績（人どうし📊）に渡す中身：勝ち負け・自分と相手の名前とデッキ・LP・ターン・先攻か（公式試合で、サイトの時だけ。ほかは null） */
function netResultOf(winner) {
  if (!net || net.mode === 'practice' || !OPTS.onNetResult || !S) return null;
  const md = DECKS[net.ui && net.ui.deck], od = DECKS[net.ui && net.ui.peerDeck];
  return { winner, me: ME(), result: winner === 'draw' ? 'draw' : winner === ME() ? 'win' : 'lose', oppName: net.oppName, mode: net.mode, myTheme: md ? themeOf(md) : null, oppTheme: od ? themeOf(od) : null, myLp: S.players[ME()].lp, oppLp: S.players[OPP()].lp, turn: S.turn, first: S.firstPlayer === ME() };
}
function netRecord(res) { if (res && OPTS.onNetResult) try { OPTS.onNetResult(res); } catch (err) { console.error(err); } }
/** 降参を送ったまま、決着を受け取らずに抜けた時（読み直して［やめてCPU戦へ］・3分たった・降参の待ちで［やめてCPU戦へ］）：覚えておいた負けを戦績に書く（💜MIMIの見つけた穴：わざと負けを残さずに抜けられた） */
function netRecordGiveUp(r) { if (r && r.giveUp) netRecord(r.giveUp); }
function netEndNote(winner) {
  // t21：サイトのお試し版（OPTS.netTrial）は戦績に書かない作り（サイトの addNet）。書かない時に「記録しました」と出さない
  const rec = net && net.mode === 'practice' ? '📝 練習なので記録しません' : OPTS.netTrial ? '📝 試作版なので戦績には記録しません' : OPTS.onNetResult ?'🏆 公式試合として戦績に記録しました' : '（この画面では戦績に記録しません）';
  netRecord(netResultOf(winner));
  if (net && net.ui) net.ui.giveUp = null;
  netNote(`<b>${winner === 'draw' ? '引き分け' : winner === ME() ? 'あなたの勝ち！' : 'あなたの負け…'}</b><span>${rec}</span>`
    + '<button type="button" class="btn small primary" data-net="ask">もう一度（同じ相手と）を申し込む</button>'
    + '<button type="button" class="btn small ghost" data-net="quit">やめる</button>'
    + (HOME_ON && OPTS.menuFirst ? '<button type="button" class="btn small ghost" data-net="home">🏠 ホームへ</button>' : ''));
}
function netStop(msg, reload) {
  netForget(); // 止まった対戦には戻らない
  netNote(`<b>${esc(msg)}</b>${reload ? '<button type="button" class="btn small primary" data-net="reload">読み直す</button>' : ''}<button type="button" class="btn small ghost" data-net="quit">準備に戻る</button>`);
  if (net) net.stopped = true; // 止まった印：1秒ごとの見回りが「つながりが切れました」で上書きしないように（MIMIの気づき）
  if (net && net.link) { try { net.link.close(); } catch { /* もう閉じている */ } }
  if (netUi && !net) {
    netUi.err = msg; netUi.stopped = reload ? 'reload' : 'stop';
    if (netUi.link) { try { netUi.link.close(); } catch { /* もう閉じている */ } }
    renderNet();
  }
}
function netQuit() {
  if (net && net.link && net.link.giveUpPending && net.ui) netRecordGiveUp(net.ui); // 降参を送ったまま、決着を待たずにやめた：負けを書く
  netForget(); // 自分でやめた
  const u = net ? net.ui : netUi;
  if (u) { try { u.peerOff && u.peerOff(); } catch { /* */ } try { u.link && u.link.close(); } catch { /* */ } }
  lobbyClose(); net = null; netUi = null; mySeat = 0; $('.droot').classList.remove('net-on'); netNote(''); $('#netDlg').hidden = true;
  $('#mode').value = 'cpu'; newDuel(true); if (OPTS.menuFirst) { placeholder = true; openSetup(); }
}
/** 相手の知らせが来ない時：上の帯に「つながりが切れたかも（あと m:ss で終わり）」 */
setInterval(() => {
  if (!net || net.stopped || !net.ui || !S || S.winner !== null) return;
  // 通信の部品と同じ数え方（相手の欄が変わったのを、この端末が受け取った時刻）。無ければ画面の側で覚えた時刻
  const seen = Math.max((net.link && net.link.lastSeenAt) || 0, net.ui.lastSeen || 0);
  const gone = Date.now() - (seen || Date.now());
  if (!net.savedAt || Date.now() - net.savedAt > 15000) { net.savedAt = Date.now(); netRemember(net.ui); } // 続きの覚えの時刻を新しくする（3分より古い覚えは使わないので）
  if (gone > NET_AWAY_SHOW) { const left = Math.max(0, 180000 - gone), m = Math.floor(left / 60000), sec = String(Math.floor(left / 1000) % 60).padStart(2, '0'); netNote(`<b>📡 つながりが切れました。もどるのを待っています（あと ${m}:${sec}）</b>`); }
  else if ($('#netNote') && /つながりが切れ/.test($('#netNote').textContent)) netNote('');
}, 1000);
function netClick(t) {
  const b = t.closest('[data-net]'); if (!b) return false;
  const [k, v] = b.dataset.net.split(':');
  if (k === 'close') { if (netUi && (netUi.resuming || netUi.step === 'resumeAsk')) { netRecordGiveUp(netUi.saved || netUi.resumeFrom); netForget(); } closeNet(); if (OPTS.menuFirst && !netMode()) openSetup(); return true; }
  if (k === 'resumeGo') { const r = netUi && netUi.saved; if (r) { if (!OPTS.uid) try { sessionStorage.setItem('gx-net-uid', r.uid); } catch { /* */ } closeNet(); netResume(r); } return true; }
  if (k === 'resumeQuit') { netRecordGiveUp(netUi && (netUi.saved || netUi.resumeFrom)); netForget(); closeNet(); if (OPTS.menuFirst && !netMode()) openSetup(); return true; }
  if (k === 'mode') { netUi.mode = v; renderNet(); return true; }
  if (k === 'host') { netConnect(true); return true; }
  if (k === 'invlink') { netInviteLink(); return true; }
  if (k === 'home' && HOME_ON) { netQuit(); setTimeout(() => { placeholder = true; openSetup('home'); }, 0); return true; }
  if (k === 'pick' && netUi && netUi.choose && netUi.choose.me && !netUi.choose.sent && netUi.link && netUi.link.chooseFirst) { netUi.choose.sent = v; netUi.link.chooseFirst(v === 'first'); renderNet(); return true; }
  if (k === 'invopen') { netUi.step = 'inv'; renderNet(); return true; }
  if (k === 'invback') { netUi.step = 'wait'; renderNet(); return true; }
  if (k === 'inv') { netInvite(v); return true; }
  if (k === 'lb') { netUi.key = v; netConnect(false); return true; }
  if (k === 'join') { const i = $('[data-net-key]'); netUi.key = i ? i.value.trim() : ''; netConnect(false); return true; }
  if (k === 'ready') { netUi.ready = true; netUi.link && netUi.link.setReady(); renderNet(); return true; }
  // もう一度：親も子も、勝ち負けに関係なく申し込める。2人とも申し込むと始まる（相手の申し込みを［受ける］も同じ）
  if (k === 'ask') {
    const accept = !!(net && net.oppAsked); // 相手の申し込みを受けた側か（言葉を分ける：MIMIの通し）
    if (net && net.link && net.link.requestRematch() && S && S.winner !== null && (renderDock(), true)) netNote(accept ? '<b>⏳ 受けました</b><span>先攻・後攻を決める人を選んでいます…</span>' : '<b>⏳ もう一度を申し込みました</b><span>相手が受けると始まります</span><button type="button" class="btn small ghost" data-net="quit">やめる</button>');
    return true;
  }
  if (k === 'quit') { netQuit(); return true; }
  if (k === 'reload') { location.reload(); return true; }
  return false;
}

/* ---------- 辞書：カードの公式Q&A（記録のカード名・盤面のカード・説明の欄から開く小さい窓） ---------- */
const RUL_NAMES = nameIndex(RULINGS, CARD_POOL);
/** 説明の欄の「📖 公式Q&A（○件）」ボタン（Q&Aがあるカードだけ） */
function rulBtn(code) { const n = rulingsFor(RULINGS, code).length; return n ? `<button type="button" class="btn small ghost rul-btn" data-rul="${esc(code)}">📖 公式Q&amp;A（${n}件）</button>` : ''; }
function showRulings(code) {
  const list = rulingsFor(RULINGS, code); if (!list.length) return;
  $('#rulingBox').innerHTML = rulingsHtml(CARD_POOL[code]?.name || '', list);
  if (list.length === 1) { const d = $('#rulingBox details'); if (d) d.open = true; } // 1件だけなら、はじめから開いておく
  $('#rulingDlg').hidden = false;
}
/* ---------- 操作ガイド：はじめて開いた時に1回だけ。☰メニューからいつでも ---------- */
let guideAt = 0;
const guideEnv = () => ({ touch: matchMedia('(hover: none)').matches, land: landscape() });
function openGuide(i = 0) { guideAt = Math.max(0, Math.min(guidePages().length - 1, i)); $('#guideBox').innerHTML = guideHtml(guideAt, guideEnv()); $('#guideDlg').hidden = false; }
function closeGuide() { $('#guideDlg').hidden = true; if (!OPTS.demo && !OPTS.quick) try { localStorage.setItem(GUIDE_KEY, '1'); } catch { /* 覚えられない環境 */ } setTimeout(() => { if (S && !pausedUi()) scheduleCpu(); }, 0); }
/** この端末でまだ見ていなければ、ガイドを出す（DEMO・2人対戦の準備中などでは出さない） */
function maybeGuide() { if (OPTS.demo || OPTS.quick) return; let seen = false; try { seen = !!localStorage.getItem(GUIDE_KEY); } catch { seen = true; } if (!seen) openGuide(0); }
function describe(uid) {
  const c = S.cards[uid], d = defOf(S, uid);
  if (isRemote(c.controller) && (c.zone === 'hand' || ((c.zone === 'mzone' || c.zone === 'szone') && !c.faceUp))) {
    const pu = prevUp(uid) ? `<p class="pu-note">${prevUpText(esc(d.name), d)}<small>（今は裏側。この情報は公開されていない）</small></p>` : '';
    return { head: `<h3>裏側のカード</h3><p class="tl">${NAME(c.controller)}の${c.zone === 'hand' ? '手札' : 'フィールド'}のカードです。中身は見えません。</p>${pu}`, text: '' };
  }
  const typeLine = d.kind === 'monster'
    ? `${d.attribute}属性・${d.race}・★${d.level}・${(d.monsterTypes || []).join('／')}・攻${d.atk}／守${d.def}`
    : `${d.subtype}${d.kind === 'spell' ? '魔法' : '罠'}`;
  const where = { hand: '手札', mzone: 'モンスターゾーン', emz: 'モンスターゾーン', szone: '魔法＆罠ゾーン', fzone: 'フィールドゾーン', gy: '墓地', deck: 'デッキ', extra: 'EXデッキ', banished: '除外' }[c.zone];
  const state = c.zone === 'mzone' || c.zone === 'emz' ? `・${c.faceUp ? '表側' : '裏側'}${c.position === 'atk' ? '攻撃' : '守備'}表示・今の攻${currentAtk(S, uid)}／守${currentDef(S, uid)}` : (c.zone === 'szone' || c.zone === 'fzone') ? `・${c.faceUp ? '表側' : '裏側'}` : '';
  const extra = [];
  if (c.counters && c.counters.magic) extra.push(`魔力カウンター ${c.counters.magic}`);
  if (c.equippedTo !== null) extra.push(`${defOf(S, c.equippedTo).name}に装備`);
  if (c.noAttack) extra.push('攻撃できない');
  // 墓地・除外の儀式・融合モンスターが蘇生できるか（正規の召喚をしていないものは特殊召喚できない）
  if ((c.zone === 'gy' || c.zone === 'banished') && d.kind === 'monster' && (d.frame === 'ritual' || d.frame === 'fusion')) {
    const how = d.frame === 'ritual' ? '儀式召喚' : '融合召喚';
    if (SCRIPTS[c.code] && SCRIPTS[c.code].fusionOnly) extra.push('融合召喚でしか出せないカードなので、墓地から出し直せません');
    else extra.push(c.proper ? `${how}で正しく出したカードなので、墓地から出し直せます` : `${how}で正しく出していないカードなので、墓地から出し直せません`);
  }
  return {
    head: `<h3>${esc(d.name)}</h3>${rulBtn(c.code)}<p class="tl">${esc(typeLine)}</p><p class="tl">${NAME(c.controller)}の${where}${state}</p>${extra.length ? `<p class="tl">${esc(extra.join('・'))}</p>` : ''}`,
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
      else if (tributesFor(S, uid) > 0) out.push({ info: `リリース（自分の場のモンスターを墓地へ送る）が${tributesFor(S, uid)}体必要です。` });
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
  const where = u => ({ hand: '手札', deck: 'デッキ', gy: '墓地', mzone: 'フィールド', emz: 'フィールド', szone: 'フィールド', extra: 'EXデッキ', banished: '除外' }[S.cards[u].zone]);
  // 相手の裏側のカード（伏せた魔法・罠、裏守備のモンスター）と相手の手札は、中身を見せない。どれか分かるように、画面の左から何番目かを書く
  const hidden = u => { const c = S.cards[u]; return c.controller !== r.player && ((!c.faceUp && ['mzone', 'emz', 'szone', 'fzone'].includes(c.zone)) || c.zone === 'hand' || c.zone === 'deck'); };
  const pos = u => { const c = S.cards[u]; if (c.zone !== 'mzone' && c.zone !== 'szone') return ''; const i = c.controller !== ME() ? 5 - c.index : c.index + 1; return `（左から${i}番目）`; };
  const label = u => { const c = S.cards[u]; if (!hidden(u)) return defOf(S, u).name; const op = oppWord(cpuMode()); return c.zone === 'hand' ? `${op}の手札` : c.zone === 'mzone' || c.zone === 'emz' ? `${op}の裏側のモンスター${pos(u)}` : `${op}の伏せカード${pos(u)}`; };
  const range = r.min === r.max ? `${r.min}枚` : `${r.min}〜${r.max}枚`;
  const ok = pick.length >= r.min && pick.length <= r.max;
  return head + `<p class="tl">${range}選んでください（${pick.length}枚選択中）。盤面のカードを押しても選べます。</p><div class="optlist cards" role="listbox" aria-multiselectable="${r.max > 1}">${r.options.map(u => { const c = S.cards[u], show = !hidden(u); const d = defOf(S, u); return `<button class="opt cardopt${pick.includes(u) ? ' on' : ''}" data-opt="${u}" role="option" aria-selected="${pick.includes(u)}" aria-label="${esc(label(u))}"><span class="${show ? faceCls(d) : 'card back'}">${show ? faceHtml(u, d, false) : ''}</span><span class="on-mark" aria-hidden="true">✓</span><small>${esc(label(u))}</small><small class="wh">${NAME(c.controller)}・${where(u)}</small></button>`; }).join('')}</div>
    <button class="btn primary confirm" id="confirmPick" ${ok ? '' : 'disabled'}>決定</button>`;
}

/** これから再生する演出があるか（ある時は、選ぶ画面やシートを演出の後に開く） */
const fxSoon = () => !!pendingMoves || pendingSummons.length > 0;
function renderDetail() {
  const el = $('#detail');
  if (S.pending && isRemote(S.pending.request.player)) { el.innerHTML = `<h3>${netMode() ? `${esc(NAME(OPP()))}が選んでいます…` : 'CPUが考え中…'}</h3><p class="prompt">${esc(S.pending.request.prompt)}</p>`; return; }
  if (S.pending && isDeckPick(S.pending.request)) {
    el.innerHTML = `<h3>あなたの選択</h3><p class="prompt">${esc(S.pending.request.prompt)}</p><p class="tl">広げた${fanSrc(S.pending.request) === 'hand' ? '手札' : '山札'}から選んでください。</p>`;
    if (!fxSoon()) openFan(); // これから演出がある時は、演出が終わってから広げる
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
  el.innerHTML = S.log.slice(-200).map(l => `<li class="${l.text.startsWith('―') ? 'turn' : ''}">${linkNames(esc(WHO(l.text)), RUL_NAMES)}</li>`).join('');
  el.scrollTop = el.scrollHeight;
}


/* ---------- デッキから選ぶ時：山札を扇形に広げて、カードを直接選ぶ ---------- */
let fan = null;           // { key, layer, sel, req }
let recentAdd = null;     // 引いた直後に手札から選ぶ時の、引いたカード { p, uids }
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
  if (isTopReveal(r)) { openTopReveal(r, key); return; }
  const p = r.player, src = fanSrc(r), all = src === 'hand' ? (sortsHand(p) ? sortHand(S, S.players[p].hand) : [...S.players[p].hand]) : sortForFan(S.players[p].deck);
  const layer = document.createElement('div');
  layer.className = 'fan-layer';
  const range = r.min === r.max ? `${r.min}枚選ぶ` : `${r.min}〜${r.max}枚選ぶ`;
  layer.innerHTML = `<div class="fan-head"><b>${esc(r.prompt)}</b><span>${src === 'hand' ? '手札' : '山札'} ${all.length}枚から${range}（明るいカードが選べます）</span></div><div class="fan-area"></div>`
    + `<div class="fan-btns">${history.length ? '<button class="btn ghost" data-fanundo aria-label="ひとつ戻す">↶ ひとつ戻す</button>' : ''}${r.min === 0 ? '<button class="btn" data-fanskip>選ばない</button>' : ''}${r.max > 1 ? '<button class="btn primary" data-fanok disabled>決定</button>' : ''}</div>`;
  $('.droot').appendChild(layer);
  const area = layer.querySelector('.fan-area');
  area.innerHTML = all.map(u => fanCardHtml(u, false)).join('');
  const els = [...area.children];
  els.forEach(el => { if (!r.options.includes(Number(el.dataset.fan))) el.classList.add('dim'); });
  // 引いた直後に手札から選ぶ時（暗黒界の取引など）：引いたカードを右、残りの手札を左の扇に置く
  const fresh = src === 'hand' && recentAdd && recentAdd.p === p ? recentAdd.uids.filter(u => all.includes(u)) : [];
  recentAdd = null;
  if (fresh.length) {
    const elOf = u => els.find(el => Number(el.dataset.fan) === u);
    const kept = all.filter(u => !fresh.includes(u)).map(elOf), added = fresh.map(elOf);
    added.forEach(el => el.classList.add('new'));
    area.append(...kept, ...added);
    layoutHandAdd(area, kept, added);
  } else layoutFan(area, els, src === 'hand');
  fan = { key, layer, sel: [], req: r, p, src };
  // 山札（または手札）の場所から、カードが扇の形に開く
  const from = src === 'hand' ? handEl(p) : pileEl(p, 'deck');
  if (src !== 'hand') glowPile(p);
  const opened = from ? flyIn(els, centerOf(rectOf(from))) : Promise.resolve();
  // デッキから選ぶ時（サーチ）：開き終わったら、選べるカードを墓地と同じ「扇の左右スクロール」にまとめる（No.4 ボスの注文）。
  // 真ん中のカードが大きくなって効果が下に出る。真ん中のカードを押すと選ぶ、ほかのカードを押すと真ん中に来る
  if (src === 'deck') { opened.then(() => { if (fan && fan.layer === layer) fanCarousel(layer, els); }); return; }
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
/** デッキから選ぶ扇を、左右スクロールに作りかえる（選べないカードは後ろの扇に薄く残す） */
function fanCarousel(layer, els) {
  const picks = sortForFan(els.filter(el => !el.classList.contains('dim')).map(el => Number(el.dataset.fan)));
  const rest = els.filter(el => el.classList.contains('dim')), area = layer.querySelector('.fan-area');
  els.filter(el => !el.classList.contains('dim')).forEach(el => el.remove());
  if (rest.length) { area.classList.add('sorting'); layoutFan(area, rest); setTimeout(() => area.classList.remove('sorting'), 600); } else area.classList.add('empty');
  const car = document.createElement('div');
  car.className = 'pile-car fan-car'; car.tabIndex = 0; car.setAttribute('aria-label', '選べるカード');
  car.innerHTML = picks.map(u => { const d = defOf(S, u); return `<span class="pile-it" data-u="${u}"><span class="${faceCls(d)} pile-face" data-fan="${u}">${faceHtml(u, d, false)}</span></span>`; }).join('');
  layer.insertBefore(car, layer.querySelector('.fan-btns'));
  car.animate([{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }], { duration: fanDur(360), easing: 'cubic-bezier(.2,.8,.2,1)' });
  const ctl = carousel(car, it => fanPeek(it.querySelector('[data-fan]'), Number(it.dataset.u)));
  fan.car = ctl;
  const tip = layer.querySelector('.fan-head span');
  if (tip) tip.textContent = `左右にスクロールして、真ん中のカードを押すと${fan.req.max > 1 ? '選びます' : pickVerb(fan.req.prompt)}（${picks.length}枚から）`;
}
/* ---------- デッキの上から何枚かをめくって1枚選ぶ（強欲で謙虚な壺など） ----------
 * 背景に赤い炎（強欲）と緑の渦（謙虚）が流れ、デッキから裏側のカードがパラパラと画面の中央へ出てくる。
 * 右のカードから順に表になり、1枚をタップして選ぶ。長押しでカードの効果を見られる */
function isTopReveal(r) {
  if (!r || r.kind !== 'cards' || r.max !== 1 || r.options.length > 3 || r.options.length < 2) return false;
  const deck = S.players[r.player].deck, top = deck.slice(-r.options.length);
  return r.options.every(u => top.includes(u));
}
function openTopReveal(r, key) {
  const p = r.player;
  const layer = document.createElement('div');
  layer.className = 'fan-layer topreveal';
  layer.innerHTML = `<div class="hb-bg" aria-hidden="true"><i class="hb-flame"></i><i class="hb-swirl"></i></div>`
    + `<div class="fan-head"><b>${esc(r.prompt)}</b><span>デッキの上の${r.options.length}枚から1枚選ぶ（タップで選ぶ・長押しで効果）</span></div>`
    + `<div class="hb-row"></div><div class="fan-btns">${history.length ? '<button class="btn ghost" data-fanundo aria-label="ひとつ戻す">↶ ひとつ戻す</button>' : ''}</div>`;
  $('.droot').appendChild(layer);
  const row = layer.querySelector('.hb-row');
  const order = [...r.options]; // デッキの一番上から順に左へ
  const els = order.map(u => {
    const d = defOf(S, u), w = document.createElement('span');
    w.className = 'hb-card'; w.dataset.fan = String(u);
    w.innerHTML = `<span class="hb-flip"><span class="${faceCls(d)} hb-face">${faceHtml(u, d, false)}</span><span class="card back hb-back"></span></span>`;
    row.appendChild(w); return w;
  });
  fan = { key, layer, sel: [], req: r, p, src: 'deck', top: true, ready: false };
  const deck = pileEl(p, 'deck'), from = deck ? centerOf(rectOf(deck)) : { x: innerWidth / 2, y: innerHeight };
  glowPile(p);
  // デッキからパラパラと中央へ
  els.forEach((el, i) => {
    const c = centerOf(rectOf(el));
    el.animate([{ transform: `translate(${from.x - c.x}px,${from.y - c.y}px) scale(.45) rotate(${-12 + i * 6}deg)`, opacity: .3 }, { transform: 'none', opacity: 1 }],
      { duration: fanDur(480), delay: fanDur(i * 170), easing: 'cubic-bezier(.2,.8,.25,1)', fill: 'backwards' });
  });
  // 右のカードから順に表になる
  const start = fanDur(480 + (els.length - 1) * 170 + 250);
  [...els].reverse().forEach((el, i) => setTimeout(() => { el.querySelector('.hb-flip').classList.add('up'); if (i === els.length - 1 && fan && fan.layer === layer) fan.ready = true; }, start + fanDur(i * 260)));
  // 長押しで効果
  let lp = null;
  layer.addEventListener('pointerdown', e => {
    const el = e.target.closest('.hb-card'); if (!el) return;
    clearTimeout(lp?.t);
    lp = { el, x: e.clientX, y: e.clientY, t: setTimeout(() => { lp.fired = true; fanPeek(el, Number(el.dataset.fan)); const h = layer.querySelector('.fan-hint'); if (h) h.textContent = 'タップで手札に加えます'; }, LONG_PRESS_MS) };
  });
  layer.addEventListener('pointermove', e => { if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10) clearTimeout(lp.t); });
  layer.addEventListener('pointerup', () => { if (lp) clearTimeout(lp.t); });
  layer.addEventListener('click', e => {
    const el = e.target.closest('.hb-card'); if (!el) return;
    e.stopPropagation();
    if (lp && lp.fired) { lp = null; return; }
    if (!fan || !fan.ready) return;
    fanFinish([Number(el.dataset.fan)]);
  });
}
/** 選ぶ画面の「もう一度押すと〜」の言葉：選ぶ目的（案内文）に合わせる */
function pickVerb(prompt) {
  return /特殊召喚/.test(prompt) ? '特殊召喚します' : /捨て/.test(prompt) ? '捨てます' : /除外/.test(prompt) ? '除外します' : /墓地へ送|墓地に送/.test(prompt) ? '墓地へ送ります' : /デッキ.*(戻|置)/.test(prompt) ? 'デッキに戻します' : /手札に加/.test(prompt) ? '手札に加えます' : '選びます';
}
/** 山札を広げている時に、押したカードの効果を見せる（もう一度押すと選ぶ） */
function fanPeek(el, u) {
  if (!fan) return;
  fan.peek = u;
  fan.layer.querySelectorAll('[data-fan]').forEach(x => x.classList.toggle('peek', x === el));
  let box = fan.layer.querySelector('.fan-info');
  if (!box) { box = document.createElement('div'); box.className = 'fan-info'; box.setAttribute('aria-live', 'polite'); fan.layer.insertBefore(box, fan.layer.querySelector('.fan-pick') || fan.layer.querySelector('.fan-btns')); }
  const d = defOf(S, u), ok = fan.req.options.includes(u);
  box.innerHTML = `<b>${esc(d.name)}</b><small>${esc(cardTypeText(d))}</small><p>${esc(d.text || '')}</p><span class="fan-hint">${ok ? `${fan.car ? 'このカードを押すと' : 'もう一度押すと'}${fan.req.max > 1 ? (fan.sel.includes(u) ? '選ぶのをやめます' : '選びます') : pickVerb(fan.req.prompt)}` : 'このカードは選べません'}</span>`;
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
  const dest = /除外/.test(r.prompt) ? pileEl(p, 'banished') : /墓地|捨て/.test(r.prompt) ? pileEl(p, 'gy') : /特殊召喚|フィールド/.test(r.prompt) ? $('#board') : handEl(p);
  const to = dest ? centerOf(rectOf(dest)) : { x: innerWidth / 2, y: innerHeight };
  const pile = fan.src === 'hand' ? handEl(p) : pileEl(p, 'deck'), back = pile ? centerOf(rectOf(pile)) : to;
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
  const hand = handEl(j.p), gy = pileEl(j.p, 'gy');
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
  const hand = handEl(j.p);
  if (!hand) return;
  // ドローの演出：①引いたカードを中央に見せる → ②下から手札が出てきて、一番右に引いたカードが入る
  // → ③中央で重なるように閉じながら裏返る → ④表に返りながら、並べ替えた順で開く → ⑤手札の場所へ
  // 動きは全部 transform（位置・回転・裏返し）だけで、始まりと終わりの形をこちらで決めてつなぐ（途中で引っかからないように）
  const T = ms => fanDur(ms);
  const wait = ms => new Promise(res => setTimeout(res, T(ms)));
  const layer = document.createElement('div');
  layer.className = 'fan-layer cpu hand-add draw-fx';
  const names = j.added.map(u => `「${j.ds[u].name}」`).join('');
  const verb = j.drew ? 'ドロー' : '手札に加えた';
  layer.innerHTML = `<div class="fan-head"><b>${esc(verb)}：${esc(names)}</b><span>手札 ${j.kept.length + j.added.length}枚</span></div><div class="dfx-stage"></div>`;
  $('.droot').appendChild(layer);
  if (j.p === ME() && narrow()) $('.droot').classList.add('hand-lifted');
  const stage = layer.querySelector('.dfx-stage');
  const W = stage.clientWidth || innerWidth, H = stage.clientHeight || innerHeight;
  // 自分の手札（スマホ）：最後は、開いた手札と同じ大きさ・同じ並びのまま降ろして、そのまま手札になる（縮めない）。
  // そのために、先に手札の場所を開いておく（演出の間は手札のカードは隠れている）
  let handGeo = null;
  if (j.p === 0 && narrow() && hand) {
    const tr = $('#tray');
    // No.24：しまっている手札を開くのは、自分のターンで返事待ちが無い時だけ（相手のターンなどで開くと、すぐ返事待ちで自動で閉じて、開く→閉じるをくり返していた）
    if (!trayOpen && tr && trayMayOpen()) {
      const els0 = [tr, hand];
      els0.forEach(e => { e.style.transition = 'none'; });
      setTray(true); void tr.offsetWidth;
      requestAnimationFrame(() => requestAnimationFrame(() => els0.forEach(e => { e.style.transition = ''; })));
    }
    if (trayOpen) handGeo = { hr: rectOf(hand), hw: parseFloat(getComputedStyle(hand).getPropertyValue('--cw')) || 104 };
  }
  const cw = handGeo ? handGeo.hw : narrow() ? 78 : 100, ch = cw * 86 / 59;
  const cx = W / 2, cy = H * .5;
  // カード（表と裏を持ち、裏返しは rotateY）
  const order0 = [...j.kept, ...j.added];
  const els = new Map();
  for (const u of order0) {
    const el = document.createElement('span');
    el.className = 'dfx-card' + (j.added.includes(u) ? ' new' : '');
    el.style.width = cw + 'px'; el.style.height = ch + 'px';
    el.innerHTML = `<span class="${faceCls(j.ds[u])} dfx-face" style="font-size:${(cw / 8).toFixed(1)}px">${faceHtml(u, j.ds[u], false)}</span><span class="card back dfx-back"></span>`;
    stage.appendChild(el); els.set(u, el);
  }
  // 扇の形：n 枚のうち i 番目の位置（中央が cx）
  const fanPos = (i, n) => {
    const t = n === 1 ? 0 : i / (n - 1) - .5;
    const step = n > 1 ? Math.min(cw * .64, (W - cw - 16) / (n - 1)) : 0;
    return { x: cx + t * step * (n - 1), y: cy + t * t * 40, r: t * Math.min(26, 4 * n) };
  };
  const tf = (p, flip = 0, s = 1) => `translate(${(p.x - cw / 2).toFixed(1)}px, ${(p.y - ch / 2).toFixed(1)}px) rotate(${(p.r || 0).toFixed(1)}deg) rotateY(${flip}deg) scale(${s})`;
  const anim = (el, from, to, ms, delay = 0, ease = 'cubic-bezier(.22,.8,.25,1)') =>
    el.animate([{ transform: from }, { transform: to }], { duration: T(ms), delay: T(delay), easing: ease, fill: 'both' }).finished;
  const n = order0.length;
  const slot = new Map(order0.map((u, i) => [u, fanPos(i, n)]));
  const center = { x: cx, y: cy - 10, r: 0 };
  const deck = pileEl(j.p, 'deck'), dr = deck ? rectOf(deck) : null, sr = rectOf(stage);
  const fromDeck = dr ? { x: dr.left + dr.width / 2 - sr.left, y: dr.top + dr.height / 2 - sr.top, r: 0 } : { x: cx, y: H + ch, r: 0 };
  const below = i => ({ x: cx + (i - n / 2) * 18, y: H + ch * .7, r: (i - n / 2) * 4 });
  // 最初は全部見えない場所に置いておく
  j.kept.forEach((u, i) => { els.get(u).style.transform = tf(below(i)); });
  j.added.forEach(u => { els.get(u).style.transform = tf(j.drew ? fromDeck : below(n), 0, .5); });
  // ① 引いたカードを中央に大きく
  await Promise.all(j.added.map((u, k) => anim(els.get(u), tf(j.drew ? fromDeck : below(n), 0, .5), tf({ x: cx + (k - (j.added.length - 1) / 2) * cw * .7, y: cy - 30, r: 0 }, 0, 1.25), 420, k * 60)));
  await wait(380);
  // ② 下から手札が出てきて扇に。引いたカードは一番右へ
  await Promise.all([
    ...j.kept.map((u, i) => anim(els.get(u), tf(below(i)), tf(slot.get(u)), 460, i * 25)),
    ...j.added.map((u, k) => anim(els.get(u), tf({ x: cx + (k - (j.added.length - 1) / 2) * cw * .7, y: cy - 30, r: 0 }, 0, 1.25), tf(slot.get(u)), 460, 80)),
  ]);
  await wait(420);
  // ③ 中央で重なるように閉じながら裏返る
  const stack = i => ({ x: center.x + (i - (n - 1) / 2) * 1.2, y: center.y - i * .6, r: 0 });
  await Promise.all(order0.map((u, i) => anim(els.get(u), tf(slot.get(u)), tf(stack(i), 180), 260, 0, 'cubic-bezier(.45,0,.25,1)')));
  await wait(60);
  // ④ 表に返りながら、並べ替えた順で開く
  const sorted = sortHand(S, order0).filter(u => order0.includes(u));
  sorted.forEach((u, i) => { els.get(u).style.zIndex = String(i + 1); });
  await Promise.all(sorted.map((u, i) => anim(els.get(u), tf(stack(order0.indexOf(u)), 180), tf(fanPos(i, n), 360), 300, 0, 'cubic-bezier(.22,.8,.25,1)')));
  await wait(320);
  // ⑤ 手札の場所へ
  if (handGeo) {
    // 開いた手札と同じ形（重なり・傾き・高さ）の扇のまま、まっすぐ下へ降ろす。降りた所がそのまま手札の位置
    const hr = handGeo.hr, spread = Math.min(30, n * 4.5), spill = ch * 1.6 * Math.sin(spread / 2 * Math.PI / 180);
    const st = n > 1 ? Math.max(8, Math.min(cw * .66, (hr.width - cw - spill * 2 - 8) / (n - 1))) : 0;
    const handPos = i => { const t = n === 1 ? 0 : i / (n - 1) - .5; return { x: hr.left - sr.left + hr.width / 2 + t * st * (n - 1), y: hr.bottom - sr.top - ch / 2 + t * t * 40 * cw / 84, r: t * spread }; };
    // まず中央で手札と同じ形に整え、それから降ろす
    await Promise.all(sorted.map((u, i) => { const h = handPos(i); return anim(els.get(u), tf(fanPos(i, n), 360), tf({ ...h, y: cy }, 360), 260, 0, 'cubic-bezier(.3,.7,.3,1)'); }));
    await Promise.all(sorted.map((u, i) => { const h = handPos(i); return anim(els.get(u), tf({ ...h, y: cy }, 360), tf(h, 360), 380, 0, 'cubic-bezier(.4,0,.2,1)'); }));
    // 画面の更新で本物の手札が同じ場所に出てから、演出のカードを消す
    setTimeout(() => { layer.remove(); $('.droot').classList.remove('hand-lifted'); }, 80);
    return;
  }
  // No.24：手札をしまったままの時は、左下のしまった手札（扇）へ降ろす
  const hold = j.p === 0 && narrow() && !trayOpen ? $('#handHold') : null;
  const hr = rectOf(hold || hand), to = { x: hr.left + hr.width / 2 - sr.left, y: hr.top + hr.height / 2 - sr.top, r: 0 };
  await Promise.all(sorted.map((u, i) => anim(els.get(u), tf(fanPos(i, n), 360), tf({ x: to.x + (i - n / 2) * 10, y: to.y, r: 0 }, 360, .6), 360, Math.min(i * 16, 160), 'cubic-bezier(.5,0,.75,.4)')));
  layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: T(160), fill: 'forwards' });
  await wait(160);
  layer.remove();
  $('.droot').classList.remove('hand-lifted');
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
  const pile = pileEl(j.p, 'deck'), hand = handEl(j.p);
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
const dur = ms => (fxMode() === 'short' ? ms / 2 : ms);
const wait = ms => new Promise(res => setTimeout(res, dur(ms)));
const PUBLIC = ['mzone', 'emz', 'szone', 'fzone', 'gy', 'banished'];
/** そのカードの表を、画面を見ている人が見てよいか */
function visibleTo(st, u) {
  const c = st.cards[u];
  if (!c) return false;
  if (PUBLIC.includes(c.zone)) return c.faceUp || (c.zone !== 'banished' && c.controller === ME() && cpuMode());
  if (c.zone === 'hand') return !(cpuMode() || netMode()) || c.owner === ME();
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
    if (next.pending && next.pending.request.player === p && fanSrc(next.pending.request) === 'hand') { added.forEach(u => skip.add(u)); recentAdd = { p, uids: added }; continue; }
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
  // 発動して、この1手の中で処理まで終わったカード（相手が応答しなかった時など）：チェーンに残らないので acts に入らない。
  // 「発動したカードは必ず光ってから結果」（No.7・CODEの決まり）：元の場所で光らせてから（pre）、墓地へ飛ばす。
  // 専用演出のあるカードは、専用演出が発動の演出。破壊されて墓地で発動したモンスターの効果は、墓地へ行った後に墓地で光る（acts へ）
  // 発動の手続きを始めた時（コストや対象を選ぶ前）に光らせる。チェーンに乗った時の光（acts）とは二重にしない
  const pre = [], resolvedNow = new Set(fresh.filter(x => x.kind === 'resolve').map(x => x.uid)), lateGlow = new Set();
  for (const x of fresh) {
    if (x.kind !== 'activate' || x.proc || glowDone.has(x.uid) || !prev.cards[x.uid] || !next.cards[x.uid]) continue;
    const d = defOf(next, x.uid);
    if (sigKey(d.name) && resolvedNow.has(x.uid)) continue; // 専用演出のあるカードは、専用演出の頭で光る
    glowDone.add(x.uid);
    const pc = prev.cards[x.uid], nc = next.cards[x.uid], item = { uid: x.uid, p: x.player, kind: d.kind === 'monster' ? 'monster' : d.kind, zone: nc.zone, d };
    // 破壊されて墓地・除外へ行ってから発動したモンスターの効果は、着いた後にそこで光る。もともと墓地・除外にあるカードは置き場で光る
    if (!x.card && ['gy', 'banished'].includes(nc.zone) && pc.zone !== nc.zone) { const old = acts.find(a => a.uid === x.uid); if (old) old.late = true; else acts.push({ ...item, late: true }); lateGlow.add(x.uid); }
    else pre.push({ ...item, fromP: pc.controller, fromZone: pc.zone, rect: ['gy', 'banished'].includes(pc.zone) ? null : undefined });
  }
  for (let k = acts.length - 1; k >= 0; k--) if (glowDone.has(acts[k].uid) && !lateGlow.has(acts[k].uid)) acts.splice(k, 1);
  const hadUid = new Set((prev.chain || []).map(l => l.uid)), glowed = new Set([...acts.map(a => a.uid), ...glowDone]);
  for (const x of fresh) {
    if (x.kind !== 'resolve' || hadUid.has(x.uid) || glowed.has(x.uid) || !prev.cards[x.uid] || !next.cards[x.uid]) continue;
    const d = defOf(prev, x.uid); if (sigKey(d.name)) continue;
    glowed.add(x.uid);
    const pc = prev.cards[x.uid], nc = next.cards[x.uid], item = { uid: x.uid, p: x.player, kind: d.kind === 'monster' ? 'monster' : d.kind, zone: nc.zone, d };
    if (!x.act && ['gy', 'banished'].includes(nc.zone) && pc.zone !== nc.zone) acts.push(item);
    else pre.push({ ...item, fromP: pc.controller, fromZone: pc.zone });
  }
  for (const u of resolvedNow) glowDone.delete(u); // 処理まで終わったカードは、次の発動でまた光る
  if (!next.pending) for (const u of [...glowDone]) if (!(next.chain || []).some(l => l.uid === u)) glowDone.delete(u); // 無効にされた時なども、残り続けないように
  // コストで動いたカード：結果より先に飛ばす（専用演出の前に飛ばしたものは除く）
  const cost = new Set(fresh.filter(x => ((x.kind === 'discard' && x.cost) || (x.kind === 'cost' && !x.proc)) && !costShown.has(x.uid)).map(x => x.uid));
  fresh.forEach(x => costShown.delete(x.uid));
  if (!moves.length && !acts.length && !pre.length && turn === null && win === null) return;
  const snap = snapRects();
  pre.forEach(a => { if (a.rect === null) return; a.rect = (pendingMoves && pendingMoves.from.get(a.uid)) || snap.m.get(a.uid) || snap.piles[`${a.fromP}:${a.fromZone}`] || null; });
  if (!pendingMoves) pendingMoves = { from: snap.m, piles: snap.piles, moves: [], acts: [], pre: [], cost: new Set(), turn: null, win: null };
  else snap.m.forEach((r, u) => { if (!pendingMoves.from.has(u)) pendingMoves.from.set(u, r); });
  // 同じカードが続けて動いた時は、最初の場所から最後の場所へ
  for (const m of moves) {
    const old = pendingMoves.moves.find(x => x.u === m.u);
    if (old) { old.to = m.to; old.toP = m.toP; old.face = old.face || m.face; old.destroy ||= m.destroy; old.negate ||= m.negate; }
    else pendingMoves.moves.push(m);
  }
  pendingMoves.acts.push(...acts);
  pendingMoves.pre.push(...pre);
  cost.forEach(u => pendingMoves.cost.add(u));
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
  fxRec('fly', m.u, { from: `${m.fromP}:${m.from}`, to: `${m.toP}:${m.to}` });
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
  if (m.cntKey) bumpCnt(m.cntKey, 1);
}
/** 専用演出の前に、コストのカード（捨てる手札・リリースなど）を元の場所から置き場へ飛ばす（画面はまだ前の盤面） */
async function flyCosts(list) {
  await Promise.all(list.map(async (c, i) => {
    const pileE = ROOT.querySelector(`#board [data-pile="${c.to}"]`); if (!pileE) return;
    fxRec('fly', c.u, { from: 'cost', to: c.to });
    const to = pileE.getBoundingClientRect(), w = c.rect.width, g = ghost(c, { left: c.rect.left, top: c.rect.top + (c.rect.height - w * 86 / 59) / 2, width: w });
    c.el.style.visibility = 'hidden';
    await wait(i * 60);
    const tx = to.left + (to.width - w * .9) / 2 - c.rect.left, ty = to.top + (to.height - w * .9 * 86 / 59) / 2 - c.rect.top;
    await g.animate([{ transform: 'none' }, { transform: `translate(${tx * .5}px,${ty * .5 - 26}px) scale(1.05)`, offset: .5 }, { transform: `translate(${tx}px,${ty}px) rotate(-8deg) scale(.9)` }], { duration: dur(460), easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }).finished;
    g.remove(); bumpCnt(c.to, 1);
  }));
}
/** 置き場の枚数の数字を足し引きする（演出の間だけ。終わると描き直しで正しい数にもどる） */
function bumpCnt(key, d) { const e = ROOT.querySelector(`#board [data-pile="${key}"] .cnt`); if (e && /^\d+$/.test(e.textContent.trim())) e.textContent = String(Math.max(0, Number(e.textContent) + d)); }
/** 発動の光（その場で処理まで終わったカード）：画面はもう次の盤面なので、元の場所にカードの写しを出して光らせる */
async function preGlow(a, P, i) {
  if (!a.rect) return activateOne(a, P, i);
  await wait(i * 120);
  fxRec('glow', a.uid);
  const r = a.rect, w = r.width, col = a.kind === 'spell' ? '#5dbfa1' : a.kind === 'trap' ? '#d98bb2' : '#ffd27a';
  const g = ghost({ face: true, u: a.uid, d: a.d }, { left: r.left, top: r.top + (r.height - w * 86 / 59) / 2, width: w });
  const ring = document.createElement('span');
  ring.className = 'fx-ring';
  Object.assign(ring.style, { left: (r.left + r.width / 2) + 'px', top: (r.top + r.height / 2) + 'px', borderColor: col });
  flyLayer().appendChild(ring);
  g.animate([{ filter: 'none', transform: 'none' }, { filter: `brightness(1.35) drop-shadow(0 0 12px ${col})`, transform: 'scale(1.06)', offset: .4 }, { filter: 'none', transform: 'none' }], { duration: dur(650), easing: 'ease-out' });
  await ring.animate([{ transform: 'translate(-50%,-50%) scale(.4)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(2.4)', opacity: 0 }], { duration: dur(650), easing: 'ease-out' }).finished;
  ring.remove(); g.remove();
}
/** 発動：カードが光る。墓地で発動した時は、墓地からカードが浮かび上がる */
async function activateOne(a, P, i) {
  await wait(i * 120);
  const col = a.kind === 'spell' ? '#5dbfa1' : a.kind === 'trap' ? '#d98bb2' : '#ffd27a';
  const el = ROOT.querySelector(`#board [data-uid="${a.uid}"], #hand0 [data-uid="${a.uid}"], #hand1 [data-uid="${a.uid}"]`);
  if (a.zone === 'gy' || a.zone === 'banished' || !el) {
    const pile = ROOT.querySelector(`#board [data-pile="${a.p}:${a.zone}"]`);
    if (!pile) return;
    fxRec('soul', a.uid, { zone: a.zone });
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
  fxRec('glow', a.uid);
  const r = el.getBoundingClientRect(), ring = document.createElement('span');
  ring.className = 'fx-ring';
  Object.assign(ring.style, { left: (r.left + r.width / 2) + 'px', top: (r.top + r.height / 2) + 'px', borderColor: col });
  flyLayer().appendChild(ring);
  el.animate([{ filter: 'none', transform: getComputedStyle(el).transform === 'none' ? 'none' : getComputedStyle(el).transform }, { filter: `brightness(1.35) drop-shadow(0 0 12px ${col})` }, { filter: 'none' }], { duration: dur(700) });
  await ring.animate([{ transform: 'translate(-50%,-50%) scale(.4)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(2.4)', opacity: 0 }], { duration: dur(650), easing: 'ease-out' }).finished;
  ring.remove();
}
async function banner(text, cls, ms, parent = null) {
  const b = document.createElement('div');
  b.className = `fx-banner ${cls}`;
  b.innerHTML = `<b>${esc(text)}</b>`;
  (parent || flyLayer()).appendChild(b);
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
/** デッキから墓地へ送るカードを、表にして画面の中央に並べて見せる。見せた位置から墓地へ飛ぶように、出発の位置を書き換える */
async function revealMill(mill, P) {
  const n = mill.length, cw = Math.min(110, (innerWidth - 40) / n - 10), ch = cw * 86 / 59;
  const layer = document.createElement('div');
  layer.className = 'mill-layer';
  const who = NAME(mill[0].fromP);
  layer.innerHTML = `<div class="mill-head"><b>デッキの上から墓地へ送る${n}枚</b><span>${esc(who)}のデッキ</span></div><div class="mill-row"></div>`;
  $('.droot').appendChild(layer);
  const row = layer.querySelector('.mill-row');
  const els = mill.map(m => { const e = document.createElement('span'); e.className = faceCls(m.d) + ' mill-card'; e.style.width = cw + 'px'; e.style.fontSize = (cw / 8).toFixed(1) + 'px'; e.innerHTML = faceHtml(m.u, m.d, false); row.appendChild(e); return e; });
  const deck = P.piles[`${mill[0].fromP}:deck`];
  els.forEach((e, i) => {
    const r = e.getBoundingClientRect();
    if (deck) e.animate([{ transform: `translate(${deck.left + deck.width / 2 - r.left - r.width / 2}px,${deck.top + deck.height / 2 - r.top - r.height / 2}px) scale(.4)`, opacity: .3 }, { transform: 'none', opacity: 1 }],
      { duration: dur(420), delay: dur(i * 140), easing: 'cubic-bezier(.2,.8,.25,1)', fill: 'backwards' });
  });
  await wait(420 + (n - 1) * 140 + 1100);
  els.forEach((e, i) => P.from.set(mill[i].u, e.getBoundingClientRect()));
  layer.remove();
  void ch;
}
/** 画面を更新した後：たまっている移動・発動・ターン・勝敗の演出を再生する */
function playPendingMoves() {
  if (!pendingMoves || (fxN > 0)) return false;
  const P = pendingMoves; pendingMoves = null;
  fxN++; fxBlock();
  (async () => {
    try {
      // 置き場（墓地・除外・デッキ・EX）の枚数の数字は、カードが着いた時に増やす（画面はもう次の盤面なので、いったん来る分を引いておく）
      const incoming = {};
      for (const m of P.moves) {
        if (!['gy', 'banished', 'deck', 'extra'].includes(m.to)) continue;
        const onBoard = ROOT.querySelector(`#board [data-uid="${m.u}"], #hand0 [data-uid="${m.u}"], #hand1 [data-uid="${m.u}"]`);
        if (onBoard && !onBoard.closest('[data-pile]')) continue; // 置き場の一番上に見えているカードは、置き場へ飛ぶカード
        m.cntKey = `${m.toP}:${m.to}`; incoming[m.cntKey] = (incoming[m.cntKey] || 0) + 1;
      }
      for (const [k, n] of Object.entries(incoming)) bumpCnt(k, -n);
      // 発動して、その場で処理まで終わったカード：元の場所で先に光らせる（そのあと墓地へ飛ぶ）
      // 順番：発動の光（pre）→ コストのカード → 残りの移動。光っている間・コストが飛ぶ間は、あとで動くカードを元の場所に写しで残す
      const costM = P.cost ? P.moves.filter(m => P.cost.has(m.u)) : [], restM = P.moves.filter(m => !costM.includes(m));
      const hold = new Map();
      if ((P.pre && P.pre.length) || costM.length) for (const m of restM) { const r = P.from.get(m.u); if (r && !(P.pre || []).some(a => a.uid === m.u)) hold.set(m.u, ghost(m, { left: r.left, top: r.top + (r.height - r.width * 86 / 59) / 2, width: r.width })); }
      if (P.pre && P.pre.length) await Promise.all(P.pre.map((a, i) => preGlow(a, P, i)));
      if (costM.length) await Promise.all(costM.map((m, i) => flyOne(m, P, i)));
      hold.forEach(g => g.remove());
      // デッキの上から墓地へ送るカード（光の援軍など）：まず表にして中央に並べて見せてから、墓地へ送る
      const mill = restM.filter(m => m.from === 'deck' && m.to === 'gy');
      if (mill.length) await revealMill(mill, P);
      const late = P.acts.filter(a => a.late), lateU = new Set(late.map(a => a.uid));
      if (late.length) {
        // 墓地・除外で発動した効果：そのカードが着く → そこで光る → その効果の結果（ほかのカードの移動）。結果のカードは光っている間は元の場所に残す
        const selfM = restM.filter(m => lateU.has(m.u)), others = restM.filter(m => !lateU.has(m.u));
        const hold2 = new Map(); for (const m of others) { const r = P.from.get(m.u); if (r) hold2.set(m.u, ghost(m, { left: r.left, top: r.top + (r.height - r.width * 86 / 59) / 2, width: r.width })); }
        await Promise.all(selfM.map((m, i) => flyOne(m, P, i)));
        await Promise.all(late.map((a, i) => activateOne(a, P, i)));
        hold2.forEach(g => g.remove());
        await Promise.all(others.map((m, i) => flyOne(m, P, i)));
      } else await Promise.all(restM.map((m, i) => flyOne(m, P, i)));
      await Promise.all(P.acts.filter(a => !a.late).map((a, i) => activateOne(a, P, i)));
      if (P.win !== null) { await banner(P.win === 'draw' ? '引き分け' : `${resultText(P.win, cpuMode() || netMode(), ME())}${P.win === ME() || !(cpuMode() || netMode()) ? '！' : '…'}`, P.win === ME() || !(cpuMode() || netMode()) ? 'win' : 'lose', 1800); flushEndSpeech(); }
      else if (P.turn !== null) {
        const text = cpuMode() ? (P.turn === 0 ? 'あなたのターン' : 'CPUのターン') : `${NAME(P.turn)}のターン`;
        const drawing = pendingSummons.some(j => j && j.handAdd && j.p === P.turn && sortsHand(P.turn));
        if (drawing) banner(text, (P.turn === 0 ? 'me' : 'opp') + ' with-draw', 1600, $('.droot')); // 待たずに、すぐドローの演出へ
        else await banner(text, P.turn === 0 ? 'me' : 'opp', 1000);
      }
    } catch (e) { console.error(e); }
    const l = $('.fly-layer'); if (l) l.innerHTML = '';
    fxN = Math.max(0, fxN - 1); fxBlock();
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
const ZONE_Q = /を出すモンスターゾーン$/;
/** 効果で特殊召喚するマスを選んでいる時：選べるマス（uid → 答えの番号） */
function zonePick() {
  if (!S || !S.pending || isRemote(S.pending.request.player)) return null;
  const r = S.pending.request;
  if (r.kind !== 'option' || !ZONE_Q.test(r.prompt)) return null;
  const p = r.player, map = new Map();
  r.options.forEach((o, i) => { const z = Number((o.match(/(\d+)$/) || [])[1]) - 1; if (z >= 0) map.set(`${p}:mz:${z}`, i); });
  return { r, map };
}
/** 説明欄のボタンで置く時の、置けるマス（mz / st のキー）。選ぶ必要が無ければ null */
let actPick = null;
function actZones(a) {
  if (!S.cards[a.card] || S.cards[a.card].zone !== 'hand' || a.zone !== undefined) return null;
  const P = S.players[ME()], d = defOf(S, a.card); // 自分の盤面（オンライン対戦の席1でも、下の盤面）
  if (a.type === 'normalSummon' || a.type === 'setMonster') {
    const free = P.mzone.map((v, i) => (v === null || (a.tributes || []).includes(v) ? i : -1)).filter(i => i >= 0);
    return free.map(i => `${ME()}:mz:${i}`);
  }
  if ((a.type === 'setSpellTrap' || a.type === 'activate') && d.kind !== 'monster' && d.subtype !== 'フィールド') return P.szone.map((v, i) => (v === null ? `${ME()}:st:${i}` : null)).filter(Boolean);
  return null;
}
/** マス選びの案内と光るマスを、すぐ消す（マスを押した時。演出の間も残らないように） */
/** 場のカードを選ぶ選択なら、その選択（盤面の上で直接選ぶ。No.19）。候補に手札・墓地などがまざる時は、今までどおり窓の一覧 */
function fieldPick() {
  if (!S || !S.pending || isRemote(S.pending.request.player)) return null;
  const r = S.pending.request;
  if (r.kind !== 'cards' || !r.options.length || isDeckPick(r)) return null;
  return r.options.every(u => S.cards[u] && ['mzone', 'emz', 'szone', 'fzone'].includes(S.cards[u].zone) && ROOT.querySelector(`#board [data-uid="${u}"]`)) ? r : null;
}
function clearZoneTip() { ROOT.querySelectorAll('#board .zone-pick, #board .fp-on, #board .fp-sel').forEach(el => el.classList.remove('zone-pick', 'fp-on', 'fp-sel')); const t = $('.zone-tip'); if (t) t.remove(); }
/** マス選びの案内を、盤面のすぐ上（LPの箱にかぶらない所）に出す */
function placeTip(tip) { const b = $('#board'); if (!b) return; const r = b.getBoundingClientRect(); tip.style.top = Math.max(8, r.top + 6) + 'px'; }
function renderZonePick() {
  ROOT.querySelectorAll('#board .zone-pick').forEach(el => el.classList.remove('zone-pick'));
  let tip = $('.zone-tip');
  if (actPick && !fxSoon() && fxN === 0) {
    for (const k of actPick.zones) { const el = ROOT.querySelector(`#board [data-zone="${k}"]`); if (el) el.classList.add('zone-pick'); }
    if (!tip) { tip = document.createElement('div'); tip.className = 'zone-tip'; $('.droot').appendChild(tip); }
    tip.innerHTML = `<b>置くマスを押してください</b><small>「${esc(defOf(S, actPick.a.card).name)}」　ほかを押すとやめる</small>`; placeTip(tip);
    return;
  }
  ROOT.querySelectorAll('#board .fp-on, #board .fp-sel').forEach(el => el.classList.remove('fp-on', 'fp-sel'));
  const fp = fxSoon() || fxN > 0 ? null : fieldPick();
  if (fp) {
    for (const x of fp.options) { const el = ROOT.querySelector(`#board [data-uid="${x}"]`); if (el) el.classList.add(pick.includes(x) ? 'fp-sel' : 'fp-on'); }
    if (!tip) { tip = document.createElement('div'); tip.className = 'zone-tip'; $('.droot').appendChild(tip); }
    const n = fp.min === fp.max ? `${fp.min}枚` : `${fp.min}〜${fp.max}枚`, ok = pick.length >= fp.min && pick.length <= fp.max;
    tip.innerHTML = `<b>${esc(WHO(fp.prompt))}</b><small>光っているカードを押して選ぶ（${n}）${fp.max > 1 ? `・選んだ数 ${pick.length}` : ''}</small>`
      + (fp.max > 1 || fp.min === 0 ? `<span class="fp-btns">${fp.min === 0 ? '<button type="button" class="btn small" data-fp="skip">選ばない</button>' : ''}${fp.max > 1 ? `<button type="button" class="btn small primary" data-fp="ok"${ok ? '' : ' disabled'}>決定</button>` : ''}</span>` : '');
    { const b = $('#board'); if (b) { const r = b.getBoundingClientRect(), h = tip.getBoundingClientRect().height; tip.style.top = Math.max(8, Math.min(r.bottom + 6, innerHeight - h - 8)) + 'px'; } } // 盤面のカードを隠さないように、盤面のすぐ下に出す
    return;
  }
  const zp = fxSoon() || fxN > 0 ? null : zonePick();
  if (!zp) { if (tip) tip.remove(); return; }
  for (const k of zp.map.keys()) { const el = ROOT.querySelector(`#board [data-zone="${k}"]`); if (el) el.classList.add('zone-pick'); }
  if (!tip) { tip = document.createElement('div'); tip.className = 'zone-tip'; $('.droot').appendChild(tip); }
  tip.innerHTML = `<b>出すマスを押してください</b><small>「${esc(zp.r.prompt.replace(ZONE_Q, '').replace(/^「|」$/g, ''))}」</small>`; placeTip(tip);
}
function renderSheets(duringFx = false) {
  const humanChoice = S.pending && !isRemote(S.pending.request.player) && !zonePick() && !fieldPick();
  const detailOpen = !duringFx && narrow() && ((humanChoice && !peek && !fan) || (sheet === 'detail' && selected !== null));
  const logOpen = !duringFx && narrow() && sheet === 'log' && !detailOpen;
  $('#detailSheet').classList.toggle('open', detailOpen);
  $('#logSheet').classList.toggle('open', logOpen);
  $('#scrim').hidden = !(detailOpen || logOpen);
}
function closeSheets() {
  if (S.pending && !isRemote(S.pending.request.player)) peek = true;
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
  const n = S ? S.players[ME()].hand.length : 0;
  const l = $('#trayLbl'); if (l) l.textContent = open ? '下にスワイプでしまう' : `上にスワイプで手札（${n}枚）`;
  measureBottom();
}
/** No.11（ボスの注文：プレイマットは全く動かない・伸び縮みしない）：下のボタンの欄は、チェーンの時などにボタンが増えて高くなる。
 * 盤面の高さをその時々の高さで決めると、盤面が伸び縮みする。盤面の高さは、画面の大きさごとに最初に測ったボタンの欄の高さで決めて、あとは変えない。
 * ボタンの欄がそれより高くなった時は、盤面の下の方に重なる（盤面は動かない） */
let dockBase = null;
/** 盤面の高さを決める時のボタンの欄の高さ。画面の大きさごとに、ふだんの時（チェーン・選ぶこと・決着が無い時）に最初に測った高さを使い、あとは変えない */
function dockBaseFor(real, calm = true) {
  const key = innerWidth + 'x' + innerHeight;
  if (!dockBase || dockBase.key !== key) dockBase = { key, h: 0 };
  if (!dockBase.h && calm && real > 0) dockBase.h = real;
  return dockBase.h || real;
}
function measureBottom() {
  const r = $('.droot'), t = $('#tray'), d = $('#dock'); if (!r || !t || !d) return;
  const dh = Math.ceil(d.getBoundingClientRect().height);
  r.style.setProperty('--dock-h', dh + 'px');
  const bh = narrow() ? (trayOpen ? Math.ceil(t.getBoundingClientRect().height) : dh + 62) : dh;
  r.style.setProperty('--bottom-h', bh + 'px');
  const b = $('#board');
  if (b && narrow()) {
    const top = b.getBoundingClientRect().top - r.getBoundingClientRect().top;
    r.style.setProperty('--board-h', Math.max(260, Math.floor(window.innerHeight - top - dockBaseFor(dh, !S || (!S.chain.length && !S.pending && S.winner === null)) - 8)) + 'px'); // No.11：盤面はボタンの欄の高さが変わっても伸び縮みしない
  } else if (b) {
    // マスの幅 × 86/59 がカードの高さ。段はその半分
    const w = b.clientWidth - 16, zw = (w - 6 * 5) / 6.48;
    r.style.setProperty('--hr', Math.max(16, Math.round(zw * 86 / 59 / 2 - 2)) + 'px');
  }
}
/** 返事が要る時（チェーンの確認・選択・決着）は自動で閉じてボタンを見せ、自分の番に戻ったら開き直す */
function renderHandHold() {
  const el = $('#handHold'); if (!el) return;
  // 手札を閉じた時：開いた時と同じ大きさのカードを、画面の左下の角から扇形に飛び出させる（下の方は画面の外）
  const coming = comingToHand(ME());
  const hand = sortHand(S, S.players[ME()].hand).filter(u => !coming.has(u));
  const key = hand.join(',');
  if (el.dataset.key !== key) {
    // 一番右のカードはまっすぐ立てて全部見せ、残りは左へ扇のように傾ける。枚数が増えるほど、左のカードから自然に画面の外へはみ出す
    // 枚数が少ない時は、カードを高めに出して見やすくする
    const n = hand.length, step = n <= 1 ? 0 : Math.max(7, Math.min(12, 48 / (n - 1)));
    el.style.setProperty('--lift', n <= 2 ? '.3' : n <= 4 ? '.4' : '.5');
    el.innerHTML = hand.map((u, i) => {
      const a = -(n - 1 - i) * step;
      return `<span class="${faceCls(defOf(S, u))} hh-card" style="--a:${a.toFixed(1)}deg;--i:${i}">${faceHtml(u, defOf(S, u), false)}</span>`;
    }).join('');
    el.dataset.key = key;
  }
  el.setAttribute('aria-label', `手札（${hand.length}枚）。押すか上に払うと開きます`);
}
/* 自分のターンが始まったら（ドローの後のメインフェイズ1で）手札を開き、相手のターンになったら閉じる（CPU対戦） */
let trayTurn = null, trayWantOpen = false;
/** スマホを横にした時：手札は盤面にかぶるので、ふだんはしまっておく（軽くスワイプ・タップですぐ開く） */
const landscape = () => matchMedia('(max-width: 860px) and (orientation: landscape)').matches;
function turnTray() {
  if (!narrow() || !S || !cpuMode() || S.winner !== null) return;
  if (S.turn !== trayTurn) {
    trayTurn = S.turn;
    if (isRemote(S.turnPlayer)) { trayWantOpen = false; if (trayOpen) setTray(false); }
    else trayWantOpen = !landscape(); // 横向きでは、自分のターンになっても自動では開かない
  }
  if (trayWantOpen && !isRemote(S.turnPlayer) && S.phase === 'main1' && humanActing() && !S.pending && S.window.kind === 'open') { trayWantOpen = false; if (!trayOpen) setTray(true); }
}
/** 返事が要る時（決着・選ぶ・チェーンの確認）。この時は手札をしまってボタンを見せる */
const trayNeedsReply = () => S.winner !== null || (humanActing() && (S.pending || (S.window.kind === 'priority' && activatableList(S, actorOf(S)).length)));
/** No.24：演出（手札に入る・シャカパチ）が、しまっている手札を自動で開いてよい時：自分のターンで、返事待ちが無く、
 * 返事のために自動でしまった手札でもない時だけ（No.11の決定②と同じ。サーチ→選ぶ→手札に入る→また選ぶ、で開く→閉じるをくり返さない） */
const trayMayOpen = () => !!S && S.turnPlayer === ME() && !isRemote(S.turnPlayer) && !trayNeedsReply() && !trayAuto;
function autoTray() {
  turnTray();
  if (!narrow() || !S) return;
  const needs = trayNeedsReply();
  if (needs && trayOpen) setTray(false, true);
  // No.11（ボスの決定②）：返事のために自動でしまった手札は、返事が終わってもすぐには開き直さない（しまう→開くを何度もくり返してピクピク動いていた）。
  // 開くのは、自分のターンが来た時の1回だけ（turnTray）。それまでに使いたい時は、押すか上に払えば開く
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
  const me = ME(), h = S.players[me].hand; // 下の手札（#hand0）は自分の席（オンライン対戦の席1でも）
  const prev = handSeen; handSeen = { p: me, set: new Set(h) };
  if (!prev || prev.p !== me) return;
  const fresh = h.filter(u => !prev.set.has(u) && defOf(S, u).kind === 'trap');
  if (!fresh.length) return;
  const el = $('#hand0'); if (!el) return;
  setTimeout(() => {
    fresh.forEach(u => { const c = el.querySelector(`.card[data-uid="${u}"]`); if (c) { c.classList.add('newtrap'); setTimeout(() => c.classList.remove('newtrap'), 1400); } });
    el.classList.remove('pachi'); void el.offsetWidth; el.classList.add('pachi');
    setTimeout(() => el.classList.remove('pachi'), 900);
    if (narrow() && !trayOpen && trayMayOpen()) setTray(true); // No.24：開くのは自分のターンで返事待ちが無い時だけ（開かない時は、しまった手札の扇が跳ねる）
    play(['pachi']);
  }, 450);
}
function render() {
  if (netMode() && net.link && net.link.state && S !== net.link.state && !render.warned) { render.warned = true; console.warn('オンライン：画面の盤面と通信の部品の盤面がちがいます'); } // 開発者向けの見張り（MEMEの頼み）
  if ((fxN > 0)) { renderSheets(true); return; } // 演出が終わってから画面を更新する（演出の間はシートを閉じておき、選ぶ画面も演出の後に開く）
  fxRec('render', null);
  if (fan && !(S.pending && !isRemote(S.pending.request.player) && isDeckPick(S.pending.request))) closeFan();
  canAct = new Set(S.pending ? [] : activatableList(S, actorOf(S)).map(a => a.uid));
  renderBoard(); renderSide(); renderTop(); renderChain(); renderTargets(); tombAuto(); renderZonePick(); renderDetail(); renderLog(); renderDock(); renderSheets(fxSoon()); autoTray(); renderHandHold(); // シャカパチは手札をゆっくりなぞった時だけ（罠が来た時などの自動の演出はしない）
  // これから召喚の演出をするカードは、演出が始まるまで盤面に出さない（先に置かれてから巻き戻って見えないように）
  if (narrow() && pendingSummons.some(j => j && j.handAdd && j.p === 0)) $('.droot').classList.add('hand-lifted');
  for (const j of pendingSummons) if (j && j.uid != null && !j.search && !j.handOpen && !j.handAdd) { const el = ROOT.querySelector(`#board [data-uid="${j.uid}"]`); if (el) el.style.visibility = 'hidden'; }
  $('#result').hidden = S.winner === null;
  if (S.winner !== null) $('#result').textContent = `${resultText(S.winner, cpuMode() || netMode(), ME())}：${WHO(S.winReason)}`;
  // カードの移動・召喚の演出があれば、それが終わるまでCPUの手番と自動パスを待つ
  if (playPendingMoves()) { saveSoon(); return; }
  if (playPendingSummons()) { saveSoon(); return; }
  if (playPendingCues()) { saveSoon(); return; }
  scheduleCpu();
  scheduleOffer();
  scheduleAutoPass();
  continueEnd();
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
      if (placeholder || netMode()) return; // オンライン対戦は保存しない（途中のCPU対戦の保存を上書きしない・消さない）
      if (!S || S.winner !== null) localStorage.removeItem(OPTS.storageKey);
      else localStorage.setItem(OPTS.storageKey, JSON.stringify({ v: SAVE_V, S, trace, mode: $('#mode').value, d0: $('#deck0').value, d1: $('#deck1').value, lv: cpuLevel, undo: undoUsed }));
    } catch { /* 保存できない環境では覚えない */ }
  }, 400);
}
function loadSaved() {
  if (!OPTS.storageKey) return null;
  try { const j = JSON.parse(localStorage.getItem(OPTS.storageKey) || 'null'); return j && j.v === SAVE_V && j.S ? j : null; } catch { return null; }
}

/* ---------- 墓地・除外・EXデッキの中身 ---------- */
/** カードの種類の短い説明（★・属性・種族・攻守、または「通常魔法」など） */
const cardTypeText = d => (d.kind === 'monster' ? `★${d.level ?? '-'}・${d.attribute || ''}・${d.race || ''}　ATK ${d.atk ?? '?'} / DEF ${d.def ?? '?'}` : `${d.subtype || ''}${d.kind === 'spell' ? '魔法' : '罠'}`);
/**
 * 扇の形の左右スクロール（墓地・除外・EXの一覧と、デッキから選ぶ時で同じ動き）。
 * car の中の .pile-it を横に並べ、真ん中のカードを大きく・まっすぐに、離れるほど小さく傾ける。真ん中が変わったら onCenter(it)
 */
function carousel(car, onCenter) {
  const items = [...car.querySelectorAll('.pile-it')];
  let cur = null;
  const update = () => {
    const r = car.getBoundingClientRect(), mid = r.left + r.width / 2;
    let best = null, bd = Infinity;
    for (const it of items) {
      const ir = it.getBoundingClientRect(), d = (ir.left + ir.width / 2 - mid) / ir.width; // 真ん中からカード何枚分ずれているか
      const a = Math.max(-1.6, Math.min(1.6, d));
      it.style.setProperty('--k', String(1 - Math.min(.42, Math.abs(a) * .3)));
      it.style.setProperty('--r', (a * 10).toFixed(1) + 'deg');
      it.style.setProperty('--y', (a * a * 14).toFixed(1) + 'px');
      it.style.zIndex = String(100 - Math.round(Math.abs(d) * 10));
      if (Math.abs(d) < bd) { bd = Math.abs(d); best = it; }
    }
    if (best && best !== cur) { cur = best; items.forEach(x => x.classList.toggle('on', x === best)); onCenter(best); }
  };
  car.addEventListener('scroll', () => requestAnimationFrame(update), { passive: true });
  car.scrollLeft = 0;
  requestAnimationFrame(update);
  return {
    // そのカードを真ん中へ（横だけ動かす。窓全体は動かさない）
    center: it => { const left = it.offsetLeft - (car.clientWidth - it.offsetWidth) / 2; car.scrollTo({ left, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); setTimeout(update, 400); },
    current: () => cur,
  };
}
function showPile(p, kind) {
  const list = S.players[p][kind];
  const label = { deck: 'デッキ', gy: '墓地', extra: 'EXデッキ', banished: '除外' }[kind];
  const hiddenExtra = kind === 'extra' && isRemote(p);
  // 自分のデッキ：次に引くカードが分からないように、手札と同じ順に並べ替え、同じカードはまとめて「×枚数」で見せる
  if (kind === 'deck' && !isRemote(p) && list.length) {
    const groups = [];
    for (const u of sortHand(S, list)) { const g = groups.find(x => S.cards[x.u].code === S.cards[u].code); if (g) g.n++; else groups.push({ u, n: 1 }); }
    const body = `<p class="menu-note">並び順は山札の順番ではありません（種類・レベル順）。カードを押すと効果を見られます。</p><div class="pilelist">${groups.map(g => `<span class="deck-g">${cardHtml(g.u)}${g.n > 1 ? `<b class="deck-n">×${g.n}</b>` : ''}</span>`).join('')}</div>`;
    $('#pileBox').classList.remove('pile-fan');
    $('#pileBox').innerHTML = `<div class="box-head"><h3>${NAME(p)}のデッキ（${list.length}枚）</h3><button class="btn small ghost" id="pileClose">閉じる</button></div>${body}`;
    $('#pileDlg').hidden = false;
    return;
  }
  // 墓地・除外・EX：カードを扇の形に並べ、横にスクロールして見る。真ん中のカードを大きく見せ、下にその効果を出す。最初は一番新しいカード
  if (!(kind === 'deck' || hiddenExtra) && list.length) {
    const order = [...list].reverse();
    $('#pileBox').innerHTML = `<div class="box-head"><h3>${NAME(p)}の${label}（${list.length}枚）</h3><button class="btn small ghost" id="pileClose">閉じる</button></div>`
      + `<p class="menu-note pile-tip">${kind === 'extra' ? '' : '左が一番新しいカード。'}横にスクロールして見られます</p>`
      + `<div class="pile-car" tabindex="0" aria-label="${label}のカード">${order.map(u => { const d = defOf(S, u); return `<span class="pile-it" data-u="${u}"><span class="${faceCls(d)} pile-face">${faceHtml(u, d, false)}</span></span>`; }).join('')}</div>`
      + `<div class="pile-info" aria-live="polite"></div>`;
    $('#pileDlg').hidden = false;
    $('#pileBox').classList.add('pile-fan');
    const car = $('#pileBox .pile-car'), info = $('#pileBox .pile-info');
    carousel(car, it => {
      const u = Number(it.dataset.u), d = defOf(S, u);
      info.innerHTML = `<b>${esc(d.name)}</b><small>${esc(cardTypeText(d))}</small><p>${esc(d.text || '')}</p>`;
      info.scrollTop = 0;
    });
    return;
  }
  $('#pileBox').classList.remove('pile-fan');
  const body = kind === 'deck' || hiddenExtra ? `<p class="menu-note">中身は見られません（${list.length}枚）。</p>` : '<p class="menu-note">カードはありません。</p>';
  $('#pileBox').innerHTML = `<div class="box-head"><h3>${NAME(p)}の${label}（${list.length}枚）</h3><button class="btn small ghost" id="pileClose">閉じる</button></div>${body}`;
  $('#pileDlg').hidden = false;
}

/* ---------- メニュー ---------- */
function menuNames() {
  const cpu = cpuMode(), L = (id, t) => { const el = ROOT.querySelector(`label[for="${id}"]`); if (el && el.firstChild && el.firstChild.nodeType === 3) el.firstChild.textContent = t; };
  L('deck0', cpu ? 'あなたのデッキ' : 'プレイヤー1のデッキ'); L('deck1', cpu ? 'CPUのデッキ' : 'プレイヤー2のデッキ');
  const f = $('#first'); if (f) { f.options[0].textContent = cpu ? 'あなた' : 'プレイヤー1'; f.options[1].textContent = cpu ? 'CPU' : 'プレイヤー2'; }
}
function openMenu() { menuNames(); { const el = $('#menuLevel'); if (el) el.hidden = true; } /* 強さの行は出さない（CPUはいつも全力） */ $('#menu').hidden = false; $('#menuBtn').setAttribute('aria-expanded', 'true'); disarm(); clearTimeout(cpuTimer); }
function closeMenu() { $('#menu').hidden = true; $('#menu').classList.remove('from-setup'); $('#menuBtn').setAttribute('aria-expanded', 'false'); disarm(); setTimeout(() => { if (S && !pausedUi()) scheduleCpu(); }, 0); }
let armT;
function disarm() { const b = $('#surrender'); b.classList.remove('armed'); b.textContent = '🏳 降参する'; clearTimeout(armT); }
function surrender() {
  const b = $('#surrender');
  if (S.winner !== null) { closeMenu(); return; }
  // 押し間違いを防ぐため、2回押して確定する
  if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'もう一度押すと降参'; armT = setTimeout(disarm, 5000); return; }
  disarm(); closeMenu();
  // オンライン：子の降参は、親が入れて2台で同じ順番に並んでから決着する（同時に降参しても2台で同じ答え）。待つ間は「降参しています…」
  if (netMode()) { if (net.link && net.link.send({ type: 'surrender', player: ME() })) { commit(net.link.state); render(); if (net.link.giveUpPending) { net.ui.giveUp = netResultOf(OPP()); netRemember(net.ui); } if (net.link.giveUpPending) netNote('<b>🏳 降参しています…</b><span>相手の画面に届くと決着します</span><button type="button" class="btn small ghost" data-net="quit">やめてCPU戦へ</button>'); } return; }
  if (cpuMode()) { clearTimeout(cpuTimer); history.push(S); commit(applyAction(S, { type: 'surrender', player: 0 })); render(); return; }
  run({ type: 'surrender', player: actorOf(S) });
}

/* ---------- イベント（boot から呼ぶ） ---------- */
function wireSheets(root) {
  root.querySelectorAll('.sheet').forEach(sh => {
    let y0 = null, dy = 0, drag = false;
    sh.addEventListener('touchstart', e => { if (!narrow() || !sh.classList.contains('open') || e.touches.length !== 1) return;
      // ログなど、中身だけがスクロールする所から始めた操作はスクロールに使う（シートは閉じない）
      const inner = e.target.closest && e.target.closest('#log'); if (inner && inner.scrollHeight > inner.clientHeight + 2) { y0 = null; return; }
      y0 = e.touches[0].clientY; dy = 0; drag = false; }, { passive: true });
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
  let px = 0, pt = 0;
  const strumStart = (x, y) => { lastCard = null; strummed = false; sx = x; sy = y; px = x; pt = performance.now(); };
  const strumMove = (x, y) => {
    if (sx === null || !trayOpen || !narrow() || aim || place) return;
    // 速さ（指が1ミリ秒に動く距離）。速く払った時はシャカパチしない（ゆっくりなぞった時だけ）
    const now = performance.now(), v = Math.abs(x - px) / Math.max(1, now - pt); px = x; pt = now;
    if (!strummed && (Math.abs(x - sx) < 8 || Math.abs(x - sx) < Math.abs(y - sy))) return;
    strummed = true;
    if (v > 0.7) { lastCard = cardAt(x, y); return; }
    const c = cardAt(x, y);
    if (c && c !== lastCard) { lastCard = c; pachiCard(c); }
  };
  t.addEventListener('pointerdown', e => strumStart(e.clientX, e.clientY));
  t.addEventListener('pointermove', e => strumMove(e.clientX, e.clientY));
  t.addEventListener('touchmove', e => { const p = e.touches[0]; if (p) strumMove(p.clientX, p.clientY); }, { passive: true });
  t.addEventListener('touchstart', e => { const p = e.touches[0]; if (p) strumStart(p.clientX, p.clientY); }, { passive: true });
  ['pointerup', 'pointercancel', 'touchend'].forEach(ev => t.addEventListener(ev, () => { sx = null; }));
  const swipeEnd = (dx, dy) => {
    if (aim || place || (handPress && handPress.fired)) return; // 手札の長押し・矢印の操作は、そちらで「押した」を止める
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
/* ---------- スマホの手札の操作 ----------
 * 長押し（動かさずに LONG_PRESS_MS）：カードの効果を見る（No.2 ボスの注文。選んでいないカードでも、選んだカードでも同じ）
 * 1回押す：カードが手札から少し飛び出して光る（選んだ状態）。もう一度押すと戻る
 * 選んだカードを押したまま指を動かす：置ける場所に矢印が伸び、残りの手札は下に沈む。そのまま指を滑らせた先のマスに置く
 *   （長押し＝効果、引っ張る＝置く、で分ける。すばやく2回押しても効果が見られる）
 *   （指を速く払って置き場所が決まらない時は、空いている一番左のマスに置く。指を離しても矢印は残り、マスを押しても置ける）
 * 置いた後：上下左右に払うと「表・裏（攻撃表示で召喚・裏側でセット／発動・セット）」が切り替わり、押すと決定 */
let aim = null;    // { u, acts, targets, layer, ghost, sx, sy, moved, hover, held }
let place = null;  // { u, acts, t, modes, m, layer }
let handPress = null; // { u, x, y, timer, fired }
let tapT = null, tapU = null;
/** 手札のカードを押した：1回目で選ぶ（飛び出して光る）。選んだカードを素早く2回押すと効果、1回だけなら少し待ってから選ぶのをやめる */
function handTap(u) {
  if (tapT && tapU === u) { clearTimeout(tapT); tapT = null; selected = u; sheet = 'detail'; render(); return; }
  clearTimeout(tapT); tapU = u;
  if (selected !== u) { selected = u; sheet = null; render(); tapT = setTimeout(() => { tapT = null; }, 300); return; }
  tapT = setTimeout(() => { tapT = null; if (selected === u && sheet !== 'detail') { selected = null; render(); } }, 300);
}
const HAND_TYPES = ['normalSummon', 'setMonster', 'setSpellTrap', 'activate', 'procSummon'];
const TOMB = '6759';
const isTombAct = a => a.type === 'activate' && a.effect === 'e2' && S.cards[a.card] && S.cards[a.card].code === TOMB;
function handActs(u) {
  if (!humanActing() || S.pending) return [];
  const legal = legalActions(S), own = legal.filter(a => a.card === u && HAND_TYPES.includes(a.type));
  // リリースが必要なモンスター：表になっている死皇帝の陵墓の効果で、リリースなしで召喚できる
  const d = defOf(S, u), n = d.kind === 'monster' ? tributesFor(S, u) : 0;
  const tomb = n > 0 && !SCRIPTS[S.cards[u].code]?.cannotNormalSummon && d.frame !== 'ritual' && S.players[ME()].lp > n * 1000 ? legal.filter(isTombAct).slice(0, 1) : [];
  return [...own, ...tomb];
}
const zoneEl = key => ROOT.querySelector(`#board [data-zone="${key}"]`);
/** 選んだカードを置けるマス */
function aimTargets(u, acts) {
  const d = defOf(S, u), P = S.players[ME()], out = [];
  const mon = acts.some(a => ['normalSummon', 'setMonster', 'procSummon'].includes(a.type) || isTombAct(a));
  if (mon) {
    let idx = P.mzone.map((v, i) => (v === null ? i : -1)).filter(i => i >= 0);
    if (!idx.length) idx = [0, 1, 2, 3, 4]; // アドバンス召喚でリリースして空くマス
    idx.forEach(i => out.push({ kind: 'mz', idx: i, key: `${ME()}:mz:${i}` }));
  }
  const stActs = acts.some(a => a.type === 'setSpellTrap' || (a.type === 'activate' && d.kind === 'spell'));
  if (stActs && d.kind !== 'monster') {
    if (d.subtype === 'フィールド') out.push({ kind: 'fz', idx: 0, key: `${ME()}:fz:0` });
    else P.szone.forEach((v, i) => { if (v === null) out.push({ kind: 'st', idx: i, key: `${ME()}:st:${i}` }); });
  }
  return out.map(t => ({ ...t, el: zoneEl(t.key) })).filter(t => t.el);
}
/** 置き場所のない「手札から発動する効果」（モンスターの効果など） */
const zonelessActs = (u, acts) => acts.filter(a => a.type === 'activate' && a.card === u && defOf(S, u).kind === 'monster');

function startAim(u, x, y) {
  const acts = handActs(u);
  const targets = aimTargets(u, acts), loose = zonelessActs(u, acts);
  if (!targets.length && !loose.length) { toast('今は手札から出せません'); return; }
  // 魔法カード（発動できる時）：払えば発動。置く場所は空いている魔法＆罠ゾーンからランダム（フィールド魔法はフィールドゾーン）
  const spellAct = defOf(S, u).kind === 'spell' && acts.some(a => a.type === 'activate');
  const layer = document.createElement('div');
  layer.className = 'aim-layer';
  layer.innerHTML = `<svg aria-hidden="true"><defs><marker id="aimHead" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker></defs><path class="aim-line" marker-end="url(#aimHead)"/></svg>`
    + `<div class="aim-tip">${spellAct ? '上に払うと矢印のマスで発動／マスの上で離すと発動かセットを選べます' : targets.length ? '矢印の先のマスへ、上に投げるように払ってください' : ''}</div>`
    + (loose.length ? `<button class="btn primary aim-act" type="button">${esc(defOf(S, u).name)}の効果を発動</button>` : '');
  $('.droot').appendChild(layer);
  const ghost = document.createElement('span');
  ghost.className = faceCls(defOf(S, u)) + ' aim-ghost';
  ghost.innerHTML = faceHtml(u, defOf(S, u), false);
  layer.appendChild(ghost);
  $('#hand0').classList.add('aiming');
  aim = { u, acts, targets, loose, spellAct, layer, ghost, sx: x, sy: y, moved: 0, hover: null, held: true, trail: [{ x, y, t: performance.now() }] };
  aimMove(x, y);
  if (navigator.vibrate) try { navigator.vibrate(12); } catch { /* 振動できない端末 */ }
}
const zoneCenter = t => { const r = t.el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
/** 指に一番近い置けるマス（矢印はそこに吸い付く） */
function aimNearest(x, y) {
  let best = null, bd = Infinity;
  for (const t of aim.targets) { const c = zoneCenter(t), d = Math.hypot(c.x - x, (c.y - y) * 1.2); if (d < bd) { bd = d; best = t; } }
  return best;
}
function aimMove(x, y) {
  if (!aim) return;
  aim.moved = Math.max(aim.moved, Math.hypot(x - aim.sx, y - aim.sy));
  const now = performance.now();
  aim.trail.push({ x, y, t: now });
  while (aim.trail.length > 2 && now - aim.trail[0].t > 140) aim.trail.shift();
  // カードは指についてくる（指で隠れないよう少し上）
  aim.ghost.style.left = x + 'px'; aim.ghost.style.top = y + 'px';
  if (!aim.targets.length) return;
  const h = aimNearest(x, y - 40);
  if (h !== aim.hover) { if (aim.hover) aim.hover.el.classList.remove('aim-hover'); aim.hover = h; if (h) h.el.classList.add('aim-hover'); }
  // 矢印は1本：カードの上の端から、吸い付いたマスへ
  const line = aim.layer.querySelector('.aim-line'), c = zoneCenter(h);
  const fx = x, fy = y - 64, mx = (fx + c.x) / 2 + (c.x - fx) * .15, my = Math.min(fy, c.y) - 30;
  line.setAttribute('d', `M${fx.toFixed(0)},${fy.toFixed(0)} Q${mx.toFixed(0)},${my.toFixed(0)} ${c.x.toFixed(0)},${c.y.toFixed(0)}`);
}
function endAim() {
  if (!aim) return;
  aim.targets.forEach(t => t.el.classList.remove('aim-hover'));
  aim.layer.remove();
  const h = $('#hand0'); if (h) h.classList.remove('aiming');
  aim = null;
}
/** 指を離した時：上に投げるように払ったら、矢印の先のマスへカードが飛んでいく。マスの上で離しても置ける。それ以外は取りやめ（発動ボタンがある時は残す） */
function aimRelease(x, y) {
  if (!aim) return;
  const tr = aim.trail, first = tr[0], dt = Math.max(1, performance.now() - first.t), vy = (y - first.y) / dt;
  const flick = aim.targets.length && (vy < -0.35 || (y - aim.sy < -70 && vy < -0.15));
  const onZone = aim.targets.find(t => { const r = t.el.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; });
  // 魔法：上に払うと矢印の先のマスですぐ発動。マスの上で離した時は、発動かセットかを選ぶ
  if (aim.spellAct && flick && aim.hover) { castSpell(x, y); return; }
  const t = flick ? aim.hover : onZone || (aim.moved > 12 ? aim.hover : null);
  if (t) { throwTo(t, x, y); return; }
  if (aim.loose.length) { aim.held = false; aim.ghost.style.display = 'none'; aim.layer.querySelector('.aim-line')?.setAttribute('d', ''); return; }
  endAim();
}
/** 魔法を払って発動：矢印の先のマス（なければ空いているマスからランダム）へ飛ばして発動する */
function castSpell(x, y) {
  const { u, acts } = aim;
  const list = acts.filter(a => a.type === 'activate');
  if (list.length !== 1) { endAim(); selected = u; sheet = 'detail'; render(); return; }
  const field = defOf(S, u).subtype === 'フィールド';
  const free = S.players[ME()].szone.map((v, i) => (v === null ? i : -1)).filter(i => i >= 0);
  const idx = field ? 0 : aim.hover && aim.hover.kind === 'st' ? aim.hover.idx : free.length ? free[Math.floor(Math.random() * free.length)] : 0;
  const el = zoneEl(field ? `${ME()}:fz:0` : `${ME()}:st:${idx}`);
  const go = () => { endAim(); selected = null; run(field ? list[0] : { ...list[0], zone: idx }); };
  if (!el) { go(); return; }
  const r = el.getBoundingClientRect(), g = aim.ghost;
  aim.layer.querySelector('.aim-tip')?.remove();
  g.animate([{ left: x + 'px', top: y + 'px', transform: 'translate(-50%, -70%) rotate(-5deg)' },
    { left: (r.left + r.width / 2) + 'px', top: (r.top + r.height / 2) + 'px', transform: 'translate(-50%, -50%) rotate(0deg) scale(.7)' }],
  { duration: 240, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' }); setTimeout(go, 260); // アニメーションの終わりを待たずに時間で進める（画面が裏にある時などに止まらないように）
}
/** カードを投げる：指の位置から矢印の先のマスへ飛ばしてから、置く */
function throwTo(t, x, y) {
  const { u, acts, ghost } = aim;
  aim.layer.querySelector('.aim-line')?.setAttribute('d', '');
  const c = zoneCenter(t), r = t.el.getBoundingClientRect();
  const sc = Math.min(r.width, r.height * 59 / 86) * .92 / Math.max(1, ghost.getBoundingClientRect().width);
  const a = ghost.animate([{ left: x + 'px', top: y + 'px', transform: 'translate(-50%, -70%) rotate(-5deg)' },
    { left: c.x + 'px', top: (c.y - 26) + 'px', transform: `translate(-50%, -50%) rotate(0deg) scale(${(sc * 1.15).toFixed(2)})` }],
  { duration: 230, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
  setTimeout(() => { if (aim && aim.u === u) { endAim(); startPlace(u, acts, t); } }, 250); void a;
}
function aimTap(x, y, target) {
  if (!aim) return;
  if (target.closest('.aim-act')) {
    const { u, loose } = aim; endAim();
    if (loose.length === 1) { selected = null; run(loose[0]); } else { selected = u; sheet = 'detail'; render(); }
    return;
  }
  endAim();
}

/* ----- 置いた後：表・裏を切り替えて決定 ----- */
/** リリースが必要なモンスターの召喚・セットは「アドバンス召喚・アドバンスセット」 */
const modeLabel = (mode, u) => { const n = u != null && defOf(S, u).kind === 'monster' ? tributesFor(S, u) : 0; if (n > 0 && mode === 'summon') return `召喚する（${n}体リリース）`; if (n > 0 && mode === 'mset') return `セットする（${n}体リリース）`; if (mode === 'tomb') return `死皇帝の陵墓で召喚（${n * 1000}LP払う）`; if (mode === 'tombset') return `陵墓の効果でセット（${n * 1000}LP）`; return MODE_LABEL[mode]; };
const MODE_LABEL = { summon: '召喚する（攻撃表示）', mset: 'セットする（裏側守備表示）', activate: '発動する', sset: 'セットする', tomb: '死皇帝の陵墓で召喚', tombset: '死皇帝の陵墓でセット' };
function placeModes(acts, t, u) {
  const d = defOf(S, u);
  if (t.kind === 'mz') return [acts.some(a => a.type === 'normalSummon' || a.type === 'procSummon') && 'summon', acts.some(a => a.type === 'setMonster') && 'mset', acts.some(isTombAct) && 'tomb', acts.some(isTombAct) && !SCRIPTS[S.cards[u].code]?.cannotSet && 'tombset'].filter(Boolean);
  return [acts.some(a => a.type === 'activate' && d.kind === 'spell') && 'activate', acts.some(a => a.type === 'setSpellTrap') && 'sset'].filter(Boolean);
}
function startPlace(u, acts, t) {
  const modes = placeModes(acts, t, u);
  if (!modes.length) return;
  if (modes.length === 1) { placeConfirm(u, acts, t, modes[0]); return; }
  const layer = document.createElement('div');
  layer.className = 'place-layer';
  $('.droot').appendChild(layer);
  place = { u, acts, t, modes, m: 0, layer };
  t.el.classList.add('aim-hover');
  drawPlace();
}
function drawPlace() {
  const { u, t, modes, m, layer } = place, mode = modes[m], d = defOf(S, u);
  const r = t.el.getBoundingClientRect();
  const back = mode === 'mset' || mode === 'sset', def = mode === 'mset';
  const w = Math.min(r.width, r.height * 59 / 86) * (def ? .7 : .92);
  const cls = back ? 'card back' : faceCls(d);
  layer.innerHTML = `<span class="${cls} place-ghost${def ? ' def' : ''}" style="left:${(r.left + r.width / 2).toFixed(0)}px;top:${(r.top + r.height / 2).toFixed(0)}px;width:${w.toFixed(0)}px;font-size:${(w / 8).toFixed(1)}px">${back ? '' : faceHtml(u, d, false)}</span>`
    + `<div class="place-chip" style="left:${(r.left + r.width / 2).toFixed(0)}px;top:${(r.bottom + 8).toFixed(0)}px"><b>${modeLabel(mode, u)}${modes.length > 2 ? `<span class="place-n">${m + 1}/${modes.length}</span>` : ''}</b>${modes.length > 2 ? `<span class="place-dots">${modes.map((x, i) => `<i class="${i === m ? 'on' : ''}">${esc(modeLabel(x, u))}</i>`).join('')}</span>` : ''}<small>タップで決定／横に払うと「${modes.length > 1 ? modeLabel(modes[(m + 1) % modes.length], u) : '切り替え'}」／下に払うとやめる</small><button class="place-x" type="button" aria-label="やめる">✕</button></div>`;
  clampChip(layer);
}
/** 置いた後の説明が画面の外にはみ出さないよう、左右の位置を内側に寄せる */
function clampChip(layer) {
  const c = layer.querySelector('.place-chip'); if (!c) return;
  const w = c.offsetWidth, x = parseFloat(c.style.left) || innerWidth / 2;
  c.style.left = Math.min(innerWidth - w / 2 - 8, Math.max(w / 2 + 8, x)) + 'px';
  const r = c.getBoundingClientRect(); if (r.bottom > innerHeight - 8) c.style.top = Math.max(8, innerHeight - 8 - r.height) + 'px';
}
function endPlace() {
  if (!place) return;
  place.t.el.classList.remove('aim-hover');
  place.layer.remove();
  place = null;
}
function placeGesture(dx, dy, target) {
  if (!place) return;
  const cancel = () => { endPlace(); selected = null; sheet = null; render(); };
  if (target && target.closest('.place-x')) { cancel(); return; }
  if (dy > 40 && dy > Math.abs(dx)) { cancel(); return; }                       // 下に払う：やめて手札に戻す
  if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) { place.m = (place.m + 1) % place.modes.length; drawPlace(); return; } // 横に払う：切り替え
  if (Math.hypot(dx, dy) > 30) return;                                          // 上に払う：何もしない
  const { u, acts, t, modes, m, layer } = place;
  // 置いたカードはすーっと消えて、そのまま召喚の演出（カードが着地する）につながる
  const g = layer.querySelector('.place-ghost'), chip = layer.querySelector('.place-chip');
  if (chip) chip.remove();
  place = null; t.el.classList.remove('aim-hover');
  if (g) g.animate([{ opacity: 1, filter: 'brightness(1)' }, { opacity: 0, filter: 'brightness(1.8)' }], { duration: 220, easing: 'ease-out', fill: 'forwards' });
  setTimeout(() => layer.remove(), 240);
  placeConfirm(u, acts, t, modes[m]);
}
/** 決定：選んだマスに召喚・セット・発動。リリースの組み合わせなど、まだ選ぶことがある時はカードの説明の欄から選ぶ */
function placeConfirm(u, acts, t, mode) {
  const pickOf = {
    summon: acts.filter(a => a.type === 'normalSummon' || a.type === 'procSummon'),
    mset: acts.filter(a => a.type === 'setMonster'),
    activate: acts.filter(a => a.type === 'activate'),
    sset: acts.filter(a => a.type === 'setSpellTrap'),
    tomb: acts.filter(isTombAct), tombset: acts.filter(isTombAct),
  }[mode] || [];
  if (mode === 'tomb' || mode === 'tombset') {
    // 陵墓の効果を発動し、この後に聞かれること（払うLP・召喚するモンスター・召喚かセットか）には自動で答える
    tombIntent = { u, set: mode === 'tombset', n: tributesFor(S, u), key: null };
    selected = null;
    run({ ...pickOf[0], zone: t.idx });
    return;
  }
  if (pickOf.length !== 1) { selected = u; sheet = 'detail'; render(); return; }
  const a = pickOf[0];
  const withZone = (a.type === 'normalSummon' || a.type === 'setMonster') && S.players[ME()].mzone[t.idx] === null ? { ...a, zone: t.idx }
    : (a.type === 'setSpellTrap' || a.type === 'activate') && t.kind === 'st' ? { ...a, zone: t.idx } : a;
  selected = null;
  run(withZone);
  // セットした時：カードが上からふわっと着地する（召喚・発動は、それぞれの演出がある）
  if (mode === 'mset' || mode === 'sset') landOnBoard(u);
}
let tombIntent = null;
function tombAuto() {
  const ti = tombIntent;
  if (!ti) return;
  if (!S.pending) { if (!S.chain.length) tombIntent = null; return; }
  const r = S.pending.request; if (r.player !== ME()) return;
  const key = JSON.stringify([S.step, r.prompt, S.pending.answers.length]); if (ti.key === key) return;
  let ans;
  if (r.kind === 'option' && /どちらの効果/.test(r.prompt)) { const i = r.options.findIndex(o => o.startsWith(`${ti.n * 1000}LP`)); ans = i >= 0 ? i : 0; }
  else if (r.kind === 'cards' && /リリースなしで通常召喚/.test(r.prompt) && r.options.includes(ti.u)) ans = [ti.u];
  else if (r.kind === 'option' && /をどうしますか/.test(r.prompt)) { ans = ti.set ? 1 : 0; tombIntent = null; if (ti.set) landOnBoard(ti.u); }
  else return;
  ti.key = key;
  setTimeout(() => run({ type: 'answer', value: ans }), 0);
}
function landOnBoard(u, tries = 0) {
  const el = ROOT.querySelector(`#board [data-uid="${u}"]`);
  if (!el || el.style.visibility === 'hidden') { if (tries < 30) setTimeout(() => landOnBoard(u, tries + 1), 60); return; }
  el.animate([{ translate: '0 -46px', scale: '1.28', opacity: 0, filter: 'drop-shadow(0 26px 14px rgba(0,0,0,.45))' },
    { translate: '0 3px', scale: '.98', opacity: 1, offset: .72 }, { translate: '0 0', scale: '1', opacity: 1, filter: 'none' }],
  { duration: 420, easing: 'cubic-bezier(.2,.75,.3,1)' });
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
  pressT = setTimeout(() => { const [p, k] = el.dataset.pile.split(':'); pressFired = true; pressEnd(); if (navigator.vibrate) try { navigator.vibrate(15); } catch { /* 振動できない端末 */ } showPile(Number(p), k); }, LONG_PRESS_MS);
});
root.addEventListener('pointermove', e => { if (pressT && pressXY && Math.hypot(e.clientX - pressXY[0], e.clientY - pressXY[1]) > 10) pressEnd(); });
/* スマホの手札：長押し・選んだカードの長押し（矢印）・置いた後の切り替え */
let handPressFired = false, aimDown = null, placeDown = null;
root.addEventListener('pointerdown', e => {
  if (place) { placeDown = { x: e.clientX, y: e.clientY }; return; }
  if (aim && !aim.held) { aimDown = { x: e.clientX, y: e.clientY }; return; }
  handPressFired = false;
  const el = narrow() && trayOpen && e.target.closest && e.target.closest('#hand0 [data-uid]');
  if (!el || e.button > 0) return;
  const u = Number(el.dataset.uid);
  if (S.pending && S.pending.request.kind === 'cards' && S.pending.request.options.includes(u)) return;
  clearTimeout(handPress?.timer);
  handPress = { u, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, fired: false };
  // 長押し（動かさない）：効果を見る。選んだカードを引っ張る（指を動かす）と置く（下の pointermove）
  handPress.timer = setTimeout(() => {
    const hp = handPress; if (!hp || hp.u !== u) return;
    hp.fired = true; clearTimeout(tapT); tapT = null;
    if (navigator.vibrate) try { navigator.vibrate(15); } catch { /* 振動できない端末 */ }
    selected = u; sheet = 'detail'; render();
  }, LONG_PRESS_MS);
});
root.addEventListener('pointermove', e => {
  if (aim && aim.held) { aimMove(e.clientX, e.clientY); return; }
  if (handPress) {
    handPress.lx = e.clientX; handPress.ly = e.clientY;
    const dx = e.clientX - handPress.x, dy = e.clientY - handPress.y;
    // 選んで光っているカードは、長押しを待たずに指を動かしただけでついてくる（下に払う＝手札をしまう、は除く）
    if (!handPress.fired && selected === handPress.u && Math.hypot(dx, dy) > 8 && !(dy > 0 && dy > Math.abs(dx)) && handActs(handPress.u).length) {
      clearTimeout(handPress.timer); handPress.fired = true; startAim(handPress.u, handPress.x, handPress.y); aimMove(e.clientX, e.clientY); return;
    }
    if (!handPress.fired && Math.hypot(dx, dy) > 10) { clearTimeout(handPress.timer); handPress = null; }
  }
});
root.addEventListener('pointerup', e => {
  if (place && placeDown) { const dx = e.clientX - placeDown.x, dy = e.clientY - placeDown.y; placeDown = null; placeGesture(dx, dy, e.target); handPressFired = true; return; }
  if (aim && aim.held) { aimRelease(e.clientX, e.clientY); handPressFired = true; handPress = null; return; }
  if (aim && aimDown) { aimDown = null; aimTap(e.clientX, e.clientY, e.target); handPressFired = true; return; }
  if (handPress) { clearTimeout(handPress.timer); handPressFired = handPress.fired; handPress = null; }
});
/* ---------- 攻撃：自分のモンスターを相手に向けて引っ張る ----------
 * 攻撃できるモンスターを押して動かすと、矢印が一番近い「攻撃できる相手」（相手のモンスターか、ダイレクトアタックなら相手のLP）に吸い付く。
 * 吸い付いた先との力の差を出し、指を離すとその相手に攻撃する。押しただけなら、今まで通りカードを選ぶ */
let batk = null; // { u, x, y, on, layer, targets, hover }
function atkActs(u) {
  if (!humanActing() || S.pending || S.phase !== 'battle') return [];
  return legalActions(S).filter(a => a.type === 'attack' && a.attacker === u);
}
function atkTargets(acts) {
  return acts.map(a => {
    const el = a.target === null ? ($('#side1 .lp') || $('#side1')) /* 相手の帯（上）はいつも #side1 */ : ROOT.querySelector(`#board [data-uid="${a.target}"]`);
    return el ? { a, el } : null;
  }).filter(Boolean);
}
/** 力の差の説明（裏側で中身の分からないモンスターは ???） */
function atkVerdict(u, a) {
  const atk = currentAtk(S, u);
  if (a.target === null) return { main: `ダイレクトアタック`, sub: `${oppWord(cpuMode())}に ${atk} ダメージ`, cls: 'win' };
  const c = S.cards[a.target], known = c.faceUp || c.pub;
  const name = known ? defOf(S, a.target).name : '裏側守備表示モンスター';
  if (!known) return { main: `${atk} vs ???`, sub: `${name}（守備力は分からない）`, cls: 'unk' };
  if (c.position === 'atk') {
    const t = currentAtk(S, a.target), d = atk - t;
    return { main: `${atk} vs 攻${t}`, sub: d > 0 ? `勝ち：${name}を破壊、${oppWord(cpuMode())}に ${d} ダメージ` : d === 0 ? `相打ち：お互いのモンスターを破壊` : `負け：こちらが破壊され、あなたに ${-d} ダメージ`, cls: d > 0 ? 'win' : d === 0 ? 'even' : 'lose' };
  }
  const t = currentDef(S, a.target), d = atk - t;
  return { main: `${atk} vs 守${t}${c.faceUp ? '' : '（裏）'}`, sub: d > 0 ? `勝ち：${name}を破壊` : d === 0 ? `どちらも破壊されない` : `負け：あなたに ${-d} ダメージ`, cls: d > 0 ? 'win' : d === 0 ? 'even' : 'lose' };
}
function atkStart() {
  const layer = document.createElement('div');
  layer.className = 'aim-layer atk-aim';
  layer.innerHTML = `<svg aria-hidden="true"><defs><marker id="atkHead" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker></defs><path class="aim-line" marker-end="url(#atkHead)"/></svg><div class="atk-chip" hidden></div>`;
  $('.droot').appendChild(layer);
  batk.layer = layer; batk.on = true;
  batk.src = ROOT.querySelector(`#board [data-uid="${batk.u}"]`);
  if (batk.src) batk.src.classList.add('atk-src');
  if (navigator.vibrate) try { navigator.vibrate(12); } catch { /* 振動できない端末 */ }
}
function atkMove(x, y) {
  const b = batk; if (!b || !b.on) return;
  let best = null, bd = Infinity;
  for (const t of b.targets) { const r = t.el.getBoundingClientRect(), d = Math.hypot(r.left + r.width / 2 - x, (r.top + r.height / 2 - y) * 1.2); if (d < bd) { bd = d; best = t; } }
  if (best !== b.hover) { if (b.hover) b.hover.el.classList.remove('atk-hover'); b.hover = best; if (best) best.el.classList.add('atk-hover'); }
  const s = b.src ? b.src.getBoundingClientRect() : { left: b.x, top: b.y, width: 0, height: 0 };
  const fx = s.left + s.width / 2, fy = s.top + s.height / 2;
  const line = b.layer.querySelector('.aim-line'), chip = b.layer.querySelector('.atk-chip');
  if (!best) { line.setAttribute('d', ''); chip.hidden = true; return; }
  const r = best.el.getBoundingClientRect(), tx = r.left + r.width / 2, ty = r.top + r.height / 2;
  const mx = (fx + tx) / 2 + (tx - fx) * .2, my = Math.min(fy, ty) - 24;
  line.setAttribute('d', `M${fx.toFixed(0)},${fy.toFixed(0)} Q${mx.toFixed(0)},${my.toFixed(0)} ${tx.toFixed(0)},${ty.toFixed(0)}`);
  const v = atkVerdict(b.u, best.a);
  chip.hidden = false; chip.className = `atk-chip ${v.cls}`;
  chip.innerHTML = `<b>${esc(v.main)}</b><small>${esc(v.sub)}</small><small class="atk-how">離すと攻撃</small>`;
  const cw = chip.offsetWidth || 220; // 画面からはみ出さないように
  chip.style.left = Math.min(innerWidth - cw / 2 - 8, Math.max(cw / 2 + 8, tx)) + 'px';
  chip.style.top = (r.bottom + 6 > innerHeight - 80 ? r.top - 70 : r.bottom + 6) + 'px';
}
function atkEnd() {
  const b = batk; batk = null; if (!b) return null;
  if (b.layer) b.layer.remove();
  if (b.hover) b.hover.el.classList.remove('atk-hover');
  if (b.src) b.src.classList.remove('atk-src');
  return b;
}
root.addEventListener('pointerdown', e => {
  if (batk || aim || place || e.button > 0) return;
  const el = e.target.closest && e.target.closest('#board [data-uid]');
  if (!el) return;
  const u = Number(el.dataset.uid);
  const me = netMode() ? ME() : 0; // 引っ張って攻撃できるのは下の盤面のモンスター（オンライン対戦では自分の席）
  if (!S || !S.cards[u] || S.cards[u].controller !== me || (!cpuMode() && actorOf(S) !== me)) return;
  const acts = atkActs(u);
  if (!acts.length) return;
  batk = { u, x: e.clientX, y: e.clientY, on: false, layer: null, targets: atkTargets(acts), hover: null };
});
root.addEventListener('pointermove', e => {
  if (!batk) return;
  if (!batk.on && Math.hypot(e.clientX - batk.x, e.clientY - batk.y) > 10) atkStart();
  if (batk.on) atkMove(e.clientX, e.clientY);
});
root.addEventListener('pointerup', () => {
  if (!batk) return;
  const b = atkEnd();
  if (!b.on) return; // 押しただけ：カードを選ぶ（今まで通り）
  handPressFired = true;
  if (b.hover) { selected = null; sheet = null; run(b.hover.a); }
});
root.addEventListener('pointercancel', () => { atkEnd(); });
/* 手札を閉じていて、何も選んでいない普通の状態なら、画面のどこを上に払っても手札が開く */
/* 手札の開け閉め：何も選んでいない普通の状態なら、画面のどこを上に払っても開き、下に払っても閉じる
 * （スマホでは上下に払うとページのスクロールとして先に取られ、pointer の「離した」が届かないことがあるので、touch でも受ける） */
let trayGesture = null;
const calmState = () => narrow() && S && S.winner === null && !(S.pending && !isRemote(S.pending.request.player)) && !fan && !sheet && selected === null && !aim && !place && !handPress && !batk
  && $('#menu').hidden && $('#pileDlg').hidden && $('#reviewDlg').hidden;
function trayGestureStart(x, y, target) {
  // ボタン・選ぶ画面の中から始めた操作は対象外
  trayGesture = calmState() && !(target && target.closest && target.closest('button, .btn, .fan-layer, .sheet, .overlay')) ? { x, y, t: performance.now() } : null;
}
function trayGestureEnd(x, y) {
  const g = trayGesture; trayGesture = null;
  if (!g || !calmState()) return;
  const dx = x - g.x, dy = y - g.y;
  if (Math.abs(dy) < 40 || Math.abs(dy) < Math.abs(dx) * 1.2) return;
  if (dy < 0 && !trayOpen) { setTray(true); handPressFired = true; }
  else if (dy > 0 && trayOpen) { setTray(false); handPressFired = true; }
}
root.addEventListener('pointerdown', e => trayGestureStart(e.clientX, e.clientY, e.target));
root.addEventListener('pointerup', e => trayGestureEnd(e.clientX, e.clientY));
// 準備画面：横に払ってページを移る（No.5）
root.addEventListener('pointerdown', e => { suSwipe = setupOpen() && e.target.closest && e.target.closest('#setup') ? { x: e.clientX, y: e.clientY } : null; });
root.addEventListener('pointerup', e => suSwipeEnd(e.clientX, e.clientY));
root.addEventListener('pointercancel', () => { suSwipe = null; });
root.addEventListener('touchstart', e => { const p = e.touches[0]; if (p && e.touches.length === 1) trayGestureStart(p.clientX, p.clientY, e.target); }, { passive: true });
root.addEventListener('touchend', e => { const p = e.changedTouches[0]; if (p) trayGestureEnd(p.clientX, p.clientY); }, { passive: true });
root.addEventListener('pointercancel', () => { if (handPress) { clearTimeout(handPress.timer); handPress = null; } if (aim && aim.held) endAim(); });
['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => root.addEventListener(ev, () => { if (pressT) pressEnd(); }));
root.addEventListener('contextmenu', e => {
  if (e.target.closest && e.target.closest('#hand0')) { e.preventDefault(); return; } // 手札の長押しで、ブラウザのメニューを出さない
  const el = e.target.closest && e.target.closest('#board [data-pile]');
  if (!el) return;
  e.preventDefault();
  if (!pressFired) { const [p, k] = el.dataset.pile.split(':'); showPile(Number(p), k); }
});
root.addEventListener('click', e => {
  // 長押しで一覧を開いた直後の「押した」は無視する
  if (pressFired) { pressFired = false; e.preventDefault(); return; }
  if (handPressFired) { handPressFired = false; e.preventDefault(); return; }
  if (aim || place) return;
  const t = e.target;
  { const zp = zonePick(), zEl = t.closest && t.closest('#board [data-zone]');
    if (zp && zEl && zp.map.has(zEl.dataset.zone)) { clearZoneTip(); run({ type: 'answer', value: zp.map.get(zEl.dataset.zone) }); return; } }
  if (t.closest('[data-fanok]')) { if (fan) fanFinish(fan.sel); return; }
  if (t.closest('[data-fanskip]')) { fanFinish([]); return; }
  if (t.closest('[data-fanundo]')) { closeFan(); undo(); return; }
  const fanEl = t.closest('[data-fan]');
  if (fanEl) {
    const fu = Number(fanEl.dataset.fan);
    const it = fan && fan.car && fanEl.closest('.fan-car .pile-it');
    if (it) { if (fan.car.current() !== it) { fan.car.center(it); return; } fanPick(fu); return; }
    if (narrow() && fan && (!fan.peek || fan.peek !== fu || !fan.req.options.includes(fu))) { fanPeek(fanEl, fu); return; }
    fanPick(fu); return;
  }
  if (t.closest('#setup')) {
    if (t.closest('#suBack')) { if (SU && SU.hist.length) { SU.page = SU.hist.pop(); renderSetup(); } return; }
    if (t.closest('#suClose')) { if (placeholder) { if (OPTS.onClose) OPTS.onClose(); } else closeSetup(); return; }
    if (t.id === 'setup') return; // 外側を押しても閉じない（押し間違いで、選んでいないデッキの対戦が始まらないように）
    setupClick(t); return;
  }
  if (t.closest('#again') || t.closest('[data-again="1"]')) { if (cpuMode()) { const sp = $('#speech'); if (sp && !sp.hidden) setTimeout(() => openSetup('go'), 1500); else openSetup('go'); } else newDuel(); return; }
  if (t.closest('[data-reopen="1"]')) { peek = false; render(); return; }
  if (t.closest('#stopBtn')) { stopNext = !stopNext; renderDock(); return; }
  if (t.closest('#handHold')) { setTray(true); return; }
  if (t.closest('#endBtn')) { endTap(); return; }
  if (t.closest('#undoMini')) { undo(); return; }
  if (t.closest('#reviewBtn')) { showReview(); return; }
  if (t.closest('#reviewClose') || t.id === 'reviewDlg') { $('#reviewDlg').hidden = true; return; }
  if (t.closest('#closeDuel')) { clearTimeout(cpuTimer); OPTS.onClose?.(); return; }
  if (t.closest('#reopen')) { peek = false; render(); return; }
  if (t.closest('[data-close]') || t.id === 'scrim') { closeSheets(); return; }
  if (t.closest('#logBtn')) { sheet = sheet === 'log' ? null : 'log'; renderSheets(); if (logPaused()) clearTimeout(cpuTimer); else if (S && !pausedUi()) scheduleCpu(); return; }
  if (t.closest('#menuBtn')) { openMenu(); return; }
  if (t.closest('#menuClose') || t.id === 'menu') { closeMenu(); if (suReturn) { suReturn = false; openSetup('go'); } return; }
  if (t.closest('#surrender')) { surrender(); return; }
  { const ap = actPick; const zEl = ap && t.closest && t.closest('#board [data-zone]');
    if (ap) { actPick = null; clearZoneTip(); if (zEl && ap.zones.has(zEl.dataset.zone)) { run({ ...ap.a, zone: Number(zEl.dataset.zone.split(':')[2]) }); return; } render(); if (zEl) return; } }
  const actEl = t.closest('[data-act]');
  // 今はできない操作（薄いボタン）：マスを選ばせてから断るのではなく、押した時にすぐ理由を出す
  if (actEl && actEl.classList.contains('off')) { let why = ''; try { why = whyIllegal(S, JSON.parse(actEl.dataset.act)) || ''; } catch { /* 理由が分からない */ } toast(why ? `できません：${WHO(why)}` : '今はできません', true); return; }
  if (actEl && cpuMode() && actEl.closest('#detailSheet, #detail')) {
    const a = JSON.parse(actEl.dataset.act);
    const zs = actZones(a);
    if (zs && zs.length > 1) { sheet = null; selected = null; actPick = { a, zones: new Set(zs) }; render(); return; }
  }
  if (actEl) {
    // カードの説明から操作した時は、説明を閉じて盤面の演出が見えるようにする
    if (actEl.closest('#detailSheet')) { sheet = null; selected = null; }
    run(JSON.parse(actEl.dataset.act)); return;
  }
  const ansEl = t.closest('[data-ans]');
  if (ansEl) { sheet = null; selected = null; run({ type: 'answer', value: JSON.parse(ansEl.dataset.ans) }); return; }
  { const fb = t.closest('[data-fp]'); const fp = fb && fieldPick();
    if (fp) { const chosen = fb.dataset.fp === 'ok' ? pick.slice() : []; pick = []; clearZoneTip(); (chosen.length ? lockOn(chosen, fp.prompt) : Promise.resolve()).then(() => run({ type: 'answer', value: chosen })); return; } }
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
  if (t.closest('#rulClose') || t.id === 'rulingDlg') { $('#rulingDlg').hidden = true; return; }
  if (netClick(t)) return;
  { const g = t.closest('[data-gd]'); if (g) { const k = g.dataset.gd; if (k === 'next') openGuide(guideAt + 1); else if (k === 'prev') openGuide(guideAt - 1); else closeGuide(); return; } }
  if (t.closest('#guideOpen')) { closeMenu(); openGuide(0); return; }
  { const rb = t.closest('[data-rul]'); if (rb) { showRulings(rb.dataset.rul); return; } }
  // パソコン（広い画面）では、置き場を押すと一覧。スマホでは一番上のカードの説明（一覧は長押し）
  const pileHit = t.closest('#board [data-pile]');
  if (pileHit && !narrow() && !(S.pending && S.pending.request.kind === 'cards')) { const [p, k] = pileHit.dataset.pile.split(':'); showPile(Number(p), k); return; }
  const cardEl = t.closest('[data-uid]');
  if (cardEl) {
    const u = Number(cardEl.dataset.uid);
    // 選択中なら、盤面のカードを押しても選べる
    if (S.pending && S.pending.request.kind === 'cards' && S.pending.request.options.includes(u) && !isRemote(S.pending.request.player)) {
      const fp = fieldPick();
      if (fp && fp.max === 1) { const prompt = fp.prompt; pick = []; clearZoneTip(); lockOn([u], prompt).then(() => run({ type: 'answer', value: [u] })); return; }
      togglePick(u); if (fp) renderZonePick(); return;
    }
    // スマホの自分の手札：1回押すと飛び出して光る（選ぶ）、もう一度押すと戻る。効果は長押しで見る
    if (narrow() && cardEl.closest('#hand0')) { handTap(u); return; }
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
    if (!$('#guideDlg').hidden) closeGuide();
    else if (!$('#rulingDlg').hidden) $('#rulingDlg').hidden = true;
    else if (!$('#pileDlg').hidden) $('#pileDlg').hidden = true;
    else if (!$('#menu').hidden) closeMenu();
    else closeSheets();
  }
});
$('#undo').onclick = undo;
$('#homeBtn').onclick = () => { suReturn = false; placeholder = true; openSetup('home'); };
$('#newDuel').onclick = () => { if (cpuMode()) { suReturn = false; openSetup(); } else newDuel(); };
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
// スマホを横に向けた時は、手札をしまう（縦に戻した時はそのまま。上に払えば開く）
matchMedia('(max-width: 860px) and (orientation: landscape)').addEventListener('change', e => { if (e.matches && trayOpen) setTray(false); });
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
  // 操作ガイド：左右に払ってめくる
  { const gb = root.querySelector('#guideBox'); let gx = null; if (gb) { gb.addEventListener('pointerdown', e => { gx = e.clientX; }); gb.addEventListener('pointerup', e => { if (gx === null) return; const dx = e.clientX - gx; gx = null; if (Math.abs(dx) > 40) openGuide(guideAt + (dx < 0 ? 1 : -1)); }); } }
  wireSheets(root);
  window.addEventListener('resize', () => measureBottom());
  measureBottom();
  if (landscape()) setTray(false); // 横向きで開いた時は、手札をしまった形から
  const start = data => {
    // 演出のDEMO（demo.html）：2人対戦の形で静かに始める（CPUは動かない・開始の帯もセリフも出さない・保存もしない）
    // 招待（サイトの招待・招待リンクから）：opts.netJoin＝相手のキー番号。窓を開いて、すぐ子として［つなぐ］（スイッチ ONLINE が入っている時だけ。DEMOのページでも同じ）
    const joinVs = () => {
      if (netResumeOnOpen()) return; // 読み直した・閉じて開き直した時：対戦の続きがあれば、そちらに戻る（招待リンクより先）
      const vs = opts.netJoin || (ONLINE ? (() => { try { return new URLSearchParams(location.search).get('vs'); } catch { return null; } })() : null); // 卓だけのページは、URLの ?vs=キー も見る
      if (ONLINE && vs && /^\d{4}$/.test(String(vs))) { if (setupOpen()) closeSetup(); openNet(); netUi.key = String(vs); netConnect(false); }
    };
    if (opts.demo) { $('#mode').value = 'hot'; $('#hideOppRow').hidden = false; newDuel(true); joinVs(); return; }
    // 全力のCPUとすぐ対戦する DEMO（cpu-demo.html）：opts.quick = [あなたのデッキ, CPUのデッキ]。先攻・後攻はランダム
    if (opts.quick) { $('#mode').value = 'cpu'; $('#hideOppRow').hidden = true; for (const i of [0, 1]) if (DECKS[opts.quick[i]]) $(`#deck${i}`).value = opts.quick[i]; $('#first').value = 'r'; cpuLevel = CPU_LEVEL; showDeckFmt(); newDuel(); joinVs(); return; }
    if (data && data.mode) $('#mode').value = data.mode;
    if (data && data.d0 && DECKS[data.d0]) $('#deck0').value = data.d0;
    if (data && data.d1 && DECKS[data.d1]) $('#deck1').value = data.d1;
    cpuLevel = CPU_LEVEL; // 前に保存した対戦の続きも、全力で
    if (data && data.undo) undoUsed = true;
    $('#hideOppRow').hidden = cpuMode();
    showDeckFmt();
    if (data && data.S && (data.v === 4 || data.v === SAVE_V)) {
      try { S = data.S; if (!S.askZone) S.askZone = netMode() ? [0, 1] : cpuMode() ? [0] : [0, 1]; history = data.history || []; trace = Array.isArray(data.trace) ? data.trace : []; lastLp = [S.players[0].lp, S.players[1].lp]; render(); joinVs(); return; } // 途中のCPU対戦があっても、招待は受ける（CPU対戦は保存されたまま）
      catch (e) { console.warn('保存していたデュエルを開けませんでした', e); }
    }
    // ルールページでは、最初に準備画面（デッキ選び → 先攻・後攻 → デュエル開始）を開く。後ろの仮の対戦では、開始の帯もセリフも出さない
    const first = opts.menuFirst && cpuMode();
    newDuel(first);
    if (opts.menuFirst) { if (cpuMode()) { placeholder = true; openSetup(); } else openMenu(); }
    else maybeGuide(); // 準備画面を出さない時（対戦卓だけのページ）は、すぐにガイド
    // 招待（サイトの招待・招待リンクから）：opts.netJoin＝相手のキー番号。窓を開いて、すぐ子として［つなぐ］（スイッチ ONLINE が入っている時だけ）
    joinVs();
  };
  // 動作確認用：開発者ツールから状態を読み書きできるようにする
  window.__duel = { /* 見張り用：演出の記録（fxRec を見る） */ get fxLog() { return fxLog; }, fxLogClear() { fxLog.length = 0; }, /* DEMO用：操作ガイドを開く（DEMOでは見たことを覚えない） */ openGuide(i) { openGuide(i || 0); }, /* 確かめ用：オンライン対戦の準備の窓を開く（スイッチ ONLINE が入っている時だけ） */ openNet() { if (ONLINE) openNet(); }, /* 確かめ用：オンライン対戦の席（0／1）と相手の名前で見た画面にする（通信はしない）。null で元にもどす */ previewSeat(seat, name) { if (seat == null) { mySeat = 0; net = null; } else { mySeat = seat; net = { link: null, oppName: name || '相手' }; $('#mode').value = 'hot'; } render(); }, get state() { return S; }, speak(t) { speak(t); }, act(a) { run(a); }, review(tr) { if (tr) trace = tr; showReview(); }, get cpu() { return { thinking: thinking === S, ready: !!ready, waiting: waiting.size, worker: !!worker, workerBroken, timer: cpuTimer, trace: trace.length }; }, load(s) { clearTimeout(cpuTimer); glowDone.clear(); costShown.clear(); heldAnims = []; S = s; history = []; selected = null; pick = []; lastLp = [s.players[0].lp, s.players[1].lp]; render(); } };
  if (opts.standalone) {
    window.claude?.hot?.snapshot?.(() => ({ v: 4, S, history: history.slice(-30), mode: $('#mode').value }));
    window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
  } else start(loadSaved());
}
/** 画面を開き直した時：止めていたCPUの手番を再開する */
export function resume() { if (S) render(); }
