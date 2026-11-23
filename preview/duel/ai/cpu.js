// CPU（第5段階）
// 考え方：候補の行動を1つずつ試し、その先を自分の次の判断の場面まで進め、盤面を点数にして一番高いものを選ぶ。
// 点数には公開情報だけを使う（相手の手札・裏側のカード・デッキの中身は見ない）。
// 先読みの中の相手は、表側でフィールドにあるカード（公開情報）の効果だけを使うと考える。
import { applyAction, legalActions, validateAnswer, actorOf, defOf, monstersOf, spellTrapsOf, currentStats, canAttack, opp, isOnField, couldAttackNextBattle, scriptOf, isFaceUpMonster, monsterNegated } from '../engine/game.js?v=20261123-1810-6db36a2771';
                                                                                     

/** 盤面の点数の重み（scripts/cpu-tune.mjs で CPU 同士を対戦させて調整した値） */
export const DEFAULT_WEIGHTS = {
  lpScale: 5000,        // LPの価値 8000×(1−e^(−LP/lpScale))：小さいほど少ないLPを重く見る
  monBase: 400,         // 表側モンスター1体の基本点
  atkW: 0.6,            // 攻撃表示モンスターの攻撃力の重み
  defPosDefW: 0.35,     // 守備表示モンスターの守備力の重み
  defPosAtkW: 0.15,     // 守備表示モンスターの攻撃力の重み
  myFaceDown: 450,      // 自分の裏側守備表示モンスターの基本点（＋攻撃力×0.3＋守備力×0.2）
  oppFaceDown: 700,     // 相手の裏側守備表示モンスター（中身は見ない）
  oppSet: 500,          // 相手のセットカード（中身は見ない）
  mySetTrap: 480,       // 自分のセットした罠
  mySetSpell: 280,      // 自分のセットした通常魔法など（手札の方が価値がある）
  faceUpST: 200,        // 表側の装備カード・永続カード
  contST: 400,          // 表側の永続魔法・永続罠（場にあって効果を出し続けるので、手札の魔法より少し高い。MIMIの横広げ）
  fieldSpell: 420,      // 表側のフィールド魔法（場にあって効果を出し続けるカードなので、手札の魔法より少し高い。MIMIの報告：サーチしたダーク・シティを発動しないまま負けた）
  handMon: 330,         // 手札のモンスター（＋攻撃力×0.02）
  handSpell: 360,       // 手札の魔法・罠
  oppHand: 350,         // 相手の手札1枚
  gyNormal: 40,         // 墓地の通常モンスター（蘇生の資源）
  gyProper: 60,         // 墓地の正規の召喚をした儀式・融合モンスター
  threatW: 0.5,         // 相手の次のバトルで受ける損害（LPと倒されるモンスター）の重み。相手の手札・伏せカードで変わるので割り引く
  lethal: 20000,        // 相手の場のモンスターだけで次のバトルで負ける盤面の減点
  doomed: 0.15,         // エンドフェイズに全て破壊される（ユベル－Das Abscheulich Ritter など）モンスターの価値の割合
  margin: 30,           // これ以上良くならない行動はしない
  previewMix: 0,        // メインフェイズ1の判断で、その後のバトルの結果をどれだけ混ぜるか（0〜1）
};
                                             

                             
                                         
                 
                      
                         
                                         
                     
                             
                                                                
                         
 

/* ===================== 盤面の点数 ===================== */
const WIN = 1_000_000;

function cardValueOnField(s           , uid        , viewer          , w         )         {
  const c = s.cards[uid], d = defOf(s, uid);
  const mine = c.controller === viewer;
  if (c.zone === 'mzone' || c.zone === 'emz') {
    if (!c.faceUp) return mine ? w.myFaceDown + (d.atk ?? 0) * 0.3 + (d.def ?? 0) * 0.2 : w.oppFaceDown;
    const st = currentStats(s, uid);
    return w.monBase + (c.position === 'atk' ? st.atk * w.atkW : st.def * w.defPosDefW + st.atk * w.defPosAtkW);
  }
  if (!c.faceUp) {
    if (!mine) return w.oppSet;
    if (c.equippedTo !== null) return 150; // サクリファイスに裏側で装備されたモンスター
    return d.kind === 'trap' ? w.mySetTrap : w.mySetSpell;
  }
  if (c.zone === 'fzone') return w.fieldSpell;
  if (d.subtype === '永続' && c.equippedTo === null) return w.contST;
  return w.faceUpST;
}

