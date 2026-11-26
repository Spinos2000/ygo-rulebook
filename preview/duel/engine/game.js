// 遊戯王OCG 自動処理エンジン（現行マスタールール）
// 第2段階：進行・召喚・バトル・勝敗
// 第3段階：選択・チェーン・優先権・スペルスピード・誘発効果（タイミングを逃す）・コストと対象・無効・数値変化・装備・カウンター・儀式召喚・融合召喚
             
                                                                                                                          
                                                               
                    
import { RuleError, cloneCard, cloneState } from './types.js?v=20261126-1250-a6f77c141d';
import { SCRIPTS } from '../cards/index.js?v=20261126-1250-a6f77c141d';

export const START_LP = 8000;
export const START_HAND = 5;
export const HAND_LIMIT = 6;
export const ZONES = 5;

/* =====================================================================
 * カード効果の書き方（src/cards/ で使う）
 * ===================================================================== */
                      
               
                                      
                                                        
                                              
 

                               
             
                
                                                                
                                                  
                
                                                          
                                             
                                                                                         
                         
                                                
                                                     
                                                        
                                                                      
                                                       
                                                                                                             
                                            
                        
                                                     
                          
              
                        
 

                             
                           
                               
                                                                            
                                                      
                      
                               
                                                                     
                            
                                                                       
                                 
                                                                               
                                         
                                                     
                                     
                                                            
                                             
                                                            
                              
                       
                                         
                                           
                                      
                                                                      
                                       
                                                                     
                                         
                                  
                                                 
                                     
                                     
                                                                                                                             
                                     
                                                  
                                            
                                                              
                                                
                                                
                                       
                    
                 
                               
                               
                      
                                   
                         
                   
                              
                              
                       
                                                             
                                                                                            
                                           
                                                                                          
                              
                     
                                  
                                                                   
                                     
                                                                  
                   
                                 
                                                                                      
                    
                                                
                                                                              
                                    
                     
                                                       
                             
                                            
                           
                                                  
                                                                  
                                  
                               
                                                     
                                                                                                                                             
                                              
                      
                                                                  
                                                                                         
                                                  
                                                                       
                                              
                                                                                               
                                                 
                           
                                                         
                                                       
                                   
                             
                                            
                                                                       
                                             
                                                             
                                                
                                  
                                                                     
                                                     
                        
                                                                
                                                   
                                                                              
                                          
                                                               
                                          
                                                        
                                  
                      
                                                                    
                                                                                                                                   
                                                      
                                                                                  
                                                         
                                     
                                                  
                                               
                                                                 
                       
                                                    
                             
                                                           
                        
                                            
                         
                                                      
                               
                                 
                          
                                                     
                                                            
                                 
                                                            
                                                                     
                                                    
                                             
                                                                          
                                                            
                        
                                       
                            
                                                               
                                                                                                                                        
                                                               
                                 
                                              
                         
 
                                                                   
/** 条件で決められた融合素材（label は画面に出す名前） */
                                                                                    

/* =====================================================================
 * 乱数・カード参照・ログ
 * ===================================================================== */
