// 人どうしのオンライン対戦の通信の部品（docs/online-duel-plan.md）
// - 2台は「最初の約束（種・デッキ・先攻）」と「お互いの操作」だけを送り合う。盤面は送らない
//   （エンジンは、同じ種・同じデッキ・同じ操作の並びなら、必ず同じ盤面になる）
// - 部屋の部品（Room）は、サイトの room().join(name) と同じ形（presence・onPeers・leave）。
//   本番ではサイトの Firestore の部屋を、試す時は下の「手元の部屋」を渡す
// - 2台とも全部の情報を持つ作り（MASTERの決定）。相手の手札・伏せカードを画面で見せないのは画面の仕事
import { createGame, applyAction, actorOf, legalActions } from '../engine/game.js?v=20261122-1617-0de5ac141a';
import { answerCandidates } from '../ai/cpu.js?v=20261122-1617-0de5ac141a';
import { CARD_POOL } from '../data/cardpool.js?v=20261122-1617-0de5ac141a';
import { DECKS } from '../data/decks.js?v=20261122-1617-0de5ac141a';
                                                                      

/* ===================== 部屋（サイトの room() と同じ形） ===================== */
                                                                                          
                       
                                         
                                                                                       
                            
 

/** 同じプログラムの中だけの部屋（テスト用）。hub.join(uid) で入る */
export function memoryHub() {
  const docs = new Map                                           ();
  const subs = new Set            ();
  const tellAll = () => queueMicrotask(() => subs.forEach(f => f()));
  return {
    join(uid        )       {
      return {
        presence: async p => { docs.set(uid, { p: JSON.parse(JSON.stringify(p ?? {})), updatedAt: Date.now() }); tellAll(); },
        onPeers: cb => {
          const f = () => cb({ peers: [...docs].map(([id, d]) => ({ uid: id, isMe: id === uid, presence: d.p, updatedAt: d.updatedAt })) });
          subs.add(f); queueMicrotask(f);
          return () => subs.delete(f);
        },
        leave: async () => { docs.delete(uid); tellAll(); },
      };
    },
  };
}

/** 同じPCの2つのタブをつなぐ部屋（BroadcastChannel）。Firebaseなしで画面を試す時に使う */
export function tabRoom(name        , uid        )       {
  const ch = new BroadcastChannel('ygo-duel-room:' + name);
  const docs = new Map                                           ();
  const subs = new Set            ();
  const tellAll = () => subs.forEach(f => f());
  ch.onmessage = (e              ) => {
    const m = e.data                                                                            ;
    // 入ってきたタブに、知っている欄を全部送り返す（頼んできたタブ自身の前の欄も。読み直したタブが前の操作を取り戻せるように＝Firestore と同じ形。💜MIMIの頼み）
    if (m.ask) { for (const [id, d] of docs) ch.postMessage({ uid: id, p: d.p, at: d.updatedAt }); return; }
    if (m.leave) docs.delete(m.uid); else docs.set(m.uid, { p: m.p, updatedAt: m.at });
    tellAll();
  };
  ch.postMessage({ uid, ask: true, at: Date.now() }); // 先にいる人に、今の中身をもう一度送ってもらう
  return {
    presence: async p => {
      const d = { p: JSON.parse(JSON.stringify(p ?? {})), updatedAt: Date.now() };
      docs.set(uid, d); ch.postMessage({ uid, p: d.p, at: d.updatedAt }); tellAll();
    },
    onPeers: cb => {
      const f = () => cb({ peers: [...docs].map(([id, d]) => ({ uid: id, isMe: id === uid, presence: d.p, updatedAt: d.updatedAt })) });
      // 最初の知らせは、ほかのタブからの送り返しを少し待ってから（読み直した時に、自分の前の欄が届いてから始めるため）
      const first = setTimeout(() => { subs.add(f); f(); }, 200);
      return () => { clearTimeout(first); subs.delete(f); };
    },
    leave: async () => { docs.delete(uid); ch.postMessage({ uid, leave: true, at: Date.now() }); ch.close(); },
  };
}