const handCardValue = (s           , uid        , w         ) => {
  const d = defOf(s, uid);
  return d.kind === 'monster' ? w.handMon + (d.atk ?? 0) * 0.02 : w.handSpell;
};

/**
 * 相手の次のバトルフェイズの見積もり（公開情報だけ）。
 * 相手の表側攻撃表示モンスターが、攻撃力の高い順に、倒せる自分のモンスターのうち一番強いものを攻撃し、
 * 自分のモンスターがいなくなったら残りはダイレクトアタックする。裏側のモンスターは、相手から見えないので守備力1500とみなす
 */
export function battleThreat(s           , p          , viewer          )                                     {
  // エンドフェイズに全て破壊されるモンスターは、次のバトルまで残らない
  const wipers = endWipers(s);
  const doomed = (u        ) => wipers.some(x => x !== u);
  const attackers = monstersOf(s, opp(p)).filter(u => couldAttackNextBattle(s, u) && !doomed(u)).map(u => currentStats(s, u).atk).sort((a, b) => b - a);
  const blockers = monstersOf(s, p).filter(u => !doomed(u)).map(u => {
    const c = s.cards[u];
    // 戦闘では破壊されないモンスターは倒せない（攻撃しない）
    if (c.faceUp && scriptOf(s, u).battleIndestructible) return { u, atkPos: false, v: Infinity };
    if (!c.faceUp) return { u, atkPos: false, v: viewer === p ? (defOf(s, u).def ?? 0) : 1500 };
    const st = currentStats(s, u);
    return c.position === 'atk' ? { u, atkPos: true, v: st.atk } : { u, atkPos: false, v: st.def };
  });
  let damage = 0;
  const lost           = [];
  for (const atk of attackers) {
    if (!blockers.length) { damage += atk; continue; }
    // 倒せる中で一番強いモンスターを狙う
    let pick = -1;
    blockers.forEach((b, i) => { if (atk > b.v && (pick < 0 || b.v > blockers[pick].v)) pick = i; });
    if (pick < 0) continue; // 倒せる相手がいないので攻撃しない
    const b = blockers[pick];
    if (b.atkPos) damage += atk - b.v;
    lost.push(b.u);
    blockers.splice(pick, 1);
  }
  return { damage, lost };
}

/** エンドフェイズに自分以外のモンスターを全て破壊するカード（ユベル－Das Abscheulich Ritter など）。表側で効果が無効になっていないもの */
function endWipers(s           )           {
  return [...monstersOf(s, 0), ...monstersOf(s, 1)].filter(u => isFaceUpMonster(s, u) && scriptOf(s, u).endWipe && !monsterNegated(s, u));
}

/** 相手の次のバトルで受ける損害の見積もり（LPの減少と、倒されるモンスターの価値） */
function exposure(s           , p          , viewer          , w         )         {
  const { damage, lost } = battleThreat(s, p, viewer);
  if (!damage && !lost.length) return 0;
  const lp = s.players[p].lp;
  if (damage >= lp) return w.lethal; // 盤面だけで負ける
  const lpLoss = 8000 * (Math.exp(-(lp - damage) / w.lpScale) - Math.exp(-lp / w.lpScale));
  const monLoss = lost.reduce((a, u) => a + cardValueOnField(s, u, viewer, w), 0);
  return w.threatW * (lpLoss + monLoss);
}

