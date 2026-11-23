// カード効果で共通して使う処理
                                                                                
import { RuleError, cloneCard } from '../engine/types.js?v=20261123-0909-d5c525952d';
                                                        
import {
  defOf, choose, chooseOne, canSpecialSummon, specialSummon, release, sendToGy, newStep, monstersOf, hasLevelCombo,
  extraSummonZone, freeMZones, scriptOf, targetable, releasable, gyLocked, log, pl, opp, isFaceUpMonster, banish, moveCard, emit, shuffleDeck, cleanupOrphans, FIELD_ZONES,
} from '../engine/game.js?v=20261123-0909-d5c525952d';

export const nameIs = (s           , uid        , name        ) => defOf(s, uid).name === name;
export const deckOf = (s           , p          ) => [...s.players[p].deck];
export const handOf = (s           , p          ) => [...s.players[p].hand];
export const gyOf = (s           , p          ) => [...s.players[p].gy];
export const isNormal = (s           , u        ) => defOf(s, u).kind === 'monster' && defOf(s, u).frame === 'normal';
export const isRitualMonster = (s           , u        ) => defOf(s, u).kind === 'monster' && defOf(s, u).frame === 'ritual';
export const level = (s           , u        ) => defOf(s, u).level ?? 0;

/** 発動時に対象を1つ選んでチェーンブロックに記録する */
export function target(x     , prompt        , options          )         {
  // ネクロバレー：発動の時は、守られた墓地のカードも対象に選べる（処理の時に無効になる。公式Q&A [10691]）。処理の途中で選ぶ時だけ外す
  options = options.filter(u => targetable(x.s, u) && !(x.s.resolving && x.s.cards[u].zone === 'gy' && gyLocked(x.s, x.s.cards[u].owner, x.self)));
  if (!options.length) throw new RuleError('対象にできるカードがありません');
  const t = chooseOne(x, prompt, options) ;
  x.link .targets.push(t);
  return t;
}

/** ドラゴン族モンスターの数（フィールドは表側表示のみ） */
export function countDragons(s           , players            )         {
  let n = 0;
  for (const p of players) {
    n += monstersOf(s, p).filter(u => isFaceUpMonster(s, u) && defOf(s, u).race === 'ドラゴン族').length;
    n += s.players[p].gy.filter(u => defOf(s, u).kind === 'monster' && defOf(s, u).race === 'ドラゴン族').length;
  }
  return n;
}

/* ---------- 儀式召喚 ---------- */
                             
                                                                             
                            
                                                                
                                        
 
function ritualMaterials(s           , p          , monster        , spec            )           {
  if (spec.materials === 'deckNormal') return deckOf(s, p).filter(u => isNormal(s, u) && level(s, u) > 0);
  return [...handOf(s, p), ...monstersOf(s, p).filter(u => releasable(s, u))].filter(u => u !== monster && defOf(s, u).kind === 'monster' && level(s, u) > 0);
}
function ritualCandidates(s           , p          , spec            )           {
  return handOf(s, p).filter(u => {
    if (!isRitualMonster(s, u)) return false;
    if (spec.monsters && !spec.monsters.includes(defOf(s, u).name)) return false;
    const mats = ritualMaterials(s, p, u, spec);
    if (!hasLevelCombo(s, mats, spec.target(s, u), spec.mode)) return false;
    const fieldMats = mats.filter(m => monstersOf(s, p).includes(m));
    return canSpecialSummon(s, u, p, 'ritual', fieldMats);
  });
}
export function ritualCan(x     , spec            )          { return ritualCandidates(x.s, x.player, spec).length > 0; }
export function ritualSummon(x     , spec            )       {
  const s = x.s, p = x.player;
  const cands = ritualCandidates(s, p, spec);
  const monster = chooseOne(x, '儀式召喚するモンスターを選んでください', cands);
  if (monster === null) { log(s, '儀式召喚できるモンスターがいない'); return; }
  const need = spec.target(s, monster);
  const mats = ritualMaterials(s, p, monster, spec);
  const pick = choose(x, {
    kind: 'cards', prompt: spec.materials === 'deckNormal' ? `デッキから墓地へ送る通常モンスターを選んでください（レベル合計${need}）` : `リリースするモンスターを選んでください（レベル合計${need}${spec.mode === 'atLeast' ? '以上' : ''}）`,
    options: mats, min: 1, max: mats.length, rule: spec.mode === 'atLeast' ? { type: 'levelAtLeast', target: need } : { type: 'levelEqual', target: need },
  });
  if (spec.materials === 'deckNormal') { log(s, `${pl(p)}：デッキから${pick.map(u => `「${defOf(s, u).name}」`).join('、')}を墓地へ送る（儀式召喚の素材）`); sendToGy(s, pick, 'effect'); }
  else release(s, pick, 'release');
  s.animMats = [...pick]; // 演出用：儀式の素材
  newStep(s); // 素材にする処理と儀式召喚は同時に行われない
  specialSummon(x, [monster], { how: 'ritual' });
}