/** お試し版・本番を作る時（scripts/build.mjs）に、できあがった .js ぜんぶの指紋をここに書きこむ（手元では 'dev'）。
 *  画面（app.js）にも同じ指紋が書かれるので、卓を開いた時に「app.js の指紋」とこれが同じか比べる（ちがえばページを読み直す） */
export const BUILD_FP = '20261122-1617-0de5ac141a';

/* ===================== エンジンの指紋 ===================== */
/**
 * エンジンとカードの処理の「指紋」：決まった種・決まった手順で少し対戦させた盤面から作る短い文字。
 * 画面の版の文字が同じでも、ブラウザが古いプログラム（エンジン）を覚えていると2台がずれるので、これも比べる（MIMIの気づき）
 */
let fpCache                = null;
export function engineFingerprint()         {
  if (fpCache) return fpCache;
  const codes = Object.keys(DECKS).sort();
  let s = createGame({ pool: CARD_POOL, decks: [DECKS[codes[0]], DECKS[codes[1 % codes.length]]], seed: 12345, firstPlayer: 0 });
  for (let i = 0; i < 400 && s.winner === null; i++) {
    let a                    ;
    if (s.pending) { const c = answerCandidates(s, s.pending.request, 4); a = c.length ? { type: 'answer', value: c[i % c.length] }           : undefined; }
    else { const L = legalActions(s); a = L[(i * 7) % Math.max(1, L.length)]; }
    if (!a) break;
    try { s = applyAction(s, a); } catch { break; }
  }
  const text = JSON.stringify({ p: s.players, c: s.cards, l: s.log.slice(-50), t: s.turn });
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  fpCache = (h >>> 0).toString(36) + '-' + text.length.toString(36);
  return fpCache;
}

/**
 * 盤面の印：盤面の大事な所（LP・手札・場・墓地・除外・番・フェイズ・乱数の位置・聞く相手 askZone）から作る短い文字。
 * 2台が同じ数の操作を入れた時に、相手の印と比べて、ちがえばすぐ「ずれ」と分かる（ずれたまま対戦が進まないように）
 */
/** 届いた操作の項目の並び順を、エンジンの今できる操作の並び順にそろえる（t20）。
 *  サイトの部屋（Firestore）は、欄の中の項目をアルファベット順に並べかえて返す（{type,card,tributes} → {card,tributes,type}）。
 *  エンジンは並び順まで見て「今できる操作か」を比べるので、そのままだと子の召喚が親の側で「モンスターゾーンに空きがありません」になっていた */
export function inOrder(s           , a        )         {
  if (!a || s.pending || a.type === 'surrender' || a.type === 'answer') return a;
  const key = (x        ) => { const o = { ...x }                           ; delete o.zone; if (Array.isArray(o.tributes)) o.tributes = [...(o.tributes            )].sort((m, n) => m - n); return JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]])); };
  const k = key(a);
  const x = legalActions(s).find(l => l.type === a.type && key(l) === k);
  return x ? ({ ...x, ...a }          ) : a;
}

/** 見張りの時計がこれより長く止まっていたら「この端末が寝ていた」とみなして、待ち時間を数え直す。
 *  裏に回ったタブの時計は1分に1回まで間引かれる（Chrome）ので、それより長くする。「いなくなった」までの時間の半分より長くはしない（t20：間引きのたびに数え直して、3時間たっても「いなくなった」にならなかった） */
export const SLEPT_MS = 90000;

