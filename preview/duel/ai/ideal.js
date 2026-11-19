// 理想のCPU（docs/ideal-cpu-spec.md）
// 1. 見えないカード（相手の手札・伏せカード・デッキ、自分のデッキの順番）を、デッキリストからまだ見えていないカードで埋めた「ありえる世界」を何通りも作る
// 2. それぞれの世界で、相手も手札・伏せカードを使って最善を尽くす前提で各候補を先読みし、盤面の点数を勝率に直して平均する
// 3. 勝率が一番高い手を選ぶ。ただし、切り札を出す手・一気に大ダメージを与える手が最善手から10%以内なら、そちら（ロマン）を選ぶ
import { actorOf, defOf, scriptOf, monstersOf, fieldCards, opp, isOnField, poolDef } from '../engine/game.js';
import { cloneState } from '../engine/types.js';
                                                                      
import { scoreCandidates, cpuDecide, evaluate,                                            } from './cpu.js';
import { DECK_WEIGHTS } from './deck-weights.js';
import { applyAction, WORK, legalActions, currentStats } from '../engine/game.js';

                               
                           
                   
                           
                                    
                        
                        
                 
                       
                        
                                         
                               
                               
                       
                                                         
                  
                                                            
                 
                   
                      
                         
                              
                                     
                          
                                   
               
                                             
                         
                   
 

                                          
                          
                 
                          
                  
                    
                   
                              
                       
                  
                  
                    
 

const DEF = { samples: 6, criticalSamples: 10, romanceWidth: 0.10, scale: 3000 };

