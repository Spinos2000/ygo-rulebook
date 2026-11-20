// CPUの強さ（やさしい・ふつう・本気）
// - やさしい：前のCPUの採点で候補を並べ、ときどき2番目・3番目の手を選ぶ（見えないカードは見ない）
// - ふつう：理想のCPU（そのまま）
// - 本気：理想のCPUに、考える量を約2倍・読む世界を多くして考えさせる。ロマンは無視して勝つことだけで手を選ぶ（見えないカードは推測のまま。ズルはしない）
import { cpuDecide, scoreCandidates } from './cpu.js';
import { idealThink,                                 } from './ideal.js';
import { actorOf, opp, monstersOf, legalActions, currentStats, battleDamageZero } from '../engine/game.js';
                                                            

                                                  
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
 */
export function lethalNow(s           )                {
  if (s.winner !== null || s.pending || s.window.kind !== 'open' || s.chain.length > 0) return null;
  const me = actorOf(s);
  if (s.turnPlayer !== me) return null;
  const o = opp(me), lp = s.players[o].lp;
  // 相手が戦闘ダメージを受けない状態（チキンレースなど）の時は、攻撃だけではとどめにならない
  if (battleDamageZero(s, o)) return null;
  const acts = legalActions(s);
  if (s.phase === 'battle') {
    const atks = acts.filter((a)                                           => a.type === 'attack');
    const dmg = (a                                     ) => {
      const atk = currentStats(s, a.attacker).atk;
      if (a.target === null) return atk;
      const t = s.cards[a.target];
      return t && t.faceUp && t.position === 'atk' ? atk - currentStats(s, a.target).atk : 0;
    };
    const one = atks.filter(a => dmg(a) >= lp).sort((x, y) => dmg(y) - dmg(x))[0];
    if (one) return one;
    const direct = atks.filter(a => a.target === null);
    if (monstersOf(s, o).length === 0 && direct.length) {
      const sum = [...new Set(direct.map(a => a.attacker))].reduce((x, u) => x + currentStats(s, u).atk, 0);
      if (sum >= lp) return direct.reduce((x, y) => (dmg(y) > dmg(x) ? y : x));
    }
    return null;
  }
  if (s.phase === 'main1' && monstersOf(s, o).length === 0) {
    const go = acts.find(a => a.type === 'nextPhase' && a.to === 'battle');
    const sum = monstersOf(s, me).filter(u => s.cards[u].faceUp && s.cards[u].position === 'atk').reduce((x, u) => x + currentStats(s, u).atk, 0);
    if (go && sum >= lp) return go;
  }
  return null;
}

/** 強さに合わせて考える */
export function levelThink(s           , level          , opt               = {}, deckNames                   = ['', ''])          {
  const win = lethalNow(s);
  if (win) return { action: win, winRate: 1, bestRate: 1, romance: null, samples: 0, critical: true };
  if (level === 'easy') return easyThink(s, opt.random);
  if (level === 'hard') return idealThink(s, { ...HARD_OPTS, ...opt }, deckNames);
  return idealThink(s, opt, deckNames);
}