/** viewer から見た盤面の点数 */
export function evaluate(s           , viewer          , weights                   = {})         {
  const w = { ...DEFAULT_WEIGHTS, ...weights };
  return evalW(s, viewer, w);
}
function evalW(s           , viewer          , w         )         {
  if (s.winner !== null) return s.winner === viewer ? WIN : -WIN;
  let score = 0;
  // エンドフェイズに自分以外のモンスターを全て破壊するカード：それ以外のモンスターは、もうすぐ消えるので価値を割り引く
  const wipers = endWipers(s);
  for (const p of [0, 1]              ) {
    const sign = p === viewer ? 1 : -1;
    const pl = s.players[p];
    let v = 8000 * (1 - Math.exp(-pl.lp / w.lpScale));
    for (const u of monstersOf(s, p)) v += cardValueOnField(s, u, viewer, w) * (wipers.some(x => x !== u) ? w.doomed : 1);
    for (const u of spellTrapsOf(s, p)) v += cardValueOnField(s, u, viewer, w);
    v += p === viewer ? pl.hand.reduce((a, u) => a + handCardValue(s, u, w), 0) : pl.hand.length * w.oppHand;
    for (const u of pl.gy) {
      const d = defOf(s, u);
      if (d.kind === 'monster' && d.frame === 'normal') v += w.gyNormal;
      if (d.kind === 'monster' && s.cards[u].proper) v += w.gyProper;
    }
    if (pl.deck.length < 4) v -= (4 - pl.deck.length) * 600;
    v -= exposure(s, p, viewer, w);
    score += sign * v;
  }
  return score;
}

/* ===================== 候補の列挙 ===================== */
function combos   (arr     , k        , cap        )        {
  const res        = [];
  const rec = (start        , cur     ) => {
    if (res.length >= cap) return;
    if (cur.length === k) { res.push([...cur]); return; }
    for (let i = start; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1, cur); cur.pop(); }
  };
  rec(0, []);
  return res;
}

/** 選択に対する有効な答えの候補 */
export function answerCandidates(s           , r               , cap = 40)            {
  if (r.kind === 'yesno') return [true, false];
  if (r.kind === 'option') return r.options.map((_, i) => i);
  const out            = [];
  for (let k = r.min; k <= Math.min(r.max, r.options.length) && out.length < cap; k++) {
    for (const v of combos(r.options, k, cap * 4)) {
      if (!validateAnswer(s, r, v)) out.push(v);
      if (out.length >= cap) break;
    }
  }
  // 部分和の条件（儀式召喚など）で上の範囲に答えが無い場合は総当たり
  if (!out.length) {
    const n = Math.min(r.options.length, 16);
    for (let mask = 1; mask < 1 << n && out.length < cap; mask++) {
      const v = r.options.filter((_, i) => mask & (1 << i));
      if (!validateAnswer(s, r, v)) out.push(v);
    }
  }
  return out;
}

const isFreeDecision = (s           ) => !s.pending && s.window.kind === 'open' && s.chain.length === 0;

/* ===================== 先読み ===================== */
class Thinker {
  w         ;
  me          ;
  full         ;
  constructor(w         , me          , full = false) { this.w = w; this.me = me; this.full = full; }

  score(s           , viewer           = this.me)         { return evalW(s, viewer, this.w); }

  /** 状態を、次に誰かが自由に行動できる場面かターンが変わるところまで進める */
  rollout(s           , me          , depth        , turn        )            {
    for (let i = 0; i < 80; i++) {
      if (s.winner !== null || s.turn !== turn || isFreeDecision(s)) return s;
      try {
        if (s.pending) {
          const r = s.pending.request;
          s = applyAction(s, { type: 'answer', value: r.player === me && depth > 0 ? this.bestAnswer(s, me, depth - 1) : defaultAnswer(s, r) });
        } else {
          const w = s.window;
          s = applyAction(s, depth >= 0 && w.kind === 'priority' && w.player !== me ? this.opponentReply(s, w.player) : { type: 'pass' });
        }
      } catch {
        return s;
      }
    }
    return s;
  }

  /** 先読みの中の相手の応答：表側のフィールドのカードの効果を使うと良くなるなら使う */
  opponentReply(s           , p          )         {
    const pub = legalActions(s).filter(a => a.type === 'activate' && (this.full || (isOnField(s.cards[a.card]) && s.cards[a.card].faceUp)));
    if (!pub.length) return { type: 'pass' };
    const t = (a        ) => { try { return this.score(this.rollout(applyAction(s, a), p, -1, s.turn), p); } catch { return -Infinity; } };
    let best         = { type: 'pass' }, bestScore = t(best) + this.w.margin;
    for (const a of pub) { const sc = t(a); if (sc > bestScore) { bestScore = sc; best = a; } }
    return best;
  }