/* ===================== ありえる世界を作る ===================== */
function shuffle   (a     , rnd              )      {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** me から見えないカードを、見えていないカードで埋め直した状態 */
export function determinize(s           , me          , rnd               = Math.random)            {
  const o = opp(me);
  const map = new Map                ();
  // 相手：手札（知られていないもの）・デッキ・裏側のフィールドのカードのカード名は、まとめて入れ替えてよい
  const P = s.players[o];
  const hidden = (u        ) => !s.cards[u].pub;
  const hand = P.hand.filter(hidden);
  const fdMon = P.mzone.filter((u)              => u !== null && !s.cards[u].faceUp && hidden(u));
  const fdST = P.szone.filter((u)              => u !== null && !s.cards[u].faceUp && hidden(u) && s.cards[u].equippedTo === null);
  const fdField = P.fzone !== null && !s.cards[P.fzone].faceUp && hidden(P.fzone) ? [P.fzone] : [];
  const deck = [...P.deck];
  const pool = shuffle([...hand, ...fdMon, ...fdST, ...fdField, ...deck].map(u => s.cards[u].code), rnd);
  const take = (ok                           )                => {
    const i = pool.findIndex(ok);
    return i < 0 ? null : pool.splice(i, 1)[0];
  };
  const d = (code        ) => poolDef(code) ?? { kind: 'monster'         , frame: 'normal'         , subtype: undefined };
  for (const u of fdMon) { const c = take(x => d(x).kind === 'monster' && d(x).frame !== 'fusion'); if (c) map.set(u, c); }
  for (const u of fdST) { const c = take(x => d(x).kind !== 'monster' && d(x).subtype !== 'フィールド'); if (c) map.set(u, c); }
  for (const u of fdField) { const c = take(x => d(x).kind === 'spell' && d(x).subtype === 'フィールド'); if (c) map.set(u, c); }
  for (const u of [...hand, ...deck]) { const c = pool.shift(); if (c) map.set(u, c); }
  // 決まらなかったカード（種類の合うカードが無い）は元のまま
  const t = cloneState(s);
  apply(t, map);
  // 自分のデッキの順番も分からない
  const myDeck = shuffle([...t.players[me].deck], rnd);
  setDeckOrder(t, me, myDeck);
  return t;
}
function apply(t           , map                     )       {
  for (const [u, code] of map) t.cards[u].code = code;
  if (t.pending) apply(t.pending.base, map);
}
function setDeckOrder(t           , p          , order          )       {
  t.players[p].deck = order;
  order.forEach((u, i) => { t.cards[u].index = i; });
  if (t.pending) setDeckOrder(t.pending.base, p, [...order]);
}

/* ===================== 切り札（自動判定） ===================== */
const norm = (x        ) => x.replace(/[・\-－　 ]/g, '');
const aceCache = new Map                     ();
/** p のデッキの切り札（カードの code）：融合・儀式／デッキ名に入っている名前／神・召喚条件のあるモンスター／一番打点の高いモンスター */
export function acesOf(s           , p          , deckName = '')              {
  const mine = Object.values(s.cards).filter(c => c.owner === p && !c.code.startsWith('token:'));
  const key = p + ':' + deckName + ':' + mine.map(c => c.code).sort().join(',');
  const hit = aceCache.get(key);
  if (hit) return hit;
  const res = new Set        ();
  let top = -1, topCodes           = [];
  const words = norm(deckName.replace(/デッキ/g, '')).match(/[ァ-ヶー]{3,}|[A-Za-z]{2,}|[一-龠]{2,}/g) ?? [];
  for (const c of mine) {
    const d = defOf(s, c.uid);
    if (d.kind !== 'monster') continue;
    const sc = scriptOf(s, c.uid);
    if (d.frame === 'fusion' || d.frame === 'ritual') res.add(c.code);
    if (sc.cannotNormalSummon || sc.procSummon || sc.specialSummonOk) res.add(c.code);
    if (words.some(w => norm(d.name).includes(w))) res.add(c.code);
    const atk = d.atk ?? 0;
    if (atk > top) { top = atk; topCodes = [c.code]; } else if (atk === top) topCodes.push(c.code);
  }
  for (const c of topCodes) res.add(c);
  aceCache.set(key, res);
  return res;
}

/* ===================== 判断 ===================== */
const keyOf = (a        ) => JSON.stringify(a);
const prob = (score        , scale        ) => (score >= 1e5 ? 1 : score <= -1e5 ? 0 : 1 / (1 + Math.exp(-score / scale)));

/** 勝負所か（候補が多い・このターンに決着がつきうる・自分が負けそう） */
function isCritical(s           , me          , nCands        )          {
  if (nCands >= 8) return true;
  const o = opp(me);
  const atk = (p          ) => monstersOf(s, p).reduce((a, u) => a + (s.cards[u].faceUp && s.cards[u].position === 'atk' ? (defOf(s, u).atk ?? 0) : 0), 0);
  return atk(me) >= s.players[o].lp || atk(o) >= s.players[me].lp;
}

/** ロマンの手か：その手で切り札が自分のフィールドに表側で出る（ace）、または一気に大ダメージ（burst） */
function romanceOf(before           , after                       , me          , aces             )                                             {
  if (!after) return null;
  const o = opp(me);
  const was = new Set(monstersOf(before, me).filter(u => before.cards[u].faceUp).map(u => `${u}:${before.cards[u].serial}`));
  for (const u of monstersOf(after, me)) {
    const c = after.cards[u];
    if (c.faceUp && aces.has(c.code) && !was.has(`${u}:${c.serial}`)) return { kind: 'ace', ace: u };
  }
  const dmg = before.players[o].lp - after.players[o].lp;
  const lost = fieldCards(before, o).filter(u => !isOnField(after.cards[u]) || after.cards[u].serial !== before.cards[u].serial).length;
  if (dmg >= 2000 || lost >= 2) return { kind: 'burst' };
  return null;
}

                                                                                                                   

/** 理想のCPUの考え（行動と勝率の見積もり） */
export function idealThink(s           , opt               = {}, deckNames                   = ['', ''])          {
  const o = { ...DEF, ...opt };
  const rnd = opt.random ?? Math.random;
  const me = actorOf(s);
  const free = !s.pending && s.window.kind === 'open' && s.chain.length === 0 && s.turnPlayer === me;
  const aces = acesOf(s, me, deckNames[me]);
  const dw = (p          )                               => (opt.deckCodes ? DECK_WEIGHTS[opt.deckCodes[p]] : undefined);
  const cpuOpt             = { ...opt.cpu, weights: { ...dw(me), ...opt.cpu?.weights } };
  const wts                                                               = [dw(0), dw(1)];

  // 1つ目の世界で候補の数を見て、勝負所かどうかを決める
  const w0start = WORK.n;
  const w0 = (opt.noDeterminize ? s : determinize(s, me, rnd));
  const first = scoreCandidates(w0, { ...cpuOpt, fullOpponent: opt.fullOpponent ?? true });
  const critical = isCritical(s, me, first.list.length);
  // 処理の量の上限：普段 1500回・勝負所 5000回（PCで約2秒・約6秒。遅い端末では時間が延びるが、考える量は同じ）
  const budget = opt.budget ?? (critical ? 5000 : 1500);
  // 1つの世界にかかった量から、上限の半分に収まる世界の数にする（残りの半分は深い先読みに使う）
  const per = Math.max(1, WORK.n - w0start);
  const N = Math.max(1, Math.min(critical ? o.criticalSamples : o.samples, Math.floor(budget / 2 / per)));

  const acc = new Map             ();
  const add = (sc        , base         , margin        , world           ) => {
    if (sc.score === -Infinity) return;
    const k = keyOf(sc.action);
    const a = acc.get(k) ?? acc.set(k, { action: sc.action, p: 0, n: 0, romance: 0, burst: 0, base }).get(k) ;
    a.p += prob(sc.score + (base ? margin : 0), o.scale); a.n++;
    if (free) {
      const r = romanceOf(world, sc.after, me, aces);
      if (r?.kind === 'ace') { a.romance++; a.ace ??= r.ace; }
      if (r?.kind === 'burst') a.burst++;
    }
  };
  const run = (set                                    , world           ) => {
    for (const c of set.list) add(c, false, 0, world);
    if (set.base) add(set.base, true, set.margin, world);
  };
  run(first, w0);
  for (let i = 1; i < N; i++) {
    const w = (opt.noDeterminize ? s : determinize(s, me, rnd));
    run(scoreCandidates(w, { ...cpuOpt, fullOpponent: opt.fullOpponent ?? true }), w);
  }

  const all = [...acc.values()].filter(a => a.n > 0).map(a => ({ ...a, rate: a.p / a.n }));
  // 点数が数にならない候補（計算のおかしな世界）は除く。全部だめなら最初の候補
  const list = all.filter(a => Number.isFinite(a.rate)).length ? all.filter(a => Number.isFinite(a.rate)) : all.map(a => ({ ...a, rate: 0.5 }));
  if (!list.length) throw new Error('行動がありません');
  // 深い先読み：有望な候補（と、ロマンの候補）だけ、相手の次のターンの終わりまで指してみて勝率を出し直す
  const K = critical ? (opt.criticalDeepK ?? 4) : (opt.deepK ?? 3), DW = critical ? (opt.criticalDeepWorlds ?? 5) : (opt.deepWorlds ?? 3);
  if (free && K > 0 && DW > 0 && list.length > 1) {
    const sorted = [...list].sort((x, y) => y.rate - x.rate);
    const top = sorted[0].rate;
    const deep = new Set([...sorted.slice(0, K), ...sorted.filter(a => a.rate >= top - o.romanceWidth && (a.romance + a.burst) * 2 > a.n).slice(0, 2), ...sorted.filter(a => a.base)]);
    const sum = new Map                                               ();
    for (let i = 0; i < DW && WORK.n - w0start < budget; i++) {
      const w = opt.noDeterminize ? s : determinize(s, me, rnd);
      for (const c of deep) {
        if (WORK.n - w0start >= budget && i > 0) break;
        let n           ;
        try { n = applyAction(w, c.action); } catch { continue; }
        const fin = playout(n, s.turn, wts);
        const r = sum.get(c) ?? sum.set(c, { p: 0, n: 0 }).get(c) ;
        r.p += prob(evaluate(fin, me, cpuOpt.weights) + (c.base ? first.margin : 0), o.scale); r.n++;
      }
    }
    // 深い先読みの勝率と、浅い先読みの勝率を混ぜる（deepMix：深い方の割合）
    const mix = opt.deepMix ?? 1;
    for (const c of list) { const r = sum.get(c); c.rate = r && r.n ? mix * (r.p / r.n) + (1 - mix) * c.rate : -1; }
  }
  // リーサル：このターンに勝てる手順を総当たりで探す。見つかった最初の手は、その世界の割合だけ勝てるとみなす
  if (free && (s.phase === 'main1' || s.phase === 'battle') && lethalPossible(s, me)) {
    const LW = critical ? 3 : 2;
    const found = new Map                ();
    for (let i = 0; i < LW; i++) {
      const w = opt.noDeterminize ? s : determinize(s, me, rnd);
      const left = Math.max(150, Math.floor((budget * 1.5 - (WORK.n - w0start)) / (LW - i)));
      const a = findLethal(w, me, Math.min(opt.lethalNodes ?? 600, left));
      if (a) found.set(keyOf(a), (found.get(keyOf(a)) ?? 0) + 1);
    }
    for (const c of list) { const n = found.get(keyOf(c.action)); if (n) c.rate = Math.max(c.rate, n / LW); }
    for (const [k, n] of found) if (!list.some(c => keyOf(c.action) === k)) list.push({ action: JSON.parse(k), p: 0, n: 1, romance: 0, burst: 0, base: false, rate: n / LW });
  }
  const bestRate = Math.max(...list.map(a => a.rate));
  // 勝率がほぼ同じ手（差 tie 未満）からランダムに選ぶ
  const near = list.filter(a => a.rate >= bestRate - (opt.tie ?? 1e-9));
  let pick = near[Math.floor(rnd() * near.length)];
  let romance                     = null;
  if (free) {
    const rom = list.filter(a => a.rate >= bestRate - o.romanceWidth && (a.romance + a.burst) * 2 > a.n);
    if (rom.length) {
      const r = rom.reduce((x, y) => (y.rate > x.rate ? y : x));
      pick = r;
      romance = r.romance >= r.burst ? 'ace' : 'burst';
    }
  }
  return { action: pick.action, winRate: pick.rate, bestRate, romance, aceUid: romance === 'ace' ? pick.ace : undefined, samples: N, critical };
}

/** このターンに相手のLPを0にできる見込みがあるか（総当たりする前の大まかな判定） */
function lethalPossible(s           , me          )          {
  const o = opp(me);
  const onField = monstersOf(s, me).filter(u => s.cards[u].faceUp && s.cards[u].position === 'atk').reduce((a, u) => a + currentStats(s, u).atk, 0);
  const inHand = s.players[me].hand.reduce((a, u) => Math.max(a, defOf(s, u).kind === 'monster' ? (defOf(s, u).atk ?? 0) : 0), 0);
  return s.players[o].lp <= (onField + inHand) * 1.5 + 1000;
}
/** このターンに勝てる手順の最初の手（見つからなければ null）。自分の行動を順に試し、選択や相手の応答は速い判断で進める */
function findLethal(s0           , me          , nodeLimit        )                {
  const turn = s0.turn, start = WORK.n;
  const settle = (s           )            => {
    for (let i = 0; i < 60 && s.winner === null && s.turn === turn; i++) {
      const free = !s.pending && s.window.kind === 'open' && s.chain.length === 0 && s.turnPlayer === me && actorOf(s) === me;
      if (free) return s;
      try { s = applyAction(s, cpuDecide(s, { depth: 0, planSteps: 0 })); } catch { return s; }
    }
    return s;
  };
  const dfs = (s           , depth        )          => {
    if (s.winner === me) return true;
    if (s.winner !== null || s.turn !== turn || depth <= 0 || WORK.n - start > nodeLimit) return false;
    let acts = legalActions(s).filter(a => a.type !== 'endTurn' && !(a.type === 'nextPhase' && a.to !== 'battle') && a.type !== 'setSpellTrap' && a.type !== 'setMonster');
    // 攻撃を先に試す（決着に近い）
    acts = [...acts.filter(a => a.type === 'attack'), ...acts.filter(a => a.type !== 'attack')];
    for (const a of acts) {
      let n           ;
      try { n = settle(applyAction(s, a)); } catch { continue; }
      if (dfs(n, depth - 1)) return true;
      if (WORK.n - start > nodeLimit) return false;
    }
    return false;
  };
  const s = settle(s0);
  if (s !== s0 && s.winner === me) return null;
  let acts = legalActions(s).filter(a => a.type !== 'endTurn' && !(a.type === 'nextPhase' && a.to !== 'battle'));
  acts = [...acts.filter(a => a.type === 'attack'), ...acts.filter(a => a.type !== 'attack')];
  for (const a of acts) {
    let n           ;
    try { n = settle(applyAction(s, a)); } catch { continue; }
    if (dfs(n, 6)) return a;
    if (WORK.n - start > nodeLimit) break;
  }
  return null;
}

/** 相手の次のターンが終わる（自分の次のターンが始まる）まで、お互いに速い判断で指し進める */
function playout(s           , startTurn        , wts                                                               = [undefined, undefined])            {
  for (let i = 0; i < 400 && s.winner === null && s.turn < startTurn + 2; i++) {
    try { s = applyAction(s, cpuDecide(s, { depth: 0, planSteps: 0, weights: wts[actorOf(s)] })); } catch { break; }
    s.log = []; s.anim = [];
  }
  return s;
}

/** 行動だけ欲しい時 */
export function idealDecide(s           , opt               = {}, deckNames                   = ['', ''])         {
  return idealThink(s, opt, deckNames).action;
}