export function stateCheck(s           )         {
  const pl = s.players.map(P => [P.lp, P.hand, P.deck.length, P.mzone, P.szone, P.fzone, P.gy, P.banished]);
  const field = Object.values(s.cards).filter(c => c.zone === 'mzone' || c.zone === 'szone' || c.zone === 'fzone').map(c => [c.uid, c.code, c.faceUp, c.position, c.controller]);
  const text = JSON.stringify([s.turn, s.turnPlayer, s.phase, s.rng, s.winner, s.askZone ?? null, s.chain.length, !!s.pending, pl, field]);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/* ===================== 対戦の通信 ===================== */
/** 自分の欄に書く中身 */
                          
                  
                             
            
                                                          
              
                                    
             
                                                                    
             
                          
               
               
               
                                               
                                                                                                                                   
                                                  
                                              
                                 
                                                 
                                                     
                 
                                                              
                      
                                    
                  
                   
                
           
                                                              
                       
              
                                                  
                                                
 

/** 公式試合／練習（電卓と同じく親が決める） */
                                           

                       
                                                                     
                                                                                                    
                                                        
                                                     
                                      
                                                     
                                                                                                
                                                                      
                                                             
                            
                                                     
                                          

                              
             
              
                                     
                
                  
               
               
                               
                        
                                                     
                   
                                     
                       
                                                  
                  
                             
              
                                                                        
                  
                                                                                     
                        
                             
 

/** オンライン対戦の通信。send(action) で自分の操作を送る。相手の操作は on({type:'remote'}) で届く */
export class DuelLink {
  state                   = null;
  seat           = 0;
          doc         ;
          applied = 0; // 相手の操作をいくつまで盤面に入れたか
          timer                                       = null;
          unsub            ;
          stopped = false;
          joined = false;
          beat                                        = null;
          watch                                        = null;
          lastSeen = 0; // 相手の欄が最後に変わったのを、この端末が受け取った時刻（相手の端末の時計は使わない）
          seenKey = ''; // 相手の欄の中身の目じるし（変わったら lastSeen を今にする）
          initialKey                = null; // 入った時に部屋にあった相手の欄の目じるし（''＝無かった）
          lastJ = ''; // 返事をした相手の合図
          live = false; // 相手の欄が、入った後に一度でも変わったか（＝今そこにいる相手か）
          lastHeard = 0; // 部屋の知らせ（onPeers）を最後に受け取った時刻
          relistenAt = 0; // 最後に聞き直した時刻
          lastBeat = 0; // 自分の心拍が最後に動いた時刻（スマホが裏に回って止まっていたかを見る）
          round = 0; // 何回目の対戦か（もう一度で1つ増える）
          toldChooser = 0; // 決める人の知らせを出した回
          chooserAt = 0; // 決める人の知らせを出した時刻（この端末の時計）
          themUid = '';
          them                 = null; // 相手の欄（最後に読んだもの）
          toldAsk = 0; // 申し込みの知らせを出した回
  /** 子が降参を送って、親が入れるのを待っている（💜MIMIの見つけた穴：2人が同時に降参すると、2台で勝った人がちがった）。
   *  決まり（CODE 02:10）：先に届いた降参だけ入れる。2台で同じ順番にするため、親を「並べる人」にする：
   *  親の降参はすぐ決着。子の降参は送るだけで、親が入れて決着を書いたら、子も自分の降参を入れて決着。
   *  親の降参が入っていれば、それが先（親が降参できるのは、まだ子の降参を入れていない時だけなので）。子の降参は入れない */
          giveUpSent = false;
          o             ;

  constructor(o             ) {
    this.o = o;
    this.doc = { app: 'ygo-duel', v: o.version, fp: engineFingerprint(), b: BUILD_FP, name: o.name, deck: o.deck, ops: [], ready: o.host ? true : (o.ready ?? true) };
    this.seat = o.host ? 0 : 1;
    this.doc.j = Math.random().toString(36).slice(2, 10);
    // 自分の欄は、最初に部屋の中身を読んでから書く（つながり直しの時に、前の操作を消さないため）
    this.unsub = this.listen();
    // いることを知らせる＋相手がいなくなっていないか見る
    this.beat = setInterval(() => this.heartbeat(), o.heartbeatMs ?? 30000);
    (this.beat                                     ).unref?.(); // テストでプログラムが終われなくならないように（画面では何もしない）
    this.watch = setInterval(() => this.watchAway(), Math.min(1000, o.heartbeatMs ?? 30000));
    (this.watch                                     ).unref?.();
  }

  /** 部屋を聞く。聞くのがエラーで止まったら、3秒後に聞き直す（Firestore の Listen は、エラーのあとは二度と知らせてこない） */
          listen()             {
    this.lastHeard = Date.now();
    return this.o.room.onPeers(ch => { this.lastHeard = Date.now(); this.onPeers(ch.peers); }, () => {
      if (this.stopped) return;
      const t = setTimeout(() => this.relisten(), 3000); (t                                     ).unref?.();
    });
  }
  /** 聞き直す（t20：サイトで Listen のつながりが切れたまま、相手の操作が3時間届かなかった） */
          relisten() {
    if (this.stopped) return;
    this.relistenAt = Date.now();
    try { this.unsub(); } catch { /* もう止まっている */ }
    this.unsub = this.listen();
  }

  /** 30秒ごと：いることを自分の欄に書く */
          heartbeat() {
    if (this.stopped || this.doc.end) return;
    this.doc.at = Date.now();
    this.write();
  }

  /** 1秒ごと：相手がいなくなっていないか・決める人が選ばないままでないかを見る（書きこみはしない）。
   *  30秒ごとの書きこみとは分けて見るので、画面の「あと 0:00」と終わりの知らせがずれない（COLOの気づき：0:00から約8秒の間があった） */
          watchAway() {
    if (this.stopped) return;
    const now = Date.now(), iv = Math.min(1000, this.o.heartbeatMs ?? 30000), away = this.o.awayMs ?? 180000;
    // スマホが裏に回る・画面が暗くなるなどで、自分の時計が止まっていた時は、戻ったばかりで相手の新しい知らせがまだ届いていない。
    // その時に「3分たった」と決めつけないよう、待ち時間を今から数え直す（接続が毎回切れる件の対策）
    if (this.lastBeat && now - this.lastBeat > Math.max(iv * 2.5, Math.min(SLEPT_MS, away / 2))) { this.lastSeen = now; if (this.chooserAt) this.chooserAt = now; }
    this.lastBeat = now;
    // 先攻・後攻を決める人が、選ばないまま「いなくなった」と同じ時間（3分）たった：その対戦は始めずに終わる（記録しない）
    const waitingPick = this.o.chooseFirst && this.toldChooser === this.round + 1 && (!this.state || this.state.winner !== null);
    if (waitingPick && this.chooserAt && now - this.chooserAt > away) {
      this.doc.end = { winner: null, reason: 'nochoose' }; this.doc.round = this.round;
      this.write();
      this.o.on({ type: 'away', reason: 'nochoose' });
      this.stop();
      return;
    }
    if (this.doc.end) return;
    // 相手は30秒ごとに欄を書くので、2回半ぶん何も変わらなければ、こちらの聞くつながりが切れているかもしれない：聞き直す（1分半に1回まで）
    const quiet = Math.max((this.o.heartbeatMs ?? 30000) * 2.5, 5000);
    // （相手がいる時は相手の欄の変わり目で見る。自分の書きこみでも知らせは来るので、知らせの時刻だけでは切れたと分からない）
    const heard = this.live ? this.lastSeen : this.lastHeard;
    if (this.joined && now - heard > quiet && now - this.relistenAt > quiet) this.relisten();
    if (this.state && this.lastSeen && now - this.lastSeen > away && this.giveUpSent && this.state.winner === null) {
      // 子が降参を送ったまま、親がいなくなった：自分の降参で終わる（親が戻れば、親も子の降参を入れて同じ答えになる。CODE 02:21 でこの形に決定）
      this.giveUpNow();
      return;
    }
    if (this.state && this.lastSeen && now - this.lastSeen > away) {
      this.doc.end = { winner: null, reason: 'away' };
      this.write();
      this.o.on({ type: 'away' });
      this.stop();
    }
  }

  /** 自分の欄を書く。書けなかった時（電波が切れた等）は、3秒後にもう一度書く（欄にはいつも全部の操作が入っているので、書き直せば相手に全部届く） */
          retry                                       = null;
          write() {
    if (this.stopped && !this.doc.end) return;
    if (this.state) this.doc.chk = { round: this.round, n: this.doc.ops.length + this.applied, h: stateCheck(this.state) };
    let p                  ;
    try { p = this.o.room.presence(this.doc); } catch (e) { p = Promise.reject(e); }
    p.catch(() => {
      if (this.retry || this.stopped) return;
      this.retry = setTimeout(() => { this.retry = null; this.write(); }, 3000);
      (this.retry                                     ).unref?.();
    });
  }

  /** ずれを見つけた：知らせて止まる。自分の欄に「ずれで終わり」を書いて、相手の画面も同じ知らせで止める（記録はしない） */
          desync(detail        ) {
    if (this.stopped) return;
    this.doc.end = { winner: null, reason: 'desync' }; this.doc.round = this.round;
    this.write();
    this.o.on({ type: 'desync', detail });
    this.stop();
  }

          stop() { if (this.retry) { clearTimeout(this.retry); this.retry = null; } this.stopped = true; if (this.beat) { clearInterval(this.beat); this.beat = null; } if (this.watch) { clearInterval(this.watch); this.watch = null; } if (this.timer) { clearTimeout(this.timer); this.timer = null; } }

          onPeers(peers        ) {
    if (this.stopped) return;
    const keyOf = (d         ) => [d.at, d.ops?.length, d.ready, d.rematchAsk, d.start?.round, d.round, d.end ? JSON.stringify(d.end) : ''].join('|');
    if (!this.joined) {
      const o0 = peers.find(p => !p.isMe && (p.presence                  )?.app === 'ygo-duel');
      this.initialKey = o0 ? keyOf(o0.presence           ) : '';
      this.joined = true;
      // つながり直し：自分の欄に同じ版の対戦が残っていれば、それを引きつぐ
      const mine = peers.find(p => p.isMe)?.presence                       ;
      // ただし、古い欄（いなくなったと決まる時間より前に書かれたもの）は前の対戦の残りなので引きつがない
      const fresh = (d          ) => !!d && Date.now() - (d.at ?? 0) < (this.o.awayMs ?? 180000);
      if (mine && mine.app === 'ygo-duel' && mine.v === this.o.version && mine.end?.reason !== 'away' && mine.end?.reason !== 'nochoose' && mine.end?.reason !== 'desync' && (mine.start || mine.ops?.length) && fresh(mine)) this.doc = { ...mine, ops: [...(mine.ops ?? [])], j: this.doc.j };
      this.doc.at = Date.now();
      this.lastBeat = Date.now();
      this.write();
    }
    const other = peers.find(p => !p.isMe && (p.presence                  )?.app === 'ygo-duel');
    if (!other) return;
    const them = other.presence           ;
    const key = keyOf(them);
    // 前の対戦の残り（もう書かれない欄）は相手として扱わない。時計は使わずに「自分が入った後に、相手の欄が一度でも変わったか」で見分ける
    // （相手の端末の時計がずれていても大丈夫）。初めて変わったのを見たら、自分の欄も書き直して、相手にもこちらがいることを知らせる
    // 相手の合図が新しくなったら、一度だけ返事を書く（相手が、こちらがいると分かるように）
    if (them.j && them.j !== this.lastJ) { this.lastJ = them.j; this.doc.ack = them.j; this.doc.at = Date.now(); this.write(); }
    if (!this.live) {
      // 今そこにいる相手：こちらの合図に返事をくれた、または入った後に欄が変わった
      if (them.ack !== this.doc.j && key === this.initialKey) return;
      this.live = true;
    }
    this.them = them;
    // 相手の欄の中身が変わったのを受け取った時刻を、この端末の時計で覚える
    if (key !== this.seenKey || !this.lastSeen) { this.seenKey = key; this.lastSeen = Date.now(); }
    // 相手が「いなくなった」と決めた印は、今の対戦のものだけ信じる（前の対戦の印が残っていても、次の対戦は止めない）
    if (them.end?.reason === 'away' && this.state && them.round === this.round) { this.o.on({ type: 'away' }); this.stop(); return; }
    // 相手の画面が「ずれ」で止まった（t20：今までは、こちらは3分待たされて「いなくなった」で終わっていた）
    if (them.end?.reason === 'desync' && this.state && them.round === this.round && !this.stopped) { this.o.on({ type: 'desync', detail: '相手の画面で、2人の盤面がずれた' }); this.stop(); return; }
    // 先攻・後攻を選ばないまま3分（相手の側が先に気づいた時）
    if (them.end?.reason === 'nochoose' && this.o.chooseFirst && this.toldChooser === this.round + 1 && them.round === this.round) { this.o.on({ type: 'away', reason: 'nochoose' }); this.stop(); return; }
    if (them.v !== this.o.version || (them.fp && them.fp !== this.doc.fp) || (them.b && them.b !== this.doc.b)) { this.o.on({ type: 'version', mine: this.o.version, theirs: them.v }); return; }
    // 先攻・後攻を決める人の知らせ（子）：親が次の回の決める人を書いたら、1回だけ知らせる
    if (!this.o.host && this.o.chooseFirst && them.pick && them.pick.round === this.round + 1 && this.toldChooser !== them.pick.round) {
      this.toldChooser = them.pick.round; this.chooserAt = Date.now();
      this.o.on({ type: 'chooser', chooser: them.pick.chooser, me: them.pick.chooser === this.seat, round: them.pick.round });
    }
    // もう一度：親が新しい約束（回数が1つ大きい）を書いたら、子は前の対戦を片づけて作り直す
    if (!this.o.host && them.start && them.start.round > this.round && this.state) {
      this.state = null; this.applied = 0; this.doc.ops = []; this.giveUpSent = false; delete this.doc.end;
    }
    // 最初の約束：親が書く。子は親の約束を読んで同じ盤面を作る
    if (!this.state) {
      this.themUid = other.uid;
      if (this.o.host && !this.doc.start && them.ready) this.hostTryStart(them);
      const st = this.o.host ? this.doc.start : them.start;
      if (!st || (!this.o.host && st.guest !== this.o.uid)) return;
      let s = createGame({ pool: CARD_POOL, decks: [DECKS[st.decks[0]], DECKS[st.decks[1]]], seed: st.seed, firstPlayer: st.first });
      // 効果で特殊召喚するマスは、2台とも「その人に聞く」にそろえる（盤面の流れが変わる設定は、2台で必ず同じにする。
      // 💜MIMIの見つけた穴：画面が自分の席だけ聞く設定にしていて、2台で聞く相手がちがい、ずれていた）
      s.askZone = [0, 1];
      // つながり直しの時は、自分と相手の操作を、動く番の順に入れ直して続きから
      const mine = this.doc.ops, theirs = them.round === st.round ? (them.ops ?? []) : [];
      // 降参の順番：親の降参があれば、それが先。子の降参は入れない（2台で同じ答え）。子は、親が決着を書くまで自分の降参を入れない
      const isGiveUp = (a         ) => a?.type === 'surrender';
      const hostGaveUp = (this.o.host ? mine : theirs).some(isGiveUp);
      const guestOps = this.o.host ? theirs : mine;
      const gi = guestOps.findIndex(isGiveUp);
      const hostEnded = !this.o.host && !!them.end && !them.end.reason && them.round === st.round;
      const skipGuest = gi >= 0 && (hostGaveUp || (!this.o.host && !hostEnded));
      if (!this.o.host && gi >= 0 && !hostGaveUp) this.giveUpSent = true;
      let mi = 0, ti = 0;
      for (let k = 0; k < mine.length + theirs.length && s.winner === null; k++) {
        if (skipGuest) { if (this.o.host && ti === gi) { ti++; continue; } if (!this.o.host && mi === gi) { mi++; continue; } }
        const meNow = actorOf(s) === this.seat;
        // 降参は番に関係なく入る
        if (!meNow && mine[mi]?.type === 'surrender') { s = applyAction(s, inOrder(s, mine[mi++])); continue; }
        if (meNow && theirs[ti]?.type === 'surrender') { s = applyAction(s, inOrder(s, theirs[ti++])); continue; }
        if (meNow) { if (mi >= mine.length) break; s = applyAction(s, inOrder(s, mine[mi++])); }
        else { if (ti >= theirs.length) break; s = applyAction(s, inOrder(s, theirs[ti++])); }
      }
      this.state = s; this.applied = ti; this.round = st.round;
      if (this.doc.round !== st.round) { this.doc.round = st.round; this.write(); }
      this.o.on({ type: 'start', state: this.state, seat: this.seat, round: st.round, mode: st.mode, resumed: mi + ti > 0 });
    }
    // 相手の操作を、まだ入れていない分だけ順に入れる
    const ops = them.round === this.round ? (them.ops ?? []) : [];
    while (this.applied < ops.length && this.state && this.state.winner === null) {
      const a = ops[this.applied];
      // 降参だけは、番に関係なくいつでも届く（MIMIの指摘）
      if (actorOf(this.state) === this.seat && !(a.type === 'surrender' && a.player !== this.seat)) { this.desync(`自分の番なのに相手の操作が届いた（${this.applied}番目）`); return; }
      this.state.askZone = [0, 1]; // 画面が盤面を書きかえていても、2台で必ず同じにしてから入れる
      try { this.state = applyAction(this.state, inOrder(this.state, a)); } catch (e) { this.desync(`相手の操作を入れられない：${(e         ).message}`); return; }
      this.applied++;
      this.o.on({ type: 'remote', action: a, state: this.state });
    }
    // 盤面の印を比べる：同じ数の操作を入れたところで印がちがえば、すぐ「ずれ」（降参が入った時は順番が前後するので比べない）
    const ck = them.chk;
    if (ck && this.state && ck.round === this.round && ck.n === this.doc.ops.length + this.applied && ck.h !== stateCheck(this.state)
      && !this.doc.ops.some(o => o.type === 'surrender') && !(them.ops ?? []).some(o => o.type === 'surrender')) {
      this.desync(`盤面の印がちがう（${ck.n}手目）`); return;
    }
    // 子：降参を送ったあと、親が（子の降参を入れて）決着を書いた → 自分の降参を入れて決着。親の降参が先に入っていたら、上でもう決着している
    if (!this.o.host && this.giveUpSent && this.state && this.state.winner === null && them.end && !them.end.reason && them.round === this.round) { this.giveUpNow(); return; }
    if (this.state && this.state.winner !== null) this.finish();
    // もう一度：相手が今の回を申し込んできたら知らせる。2人とも申し込んだら、親が始め直す
    if (this.state && this.state.winner !== null && them.rematchAsk === this.round) {
      if (this.doc.rematchAsk === this.round) { if (this.o.host) this.rematch(); }
      else if (this.toldAsk !== this.round) { this.toldAsk = this.round; this.o.on({ type: 'rematchAsked' }); }
    }
  }

  /** 親：始める約束を書く。chooseFirst の時は、決める人をランダムで決めて、その人が選ぶのを待ってから書く */
          hostTryStart(them         ) {
    const rnd = this.o.random ?? Math.random;
    const next = this.round + 1;
    let first          ;
    let chooser                      ;
    if (this.o.chooseFirst) {
      if (!this.doc.pick || this.doc.pick.round !== next) { this.doc.pick = { round: next, chooser: rnd() < 0.5 ? 0 : 1 }; this.write(); }
      chooser = this.doc.pick.chooser;
      if (this.toldChooser !== next) { this.toldChooser = next; this.chooserAt = Date.now(); this.o.on({ type: 'chooser', chooser, me: chooser === this.seat, round: next }); }
      const pick = chooser === this.seat ? this.doc.firstPick : them.firstPick;
      if (!pick || pick.round !== next) return; // 決める人が選ぶのを待つ
      first = pick.first;
    } else first = rnd() < 0.5 ? 0 : 1;
    this.doc.start = { seed: Math.floor(rnd() * 2 ** 31), first, decks: [this.o.deck, them.deck], guest: this.themUid, round: next, mode: this.o.mode ?? 'official', chooser };
    this.write();
  }

  /** 決める人：［先攻］［後攻］を選んだ。自分が決める人で、まだ始まっていない時だけ true */
  chooseFirst(goFirst         )          {
    const next = this.round + 1;
    const pick = this.o.host ? this.doc.pick : this.them?.pick;
    if (!this.o.chooseFirst || !pick || pick.round !== next || pick.chooser !== this.seat || this.stopped) return false;
    if (this.state && this.state.winner === null) return false;
    this.doc.firstPick = { round: next, first: goFirst ? this.seat : (1 - this.seat)             };
    this.write();
    if (this.o.host && this.them && !this.state) this.hostTryStart(this.them);
    return true;
  }

  /** 自分が今の対戦のあとに「もう一度」を申し込み中か（画面の「申し込みました。相手を待っています…」用） */
  get rematchRequested()          { return !!this.state && this.state.winner !== null && this.doc.rematchAsk === this.round; }

  /** 決着のあと「もう一度（同じ相手と）」を申し込む／相手の申し込みを受ける。親でも子でも、勝ち負けに関係なく使える */
  requestRematch()          {
    if (!this.state || this.state.winner === null || this.stopped) return false;
    this.doc.rematchAsk = this.round;
    this.write();
    if (this.o.host && this.them?.rematchAsk === this.round) this.rematch();
    return true;
  }

  /** 自分の操作を盤面に入れて、相手に送る。自分の番でない時は false */
  send(a        )          {
    if (!this.state || this.stopped || this.state.winner !== null || this.giveUpSent) return false;
    // 降参はいつでも押せる（自分の分だけ）。それ以外は自分の番の時だけ
    const giveUp = a.type === 'surrender' && a.player === this.seat;
    if (a.type === 'surrender' && !giveUp) return false;
    if (!giveUp && actorOf(this.state) !== this.seat) return false;
    // 子の降参：送るだけ（すぐ書く）。親が入れて決着を書いたら、自分の盤面にも入れる（画面は giveUpPending の間「降参しています…」）
    if (giveUp && !this.o.host) {
      this.giveUpSent = true;
      this.doc.ops.push(a);
      this.flush();
      return true;
    }
    this.state.askZone = [0, 1]; // 画面が盤面を書きかえていても、2台で必ず同じにしてから入れる
    this.state = applyAction(this.state, a);
    this.doc.ops.push(a);
    this.schedule();
    if (this.state.winner !== null) this.finish();
    return true;
  }

  /** 子が降参を送って、親が入れるのを待っている間 true（画面の「🏳 降参しています…」用） */
  get giveUpPending()          { return this.giveUpSent && !!this.state && this.state.winner === null && !this.stopped; }

  /** 子：送ってある自分の降参を、自分の盤面に入れて決着させる */
          giveUpNow() {
    if (!this.state || this.state.winner !== null) return;
    this.state.askZone = [0, 1];
    this.state = applyAction(this.state, { type: 'surrender', player: this.seat });
    this.o.on({ type: 'remote', action: { type: 'surrender', player: this.seat }, state: this.state });
    this.finish();
  }

  /** 相手の欄が最後に書かれた時刻（Date.now() の形。まだ一度も無ければ 0）。画面の「つながりが切れました（あと○分）」用 */
  get lastSeenAt()         { return this.lastSeen; }

  /** 子：［準備OK］を押した */
  setReady() { this.doc.ready = true; this.write(); }

  /** 親：決着のあと「もう一度（同じ相手と）」。新しい種で、同じデッキ・同じ公式／練習で始め直す */
  rematch()          {
    if (!this.o.host || !this.state || this.state.winner === null || this.stopped) return false;
    this.state = null; this.applied = 0; this.doc.ops = []; this.giveUpSent = false; delete this.doc.end; delete this.doc.start;
    this.write();
    return true;
  }

  /** 今が自分の番か（画面が操作を受けつけてよいか） */
  myTurn()          { return !!this.state && this.state.winner === null && !this.giveUpSent && actorOf(this.state) === this.seat; }

          schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.write(); }, this.o.flushMs ?? 1000);
  }

          finish() {
    if (!this.state || this.doc.end) return;
    this.doc.end = { winner: this.state.winner                             };
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.write();
    this.o.on({ type: 'end', winner: this.doc.end.winner });
  }

  /** つながり直し：書きかけの操作をすぐ書く（相手の操作は onPeers で最初から読み直される） */
  flush() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } this.write(); }

  close() { this.stop(); this.unsub(); void this.o.room.leave(); }
}