  /**
   * メインフェイズ1の候補を、その後のバトルフェイズまで見て評価する。
   * バトルでは相手は表側のカードの効果しか使わない（伏せカードは見えない）ので楽観的になる。そのため静的な点数と半々で混ぜる
   */
  withBattlePreview(s           , turn        )         {
    const stat = this.score(s);
    if (s.winner !== null || s.turn !== turn || !isFreeDecision(s) || s.phase !== 'main1' || s.turnPlayer !== this.me) return stat;
    let b           ;
    try { b = this.rollout(applyAction(s, { type: 'nextPhase', to: 'battle' }), this.me, 0, turn); } catch { return stat; }
    for (let i = 0; i < 6 && b.winner === null && b.turn === turn && isFreeDecision(b) && b.phase === 'battle'; i++) {
      const atks = legalActions(b).filter(a => a.type === 'attack');
      let best                   = null, bestScore = this.score(b);
      for (const a of atks) {
        let n           ;
        try { n = this.rollout(applyAction(b, a), this.me, 0, turn); } catch { continue; }
        const sc = this.score(n);
        if (sc > bestScore) { bestScore = sc; best = n; }
      }
      if (!best) break;
      b = best;
    }
    return this.w.previewMix * this.score(b) + (1 - this.w.previewMix) * stat;
  }

  /**
   * メインフェイズで、この後に続けて行う行動まで見る（「召喚師のスキルで手札に加えて、古のルールで特殊召喚」のような2手以上の流れ）。
   * 1手ずつ最も良くなる行動を選び、良くならなくなるか steps 手で止めて、その盤面の点数を返す
   */
  continuePlan(s           , turn        , steps        , depth        )         {
    let cur = s, curScore = this.score(s);
    for (let i = 0; i < steps; i++) {
      if (cur.winner !== null || cur.turn !== turn || !isFreeDecision(cur) || cur.turnPlayer !== this.me || (cur.phase !== 'main1' && cur.phase !== 'main2')) break;
      let best                   = null, bestScore = curScore + this.w.margin;
      for (const a of legalActions(cur)) {
        if (a.type === 'nextPhase' || a.type === 'endTurn') continue;
        let n           ;
        try { n = this.rollout(applyAction(cur, a), this.me, depth, turn); } catch { continue; }
        const sc = this.score(n);
        if (sc > bestScore) { bestScore = sc; best = n; }
      }
      if (!best) break;
      cur = best; curScore = bestScore;
    }
    return curScore;
  }

  bestAnswer(s           , me          , depth        )          {
    const cands = answerCandidates(s, s.pending .request);
    let best = cands[0], bestScore = -Infinity;
    for (const v of cands) {
      let next           ;
      try { next = applyAction(s, { type: 'answer', value: v }); } catch { continue; }
      const sc = this.score(this.rollout(next, me, depth, s.turn), me);
      if (sc > bestScore) { bestScore = sc; best = v; }
    }
    return best;
  }
}

function defaultAnswer(s           , r               )          {
  if (r.kind === 'yesno') return true;
  if (r.kind === 'option') return 0;
  return answerCandidates(s, r, 1)[0] ?? r.options.slice(0, r.min);
}

/* ===================== 判断 ===================== */
function phaseAdvance(s           , acts          )                {
  const has = (to        ) => acts.find(a => a.type === 'nextPhase' && a.to === to) ?? null;
  const p = s.turnPlayer;
  if (s.phase === 'main1') return (monstersOf(s, p).some(u => canAttack(s, u)) ? has('battle') : null) ?? has('end');
  if (s.phase === 'battle') return has('main2') ?? has('end');
  if (s.phase === 'main2') return has('end');
  return acts.find(a => a.type === 'endTurn') ?? null;
}

/** 候補と点数。base：何もしない（パス・フェイズを進める）場合の行動。点数は先読み後の盤面の点数 */
                                                                            
                                                                                  

