// 人どうしのオンライン対戦の通信の部品（docs/online-duel-plan.md）
// - 2台は「最初の約束（種・デッキ・先攻）」と「お互いの操作」だけを送り合う。盤面は送らない
//   （エンジンは、同じ種・同じデッキ・同じ操作の並びなら、必ず同じ盤面になる）
// - 部屋の部品（Room）は、サイトの room().join(name) と同じ形（presence・onPeers・leave）。
//   本番ではサイトの Firestore の部屋を、試す時は下の「手元の部屋」を渡す
// - 2台とも全部の情報を持つ作り（MASTERの決定）。相手の手札・伏せカードを画面で見せないのは画面の仕事
import { createGame, applyAction, actorOf, legalActions } from '../engine/game.js?v=20261121-1522-6e496fe4bc';
import { answerCandidates } from '../ai/cpu.js?v=20261121-1522-6e496fe4bc';
import { CARD_POOL } from '../data/cardpool.js?v=20261121-1522-6e496fe4bc';
import { DECKS } from '../data/decks.js?v=20261121-1522-6e496fe4bc';
                                                                      

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
    if (m.ask) { const mine = docs.get(uid); if (mine) ch.postMessage({ uid, p: mine.p, at: mine.updatedAt }); return; }
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
      subs.add(f); queueMicrotask(f);
      return () => subs.delete(f);
    },
    leave: async () => { docs.delete(uid); ch.postMessage({ uid, leave: true, at: Date.now() }); ch.close(); },
  };
}

/** お試し版・本番を作る時（scripts/build.mjs）に、できあがった .js ぜんぶの指紋をここに書きこむ（手元では 'dev'）。
 *  画面（app.js）にも同じ指紋が書かれるので、卓を開いた時に「app.js の指紋」とこれが同じか比べる（ちがえばページを読み直す） */
