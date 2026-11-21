// 切り札の判定（MASTERのチェック表 data/<デッキ>/aces.json → src/data/decks.ts の aces）
// - CPU（ロマン・セリフの{ace}）と画面（召喚の演出・実績「切り札でとどめ」）が同じ判定を使う
// - 1枚に付いている分類ぜんぶ（kinds）と、MASTERの順（god→roman→ace→partner→top）で一番強い1つ（main）を返す
// - 表の無いデッキだけ、前からの自動判定（acesOf）を予備にする（fallback: true）
// - 見る人（viewer）から見えないカード（相手の手札・デッキ・裏側のカード）には何も返さない（中身がばれないように）
import { DECKS,                            } from '../data/decks.js?v=20261122-0240-e8afb3d7b2';
import { acesOf } from './ideal.js?v=20261122-0240-e8afb3d7b2';
                                                              

                        
/** 分類の強さの順（MASTERの決定） */
export const ACE_ORDER            = ['god', 'roman', 'ace', 'partner', 'top'];

                          
                        
                   
                          
                
                                        
               
                                              
                    
 

/** デッキの番号（または名前）からデッキを探す */
export function deckOf(code         , name         )                      {
  if (code && DECKS[code]) return DECKS[code];
  if (name) return Object.values(DECKS).find(d => d.name === name);
  return undefined;
}

/** カードの番号（code）の切り札の分類。表に無いデッキは null（予備の判定は aceInfo で） */
export function aceKindsOf(deck                     , code        )                   {
  if (!deck?.aces) return null;
  const k = deck.aces[code];
  return k && k.length ? [...k].sort((a, b) => ACE_ORDER.indexOf(a) - ACE_ORDER.indexOf(b)) : [];
}

/** viewer から、そのカードの中身が見えるか */
function visibleTo(s           , uid        , viewer          )          {
  const c = s.cards[uid];
  if (!c) return false;
  if (c.owner === viewer && (c.zone === 'hand' || c.zone === 'deck' || c.zone === 'extra')) return true;
  if (c.zone === 'mzone' || c.zone === 'szone' || c.zone === 'fzone') return c.faceUp || c.controller === viewer || !!c.pub;
  if (c.zone === 'gy' || c.zone === 'banished') return c.faceUp !== false || c.owner === viewer || !!c.pub;
  return !!c.pub;
}

/**
 * カード1枚の切り札の判定。切り札でない・見えない時は null
 * @param decks 両者のデッキの番号（CPU戦の deckCodes）。無ければ deckNames から探す
 */
export function aceInfo(s           , uid        , viewer          , decks                                                         = {})                 {
  const c = s.cards[uid];
  if (!c || c.code.startsWith('token:') || !visibleTo(s, uid, viewer)) return null;
  const p = c.owner;
  const deck = deckOf(decks.codes?.[p], decks.names?.[p]);
  const kinds = aceKindsOf(deck, c.code);
  if (kinds) return kinds.length ? { kinds, main: kinds[0], cls: kinds[0], fallback: false } : null;
  // 表の無いデッキ：前からの自動判定を予備にする（分類はエースとして扱う）
  try { if (acesOf(s, p, decks.names?.[p] ?? deck?.name ?? '').has(c.code)) return { kinds: ['ace'], main: 'ace', cls: 'ace', fallback: true }; } catch { /* 判定できない */ }
  return null;
}

/** p のデッキの切り札のカードの番号（CPUのロマン用。表があれば表の全部、無ければ自動判定） */
export function aceCodes(s           , p          , decks                                                         = {})              {
  const deck = deckOf(decks.codes?.[p], decks.names?.[p]);
  if (deck?.aces) return new Set(Object.entries(deck.aces).filter(([, k]) => k.length > 0).map(([code]) => code));
  return acesOf(s, p, decks.names?.[p] ?? deck?.name ?? '');
}
