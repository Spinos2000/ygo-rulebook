// 効果音（音声ファイルは使わず、Web Audio でその場で作る）
// カードの種類ごとに音色を変える：召喚・儀式召喚・融合召喚・特殊召喚、魔法・罠・カウンター罠・モンスター効果の発動、攻撃、ダメージ、破壊、無効、勝敗
let ctx = null;
let master = null;
let enabled = true;
try { enabled = localStorage.getItem('gx-duel-sound') !== 'off'; } catch { /* 保存できない環境 */ }

export function soundEnabled() { return enabled; }
export function setSoundEnabled(v) {
  enabled = v;
  try { localStorage.setItem('gx-duel-sound', v ? 'on' : 'off'); } catch { /* 保存できない環境 */ }
  if (v) unlock();
}
/** ブラウザは操作の後でないと音を出せないので、クリック時に呼ぶ */
export function unlock() {
  if (!enabled) return;
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch { ctx = null; }
}

/* ---------- 音の部品 ---------- */
function tone(freq, start, dur, { type = 'sine', gain = 0.5, to = null, attack = 0.005 } = {}) {
  const t = ctx.currentTime + start;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}
let noiseBuf = null;
function noise(start, dur, { gain = 0.5, filter = 'lowpass', freq = 1200, to = null, q = 1 } = {}) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime + start;
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuf;
  f.type = filter; f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur + 0.02);
}

/* ---------- 効果音 ---------- */
const SOUNDS = {
  // 通常召喚・アドバンス召喚：低い音から上がる2音
  summon: s => { tone(262, s, 0.12, { type: 'triangle', gain: 0.45 }); tone(392, s + 0.09, 0.22, { type: 'triangle', gain: 0.45 }); noise(s, 0.08, { gain: 0.25, freq: 400 }); },
  // 特殊召喚：上昇する音
  special: s => { tone(260, s, 0.32, { type: 'sine', gain: 0.4, to: 780 }); tone(520, s + 0.05, 0.3, { type: 'triangle', gain: 0.18, to: 1300 }); },
  // 儀式召喚：神秘的な分散和音
  ritual: s => { [392, 494, 587, 784, 988].forEach((f, i) => tone(f, s + i * 0.07, 0.6, { type: 'triangle', gain: 0.28 })); noise(s, 0.5, { gain: 0.12, filter: 'highpass', freq: 5000 }); },
  // 融合召喚：渦を巻くように上がる音
  fusion: s => { tone(180, s, 0.5, { type: 'sawtooth', gain: 0.16, to: 900 }); tone(240, s + 0.05, 0.5, { type: 'sawtooth', gain: 0.12, to: 1200 }); tone(1046, s + 0.42, 0.35, { type: 'sine', gain: 0.3 }); },
  // セット：小さな「パタッ」
  set: s => { noise(s, 0.06, { gain: 0.35, freq: 900 }); tone(180, s, 0.06, { type: 'sine', gain: 0.2 }); },
  // 魔法カードの発動：明るい鐘の音
  spell: s => { tone(880, s, 0.45, { type: 'sine', gain: 0.4 }); tone(1320, s + 0.04, 0.4, { type: 'sine', gain: 0.22 }); tone(1760, s + 0.08, 0.3, { type: 'sine', gain: 0.12 }); },
  // 罠カードの発動：不穏な低い音
  trap: s => { tone(110, s, 0.4, { type: 'square', gain: 0.2 }); tone(116, s, 0.4, { type: 'square', gain: 0.16 }); noise(s, 0.2, { gain: 0.3, freq: 300 }); tone(220, s + 0.18, 0.3, { type: 'sawtooth', gain: 0.12, to: 160 }); },
  // カウンター罠：鋭い2連打
  counter: s => { tone(660, s, 0.1, { type: 'square', gain: 0.25 }); tone(990, s + 0.1, 0.18, { type: 'square', gain: 0.25 }); noise(s + 0.1, 0.12, { gain: 0.2, filter: 'highpass', freq: 3000 }); },
  // モンスター効果の発動：風を切る音
  effect: s => { noise(s, 0.32, { gain: 0.35, filter: 'bandpass', freq: 600, to: 3000, q: 2 }); tone(520, s + 0.1, 0.2, { type: 'triangle', gain: 0.18 }); },
  // 攻撃宣言：斬る音
  attack: s => { noise(s, 0.22, { gain: 0.5, filter: 'bandpass', freq: 4000, to: 500, q: 1.5 }); },
  // ダメージ：重い衝撃
  damage: s => { tone(140, s, 0.3, { type: 'sine', gain: 0.6, to: 50 }); noise(s, 0.15, { gain: 0.3, freq: 800 }); },
  // 破壊：崩れる音
  destroy: s => { noise(s, 0.45, { gain: 0.45, freq: 2500, to: 200 }); tone(90, s, 0.3, { type: 'triangle', gain: 0.3, to: 45 }); },
  // 無効：下がるブザー
  negate: s => { tone(440, s, 0.35, { type: 'sawtooth', gain: 0.18, to: 140 }); tone(445, s, 0.35, { type: 'square', gain: 0.1, to: 145 }); },
  // ドロー：小さな音
  draw: s => { noise(s, 0.05, { gain: 0.2, filter: 'highpass', freq: 2500 }); },
  // 勝利・敗北
  win: s => { [523, 659, 784, 1046].forEach((f, i) => tone(f, s + i * 0.12, i === 3 ? 0.6 : 0.16, { type: 'triangle', gain: 0.4 })); },
  lose: s => { [392, 330, 262, 196].forEach((f, i) => tone(f, s + i * 0.18, 0.3, { type: 'triangle', gain: 0.35 })); },
};

/** 効果音を順番に鳴らす（同時に起きた出来事は少しずつずらす） */
export function play(names) {
  if (!enabled || !names.length) return;
  unlock();
  if (!ctx) return;
  let at = 0;
  for (const n of names.slice(0, 4)) {
    const f = SOUNDS[n];
    if (!f) continue;
    try { f(at); } catch { /* 音が出せなくても対戦は続ける */ }
    at += 0.16;
  }
}