function nextRandom(state           )         {
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function shuffleDeck(state           , p          )       {
  const a = state.players[p].deck;
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom(state) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  a.forEach((u, i) => { state.cards[u].index = i; });
}

let POOL                          = {};
export function setPool(pool                         )       { POOL = pool; }
export const poolDef = (code        )                      => POOL[code];
/** トークン（カードプールに無いモンスター）。code は 'token:…' */
export const TOKENS                          = {
  'token:sheep': { name: '羊トークン', kind: 'monster', frame: 'normal', attribute: '地', race: '獣族', level: 1, atk: 0, def: 0, text: '' }                      ,
  'token:metaldevil': { name: 'メタルデビル・トークン', kind: 'monster', frame: 'normal', attribute: '闇', race: '悪魔族', level: 1, atk: 0, def: 0, text: '' }                      ,
};
export const isToken = (s           , uid        ) => s.cards[uid].code.startsWith('token:');
/** トークンを特殊召喚する（position：表示形式）。置けた数だけ uid を返す */
export function createTokens(x     , code        , n        , position               , player           = x.player)           {
  const s = x.s, res           = [];
  if (specialLocked(s, player)) return res;
  for (let i = 0; i < n; i++) {
    const z = freeMZones(s, player);
    if (!z.length) break;
    const uid = s.nextUid++;
    s.cards[uid] = { uid, code, owner: player, controller: player, zone: 'none', index: 0, serial: 0, faceUp: true, position: null, enteredTurn: null, positionChangedTurn: null,
      attackedTurn: null, counters: {}, equippedTo: null, equipSerial: null, equipBy: null, link: null, linkSerial: null, proper: false, summoning: false, noAttack: false, pub: false }            ;
    moveCard(s, uid, 'mzone', { index: z[0], faceUp: true, position, controller: player });
    const c = s.cards[uid]; c.summonedHow = 'special'; c.summonedTurn = s.turn;
    res.push(uid);
  }
  if (res.length) {
    log(s, `${pl(player)}：${TOKENS[code].name}を${res.length}体特殊召喚`);
    markSummoned(s, player, true);
    for (const u of res) emit(s, { type: 'summoned', uid: u, player, how: 'special' });
    for (const u of res) pushAnim(s, { kind: 'summon', uid: u, how: 'special', mats: [] });
  }
  return res;
}
/** このターン、プレイヤーがモンスターを召喚・反転召喚・特殊召喚した記録（スケープ・ゴート） */
function markSummoned(s           , p          , special = false)       { s.opt[`${p}:summonedAny`] = s.turn; if (special) s.opt[`${p}:specialAny`] = s.turn; }
/** このターン、プレイヤーがモンスターを特殊召喚したか（強欲で謙虚な壺） */
export const specialSummonedThisTurn = (s           , p          ) => s.opt[`${p}:specialAny`] === s.turn;
export const summonedThisTurn = (s           , p          ) => s.opt[`${p}:summonedAny`] === s.turn;
/** player が uid 以外の効果ではモンスターを出せない状態か（スケープ・ゴート） */
function summonLockedFor(s           , p          , src               )          {
  return s.lingering.some(l => l.type === 'noSummonExcept' && l.player === p && l.turn === s.turn && l.uid !== src);
}
/** player はこのターン特殊召喚できない（強欲で謙虚な壺・旗鼓堂々） */
const specialLocked = (s           , p          ) => s.lingering.some(l => l.type === 'noSpecial' && l.player === p && l.turn === s.turn)
  || activeCards(s).some(u => scriptOf(s, u).blocksSpecialSummon?.(s, u));
/** このターン、EXデッキからモンスターを特殊召喚できない（帝王の烈旋） */
const extraLocked = (s           , p          ) => s.lingering.some(l => l.type === 'noExtraSpecial' && l.player === p && l.turn === s.turn);
/** このターン、EXデッキからモンスターを特殊召喚したか（帝王の烈旋） */
export const extraSummonedThisTurn = (s           , p          ) => s.opt[`${p}:extraAny`] === s.turn;
/** 罠モンスター：モンスターゾーンにある間のモンスターとしての数値（罠カードとしても扱う） */
export const TRAP_MONSTERS                                   = {
  '5686': { kind: 'monster', frame: 'effect', attribute: '水', race: '水族', level: 10, atk: 0, def: 3000 }                    ,
};
export function defOf(state           , uid        )          {
  const c = state.cards[uid];
  if (TRAP_MONSTERS[c.code] && (c.zone === 'mzone' || c.zone === 'emz')) return { ...POOL[c.code], ...TRAP_MONSTERS[c.code] }           ;
  const d = POOL[c.code] ?? TOKENS[c.code];
  if (!d) throw new Error(`カードプールに無いカード: ${c.code}`);
  return d;
}
export const nameOf = (state           , uid        )         => `「${defOf(state, uid).name}」`;
export const scriptOf = (state           , uid        )             => SCRIPTS[state.cards[uid].code] || {};
export const pl = (p          )         => `P${p + 1}`;
export const opp = (p          )           => (p === 0 ? 1 : 0);
export function log(state           , text        )       { state.log.push({ turn: state.turn, text }); }
export const isMain = (ph       ) => ph === 'main1' || ph === 'main2';
export const PHASE_LABEL                        = { draw: 'ドローフェイズ', standby: 'スタンバイフェイズ', main1: 'メインフェイズ1', battle: 'バトルフェイズ', main2: 'メインフェイズ2', end: 'エンドフェイズ' };

/* =====================================================================
 * ゲーム作成
 * ===================================================================== */
                                                              
                              
                                
                                
                
                         
                                                           
 

function emptyPlayer()              {
  return { lp: START_LP, deck: [], hand: [], gy: [], banished: [], extra: [], mzone: Array(ZONES).fill(null), szone: Array(ZONES).fill(null), fzone: null, normalSummonUsed: false };
}

export function createGame(opts             )            {
  setPool(opts.pool);
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const s            = {
    seed, rng: seed >>> 0, turn: 0, turnPlayer: 0, firstPlayer: 0, phase: 'draw',
    players: [emptyPlayer(), emptyPlayer()], emz: [null, null], cards: {}, nextUid: 1,
    window: { kind: 'open', respondDue: false }, chain: [], chainCont: null, queue: [], pending: null,
    step: 0, events: [], lastEvents: [], triggers: [], opt: {}, lingering: [], battle: null,
    winner: null, winReason: null, log: [],
  };
  ([0, 1]              ).forEach(p => {
    const deck = opts.decks[p];
    for (const code of deck.main) s.players[p].deck.push(newCard(s, code, p, 'deck', s.players[p].deck.length));
    for (const code of deck.extra) s.players[p].extra.push(newCard(s, code, p, 'extra', s.players[p].extra.length));
    if (opts.shuffle !== false) shuffleDeck(s, p);
  });
  const first           = opts.firstPlayer ?? (nextRandom(s) < 0.5 ? 0 : 1);
  s.firstPlayer = first;
  s.turnPlayer = first;
  log(s, `デュエル開始。先攻は${pl(first)}`);
  ([0, 1]              ).forEach(p => { for (let i = 0; i < START_HAND; i++) drawOne(s, p); });
  startTurn(s, first);
  flow(s);
  return s;
}

function newCard(s           , code        , owner          , zone          , index        )         {
  if (!POOL[code]) throw new Error(`カードプールに無いカード: ${code}`);
  const uid = s.nextUid++;
  s.cards[uid] = {
    uid, code, owner, controller: owner, zone, index, serial: 0, faceUp: false, position: null,
    enteredTurn: null, positionChangedTurn: null, attackedTurn: null, counters: {}, equippedTo: null, equipSerial: null,
    equipBy: null, link: null, linkSerial: null, proper: false, summoning: false, noAttack: false, pub: false, mods: [], summonedHow: null, summonedTurn: null,
  };
  return uid;
}

/* =====================================================================
 * カードの移動（低レベル）
 * ===================================================================== */
export const FIELD_ZONES             = ['mzone', 'emz', 'szone', 'fzone'];
export function isOnField(c          )          { return FIELD_ZONES.includes(c.zone); }
export function isMonsterZone(c          )          { return c.zone === 'mzone' || c.zone === 'emz'; }

function removeFromZone(s           , uid        )       {
  const c = s.cards[uid];
  const p = s.players[c.controller];
  if (['deck', 'hand', 'gy', 'banished', 'extra'].includes(c.zone)) {
    const arr = p[c.zone          ];
    const i = arr.indexOf(uid);
    if (i >= 0) arr.splice(i, 1);
  } else if (c.zone === 'mzone') p.mzone[c.index] = null;
  else if (c.zone === 'szone') p.szone[c.index] = null;
  else if (c.zone === 'fzone') p.fzone = null;
  else if (c.zone === 'emz') s.emz[c.index] = null;
}

                                                                                                                                

/** カードを移動する。フィールド外へ出る場合は持ち主の領域へ。移動すると serial が変わる */
export function moveCard(s           , uid        , to          , opt          = {})       {
  const c = s.cards[uid];
  const fromField = isOnField(c), fromZone = c.zone;
  removeFromZone(s, uid);
  const toField = FIELD_ZONES.includes(to);
  const ctl           = toField ? (opt.controller ?? c.controller) : c.owner;
  if ((to === 'deck' || to === 'hand') && POOL[c.code]?.frame === 'fusion') to = 'extra';
  if (c.code.startsWith('token:') && !toField) to = 'none';
  const p = s.players[ctl];
  c.controller = ctl;
  c.zone = to;
  c.serial += 1;
  delete c.lastUp; // 前に表だった時の攻守は、動くと分からなくなる
  if (!toField || !fromField) { c.counters = {}; }
  if (to === 'gy') c.counters.gyTurn = s.turn; // 墓地へ送られたターン（D-HERO ディスクガイ：そのターンは墓地から特殊召喚できない）
  c.equippedTo = null; c.equipSerial = null; c.equipBy = null; c.link = null; c.linkSerial = null;
  c.summoning = false; c.noAttack = false; c.mods = []; c.summonedHow = null; c.summonedTurn = null; c.attackedList = undefined; c.tributedWith = undefined;
  if (to === 'hand' || to === 'deck' || to === 'extra') c.proper = false;
  // 相手にカード名が知られているか（CPU の推測用）。デッキに戻ると分からなくなり、手札に加えた（ドロー以外）・手札以外からフィールドに出たカードは知られる
  // ただし裏側のままフィールドから手札に戻ったカード（伏せた魔法・罠、裏側守備のモンスター）は相手に見せていないので、前から知られていた時だけ知られたまま
  const hiddenBack = to === 'hand' && fromField && !c.faceUp;
  if (to === 'deck' || to === 'extra') c.pub = false;
  else if (hiddenBack) c.pub = !!c.pub;
  else if (to === 'hand' || (toField && fromZone !== 'hand')) c.pub = true;
  if (toField) {
    c.faceUp = opt.faceUp ?? true;
    c.position = to === 'mzone' || to === 'emz' ? (opt.position ?? 'atk') : null;
    c.enteredTurn = s.turn;
    c.enteredStep = s.step;
    c.positionChangedTurn = null;
    c.attackedTurn = null;
    const idx = opt.index ?? 0;
    c.index = idx;
    if (to === 'mzone') { if (p.mzone[idx] !== null) throw new Error('モンスターゾーンが埋まっています'); p.mzone[idx] = uid; }
    else if (to === 'szone') { if (p.szone[idx] !== null) throw new Error('魔法＆罠ゾーンが埋まっています'); p.szone[idx] = uid; }
    else if (to === 'emz') { if (s.emz[idx] !== null) throw new Error('エクストラモンスターゾーンが埋まっています'); s.emz[idx] = uid; }
    else { p.fzone = uid; c.index = 0; }
  } else if (to === 'none') {
    c.faceUp = true; c.position = null; c.enteredTurn = null; c.positionChangedTurn = null; c.attackedTurn = null;
  } else {
    c.faceUp = to === 'gy' || to === 'banished';
    if (opt.faceUp !== undefined) c.faceUp = opt.faceUp;
    c.position = null;
    c.enteredTurn = null; c.positionChangedTurn = null; c.attackedTurn = null;
    const arr = p[to          ];
    if (opt.bottom) arr.unshift(uid); else arr.push(uid);
    arr.forEach((u, i) => { s.cards[u].index = i; });
  }
}

/* =====================================================================
 * 参照用
 * ===================================================================== */
export function monstersOf(s           , p          )           {
  const res = s.players[p].mzone.filter((x)              => x !== null);
  for (const u of s.emz) if (u !== null && s.cards[u].controller === p) res.push(u);
  return res;
}
export function allMonsters(s           )           { return [...monstersOf(s, 0), ...monstersOf(s, 1)]; }
export function spellTrapsOf(s           , p          )           {
  const res = s.players[p].szone.filter((x)              => x !== null);
  if (s.players[p].fzone !== null) res.push(s.players[p].fzone);
  return res;
}
export function fieldCards(s           , p          )           { return [...monstersOf(s, p), ...spellTrapsOf(s, p)]; }
export function sameCard(s           , uid        , serial        )          { return s.cards[uid] !== undefined && s.cards[uid].serial === serial; }
export function isFaceUpMonster(s           , uid        )          { const c = s.cards[uid]; return isMonsterZone(c) && c.faceUp && !c.summoning; }
/** 永続効果が適用される状態か（表側表示でフィールドにあり、召喚中でない） */
export function isActive(s           , uid        )          {
  const c = s.cards[uid];
  if (!isOnField(c) || !c.faceUp || c.summoning) return false;
  if (isMonsterZone(c) && monsterNegated(s, uid)) return false;
  if (POOL[c.code]?.kind === 'trap' && !isMonsterZone(c) && trapsNegated(s)) return false;
  return true;
}
/** フィールドの罠カードの効果が無効化されているか（サイコ・ショッカー） */
function trapsNegated(s           )          {
  for (const p of [0, 1]              ) for (const u of monstersOf(s, p)) { const c = s.cards[u]; if (c.faceUp && !c.summoning && !monsterNegated(s, u) && scriptOf(s, u).blocksTraps?.(s, u)) return true; }
  return false;
}
export function freeMZones(s           , p          , released           = [])           {
  const res           = [];
  s.players[p].mzone.forEach((u, i) => { if (u === null || released.includes(u)) res.push(i); });
  return res;
}
export function freeSZones(s           , p          )           {
  const res           = [];
  s.players[p].szone.forEach((u, i) => { if (u === null) res.push(i); });
  return res;
}
/** EXデッキから出すモンスターを置ける場所。この環境はEXモンスターゾーンを使わない（GXの時代に合わせ、普通の5マスだけ。MASTERの決定 2026-11-21）。
 *  s.emz の入れ物は、画面・CPUが読んでいるので空のまま残している */
export function extraSummonZone(s           , p          , released           = [])                                                  {
  const m = freeMZones(s, p, released);
  return m.length ? { zone: 'mzone', index: m[0] } : null;
}
export function tributesNeeded(level        )         { return level >= 7 ? 2 : level >= 5 ? 1 : 0; }
/** リリースなしで通常召喚できる状態か（死皇帝の陵墓） */
export const tributeFree = (s           , p          , uid        ) => s.lingering.some(l => l.type === 'tributeFreeSummon' && l.player === p && l.uid === uid && l.turn === s.turn)
  || activeCards(s).some(u => scriptOf(s, u).freeTribute?.(s, u, uid, p));
/** そのカードのアドバンス召喚に必要なリリースの数（オシリスの天空竜は3体） */
export function tributesFor(s           , uid        )         { return scriptOf(s, uid).tributes ?? tributesNeeded(defOf(s, uid).level ?? 0); }
export const isNormalMonster = (s           , uid        ) => defOf(s, uid).kind === 'monster' && defOf(s, uid).frame === 'normal';
export const isMonsterCard = (s           , uid        ) => defOf(s, uid).kind === 'monster';

/** このカードの効果で装備しているモンスター（サクリファイスなど） */
export function equippedBySelf(s           , uid        )                {
  const c = s.cards[uid];
  const key = `${uid}:${c.serial}`;
  for (const p of [0, 1]              ) for (const u of s.players[p].szone) if (u !== null && s.cards[u].equipBy === key) return u;
  return null;
}
export function equipsOf(s           , uid        )           {
  const res           = [];
  for (const p of [0, 1]              ) for (const u of s.players[p].szone) if (u !== null && s.cards[u].equippedTo === uid) res.push(u);
  return res;
}

/** 現在の攻撃力・守備力 */
export function currentStats(s           , uid        )                               {
  const d = defOf(s, uid);
  let atk = d.atk ?? 0, def = d.def ?? 0;
  if (!isFaceUpMonster(s, uid)) return { atk, def };
  const sc = scriptOf(s, uid);
  const neg = monsterNegated(s, uid);
  const set = neg ? null : sc.statSet?.(s, uid);
  if (set) { atk = set.atk; def = set.def; }
  if (set && sc.statFixed) return { atk: Math.max(0, atk), def: Math.max(0, def) };
  const add = neg ? null : sc.statAdd?.(s, uid);
  if (add) { atk += add.atk; def += add.def; }
  for (const u of activeCards(s)) { if (u === uid) continue; const a = scriptOf(s, u).aura?.(s, u, uid); if (a) { atk += a.atk; def += a.def; } }
  for (const m of s.cards[uid].mods ?? []) { if (m.until !== undefined && m.until < s.turn) continue; atk += m.atk; def += m.def; }
  return { atk: Math.max(0, atk), def: Math.max(0, def) };
}
/** 効果で攻撃力・守備力を上げ下げする（フィールドを離れるまで続く） */
export function addStatMod(s           , uid        , atk        , def        , untilEndOfTurn = false)       {
  const c = s.cards[uid];
  if (!isFaceUpMonster(s, uid) || isImmune(s, uid)) return;
  (c.mods ??= []).push(untilEndOfTurn ? { atk, def, until: s.turn } : { atk, def });
}
/** モンスターの効果が無効になっているか（D-HERO Bloo-D など）。モンスターゾーンの表側表示のモンスターだけ */
export function monsterNegated(s           , uid        )          {
  const c = s.cards[uid];
  if (!isMonsterZone(c) || !c.faceUp) return false;
  for (const p of [0, 1]              ) for (const u of fieldCards(s, p)) {
    if (u === uid) continue;
    const o = s.cards[u];
    if (!o.faceUp || o.summoning) continue;
    if (scriptOf(s, u).negatesMonster?.(s, u, uid)) return true;
  }
  return false;
}

/* ---------- 効果を受けない ---------- */
/** プレイヤー p の墓地のカードが「王家の眠る谷－ネクロバレー」で守られているか（src：効果を使っているカード。ネクロバレーで無効化されない効果なら守られない） */
export function gyLocked(s           , p          , src                = s.resolving?.uid ?? null)          {
  if (src !== null && scriptOf(s, src).ignoresNecroValley) return false;
  if (!activeCards(s).some(u => scriptOf(s, u).necroValley)) return false;
  // 墓守の長：自分の墓地はネクロバレーの効果を受けない
  return !monstersOf(s, p).some(u => isActive(s, u) && scriptOf(s, u).shieldsOwnGy);
}
const gyCardLocked = (s           , u        , src                ) => s.cards[u].zone === 'gy' && gyLocked(s, s.cards[u].owner, src);
/** リリースできるか（召喚僧サモンプリースト：モンスターゾーンの表側表示のこのカードはリリースできない） */
export function releasable(s           , uid        )          {
  const c = s.cards[uid];
  return !(isMonsterZone(c) && c.faceUp && !scriptOf(s, uid).noAdvanceTribute && scriptOf(s, uid).cannotBeReleased && !monsterNegated(s, uid));
}
/** カードの発動のコストを払うか（ダイヤモンドガイで墓地の通常魔法の効果を発動する時は払わない：公式Q&A [6392]） */
export const paysCost = (x     ) => !x.link?.data.dg;
/** 効果の対象にできるか（オベリスクの巨神兵：フィールドの表側表示のこのカードは対象にできない） */
export function targetable(s           , uid        )          {
  const c = s.cards[uid];
  return !(isOnField(c) && c.faceUp && !c.summoning && scriptOf(s, uid).untargetable && !(isMonsterZone(c) && monsterNegated(s, uid)));
}
/** 今処理している効果を、このカードが受けないか */
export function isImmune(s           , uid        )          {
  const src = s.resolving;
  if (!src || src.uid === uid) return false;
  const c = s.cards[uid];
  if (!isOnField(c) || !c.faceUp) return false;
  return !!scriptOf(s, uid).immuneTo?.(s, uid, src);
}
function immuneToCard(s           , uid        , srcUid        )          {
  const sc = scriptOf(s, uid);
  if (!sc.immuneTo || !isFaceUpMonster(s, uid)) return false;
  return sc.immuneTo(s, uid, { uid: srcUid, player: s.cards[srcUid].controller, kind: defOf(s, srcUid).kind });
}

/* ---------- 魔力カウンター ---------- */
export function counterRoom(s           , uid        )         {
  const c = s.cards[uid];
  const max = scriptOf(s, uid).counterMax?.(s, uid);
  if (max === undefined || !isOnField(c) || !c.faceUp) return 0;
  return Math.max(0, max - (c.counters.magic ?? 0));
}
/** 魔力カウンターを置ける表側表示のカード */
export function counterHolders(s           )           {
  return [...fieldCards(s, 0), ...fieldCards(s, 1)].filter(u => counterRoom(s, u) > 0);
}
export function placeCounters(s           , uid        , n        )         {
  const k = Math.min(n, counterRoom(s, uid));
  if (k <= 0) return 0;
  const c = s.cards[uid];
  c.counters.magic = (c.counters.magic ?? 0) + k;
  // 上限まで置かれたターンを記録（サイレント・マジシャン LV４：5つ目が置かれた次の自分ターン）
  if (counterRoom(s, uid) === 0) { c.counters.fullTurn = s.turn; c.counters.fullBy = c.controller; }
  log(s, `${nameOf(s, uid)}に魔力カウンターを${k}つ置く（${c.counters.magic}）`);
  return k;
}
export function removeCounters(s           , uid        , n        )       {
  const c = s.cards[uid];
  c.counters.magic = Math.max(0, (c.counters.magic ?? 0) - n);
}

/* ---------- ダメージを0にする効果 ---------- */
function damageZero(s           , p          )          {
  if (s.lingering.some(l => l.type === 'noDamage' && l.turn >= s.turn)) return true;
  return activeCards(s).some(u => scriptOf(s, u).damageZeroFor?.(s, u, p));
}
export const currentAtk = (s           , uid        ) => currentStats(s, uid).atk;
export const currentDef = (s           , uid        ) => currentStats(s, uid).def;

function activeCards(s           )           { return [...fieldCards(s, 0), ...fieldCards(s, 1)].filter(u => isActive(s, u)); }
/** p が受ける戦闘ダメージが今0になる状態か（チキンレース・幽獄の時計塔など。CPUのとどめの判定用） */
export function battleDamageZero(s           , p          )          {
  return damageZero(s, p) || activeCards(s).some(u => scriptOf(s, u).noBattleDamageFor?.(s, u, p));
}

export function canAttack(s           , uid        )          {
  const c = s.cards[uid];
  if (!isFaceUpMonster(s, uid) || c.position !== 'atk' || c.noAttack || c.counters.noAtkTurn === s.turn) return false;
  if (c.attackedTurn === s.turn) {
    // 相手モンスター全てに1回ずつ攻撃できる（究極恐獣）：直接攻撃していなければ、まだ攻撃していない相手モンスターに攻撃できる
    const list = c.attackedList ?? [];
    if (!scriptOf(s, uid).attackAll || monsterNegated(s, uid) || list.includes(null) || !monstersOf(s, opp(c.controller)).some(t => !list.includes(t))) return false;
  }
  if (s.lingering.some(l => l.type === 'noAttackDecl' && l.player === c.controller && l.turn === s.turn)) return false;
  return attackForbiddenBy(s, uid) === null;
}
/** 攻撃を禁じている永続効果のカード（その効果を受けないモンスターには適用されない） */
export function attackForbiddenBy(s           , uid        )                {
  for (const u of activeCards(s)) if (u !== uid && scriptOf(s, u).forbidsAttack?.(s, u, uid) && !immuneToCard(s, uid, u)) return u;
  return null;
}
/** 次のバトルフェイズで攻撃できる状態か（このターン攻撃したかどうかは問わない。CPU の見積もり用） */
export function couldAttackNextBattle(s           , uid        )          {
  const c = s.cards[uid];
  if (!isFaceUpMonster(s, uid) || c.position !== 'atk' || c.noAttack) return false;
  return attackForbiddenBy(s, uid) === null;
}
function positionLocked(s           , uid        )          {
  for (const u of activeCards(s)) if (u !== uid && scriptOf(s, u).forbidsPositionChange?.(s, u, uid) && !immuneToCard(s, uid, u)) return true;
  // 効果で「表示形式を変更できない」状態になっているモンスター（ライトロード・マジシャン ライラ、復活の墓穴）
  const c = s.cards[uid];
  return s.lingering.some(l => l.type === 'noPositionChange' && l.uid === uid && l.serial === c.serial && l.turn >= s.turn);
}

/* =====================================================================
 * 出来事と誘発効果
 * ===================================================================== */
export function newStep(s           )       { s.step += 1; }

                                                                                                      
export function emit(s           , ev            )       {
  const e = { ...ev, step: s.step }             ;
  s.events.push(e);
  for (const key of Object.keys(s.cards)) {
    const uid = Number(key);
    const sc = scriptOf(s, uid);
    for (const eff of sc.effects || []) {
      if (eff.type !== 'trigger' || !eff.trigger) continue;
      if (!eff.trigger.match(s, uid, e)) continue;
      if (s.triggers.some(t => t.uid === uid && t.effect === eff.id && t.serial === s.cards[uid].serial)) continue;
      s.triggers.push({ uid, serial: s.cards[uid].serial, effect: eff.id, player: s.cards[uid].controller, mandatory: eff.trigger.mandatory, when: eff.trigger.when, step: e.step, event: e });
    }
  }
}

/* =====================================================================
 * カードを動かす処理（効果・ルールから使う）
 * ===================================================================== */
function leaveCleanup(s           , befores            , reason        )       {
  for (const b of befores) {
    // サイコ・ショッカーなどで罠の効果が無効になっている間は、罠が場を離れた時の効果（リビングデッドの呼び声の「離れたら破壊」など）も行わない（公式Q&A [6393]）
    if (POOL[b.code]?.kind === 'trap' && b.zone === 'szone' && b.faceUp && trapsNegated(s)) continue;
    scriptOf(s, b.uid).onLeaveField?.(s, b, reason);
  }
  cleanupOrphans(s);
}
/** 装備対象を失った装備カード、「そのモンスター」を失ったカードを破壊する */
export function cleanupOrphans(s           )       {
  for (let guard = 0; guard < 20; guard++) {
    const orphans           = [];
    for (const p of [0, 1]              ) for (const u of s.players[p].szone) {
      if (u === null) continue;
      const c = s.cards[u];
      if (c.equippedTo !== null) {
        const t = s.cards[c.equippedTo];
        if (!isMonsterZone(t) || t.serial !== c.equipSerial || !t.faceUp) orphans.push(u);
      } else if (c.link !== null && scriptOf(s, u).destroyWhenLinkLeaves) {
        const t = s.cards[c.link];
        if (!isMonsterZone(t) || t.serial !== c.linkSerial) orphans.push(u);
      }
    }
    if (!orphans.length) return;
    destroy(s, orphans, 'rule');
  }
}

/** フィールド魔法を発動する（表にする）時：この環境はフィールド魔法がお互い合わせて1枚だけ（ルールブック「フィールド魔法」。GX当時のまま）。
 *  自分・相手どちらのフィールドゾーンにある表側のフィールド魔法も破壊扱いで墓地へ送る（破壊された時の効果は出る） */
export function replaceFieldSpells(s           , uid        )       {
  const olds = [s.players[0].fzone, s.players[1].fzone].filter((u)              => u !== null && u !== uid && s.cards[u].faceUp);
  if (olds.length) destroy(s, olds, 'rule');
}
/** 墓地へ送り、送ったカードの名前を記録に出す（墓地は公開の場所なので、手札・デッキ・裏側から送るカードも名前を出してよい）。
 *  効果を受けないカードは送られないので、記録にも出さない */
export function sendToGyLogged(s           , uids          , reason        , by                  )       {
  const moving = uids.filter(x => !(reason === 'effect' && isImmune(s, x)));
  if (moving.length) log(s, `${moving.map(u => nameOf(s, u)).join('、')}を墓地へ送る`);
  sendToGy(s, uids, reason, by);
}
/** 墓地へ送る。手札を捨てる場合（reason 'discard'）は、誰の効果で捨てたか（by）を記録する。
 *  by を省略すると、処理中の効果のプレイヤー、または発動の手続き中（コスト）のプレイヤー。どちらでもなければルールによるもの（null） */
export function sendToGy(s           , uids          , reason        , by                  )       {
  const befores             = [];
  const who = by !== undefined ? by : (s.resolving?.player ?? s.activating ?? null);
  for (const u of uids.filter(x => !(reason === 'effect' && isImmune(s, x)))) {
    const c = s.cards[u];
    const from = c.zone;
    const before = cloneCard(c);
    moveCard(s, u, 'gy');
    // 手札から捨てられた場合、誰の効果で捨てられたかをカードに記録する（暗黒界：「相手の効果で捨てられた場合」）。-1 はルール
    if (from === 'hand' && reason === 'discard') s.cards[u].counters.discardBy = who === null ? -1 : who;
    if (reason === 'release') emit(s, { type: 'released', uid: u, from, reason });
    emit(s, { type: 'toGy', uid: u, from, reason, by: who });
    // 演出用：手札から墓地へ（手札が開く演出）。融合素材・リリースは召喚の演出で見せるので除く
    // cost：発動の手続き中（コスト）に捨てた。効果で捨てた（手札断殺・暗黒界の取引）と画面で見分けるため
    const cost = inCost(s);
    if (from === 'hand' && reason !== 'material' && reason !== 'release') pushAnim(s, { kind: 'discard', uid: u, player: c.owner, ...(cost ? { cost: true } : {}), ...(cost && procPaying ? { proc: true } : {}) });
    // 演出用：発動のコストで、手札を捨てる以外の動き（リリース・場やデッキから墓地へ送る）
    else if (cost) pushAnim(s, { kind: 'cost', uid: u, player: c.owner, from, to: 'gy', reason, ...(procPaying ? { proc: true } : {}) });
    if (FIELD_ZONES.includes(from)) { emit(s, { type: 'leftField', uid: u, from, reason, wasFaceUp: before.faceUp }); befores.push(before); }
  }
  if (befores.length) leaveCleanup(s, befores, reason);
}
/** デッキの上からカードを n 枚墓地へ送る（デッキが足りなければ全て） */
export function millTop(s           , p          , n        , reason         = 'effect')           {
  const deck = s.players[p].deck;
  const list = deck.slice(Math.max(0, deck.length - n)).reverse();
  if (!list.length) return [];
  log(s, `${pl(p)}：デッキの上から${list.length}枚を墓地へ送る（${list.map(u => nameOf(s, u)).join('、')}）`);
  sendToGy(s, list, reason);
  return list;
}
/** ランダムに1つ選ぶ（デュエルの乱数を使う） */
export function randomOf   (s           , arr     )           {
  if (!arr.length) return null;
  return arr[Math.floor(nextRandom(s) * arr.length)];
}
export function release(s           , uids          , reason         = 'release')       {
  if (!uids.length) return;
  log(s, `${uids.map(u => nameOf(s, u)).join('、')}をリリース`);
  sendToGy(s, uids, reason === 'cost' ? 'cost' : 'release');
}
export function banish(s           , uids          , reason        )       {
  const befores             = [];
  for (const u of uids.filter(x => !(reason === 'effect' && isImmune(s, x)) && !(gyCardLocked(s, x) && (noteValley(s), true)))) {
    const c = s.cards[u]; const from = c.zone; const before = cloneCard(c);
    moveCard(s, u, 'banished');
    emit(s, { type: 'banished', uid: u, from, reason });
    if (inCost(s)) pushAnim(s, { kind: 'cost', uid: u, player: c.owner, from, to: 'banished', reason, ...(procPaying ? { proc: true } : {}) }); // 演出用：発動のコストで除外
    if (FIELD_ZONES.includes(from)) { emit(s, { type: 'leftField', uid: u, from, reason, wasFaceUp: before.faceUp }); befores.push(before); }
  }
  if (befores.length) leaveCleanup(s, befores, reason);
}
/** 破壊（フィールドのカードのみ）。banish=true で「破壊し除外する」 */
/** 装備モンスターの身代わりになるユニオンの装備カード */
export function unionGuardOf(s           , uid        )                {
  for (const e of equipsOf(s, uid)) if (s.cards[e].faceUp && scriptOf(s, e).unionGuard) return e;
  return null;
}
/** このターン破壊されない状態か（D-HERO ドレッドガイ②） */
export function protectedFromDestroy(s           , uid        )          {
  const c = s.cards[uid];
  return isMonsterZone(c) && c.faceUp && defOf(s, uid).name.startsWith('D-HERO') && s.lingering.some(l => l.type === 'dheroProtect' && l.player === c.controller && l.turn === s.turn);
}
export function destroy(s           , uids          , reason        , opt                                            = {})           {
  if (!opt.summoning) uids = uids.filter(u => {
    const c = s.cards[u];
    if (!isMonsterZone(c) || !c.faceUp || monsterNegated(s, u)) return true;
    const opts = scriptOf(s, u).destroyReplaceHand?.(s, u) ?? [];
    if (!opts.length) return true;
    const x = ctxOf(s, u, c.controller, null);
    if (!choose(x, { kind: 'yesno', prompt: `${nameOf(s, u)}が破壊される代わりに、手札のカードを捨てますか？` })) return true;
    const h = chooseOne(x, '代わりに捨てる手札を選んでください', opts) ;
    log(s, `${nameOf(s, u)}が破壊される代わりに${nameOf(s, h)}を捨てる`);
    sendToGy(s, [h], 'discard', c.controller);
    return false;
  });
  // 効果で破壊される場合、ユニオンの装備カードを代わりに破壊する
  if (reason === 'effect' && !opt.summoning) uids = [...new Set(uids.map(u => { if (!isMonsterZone(s.cards[u])) return u; const gd = unionGuardOf(s, u); if (gd !== null && !uids.includes(gd)) { log(s, `${nameOf(s, u)}の代わりに${nameOf(s, gd)}を破壊`); return gd; } return u; }))];
  const list = uids.filter(u => isOnField(s.cards[u]) && !(reason === 'effect' && isImmune(s, u)) && !(protectedFromDestroy(s, u) && !opt.summoning)
    && !(reason === 'effect' && isActive(s, u) && scriptOf(s, u).indestructibleByEffect?.(s, u)));
  if (!list.length) return [];
  const befores             = [];
  for (const u of list) {
    const c = s.cards[u]; const zone = c.zone; const before = cloneCard(c);
    // 召喚を無効にされ破壊されたモンスターはフィールドのカードとして扱わない（公式Q&A：神の宣告と補給部隊）
    const from = opt.summoning ? 'summoning'          : zone;
    moveCard(s, u, opt.banish ? 'banished' : 'gy');
    // どの効果で破壊されたか（ユベル④「③の効果以外で破壊された時」の判定用）
    emit(s, { type: 'destroyed', uid: u, from, reason, srcUid: s.resolving?.uid ?? null, srcEffect: s.resolving?.effect ?? null, prevCounters: before.counters, controller: before.controller });
    if (reason !== 'battle') pushAnim(s, { kind: 'destroy', uid: u, src: s.resolving?.uid ?? null }); // 演出用：効果などによる破壊（src：どのカードの効果か）
    if (opt.banish) emit(s, { type: 'banished', uid: u, from: zone, reason });
    else emit(s, { type: 'toGy', uid: u, from, reason });
    if (!opt.summoning) emit(s, { type: 'leftField', uid: u, from: zone, reason, wasFaceUp: before.faceUp });
    befores.push(before);
  }
  log(s, `${list.map(u => nameOf(s, u)).join('、')}を破壊${opt.banish ? 'し除外' : ''}`);
  for (const b of befores) scriptOf(s, b.uid).onDestroyed?.(s, b, reason);
  // 「そのモンスターが破壊された時にこのカードは破壊される」（リビングデッドの呼び声）
  const linked           = [];
  for (const p of [0, 1]              ) for (const u of s.players[p].szone) {
    if (u === null || !scriptOf(s, u).destroyWhenLinkDestroyed) continue;
    const c = s.cards[u];
    if (befores.some(b => b.uid === c.link && b.serial === c.linkSerial)) linked.push(u);
  }
  leaveCleanup(s, befores, reason);
  if (linked.length) destroy(s, linked.filter(u => isOnField(s.cards[u])), 'rule');
  return list;
}
export function addToHand(s           , uids          , reason         = 'effect')       {
  const befores             = [];
  uids = uids.filter(x => !(reason === 'effect' && isImmune(s, x)) && !(reason === 'effect' && gyCardLocked(s, x) && (noteValley(s), true)));
  for (const u of uids) {
    const c = s.cards[u]; const from = c.zone; const before = cloneCard(c);
    moveCard(s, u, 'hand');
    emit(s, { type: 'toHand', uid: u, from, reason });
    if (from === 'deck') pushAnim(s, { kind: 'search', uid: u, player: s.cards[u].owner }); // 演出用：デッキから手札に加えた
    if (FIELD_ZONES.includes(from)) { emit(s, { type: 'leftField', uid: u, from, reason, wasFaceUp: before.faceUp }); befores.push(before); }
  }
  if (uids.length) log(s, `${uids.map(u => nameOf(s, u)).join('、')}を手札に加える`);
  if (befores.length) leaveCleanup(s, befores, reason);
}
export function payLp(s           , p          , amount        )       {
  s.players[p].lp = Math.max(0, s.players[p].lp - amount);
  log(s, `${pl(p)}：${amount}LPを払う（LP ${s.players[p].lp}）`);
  pushAnim(s, { kind: 'lp', player: p, amount, cost: inCost(s), ...(inCost(s) && procPaying ? { proc: true } : {}) }); // 演出用：LPを払った
  checkLp(s);
}
export function gainLp(s           , p          , amount        )       {
  if (amount <= 0) return;
  s.players[p].lp += amount;
  log(s, `${pl(p)}：${amount}LP回復（LP ${s.players[p].lp}）`);
}
export function effectDamage(s           , p          , amount        )       {
  if (amount <= 0) return;
  if (damageZero(s, p)) { log(s, `${pl(p)}が受ける${amount}の効果ダメージは0になった`); return; }
  s.players[p].lp = Math.max(0, s.players[p].lp - amount);
  emit(s, { type: 'damage', player: p, amount, battle: false });
  log(s, `${pl(p)}に${amount}の効果ダメージ（LP ${s.players[p].lp}）`);
  checkLp(s);
}
/**
 * 効果の処理中に、ネクロバレーで守られた墓地のカードへ及ぶ部分が無効になった時の記録（1つの処理につき1回）。
 * 記録に「〜の効果はネクロバレーの効果で無効」、演出用に { kind:'negate', uid:処理中のカード, by:ネクロバレー }
 */
export function noteValley(s           )       {
  const r = s.resolving;
  if (!r) return;
  // 同じ処理の中で2回目なら記録しない（s.resolving は前の盤面と共有されることがあるので、書きこまずに演出の記録で見分ける）
  const anim = (s.anim ?? [])                                                 ;
  let lastResolve = -1;
  for (const a of anim) if (a.kind === 'resolve' && a.uid === r.uid) lastResolve = a.seq;
  if (anim.some(a => a.kind === 'negate' && a.uid === r.uid && a.seq > lastResolve)) return;
  const v = activeCards(s).find(u => scriptOf(s, u).necroValley) ?? null;
  log(s, `「${defOf(s, r.uid).name}」の効果は、${v !== null ? `「${defOf(s, v).name}」` : 'ネクロバレー'}の効果で無効になった（墓地のカードへ及ぶ効果）`);
  pushAnim(s, { kind: 'negate', uid: r.uid, by: v });
}
/** 発動の手続き中（コストを払う・対象を選ぶ間）か。効果の処理中は違う（処理の中でさらに発動の手続きはしない） */
function inCost(s           )          { return s.activating !== null && s.activating !== undefined && !s.resolving; }
/** 召喚の手順（混沌帝龍・グラファ①など）で払っている間（演出用の印 proc を付けるだけ。ルールには使わない） */
let procPaying = false;
/** 画面の演出用の記録を足す（ルールの処理には使わない） */
export function pushAnim(s           , a                         )       {
  (s.anim ??= []).push({ ...(a          ), seq: (s.animSeq = (s.animSeq ?? 0) + 1) }         );
  if (s.anim.length > 40) s.anim.shift();
}
export function addLingering(s           , l           )       { s.lingering.push(l); }

/** 特殊召喚できるか（召喚条件・正規の召喚・置き場所） */
export function canSpecialSummon(s           , uid        , p          , how            = 'special', released           = [], src                = s.resolving?.uid ?? null)          {
  const c = s.cards[uid], d = defOf(s, uid);
  // ネクロバレー：墓地のモンスターを特殊召喚する効果も、発動はできる（発動の条件を見る時・コストや対象を選ぶ時は守られていない扱い）。
  // 処理の時（resolving）に、墓地のカードへ及ぶ効果として無効になる（公式Q&A [10691] 炎王炎環・[9597]）
  if (s.resolving && gyCardLocked(s, uid, src)) { noteValley(s); return false; }
  if (scriptOf(s, uid).uniqueOnField && monstersOf(s, p).some(u => s.cards[u].faceUp && s.cards[u].code === c.code)) return false;
  if (d.kind !== 'monster') return false;
  const sc = scriptOf(s, uid);
  if (how === 'ignore') {
    if (summonLockedFor(s, p, src) || specialLocked(s, p)) return false;
    if (c.zone === 'extra' && extraLocked(s, p)) return false;
    // 「召喚条件を無視して特殊召喚する」：ただし正規の召喚をしていないものは墓地・除外からは出せない
    if ((c.zone === 'gy' || c.zone === 'banished') && (sc.specialSummonOk || d.frame === 'ritual' || d.frame === 'fusion') && !c.proper) return false;
    if (d.frame === 'fusion' && c.zone === 'extra') return extraSummonZone(s, p, released) !== null;
    return freeMZones(s, p, released).length > 0;
  }
  if (summonLockedFor(s, p, src) || specialLocked(s, p)) return false;
  if (c.zone === 'extra' && extraLocked(s, p)) return false;
  if (sc.fusionOnly && how !== 'fusion') return false;
  if (sc.specialSummonOk && !sc.specialSummonOk(s, uid, how, src)) return false;
  if (d.frame === 'ritual' && how !== 'ritual') {
    if (c.zone !== 'gy' && c.zone !== 'banished') return false;
    if (!c.proper) return false;
    if (c.zone === 'banished' && !c.faceUp) return false;
  }
  if (d.frame === 'fusion' && how !== 'fusion') {
    if (c.zone !== 'gy' && c.zone !== 'banished') return false;
    if (!c.proper) return false;
  }
  if (d.frame === 'fusion' && c.zone === 'extra') return extraSummonZone(s, p, released) !== null;
  return freeMZones(s, p, released).length > 0;
}

/** 特殊召喚する。position を省略すると表側攻撃表示・表側守備表示をプレイヤーが選ぶ */
/** 効果などで特殊召喚するマス。画面で遊ぶ人（s.askZone）には聞く（空いているマスが1つなら聞かない）。それ以外は左から詰める */
export function pickMZone(x     , uid        , p          )         {
  const s = x.s, free = freeMZones(s, p);
  if (free.length <= 1 || !s.askZone?.includes(p)) return free[0];
  const i = choose(x, { kind: 'option', prompt: `${nameOf(s, uid)}を出すモンスターゾーン`, options: free.map(z => `モンスターゾーン${z + 1}`), player: p });
  return free[i] ?? free[0];
}
export function specialSummon(x     , uids          , opt                                                                                   = {})           {
  const s = x.s, p = opt.player ?? x.player, how = opt.how ?? 'special';
  const done           = [];
  const fromZones                           = {};
  for (const uid of uids) {
    if (!canSpecialSummon(s, uid, p, how, [], x.self)) continue;
    const pos = opt.position ?? (choose(x, { kind: 'option', prompt: `${nameOf(s, uid)}の表示形式`, options: ['表側攻撃表示', '表側守備表示'] }) === 0 ? 'atk' : 'def');
    const c = s.cards[uid];
    const sc = scriptOf(s, uid);
    fromZones[uid] = c.zone;
    if (c.zone === 'extra') s.opt[`${p}:extraAny`] = s.turn;
    const faceUp = pos !== 'faceDownDef';
    const position = pos === 'atk' ? 'atk' : 'def';
    if (defOf(s, uid).frame === 'fusion' && c.zone === 'extra') {
      const z = extraSummonZone(s, p) ;
      moveCard(s, uid, z.zone, { index: z.index, faceUp, position, controller: p });
    } else {
      moveCard(s, uid, 'mzone', { index: pickMZone(x, uid, p), faceUp, position, controller: p });
    }
    const n = s.cards[uid];
    if (how === 'ritual' || how === 'fusion') n.proper = true;
    // 召喚条件のあるモンスター：条件どおりの特殊召喚なら「正規の特殊召喚」（その後は墓地から蘇生できる）
    if (how !== 'ignore' && sc.properSpecial?.(s, uid, how, x.self)) n.proper = true;
    n.summonedHow = how === 'ignore' ? 'special' : how;
    n.summonedTurn = s.turn;
    done.push(uid);
  }
  if (done.length) {
    markSummoned(s, p, true);
    log(s, `${pl(p)}：${done.map(u => s.cards[u].faceUp ? nameOf(s, u) : '裏側守備表示のモンスター').join('、')}を${how === 'ritual' ? '儀式召喚' : how === 'fusion' ? '融合召喚' : '特殊召喚'}`);
    for (const u of done) if (s.cards[u].faceUp) scriptOf(s, u).onSpecialSummoned?.(s, u);
    for (const u of done) emit(s, { type: 'summoned', uid: u, player: p, how: how === 'ignore' ? 'special' : how, from: fromZones[u] });
    for (const u of done) pushAnim(s, { kind: 'summon', uid: u, how: !s.cards[u].faceUp ? 'set' : how === 'ignore' ? 'special' : how, mats: s.animMats ?? [], from: fromZones[u] });
    s.animMats = undefined;
  }
  return done;
}

/** モンスターを裏側守備表示にする（効果）。表側表示の間に受けていた効果はなくなる */
export function setFaceDown(s           , uids          )           {
  const done           = [];
  for (const u of uids) {
    const c = s.cards[u];
    if (!isMonsterZone(c) || (!c.faceUp && c.position === 'def') || isImmune(s, u)) continue;
    if (c.faceUp) { c.pub = true; c.lastUp = currentStats(s, u); } // 表側の間にカード名と攻守は見られている（裏側にしても相手は中身を知っている）
    c.faceUp = false; c.position = 'def'; c.mods = []; c.counters = {};
    done.push(u);
  }
  if (done.length) { log(s, `${done.map(u => nameOf(s, u)).join('、')}を裏側守備表示にする`); cleanupOrphans(s); }
  return done;
}
/** モンスターの表示形式を変更する（効果）。裏側守備表示は表側攻撃表示にする */
export function changePositionByEffect(s           , u        , to                , noFlip = false)       {
  const c = s.cards[u];
  if (!isMonsterZone(c) || isImmune(s, u)) return;
  const wasDown = !c.faceUp;
  c.position = to ?? (c.position === 'atk' ? 'def' : 'atk');
  c.faceUp = true;
  log(s, `${nameOf(s, u)}を${c.position === 'atk' ? '攻撃' : '守備'}表示にする`);
  if (wasDown && !noFlip) emit(s, { type: 'flipped', uid: u });
}
/** モンスターのコントロールを p が得る（同じカードのまま移す）。untilEnd ならこのターンのエンドフェイズに戻す */
export function takeControl(s           , u        , p          , untilEnd = true)          {
  const c = s.cards[u];
  if (!isMonsterZone(c) || c.controller === p || isImmune(s, u)) return false;
  const z = freeMZones(s, p);
  if (!z.length) return false;
  const from = c.controller;
  removeFromZone(s, u);
  c.controller = p; c.zone = 'mzone'; c.index = z[0]; s.players[p].mzone[z[0]] = u;
  log(s, `${pl(p)}：${nameOf(s, u)}のコントロールを得た`);
  if (untilEnd) addLingering(s, { type: 'returnControl', uid: u, serial: c.serial, player: from, turn: s.turn });
  return true;
}
/** 効果の処理の中で、手札のモンスターをリリースなしで通常召喚（set ならセット）する（死皇帝の陵墓）。召喚は無効にされず、成功時の誘発効果はチェーンの処理後に発動する */
export function normalSummonNow(x     , uid        , set         )          {
  const s = x.s, p = x.player, me = s.players[p];
  const z = freeMZones(s, p);
  if (me.normalSummonUsed || !z.length || s.cards[uid].zone !== 'hand') return false;
  const want = x.link?.data.zone                      ;
  moveCard(s, uid, 'mzone', { index: want !== undefined && z.includes(want) ? want : pickMZone(x, uid, p), faceUp: !set, position: set ? 'def' : 'atk', controller: p });
  me.normalSummonUsed = true;
  const c = s.cards[uid];
  if (set) { log(s, `${pl(p)}：モンスターをセット`); emit(s, { type: 'set', uid, player: p }); pushAnim(s, { kind: 'summon', uid, how: 'set', mats: [] }); return true; }
  c.summonedHow = 'normal'; c.summonedTurn = s.turn;
  markSummoned(s, p);
  log(s, `${pl(p)}：${nameOf(s, uid)}をリリースなしで通常召喚`);
  pushAnim(s, { kind: 'summon', uid, how: 'normal', mats: [] });
  emit(s, { type: 'summoned', uid, player: p, how: 'normal' });
  return true;
}
/** 2体のモンスターのコントロールを入れ替える（強制転移） */
export function swapControl(s           , a        , b        )          {
  const ca = s.cards[a], cb = s.cards[b];
  if (!isMonsterZone(ca) || !isMonsterZone(cb) || ca.controller === cb.controller || isImmune(s, a) || isImmune(s, b)) return false;
  const pa = ca.controller, pb = cb.controller, ia = ca.index, ib = cb.index, za = ca.zone, zb = cb.zone;
  removeFromZone(s, a); removeFromZone(s, b);
  // 入れ替わったモンスターは、相手のモンスターがいた場所に置く（EXモンスターゾーンにいた場合はメインモンスターゾーンの空きへ）
  const put = (u        , p          , idx        , z          ) => {
    const c = s.cards[u]; c.controller = p;
    const i = z === 'mzone' && s.players[p].mzone[idx] === null ? idx : s.players[p].mzone.findIndex(v => v === null);
    c.zone = 'mzone'; c.index = i; s.players[p].mzone[i] = u;
  };
  put(a, pb, ib, zb); put(b, pa, ia, za);
  log(s, `${nameOf(s, a)}と${nameOf(s, b)}のコントロールを入れ替えた`);
  return true;
}
/** 効果の処理の中で、手札のモンスターをアドバンス召喚する（連撃の帝王）。通常召喚の回数は使わない */
export function advanceSummonNow(x     , uid        , tributes          )          {
  const s = x.s, p = x.player;
  if (s.cards[uid].zone !== 'hand') return false;
  newStep(s);
  release(s, tributes, 'release');
  const z = freeMZones(s, p);
  if (!z.length) return false;
  newStep(s);
  moveCard(s, uid, 'mzone', { index: z[0], faceUp: true, position: 'atk', controller: p });
  const c = s.cards[uid]; c.summonedHow = 'advance'; c.summonedTurn = s.turn; c.counters.tributes = tributes.length;
  markSummoned(s, p);
  log(s, `${pl(p)}：${nameOf(s, uid)}をアドバンス召喚`);
  pushAnim(s, { kind: 'summon', uid, how: 'advance', mats: tributes });
  emit(s, { type: 'summoned', uid, player: p, how: 'advance' });
  return true;
}
/** カードを装備する（装備魔法、または装備カード扱いのモンスター） */
export function equipCard(s           , equip        , target        , opt                                                    = {})          {
  const p = s.cards[target].controller;
  const c = s.cards[equip];
  // stay：装備魔法は、相手のモンスターに装備しても自分の魔法＆罠ゾーンに残る
  if (!(opt.stay && c.zone === 'szone') && (c.zone !== 'szone' || c.controller !== p)) {
    const zones = freeSZones(s, p);
    if (!zones.length) return false;
    const from = c.zone;
    moveCard(s, equip, 'szone', { index: zones[0], faceUp: opt.faceUp ?? true, controller: p });
    if (FIELD_ZONES.includes(from)) emit(s, { type: 'leftField', uid: equip, from, reason: 'effect' });
  }
  const e = s.cards[equip];
  e.equippedTo = target;
  e.equipSerial = s.cards[target].serial;
  e.equipBy = opt.by !== undefined ? `${opt.by}:${s.cards[opt.by].serial}` : null;
  // モンスターが装備カードになった時（ユニオン）：そのモンスターに装備されていたカードは装備対象を失うので破壊する
  cleanupOrphans(s);
  return true;
}
export function linkCards(s           , card        , monster        )       {
  s.cards[card].link = monster;
  s.cards[card].linkSerial = s.cards[monster].serial;
}

/** 発動を無効にし破壊する */
export function negateActivation(s           , link           , andDestroy = true)       {
  link.negated = true;
  pushAnim(s, { kind: 'negate', uid: link.uid }); // 演出用：無効
  log(s, `${nameOf(s, link.uid)}の発動を無効にした`);
  if (andDestroy && sameCard(s, link.uid, link.serial) && isOnField(s.cards[link.uid])) destroy(s, [link.uid], 'effect');
}
/** 召喚を無効にし破壊する */
export function negateSummon(s           , uid        , how                                            = 'normal')       {
  pushAnim(s, { kind: 'negate', uid }); // 演出用：無効
  log(s, `${nameOf(s, uid)}の${how === 'flip' ? '反転召喚' : '召喚'}を無効にした`);
  s.cards[uid].summoning = false;
  // 反転召喚は既にフィールドにあったカードなので、モンスターゾーンで破壊された扱い（公式Q&A：幻影騎士団ブレイクソード）
  destroy(s, [uid], 'effect', { summoning: how !== 'flip' });
}

/* =====================================================================
 * 選択（答えを記録して、手順を最初からやり直す方式）
 * ===================================================================== */
class NeedChoice { request               ; constructor(request               ) { this.request = request; } }
let ANSWERS            = [];
let AIDX = 0;

               
                                                                                                                        
                                                        
                                                                             

                                                                                                                                                                    
                                                                                                   
                                                                                                                      
export function choose(x     , req          )          {
  const r = { ...req, player: req.player ?? x.player }                 ;
  // 選択の余地が無いものは自動で決める
  if (r.kind === 'cards') {
    if (r.max === 0 || r.options.length === 0) return [];
    if (!r.rule && r.min === r.max && r.options.length === r.min) return [...r.options];
  }
  if (r.kind === 'option' && r.options.length === 1) return 0;
  if (AIDX < ANSWERS.length) return ANSWERS[AIDX++];
  throw new NeedChoice(r);
}
/** カードを1枚選ぶ（候補が無ければ null） */
export function chooseOne(x     , prompt        , options          , player           )                {
  if (!options.length) return null;
  return choose(x, { kind: 'cards', prompt, options, min: 1, max: 1, player })[0];
}

function levelOf(s           , u        )         { return defOf(s, u).level ?? 0; }
export function validateAnswer(s           , req               , value         )                {
  if (req.kind === 'yesno') return typeof value === 'boolean' ? null : 'はい・いいえで答えてください';
  if (req.kind === 'option') return Number.isInteger(value) && (value          ) >= 0 && (value          ) < req.options.length ? null : '選択肢から選んでください';
  if (!Array.isArray(value)) return 'カードを選んでください';
  const v = value            ;
  if (new Set(v).size !== v.length || v.some(u => !req.options.includes(u))) return '選べないカードが含まれています';
  if (v.length < req.min || v.length > req.max) return req.min === req.max ? `${req.min}枚選んでください` : `${req.min}〜${req.max}枚選んでください`;
  if (req.rule?.type === 'levelAtLeast') {
    const sum = v.reduce((a, u) => a + levelOf(s, u), 0);
    if (sum < req.rule.target) return `レベルの合計が${req.rule.target}以上になるように選んでください`;
    if (v.some(u => sum - levelOf(s, u) >= req.rule .target)) return '必要以上にリリースすることはできません';
  }
  if (req.rule?.type === 'levelEqual') {
    const sum = v.reduce((a, u) => a + levelOf(s, u), 0);
    if (sum !== req.rule.target) return `レベルの合計がちょうど${req.rule.target}になるように選んでください`;
  }
  if (req.rule?.type === 'distinctNames') {
    const names = v.map(u => defOf(s, u).name);
    if (new Set(names).size !== names.length) return '同じ名前のカードは選べません';
  }
  return null;
}

/** レベル合計の条件を満たす組み合わせがあるか */
export function hasLevelCombo(s           , uids          , target        , mode                     )          {
  const lv = uids.map(u => levelOf(s, u)).filter(l => l > 0);
  if (mode === 'atLeast') return lv.reduce((a, b) => a + b, 0) >= target;
  const reach = new Set        ([0]);
  for (const l of lv) for (const r of [...reach]) if (r + l <= target) reach.add(r + l);
  return reach.has(target);
}

/* =====================================================================
 * 手順の実行
 * ===================================================================== */
function runProc(s           , proc      , answers           )       {
  const base = cloneState(s);
  ANSWERS = answers; AIDX = 0;
  try {
    execProc(s, proc);
  } catch (e) {
    if (!(e instanceof NeedChoice)) throw e;
    // 途中まで進めた状態を表示用に残し（コストを払った後の盤面など）、答えが出たら base からやり直す
    s.pending = { request: e.request, proc, answers, base };
  } finally {
    ANSWERS = []; AIDX = 0;
  }
}

function execProc(s           , proc      )       {
  switch (proc.type) {
    case 'activate': return doActivate(s, proc.player, proc.uid, proc.effect, proc.zone);
    case 'resolveLink': return resolveLink(s);
    case 'settle': return settle(s, proc.chained);
    case 'handLimit': return handLimit(s);
    case 'battle': return battleProc(s, proc.step);
    case 'phaseStart': return phaseStart(s);
    case 'procSummon': return doProcSummon(s, proc.player, proc.uid);
  }
}

/** 召喚方法が決まった特殊召喚（混沌帝龍・グラファ①）。チェーンブロックを作らず、特殊召喚する際に神の宣告などで無効にできる */
function doProcSummon(s           , p          , uid        )       {
  const sc = scriptOf(s, uid).procSummon ;
  const x = ctxOf(s, uid, p, null);
  newStep(s);
  s.activating = p; procPaying = true;
  try { sc.pay(x); } finally { s.activating = null; procPaying = false; }
  const fromExtra = s.cards[uid].zone === 'extra';
  if (fromExtra) s.opt[`${p}:extraAny`] = s.turn;
  const ez = fromExtra ? extraSummonZone(s, p) : null;
  if (fromExtra ? !ez : !freeMZones(s, p).length) throw new RuleError('モンスターゾーンに空きがありません');
  newStep(s);
  const pos = choose(x, { kind: 'option', prompt: `${nameOf(s, uid)}の表示形式`, options: ['表側攻撃表示', '表側守備表示'] }) === 0 ? 'atk' : 'def';
  if (ez) moveCard(s, uid, ez.zone, { index: ez.index, faceUp: true, position: pos, controller: p });
  else moveCard(s, uid, 'mzone', { index: pickMZone(x, uid, p), faceUp: true, position: pos, controller: p });
  s.cards[uid].summoning = true;
  s.cards[uid].counters.byProc = 1; // 「この方法で特殊召喚した場合」（D-HERO ドグマガイ）
  // 「この方法による特殊召喚は1ターンに1度」：成功した時に記録する（無効にされた場合はもう一度できる）
  if (sc.opt) s.cards[uid].counters.procTurn = s.turn;
  log(s, `${pl(p)}：${nameOf(s, uid)}を特殊召喚する`);
  s.window = { kind: 'priority', player: p, passes: 0, mode: 'summoning', cont: { type: 'summon', uid, how: 'special', player: p } };
}

/** 処理を進める。プレイヤーの選択か行動が必要になったら止まる */
function flow(s           )       {
  for (let guard = 0; guard < 5000; guard++) {
    if (s.winner !== null || s.pending) return;
    if (s.queue.length) { const p = s.queue.shift() ; runProc(s, p, []); continue; }
    const w = s.window;
    if (w.kind === 'priority' && activatableList(s, w.player).length === 0) { passPriority(s); continue; }
    return;
  }
  throw new Error('処理が終わりません（無限ループ）');
}

/* =====================================================================
 * 優先権・チェーン
 * ===================================================================== */
function currentMode(s           )                      {
  return s.battle && ['dsStart', 'beforeCalc', 'afterCalc', 'dsEnd', 'end'].includes(s.battle.step) ? 'damage' : 'normal';
}

function passPriority(s           )       {
  const w = s.window;
  if (w.kind !== 'priority') return;
  w.passes += 1;
  if (w.passes < 2) { w.player = opp(w.player); return; }
  if (s.chain.length) { s.queue.unshift({ type: 'resolveLink' }); return; }
  finishWindow(s, w.cont);
}

/** お互いが何もしなかった（チェーンなし）時の続き */
function finishWindow(s           , cont      )       {
  s.window = { kind: 'open', respondDue: false };
  switch (cont.type) {
    case 'none': return;
    case 'phase': return changePhase(s, cont.to);
    case 'endTurn': s.queue.push({ type: 'handLimit' }); return;
    case 'deferred': performMain(s, cont.action); return;
    case 'summon': return completeSummon(s, cont.uid, cont.how, cont.player);
    case 'battle': s.queue.push({ type: 'battle', step: cont.step }); return;
  }
}

/** チェーン（または処理のまとまり）が終わった後：誘発効果をチェーンに積み、無ければ続きへ */
function settle(s           , chained         )       {
  s.lastEvents = s.events.filter(e => e.step === s.step);
  s.events = [];
  // 召喚成功時に効果を発動できない場合は、誘発効果も発動できない
  const locked = s.lockStep != null && s.lockStep === s.step;
  const trig = locked ? [] : s.triggers.filter(t => triggerStillValid(s, t));
  s.triggers = [];
  if (trig.length) {
    buildTriggerChain(s, trig);
    if (s.chain.length) {
      if (!s.chainCont) s.chainCont = { type: 'none' };
      s.window = { kind: 'priority', player: s.turnPlayer, passes: 0, mode: currentMode(s), cont: s.chainCont };
      return;
    }
  }
  const cont = s.chainCont ?? { type: 'none' };
  s.chainCont = null;
  afterSegment(s, cont, chained);
}

function afterSegment(s           , cont      , chained         )       {
  switch (cont.type) {
    case 'summon':
      if (s.cards[cont.uid].summoning) return completeSummon(s, cont.uid, cont.how, cont.player);
      s.window = { kind: 'open', respondDue: true };
      return;
    case 'battle':
      if (cont.step === 'end') {
        // 戦闘で破壊したモンスターを墓地へ送った後（ダメージステップ終了時）にも発動の機会がある（デステニー・シグナルなど「戦闘で破壊され墓地へ送られた時」）
        if (s.battle && !s.battle.endWindow && !s.battle.negated) { s.battle.endWindow = true; s.window = { kind: 'priority', player: s.turnPlayer, passes: 0, mode: 'damage', cont }; return; }
        s.battle = null; s.window = { kind: 'open', respondDue: true }; return;
      }
      // 攻撃が無効になった：その攻撃はここで終わる（攻撃したモンスターは攻撃した扱いのまま）
      if (s.battle?.negated) { s.battle = null; s.window = { kind: 'open', respondDue: true }; return; }
      s.window = { kind: 'priority', player: s.turnPlayer, passes: 0, mode: currentMode(s), cont };
      return;
    case 'phase':
      // ドロー・スタンバイフェイズ中なら、そのフェイズの発動機会をもう一度与える。メインフェイズ等でフェイズ移行の前に相手が発動した場合は移行を取りやめる
      if (s.phase === 'draw' || s.phase === 'standby') { s.window = { kind: 'priority', player: s.turnPlayer, passes: 0, mode: 'normal', cont }; return; }
      s.window = { kind: 'open', respondDue: true };
      return;
    default:
      void chained;
      s.window = { kind: 'open', respondDue: true };
  }
}

function triggerStillValid(s           , t             )          {
  const c = s.cards[t.uid];
  if (c.serial !== t.serial) return false;          // 誘発後に移動した
  if (!t.mandatory && t.when && t.step !== s.step) return false; // タイミングを逃した
  const eff = (scriptOf(s, t.uid).effects || []).find(e => e.id === t.effect) ;
  if (!optAvailable(s, t.uid, eff, t.player)) return false;
  if (activationBlockedByName(s, t.uid, t.player)) return false;
  if (activationForbidden(s, t.uid, eff, t.player)) return false;
  // ネクロバレー：墓地で発動する効果も発動はできる（処理の時に、墓地のカードへ及ぶ部分だけ無効。公式Q&A [14586]・[12869]・[23407]）。
  // ただし、墓地のカードを除外するコストが要る効果は、除外できないので発動できない（[115]・[12764]）
  if (eff.costBanishGy && s.cards[t.uid].zone === 'gy' && gyLocked(s, s.cards[t.uid].owner, t.uid)) return false;
  // ダメージステップには、ダメージステップでも発動できる効果しか発動できない（生還の宝札など）
  if (currentMode(s) === 'damage' && !eff.damageStep) return false;
  // 対象を取る効果などで発動の条件を満たさない場合は、強制効果でも発動しない（暗黒界の龍神 グラファ②：相手フィールドにカードが無い）
  if (eff.can && !eff.can(ctxOf(s, t.uid, t.player, null))) return false;
  if (eff.activate && targetGuardOn(s) && !activationPossible(s, t.uid, t.player, eff)) return false;
  return true;
}

function buildTriggerChain(s           , trig               )       {
  const tp = s.turnPlayer;
  const groups                        = [[tp, true], [opp(tp), true], [tp, false], [opp(tp), false]];
  for (const [p, mand] of groups) {
    let list = trig.filter(t => t.player === p && t.mandatory === mand);
    if (!mand) list = list.filter(t => choose(ctxOf(s, t.uid, p, null), { kind: 'yesno', prompt: `${nameOf(s, t.uid)}の効果を発動しますか？` }));
    while (list.length) {
      let t = list[0];
      if (list.length > 1) {
        const pick = chooseOne(ctxOf(s, t.uid, p, null), '先にチェーンに組む効果を選んでください', list.map(x => x.uid)) ;
        t = list.find(x => x.uid === pick) ;
      }
      list = list.filter(x => x !== t);
      activateEffect(s, p, t.uid, t.effect);
      // 「このカード名の効果は1ターンに1度」：同時に誘発した同名カードは発動できなくなる
      list = list.filter(x => { const e = (scriptOf(s, x.uid).effects || []).find(f => f.id === x.effect) ; return optAvailable(s, x.uid, e, x.player); });
    }
  }
  // 誘発効果の発動にも、光と闇の竜は必ずチェーンする（一番上の発動に）
  const top = s.chain[s.chain.length - 1];
  if (top && trig.some(t => t.uid === top.uid)) forcedResponses(s, top);
}

export function ctxOf(s           , self        , player          , link                  )      { return { s, self, player, link }; }

/* ---------- 発動できる効果の一覧 ---------- */
function optKey(s           , uid        , eff              )         {
  return eff.opt === 'name' || eff.hardOpt ? `name:${s.cards[uid].code}:${eff.hardOpt ? 'card' : eff.id}` : `card:${uid}:${s.cards[uid].serial}:${eff.id}`;
}
function optAvailable(s           , uid        , eff              , p          )          {
  if (!eff.opt && !eff.hardOpt) return true;
  return s.opt[`${p}:${optKey(s, uid, eff)}`] !== s.turn;
}
function activationBlockedByName(s           , uid        , p          )          {
  const name = defOf(s, uid).name;
  return s.lingering.some(l => l.type === 'noActivateName' && l.player === p && l.name === name && l.turn === s.turn);
}

                                                                           

export function activatableList(s           , p          )                {
  if (s.winner !== null || s.pending) return [];
  const w = s.window;
  if (w.kind === 'open' && p !== s.turnPlayer) return [];
  if (w.kind === 'priority' && w.player !== p) return [];
  const mode = w.kind === 'priority' ? w.mode : 'normal';
  const top = s.chain[s.chain.length - 1];
  // 「この効果の発動に対して、お互いは効果を発動できない」
  if (top && top.data.chainLock) return [];
  // 召喚成功時には効果を発動できない（オシリスの天空竜）：その時点での応答を禁じる
  if (!top && w.kind === 'priority' && s.lockStep != null && s.lockStep === s.step) return [];
  const canSS1 = !top && p === s.turnPlayer && isMain(s.phase) && w.kind === 'open';
  const res                = [];
  const P = s.players[p];
  const O = s.players[opp(p)];
  // お互いが発動できる効果を持つ相手のカード（チキンレースなど）
  const shared = [...O.szone.filter((x)              => x !== null), ...(O.fzone !== null ? [O.fzone] : [])]
    .filter(u => (scriptOf(s, u).effects || []).some(e => e.anyPlayer));
  const candidates = [...P.hand, ...P.szone.filter((x)              => x !== null), ...(P.fzone !== null ? [P.fzone] : []), ...monstersOf(s, p), ...P.gy, ...shared];
  const spellsBlocked = activeCards(s).some(u => scriptOf(s, u).blocksSpells?.(s, u, p));
  // 対象にできないカードがある間は、対象を選べるか（発動の手順を試して）確かめる
  const guardOn = targetGuardOn(s);
  for (const uid of candidates) {
    const c = s.cards[uid], d = defOf(s, uid);
    for (const eff of scriptOf(s, uid).effects || []) {
      if (eff.type === 'trigger') continue;
      if (c.controller !== p && !eff.anyPlayer) continue;
      if (eff.type === 'card' && d.kind === 'spell' && spellsBlocked) continue;
      if (activationForbidden(s, uid, eff, p)) continue;
      // ネクロバレー：墓地で発動する効果も発動はできる。墓地のカードを除外するコストが要る効果だけ発動できない（公式Q&A [115]・[14586]）
      if (eff.costBanishGy && c.zone === 'gy' && gyLocked(s, c.owner, uid)) continue;
      // 混沌帝龍の効果を発動したターンは、他の効果を発動できない／他の効果を発動したターンは、混沌帝龍の効果を発動できない
      if (s.lingering.some(l => l.type === 'onlyThisCard' && l.player === p && l.turn === s.turn && l.uid !== uid)) continue;
      if (scriptOf(s, uid).exclusive && s.activatedTurn?.[String(p)] === s.turn && !s.lingering.some(l => l.type === 'onlyThisCard' && l.player === p && l.uid === uid && l.turn === s.turn)) continue;
      // スペルスピード
      if (top) { if (eff.ss < 2 || eff.ss < top.ss) continue; }
      else if (eff.ss === 1 && !canSS1) continue;
      if (!top && mode === 'summoning' && !eff.summonWindow) continue;
      if (mode === 'damage' && !eff.damageStep) continue;
      // 発動できる場所
      if (eff.type === 'card') {
        if (d.kind === 'spell') {
          if (c.zone === 'hand') {
            if (p !== s.turnPlayer) continue;
            if (d.subtype !== 'フィールド' && freeSZones(s, p).length === 0) continue;
          } else if (c.zone === 'szone' || c.zone === 'fzone') {
            if (c.faceUp) continue;
            if (d.subtype === '速攻' && c.enteredTurn === s.turn) continue;
          } else continue;
        } else if (d.kind === 'trap') {
          if (c.zone !== 'szone' || c.faceUp || c.enteredTurn === s.turn) continue;
        } else continue;
      } else {
        const zones = eff.zones ?? ['mzone', 'emz'];
        if (!zones.includes(c.zone)) continue;
        if (isOnField(c) && (!c.faceUp || c.summoning)) continue;
      }
      if (!optAvailable(s, uid, eff, p)) continue;
      if (activationBlockedByName(s, uid, p)) continue;
      if (eff.can && !eff.can(ctxOf(s, uid, p, null))) continue;
      if (guardOn && eff.activate && !activationPossible(s, uid, p, eff)) continue;
      res.push({ uid, effect: eff.id, label: eff.label });
    }
  }
  // 墓地の通常魔法の発動時の効果（D-HERO ダイヤモンドガイ）：その通常魔法の効果として発動する（カードの発動ではない）
  if (canSS1) for (const l of s.lingering.filter(x => x.type === 'diamondSpell' && x.player === p && x.turn === s.turn)) {
    const u = l.uid ;
    if (!sameCard(s, u, l.serial ) || s.cards[u].zone !== 'gy') continue;
    const eff = (scriptOf(s, u).effects || []).find(e => e.type === 'card');
    if (!eff || (eff.can && !eff.can(ctxOf(s, u, p, { data: { dg: true } }                        )))) continue;
    // 対象を選べるかなど、最後まで発動できるかを試す（ダイヤモンドガイの効果ではコストは払わない）
    if (eff.activate && !activationPossible(s, u, p, eff, { dg: true })) continue;
    res.push({ uid: u, effect: 'dg:' + eff.id, label: `（ダイヤモンドガイ）${eff.label}` });
  }
  return res;
}

/** その効果を発動できない状態か（罠：サイコ・ショッカー／魔法・罠：邪神アバター／モンスター：超古代生物の墓場） */
function activationForbidden(s           , uid        , eff              , p          )          {
  const c = s.cards[uid], d = defOf(s, uid);
  const trap = POOL[c.code]?.kind === 'trap';
  if (trap && (eff.type === 'card' || isOnField(c)) && activeCards(s).some(u => scriptOf(s, u).blocksTraps?.(s, u))) return true;
  if (eff.type === 'card' && (d.kind === 'spell' || d.kind === 'trap') && s.lingering.some(l => l.type === 'noSpellTrap' && l.player === p && l.turn >= s.turn)) return true;
  if (d.kind === 'monster' && eff.type !== 'card' && activeCards(s).some(u => scriptOf(s, u).blocksMonsterEffects?.(s, u, uid))) return true;
  return false;
}
/** 対象にできないカードがある状態か（オベリスクの巨神兵・ネクロバレーで守られた墓地） */
function targetGuardOn(s           )          {
  return [...fieldCards(s, 0), ...fieldCards(s, 1)].some(u => !targetable(s, u)) || gyLocked(s, 0, null) || gyLocked(s, 1, null);
}
/** 発動の手順（コスト・対象）を最後まで行えるかを、状態の写しで試す。選択が必要になった時点で「行える」とみなす */
function activationPossible(s           , uid        , p          , eff              , data                          = {})          {
  const saveA = ANSWERS, saveI = AIDX;
  // 選択肢（どの効果を選ぶか・はい／いいえ）は順に試し、カードの選択は先頭から選んだものとして進める。どれかで最後まで行えれば発動できる
  const tries              = [[]];
  let runs = 0;
  try {
    while (tries.length && runs++ < 24) {
      const ans = tries.shift() ;
      ANSWERS = [...ans]; AIDX = 0;
      try {
        const c = cloneState(s);
        const link            = { player: p, uid, serial: c.cards[uid].serial, effect: eff.id, ss: eff.ss, cardActivation: false, cardKind: defOf(c, uid).kind, targets: [], targetSerials: [], data: { ...data }, negated: false, effectNegated: false };
        eff.activate (ctxOf(c, uid, p, link));
        return true;
      } catch (e) {
        if (e instanceof RuleError) continue;
        if (!(e instanceof NeedChoice)) return true;
        const r = e.request;
        if (r.kind === 'option') r.options.forEach((_, i) => tries.push([...ans, i]));
        else if (r.kind === 'yesno') tries.push([...ans, true], [...ans, false]);
        else tries.push([...ans, r.options.slice(0, Math.max(1, r.min))]);
      }
    }
    return runs > 24; // 試しきれない場合は発動できるものとする
  } finally { ANSWERS = saveA; AIDX = saveI; }
}

/* ---------- 発動 ---------- */
function activateEffect(s           , p          , uid        , effectId        , zone         )            {
  const dg = effectId.startsWith('dg:');
  const eff = (scriptOf(s, uid).effects || []).find(e => e.id === effectId.replace(/^dg:/, '')) ;
  const d = defOf(s, uid);
  if (dg) s.lingering = s.lingering.filter(l => !(l.type === 'diamondSpell' && l.uid === uid));
  if (eff.type === 'card' && !dg) {
    const c = s.cards[uid];
    if (c.zone === 'hand') {
      if (d.subtype === 'フィールド') {
        const old = s.players[p].fzone;
        // 自分のフィールドゾーンの伏せたフィールド魔法は、置き場所を空けるためにルールで墓地へ（表側ならこのあと破壊）
        if (old !== null && !s.cards[old].faceUp) sendToGy(s, [old], 'rule');
        replaceFieldSpells(s, uid);
        moveCard(s, uid, 'fzone', { faceUp: true, controller: p });
      } else { const free = freeSZones(s, p); moveCard(s, uid, 'szone', { index: zone !== undefined && free.includes(zone) ? zone : free[0], faceUp: true, controller: p }); }
    } else { if (c.zone === 'fzone' && !c.faceUp) replaceFieldSpells(s, uid); c.faceUp = true; }
  }
  const link            = {
    player: p, uid, serial: s.cards[uid].serial, effect: effectId, ss: eff.ss, cardActivation: eff.type === 'card' && !dg, cardKind: d.kind,
    targets: [], targetSerials: [], data: {}, negated: false, effectNegated: false,
  };
  if (zone !== undefined && !(eff.type === 'card' && !dg)) link.data.zone = zone;
  if (eff.opt || eff.hardOpt) s.opt[`${p}:${optKey(s, uid, eff)}`] = s.turn;
  log(s, `${pl(p)}：${nameOf(s, uid)}${eff.type === 'card' && !dg ? 'を発動' : `の効果を発動`}（チェーン${s.chain.length + 1}）`);
  // 演出用：発動の手続きを始めた（このあとコスト・対象。画面は「元の場所で光る → コストのカードが動く」の順に見せる）
  pushAnim(s, { kind: 'activate', uid, player: p, card: eff.type === 'card' && !dg });
  // このターンに効果を発動した記録（混沌帝龍：「このカードの効果を発動するターン、自分は他の効果を発動できない」）
  (s.activatedTurn ??= {})[String(p)] = s.turn;
  if (s.activatedFirst?.[String(p)]?.turn !== s.turn) (s.activatedFirst ??= {})[String(p)] = { turn: s.turn, uid };
  if (scriptOf(s, uid).exclusive) addLingering(s, { type: 'onlyThisCard', player: p, uid, turn: s.turn });
  s.activating = p;
  // ダイヤモンドガイで墓地の通常魔法の効果を発動する場合、カードの発動のコストは払わない（公式Q&A [6392]）
  if (dg) link.data.dg = true;
  try { eff.activate?.(ctxOf(s, uid, p, link)); } finally { s.activating = null; }
  if (eff.chainLock) link.data.chainLock = true;
  link.targetSerials = link.targets.map(t => s.cards[t].serial);
  if (link.targets.length) log(s, `対象：${link.targets.map(t => s.cards[t].faceUp || s.cards[t].zone === 'gy' ? nameOf(s, t) : '裏側のカード').join('、')}`);
  s.chain.push(link);
  return link;
}

function doActivate(s           , p          , uid        , effectId        , zone         )       {
  const mode = s.window.kind === 'priority' ? s.window.mode : 'normal';
  if (!s.chain.length && !s.chainCont) s.chainCont = s.window.kind === 'priority' ? s.window.cont : { type: 'none' };
  const link = activateEffect(s, p, uid, effectId, zone);
  forcedResponses(s, link);
  s.window = { kind: 'priority', player: opp(p), passes: 0, mode, cont: s.chainCont ?? { type: 'none' } };
}

/** 効果モンスターの効果・魔法・罠カードの発動に必ずチェーンして無効にするモンスター（光と闇の竜）。1つのチェーンでそれぞれ何度でも応じる */
function forcedResponses(s           , link           )       {
  for (let guard = 0; guard < 6; guard++) {
    const top = s.chain[s.chain.length - 1];
    if (!top || (top.cardKind !== 'monster' && !top.cardActivation)) return;
    // 同一チェーン上で複数回発動することはない
    const u = allMonsters(s).find(m => m !== top.uid && isFaceUpMonster(s, m) && !monsterNegated(s, m) && scriptOf(s, m).forcedNegate && !s.chain.some(l => l.uid === m && l.effect === scriptOf(s, m).forcedNegate));
    if (u === undefined) return;
    const l = activateEffect(s, s.cards[u].controller, u, scriptOf(s, u).forcedNegate );
    // きっかけになった発動（最初の link）を覚える。2体目以降は、きっかけに直接チェーンしていないので効果は適用されない（公式Q&A [6350]）
    l.data.trigger = s.chain.indexOf(link);
  }
}
/** 対象が処理時もそのまま存在するか */
export function targetValid(s           , link           , i = 0)          {
  const t = link.targets[i];
  return t !== undefined && s.cards[t].serial === link.targetSerials[i];
}

/* ---------- チェーンの処理 ---------- */
function resolveLink(s           )       {
  const link = s.chain[s.chain.length - 1];
  newStep(s);
  log(s, `チェーン${s.chain.length}：${nameOf(s, link.uid)}の効果を処理${link.negated ? '（発動は無効）' : ''}`);
  if (!link.negated) {
    if (link.cardKind === 'spell' && link.cardActivation) {
      for (const u of activeCards(s)) scriptOf(s, u).onSpellResolved?.(s, u);
    }
    if (!link.effectNegated && link.cardKind === 'trap' && activeCards(s).some(u => scriptOf(s, u).blocksTraps?.(s, u))) { link.effectNegated = true; log(s, `${nameOf(s, link.uid)}の効果は無効化された`); }
    const freed = link.cardKind === 'spell' ? link.targets.find((t, i) => targetValid(s, link, i) && isActive(s, t) && scriptOf(s, t).negatesSpellTargeting) : undefined;
    if (freed !== undefined && !link.effectNegated) {
      link.effectNegated = true;
      log(s, `${nameOf(s, freed)}の効果で、${nameOf(s, link.uid)}の効果を無効にした`);
      if (sameCard(s, link.uid, link.serial) && isOnField(s.cards[link.uid])) destroy(s, [link.uid], 'effect');
    }
    if (!link.effectNegated && link.cardKind === 'monster' && isMonsterZone(s.cards[link.uid]) && sameCard(s, link.uid, link.serial) && monsterNegated(s, link.uid)) {
      log(s, `${nameOf(s, link.uid)}の効果は無効化されている`);
    } else if (!link.effectNegated) {
      const eff = (scriptOf(s, link.uid).effects || []).find(e => e.id === link.effect.replace(/^dg:/, '')) ;
      s.resolving = { uid: link.uid, player: link.player, kind: link.cardKind, effect: link.effect };
      pushAnim(s, { kind: 'resolve', uid: link.uid, player: link.player, act: link.cardActivation, targets: [...link.targets] }); // 演出用：効果の処理（カードごとの専用演出）
      try {
        const rep = link.data.replacedDiscard                        ;
        if (rep !== undefined) {
          // 効果が「相手はランダムに手札を1枚捨てる」に変わっている（闇の取引）
          const u = randomOf(s, [...s.players[rep].hand]);
          if (u !== null) { log(s, `${pl(rep)}：手札からランダムに${nameOf(s, u)}を捨てる`); sendToGy(s, [u], 'discard'); }
        } else eff.resolve(ctxOf(s, link.uid, link.player, link));
      } finally { s.resolving = null; }
    }
  }
  // 処理を終えた魔法・罠カードは墓地へ（永続・装備・フィールドは残る）
  if (link.cardActivation && sameCard(s, link.uid, link.serial) && isOnField(s.cards[link.uid])) {
    const d = defOf(s, link.uid), c = s.cards[link.uid];
    const stays = d.subtype === '永続' || d.subtype === 'フィールド' || (d.subtype === '装備' && c.equippedTo !== null && !link.negated) || !!scriptOf(s, link.uid).staysOnField;
    if (!stays || link.negated) sendToGy(s, [link.uid], 'rule');
  }
  s.chain.pop();
  s.queue.unshift(s.chain.length ? { type: 'resolveLink' } : { type: 'settle', chained: true });
}

/* =====================================================================
 * ターン・フェイズ
 * ===================================================================== */
function drawOne(s           , p          )          {
  const deck = s.players[p].deck;
  if (deck.length === 0) return false;
  const u = deck[deck.length - 1];
  moveCard(s, u, 'hand');
  s.cards[u].pub = false;
  emit(s, { type: 'drew', uid: u, player: p });
  return true;
}
/** 「ドローする度に」の永続効果（サイレント・マジシャン LV４）。1つの処理で複数枚ドローしても1回 */
function afterDraw(s           , p          )       {
  for (const c of activeCards(s)) scriptOf(s, c).onDraw?.(s, c, p);
}
export function drawCards(s           , p          , n        )       {
  let drew = 0;
  for (let i = 0; i < n; i++) { if (!drawOne(s, p)) { lose(s, p, 'デッキからカードをドローできなかった'); break; } drew++; }
  if (drew) { log(s, `${pl(p)}：${drew}枚ドロー`); afterDraw(s, p); }
}

function startTurn(s           , p          )       {
  s.turn += 1;
  s.turnPlayer = p;
  s.players[0].normalSummonUsed = false;
  s.players[1].normalSummonUsed = false;
  s.lingering = s.lingering.filter(l => l.turn >= s.turn);
  log(s, `― ターン${s.turn}（${pl(p)}のターン）―`);
  s.phase = 'draw';
  newStep(s);
  if (s.turn === 1) log(s, `${pl(p)}：先攻1ターン目のためドローしない`);
  else if (drawReplaced(s, p)) { /* 通常のドローの代わりにデッキから手札に加えた（無敗将軍 フリード） */ }
  else if (!drawOne(s, p)) return lose(s, p, 'デッキからカードをドローできなかった');
  else { log(s, `${pl(p)}：ドロー`); afterDraw(s, p); }
  s.chainCont = { type: 'phase', to: 'standby' };
  s.queue.push({ type: 'settle', chained: false });
}

/** 通常のドローの代わりにデッキからカードを手札に加える（無敗将軍 フリード）。行ったら true */
function drawReplaced(s           , p          )          {
  const src = monstersOf(s, p).find(u => isActive(s, u) && (scriptOf(s, u).drawReplace?.(s, u).length ?? 0) > 0);
  if (src === undefined) return false;
  const x = ctxOf(s, src, p, null);
  if (!choose(x, { kind: 'yesno', prompt: `${nameOf(s, src)}の効果で、通常のドローの代わりにデッキからカードを手札に加えますか？` })) return false;
  const u = chooseOne(x, '手札に加えるカードを選んでください', scriptOf(s, src).drawReplace (s, src)) ;
  log(s, `${pl(p)}：${nameOf(s, src)}の効果で、通常のドローの代わりにデッキから手札に加える`);
  addToHand(s, [u]);
  return true;
}
/** フェイズの終わりに、ターンプレイヤーから順に発動の機会を与える */
function phaseWindow(s           , to       )       {
  s.window = { kind: 'priority', player: s.turnPlayer, passes: 0, mode: 'normal', cont: { type: 'phase', to } };
}

function changePhase(s           , to       )       {
  if (s.phase === 'battle' && to !== 'battle') {
    for (const u of monstersOf(s, s.turnPlayer)) {
      const c = s.cards[u];
      if (scriptOf(s, u).defAfterAttack && isFaceUpMonster(s, u) && !monsterNegated(s, u) && c.attackedTurn === s.turn && c.position === 'atk') { c.position = 'def'; log(s, `${nameOf(s, u)}は守備表示になった`); }
    }
  }
  s.phase = to;
  s.lastEvents = [];
  if (to !== 'standby' && to !== 'main1') log(s, `${pl(s.turnPlayer)}：${PHASE_LABEL[to]}へ`);
  switch (to) {
    case 'standby': {
      newStep(s);
      // 「◯回目のスタンバイフェイズに手札に加える」（封印の黄金櫃）
      for (const l of s.lingering.filter(x => x.type === 'returnAtStandby' && x.player === s.turnPlayer)) {
        l.turnsLeft = (l.turnsLeft ?? 1) - 1;
        if (l.turnsLeft > 0) continue;
        s.lingering = s.lingering.filter(x => x !== l);
        if (sameCard(s, l.uid , l.serial ) && s.cards[l.uid ].zone === 'banished') { log(s, `${pl(l.player )}：除外していたカードを手札に加える`); addToHand(s, [l.uid ], 'rule'); }
      }
      for (const u of activeCards(s)) scriptOf(s, u).onStandby?.(s, u);
      for (const l of s.lingering.filter(x => x.type === 'returnToField' && !x.atEnd && x.player === s.turnPlayer)) {
        l.turnsLeft = (l.turnsLeft ?? 1) - 1;
        if (l.turnsLeft > 0) continue;
        s.lingering = s.lingering.filter(x => x !== l);
        returnBanishedToField(s, l);
      }
      emit(s, { type: 'phase', phase: 'standby', player: s.turnPlayer });
      s.chainCont = { type: 'phase', to: 'main1' };
      s.queue.push({ type: 'settle', chained: false });
      return;
    }
    case 'main1': case 'main2': s.window = { kind: 'open', respondDue: false }; return;
    case 'battle':
      s.battle = null;
      s.opt[`${s.turnPlayer}:battleTurn`] = s.turn; // このターンにバトルフェイズを行った（同胞の絆）
      s.window = { kind: 'priority', player: s.turnPlayer, passes: 0, mode: 'normal', cont: { type: 'battle', step: 'start' } };
      return;
    case 'end': s.queue.push({ type: 'phaseStart' }); return;
    case 'draw': return;
  }
}

/** 除外していたモンスターをフィールドに戻す（D-HERO デビルガイ）。特殊召喚ではない */
function returnBanishedToField(s           , l           )       {
  const u = l.uid , ctl = l.controller ?? s.cards[u].owner;
  if (!sameCard(s, u, l.serial ) || s.cards[u].zone !== 'banished') return;
  const z = freeMZones(s, ctl);
  if (!z.length) { log(s, `${nameOf(s, u)}を戻すモンスターゾーンが無いため、墓地へ送る`); sendToGy(s, [u], 'rule'); return; }
  moveCard(s, u, 'mzone', { index: z[0], faceUp: l.faceUp ?? true, position: l.position ?? 'atk', controller: ctl });
  log(s, `${l.faceUp === false ? '裏側守備表示のモンスター' : nameOf(s, u)}がフィールドに戻った`);
}
/** エンドフェイズ開始時：「エンドフェイズに破壊される」などを処理 */
function phaseStart(s           )       {
  newStep(s);
  for (const l of s.lingering.filter(x => x.type === 'returnToField' && x.atEnd && x.turn === s.turn)) { s.lingering = s.lingering.filter(x => x !== l); returnBanishedToField(s, l); }
  // エンドフェイズにコントロールが戻る（エネミーコントローラー）
  for (const l of s.lingering.filter(x => x.type === 'returnControl' && x.turn === s.turn)) {
    s.lingering = s.lingering.filter(x => x !== l);
    const u = l.uid ;
    if (!sameCard(s, u, l.serial ) || !isMonsterZone(s.cards[u]) || s.cards[u].controller === l.player) continue;
    if (!freeMZones(s, l.player ).length) { log(s, `${nameOf(s, u)}を戻すモンスターゾーンが無いため、墓地へ送る`); sendToGy(s, [u], 'rule'); continue; }
    const c = s.cards[u]; removeFromZone(s, u);
    const z = freeMZones(s, l.player )[0]; c.controller = l.player ; c.index = z; s.players[l.player ].mzone[z] = u;
    log(s, `${nameOf(s, u)}のコントロールが${pl(l.player )}に戻った`);
  }
  // エンドフェイズに除外する（異次元からの帰還）
  const ban = s.lingering.filter(x => x.type === 'banishAtEnd' && x.turn === s.turn);
  s.lingering = s.lingering.filter(x => !ban.includes(x));
  const bl = ban.filter(l => sameCard(s, l.uid , l.serial ) && isOnField(s.cards[l.uid ])).map(l => l.uid );
  if (bl.length) { log(s, `${bl.map(u => nameOf(s, u)).join('、')}を除外`); banish(s, bl, 'effect'); }
  const due = s.lingering.filter(l => l.type === 'destroyAtEnd' && l.turn === s.turn);
  s.lingering = s.lingering.filter(l => !due.includes(l));
  const targets = due.filter(l => sameCard(s, l.uid , l.serial ) && isOnField(s.cards[l.uid ])).map(l => l.uid );
  if (targets.length) destroy(s, targets, 'effect');
  for (const u of activeCards(s)) scriptOf(s, u).onEndPhase?.(s, u);
  emit(s, { type: 'phase', phase: 'end', player: s.turnPlayer });
  s.chainCont = { type: 'none' };
  s.queue.push({ type: 'settle', chained: false });
}

function handLimit(s           )       {
  const p = s.turnPlayer;
  const over = s.players[p].hand.length - HAND_LIMIT;
  if (over > 0) {
    const x = ctxOf(s, -1, p, null);
    const pick = choose(x, { kind: 'cards', prompt: `手札が${s.players[p].hand.length}枚です。${over}枚選んで捨ててください`, options: [...s.players[p].hand], min: over, max: over });
    log(s, `${pl(p)}：手札の枚数制限により${pick.map(u => nameOf(s, u)).join('、')}を捨てる`);
    sendToGy(s, pick, 'discard', null); // ルールによる（効果で捨てたことにはならない）
  }
  s.events = []; s.triggers = []; s.lastEvents = [];
  startTurn(s, opp(p));
}

function lose(s           , p          , reason        )       {
  if (s.winner !== null) return;
  s.winner = opp(p);
  s.winReason = `${pl(p)}${reason.startsWith('の') ? '' : 'が'}${reason}`;
  log(s, `${pl(opp(p))}の勝利（${s.winReason}）`);
}
export function checkLp(s           )       {
  if (s.winner !== null) return;
  const a = s.players[0].lp <= 0, b = s.players[1].lp <= 0;
  if (a && b) { s.winner = 'draw'; s.winReason = 'お互いのLPが同時に0になった'; log(s, '引き分け（お互いのLPが0）'); }
  else if (a) lose(s, 0, 'のLPが0になった');
  else if (b) lose(s, 1, 'のLPが0になった');
}

/* =====================================================================
 * 召喚・セット・表示形式
 * ===================================================================== */
function completeSummon(s           , uid        , how                                           , p          )       {
  const c = s.cards[uid];
  c.summoning = false;
  c.summonedHow = how; c.summonedTurn = s.turn;
  if (how === 'special') c.proper = true; // 召喚方法どおりの特殊召喚（その後は蘇生できる）
  if (how === 'special' && c.counters.procTurn === s.turn) s.opt[`${p}:proc:${c.code}`] = s.turn;
  newStep(s);
  log(s, `${pl(p)}：${nameOf(s, uid)}の${how === 'flip' ? '反転召喚' : how === 'advance' ? 'アドバンス召喚' : how === 'special' ? '特殊召喚' : '召喚'}に成功`);
  if (how === 'flip') emit(s, { type: 'flipped', uid }); // リバースした（「リバースした場合」の効果）
  pushAnim(s, { kind: 'summon', uid, how, mats: how === 'advance' ? (s.animMats ?? []) : [] });
  s.animMats = undefined;
  markSummoned(s, p, how === 'special');
  if (how === 'special') scriptOf(s, uid).onSpecialSummoned?.(s, uid);
  emit(s, { type: 'summoned', uid, player: p, how });
  // 召喚成功時には、お互いに効果を発動できない（オシリスの天空竜）
  s.lockStep = how !== 'flip' && scriptOf(s, uid).summonLock ? s.step : null;
  s.chainCont = { type: 'none' };
  s.queue.push({ type: 'settle', chained: false });
}

function performMain(s           , a        )       {
  const p = s.turnPlayer;
  const me = s.players[p];
  s.lastEvents = [];
  switch (a.type) {
    case 'normalSummon':
    case 'setMonster': {
      const zones = freeMZones(s, p, a.tributes);
      const zone = a.zone ?? zones[0];
      if (!zones.includes(zone)) throw new RuleError('そのモンスターゾーンには出せません');
      newStep(s);
      if (a.tributes.length) release(s, a.tributes, 'release');
      s.animMats = [...a.tributes];
      const setting = a.type === 'setMonster';
      newStep(s);
      moveCard(s, a.card, 'mzone', { index: zone, faceUp: !setting, position: setting ? 'def' : 'atk', controller: p });
      me.normalSummonUsed = true;
      s.lingering = s.lingering.filter(l => l.type !== 'tributeFreeSummon' || l.player !== p);
      s.cards[a.card].counters.tributes = a.tributes.length; // 召喚に使ったリリースの数（神獣王バルバロス）
      s.cards[a.card].tributedWith = [...a.tributes];
      if (s.animMats?.some(u => s.cards[u].owner !== p)) s.lingering = s.lingering.filter(l => !(l.type === 'tributeOpp' && l.player === p));
      if (setting) {
        log(s, `${pl(p)}：モンスターをセット`);
        emit(s, { type: 'set', uid: a.card, player: p });
        pushAnim(s, { kind: 'summon', uid: a.card, how: 'set', mats: s.animMats ?? [] });
        s.animMats = undefined;
        s.chainCont = { type: 'none' };
        s.queue.push({ type: 'settle', chained: false });
      } else {
        s.cards[a.card].summoning = true;
        log(s, `${pl(p)}：${nameOf(s, a.card)}を${a.tributes.length ? 'アドバンス' : '通常'}召喚する`);
        s.window = { kind: 'priority', player: p, passes: 0, mode: 'summoning', cont: { type: 'summon', uid: a.card, how: a.tributes.length ? 'advance' : 'normal', player: p } };
      }
      return;
    }
    case 'flipSummon': {
      const c = s.cards[a.card];
      c.faceUp = true; c.position = 'atk'; c.positionChangedTurn = s.turn; c.summoning = true;
      log(s, `${pl(p)}：${nameOf(s, a.card)}を反転召喚する`);
      s.window = { kind: 'priority', player: p, passes: 0, mode: 'summoning', cont: { type: 'summon', uid: a.card, how: 'flip', player: p } };
      return;
    }
    case 'changePosition': {
      const c = s.cards[a.card];
      c.position = c.position === 'atk' ? 'def' : 'atk'; c.positionChangedTurn = s.turn;
      log(s, `${pl(p)}：${nameOf(s, a.card)}を${c.position === 'atk' ? '攻撃' : '守備'}表示に変更`);
      s.window = { kind: 'open', respondDue: false };
      return;
    }
    case 'setSpellTrap': {
      const d = defOf(s, a.card);
      newStep(s);
      if (d.kind === 'spell' && d.subtype === 'フィールド') {
        if (me.fzone !== null) sendToGy(s, [me.fzone], 'rule');
        moveCard(s, a.card, 'fzone', { faceUp: false, controller: p });
      } else {
        const zones = freeSZones(s, p);
        const zone = a.zone ?? zones[0];
        if (!zones.includes(zone)) throw new RuleError('その魔法＆罠ゾーンには置けません');
        moveCard(s, a.card, 'szone', { index: zone, faceUp: false, controller: p });
      }
      s.opt[`${p}:setST`] = s.turn; // このターンに魔法・罠をセットした（左腕の代償）
      log(s, `${pl(p)}：魔法・罠カードをセット`);
      emit(s, { type: 'set', uid: a.card, player: p });
      s.window = { kind: 'open', respondDue: false };
      s.events = [];
      return;
    }
    case 'attack': return declareAttack(s, a.attacker, a.target);
    case 'procSummon': s.queue.push({ type: 'procSummon', player: p, uid: a.card }); return;
    case 'activate': s.queue.push({ type: 'activate', player: p, uid: a.card, effect: a.effect, zone: a.zone }); return;
    case 'nextPhase':
      s.window = { kind: 'priority', player: opp(p), passes: 1, mode: 'normal', cont: { type: 'phase', to: a.to } };
      return;
    case 'endTurn':
      s.window = { kind: 'priority', player: opp(p), passes: 1, mode: 'normal', cont: { type: 'endTurn' } };
      return;
    default: throw new RuleError('不明な行動です');
  }
}

/* =====================================================================
 * バトル
 * ===================================================================== */
function declareAttack(s           , attacker        , target               )       {
  const p = s.turnPlayer;
  const a = s.cards[attacker];
  if (a.attackedTurn !== s.turn) a.attackedList = [];
  a.attackedTurn = s.turn;
  (a.attackedList ??= []).push(target);
  s.opt[`${p}:attackDecl`] = s.turn; // このターン攻撃宣言した（D-HERO デビルガイ）
  s.battle = {
    attacker, attackerSerial: a.serial, target, targetSerial: target === null ? null : s.cards[target].serial,
    oppCount: monstersOf(s, opp(p)).length, step: 'declared', destroyed: [], replace: [],
  };
  // 相手モンスターがいる状態での直接攻撃は、「直接攻撃できる」効果によるもの（その後に相手モンスターがいなくなっても変わらない：公式Q&A [12442]）
  if (target === null && s.battle.oppCount > 0) s.battle.viaDirect = true;
  if (target !== null && !s.cards[target].faceUp) s.battle.targetWasFaceDown = true;
  newStep(s);
  log(s, `${pl(p)}：${nameOf(s, attacker)}で${target === null ? 'ダイレクトアタック' : `${s.cards[target].faceUp ? nameOf(s, target) : '裏側守備表示モンスター'}に攻撃`}`);
  emit(s, { type: 'attackDeclared', attacker, target, player: p });
  s.chainCont = { type: 'battle', step: 'declared' };
  s.queue.push({ type: 'settle', chained: false });
}

/** 攻撃を無効にする */
export function negateAttack(s           )       {
  if (!s.battle) return;
  s.battle.negated = true;
  log(s, `${nameOf(s, s.battle.attacker)}の攻撃を無効にした`);
  emit(s, { type: 'attackNegated', attacker: s.battle.attacker });
}
function battleDamage(s           , p          , amount        , monster        )       {
  if (amount <= 0) return;
  if (isFaceUpMonster(s, monster) && s.cards[monster].controller === p && scriptOf(s, monster).redirectBattleDamage) { log(s, `${nameOf(s, monster)}の効果で、戦闘ダメージは代わりに相手が受ける`); p = opp(p); }
  if (damageZero(s, p)) { log(s, `${pl(p)}が受ける${amount}の戦闘ダメージは0になった`); return; }
  // 戦闘ダメージだけを0にする永続効果（幽獄の時計塔）
  const nb = activeCards(s).find(u => scriptOf(s, u).noBattleDamageFor?.(s, u, p));
  if (nb !== undefined) { log(s, `${nameOf(s, nb)}の効果で、${pl(p)}が受ける${amount}の戦闘ダメージは0になった`); return; }
  // 「このカードの戦闘で発生する自分への戦闘ダメージは0」（ユベル）
  if (isFaceUpMonster(s, monster) && s.cards[monster].controller === p && defOf(s, monster).name.startsWith('D-HERO') && s.lingering.some(l => l.type === 'dheroProtect' && l.player === p && l.turn === s.turn)) { log(s, `${pl(p)}への戦闘ダメージは0になった`); return; }
  if (isFaceUpMonster(s, monster) && s.cards[monster].controller === p && scriptOf(s, monster).noSelfBattleDamage) { log(s, `${nameOf(s, monster)}の効果で、${pl(p)}への戦闘ダメージは0になった`); return; }
  s.players[p].lp = Math.max(0, s.players[p].lp - amount);
  emit(s, { type: 'damage', player: p, amount, battle: true });
  log(s, `${pl(p)}に${amount}の戦闘ダメージ（LP ${s.players[p].lp}）`);
  // 自分の戦闘で戦闘ダメージを受けた時、相手にも同じ数値の効果ダメージ（サクリファイス③）
  if (isFaceUpMonster(s, monster) && s.cards[monster].controller === p && scriptOf(s, monster).reflectBattleDamage?.(s, monster)) {
    effectDamage(s, opp(p), amount);
  }
}

function battleProc(s           , step            )       {
  const b = s.battle;
  const p = s.turnPlayer, o = opp(p);
  if (step === 'start') { s.window = { kind: 'open', respondDue: false }; return; }
  if (!b) { s.window = { kind: 'open', respondDue: true }; return; }
  const attackerOk = () => sameCard(s, b.attacker, b.attackerSerial) && isFaceUpMonster(s, b.attacker) && s.cards[b.attacker].controller === p;
  const targetOk = () => b.target === null || (sameCard(s, b.target, b.targetSerial ) && isMonsterZone(s.cards[b.target]) && s.cards[b.target].controller === o);
  const next = (st            ) => { b.step = st; s.chainCont = { type: 'battle', step: st }; s.queue.push({ type: 'settle', chained: false }); };

  switch (step) {
    case 'declared': {
      if (b.negated) { s.battle = null; s.window = { kind: 'open', respondDue: true }; return; }
      if (!attackerOk()) { log(s, '攻撃モンスターがいなくなったため、攻撃は中止された'); s.battle = null; s.window = { kind: 'open', respondDue: true }; return; }
      if (!targetOk() || monstersOf(s, o).length !== b.oppCount) {
        // 巻き戻し：攻撃対象を選び直すか、攻撃をやめる
        log(s, '巻き戻しが発生（攻撃対象を選び直すか、攻撃をやめることができる）');
        s.cards[b.attacker].attackedList?.pop();
        if (!s.cards[b.attacker].attackedList?.length) s.cards[b.attacker].attackedTurn = null;
        s.battle = null;
        s.window = { kind: 'open', respondDue: true };
        return;
      }
      newStep(s);
      log(s, 'ダメージステップ開始');
      return next('dsStart');
    }
    case 'dsStart': {
      newStep(s);
      if (attackerOk() && targetOk() && b.target !== null && !s.cards[b.target].faceUp) {
        s.cards[b.target].faceUp = true;
        log(s, `${nameOf(s, b.target)}が表になる`);
        emit(s, { type: 'flipped', uid: b.target });
      }
      // ダメージ計算前（「ダメージ計算前に発動する」効果：ユベル②）
      if (attackerOk() && targetOk()) { newStep(s); emit(s, { type: 'beforeDamageCalc', attacker: b.attacker, target: b.target }); }
      return next('beforeCalc');
    }
    case 'beforeCalc': {
      newStep(s);
      if (!attackerOk() || !targetOk()) { log(s, '戦闘は行われなかった'); return next('dsEnd'); }
      // ダメージ計算時の表示形式と攻撃力を記録（ダメージステップ終了時の効果：ユベル－Das Extremer Traurig Drachen②）
      b.atkPos = [b.attacker, ...(b.target !== null ? [b.target] : [])].filter(u => s.cards[u].position === 'atk');
      b.atkOf = Object.fromEntries([b.attacker, ...(b.target !== null ? [b.target] : [])].map(u => [u, currentAtk(s, u)]));
      const asc = scriptOf(s, b.attacker);
      let atk = currentAtk(s, b.attacker);
      // 「直接攻撃できる。その場合、攻撃力はダメージ計算時のみ半分」（サイバー・ダーク・エッジ）
      if (b.target === null && b.viaDirect && asc.directAttackHalf) { atk = Math.floor(atk / 2); log(s, `${nameOf(s, b.attacker)}の攻撃力はダメージ計算時のみ半分（${atk}）`); }
      for (const u of activeCards(s)) { const add = scriptOf(s, u).battleAtkBonus?.(s, u, b.attacker, b.target) ?? 0; if (add) { atk += add; log(s, `${nameOf(s, u)}の効果で、${nameOf(s, b.attacker)}の攻撃力はダメージ計算時のみ${add}アップ（${atk}）`); } }
      // このカードの攻撃で発生するお互いの戦闘ダメージは0（ボマー・ドラゴン）
      const noDmg = !!asc.attackNoDamage;
      const both = [b.attacker, ...(b.target !== null ? [b.target] : [])].some(m => activeCards(s).some(u => scriptOf(s, u).bothTakeBattleDamage?.(s, u, m)));
      const dmg = (pp          , amount        , m        ) => {
        if (noDmg && amount > 0) { log(s, `${nameOf(s, b.attacker)}の効果で、この戦闘のダメージは0になった`); return; }
        if (b.target !== null && pp === s.cards[b.attacker].controller && isFaceUpMonster(s, b.target) && !monsterNegated(s, b.target) && scriptOf(s, b.target).doubleDamageWhenAttacked) {
          log(s, `${nameOf(s, b.target)}の効果で、戦闘ダメージは倍になる`); amount *= 2;
        }
        battleDamage(s, pp, amount, m);
        // 装備モンスターの戦闘で発生する戦闘ダメージはお互いのプレイヤーが受ける（脆刃の剣）
        if (both && amount > 0) battleDamage(s, opp(pp), amount, m);
      };
      if (b.target === null) {
        dmg(o, atk, b.attacker);
      } else {
        const t = s.cards[b.target];
        const marks           = [];
        if (t.position === 'atk') {
          const tatk = currentAtk(s, b.target);
          if (atk > tatk) { dmg(o, atk - tatk, b.target); marks.push(b.target); }
          else if (atk < tatk) { dmg(p, tatk - atk, b.attacker); marks.push(b.attacker); }
          else if (atk > 0) marks.push(b.attacker, b.target);
        } else {
          const tdef = currentDef(s, b.target);
          if (atk > tdef) { marks.push(b.target); if (asc.piercing) dmg(o, atk - tdef, b.target); } // 貫通（サイバー・ダーク・ホーン）
          else if (atk < tdef) dmg(p, tdef - atk, b.attacker);
        }
        for (const m of marks) {
          if (scriptOf(s, m).battleIndestructible && isFaceUpMonster(s, m) && !monsterNegated(s, m)) continue; // 戦闘では破壊されない
          if (protectedFromDestroy(s, m)) continue;
          const other = m === b.attacker ? b.target : b.attacker;
          if (isFaceUpMonster(s, m) && scriptOf(s, m).battleIndestructibleVs?.(s, m, other)) continue;
          const rep = scriptOf(s, m).battleReplace?.(s, m) ?? unionGuardOf(s, m);
          if (rep !== null) b.replace.push(rep); else b.destroyed.push(m);
        }
        if (b.destroyed.length) log(s, `${b.destroyed.map(u => nameOf(s, u)).join('、')}は戦闘で破壊される`);
      }
      // 画面の演出用：この戦闘の記録（攻撃したモンスター・攻撃対象・破壊されるモンスター・戦闘ダメージ）
      pushAnim(s, { kind: 'battle', attacker: b.attacker, target: b.target, destroyed: [...b.destroyed],
        damage: s.events.filter(e => e.type === 'damage' && e.battle && e.step === s.step).map(e => ({ player: (e                        ).player, amount: (e                      ).amount })) });
      checkLp(s);
      return next('afterCalc');
    }
    case 'afterCalc': {
      newStep(s);
      // 身代わりの破壊はダメージ計算後に行う
      if (b.replace.length) { log(s, '戦闘で破壊される代わりに装備カードを破壊'); destroy(s, b.replace, 'effect'); }
      if (b.atkOf) emit(s, { type: 'afterDamageCalc', attacker: b.attacker, target: b.target });
      return next('dsEnd');
    }
    case 'dsEnd': {
      newStep(s);
      const list = b.destroyed.filter(u => isOnField(s.cards[u]));
      if (list.length) destroy(s, list, 'battle');
      if (b.atkOf) emit(s, { type: 'damageStepEnd', attacker: b.attacker, target: b.target, atkPos: b.atkPos ?? [], atkOf: b.atkOf });
      return next('end');
    }
    case 'end': s.battle = null; s.window = { kind: 'open', respondDue: true }; return;
  }
}

/* =====================================================================
 * 行える行動
 * ===================================================================== */
/**
 * アドバンス召喚（リリースが1体以上）で使えるリリースの組み合わせを全部返す。
 * 普通のリリース数・リリースの数を選べるモンスター（神獣王バルバロス）・別のリリース（墓守の審神者・竜脚獣ブラキオン）・
 * リリースを助けるカード（アドバンス・フォース）・相手のモンスターをリリースに含める（帝王の烈旋）をまとめて考える
 */
export function advanceTributeSets(s           , p          , uid        )             {
  const myMons = monstersOf(s, p);
  const rel = myMons.filter(u => !scriptOf(s, u).noAdvanceTribute && releasable(s, u));
  const sc = scriptOf(s, uid);
  const counts = (sc.tributeOptions ?? [tributesFor(s, uid)]).filter(n => n > 0);
  const out             = [];
  for (const n of counts) out.push(...combos(rel, n));
  if (s.lingering.some(l => l.type === 'tributeOpp' && l.player === p && l.turn === s.turn)) {
    for (const n of counts) for (const o of monstersOf(s, opp(p)).filter(u => releasable(s, u))) for (const tr of combos(rel, n - 1)) out.push([...tr, o]);
  }
  for (const aid of activeCards(s).map(u => scriptOf(s, u).tributeAid?.(s, u, uid, p)).filter(Boolean)) out.push(...combos(myMons.filter(u => aid .ok(s, u) && releasable(s, u) && !scriptOf(s, u).noAdvanceTribute), aid .count));
  for (const alt of [sc.altTribute ?? []].flat()) out.push(...combos(myMons.filter(u => alt.ok(s, u) && releasable(s, u) && !scriptOf(s, u).noAdvanceTribute), alt.count));
  const seen = new Set        ();
  return out.filter(tr => { const k = [...tr].sort((a, b) => a - b).join(','); if (seen.has(k) || !freeMZones(s, p, tr).length) return false; seen.add(k); return true; });
}
function combos   (arr     , k        )        {
  if (k === 0) return [[]];
  const res        = [];
  arr.forEach((x, i) => { for (const rest of combos(arr.slice(i + 1), k - 1)) res.push([x, ...rest]); });
  return res;
}

/** 今、行動するプレイヤー */
export function actorOf(s           )           {
  if (s.pending) return s.pending.request.player;
  if (s.window.kind === 'priority') return s.window.player;
  return s.turnPlayer;
}

function mainActions(s           )           {
  const p = s.turnPlayer;
  const me = s.players[p];
  const acts           = [];
  const ph = s.phase;
  if (ph === 'main1') { if (s.turn > 1 && !s.lingering.some(l => l.type === 'noBattle' && l.player === p && l.turn === s.turn)) acts.push({ type: 'nextPhase', to: 'battle' }); acts.push({ type: 'nextPhase', to: 'end' }); }
  if (ph === 'battle') { acts.push({ type: 'nextPhase', to: 'main2' }); acts.push({ type: 'nextPhase', to: 'end' }); }
  if (ph === 'main2') acts.push({ type: 'nextPhase', to: 'end' });
  if (ph === 'end') acts.push({ type: 'endTurn' });
  if (isMain(ph)) {
    const myMons = monstersOf(s, p);
    const lockAll = summonLockedFor(s, p, null);
    if (!me.normalSummonUsed) {
      const summonBlocked = lockAll || activeCards(s).some(u => scriptOf(s, u).blocksSummon?.(s, u, p));
      for (const uid of me.hand) {
        const d = defOf(s, uid);
        if (d.kind !== 'monster' || d.frame === 'ritual' || d.frame === 'fusion' || scriptOf(s, uid).cannotNormalSummon) continue;
        if (scriptOf(s, uid).uniqueOnField && myMons.some(u => s.cards[u].faceUp && s.cards[u].code === s.cards[uid].code)) continue;
        const opts = scriptOf(s, uid).tributeOptions;
        if (opts) {
          for (const n of opts) for (const tr of combos(myMons.filter(u => !scriptOf(s, u).noAdvanceTribute && releasable(s, u)), n)) {
            if (freeMZones(s, p, tr).length === 0) continue;
            if (!summonBlocked) acts.push({ type: 'normalSummon', card: uid, tributes: tr });
            if (!scriptOf(s, uid).cannotSet && n < 3) acts.push({ type: 'setMonster', card: uid, tributes: tr }); // 3体リリースの方法は表側表示の召喚のみ（神獣王バルバロス）
          }
          // アドバンス・フォース：レベル5以上のモンスター1体のリリースで、リリース2体の召喚として行える
          for (const aid of activeCards(s).map(u => scriptOf(s, u).tributeAid?.(s, u, uid, p)).filter(Boolean)) {
            for (const tr of combos(myMons.filter(u => aid .ok(s, u) && releasable(s, u) && !scriptOf(s, u).noAdvanceTribute), aid .count)) if (freeMZones(s, p, tr).length) {
              if (!summonBlocked) acts.push({ type: 'normalSummon', card: uid, tributes: tr });
              if (!scriptOf(s, uid).cannotSet) acts.push({ type: 'setMonster', card: uid, tributes: tr });
            }
          }
          // 帝王の烈旋：リリースのうち1体を相手のモンスターにできる（例：バルバロスを自分2体＋相手1体の3体リリースで召喚）
          if (s.lingering.some(l => l.type === 'tributeOpp' && l.player === p && l.turn === s.turn)) {
            for (const n of opts.filter(k => k > 0)) for (const o of monstersOf(s, opp(p)).filter(u => releasable(s, u))) for (const tr of combos(myMons.filter(u => !scriptOf(s, u).noAdvanceTribute && releasable(s, u)), n - 1)) {
              if (!freeMZones(s, p, tr).length) continue;
              if (!summonBlocked) acts.push({ type: 'normalSummon', card: uid, tributes: [...tr, o] });
              if (!scriptOf(s, uid).cannotSet && n < 3) acts.push({ type: 'setMonster', card: uid, tributes: [...tr, o] });
            }
          }
          continue;
        }
        for (const aid of activeCards(s).map(u => scriptOf(s, u).tributeAid?.(s, u, uid, p)).filter(Boolean)) {
          for (const tr of combos(myMons.filter(u => aid .ok(s, u) && releasable(s, u) && !scriptOf(s, u).noAdvanceTribute), aid .count)) if (freeMZones(s, p, tr).length) {
            if (!summonBlocked) acts.push({ type: 'normalSummon', card: uid, tributes: tr });
            if (!scriptOf(s, uid).cannotSet) acts.push({ type: 'setMonster', card: uid, tributes: tr });
          }
        }
        // 帝王の烈旋：1度だけ、自分のモンスター1体の代わりに相手のモンスター1体をリリースできる
        if (tributesFor(s, uid) > 0 && s.lingering.some(l => l.type === 'tributeOpp' && l.player === p && l.turn === s.turn)) {
          const n = tributesFor(s, uid);
          for (const o of monstersOf(s, opp(p)).filter(u => releasable(s, u))) for (const tr of combos(myMons.filter(u => !scriptOf(s, u).noAdvanceTribute && releasable(s, u)), n - 1)) {
            if (!freeMZones(s, p, tr).length) continue;
            if (!summonBlocked) acts.push({ type: 'normalSummon', card: uid, tributes: [...tr, o] });
            if (!scriptOf(s, uid).cannotSet) acts.push({ type: 'setMonster', card: uid, tributes: [...tr, o] });
          }
        }
        const full = tributesFor(s, uid), free = tributeFree(s, p, uid);
        const trs = full === 0 || !free ? combos(myMons.filter(u => !scriptOf(s, u).noAdvanceTribute && releasable(s, u)), full) : [[], ...combos(myMons.filter(u => !scriptOf(s, u).noAdvanceTribute && releasable(s, u)), full)];
        for (const tr of trs) {
          if (freeMZones(s, p, tr).length === 0) continue;
          if (!summonBlocked) acts.push({ type: 'normalSummon', card: uid, tributes: tr });
          if (!scriptOf(s, uid).cannotSet) acts.push({ type: 'setMonster', card: uid, tributes: tr });
        }
        // 別のリリースでのアドバンス召喚（表側表示のみ）
        for (const alt of [scriptOf(s, uid).altTribute ?? []].flat()) if (!summonBlocked) for (const tr of combos(myMons.filter(u => alt.ok(s, u) && releasable(s, u) && !scriptOf(s, u).noAdvanceTribute), alt.count)) if (freeMZones(s, p, tr).length) acts.push({ type: 'normalSummon', card: uid, tributes: tr });
      }
    }
    for (const uid of myMons) {
      const c = s.cards[uid];
      if (c.enteredTurn === s.turn || c.positionChangedTurn === s.turn || c.attackedTurn === s.turn) continue;
      // 「表示形式を変更できない」効果は反転召喚も禁じる（公式Q&A：底なし落とし穴の裁定と同じ扱い）
      if (positionLocked(s, uid)) continue;
      if (!c.faceUp && lockAll) continue;
      acts.push(c.faceUp ? { type: 'changePosition', card: uid } : { type: 'flipSummon', card: uid });
    }
    const noSet = s.lingering.some(l => l.type === 'noSetST' && l.player === p && l.turn === s.turn);
    for (const uid of me.hand) {
      const d = defOf(s, uid);
      if (d.kind === 'monster' || noSet) continue;
      if (d.kind === 'spell' && d.subtype === 'フィールド') acts.push({ type: 'setSpellTrap', card: uid });
      else if (freeSZones(s, p).length > 0) acts.push({ type: 'setSpellTrap', card: uid });
    }
    // 召喚方法が決まった特殊召喚（手札・墓地から）
    for (const uid of [...me.hand, ...me.gy, ...me.extra]) {
      const ps = scriptOf(s, uid).procSummon;
      if (ps && ps.opt && s.opt[`${p}:proc:${s.cards[uid].code}`] === s.turn) continue;
      if (ps && !lockAll && !specialLocked(s, p) && !(s.cards[uid].zone === 'extra' && extraLocked(s, p)) && ps.zones.includes(s.cards[uid].zone) && !gyCardLocked(s, uid, null) && ps.can(s, uid, p)) acts.push({ type: 'procSummon', card: uid });
    }
  }
  if (ph === 'battle') {
    const targets = monstersOf(s, opp(p)).filter(u => !(isActive(s, u) && scriptOf(s, u).cannotBeAttackTarget?.(s, u)));
    for (const uid of monstersOf(s, p)) {
      if (!canAttack(s, uid)) continue;
      const sc = scriptOf(s, uid), all = sc.attackAll && !monsterNegated(s, uid), done = s.cards[uid].attackedTurn === s.turn ? (s.cards[uid].attackedList ?? []) : [];
      const direct = targets.length === 0 || sc.directAttackHalf || (!monsterNegated(s, uid) && sc.canDirectAttack?.(s, uid));
      if (direct && !done.length) acts.push({ type: 'attack', attacker: uid, target: null });
      for (const t of targets) if (!all || !done.includes(t)) acts.push({ type: 'attack', attacker: uid, target: t });
    }
  }
  return acts;
}

export function legalActions(s           )           {
  if (s.winner !== null || s.pending) return [];
  const p = actorOf(s);
  const acts           = activatableList(s, p).map(a => ({ type: 'activate', card: a.uid, effect: a.effect })          );
  if (s.window.kind === 'priority') return [{ type: 'pass' }, ...acts];
  return [...mainActions(s), ...acts];
}

function sameAction(a        , b        )          {
  if (a.type !== b.type) return false;
  const norm = (x        ) => JSON.stringify({ ...x, zone: undefined, tributes: 'tributes' in x ? [...x.tributes].sort((m, n) => m - n) : undefined });
  return norm(a) === norm(b);
}

/* =====================================================================
 * 行動の実行
 * ===================================================================== */
/** 行動を実行した新しい状態を返す（元の状態は変更しない）。ルール上できない行動は RuleError */
/** applyAction を呼んだ回数（CPU の考える量の上限に使う） */
export const WORK = { n: 0 };
export function applyAction(prev           , action        )            {
  WORK.n++;
  let s            = cloneState(prev);
  if (s.winner !== null) throw new RuleError('デュエルは終了しています');
  if (action.type === 'surrender') { lose(s, action.player, 'サレンダーした'); return s; }

  if (s.pending) {
    if (action.type !== 'answer') throw new RuleError('先に選択をしてください');
    const pend = s.pending;
    const err = validateAnswer(s, pend.request, action.value);
    if (err) throw new RuleError(err);
    s = cloneState(pend.base);
    runProc(s, pend.proc, [...pend.answers, action.value]);
    flow(s);
    return s;
  }
  if (action.type === 'answer') throw new RuleError('選択を求められていません');
  // 召喚成功の直後など、相手が応答できる時：ターンプレイヤーが次の行動をする前に、相手に応答の機会を渡す（奈落の落とし穴などがすぐ発動できるように）
  if (action.type === 'offer') {
    const w = s.window;
    if (!(w.kind === 'open' && w.respondDue) || s.winner !== null) throw new RuleError('今は相手に応答の機会を渡す場面ではありません');
    w.respondDue = false;
    s.window = { kind: 'priority', player: opp(s.turnPlayer), passes: 1, mode: 'normal', cont: { type: 'none' } };
    if (activatableList(s, opp(s.turnPlayer)).length > 0) { flow(s); return s; }
    s.window = { kind: 'open', respondDue: false };
    return s;
  }
  if (!legalActions(s).some(a => sameAction(a, action))) throw new RuleError(explainIllegal(s, action));

  if (action.type === 'pass') { passPriority(s); flow(s); return s; }
  const w = s.window;
  if (action.type === 'activate' && !(w.kind === 'open' && w.respondDue)) {
    s.queue.push({ type: 'activate', player: actorOf(s), uid: action.card, effect: action.effect, zone: action.zone });
    flow(s);
    return s;
  }
  // ターンプレイヤーの行動（効果の発動を含む）：直前の出来事に相手が応答できるなら、先に相手に機会を与える
  // 例：召喚成功時に、ターンプレイヤーが起動効果を発動するより先に、相手は激流葬を発動できる（公式Q&A [10040]）
  if (w.kind === 'open' && w.respondDue) {
    w.respondDue = false;
    s.window = { kind: 'priority', player: opp(s.turnPlayer), passes: 1, mode: 'normal', cont: { type: 'deferred', action } };
    if (activatableList(s, opp(s.turnPlayer)).length > 0) { flow(s); return s; }
    s.window = { kind: 'open', respondDue: false };
  }
  performMain(s, action);
  flow(s);
  return s;
}

/* ---------- できない理由の説明 ---------- */
/** その行動ができない理由（できるなら null）。画面で、押す前に理由を見せるために使う */
export function whyIllegal(s           , a        )                {
  if (s.pending || s.winner !== null) return null;
  if (legalActions(s).some(x => sameAction(x, a))) return null;
  return explainIllegal(s, a);
}
function explainIllegal(s           , a        )         {
  const p = s.turnPlayer;
  const ph = s.phase;
  if (s.window.kind === 'priority' && a.type !== 'activate' && a.type !== 'pass') return `${pl(s.window.player)}の応答待ちです（発動するか、パスしてください）`;
  if (a.type === 'pass') return '今はパスする場面ではありません';
  switch (a.type) {
    case 'activate': {
      const c = s.cards[a.card];
      if (!c) return 'カードがありません';
      const eff = (scriptOf(s, a.card).effects || []).find(e => e.id === a.effect);
      if (!eff) return 'このカードの効果はまだ組み込まれていません';
      if (actorOf(s) !== c.controller && c.zone !== 'hand') return '自分のカードではありません';
      const d = defOf(s, a.card);
      if (d.kind === 'trap' && c.zone === 'hand') return '罠カードは手札から発動できません。セットしてください';
      if (d.kind === 'trap' && c.enteredTurn === s.turn) return 'セットしたターンには罠カードを発動できません';
      if (d.kind === 'spell' && d.subtype === '速攻' && c.zone === 'szone' && c.enteredTurn === s.turn) return 'セットしたターンには速攻魔法を発動できません';
      if (s.chain.length) return `チェーン${s.chain.length}にはスペルスピード${Math.max(2, s.chain[s.chain.length - 1].ss)}以上の効果しか発動できません`;
      if (eff.ss === 1 && (actorOf(s) !== p || !isMain(ph))) return 'スペルスピード1の効果は自分のメインフェイズにしか発動できません';
      if (!optAvailable(s, a.card, eff, actorOf(s))) return 'この効果は1ターンに1度しか使えません';
      if (activationBlockedByName(s, a.card, actorOf(s))) return 'このターン、このカード名の効果は発動できません';
      // 混沌帝龍：「このカードの効果を発動するターン、自分は他の効果を発動できない」
      { const q = actorOf(s), only = s.lingering.find(l => l.type === 'onlyThisCard' && l.player === q && l.turn === s.turn && l.uid !== a.card);
        if (only) return `このターンは${nameOf(s, only.uid )}の効果を発動したので、他の効果は発動できません`;
        if (scriptOf(s, a.card).exclusive && s.activatedTurn?.[String(q)] === s.turn) { const f = s.activatedFirst?.[String(q)]; return `このターンはすでに${f && f.turn === s.turn ? nameOf(s, f.uid) : '他のカード'}の効果を発動しているので、${nameOf(s, a.card)}の効果は発動できません（このカードの効果を発動するターン、自分は他の効果を発動できない）`; } }
      return '今は発動条件を満たしていません';
    }
    case 'nextPhase':
      if (a.to === 'battle' && s.turn === 1) return '最初のターンはバトルフェイズを行えません';
      return `${PHASE_LABEL[ph]}から${PHASE_LABEL[a.to]}へは移れません`;
    case 'endTurn': return 'エンドフェイズでのみターンを終了できます';
    case 'normalSummon': case 'setMonster': {
      if (!isMain(ph)) return '召喚・セットはメインフェイズにしか行えません';
      const c = s.cards[a.card];
      if (!c || c.zone !== 'hand' || c.controller !== p) return '手札のモンスターではありません';
      const d = defOf(s, a.card);
      if (d.kind !== 'monster') return 'モンスターではありません';
      if (d.frame === 'ritual') return '儀式モンスターは通常召喚・セットできません';
      if (scriptOf(s, a.card).cannotNormalSummon) return 'このカードは通常召喚できません';
      if (s.players[p].normalSummonUsed) return '通常召喚（セット含む）は1ターンに1度しか行えません';
      if (a.type === 'normalSummon') {
        const by = activeCards(s).find(u => scriptOf(s, u).blocksSummon?.(s, u, p));
        if (by !== undefined) return `${nameOf(s, by)}の効果で、自分フィールドに裏側表示モンスターがいる間は召喚できません（セットはできます）`;
      }
      const need = tributeFree(s, p, a.card) && a.tributes.length === 0 ? 0 : tributesFor(s, a.card);
      if ([scriptOf(s, a.card).altTribute ?? []].flat().some(alt => a.type === 'normalSummon' && a.tributes.length === alt.count && a.tributes.every(u => alt.ok(s, u)))) return 'モンスターゾーンに空きがありません';
      if (a.tributes.length !== need) return `このモンスターの召喚には${need}体のリリースが必要です`;
      if (a.tributes.some(t => !monstersOf(s, p).includes(t))) return 'リリースできるのは自分フィールドのモンスターだけです（帝王の烈旋の効果がある時は、相手のモンスター1体も使えます）';
      return 'モンスターゾーンに空きがありません';
    }
    case 'flipSummon': case 'changePosition': {
      if (!isMain(ph)) return '表示形式の変更はメインフェイズにしか行えません';
      const c = s.cards[a.card];
      if (!c || !monstersOf(s, p).includes(a.card)) return '自分フィールドのモンスターではありません';
      if (c.enteredTurn === s.turn) return 'フィールドに出たターンは表示形式を変更できません';
      if (c.positionChangedTurn === s.turn) return '表示形式の変更は1ターンに1度しか行えません';
      if (c.attackedTurn === s.turn) return '攻撃したモンスターは表示形式を変更できません';
      if (positionLocked(s, a.card)) return 'カードの効果で表示形式を変更できません（反転召喚もできません）';
      if (a.type === 'flipSummon' && c.faceUp) return '表側表示のモンスターは反転召喚できません';
      if (a.type === 'changePosition' && !c.faceUp) return '裏側表示のモンスターは反転召喚で表にします';
      if (positionLocked(s, a.card)) return 'カードの効果で表示形式を変更できません';
      return 'その操作はできません';
    }
    case 'setSpellTrap': {
      if (!isMain(ph)) return '魔法・罠のセットはメインフェイズにしか行えません';
      return '魔法＆罠ゾーンに空きがありません';
    }
    case 'attack': {
      if (s.turn === 1) return '先攻1ターン目はバトルフェイズを行えないため、攻撃できません';
      if (ph !== 'battle') return '攻撃はバトルフェイズに行います（「バトルフェイズへ」を押してください）';
      const c = s.cards[a.attacker];
      if (!c || !monstersOf(s, p).includes(a.attacker)) return '自分フィールドのモンスターではありません';
      if (!c.faceUp) return '裏側表示のモンスターは攻撃できません（メインフェイズに反転召喚してください）';
      if (c.position !== 'atk') return '守備表示のモンスターは攻撃できません（メインフェイズに攻撃表示にしてください）';
      if (c.attackedTurn === s.turn) return 'このモンスターはこのターン既に攻撃しています';
      if (c.noAttack) return '「黙する死者」の効果で特殊召喚されたモンスターは攻撃できません';
      if (!canAttack(s, a.attacker)) {
        const by = attackForbiddenBy(s, a.attacker);
        return by !== null ? `${nameOf(s, by)}の効果で攻撃宣言できません` : 'カードの効果で攻撃できません';
      }
      if (a.target === null) return '相手フィールドにモンスターがいるため、ダイレクトアタックできません';
      return '攻撃対象にできないカードです';
    }
    default: return 'その操作はできません';
  }
}