export const BUILD_FP = '20261121-1522-6e496fe4bc';

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
          lastSeen = 0; // 相手の欄が最後に変わったのを、この端末が受け取った時刻（相手の端末の時計は使わない）
          seenKey = ''; // 相手の欄の中身の目じるし（変わったら lastSeen を今にする）
          initialKey                = null; // 入った時に部屋にあった相手の欄の目じるし（''＝無かった）
          lastJ = ''; // 返事をした相手の合図
          live = false; // 相手の欄が、入った後に一度でも変わったか（＝今そこにいる相手か）
          lastBeat = 0; // 自分の心拍が最後に動いた時刻（スマホが裏に回って止まっていたかを見る）
          round = 0; // 何回目の対戦か（もう一度で1つ増える）
          them                 = null; // 相手の欄（最後に読んだもの）
          toldAsk = 0; // 申し込みの知らせを出した回
          o             ;

  constructor(o             ) {
    this.o = o;
    this.doc = { app: 'ygo-duel', v: o.version, fp: engineFingerprint(), b: BUILD_FP, name: o.name, deck: o.deck, ops: [], ready: o.host ? true : (o.ready ?? true) };
    this.seat = o.host ? 0 : 1;
    this.doc.j = Math.random().toString(36).slice(2, 10);
    // 自分の欄は、最初に部屋の中身を読んでから書く（つながり直しの時に、前の操作を消さないため）
    this.unsub = o.room.onPeers(ch => this.onPeers(ch.peers));
    // いることを知らせる＋相手がいなくなっていないか見る
    this.beat = setInterval(() => this.heartbeat(), o.heartbeatMs ?? 30000);
    (this.beat                                     ).unref?.(); // テストでプログラムが終われなくならないように（画面では何もしない）
  }

          heartbeat() {
    if (this.stopped || this.doc.end) return;
    const now = Date.now(), iv = this.o.heartbeatMs ?? 30000;
    // スマホが裏に回る・画面が暗くなるなどで、自分の時計（心拍）が止まっていた時は、戻ったばかりで相手の新しい知らせがまだ届いていない。
    // その時に「3分たった」と決めつけないよう、待ち時間を今から数え直す（接続が毎回切れる件の対策）
    if (this.lastBeat && now - this.lastBeat > iv * 2.5) this.lastSeen = now;
    this.lastBeat = now;
    this.doc.at = now;
    void this.o.room.presence(this.doc);
    if (this.state && this.lastSeen && now - this.lastSeen > (this.o.awayMs ?? 180000)) {
      this.doc.end = { winner: null, reason: 'away' };
      void this.o.room.presence(this.doc);
      this.o.on({ type: 'away' });
      this.stop();
    }
  }

          stop() { this.stopped = true; if (this.beat) { clearInterval(this.beat); this.beat = null; } if (this.timer) { clearTimeout(this.timer); this.timer = null; } }

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
      if (mine && mine.app === 'ygo-duel' && mine.v === this.o.version && !mine.end && (mine.start || mine.ops?.length) && fresh(mine)) this.doc = { ...mine, ops: [...(mine.ops ?? [])], j: this.doc.j };
      this.doc.at = Date.now();
      this.lastBeat = Date.now();
      void this.o.room.presence(this.doc);
    }
    const other = peers.find(p => !p.isMe && (p.presence                  )?.app === 'ygo-duel');
    if (!other) return;
    const them = other.presence           ;
    const key = keyOf(them);
    // 前の対戦の残り（もう書かれない欄）は相手として扱わない。時計は使わずに「自分が入った後に、相手の欄が一度でも変わったか」で見分ける
    // （相手の端末の時計がずれていても大丈夫）。初めて変わったのを見たら、自分の欄も書き直して、相手にもこちらがいることを知らせる
    // 相手の合図が新しくなったら、一度だけ返事を書く（相手が、こちらがいると分かるように）
    if (them.j && them.j !== this.lastJ) { this.lastJ = them.j; this.doc.ack = them.j; this.doc.at = Date.now(); void this.o.room.presence(this.doc); }
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
    if (them.v !== this.o.version || (them.fp && them.fp !== this.doc.fp) || (them.b && them.b !== this.doc.b)) { this.o.on({ type: 'version', mine: this.o.version, theirs: them.v }); return; }
    // もう一度：親が新しい約束（回数が1つ大きい）を書いたら、子は前の対戦を片づけて作り直す
    if (!this.o.host && them.start && them.start.round > this.round && this.state) {
      this.state = null; this.applied = 0; this.doc.ops = []; delete this.doc.end;
    }
    // 最初の約束：親が書く。子は親の約束を読んで同じ盤面を作る
    if (!this.state) {
      if (this.o.host && !this.doc.start && them.ready) {
        const rnd = this.o.random ?? Math.random;
        this.doc.start = { seed: Math.floor(rnd() * 2 ** 31), first: rnd() < 0.5 ? 0 : 1, decks: [this.o.deck, them.deck], guest: other.uid, round: this.round + 1, mode: this.o.mode ?? 'official' };
        void this.o.room.presence(this.doc);
      }
      const st = this.o.host ? this.doc.start : them.start;
      if (!st || (!this.o.host && st.guest !== this.o.uid)) return;
      let s = createGame({ pool: CARD_POOL, decks: [DECKS[st.decks[0]], DECKS[st.decks[1]]], seed: st.seed, firstPlayer: st.first });
      // つながり直しの時は、自分と相手の操作を、動く番の順に入れ直して続きから
      const mine = this.doc.ops, theirs = them.round === st.round ? (them.ops ?? []) : [];
      let mi = 0, ti = 0;
      for (let k = 0; k < mine.length + theirs.length && s.winner === null; k++) {
        const meNow = actorOf(s) === this.seat;
        // 降参は番に関係なく入る
        if (!meNow && mine[mi]?.type === 'surrender') { s = applyAction(s, mine[mi++]); continue; }
        if (meNow && theirs[ti]?.type === 'surrender') { s = applyAction(s, theirs[ti++]); continue; }
        if (meNow) { if (mi >= mine.length) break; s = applyAction(s, mine[mi++]); }
        else { if (ti >= theirs.length) break; s = applyAction(s, theirs[ti++]); }
      }
      this.state = s; this.applied = ti; this.round = st.round;
      if (this.doc.round !== st.round) { this.doc.round = st.round; void this.o.room.presence(this.doc); }
      this.o.on({ type: 'start', state: this.state, seat: this.seat, round: st.round, mode: st.mode });
    }
    // 相手の操作を、まだ入れていない分だけ順に入れる
    const ops = them.round === this.round ? (them.ops ?? []) : [];
    while (this.applied < ops.length && this.state && this.state.winner === null) {
      const a = ops[this.applied];
      // 降参だけは、番に関係なくいつでも届く（MIMIの指摘）
      if (actorOf(this.state) === this.seat && !(a.type === 'surrender' && a.player !== this.seat)) { this.o.on({ type: 'desync', detail: `自分の番なのに相手の操作が届いた（${this.applied}番目）` }); return; }
      try { this.state = applyAction(this.state, a); } catch (e) { this.o.on({ type: 'desync', detail: `相手の操作を入れられない：${(e         ).message}` }); return; }
      this.applied++;
      this.o.on({ type: 'remote', action: a, state: this.state });
    }
    if (this.state && this.state.winner !== null) this.finish();
    // もう一度：相手が今の回を申し込んできたら知らせる。2人とも申し込んだら、親が始め直す
    if (this.state && this.state.winner !== null && them.rematchAsk === this.round) {
      if (this.doc.rematchAsk === this.round) { if (this.o.host) this.rematch(); }
      else if (this.toldAsk !== this.round) { this.toldAsk = this.round; this.o.on({ type: 'rematchAsked' }); }
    }
  }

  /** 自分が今の対戦のあとに「もう一度」を申し込み中か（画面の「申し込みました。相手を待っています…」用） */
  get rematchRequested()          { return !!this.state && this.state.winner !== null && this.doc.rematchAsk === this.round; }

  /** 決着のあと「もう一度（同じ相手と）」を申し込む／相手の申し込みを受ける。親でも子でも、勝ち負けに関係なく使える */
  requestRematch()          {
    if (!this.state || this.state.winner === null || this.stopped) return false;
    this.doc.rematchAsk = this.round;
    void this.o.room.presence(this.doc);
    if (this.o.host && this.them?.rematchAsk === this.round) this.rematch();
    return true;
  }

  /** 自分の操作を盤面に入れて、相手に送る。自分の番でない時は false */
  send(a        )          {
    if (!this.state || this.stopped || this.state.winner !== null) return false;
    // 降参はいつでも押せる（自分の分だけ）。それ以外は自分の番の時だけ
    const giveUp = a.type === 'surrender' && a.player === this.seat;
    if (!giveUp && actorOf(this.state) !== this.seat) return false;
    this.state = applyAction(this.state, a);
    this.doc.ops.push(a);
    this.schedule();
    if (this.state.winner !== null) this.finish();
    return true;
  }

  /** 相手の欄が最後に書かれた時刻（Date.now() の形。まだ一度も無ければ 0）。画面の「つながりが切れました（あと○分）」用 */
  get lastSeenAt()         { return this.lastSeen; }

  /** 子：［準備OK］を押した */
  setReady() { this.doc.ready = true; void this.o.room.presence(this.doc); }

  /** 親：決着のあと「もう一度（同じ相手と）」。新しい種で、同じデッキ・同じ公式／練習で始め直す */
  rematch()          {
    if (!this.o.host || !this.state || this.state.winner === null || this.stopped) return false;
    this.state = null; this.applied = 0; this.doc.ops = []; delete this.doc.end; delete this.doc.start;
    void this.o.room.presence(this.doc);
    return true;
  }

  /** 今が自分の番か（画面が操作を受けつけてよいか） */
  myTurn()          { return !!this.state && this.state.winner === null && actorOf(this.state) === this.seat; }

          schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; void this.o.room.presence(this.doc); }, this.o.flushMs ?? 1000);
  }

          finish() {
    if (!this.state || this.doc.end) return;
    this.doc.end = { winner: this.state.winner                             };
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    void this.o.room.presence(this.doc);
    this.o.on({ type: 'end', winner: this.doc.end.winner });
  }

  /** つながり直し：書きかけの操作をすぐ書く（相手の操作は onPeers で最初から読み直される） */
  flush() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } void this.o.room.presence(this.doc); }

  close() { this.stop(); this.unsub(); void this.o.room.leave(); }
}
