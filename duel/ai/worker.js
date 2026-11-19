// 理想のCPUを画面とは別の場所（Web Worker）で考えさせる。考えている間も画面が固まらない
import { setPool } from '../engine/game.js';
import { CARD_POOL } from '../data/cardpool.js';
import { idealThink } from './ideal.js';
                                                    

setPool(CARD_POOL);
                                                                                                         
self.onmessage = (e                   ) => {
  const { id, state, deckNames, deckCodes } = e.data;
  try {
    const t0 = performance.now();
    const th = idealThink(state, { deckCodes }, deckNames);
    (self                     ).postMessage({ id, ok: true, thought: th, ms: Math.round(performance.now() - t0) });
  } catch (err) {
    (self                     ).postMessage({ id, ok: false, error: String((err         )?.message ?? err) });
  }
};
