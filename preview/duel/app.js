// 対戦画面（第5段階：CPU対戦）。エンジンは ./engine/game.js、CPU は ./ai/cpu.js
// 画面の考え方：やることは画面下の「操作ドック」にまとめる。カードを押すと、PCは右の欄、スマホは下から出るシートに操作が出る。
import { cpuDecide } from './ai/cpu.js';
import { play, unlock, soundEnabled, setSoundEnabled } from './sound.js';
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
/** 状態を進めて、起きたことに合わせて効果音を鳴らす */
function commit(next) {
  const prev = S;
  S = next;
  if (prev) play(soundsFor(prev, next));
}

/* ---------- CPU の手番（速さはメニューで選べる） ---------- */
const SPEED = { slow: 1700, normal: 1000, fast: 450 };
function cpuDelay() {
  const base = SPEED[$('#cpuSpeed').value] ?? SPEED.normal;
  if (S.pending) return base * 0.6;                       // 対象やカードを選ぶ
  if (S.window.kind === 'priority') return base * 0.7;    // 応答するかどうか
  return base;                                            // 召喚・発動・攻撃・フェイズ移行
}
function scheduleCpu() {
  clearTimeout(cpuTimer);
  if (!S || S.winner !== null || !isCpu(actorOf(S))) return;
  cpuTimer = setTimeout(() => {
    if (!S || S.winner !== null || !isCpu(actorOf(S))) return;
    let a;
    try { a = cpuDecide(S); } catch (e) { console.error(e); toast(`CPUのエラー：${e.message}`, true); return; }
    try { commit(applyAction(S, a)); } catch (e) { console.error(e); toast(`CPUのエラー：${e.message}`, true); return; }
    pick = [];
    render();
  }, cpuDelay());
}

/* ---------- 新しいデュエル ---------- */
function deckOptions() { return Object.values(DECKS).map(d => `<option value="${esc(d.code)}">${esc(d.name)}</option>`).join(''); }
function newDuel() {
  // 選ばれているデッキが無い場合（読み込み直後など）は最初のデッキを使う
  const first = Object.values(DECKS)[0];
  const d0 = DECKS[$('#deck0').value] ?? first, d1 = DECKS[$('#deck1').value] ?? first;
  const f = $('#first').value;
  S = createGame({ pool: CARD_POOL, decks: [d0, d1], firstPlayer: f === 'r' ? undefined : Number(f) });
  history = []; selected = null; pick = []; sheet = null; peek = false; lastLp = [S.players[0].lp, S.players[1].lp];
  closeMenu();
  render();
}

