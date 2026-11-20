// CPUの強さ（やさしい・ふつう・本気）
// - やさしい：前のCPUの採点で候補を並べ、ときどき2番目・3番目の手を選ぶ（見えないカードは見ない）
// - ふつう：理想のCPU（そのまま）
// - 本気：理想のCPUに、考える量を約2倍・読む世界を多くして考えさせる（見えないカードは推測のまま。ズルはしない）
import { cpuDecide, scoreCandidates } from './cpu.js';
import { idealThink,                                 } from './ideal.js';
                                                    

                                                  
export const LEVELS             = ['easy', 'normal', 'hard'];

/** 本気の考え方（ふつうに上乗せ） */
export const HARD_OPTS               = { samples: 10, criticalSamples: 18, budgetScale: 2, deepK: 4, deepWorlds: 4, criticalDeepK: 5, criticalDeepWorlds: 6 };

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

/** 強さに合わせて考える */
export function levelThink(s           , level          , opt               = {}, deckNames                   = ['', ''])          {
  if (level === 'easy') return easyThink(s, opt.random);
  if (level === 'hard') return idealThink(s, { ...HARD_OPTS, ...opt }, deckNames);
  return idealThink(s, opt, deckNames);
}
