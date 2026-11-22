// CPUの強さ（やさしい・ふつう・本気）
// - やさしい：前のCPUの採点で候補を並べ、ときどき2番目・3番目の手を選ぶ（見えないカードは見ない）
// - ふつう：理想のCPU（そのまま）
// - 本気：理想のCPUに、考える量を約2倍・読む世界を多くして考えさせる。ロマンは無視して勝つことだけで手を選ぶ（見えないカードは推測のまま。ズルはしない）
import { cpuDecide, scoreCandidates } from './cpu.js?v=20261122-1851-06d3fbbe57';
import { idealThink,                                 } from './ideal.js?v=20261122-1851-06d3fbbe57';
import { actorOf, opp, monstersOf, legalActions, currentStats, battleDamageZero, scriptOf, defOf, couldAttackNextBattle, fieldCards, poolDef } from '../engine/game.js?v=20261122-1851-06d3fbbe57';
                                                            

                                                  
export const LEVELS             = ['easy', 'normal', 'hard'];

/** 本気の考え方（ふつうに上乗せ）。romanceWidth: 0 ＝ロマンの手を選ばない（MASTERの決定 2026-11-20） */
// strongRest・budgetScale 1.4：ふつう相手の160局で92勝、差がついた18組で15対3（2026-11-20 MEMEの測定。考える量2倍・2.5倍は強くならなかった）
export const HARD_OPTS               = { romanceWidth: 0, strongRest: true, samples: 10, criticalSamples: 18, budgetScale: 1.4, deepK: 4, deepWorlds: 4, criticalDeepK: 5, criticalDeepWorlds: 6 };

/** やさしい：約3回に1回、2番目か3番目に良い手を選ぶ（選ぶ手が1つしか無い時はそれ） */
export function easyThink(s           , random               = Math.random)          {
  let action = cpuDecide(s, { fullOpponent: false });
  if (random() < 0.33) {
    const list = [...scoreCandidates(s, { fullOpponent: false }).list].filter(c => Number.isFinite(c.score)).sort((a, b) => b.score - a.score);
    // 降参（サレンダー）は選ばない
    const alt = list.filter(c => c.action.type !== 'surrender').slice(1, 3);
    if (alt.length) action = alt[Math.floor(random() * alt.length)].action;
  }
  return { action, winRate: NaN, bestRate: NaN, romance: null, samples: 0, critical: false };
}

/**
 * このターンに攻撃だけで勝てる時の手（無ければ null）。どの強さでも、ロマンでも、勝てるのに見送ることはしない（MASTERの決定#60）
 * 見るのは表側・公開されたカードの数字だけ（相手の伏せカードの中身は見ない）
 * - バトルフェイズ：1回の攻撃で相手のLPが0になる攻撃／相手のモンスターがいなくて、直接攻撃の合計で足りる時は一番強いモンスターから直接攻撃
 * - メインフェイズ1：相手のモンスターがいなくて、自分の攻撃表示のモンスターの攻撃力の合計で足りる時はバトルフェイズへ
 * - 「このカードの攻撃で発生する戦闘ダメージは0」のモンスター（ボマー・ドラゴン）は数えない。足りない時は、手札から召喚して足りるかを
 *   ideal.ts のリーサルの総当たりが探す（MIMIの報告：ボマー・ドラゴンを数えて召喚せずにバトルへ入り、勝ちを逃した）
 */