/* ---------- 行動の実行 ---------- */
function run(action) {
  if (S.winner === null && isCpu(actorOf(S))) { toast('CPUが考えています'); return; }
  try {
    const next = applyAction(S, action);
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
function undo() { if (!history.length) return; clearTimeout(cpuTimer); S = history.pop(); pick = []; render(); }

let toastT;
function toast(msg, bad) {
  const t = $('#toast'); t.textContent = msg; t.dataset.bad = bad ? '1' : ''; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3200);
}

/* ---------- カード表示 ---------- */
function frameOf(d) { return d.kind === 'spell' ? 'spell' : d.kind === 'trap' ? 'trap' : d.frame; }
let canAct = new Set();
function cardHtml(uid, { hidden = false, field = false } = {}) {
  const c = S.cards[uid];
  const d = defOf(S, uid);
  const cls = [uid === selected ? 'sel' : '', field && c.position === 'def' ? 'def' : '', canAct.has(uid) ? 'can' : '', pick.includes(uid) ? 'picked' : ''].join(' ');
  const badge = [c.counters && c.counters.magic ? `<span class="badge">魔${c.counters.magic}</span>` : '', c.equippedTo !== null ? '<span class="badge eq">装備</span>' : ''].join('');
  if (hidden || (!c.faceUp && !(c.zone === 'hand' || c.zone === 'extra' || c.zone === 'deck' || field))) return `<button class="card back ${cls}" data-uid="${uid}" aria-label="裏側のカード">${badge}</button>`;
  if (!c.faceUp && field && isCpu(c.controller)) return `<button class="card back ${cls}" data-uid="${uid}" aria-label="裏側のカード">${badge}</button>`;
  if (!c.faceUp && field) return `<button class="card back ${cls}" data-uid="${uid}" aria-label="裏側：${esc(d.name)}"><span class="bn">${esc(d.name)}</span>${badge}</button>`;
  return `<button class="card f-${frameOf(d)} ${cls}" data-uid="${uid}" aria-label="${esc(d.name)}">${faceHtml(uid, d, field)}${badge}</button>`;
}
/* ---------- カードの表面：カード名と属性／レベル（魔法・罠は種類）／種族の一文字／種族と種類／攻撃力・守備力 ---------- */
const ATTR_COLOR = { 闇: '#534ab7', 光: '#b8902a', 地: '#8a6a3a', 水: '#2f6fb0', 炎: '#c4473a', 風: '#2e8b57', 神: '#a9841f' };
const RACE_CHAR = { ドラゴン族: '竜', 魔法使い族: '魔', 機械族: '機', 戦士族: '戦', 悪魔族: '悪', 天使族: '天', アンデット族: '屍', 獣族: '獣', 獣戦士族: '獣', 鳥獣族: '鳥', 爬虫類族: '爬', 恐竜族: '恐', 水族: '水', 海竜族: '海', 魚族: '魚', 炎族: '炎', 雷族: '雷', 岩石族: '岩', 植物族: '植', 昆虫族: '虫', 幻神獣族: '神' };
const SPELL_MARK = { 通常: '✦', 速攻: '➶', 永続: '∞', 装備: '⚔', フィールド: '◈', 儀式: '✧' };
const TRAP_MARK = { 通常: '◆', 永続: '∞', カウンター: '↺' };
const FRAME_NAME = { normal: '通常', effect: '効果', ritual: '儀式', fusion: '融合' };
function faceHtml(uid, d, field) {
  const name = `<span class="n">${esc(d.name)}</span>`;
  if (d.kind !== 'monster') {
    const spell = d.kind === 'spell';
    const at = `<b class="at" style="background:${spell ? '#0f6e56' : '#993556'}">${spell ? '魔' : '罠'}</b>`;
    const mark = (spell ? SPELL_MARK : TRAP_MARK)[d.subtype] || (spell ? '✦' : '◆');
    const text = String(d.text || '').replace(/^[①-⑳]：/, '').replace(/\s+/g, '');
    return `<span class="nm">${name}${at}</span><span class="sp">${esc(d.subtype)}${spell ? '魔法' : '罠'}</span><span class="art">${mark}</span><span class="ty">${esc(text.slice(0, 16))}</span>`;
  }
  const at = `<b class="at" style="background:${ATTR_COLOR[d.attribute] || '#6a6e7e'}">${esc(d.attribute || '？')}</b>`;
  const lvl = d.level ?? 0;
  const stars = lvl <= 8 ? '★'.repeat(lvl) : `★×${lvl}`;
  const race = d.race || '';
  const ch = RACE_CHAR[race] || race.charAt(0) || '？';
  const kind = FRAME_NAME[d.frame] || '効果';
  const atk = field ? currentAtk(S, uid) : d.atk, def = field ? currentDef(S, uid) : d.def;
  // フィールドで数値が上がっていれば緑、下がっていれば赤
  const cls = (now, base) => (!field || now === base ? '' : now > base ? ' class="up"' : ' class="dn"');
  return `<span class="nm">${name}${at}</span><span class="lv">${stars}</span><span class="art">${esc(ch)}</span><span class="ty">${esc(race)}／${kind}</span>`
    + `<span class="st"><span${cls(atk, d.atk)}><i>攻</i>${atk}</span><span${cls(def, d.def)}><i>守</i>${def}</span></span>`;
}
function zone(uid, label, cls = '') {
  return `<div class="zone ${cls}">${uid !== null && uid !== undefined ? cardHtml(uid, { field: true }) : `<span class="zl">${label}</span>`}</div>`;
}
function pile(p, kind) {
  const list = S.players[p][kind];
  const label = { deck: 'デッキ', gy: '墓地', extra: 'EX', banished: '除外' }[kind];
  const top = list.length ? list[list.length - 1] : null;
  const face = (kind === 'gy' || kind === 'banished') && top !== null ? cardHtml(top) : list.length ? `<span class="card back mini"></span>` : '';
  return `<button class="zone pile" data-pile="${p}:${kind}" aria-label="${NAME(p)}の${label}（${list.length}枚）">${face}<span class="pl">${label}</span><span class="cnt">${list.length}</span></button>`;
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
function renderHand(p) {
  const hide = cpuMode() ? p === CPU : $('#hideOpp').checked && p !== actorOf(S);
  const h = S.players[p].hand;
  return h.length ? h.map(u => cardHtml(u, { hidden: hide })).join('') : '<span class="empty">手札なし</span>';
}
function renderSide() {
  [0, 1].forEach(p => {
    const el = $(`#side${p}`);
    const P = S.players[p];
    el.classList.toggle('acting', actorOf(S) === p && S.winner === null);
    el.querySelector('.who').textContent = NAME(p);
    const lp = el.querySelector('.lp');
    lp.textContent = P.lp;
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
  $('#turnInfo').textContent = S.winner !== null ? '決着' : `ターン${S.turn}・${NAME(S.turnPlayer)}`;
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
  return head + `<p class="tl">${range}選んでください（${pick.length}枚選択中）。盤面のカードを押しても選べます。</p><div class="optlist">${r.options.map(u => `<button class="opt${pick.includes(u) ? ' on' : ''}" data-opt="${u}"><span>${esc(label(u))}</span><small>${NAME(S.cards[u].controller)}・${where(u)}${defOf(S, u).kind === 'monster' ? `・★${defOf(S, u).level}・${defOf(S, u).atk}/${defOf(S, u).def}` : ''}</small></button>`).join('')}</div>
    <button class="btn primary confirm" id="confirmPick" ${ok ? '' : 'disabled'}>決定</button>`;
}

function renderDetail() {
  const el = $('#detail');
  if (S.pending && isCpu(S.pending.request.player)) { el.innerHTML = `<h3>CPUが選んでいます</h3><p class="prompt">${esc(S.pending.request.prompt)}</p>`; return; }
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

/* ---------- シート（スマホ） ---------- */
function renderSheets() {
  const humanChoice = S.pending && !isCpu(S.pending.request.player);
  const detailOpen = narrow() && ((humanChoice && !peek) || (sheet === 'detail' && selected !== null));
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

function render() {
  canAct = new Set(S.pending ? [] : activatableList(S, actorOf(S)).map(a => a.uid));
  renderBoard(); renderSide(); renderTop(); renderChain(); renderDetail(); renderLog(); renderDock(); renderSheets();
  $('#result').hidden = S.winner === null;
  if (S.winner !== null) $('#result').textContent = S.winner === 'draw' ? `引き分け：${S.winReason}` : `${NAME(S.winner)}の勝利：${S.winReason}`;
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
      else localStorage.setItem(OPTS.storageKey, JSON.stringify({ v: SAVE_V, S, mode: $('#mode').value, d0: $('#deck0').value, d1: $('#deck1').value }));
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
function wire(root) {
root.addEventListener('click', e => {
  const t = e.target;
  if (t.closest('#again') || t.closest('[data-again="1"]')) { newDuel(); return; }
  if (t.closest('[data-reopen="1"]')) { peek = false; render(); return; }
  if (t.closest('#stopBtn')) { stopNext = !stopNext; renderDock(); return; }
  if (t.closest('#closeDuel')) { clearTimeout(cpuTimer); OPTS.onClose?.(); return; }
  if (t.closest('#reopen')) { peek = false; render(); return; }
  if (t.closest('[data-close]') || t.id === 'scrim') { closeSheets(); return; }
  if (t.closest('#logBtn')) { sheet = sheet === 'log' ? null : 'log'; renderSheets(); return; }
  if (t.closest('#menuBtn')) { openMenu(); return; }
  if (t.closest('#menuClose') || t.id === 'menu') { closeMenu(); return; }
  if (t.closest('#surrender')) { surrender(); return; }
  const actEl = t.closest('[data-act]');
  if (actEl) { run(JSON.parse(actEl.dataset.act)); return; }
  const ansEl = t.closest('[data-ans]');
  if (ansEl) { run({ type: 'answer', value: JSON.parse(ansEl.dataset.ans) }); return; }
  const optEl = t.closest('[data-opt]');
  if (optEl) { togglePick(Number(optEl.dataset.opt)); return; }
  if (t.closest('#confirmPick')) { run({ type: 'answer', value: pick }); return; }
  if (t.closest('#pileClose') || t.id === 'pileDlg') { $('#pileDlg').hidden = true; return; }
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
function renderSoundBtn() { const on = soundEnabled(); $('#soundBtn').textContent = on ? '音 オン' : '音 オフ'; $('#soundBtn').setAttribute('aria-pressed', String(on)); }

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
  $('#closeDuel').hidden = !opts.onClose;
  wire(root);
  const start = data => {
    if (data && data.mode) $('#mode').value = data.mode;
    if (data && data.d0 && DECKS[data.d0]) $('#deck0').value = data.d0;
    if (data && data.d1 && DECKS[data.d1]) $('#deck1').value = data.d1;
    $('#hideOppRow').hidden = cpuMode();
    if (data && data.S && (data.v === 4 || data.v === SAVE_V)) {
      try { S = data.S; history = data.history || []; lastLp = [S.players[0].lp, S.players[1].lp]; render(); return; }
      catch (e) { console.warn('保存していたデュエルを開けませんでした', e); }
    }
    newDuel();
    // ルールページでは、最初にデッキを選べるようにメニューを開く
    if (opts.menuFirst) openMenu();
  };
  // 動作確認用：開発者ツールから状態を読み書きできるようにする
  window.__duel = { get state() { return S; }, load(s) { clearTimeout(cpuTimer); S = s; history = []; selected = null; pick = []; lastLp = [s.players[0].lp, s.players[1].lp]; render(); } };
  if (opts.standalone) {
    window.claude?.hot?.snapshot?.(() => ({ v: 4, S, history: history.slice(-30), mode: $('#mode').value }));
    window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
  } else start(loadSaved());
}
/** 画面を開き直した時：止めていたCPUの手番を再開する */
export function resume() { if (S) render(); }