/* ---------- 融合召喚 ---------- */
const matLabel = (m                    ) => typeof m === 'string' ? `「${m}」` : m.label;
const matOk = (s           , u        , m                    ) => defOf(s, u).kind === 'monster' && (typeof m === 'string' ? defOf(s, u).name === m : m.ok(s, u));
/** 決められた融合素材を、pool の中から chosen に続けて揃えられるか（ok：揃えた組に追加の条件。置き場所など） */
function completable(s           , mats                        , pool          , chosen          , ok                            )          {
  const rec = (i        , used          , minIdx        )          => {
    if (i === mats.length) return ok(used);
    // 同じ条件が続く場合は、選ぶ順番の違いを数えない（F・G・D：ドラゴン族×5）
    const same = i > chosen.length && mats[i] === mats[i - 1];
    for (let k = same ? minIdx : 0; k < pool.length; k++) {
      const u = pool[k];
      if (!used.includes(u) && matOk(s, u, mats[i]) && rec(i + 1, [...used, u], k + 1)) return true;
    }
    return false;
  };
  for (let i = 0; i < chosen.length; i++) if (!matOk(s, chosen[i], mats[i])) return false;
  return rec(chosen.length, [...chosen], 0);
}
/** 融合召喚の手順（素材の場所・素材をどうするか・融合召喚できるモンスター） */
                             
                                                                   
                                                                                  
                                                                         
 
const HAND_FIELD             = { pool: (s, p) => [...handOf(s, p), ...monstersOf(s, p)], move: 'gy' };
function zoneOk(s           , p          ) { return (set          ) => extraSummonZone(s, p, set.filter(u => monstersOf(s, p).includes(u))) !== null; }
function fusionCandidates(s           , p          , spec            )           {
  const pool = spec.pool(s, p);
  return s.players[p].extra.filter(f => defOf(s, f).frame === 'fusion' && (!spec.filter || spec.filter(s, f))
    && canSpecialSummon(s, f, p, 'fusion', monstersOf(s, p))
    && completable(s, scriptOf(s, f).fusionMaterials || [], pool, [], zoneOk(s, p)));
}
export function fusionCan(x     , spec             = HAND_FIELD)          { return fusionCandidates(x.s, x.player, spec).length > 0; }
export function fusionSummon(x     , spec             = HAND_FIELD)       {
  const s = x.s, p = x.player;
  const fusion = chooseOne(x, '融合召喚するモンスターを選んでください', fusionCandidates(s, p, spec));
  if (fusion === null) { log(s, '融合召喚できるモンスターがいない'); return; }
  const mats = scriptOf(s, fusion).fusionMaterials || [];
  const pool = spec.pool(s, p);
  const chosen           = [];
  for (const m of mats) {
    const opts = pool.filter(u => !chosen.includes(u) && completable(s, mats, pool, [...chosen, u], zoneOk(s, p)));
    const u = chooseOne(x, `融合素材にする${matLabel(m)}を選んでください`, opts);
    if (u === null) return;
    chosen.push(u);
  }
  log(s, `${pl(p)}：${chosen.map(u => `「${defOf(s, u).name}」`).join('、')}を融合素材にする`);
  if (spec.move === 'banish') banish(s, chosen, 'material');
  else if (spec.move === 'deck') returnToDeck(s, chosen, 'material');
  else sendToGy(s, chosen, 'material');
  s.animMats = [...chosen]; // 演出用：融合の素材
  newStep(s); // 素材にする処理と融合召喚は同時に行われない
  specialSummon(x, [fusion], { how: 'fusion' });
}
/** デッキから、融合モンスターの融合素材を揃えられるか（未来融合－フューチャー・フュージョン） */
export function deckMaterialSet(s           , p          , fusion        )          {
  return completable(s, scriptOf(s, fusion).fusionMaterials || [], deckOf(s, p), [], () => true);
}
/** デッキから融合素材を選んで墓地へ送る */
export function sendDeckMaterials(x     , fusion        )       {
  const s = x.s, p = x.player;
  const mats = scriptOf(s, fusion).fusionMaterials || [];
  const pool = deckOf(s, p);
  const chosen           = [];
  for (const m of mats) {
    const opts = pool.filter(u => !chosen.includes(u) && completable(s, mats, pool, [...chosen, u], () => true));
    const u = chooseOne(x, `デッキから墓地へ送る${matLabel(m)}を選んでください`, opts);
    if (u === null) break;
    chosen.push(u);
  }
  if (!chosen.length) return;
  log(s, `${pl(p)}：デッキから${chosen.map(u => `「${defOf(s, u).name}」`).join('、')}を墓地へ送る`);
  sendToGy(s, chosen, 'effect');
}

/** カードを持ち主のデッキに戻してシャッフルする */
export function returnToDeck(s           , uids          , reason        )       {
  const befores             = [];
  const owners = new Set          ();
  for (const u of uids) {
    const c = s.cards[u]; const from = c.zone; const before = cloneCard(c);
    moveCard(s, u, 'deck');
    owners.add(s.cards[u].owner);
    if (FIELD_ZONES.includes(from)) { emit(s, { type: 'leftField', uid: u, from, reason, wasFaceUp: before.faceUp }); befores.push(before); }
  }
  for (const o of owners) shuffleDeck(s, o);
  if (befores.length) { for (const b of befores) scriptOf(s, b.uid).onLeaveField?.(s, b, reason); cleanupOrphans(s); }
}

/** 相手フィールドのモンスター */
export const oppMonsters = (x     ) => monstersOf(x.s, opp(x.player));
export const zoneFree = (s           , p          ) => freeMZones(s, p).length > 0;