export function lethalNow(s           )                {
  if (s.winner !== null || s.pending || s.window.kind !== 'open' || s.chain.length > 0) return null;
  const me = actorOf(s);
  if (s.turnPlayer !== me) return null;
  const o = opp(me), lp = s.players[o].lp;
  // 相手が戦闘ダメージを受けない状態（チキンレースなど）の時は、攻撃だけではとどめにならない
  if (battleDamageZero(s, o)) return null;
  // LPの大小などで、攻撃の途中からダメージが0になりうるカード（チキンレース）が表側である時は、攻撃の合計だけでは決めない。
  // 勝ち筋は ideal.ts のリーサルの総当たり（エンジンをそのまま動かす）に任せる（MIMIの報告 seed 9032：1発目でLPが入れ替わり2発目が0になった）
  if ([...fieldCards(s, 0), ...fieldCards(s, 1)].some(u => s.cards[u].faceUp && scriptOf(s, u).damageZeroFor)) return null;
  // 攻撃で相手に与えるダメージ（攻撃のダメージが0のモンスターは0）
  const power = (u        ) => (scriptOf(s, u).attackNoDamage ? 0 : currentStats(s, u).atk);
  const acts = legalActions(s);
  // 相手に伏せカードがあって、こちらに手札から発動できる魔法・罠がある時（サイクロンなど）は、近道をせずに
  // 「先に伏せを除いてから攻撃」も試すリーサルの総当たりに任せる（MEMEの見回り：伏せ1枚・LP1300で、サイクロンを使わずに攻撃して届かなかった）
  const oppSet = s.players[o].szone.some(u => u !== null && !s.cards[u].faceUp);
  const canClear = acts.some(a => a.type === 'activate' && s.cards[a.card]?.zone === 'hand' && s.cards[a.card] && poolDef(s.cards[a.card].code)?.kind !== 'monster');
  if (oppSet && canClear) return null;
  if (s.phase === 'battle') {
    const atks = acts.filter((a)                                           => a.type === 'attack');
    const dmg = (a                                     ) => {
      const atk = power(a.attacker);
      if (a.target === null) return atk;
      const t = s.cards[a.target];
      if (!t || !t.faceUp || t.position !== 'atk') return 0;
      // 相手のモンスターとの戦闘で相手が受けるダメージが0（または跳ね返る）になるもの（MIMIの報告：ユベル・D-HERO ドレッドガイ）
      if (scriptOf(s, a.target).redirectBattleDamage || scriptOf(s, a.target).noSelfBattleDamage) return 0;
      if (defOf(s, a.target).name.startsWith('D-HERO') && s.lingering.some(l => l.type === 'dheroProtect' && l.player === o && l.turn === s.turn)) return 0;
      return atk - currentStats(s, a.target).atk;
    };
    const one = atks.filter(a => dmg(a) >= lp).sort((x, y) => dmg(y) - dmg(x))[0];
    if (one) return one;
    const direct = atks.filter(a => a.target === null);
    if (monstersOf(s, o).length === 0 && direct.length) {
      const sum = [...new Set(direct.map(a => a.attacker))].reduce((x, u) => x + power(u), 0);
      if (sum >= lp) return direct.reduce((x, y) => (dmg(y) > dmg(x) ? y : x));
    }
    return null;
  }
  if (s.phase === 'main1' && monstersOf(s, o).length === 0) {
    const go = acts.find(a => a.type === 'nextPhase' && a.to === 'battle');
    const sum = monstersOf(s, me).filter(u => couldAttackNextBattle(s, u)).reduce((x, u) => x + power(u), 0);
    if (go && sum >= lp) return go;
  }
  return null;
}

/**
 * 相手のモンスターも伏せカードもいない時の、ただの直接攻撃（とどめでなくても、ダメージだけ得をする）。バトルフェイズで攻撃せずに終えるのを防ぐ
 * （MEMEの見回り：相手の場が空なのに、サイレント・マジシャン LV4 で攻撃せずにターンを終えた・3体いて1体も攻撃しなかった）
 */
export function freeHit(s           )                {
  if (s.winner !== null || s.pending || s.window.kind !== 'open' || s.chain.length > 0 || s.phase !== 'battle') return null;
  const me = actorOf(s);
  if (s.turnPlayer !== me) return null;
  const o = opp(me);
  if (monstersOf(s, o).length || s.players[o].szone.some(u => u !== null && !s.cards[u].faceUp) || battleDamageZero(s, o)) return null;
  if ([...fieldCards(s, 0), ...fieldCards(s, 1)].some(u => s.cards[u].faceUp && scriptOf(s, u).damageZeroFor)) return null;
  const direct = legalActions(s).filter((a)                                           => a.type === 'attack' && a.target === null && !scriptOf(s, a.attacker).attackNoDamage && currentStats(s, a.attacker).atk > 0);
  if (!direct.length) return null;
  return direct.reduce((x, y) => (currentStats(s, y.attacker).atk > currentStats(s, x.attacker).atk ? y : x));
}

/** 「全力」で考える（CPUはいつもこれ。MASTERの決定 2026-11-21：難易度の設定はなし。中身は前の「本気」＝ロマン0・とどめと守り最優先・考える量1.4倍） */
export function fullThink(s           , opt               = {}, deckNames                   = ['', ''])          {
  return levelThink(s, 'hard', opt, deckNames);
}

/** 強さに合わせて考える（やさしい・ふつうは作りだけ残している。強さを測る道具やテストで使う） */
export function levelThink(s           , level          , opt               = {}, deckNames                   = ['', ''])          {
  const win = lethalNow(s);
  if (win) return { action: win, winRate: 1, bestRate: 1, romance: null, samples: 0, critical: true };
  if (level !== 'easy') { const hit = freeHit(s); if (hit) return { action: hit, winRate: NaN, bestRate: NaN, romance: null, samples: 0, critical: false }; }
  if (level === 'easy') return easyThink(s, opt.random);
  if (level === 'hard') return idealThink(s, { ...HARD_OPTS, ...opt }, deckNames);
  return idealThink(s, opt, deckNames);
}
