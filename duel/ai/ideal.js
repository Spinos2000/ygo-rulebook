// 理想のCPU（docs/ideal-cpu-spec.md）
// 1. 見えないカード（相手の手札・伏せカード・デッキ、自分のデッキの順番）を、デッキリストからまだ見えていないカードで埋めた「ありえる世界」を何通りも作る
// 2. それぞれの世界で、相手も手札・伏せカードを使って最善を尽くす前提で各候補を先読みし、盤面の点数を勝率に直して平均する
// 3. 勝率が一番高い手を選ぶ。ただし、切り札を出す手・一気に大ダメージを与える手が最善手から10%以内なら、そちら（ロマン）を選ぶ
import { actorOf, defOf, scriptOf, monstersOf, fieldCards, opp, isOnField, poolDef } from '../engine/game.js?v=20261126-1250-a6f77c141d';
import { cloneState } from '../engine/types.js?v=20261126-1250-a6f77c141d';
                                                                      
import { scoreCandidates, cpuDecide, evaluate, answerCandidates,                                            } from './cpu.js?v=20261126-1250-a6f77c141d';
import { DECK_WEIGHTS } from './deck-weights.js?v=20261126-1250-a6f77c141d';
import { DECKS } from '../data/decks.js?v=20261126-1250-a6f77c141d';
import { applyAction, WORK, legalActions, currentStats } from '../engine/game.js?v=20261126-1250-a6f77c141d';

                               
                           
                   
                           
                                    
                        
                        
                 
                       
                        
                                         
                               
                               
                       
                                                         
                  
                                         
                       
                                                                       
                               
                                                            
                 
                   
                                                                    
                       
                                                           
                      
                                                                                              
                                              
                                                                              
                                                         
                                               
                
                      
                         
                              
                                     
                          
                                   
               
                                             
                         
                   
 

                                          
                          
                 
                          
                  
                    
                   
                              
                       
                  
                  
                    
                            
                                            
 

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
  // デッキの他のカードのテキストに名前が出てくる回数（「ブラック・マジシャン」を参照するカードが多ければ、そのデッキの顔）
  const texts = [...new Set(mine.map(c => c.code))].filter(code => poolDef(code)?.frame !== 'fusion').map(code => ({ code, text: poolDef(code)?.text ?? '' }));
  const refs = (code        ) => { const n = poolDef(code)?.name ?? ''; return texts.filter(x => x.code !== code && x.text.includes(`「${n}」`)).length; };
  for (const c of mine) {
    const d = defOf(s, c.uid);
    if (d.kind !== 'monster') continue;
    const sc = scriptOf(s, c.uid), lv = d.level ?? 0;
    if (d.frame === 'fusion' || d.frame === 'ritual') res.add(c.code);
    if (lv >= 5 && (sc.cannotNormalSummon || sc.procSummon || sc.specialSummonOk)) res.add(c.code);
    if (lv >= 7 && words.some(w => norm(d.name).includes(w))) res.add(c.code);
    if (lv >= 5 && refs(c.code) >= 2) res.add(c.code);
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

/** その手で、攻撃力0のモンスターが自分のフィールドに表側攻撃表示で新しく出るか（早すぎた埋葬で千眼の邪教神 など。相手の攻撃でそのままダメージを受ける） */
function zeroAtkOut(before           , after                       , me          )          {
  if (!after) return false;
  // 発動した直後（対象を選ぶ途中・チェーンの処理前）なら、速い判断で処理が終わるまで進めてから見る
  for (let i = 0; i < 20 && after.winner === null && (after.pending || after.chain.length > 0 || after.window.kind !== 'open'); i++) {
    try { after = applyAction(after, cpuDecide(after, { depth: 0, planSteps: 0 })); } catch { break; }
  }
  const was = new Set(monstersOf(before, me).filter(u => before.cards[u].faceUp && before.cards[u].position === 'atk').map(u => `${u}:${before.cards[u].serial}`));
  return monstersOf(after, me).some(u => {
    const c = after .cards[u];
    return c.faceUp && c.position === 'atk' && !was.has(`${u}:${c.serial}`) && currentStats(after , u).atk === 0;
  });
}

/**
 * リリースしたモンスターより攻撃力の低いモンスターを、攻撃表示でアドバンス召喚する手か（MIMIの報告：攻撃力1000のドゥームガイをリリースして
 * 攻撃力800のディアボリックガイを攻撃表示で出し、次のターンに殴られた）。攻撃力0を攻撃表示で出す手と同じく「ほかに手が無い時だけ」にする
 */
function weakTribute(s           , a        )          {
  // ユベルのように「エンドフェイズにほかのモンスター1体をリリースするか、このカードを破壊」のモンスターを、ほかのモンスターが残らない形で出す手
  // （リリースした分を失って、エンドフェイズに自分も壊れる。MIMIの報告：ライラとメタモルポットをリリースしてユベルを出し、場が空になって負け）
  if ((a.type === 'normalSummon' || a.type === 'setMonster') && (scriptOf(s, a.card).effects ?? []).some(e => (e.label ?? '').includes('リリースするか、このカードを破壊'))) {
    const me = s.cards[a.card].controller ?? s.cards[a.card].owner;
    if (!monstersOf(s, me).some(u => !a.tributes.includes(u))) return true;
  }
  if (a.type !== 'normalSummon' || !a.tributes.length) return false;
  const best = Math.max(...a.tributes.map(u => (s.cards[u] && isOnField(s.cards[u]) ? currentStats(s, u).atk : 0)));
  return (defOf(s, a.card).atk ?? 0) < best;
}

                                                                                                                                                

/** 理想のCPUの考え（行動と勝率の見積もり） */
/** 手札に加える答えが、今の手札とどれだけ組み合わさるか（大きいほど良い）。手札に加える選択でなければ0
 * - 儀式モンスターが手札にあって儀式魔法が無い時の儀式魔法、その逆：+2
 * - 同じ名前のカードがもう手札にある：-1（組み合わさる相手がそろっていない時の2枚目は使いにくい） */
export function handFit(s           , me          , a        )         {
  const r = s.pending?.request;
  if (a.type !== 'answer' || !r || r.kind !== 'cards' || r.player !== me || !r.prompt.includes('手札に加える') || !Array.isArray(a.value)) return 0;
  const hand = s.players[me].hand.map(u => defOf(s, u));
  const ritualSpell = (d                          ) => d.kind === 'spell' && d.subtype === '儀式';
  const ritualMon = (d                          ) => d.kind === 'monster' && d.frame === 'ritual';
  const hasSpell = hand.some(ritualSpell), hasMon = hand.some(ritualMon);
  let v = 0;
  for (const u of a.value            ) {
    const d = defOf(s, u);
    if (ritualSpell(d) && hasMon && !hasSpell) v += 2;
    if (ritualMon(d) && hasSpell && !hasMon) v += 2;
    if (hand.some(h => h.name === d.name)) v -= 1;
  }
  return v;
}

export function idealThink(s           , opt               = {}, deckNames                   = ['', ''])          {
  const o = { ...DEF, ...opt };
  const rnd = opt.random ?? Math.random;
  const me = actorOf(s);
  const free = !s.pending && s.window.kind === 'open' && s.chain.length === 0 && s.turnPlayer === me;
  // 切り札：MASTERのチェック表（デッキの aces）があればそれを使い、無いデッキだけ自動判定（src/ai/aces.ts と同じ決め方）
  const table = (opt.deckCodes ? DECKS[opt.deckCodes[me]] : Object.values(DECKS).find(d => d.name === deckNames[me]))?.aces;
  const aces = table ? new Set(Object.entries(table).filter(([, k]) => k.length > 0).map(([code]) => code)) : acesOf(s, me, deckNames[me]);
  const dw = (p          )                               => (opt.deckCodes ? DECK_WEIGHTS[opt.deckCodes[p]] : undefined);
  const cpuOpt             = { ...opt.cpu, weights: { ...dw(me), ...opt.cpu?.weights } };
  const wts                                                               = [dw(0), dw(1)];

  // 1つ目の世界で候補の数を見て、勝負所かどうかを決める
  const w0start = WORK.n;
  const w0 = (opt.noDeterminize ? s : determinize(s, me, rnd));
  const first = scoreCandidates(w0, { ...cpuOpt, fullOpponent: opt.fullOpponent ?? true });
  const critical = isCritical(s, me, first.list.length);
  // 処理の量の上限：普段 1500回・勝負所 5000回（PCで約2秒・約6秒。遅い端末では時間が延びるが、考える量は同じ）
  const budget = opt.budget ?? (critical ? 5000 * (opt.criticalBudgetScale ?? opt.budgetScale ?? 1) : 1500 * (opt.budgetScale ?? 1));
  // 1つの世界にかかった量から、上限の半分に収まる世界の数にする（残りの半分は深い先読みに使う）
  const per = Math.max(1, WORK.n - w0start);
  const N = Math.max(1, Math.min(critical ? o.criticalSamples : o.samples, Math.floor(budget / 2 / per)));
  // 進み具合の知らせ：考える段どり（ありえる世界 → 深い先読み → リーサル探し）のどこまで終わったかを0〜1で、0.3秒ごとに送る
  // （前は「使った量÷上限」だったが、上限より早く終わるふだんの手では線が伸びなかった。MIMIの報告）。数は減らない
  let lastTell = 0, lastFrac = 0;
  const tell = (frac        , force = false) => {
    if (!opt.onProgress) return;
    lastFrac = Math.max(lastFrac, Math.min(0.99, frac));
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!force && now - lastTell < 300) return;
    lastTell = now;
    opt.onProgress(lastFrac, critical);
  };
  tell(0.02, true);

  const acc = new Map             ();
  const add = (sc        , base         , margin        , world           ) => {
    if (sc.score === -Infinity) return;
    const k = keyOf(sc.action);
    const a = acc.get(k) ?? acc.set(k, { action: sc.action, p: 0, n: 0, romance: 0, burst: 0, base }).get(k) ;
    a.p += prob(sc.score + (base ? margin : 0), o.scale); a.n++;
    // 盤面の点数そのもの（勝率に直すと、負けそうな時はどれも0%になって差が消えるため、その時の比べ直しに使う）
    a.raw = (a.raw ?? 0) + Math.max(-1e5, Math.min(1e5, sc.score + (base ? margin : 0)));
    if (zeroAtkOut(world, sc.after, me) || weakTribute(world, sc.action)) a.zero = (a.zero ?? 0) + 1;
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
    tell(0.05 + 0.4 * i / N);
    const w = (opt.noDeterminize ? s : determinize(s, me, rnd));
    run(scoreCandidates(w, { ...cpuOpt, fullOpponent: opt.fullOpponent ?? true }), w);
  }

  const all = [...acc.values()].filter(a => a.n > 0).map(a => ({ ...a, rate: a.p / a.n }));
  // 点数が数にならない候補（計算のおかしな世界）は除く。全部だめなら最初の候補
  const list0 = all.filter(a => Number.isFinite(a.rate)).length ? all.filter(a => Number.isFinite(a.rate)) : all.map(a => ({ ...a, rate: 0.5 }));
  // 中身が分かっていて、負けが決まっている攻撃（守備力の高い裏守備・攻撃力の高い表側のモンスターへの攻撃）は、ほかに手がある時は選ばない
  // （勝率の見積もりがほぼ同じになり、見積もりのばらつきで選んでしまうことがあるため）
  const sureLoss = (x        ) => {
    if (x.type !== 'attack' || x.target === null || !s.cards[x.target]) return false;
    const t = s.cards[x.target];
    if (!t.faceUp && !t.pub) return false;
    // 表側のユベルのように「戦闘では破壊されず、自分への戦闘ダメージも0」のモンスターへの攻撃は、何も得られない（ユベルは攻撃力分のダメージを返してくる）。
    // 中身が見えている時は、ほかに手があれば選ばない（No.9：全力がダメージ・ゲートで出たユベルに攻撃して1800返された）
    if (t.faceUp) { const sc = scriptOf(s, x.target); if (sc.battleIndestructible && (sc.noSelfBattleDamage || sc.redirectBattleDamage)) return true; }
    const atk = currentStats(s, x.attacker).atk, st = currentStats(s, x.target);
    return t.position === 'def' ? atk < st.def : atk < st.atk;
  };
  const list = list0.some(x => !sureLoss(x.action)) ? list0.filter(x => !sureLoss(x.action)) : list0;
  if (!list.length) throw new Error('行動がありません');
  // 深い先読み：有望な候補（と、ロマンの候補）だけ、相手の次のターンの終わりまで指してみて勝率を出し直す
  const K = critical ? (opt.criticalDeepK ?? 4) : (opt.deepK ?? 3), DW = critical ? (opt.criticalDeepWorlds ?? 5) : (opt.deepWorlds ?? 3);
  if (free && K > 0 && DW > 0 && list.length > 1) {
    const sorted = [...list].sort((x, y) => y.rate - x.rate);
    const top = sorted[0].rate;
    const deep = new Set([...sorted.slice(0, K), ...sorted.filter(a => a.rate >= top - o.romanceWidth && (a.romance + a.burst) * 2 > a.n).slice(0, 2), ...sorted.filter(a => a.base)]);
    const sum = new Map                                                              ();
    const shallowBest = sorted[0];
    for (let i = 0; i < DW && WORK.n - w0start < budget; i++) {
      tell(0.45 + 0.45 * i / DW);
      let j = 0;
      const w = opt.noDeterminize ? s : determinize(s, me, rnd);
      for (const c of deep) {
        tell(0.45 + 0.45 * (i + j++ / deep.size) / DW);
        if (WORK.n - w0start >= budget && i > 0) break;
        let n           ;
        try { n = applyAction(w, c.action); } catch { continue; }
        const fin = playout(n, s.turn, wts, opt.strongRest ? me : null, opt.strongOpp ? opp(me) : null);
        const r = sum.get(c) ?? sum.set(c, { p: 0, n: 0, per: [] }).get(c) ;
        const pr = prob(evaluate(fin, me, cpuOpt.weights) + (c.base ? first.margin : 0), o.scale);
        r.p += pr; r.n++; r.per[i] = pr;
      }
    }
    // 深い先読みの勝率と、浅い先読みの勝率を混ぜる（deepMix：深い方の割合）
    const mix = opt.deepMix ?? 1;
    for (const c of list) { const r = sum.get(c); c.rate = r && r.n ? mix * (r.p / r.n) + (1 - mix) * c.rate : -1; }
    // 深い先読みの結論が浅い先読み（今のCPUの考え方を世界ごとに平均したもの）と違う時は、同じ世界どうしで比べた差が
    // ぶれ（標準誤差）の conf 倍より大きい時だけ深い方に従う。自信がない時は堅実な浅い方の手を選ぶ
    const deepBest = list.reduce((x, y) => (y.rate > x.rate ? y : x));
    const H = sum.get(shallowBest), D = sum.get(deepBest);
    if (deepBest !== shallowBest && H && D) {
      const d           = [];
      for (let i = 0; i < Math.max(H.per.length, D.per.length); i++) if (H.per[i] !== undefined && D.per[i] !== undefined) d.push(D.per[i] - H.per[i]);
      const m = d.reduce((a, b) => a + b, 0) / Math.max(1, d.length);
      const sd = Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, d.length - 1));
      const se = d.length > 1 ? sd / Math.sqrt(d.length) : Infinity;
      if (!(m > (opt.conf ?? 1.5) * se)) shallowBest.rate = deepBest.rate + 1e-6;
    }
  }
  // リーサル：このターンに勝てる手順を総当たりで探す。見つかった最初の手は、その世界の割合だけ勝てるとみなす
  // 自分のターンの選択の途中（チキンレースのどの効果を選ぶか など）も、勝ち筋を探す
  // （チェーンを組んでいる途中の選択＝発動した時にどの効果を選ぶか、も入れる）
  const myChoice = !!s.pending && s.turnPlayer === me;
  if ((free || myChoice) && (s.phase === 'main1' || s.phase === 'battle') && lethalPossible(s, me)) {
    const LW = critical ? 3 : 2;
    const found = new Map                ();
    for (let i = 0; i < LW; i++) {
      tell(0.9 + 0.09 * i / LW);
      const w = opt.noDeterminize ? s : determinize(s, me, rnd);
      const left = Math.max(400, Math.floor((budget * 1.5 - (WORK.n - w0start)) / (LW - i)));
      const a = findLethal(w, me, Math.min(opt.lethalNodes ?? 600, left));
      if (a) found.set(keyOf(a), (found.get(keyOf(a)) ?? 0) + 1);
    }
    for (const c of list) { const n = found.get(keyOf(c.action)); if (n) c.rate = Math.max(c.rate, n / LW); }
    for (const [k, n] of found) if (!list.some(c => keyOf(c.action) === k)) list.push({ action: JSON.parse(k), p: 0, n: 1, romance: 0, burst: 0, base: false, rate: n / LW });
    // どの世界でもこのターンに勝てる手順が見つかった時は、ロマンや引き分けの乱数に関係なく、その手を選ぶ（MASTERの決定#60：勝てるのに見送らない）
    // どの世界でも見つかった手、無ければ半分より多くの世界で見つかった手のうち一番多い手（ほかの手より多い時）を、とどめの手として選ぶ
    // （MEMEの見回り：チキンレースの「破壊」が3世界中2で勝ち、「ドロー」が1で勝ち → 勝率がどちらも100%に見えて、ドローを選んでいた）
    const ranked = [...found].sort((x, y) => y[1] - x[1]);
    const sure = ranked.find(([, n]) => n === LW) ?? (ranked[0] && ranked[0][1] * 2 > LW && (ranked.length < 2 || ranked[0][1] > ranked[1][1]) ? ranked[0] : undefined);
    if (sure) {
      const c = list.find(x => keyOf(x.action) === sure[0]) ;
      return { action: c.action, winRate: 1, bestRate: 1, romance: null, samples: N, critical, alts: [...list].sort((x, y) => y.rate - x.rate).slice(0, 5).map(a => ({ action: a.action, rate: a.rate })) };
    }
  }
  const bestRate = Math.max(...list.map(a => a.rate));
  // 勝率がほぼ同じ手（差 tie 未満）からランダムに選ぶ
  const near = list.filter(a => a.rate >= bestRate - (opt.tie ?? 1e-9));
  let pick = near[Math.floor(rnd() * near.length)];
  // 手札に加えるカードを選ぶ時、見込みが同じなら手札と組み合わさる方を選ぶ（t13・試合40：マジシャン・オブ・ブラックカオスが手札にあるのに、
  // マンジュ・ゴッドで2枚目を加えて儀式魔法が無いまま。見込みはどれも63%（差は0.2%）で、見積もりのばらつきで選んでいた）
  // 見込みの差が1%以内の候補で比べ、組み合わさり方が一番良い中から見込みの高い方
  if (s.pending) {
    const close = list.filter(a => a.rate >= bestRate - 0.01);
    const fit = close.map(a => handFit(s, me, a.action));
    const top = Math.max(...fit);
    if (close.length > 1 && top > Math.min(...fit)) pick = close.filter((_, i) => fit[i] === top).reduce((x, y) => (y.rate > x.rate ? y : x));
  }
  // 負けそうな時（最善でも勝率5%未満）は、勝率がほぼ同じ（1%以内）手の中から、盤面の点数が一番良い手を選ぶ。
  // どの手も0%に見えて適当に選ぶ（攻撃できるのに攻撃しない など）のを防ぎ、最後まで最善を尽くす
  if (bestRate < 0.05) {
    const close = list.filter(a => a.rate >= bestRate - 0.01 && a.raw !== undefined && a.n > 0);
    if (close.length > 1) pick = close.reduce((x, y) => (y.raw  / y.n > x.raw  / x.n ? y : x));
  }
  // 勝ちがほぼ決まっている時（95%以上）に、見込みがほぼ同じ（2%以内）なら、決着を早める手（攻撃 → バトルフェイズへ）を選ぶ。
  // ターンを終える手ばかり選んで引き延ばさないため（MIMIの報告③）
  if (free && bestRate >= 0.95) {
    const fast = (a        ) => (a.type === 'attack' ? 2 : a.type === 'nextPhase' && a.to === 'battle' ? 1 : 0);
    const cand = list.filter(a => a.rate >= bestRate - 0.02 && fast(a.action) > 0).sort((x, y) => fast(y.action) - fast(x.action) || y.rate - x.rate);
    if (cand.length) pick = cand[0];
  }
  let romance                     = null;
  if (free) {
    const width = opt.romanceChase && rnd() < opt.romanceChase.p ? Math.max(o.romanceWidth, opt.romanceChase.width) : o.romanceWidth;
    const rom = list.filter(a => a.rate >= bestRate - width && (a.romance + a.burst) * 2 > a.n);
    if (rom.length) {
      const r = rom.reduce((x, y) => (y.rate > x.rate ? y : x));
      pick = r;
      romance = r.romance >= r.burst ? 'ace' : 'burst';
    }
  }
  // 攻撃力0のモンスターを攻撃表示で出す手は、ほかに手が無い時だけ（MASTERの決定）。
  // ただし、その手が見込みで10%以上はっきり良い時（そのターンに素材にする などの狙いがある時）は残す
  // 相手の伏せカードで止められる世界もあるので、3割以上の世界で出るなら「出す手」とみなす
  const zeroish = (a                     ) => (a.zero ?? 0) * 10 >= a.n * 3 && (a.zero ?? 0) > 0;
  if (zeroish(pick)) {
    const others = list.filter(a => !zeroish(a));
    if (others.length) {
      const alt = others.reduce((x, y) => (y.rate > x.rate ? y : x));
      if (alt.rate >= pick.rate - 0.1) { pick = alt; romance = null; }
    }
  }
  const alts = [...list].sort((x, y) => y.rate - x.rate).slice(0, 5).map(a => ({ action: a.action, rate: a.rate }));
  return { action: pick.action, winRate: pick.rate, bestRate, romance, aceUid: romance === "ace" ? pick.ace : undefined, samples: N, critical, alts };
}