/** 今の手番の候補を全て点数にする（選択待ちなら答えの候補） */
export function scoreCandidates(s           , opt             = {})            {
  const me = actorOf(s);
  const depth = opt.depth ?? 1;
  const T = new Thinker({ ...DEFAULT_WEIGHTS, ...opt.weights }, me, !!opt.fullOpponent);
  const margin = T.w.margin;
  if (s.pending) {
    const list           = [];
    for (const v of answerCandidates(s, s.pending.request)) {
      try { const after = T.rollout(applyAction(s, { type: 'answer', value: v }), me, depth, s.turn); list.push({ action: { type: 'answer', value: v }, score: T.score(after, me), after }); } catch { /* 選べない答え */ }
    }
    return { list, base: null, margin: 0 };
  }

  const acts = legalActions(s);
  if (!acts.length) throw new Error('行動がありません');
  const turn = s.turn;
  const one = (a        )         => {
    try { const after = T.rollout(applyAction(s, a), me, depth, turn); return { action: a, score: T.score(after), after }; } catch { return { action: a, score: -Infinity }; }
  };

  if (s.window.kind === 'priority') {
    const list = acts.filter(a => a.type !== 'pass').map(one);
    return { list, base: one({ type: 'pass' }), margin };
  }

  const advance = phaseAdvance(s, acts);
  const preview = T.w.previewMix > 0 && s.phase === 'main1' && s.turn > 1;
  const plan = (s.phase === 'main1' || s.phase === 'main2') ? (opt.planSteps ?? 3) : 0;
  const scoreMain = (a        )         => {
    if (a.type === 'nextPhase') return one(a);
    try {
      const n = T.rollout(applyAction(s, a), me, depth, turn);
      const score = preview ? T.withBattlePreview(n, turn) : plan > 0 ? T.continuePlan(n, turn, plan, depth) : T.score(n);
      return { action: a, score, after: n };
    } catch { return { action: a, score: -Infinity }; }
  };
  // フェイズを進める行動も、同じ物差し（バトルの結果込み）で比べる
  const base                = advance ? (preview && advance.type === 'nextPhase' && advance.to === 'battle' ? { action: advance, score: T.withBattlePreview(s, turn) } : one(advance)) : null;
  let plays = acts.filter(a => a.type !== 'nextPhase' && a.type !== 'endTurn');
  // バトルフェイズに入る前は、罠・魔法のセットを後回しにする（バトルの結果を見てからメインフェイズ2でセットする）
  if (s.phase === 'main1' && advance?.type === 'nextPhase' && advance.to === 'battle') plays = plays.filter(a => a.type !== 'setSpellTrap');
  plays = plays.slice(0, opt.maxCandidates ?? 60);
  return { list: plays.map(scoreMain), base: base ?? (acts[0] ? { action: acts[0], score: -Infinity } : null), margin };
}

/** 点数の一番高い行動（何もしない行動は margin だけ有利に扱う） */
export function pickBest(set           )         {
  let best = set.base, bestScore = set.base ? set.base.score + set.margin : -Infinity;
  for (const c of set.list) if (c.score > bestScore) { bestScore = c.score; best = c; }
  if (!best) throw new Error('行動がありません');
  return best.action;
}

/** 今の手番で CPU が取る行動（選択待ちなら答え） */
export function cpuDecide(s           , opt             = {})         {
  const set = scoreCandidates(s, opt);
  if (s.pending) {
    let best = set.list[0], bs = -Infinity;
    for (const c of set.list) if (c.score > bs) { bs = c.score; best = c; }
    return best ? best.action : { type: 'answer', value: defaultAnswer(s, s.pending.request) };
  }
  return pickBest(set);
}

/** 自由に行動できる場面での各候補の点数（調査用） */
export function explainScores(s           , opt             = {})                     {
  const me = actorOf(s);
  const T = new Thinker({ ...DEFAULT_WEIGHTS, ...opt.weights }, me);
  return legalActions(s).map(a => {
    try { return [a, T.score(T.rollout(applyAction(s, a), me, opt.depth ?? 1, s.turn))]                    ; } catch { return [a, -Infinity]                    ; }
  });
}

export function cpuIsActor(s           , cpu          )          {
  return s.winner === null && actorOf(s) === cpu;
}
