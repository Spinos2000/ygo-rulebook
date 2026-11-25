// 理想のCPUを画面とは別の場所（Web Worker）で考えさせる。考えている間も画面が固まらない
import { setPool } from '../engine/game.js?v=20261125-2201-76b3df62e6';
import { CARD_POOL } from '../data/cardpool.js?v=20261125-2201-76b3df62e6';
import { fullThink,               } from './levels.js?v=20261125-2201-76b3df62e6';
                                                    

setPool(CARD_POOL);
                                                                                                                                               
self.onmessage = (e                   ) => {
  const { id, state, deckNames, deckCodes, level, progress } = e.data;
  try {
    const t0 = performance.now();
    // CPUはいつも「全力」（MASTERの決定 2026-11-21：難易度の設定はなし）。level は前の画面との互換のために受け取るだけ
    void level;
    // progress: true の時だけ、考えている途中に { id, progress: true, frac, critical } を送る（画面の「考え中…」用。答えは今までどおり最後に1回）
    const onProgress = progress ? (frac        , critical         ) => (self                     ).postMessage({ id, progress: true, frac, critical }) : undefined;
    const th = fullThink(state, { deckCodes, onProgress }, deckNames);
    (self                     ).postMessage({ id, ok: true, thought: th, ms: Math.round(performance.now() - t0) });
  } catch (err) {
    (self                     ).postMessage({ id, ok: false, error: String((err         )?.message ?? err) });
  }
};