/** このターンに相手のLPを0にできる見込みがあるか（総当たりする前の大まかな判定） */
function lethalPossible(s           , me          )          {
  const o = opp(me);
  const onField = monstersOf(s, me).filter(u => s.cards[u].faceUp && s.cards[u].position === 'atk').reduce((a, u) => a + currentStats(s, u).atk, 0);
  const inHand = s.players[me].hand.reduce((a, u) => Math.max(a, defOf(s, u).kind === 'monster' ? (defOf(s, u).atk ?? 0) : 0), 0);
  return s.players[o].lp <= (onField + inHand) * 1.5 + 1000;
}
/**
 * リーサルの総当たりで試す順番：攻撃 → 効果の発動 → バトルフェイズへ → そのほか。
 * 同じカード名の手札を同じ形で出す手は1つにまとめる（千眼の邪教神が5枚ある時に5通り試さない）
 */
function order(s           , acts          )           {
  const seen = new Set        ();
  const uniq = acts.filter(a => {
    const k = JSON.stringify(a, (key, v) => (key === 'card' && typeof v === 'number' && s.cards[v] && s.players.some(p => p.hand.includes(v)) ? 'h:' + s.cards[v].code : v));
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
  const rank = (a        ) => (a.type === 'attack' ? 0 : a.type === 'activate' ? 1 : a.type === 'nextPhase' ? 2 : a.type === 'answer' ? 0 : 3);
  return uniq.map((a, i) => ({ a, i })).sort((x, y) => rank(x.a) - rank(y.a) || x.i - y.i).map(x => x.a);
}
/** このターンに勝てる手順の最初の手（見つからなければ null）。自分の行動を順に試し、選択や相手の応答は速い判断で進める */
export function findLethal(s0           , me          , nodeLimit        )                {
  const turn = s0.turn, start = WORK.n;
  const settle = (s           )            => {
    for (let i = 0; i < 60 && s.winner === null && s.turn === turn; i++) {
      const free = !s.pending && s.window.kind === 'open' && s.chain.length === 0 && s.turnPlayer === me && actorOf(s) === me;
      if (free) return s;
      // 自分の選択（チキンレースのどの効果を選ぶか など）も総当たりの枝にする（速い判断に任せると勝ち筋を見落とす）
      if (s.pending && actorOf(s) === me) return s;
      try { s = applyAction(s, cpuDecide(s, { depth: 0, planSteps: 0 })); } catch { return s; }
    }
    return s;
  };
  const dfs = (s           , depth        )          => {
    if (s.winner === me) return true;
    if (s.winner !== null || s.turn !== turn || depth <= 0 || WORK.n - start > nodeLimit) return false;
    // 自分の選択の途中なら、答えの候補を全部試す（多すぎる時は先頭の8つ）
    let acts           = s.pending ? answerCandidates(s, s.pending.request, 8).map(value => ({ type: 'answer', value })          )
      : legalActions(s).filter(a => a.type !== 'endTurn' && !(a.type === 'nextPhase' && a.to !== 'battle') && a.type !== 'setSpellTrap' && a.type !== 'setMonster');
    for (const a of order(s, acts)) {
      let n           ;
      try { n = settle(applyAction(s, a)); } catch { continue; }
      if (dfs(n, depth - 1)) return true;
      if (WORK.n - start > nodeLimit) return false;
    }
    return false;
  };
  const s = settle(s0);
  if (s !== s0 && s.winner === me) return null;
  const acts           = s.pending ? answerCandidates(s, s.pending.request, 8).map(value => ({ type: 'answer', value })          ) : legalActions(s).filter(a => a.type !== 'endTurn' && !(a.type === 'nextPhase' && a.to !== 'battle'));
  // 浅い読みから順に深くする（1つ目の手の下を深く読みすぎて、量の上限で2つ目以降の手を試せないのを防ぐ。
  // 例：チキンレースで「ドロー」を先に深く読んで、「破壊してから攻撃」を見つける前に上限が来ていた）
  const firsts                                = [];
  for (const a of order(s, acts)) {
    try { firsts.push({ a, n: settle(applyAction(s, a)) }); } catch { /* 入れられない手 */ }
    if (WORK.n - start > nodeLimit) break;
  }
  for (const depth of [3, 6]) {
    for (const f of firsts) {
      if (f.n.winner === me || dfs(f.n, depth)) return f.a;
      if (WORK.n - start > nodeLimit) return null;
    }
  }
  return null;
}

/** 相手の次のターンが終わる（自分の次のターンが始まる）まで、お互いに速い判断で指し進める */
function playout(s           , startTurn        , wts                                                               = [undefined, undefined], me                  = null, foe                  = null)            {
  for (let i = 0; i < 400 && s.winner === null && s.turn < startTurn + 2; i++) {
    // 自分のターンの残りは、今のCPUと同じ丁寧な判断で指す（その手の後に実際に指す手に近づける）。それ以外は速い判断
    const a = actorOf(s);
    const careful = (me !== null && a === me && s.turn === startTurn) || (foe !== null && a === foe);
    try { s = applyAction(s, cpuDecide(s, careful ? { weights: wts[a] } : { depth: 0, planSteps: 0, weights: wts[a] })); } catch { break; }
    s.log = []; s.anim = [];
  }
  return s;
}

/** 行動だけ欲しい時 */
export function idealDecide(s           , opt               = {}, deckNames                   = ['', ''])         {
  return idealThink(s, opt, deckNames).action;
}
