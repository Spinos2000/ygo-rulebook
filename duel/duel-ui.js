// 対戦画面の見た目（CSS）と骨組み（HTML）。Shadow DOM の中に入れるので、置き場所のページのスタイルとぶつからない。
// 色は置き場所のページが --d-* で渡す（単独のページ index.html、ルールページのどちらでも）。渡されない色は下の既定値になる。
/** 裏面の絵：面全体の渦（22本の腕が中心へ絞られていく）と、金の縁取りの黒い楕円 */
function backSvg() {
  const cx = 29.5, cy = 43, N = 22, cols = ['#b5743a', '#6e3f1c', '#d0914c', '#55300f', '#a2652f', '#84502a', '#c4823f', '#4a2a10'];
  const pt = (r, a) => [cx + r * Math.cos(a) * 0.8, cy + r * Math.sin(a)];
  let arms = '', thin = '';
  for (let k = 0; k < N; k++) {
    const ph = k * 2 * Math.PI / N, L = [], R = [], P = [];
    for (let t = 0; t <= 6.4 * Math.PI; t += 0.16) {
      const r = 0.35 * Math.exp(0.24 * t); if (r > 95) break;
      const a = t + ph, w = r * 0.36, [x, y] = pt(r, a), nx = Math.cos(a), ny = Math.sin(a);
      L.push((x - nx * w / 2).toFixed(1) + ' ' + (y - ny * w / 2).toFixed(1));
      R.unshift((x + nx * w / 2).toFixed(1) + ' ' + (y + ny * w / 2).toFixed(1));
      const [x2, y2] = pt(r, a + 0.07); P.push(x2.toFixed(1) + ' ' + y2.toFixed(1));
    }
    arms += '<path d="M' + L.join(' L') + ' L' + R.join(' L') + 'Z" fill="' + cols[k % cols.length] + '" opacity="' + (0.7 + 0.3 * ((k * 37) % 10) / 10).toFixed(2) + '"/>';
    if (k % 2 === 0) thin += '<path d="M' + P.join(' L') + '" fill="none" stroke="#eab067" stroke-width=".3" opacity=".6"/>';
  }
  const s = 1.6, e = (rx, ry) => 'cx="29.5" cy="43" rx="' + (rx * s).toFixed(2) + '" ry="' + (ry * s).toFixed(2) + '"';
  const mid = '<ellipse ' + e(13.5, 18) + ' fill="#2a170a" opacity=".45"/><ellipse ' + e(11.6, 15.6) + ' fill="#0f0905" stroke="#d9a35a" stroke-width=".9"/><ellipse ' + e(10.1, 13.9) + ' fill="none" stroke="#5a3418" stroke-width=".45"/>';
  // 茶色い枠：渦のまわりを囲む縁（外側のこげ茶の線・明るい面取り・内側の影）
  const frame = '<path fill-rule="evenodd" d="M0 0H59V86H0Z M3.4 3.4V82.6H55.6V3.4Z" fill="#8a5a2b"/>'
    + '<rect x="1.2" y="1.2" width="56.6" height="83.6" rx="1.6" fill="none" stroke="#c08a4e" stroke-width=".5" opacity=".8"/>'
    + '<rect x="3.4" y="3.4" width="52.2" height="79.2" fill="none" stroke="#2a170a" stroke-width=".8"/>';
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 59 86" preserveAspectRatio="none"><rect width="59" height="86" fill="#5e3517"/>' + arms + thin + mid + frame + '</svg>';
  return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
}
export const CSS = `
.droot { --back-img: ${backSvg()} }
/* レイアウト：デュエルマットを中心に、相手（上）→マット→自分（下）→操作ドック（画面下に固定）。
   PCでは右にカード詳細・ログの列。スマホではカード詳細とログは下から出るシートになる */
:host { display: block }
/* 色の名前は .droot の中だけで使う（:host に置くと、置き場所のページの同じ名前の色と循環してしまう） */
.droot {
  --bg: var(--d-bg, #f5f2eb);
  --panel: var(--d-panel, #fffdf8);
  --panel-2: var(--d-panel-2, #f3eee4);
  --ink: var(--d-ink, #262b3a);
  --sub: var(--d-sub, #6a6e7e);
  --line: var(--d-line, #e2dbcd);
  --edge: var(--d-edge, #2c3244);      /* 外側の箱の濃い線と、ずらした影 */
  --me: var(--d-me, #3e6fd0);          /* 自分：オベリスクの青（主のボタンも） */
  --mat: var(--d-mat, #1d4737);
  --mat-2: var(--d-mat-2, #163a2c);
  --mat-line: var(--d-mat-line, #5c8c78);
  --mat-ink: var(--d-mat-ink, #d6ece1);
  --accent: var(--d-accent, #f1c95b);  /* 強調：ラーの黄色 */
  --accent-ink: var(--d-accent-ink, #262b3a);
  --accent-soft: color-mix(in srgb, var(--accent) 16%, var(--panel));
  --opp: var(--d-opp, #d75a5f);        /* 相手：オシリスの赤 */
  --bad: var(--d-bad, #b23a3a);
  --f-normal: var(--d-f-normal, #f1d98a); --f-effect: var(--d-f-effect, #e9a36f); --f-ritual: var(--d-f-ritual, #9cb8ec);
  --f-fusion: var(--d-f-fusion, #b9a3e0); --f-spell: var(--d-f-spell, #5dbfa1); --f-trap: var(--d-f-trap, #d98bb2);
  --num: var(--d-num, "Fredoka", var(--display));
  --card-ink: #1b1508;
  --back: #6b4a2a; --back2: #553a20;
  --shadow: var(--d-shadow, 0 10px 30px rgba(10, 30, 20, .18));
  --display: var(--d-display, "Zen Maru Gothic", "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Sans", sans-serif);
  --body: var(--d-body, "M PLUS Rounded 1c", "Zen Kaku Gothic New", "Hiragino Sans", "Yu Gothic", sans-serif);
  --dock-h: 76px;
}
* { box-sizing: border-box }
[hidden] { display: none !important }
.droot { background: var(--bg); color: var(--ink); font-family: var(--body); font-size: 14px; line-height: 1.55; min-height: 100%;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 0 24px; }
.droot::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--bg) }
button, input, select { font: inherit; color: inherit }
button { cursor: pointer; -webkit-tap-highlight-color: transparent }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }

/* ---------- ボタンの形 ---------- */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 40px; padding: 0 14px; border-radius: 10px;
  border: 1px solid var(--line); background: var(--panel); font-weight: 700; white-space: nowrap; transition: transform .08s, background .15s, border-color .15s }
.btn:hover:not(:disabled) { border-color: var(--accent) }
.btn:active:not(:disabled) { transform: scale(.97) }
.btn:disabled { opacity: .45; cursor: default }
.btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); min-height: 48px; padding: 0 22px; font-size: 15px; box-shadow: 0 2px 0 color-mix(in srgb, var(--accent) 60%, #000) }
.btn.ghost { background: transparent }
.btn.small { min-height: 34px; padding: 0 10px; font-size: 13px }
.btn.danger { color: var(--bad); border-color: color-mix(in srgb, var(--bad) 40%, var(--line)) }
.btn.danger.armed { background: var(--bad); border-color: var(--bad); color: #fff }

/* ---------- 上の帯：ターンとフェイズ ---------- */
.top { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 8; background: var(--bg); display: flex; align-items: center; gap: 8px 14px; flex-wrap: wrap; padding-block: 10px 8px; border-bottom: 1px solid var(--line); margin-bottom: 12px }
.top h1 { font-family: var(--display); font-weight: 400; font-size: 18px; margin: 0; letter-spacing: .02em; white-space: nowrap }
.turn { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-width: 0 }
#turnInfo { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap }
#phases { display: flex; gap: 3px; list-style: none; margin: 0; padding: 0 }
#phases li button, #phases li span { display: block; min-width: 34px; text-align: center; font-size: 12px; letter-spacing: .06em; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--line); background: var(--panel); color: var(--sub); font-weight: 700; font-variant-numeric: tabular-nums }
#phases li.past span { opacity: .45 }
#phases li.cur span { background: var(--accent); border-color: var(--accent); color: var(--accent-ink) }
#phases li button { color: var(--ink); border-color: var(--accent); border-style: dashed }
#phases li button:hover { background: var(--accent-soft) }
.topbtns { margin-left: auto; display: flex; gap: 6px }

/* ---------- 全体の配置 ---------- */
.app { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 18px; align-items: start; max-width: 1240px; margin: 0 auto }
.table { min-width: 0; display: flex; flex-direction: column; gap: 8px }
.sidecol { display: grid; gap: 12px; position: sticky; top: calc(env(safe-area-inset-top, 0px) + 64px) }
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; min-width: 0 }

/* ---------- プレイヤーの帯 ---------- */
.pstrip { display: flex; align-items: center; gap: 10px 14px; padding: 6px 12px; border-radius: 12px; background: var(--panel); border: 1px solid var(--line) }
.pstrip .who { font-weight: 700; display: flex; align-items: center; gap: 6px; white-space: nowrap }
.pstrip .who::before { content: ""; width: 10px; height: 10px; border-radius: 50%; background: var(--accent) }
.pstrip.opp .who::before { background: var(--opp) }
.pstrip .lp { font-family: var(--display); font-size: 26px; line-height: 1; font-variant-numeric: tabular-nums; min-width: 4.4ch; transition: color .3s }
.pstrip .lp::before { content: "LP"; font-family: var(--body); font-size: 11px; font-weight: 700; color: var(--sub); letter-spacing: .1em; margin-right: 4px; vertical-align: 4px }
.pstrip .lp.hit { color: var(--bad); animation: hit .5s }
@keyframes hit { 0%, 100% { transform: none } 25% { transform: translateX(-3px) } 75% { transform: translateX(3px) } }
.pstrip .meta { font-size: 12px; color: var(--sub); font-variant-numeric: tabular-nums; margin-left: auto; text-align: right }
.pstrip .tag { white-space: nowrap; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: var(--accent-soft); color: var(--ink); border: 1px solid var(--accent) }
.pstrip.acting { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent) }

/* ---------- 手札 ---------- */
/* 手札はトランプアプリのように扇形に重ねる。位置（--tx・--ty・--rot）は app.js の fanOut() が決める */
.hand { position: relative; isolation: isolate; overflow-x: clip; --cw: 84px; --ch: calc(var(--cw) * 86 / 59); height: calc(var(--ch) * .84 + 28px); margin-bottom: calc(var(--ch) * -.16) }
.hand .card { position: absolute; left: 50%; bottom: 0; width: var(--cw); margin-left: calc(var(--cw) / -2); font-size: 10px; z-index: var(--z, 1);
  transform-origin: 50% 160%; transform: translate(var(--tx, 0px), var(--ty, 0px)) rotate(var(--rot, 0deg)); transition: transform .18s ease-out, box-shadow .12s }
.hand.me .card:not(.sel):not(.picked):hover { transform: translate(var(--tx, 0px), calc(var(--ty, 0px) - 10px)) rotate(var(--rot, 0deg)) }
/* 押したカードはまっすぐ立って持ち上がる */
.hand.me .card.sel, .hand.me .card.picked { transform: translate(var(--tx, 0px), -24px) rotate(0deg) scale(1.1); z-index: 40 }
.hand .empty { position: absolute; left: 0; right: 0; top: 35%; text-align: center }
/* 相手の手札：画面の上に、裏面を逆向きの扇形で小さく */
.hand.opp { --cw: 40px; height: calc(var(--ch) * .62); margin-bottom: 0 }
.hand.opp .card { bottom: auto; top: calc(var(--ch) * -.38); font-size: 0; transform-origin: 50% -60%; transform: translate(var(--tx, 0px), calc(var(--ty, 0px) * -1)) rotate(calc(var(--rot, 0deg) * -1)) }
.pstrip.me, .pstrip.opp { position: relative; z-index: 5 }
.empty { font-size: 12px; color: var(--sub); align-self: center; padding: 4px }

/* ---------- デュエルマット ---------- */
/* 盤面の高さが画面に収まるよう、横幅を画面の高さから決める（5段×7列） */
#board { width: 100%; max-width: max(320px, calc((100vh - 400px) * 1.4)); margin-inline: auto; background: radial-gradient(120% 90% at 50% 50%, var(--mat), var(--mat-2)); border-radius: 16px; padding: 8px; display: grid; gap: 5px; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--mat-line) 40%, transparent) }
#board .row { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 5px }
#board .r2 { margin-block: 3px }
.zone { position: relative; aspect-ratio: 1; border: 1px dashed var(--mat-line); border-radius: 7px; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--mat-2) 70%, #000 30%); min-width: 0 }
.zone.void { border: none; background: none }
.zone.emz { border-style: solid }
.zone .zl, .pile .pl { font-size: 9px; color: var(--mat-ink); opacity: .55; text-align: center; line-height: 1.2 }
.pile { border-style: solid; padding: 0; cursor: pointer }
/* 長押し：スマホの長押しメニューや文字選択を出さず、押している間はリングが満ちていく */
.pile { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; touch-action: manipulation }
.pile.pressing::after { content: ""; position: absolute; inset: -3px; border-radius: 9px; border: 3px solid var(--accent); clip-path: inset(0 100% 0 0); animation: pressFill .45s linear forwards; pointer-events: none }
@keyframes pressFill { to { clip-path: inset(0 0 0 0) } }
.pile .pl { position: absolute; bottom: 2px; left: 0; right: 0 }
.pile .cnt { position: absolute; top: -6px; right: -4px; background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: 999px; font-size: 10px; padding: 0 5px; font-variant-numeric: tabular-nums }
.r0 .zone:not(.void), .r1 .zone:not(.void) { border-color: color-mix(in srgb, var(--mat-line) 60%, var(--opp) 40%) }

/* ---------- カード ---------- */
.card { position: relative; width: 72%; aspect-ratio: 59 / 86; border-radius: 5px; border: 1.5px solid #24150b; /* 枠は裏面と同じこげ茶 */ padding: .3em; display: flex; flex-direction: column; gap: 2px; text-align: left;
  color: #262b3a; font-family: var(--body); font-size: clamp(7px, 1.05vw, 10px); line-height: 1.15; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,.35); transition: transform .12s, box-shadow .12s }
/* 初期のカードの配置：上にカード名と属性、その下にレベルの星（魔法・罠は種類）、中央に正方形のイラスト枠、下に種族の行と攻撃力・守備力。
   位置はカードの大きさに対する割合、文字はカードの文字の大きさ（em）で決める */
.card:not(.back) { display: block; padding: 0; color: #1b1b1b }
.card:not(.back)::before { content: ""; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(135deg, rgba(255,255,255,.16), rgba(0,0,0,.14)), repeating-linear-gradient(45deg, rgba(0,0,0,.035) 0 2px, transparent 2px 5px) }
.card .top { position: absolute; left: 5.5%; right: 5.5%; top: 3.6%; height: 8.6%; display: flex; align-items: center; gap: 2px; border: 1px solid rgba(0,0,0,.35); border-radius: 2px; padding: 0 .2em; background: linear-gradient(180deg, rgba(255,255,255,.18), rgba(0,0,0,.08)) }
.card .top .n { flex: 1; min-width: 0; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: -.02em; font-size: .9em }
.card .at { flex: none; width: 1.45em; height: 1.45em; border-radius: 50%; font-size: .8em; line-height: 1.45em; text-align: center; color: #fff; font-style: normal; font-weight: 700; border: 1px solid rgba(0,0,0,.4); box-shadow: inset 0 1px 1px rgba(255,255,255,.4) }
.card .lv { position: absolute; right: 6%; top: 13.4%; height: 5.6%; display: flex; gap: 1px; align-items: center }
.card .lv i { width: .78em; height: .78em; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #ffb35a, #d0451c); border: 1px solid #6a2208 }
.card .sp { position: absolute; right: 6%; top: 12.8%; font-size: .72em; font-weight: 700; letter-spacing: .03em; white-space: nowrap }
.card .art { position: absolute; left: 11%; right: 11%; top: 20.5%; aspect-ratio: 1; border: 1.5px solid rgba(0,0,0,.5); box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.35); background: linear-gradient(160deg, #3a3f52, #1c2030);
  display: flex; align-items: center; justify-content: center; font-family: var(--display); font-size: 3.6em; line-height: 1; color: rgba(255,255,255,.22); overflow: hidden }
.card .tb { position: absolute; left: 5.5%; right: 5.5%; top: 77.6%; bottom: 3.6%; border: 1px solid rgba(0,0,0,.35); border-radius: 2px; padding: .1em .3em; font-size: .7em; line-height: 1.25; color: #262626; overflow: hidden }
.card .tb b { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.card .tb .ad { position: absolute; left: .3em; right: .3em; bottom: .05em; border-top: 1px solid rgba(0,0,0,.6); display: flex; justify-content: flex-end; gap: .5em; font-family: var(--num); font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap }
.card .tb .ad i { font-style: normal; font-weight: 600 }
.card .tb .ad .up { color: #0f6e56 } .card .tb .ad .dn { color: #a32d2d }
.card .tb .kd { display: none }
/* 種類ごとの元の色（枠）と、下の欄の色 */
.f-normal { background: linear-gradient(160deg, #e3be72, #c99d4c) } .f-normal .tb { background: #f3e6c4 }
.f-effect { background: linear-gradient(160deg, #d98a4e, #b4652e) } .f-effect .tb { background: #f1dfc8 }
.f-ritual { background: linear-gradient(160deg, #86b4e6, #4f86c6) } .f-ritual .tb { background: #e4ecf6 }
.f-fusion { background: linear-gradient(160deg, #a988d4, #7a5aac) } .f-fusion .tb { background: #ebe4f3 }
.f-spell { background: linear-gradient(160deg, #2fae93, #127a64) } .f-spell .tb { background: #e2f0ea } .f-spell .sp, .f-spell .tb { color: #04342c }
.f-trap { background: linear-gradient(160deg, #c46594, #963f6c) } .f-trap .tb { background: #f3e2ea } .f-trap .sp, .f-trap .tb { color: #4b1528 }
/* フィールドでは小さいので：名前・イラスト・攻守（魔法・罠は種類）だけにして、イラストを大きく */
.zone .card .lv, .zone .card .sp, .zone .card .tb b, .zone .card .tb .ad i { display: none }
.zone .card .top { height: 19%; top: 3%; left: 4%; right: 4%; align-items: flex-start; padding-top: .12em }
.zone .card .top .n { font-size: .74em; line-height: 1.08; white-space: normal; text-overflow: clip; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-all }
.zone .card .at { width: 1.3em; height: 1.3em; line-height: 1.3em; font-size: .7em }
.zone .card .art { top: 24%; left: 12%; right: 12%; font-size: 2.8em }
.zone .card .tb { top: 80%; bottom: 3%; left: 4%; right: 4% }
.zone .card .tb .ad { justify-content: space-between; border-top: none; bottom: 50%; transform: translateY(50%); font-size: 1.15em }
.zone .card .tb .kd { display: block; text-align: center; font-weight: 700; font-size: 1.05em; white-space: nowrap; overflow: hidden }
/* ---------- レア度：字レアは銀、ウルトラは金の名前と鈍く光るホロ、シークレットは虹がかった銀の名前と斜めの細かいホロ ---------- */
.card.r-rare .top, .card.r-ur .top, .card.r-sec .top { background: linear-gradient(180deg, rgba(40,28,12,.74), rgba(18,12,5,.8)) } /* 金・銀の文字が読めるように、名前の枠は暗く */
.card.r-rare .top .n, .card.r-ur .top .n, .card.r-sec .top .n { -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 0 .4px rgba(0,0,0,.9)) drop-shadow(0 1px 0 rgba(0,0,0,.7)); background-size: 260% 100%; animation: foil 5s ease-in-out infinite alternate }
.card.r-rare .top .n { background-image: linear-gradient(100deg, #5a5f68 0%, #a9b0bb 20%, #eef2f7 34%, #ffffff 40%, #b9c0ca 52%, #6c727c 66%, #d4d9e0 82%, #61666f 100%) }
.card.r-ur .top .n { background-image: linear-gradient(100deg, #6b4c12 0%, #b98d33 18%, #f2d98a 32%, #fff6d0 40%, #d7ad52 50%, #8c6520 64%, #e2c06a 80%, #7a5717 100%) }
.card.r-sec .top .n { background-image: linear-gradient(100deg, #7d8696 0%, #c6cbd6 14%, #ffd6f0 24%, #d6f0ff 32%, #ffffff 40%, #f8f0c8 48%, #b9c0ca 58%, #d0e8ff 70%, #ffd8ec 82%, #7d8696 100%); background-size: 300% 100% }
.card.r-ur .art::before, .card.r-sec .art::before { content: ""; position: absolute; inset: -40%; mix-blend-mode: overlay; pointer-events: none; animation: holo 6s ease-in-out infinite alternate }
.card.r-ur .art::before { background: repeating-linear-gradient(115deg, hsla(0,70%,70%,0) 0 6px, hsla(40,80%,70%,.35) 9px, hsla(120,60%,65%,.3) 14px, hsla(200,70%,70%,.35) 19px, hsla(280,60%,70%,.3) 24px, hsla(0,70%,70%,0) 30px); opacity: .9 }
.card.r-sec .art::before { background: repeating-linear-gradient(45deg, rgba(255,255,255,0) 0 2px, rgba(255,255,255,.45) 2.5px, rgba(255,255,255,0) 3.5px 5px), linear-gradient(115deg, hsla(330,80%,75%,.45), hsla(200,80%,75%,.45), hsla(60,80%,75%,.45), hsla(280,70%,75%,.45)); background-size: auto, 300% 100%; opacity: .95 }
.card.r-ur .art::after, .card.r-sec .art::after { content: ""; position: absolute; inset: 0; pointer-events: none; mix-blend-mode: soft-light; background: radial-gradient(circle at 30% 25%, rgba(255,255,240,.5), rgba(255,255,240,0) 45%), repeating-linear-gradient(0deg, rgba(255,255,255,.07) 0 1px, transparent 1px 3px); background-size: 200% 200%, auto; animation: holoLight 7s ease-in-out infinite alternate }
.card.r-ur::after, .card.r-sec::after { content: ""; position: absolute; inset: 0; pointer-events: none; mix-blend-mode: soft-light; background: linear-gradient(115deg, transparent 30%, rgba(255,250,225,.22) 45%, rgba(255,250,225,.05) 55%, transparent 70%); background-size: 250% 100%; animation: foil 5s ease-in-out infinite alternate }
@keyframes foil { from { background-position: 0% 0 } to { background-position: 100% 0 } }
@keyframes holo { from { transform: translateX(-12%) } to { transform: translateX(12%) } }
@keyframes holoLight { from { background-position: 0% 0%, 0 0 } to { background-position: 100% 100%, 0 0 } }
@media (prefers-reduced-motion: reduce) { .card.r-rare .top .n, .card.r-ur .top .n, .card.r-sec .top .n, .card.r-ur .art::before, .card.r-sec .art::before, .card.r-ur .art::after, .card.r-sec .art::after, .card.r-ur::after, .card.r-sec::after { animation: none } }
.card.def { transform: rotate(90deg) }
.card.sel { outline: 3px solid var(--accent); outline-offset: 2px }
.card.can { box-shadow: 0 0 0 2px var(--accent), 0 0 12px color-mix(in srgb, var(--accent) 70%, transparent) }
.card.picked { outline: 3px solid var(--accent); outline-offset: 1px }
/* 裏面：面全体の渦と、中央の黒い楕円 */
.card.back { background: var(--back-img) center / 100% 100% no-repeat, #5e3517; color: #f0dcc4; border-color: #24150b }
.card.back .bn { margin-top: auto; background: rgba(15,9,5,.75); border-radius: 3px; padding: 1px 2px; font-size: .85em; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; word-break: break-all }
.card.mini { width: 60%; pointer-events: none }
.badge { position: absolute; top: 1px; right: 1px; background: var(--accent); color: var(--accent-ink); border-radius: 4px; font-size: 9px; padding: 0 3px; font-weight: 700; z-index: 1 }
.badge.eq { top: auto; bottom: 1px; background: #2f5f8f; color: #fff }

/* ---------- チェーン ---------- */
#chain { border-color: var(--accent); background: var(--accent-soft) }
#chain h3 { margin: 0 0 6px; font-size: 13px; letter-spacing: .06em }
#chain ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px }
#chain li { font-size: 13px; border-left: 3px solid var(--accent); padding-left: 8px }
#chain li.opp { border-left-color: var(--opp) }
#chain li b { font-variant-numeric: tabular-nums; margin-right: 4px }
#chain .tg { display: block; color: var(--sub); font-size: 12px }

/* ---------- 操作ドック（画面下に固定） ---------- */
.dock { position: sticky; bottom: 0; z-index: 7; margin-top: 4px; padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px)); background: var(--panel); border: 1px solid var(--line); border-radius: 16px 16px 0 0; box-shadow: var(--shadow);
  display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px 12px }
.dock.mine { border-color: var(--accent) }
.dock-status { min-width: 0 }
#actor { font-weight: 700; display: block }
#actorHint { display: block; font-size: 12px; color: var(--sub) }
/* 下の段：左に発動などのボタン、右下に場面を先に進める「進む」ボタン（いつも同じ場所） */
.dock-acts { grid-column: 1 / -1; display: flex; gap: 8px; align-items: stretch }
#phaseBtns { flex: 1; min-width: 0; display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end }
#goBtn { flex: none; width: clamp(150px, 34%, 240px); min-height: 52px; font-size: 16px; white-space: normal; line-height: 1.25; flex-direction: column; gap: 0 }
#goBtn small { display: block; font-size: 11px; font-weight: 500; opacity: .8 }
#stopBtn[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--accent-ink) }
#phaseBtns .btn { white-space: normal; text-align: center; line-height: 1.3 }
#soundBtn[aria-pressed="false"] { color: var(--sub); text-decoration: line-through }
.dock .thinking::after { content: "…"; display: inline-block; animation: dots 1.2s steps(4) infinite; width: 1.2em; overflow: hidden; vertical-align: bottom }
@keyframes dots { from { width: 0 } to { width: 1.2em } }
.dock-extra { display: flex; gap: 6px; justify-content: flex-end }
#logBtn { display: none }
#result { padding: 10px 14px; border-radius: 12px; background: var(--accent); color: var(--accent-ink); font-weight: 700; text-align: center }

/* ---------- カード詳細・選択 ---------- */
.sheet-head { display: none }
#detail h3 { margin: 0 0 4px; font-size: 17px; text-wrap: balance }
#detail .tl { margin: 0 0 4px; font-size: 12px; color: var(--sub) }
#detail .tx { margin: 8px 0 0; font-size: 13px; white-space: pre-wrap; max-height: 200px; overflow: auto; border-top: 1px solid var(--line); padding-top: 8px }
#detail .prompt { margin: 4px 0 8px; font-weight: 700; font-size: 15px }
.acts { display: flex; flex-direction: column; gap: 8px; margin-top: 12px }
.acts .act { justify-content: flex-start; text-align: left; min-height: 44px; white-space: normal; width: 100%; max-width: none; flex: none }
.acts.row2 .act { width: auto; flex: 1 }
.acts .act.go { background: var(--accent); border-color: var(--accent); color: var(--accent-ink) }
.acts .act.off { opacity: .45; border-style: dashed }
.acts .info { margin: 0; font-size: 12px; color: var(--sub); background: var(--panel-2); border-radius: 8px; padding: 6px 10px }
.acts.row2 { flex-direction: row }
.acts.row2 .act { flex: 1; justify-content: center }
.optlist { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; max-height: 320px; overflow: auto; margin: 8px 0 }
.opt { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; min-height: 48px }
.opt span { font-weight: 700 }
.opt small { color: var(--sub); font-size: 11px }
.opt.on { border-color: var(--accent); background: var(--accent-soft); box-shadow: inset 0 0 0 1px var(--accent) }
.confirm { width: 100% }
.loghead { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px }
.loghead h3 { margin: 0; font-size: 13px; letter-spacing: .06em }
#log { list-style: none; margin: 0; padding: 0; max-height: 340px; overflow: auto; font-size: 12px }
#log li { padding: 3px 0; border-bottom: 1px solid var(--line) }
#log li.turn { color: var(--accent); font-weight: 700; padding-top: 8px }

/* ---------- メニュー・墓地などの重ねて出す画面 ---------- */
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; padding: max(16px, env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) max(16px, env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px)); z-index: 30 }
.overlay[hidden] { display: none }
.overlay .box { background: var(--panel); border-radius: 16px; padding: 16px; width: min(640px, 100%); max-height: 85vh; overflow: auto; box-shadow: var(--shadow) }
.box-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 8px }
.box-head h3 { margin: 0; font-size: 16px }
.menu-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 12px }
.menu-grid label { display: grid; gap: 4px; font-size: 12px; color: var(--sub); font-weight: 700 }
.deck-fmt { display: grid; gap: 2px; font-weight: 500; line-height: 1.5 }
.deck-fmt:empty { display: none }
.deck-fmt b { font-size: 12px }
.deck-fmt b.ryu { color: #a3456b }
.deck-fmt b.std { color: #2f7a55 }
.deck-fmt small { font-size: 11px; color: var(--sub) }
.menu-grid select { min-height: 40px; border-radius: 10px; border: 1px solid var(--line); background: var(--panel); padding: 0 10px; color: var(--ink); font-weight: 500 }
.menu-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px }
.menu-row .btn { flex: 1 }
.menu-note { font-size: 12px; color: var(--sub); margin: 12px 0 0 }
.check { display: flex; align-items: center; gap: 8px; font-size: 13px; margin-top: 12px }
.pilelist { display: flex; flex-wrap: wrap; gap: 6px }
.pilelist .card { width: 84px; font-size: 10px }
/* デッキから選ぶ時の扇（山札を広げた画面） */
.fan-layer { position: fixed; inset: 0; z-index: 28; background: rgba(6,20,14,.74); display: flex; flex-direction: column; align-items: center; overflow-y: auto;
  padding: calc(env(safe-area-inset-top, 0px) + 14px) 12px calc(env(safe-area-inset-bottom, 0px) + 16px) }
.fan-layer.cpu { background: rgba(6,20,14,.38); pointer-events: none; justify-content: center }
.fan-layer.done { pointer-events: none }
.fan-head { color: #fff; text-align: center; display: flex; flex-direction: column; gap: 2px; margin: 6px 0 4px; max-width: 640px }
.fan-head b { font-family: var(--display); font-weight: 400; font-size: 16px; line-height: 1.4 }
.fan-head span { font-size: 12px; opacity: .8 }
.fan-area { position: relative; width: min(980px, 100%); flex: none }
.fan-area .card { position: absolute; font-size: 10px; cursor: pointer; transform: rotate(var(--rot, 0deg)); transition: transform .18s ease-out, filter .2s, box-shadow .18s }
.fan-area .card.dim { filter: grayscale(.85) brightness(.5); cursor: default }
.fan-area .card:not(.dim):not(.back):hover { transform: translateY(-10px) rotate(0deg) scale(1.06); z-index: 80 !important }
.fan-area .card.picked { transform: translateY(-20px) scale(1.12); z-index: 90 !important; box-shadow: 0 0 0 3px var(--accent), 0 0 22px 6px color-mix(in srgb, var(--accent) 70%, transparent) }
.fan-btns { display: flex; gap: 10px; margin: 8px 0 }
.fan-btns:empty { display: none }
@media (max-width: 860px) { .fan-area .card { font-size: 8.5px } }
/* カードの移動・発動・ターン・勝敗の演出（押した操作は下の画面に通す） */
.fly-layer { position: fixed; inset: 0; pointer-events: none; z-index: 27 }
.fly-layer .card { box-shadow: 0 8px 18px rgba(0,0,0,.45) }
.fx-cross { position: fixed; pointer-events: none }
.fx-cross::before, .fx-cross::after { content: ""; position: absolute; left: -10%; top: 46%; width: 120%; height: 9%; border-radius: 4px; background: #ff4a3d; box-shadow: 0 0 12px #ff4a3d }
.fx-cross::before { transform: rotate(45deg) } .fx-cross::after { transform: rotate(-45deg) }
.fx-ring { position: fixed; width: 90px; height: 90px; border-radius: 50%; border: 4px solid; box-shadow: 0 0 18px currentColor; pointer-events: none }
.fx-banner { position: fixed; left: 50%; top: 42%; transform: translate(-50%,-50%); padding: 14px 60px; color: #fff; text-align: center; white-space: nowrap;
  background: linear-gradient(90deg, transparent, rgba(10,14,20,.85) 18%, rgba(10,14,20,.85) 82%, transparent); border-block: 2px solid var(--accent) }
.fx-banner b { font-family: var(--display); font-weight: 400; font-size: clamp(22px, 5vw, 34px); letter-spacing: .08em }
.fx-banner.opp { border-color: var(--opp) }
.fx-banner.win b { color: #ffe08a; font-size: clamp(30px, 8vw, 52px) }
.fx-banner.lose b { color: #b9c3d6; font-size: clamp(30px, 8vw, 52px) }
/* 攻撃の演出を描く全画面のキャンバス（押した操作は下の画面に通す） */
.fx-layer { position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 26; display: none }
#toast { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(var(--dock-h) + 24px + env(safe-area-inset-bottom, 0px)); background: var(--ink); color: var(--bg); border-radius: 10px; padding: 9px 16px; max-width: min(520px, calc(100vw - 32px)); box-shadow: var(--shadow); z-index: 40; font-weight: 500 }
#toast[data-bad="1"] { background: var(--bad); color: #fff }

/* ---------- スマホ・タブレット（縦） ---------- */
@media (max-width: 860px) {
  .app { grid-template-columns: minmax(0, 1fr) }
  .sidecol { position: static; display: contents }
  .top { padding-block: 8px 6px; gap: 6px 10px }
  .top h1 { font-size: 15px }
  .turn { order: 3; width: 100%; justify-content: space-between }
  #phases li button, #phases li span { min-width: 0; padding: 4px 7px }
  .pstrip { padding: 5px 10px }
  .pstrip .lp { font-size: 22px }
  .hand { --cw: 70px }
  .hand .card { font-size: 8.5px }
  .hand.opp { --cw: 34px }
  #board { padding: 5px; gap: 4px; border-radius: 12px; max-width: none }
  #board .row { gap: 4px }
  .zone .zl { font-size: 8px }
  .card { font-size: clamp(6px, 2vw, 9px) }
  .droot { padding-bottom: 0 }
  /* ドックは画面の一番下に固定し、その分だけ下に余白をとる */
  .table { padding-bottom: calc(var(--dock-h) + 12px) }
  /* 自分のLPは盤面のすぐ下に出す（手札の下だとドックに隠れやすい） */
  #side1 { order: 1 } #hand1 { order: 2 } #board { order: 3 } #result { order: 4 } #chain { order: 5 } #side0 { order: 6 } #hand0 { order: 7 } .dock { order: 8 }
  #hand0 { position: relative; z-index: 6; margin-top: 2px }
  .hand.me { margin-bottom: 0 }
  /* 見出しは1行に：タイトルは隠し、ボタンを小さく */
  .top h1 { display: none }
  .topbtns { margin-left: auto; gap: 4px }
  .topbtns .btn { padding: 2px 8px; min-height: 32px; font-size: 13px }
  .turn { order: 0; width: auto; flex: 1 1 auto; gap: 6px; justify-content: flex-start }
  #turnInfo { font-size: 12px; white-space: nowrap }
  #phases li button, #phases li span { padding: 3px 5px; font-size: 11px }
  /* ドックを低く：説明は2行まで、進むボタンの小さい文字は1行 */
  .dock { padding-top: 8px; padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px)); row-gap: 6px }
  #actor { font-size: 15px; line-height: 1.35 }
  #actorHint { font-size: 11px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden }
  #goBtn { min-height: 46px; font-size: 15px }
  #goBtn small { font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100% }
  .dock { position: fixed; left: 0; right: 0; bottom: 0; margin: 0;
    padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); grid-template-columns: minmax(0, 1fr) auto; border-inline: none; border-bottom: none }
  #phaseBtns { justify-content: stretch }
  #phaseBtns .btn { flex: 1 }
  #goBtn { width: 42% }
  #logBtn { display: inline-flex }
  .dock-extra { grid-column: 2; grid-row: 1 }
  .pstrip { flex-wrap: wrap; row-gap: 2px }
  .pstrip .meta { font-size: 11px }
  /* 狭いので、空いているモンスター・魔法＆罠ゾーンの文字は出さない（並びで分かる） */
  .zone.mz .zl, .zone.st .zl, .zone.fz .zl { display: none }
  /* カード詳細・選択とログは下から出るシート */
  .sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 20; max-height: 78vh; overflow: auto; border-radius: 18px 18px 0 0; border-bottom: none; box-shadow: var(--shadow);
    padding: 10px max(16px, env(safe-area-inset-right, 0px)) calc(16px + env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px));
    transform: translateY(105%); transition: transform .22s ease-out; visibility: hidden }
  .sheet.open { transform: none; visibility: visible }
  .sheet-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px }
  .sheet-head::before { content: ""; width: 40px; height: 4px; border-radius: 4px; background: var(--line); position: absolute; left: 50%; top: 6px; transform: translateX(-50%) }
  #scrim { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 19 }
  #log { max-height: 60vh }
  .optlist { grid-template-columns: repeat(2, minmax(0, 1fr)) }
  .menu-grid { grid-template-columns: minmax(0, 1fr) }
  /* ルールページの中では、閉じるボタンの文字を短くする */
  #closeDuel .long { display: none }
}
@media (min-width: 861px) { #scrim { display: none } }
/* 手札のトレイ：パソコンでは何もしない（手札はいつもの場所） */
.tray { display: contents }
.tray-handle { display: none }
/* シャカパチ：罠カードが手札に来たら、手札のカードが小刻みに跳ねる */
@keyframes pachi { 0%, 100% { translate: 0 0 } 20% { translate: 0 -7px } 40% { translate: 0 1px } 60% { translate: 0 -5px } 80% { translate: 0 0 } }
.hand.me.pachi .card { animation: pachi .16s ease-in-out 4 }
.hand.me.pachi .card:nth-child(2n) { animation-delay: .05s }
.hand.me.pachi .card:nth-child(3n) { animation-delay: .09s }
.hand.me .card.newtrap { box-shadow: 0 0 0 2px var(--trap, #c2558f), 0 0 14px var(--trap, #c2558f) }
@media (prefers-reduced-motion: reduce) { .hand.me.pachi .card { animation: none } }
@media (max-width: 860px) {
  /* LPは上に2つ並べる（左が相手、右が自分） */
  .table { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: 6px; row-gap: 6px; align-content: start; padding-bottom: calc(var(--bottom-h, 210px) + 10px) }
  .table > * { grid-column: 1 / -1 }
  #side1 { grid-column: 1; order: 1 } #side0 { grid-column: 2; order: 1 }
  .pstrip { padding: 4px 8px; gap: 0 6px; border-left-width: 6px; align-content: center; min-width: 0 }
  .pstrip .who { font-size: 12px; gap: 4px }
  .pstrip .who::before { width: 9px; height: 9px }
  .pstrip .lp { font-size: 20px; min-width: 0 }
  .pstrip .lp::before { font-size: 9px; margin-right: 2px }
  .pstrip .tag { font-size: 9px; padding: 0 5px }
  .pstrip .meta { width: 100%; margin-left: 0; text-align: left; font-size: 10px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
  /* 手札のトレイ：画面の下に固定。上下のスワイプ（または取っ手）で開け閉め */
  .tray { display: block; position: fixed; left: 0; right: 0; bottom: 0; z-index: 9; background: var(--panel); border: 2px solid var(--edge); border-bottom: none; border-radius: 18px 18px 0 0;
    box-shadow: 0 -4px 14px rgba(0, 0, 0, .18); padding: 0 max(6px, env(safe-area-inset-right, 0px)) calc(4px + env(safe-area-inset-bottom, 0px)) max(6px, env(safe-area-inset-left, 0px));
    transition: transform .28s cubic-bezier(.2, .8, .2, 1); touch-action: pan-x }
  .tray-handle { display: flex; width: 100%; align-items: center; justify-content: center; gap: 8px; height: 28px; padding: 0; background: none; border: 0; color: var(--sub); font: inherit; font-size: 11px; font-weight: 700; cursor: pointer }
  .tray-handle .grip { width: 38px; height: 5px; border-radius: 5px; background: var(--line) }
  .tray-handle:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; border-radius: 12px }
  #hand0 { --cw: 104px; position: relative; z-index: auto; margin: 0; height: calc(var(--ch) * .9 + 22px) }
  #hand0 .card { font-size: 10px }
  /* 閉じた時：取っ手と手札の上の端だけ見せ、その下にドック（エンドなどのボタン） */
  .droot.tray-closed .tray { transform: translateY(calc(100% - 46px - var(--dock-h))); z-index: 6 }
  .dock { z-index: 8; transition: transform .28s cubic-bezier(.2, .8, .2, 1) }
  .droot:not(.tray-closed) .dock { transform: translateY(110%); pointer-events: none }
  #toast { bottom: calc(var(--bottom-h, 210px) + 12px) }
}
@media (max-width: 380px) { #hand0 { --cw: 94px } }
/* サーチ：選べるカードを並べる下の列（手札のあたり） */
.fan-pick { display: flex; gap: 8px; justify-content: flex-start; overflow-x: auto; max-width: 100%; padding: 14px 12px 6px; flex: none; scroll-snap-type: x proximity }
.fan-pick > .card:first-child { margin-left: auto }
.fan-pick > .card:last-child { margin-right: auto }
.fan-pick .card { position: relative; flex: 0 0 auto; width: 84px; font-size: 10.5px; cursor: pointer; scroll-snap-align: center; box-shadow: 0 0 0 2px #fff, 0 8px 18px rgba(0, 0, 0, .5); transition: transform .18s ease-out, box-shadow .18s }
.fan-pick .card.peek, .fan-area .card.peek { transform: translateY(-12px) scale(1.08); box-shadow: 0 0 0 3px var(--accent), 0 0 18px 4px color-mix(in srgb, var(--accent) 70%, transparent); z-index: 80 !important }
.fan-pick .card.picked { transform: translateY(-16px) scale(1.12); box-shadow: 0 0 0 3px var(--accent), 0 0 22px 6px color-mix(in srgb, var(--accent) 70%, transparent) }
/* 押したカードの効果 */
.fan-info { width: min(560px, calc(100% - 24px)); background: var(--panel); color: var(--ink); border: 2px solid var(--edge); border-radius: 14px; box-shadow: 3px 3px 0 var(--edge); padding: 8px 12px; display: grid; gap: 2px; flex: none; margin-top: 6px }
.fan-info b { font-family: var(--display); font-size: 15px }
.fan-info small { color: var(--sub); font-size: 11px }
.fan-info p { margin: 2px 0 0; font-size: 12px; line-height: 1.55; max-height: 7.8em; overflow: auto }
.fan-info .fan-hint { font-size: 11px; font-weight: 700; color: var(--me) }
@media (max-width: 860px) {
  .fan-layer > .fan-head { margin-top: 0 }
  .fan-layer > .fan-area { margin-bottom: auto }
}
/* サーチの山札：並べ替えはなめらかに動かす */
.fan-area.sorting .card { transition: left .5s cubic-bezier(.2, .8, .2, 1), top .5s cubic-bezier(.2, .8, .2, 1), transform .18s ease-out, filter .2s }
@media (max-width: 860px) {
  /* サーチの山札：全体を画面の下に寄せて、指で押しやすく */
  .fan-layer { padding-bottom: calc(18px + env(safe-area-inset-bottom, 0px)) }
  .fan-layer > .fan-head { margin-top: auto }
  .fan-area .card:not(.dim) { box-shadow: 0 0 0 2px #fff, 0 6px 14px rgba(0, 0, 0, .45) }
  /* 手札を閉じた時：盤面のマスを縦長にしてカードを大きく、カード名なども出す */
  /* 手札を閉じた時：盤面を画面の端から端まで、上のLPから下のボタンまでの高さいっぱいに広げる（高さ --board-h は app.js が測る） */
  .droot.tray-closed #board { width: 100vw; max-width: none; margin-left: calc(50% - 50vw); border-radius: 0; border-left: none; border-right: none; box-shadow: none;
    height: var(--board-h, auto); padding: 4px 3px; gap: 3px; grid-template-rows: 1fr 1fr .58fr 1fr 1fr }
  .droot.tray-closed #board .row { gap: 3px; min-height: 0; grid-template-columns: .74fr repeat(5, minmax(0, 1fr)) .74fr }
  .droot.tray-closed #board .r2 { margin-block: 0 }
  .droot.tray-closed #board .zone { aspect-ratio: auto; height: 100%; min-height: 0; container-type: size }
  /* カードはマスの幅と高さの小さいほうに合わせて最大に（守備表示は横向きで収まる大きさ） */
  .droot.tray-closed #board .zone > .card { width: min(92cqw, 94cqh * 59 / 86); font-size: calc(min(92cqw, 94cqh * 59 / 86) / 8) }
  .droot.tray-closed #board .zone > .card.def { width: min(64cqw, 92cqh); font-size: calc(min(64cqw, 92cqh) / 8) }
}
/* 選ぶ画面：カードを横に並べてスクロール */
.optlist.cards { display: flex; gap: 10px; overflow-x: auto; overflow-y: visible; max-height: none; scroll-snap-type: x mandatory; padding: 10px 2px 8px; -webkit-overflow-scrolling: touch; overscroll-behavior-x: contain }
.opt.cardopt { flex: 0 0 auto; width: 104px; scroll-snap-align: center; align-items: center; text-align: center; padding: 6px; gap: 3px; position: relative; min-height: 0; border-radius: 12px }
.opt.cardopt > .card { position: relative; width: 100%; font-size: 8.5px; pointer-events: none }
.opt.cardopt small { font-size: 11px; line-height: 1.3; color: var(--ink); font-weight: 700; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; width: 100% }
.opt.cardopt small.wh { font-weight: 500; color: var(--sub); font-size: 10px }
.opt.cardopt .on-mark { position: absolute; top: 2px; right: 2px; z-index: 3; width: 24px; height: 24px; border-radius: 50%; background: var(--accent); color: var(--accent-ink); border: 2px solid var(--edge); font-weight: 900; line-height: 20px; display: none }
.opt.cardopt.on .on-mark { display: block }
.opt.cardopt.on > .card { box-shadow: 0 0 0 3px var(--accent) }
/* ロックオンの照準 */
.fx-lock { position: fixed; z-index: 30; pointer-events: none; border-radius: 50%; border: 3px solid var(--lc); box-shadow: 0 0 12px var(--lc), inset 0 0 12px var(--lc);
  background: radial-gradient(circle, transparent 46%, transparent 47%), linear-gradient(var(--lc), var(--lc)) center / 3px 100% no-repeat, linear-gradient(var(--lc), var(--lc)) center / 100% 3px no-repeat;
  -webkit-mask: radial-gradient(circle, transparent 18%, #000 19%); mask: radial-gradient(circle, transparent 18%, #000 19%) }
@media (max-width: 860px) {
  /* 盤面のカードの見た目は、下の「盤面のカード（A4）」で決める */
  /* 手札：枠なし（取っ手の線だけ） */
  .tray { background: transparent; border: none; box-shadow: none; touch-action: none; pointer-events: none }
  .tray > * { pointer-events: auto }
  .tray-handle { height: 22px; font-size: 10px; color: var(--sub); text-shadow: 0 0 3px var(--bg), 0 0 6px var(--bg) }
  #hand0 .card { box-shadow: 0 6px 14px rgba(0, 0, 0, .28) }
  /* しまう時：カードが真ん中に集まって小さく重なり、真ん中の下（ボタンの上）に収まる */
  .tray { transition: bottom .28s cubic-bezier(.2, .8, .2, 1) }
  .droot.tray-closed .tray { transform: none; bottom: var(--dock-h); z-index: 6 }
  #hand0 { transition: height .28s cubic-bezier(.2, .8, .2, 1) }
  .droot.tray-closed #hand0 { height: 40px; cursor: pointer }
  .droot.tray-closed .tray-handle { height: 0; overflow: hidden; opacity: 0 }
  #hand0 .card { transition: transform .3s cubic-bezier(.2, .8, .2, 1), box-shadow .12s }
  .droot.tray-closed #hand0 .card { transform: translate(calc((var(--z, 1) - 3) * 3px), 0) rotate(calc((var(--z, 1) - 3) * 2deg)) scale(.46); transform-origin: 50% 100% }
  .droot.tray-closed #hand0 .card.sel { transform: translate(0, 0) scale(.46) }
}
@media (max-width: 860px) and (max-height: 700px) { #hand0 { --cw: 94px } }
/* 縦が短いスマホ：手札を少し小さくして、1画面に収まりやすくする */
@media (max-width: 860px) and (max-height: 720px) { .hand { --cw: 62px } .hand.opp { --cw: 30px } }
#turnInfo .ts { display: none }
@media (max-width: 520px) { .top { flex-wrap: nowrap } .turn { flex: 0 1 auto; flex-wrap: nowrap; gap: 4px } #phases li button, #phases li span { padding: 3px 4px } #actor { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis } .dock-extra .btn { padding: 2px 8px; min-height: 34px; font-size: 13px } #turnInfo .tl { display: none } #turnInfo .ts { display: inline } #turnInfo { font-family: var(--num); font-weight: 600 } .topbtns .bl { display: none } .topbtns .btn { min-width: 36px; font-size: 16px } }
@media (prefers-reduced-motion: reduce) { .card, .hand .card, .btn, .sheet, .pstrip .lp { transition: none; animation: none } }
/* ================= デザイン v5（ルールブックのサイトに合わせる） =================
   外側の箱：濃い線＋右下にずらした影／中の箱：細い線・影なし／角丸 16・12・10／ボタンは主・副・控えめの3段階 */
.btn { border: 2px solid var(--edge); border-radius: 12px; background: var(--panel); box-shadow: 2px 2px 0 var(--edge); transition: transform .08s, box-shadow .08s, background .15s }
.btn:hover:not(:disabled) { border-color: var(--edge); background: var(--panel-2) }
.btn:active:not(:disabled) { transform: translate(2px, 2px); box-shadow: 0 0 0 var(--edge) }
.btn.primary { background: var(--me); border-color: var(--edge); color: #fff; font-family: var(--display); box-shadow: 3px 3px 0 var(--edge) }
.btn.primary:hover:not(:disabled) { background: color-mix(in srgb, var(--me) 88%, #fff) }
.btn.primary:active:not(:disabled) { transform: translate(3px, 3px) }
.btn.ghost { background: transparent; border: 1.5px solid var(--line); box-shadow: none; color: var(--sub) }
.btn.ghost:active:not(:disabled) { transform: scale(.97) }
.btn.danger { border-color: var(--edge); color: var(--bad) }
.btn.danger.armed { background: var(--bad); color: #fff }
#stopBtn[aria-pressed="true"] { background: var(--accent); border-color: var(--edge); color: var(--accent-ink) }
/* 見出し：サイトと同じ赤い斜めの帯 */
.top { border-bottom: 2px solid var(--line) }
.top h1 { font-weight: 700; font-size: 16px; color: #fff; background: var(--opp); border: 2px solid var(--edge); padding: 1px 12px; box-shadow: 3px 3px 0 var(--edge); transform: skewX(-8deg); margin-left: 4px }
#phases li button, #phases li span { border-radius: 8px; border: 1.5px solid var(--line); font-family: var(--num); letter-spacing: .04em }
#phases li.cur span { background: var(--accent); border: 2px solid var(--edge); color: var(--accent-ink); box-shadow: 2px 2px 0 var(--edge) }
#phases li button { border: 1.5px dashed var(--edge) }
/* プレイヤーの帯：左端に寮の色 */
.pstrip { border: 2px solid var(--edge); border-left-width: 8px; border-left-color: var(--me); box-shadow: 3px 3px 0 var(--edge); border-radius: 12px }
.pstrip.opp { border-left-color: var(--opp) }
.pstrip .who::before { width: 12px; height: 12px; background: var(--me); border: 2px solid var(--edge) }
.pstrip.opp .who::before { background: var(--opp) }
.pstrip .lp { font-family: var(--num); font-weight: 600; letter-spacing: .02em }
.pstrip .tag { background: var(--accent); border: 1.5px solid var(--edge); color: var(--accent-ink) }
.pstrip.acting { border-color: var(--edge); border-left-color: var(--me); box-shadow: 3px 3px 0 var(--edge), 0 0 0 3px color-mix(in srgb, var(--accent) 70%, transparent) }
.pstrip.opp.acting { border-left-color: var(--opp) }
/* デュエルマット（緑のまま）を外枠で囲む */
#board { border: 2px solid var(--edge); box-shadow: 4px 4px 0 var(--edge), inset 0 0 0 1px color-mix(in srgb, var(--mat-line) 40%, transparent) }
.pile .cnt { border: 1.5px solid var(--edge); font-family: var(--num); font-weight: 600 }
.badge { border: 1px solid var(--edge) }
/* 操作ドック・パネル・メニュー */
.dock { border: 2px solid var(--edge); border-bottom: none; box-shadow: 0 -2px 0 color-mix(in srgb, var(--edge) 25%, transparent) }
.dock.mine { border-color: var(--edge) }
.panel { border: 2px solid var(--edge); border-radius: 16px; box-shadow: 3px 3px 0 var(--edge) }
#chain { border-color: var(--edge); background: color-mix(in srgb, var(--accent) 18%, var(--panel)) }
#chain li { border-left-color: var(--me) }
#chain li.opp { border-left-color: var(--opp) }
#result { border: 2px solid var(--edge); box-shadow: 3px 3px 0 var(--edge) }
.overlay .box { border: 2px solid var(--edge); box-shadow: 5px 5px 0 var(--edge) }
.box-head h3 { font-family: var(--display); font-weight: 700 }
.menu-grid select { border: 1.5px solid var(--line) }
.opt { border: 1.5px solid var(--line) }
.opt.on { border: 2px solid var(--edge); background: color-mix(in srgb, var(--accent) 30%, var(--panel)); box-shadow: 2px 2px 0 var(--edge) }
.acts .act.go { background: var(--me); border-color: var(--edge); color: #fff }
.acts .info { border: 1.5px solid var(--line) }
#detail h3, .loghead h3, #chain h3 { font-family: var(--display); font-weight: 700 }
#log li.turn { color: var(--me) }

/* ---------- カウンター・ターン数の表示（カードの下寄りに重ねる） ---------- */
.ctr { position: absolute; left: 50%; bottom: 14%; transform: translateX(-50%); z-index: 2; display: inline-flex; align-items: center; gap: 3px; white-space: nowrap;
  background: rgba(22, 18, 40, .88); color: #fff; border: 1.5px solid var(--edge); border-radius: 9px; padding: 1px 5px; font-size: 9px; line-height: 1.3; box-shadow: 1px 1px 0 var(--edge); pointer-events: none; animation: ctrIn .35s ease-out }
.ctr b { font-family: var(--num); font-weight: 600; font-size: 11px }
.ctr small { font-size: 8px; opacity: .85 }
.ctr em { position: absolute; top: calc(100% + 2px); left: 50%; transform: translateX(-50%); font-style: normal; font-size: 8px; background: var(--accent); color: var(--accent-ink); border: 1px solid var(--edge); border-radius: 6px; padding: 0 4px }
.ctr .orbs { display: inline-flex; gap: 2px }
.ctr .orbs i { width: 6px; height: 6px; border-radius: 50%; background: rgba(255, 255, 255, .18); border: 1px solid rgba(201, 167, 255, .55) }
.ctr .orbs i.on { background: radial-gradient(circle at 35% 35%, #fff, #c9a7ff 55%, #7f57d8); border-color: #e9dcff; box-shadow: 0 0 5px #c9a7ff }
.ctr.turns { background: color-mix(in srgb, var(--accent) 92%, #000); color: var(--accent-ink) }
.ctr.magic.ready { animation: ctrIn .35s ease-out, ctrPulse2 1.2s ease-in-out infinite }
@keyframes ctrPulse2 { 50% { box-shadow: 1px 1px 0 var(--edge), 0 0 10px #c9a7ff } }
.ctr.turns.ready { background: #ff8ad8; color: #2a0b22; animation: ctrIn .35s ease-out, ctrPulse 1.4s ease-in-out infinite }
.ctr.sarco { bottom: auto; top: 6px; background: #d9b44a; color: #2a1d04 }
.card.def .ctr { transform: translateX(-50%) rotate(-90deg) }
@keyframes ctrIn { from { transform: translateX(-50%) scale(.4); opacity: 0 } to { transform: translateX(-50%) scale(1); opacity: 1 } }
@keyframes ctrPulse { 50% { box-shadow: 1px 1px 0 var(--edge), 0 0 10px #ff8ad8 } }
.hand .ctr, .fan-area .ctr, .pilelist .ctr { display: none }
/* カウンターの帯がカードの幅より長い時（5つの玉など）は、はみ出して見せる */
.zone .card:has(> .ctr) { overflow: visible }

/* ===== 盤面のカード（案A4）：実物風・色を濃く・攻守の数字を大きく。1em ＝ カードの幅の1/8（マスの幅から計算） ===== */
#board .zone { container-type: inline-size }
#board .zone > .card:not(.back) { font-size: 9cqi; padding: 0; border-radius: .09em; border: .035em solid #0d0b09; overflow: hidden;
  box-shadow: 0 .08em .22em rgba(0,0,0,.7), inset 0 0 0 .05em rgba(255,255,255,.22), inset 0 0 .3em rgba(0,0,0,.6) }
#board .zone > .card:not(.back)::before { background: repeating-linear-gradient(115deg, rgba(255,255,255,.06) 0 .03em, transparent .03em .09em), repeating-linear-gradient(25deg, rgba(0,0,0,.1) 0 .025em, transparent .025em .11em), linear-gradient(160deg, rgba(255,255,255,.18), transparent 40%, rgba(0,0,0,.3)) }
#board .zone > .card.f-normal { background: linear-gradient(160deg, #d29a2e, #a8700f 60%, #7d5206) }
#board .zone > .card.f-effect { background: linear-gradient(160deg, #d0601c, #a2420b 60%, #782e05) }
#board .zone > .card.f-ritual { background: linear-gradient(160deg, #3f7fd6, #1f55a8 60%, #143c7d) }
#board .zone > .card.f-fusion { background: linear-gradient(160deg, #8a46c8, #62269c 60%, #461974) }
#board .zone > .card.f-spell { background: linear-gradient(160deg, #109f80, #056b55 60%, #03503f) }
#board .zone > .card.f-trap { background: linear-gradient(160deg, #b8247a, #8a0f57 60%, #650a40) }
/* 名前の板 */
#board .zone > .card:not(.back) .top { display: flex; left: 5%; right: 5%; top: 3.6%; height: 9.2%; padding: 0 .08em 0 .1em; gap: .05em; align-items: center; border-radius: .03em; border: .02em solid rgba(0,0,0,.7);
  background: linear-gradient(180deg, rgba(255,236,190,.55), rgba(255,220,150,.15) 45%, rgba(0,0,0,.12) 55%, rgba(255,220,150,.2)); box-shadow: inset 0 0 .06em rgba(0,0,0,.4) }
#board .zone > .card:not(.back) .top .n { font-family: 'Shippori Mincho B1', var(--body), serif; font-weight: 800; font-size: .5em; line-height: 1; color: #151210; letter-spacing: -.02em; white-space: nowrap; overflow: hidden; text-overflow: clip; display: block }
#board .zone > .card.f-spell .top .n, #board .zone > .card.f-trap .top .n { color: #fff; text-shadow: 0 .03em 0 rgba(0,0,0,.7) }
/* 属性：金の輪に色の玉と一文字 */
#board .zone > .card:not(.back) .at { width: 2.5em; height: 2.5em; line-height: 2.5em; font-size: .29em; padding: 0; border: none; border-radius: 50%; flex: none; text-align: center; color: #fff; font-weight: 800; text-shadow: 0 0 .25em #000;
  box-shadow: 0 0 0 .16em #e8bd55, 0 0 0 .26em #3a2706, inset .1em .14em .2em rgba(255,255,255,.55), inset -.1em -.14em .28em rgba(0,0,0,.5) }
/* レベルの星 */
#board .zone > .card:not(.back) .lv { display: flex; right: 6%; top: 14%; height: 5.4%; gap: .035em; align-items: center }
#board .zone > .card:not(.back) .lv i { width: .38em; height: .38em; border: none; border-radius: 0; background: radial-gradient(circle at 40% 35%, #ffd36a, #e0500c 55%, #7a1d04); clip-path: polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%) }
/* 魔法・罠の種類の行 */
#board .zone > .card:not(.back) .sp { display: block; right: 6%; top: 13.6%; font-size: .36em; font-weight: 800; color: #fff; text-shadow: 0 .04em 0 rgba(0,0,0,.6); white-space: nowrap; letter-spacing: 0 }
/* イラスト：額縁＋属性の色の光＋種族の紋 */
#board .zone > .card:not(.back) .art { left: 11.5%; right: 11.5%; top: 20.4%; border: .01em solid #2a1f14; font-size: 3.1em; overflow: hidden; font-family: 'Shippori Mincho B1', var(--display), serif; font-weight: 800;
  color: color-mix(in srgb, var(--atc, #fff) 30%, #fff); text-shadow: 0 .02em .03em rgba(0,0,0,.85), 0 0 .06em var(--atc, #fff);
  box-shadow: 0 0 0 .016em rgba(255,255,255,.55), 0 0 0 .025em rgba(0,0,0,.45), inset 0 0 .11em rgba(0,0,0,.75);
  background: radial-gradient(70% 60% at 50% 38%, var(--atc, #6a6e7e), color-mix(in srgb, var(--atc, #6a6e7e) 85%, #000) 45%, #06070c 100%) }
#board .zone > .card:not(.back) .art::before { content: ""; position: absolute; inset: 0; background: linear-gradient(125deg, transparent 35%, rgba(255,255,255,.22) 47%, transparent 58%) }
/* 説明の欄（魔法・罠）：羊皮紙 */
#board .zone > .card:not(.back) .tb { left: 5%; right: 5%; top: 77.2%; bottom: 3.8%; border: .025em solid #5d4a2f; border-radius: .02em; background: linear-gradient(180deg, #e8d6ad, #cdb27c); box-shadow: inset 0 0 .08em rgba(0,0,0,.35); padding: .05em .1em; font-size: .28em; color: #1a1408 }
#board .zone > .card:not(.back) .tb b { display: block; font-family: 'Shippori Mincho B1', var(--body), serif; font-weight: 800; white-space: nowrap; overflow: hidden }
/* モンスター：説明の欄をまるごと、金の縁の黒い数字の欄にする（攻撃力を大きく、守備力を小さく） */
#board .zone > .card:not(.back):not(.f-spell):not(.f-trap) .tb { display: flex; align-items: center; justify-content: center; padding: 0; font-size: 1em; border: .025em solid #e8bd55;
  background: linear-gradient(180deg, #2a1d0c, #100a04); box-shadow: inset 0 .04em 0 rgba(255,236,190,.3), inset 0 0 .12em rgba(0,0,0,.7) }
#board .zone > .card:not(.back):not(.f-spell):not(.f-trap) .tb > b { display: none }
#board .zone > .card:not(.back) .tb .ad { position: static; border: none; display: flex; align-items: center; justify-content: center; gap: .08em; font-family: var(--num); font-weight: 700; line-height: 1; letter-spacing: -.03em; text-shadow: none; white-space: nowrap; font-size: 1em }
#board .zone > .card:not(.back) .tb .ad i { display: none }
#board .zone > .card:not(.back) .tb .ad > span:first-child { font-size: 1.5em; color: #fff3d4; text-shadow: 0 0 .1em rgba(255,200,90,.5) }
#board .zone > .card:not(.back) .tb .ad > span:last-child { font-size: 1em; color: #cdb27c }
#board .zone > .card:not(.back) .tb .ad > span:last-child::before { content: "/"; color: #8a7650; margin-right: .06em; font-size: .85em }
#board .zone > .card:not(.back) .tb .ad .up { color: #8dffb0 !important } #board .zone > .card:not(.back) .tb .ad .dn { color: #ff9a9a !important }
/* 守備表示：守備力だけを青白く大きく */
#board .zone > .card.def:not(.back) .tb .ad > span:first-child { display: none }
#board .zone > .card.def:not(.back) .tb .ad > span:last-child { font-size: 1.6em; color: #bfe0ff; text-shadow: 0 0 .1em rgba(120,180,255,.55) }
#board .zone > .card.def:not(.back) .tb .ad > span:last-child::before { content: "DEF"; font-size: .34em; color: #e8bd55; margin-right: .12em; letter-spacing: .02em }
/* 守備表示（横向き）：カードの長い辺がマスの幅に収まる大きさにする（隣のマスにはみ出さない） */
#board .zone > .card.def { width: 64% }
#board .zone > .card.def:not(.back) { font-size: 8cqi }

/* ---------- 演出に合わせたプレイマットの柄（盤面の地だけが変わり、カードを置く枠は残る） ---------- */
#board { position: relative }
#board .row { position: relative; z-index: 1 }
.mat-skin { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 14px; pointer-events: none; z-index: 0 }
#board .zone { transition: background .35s }
#board.skin-on .zone:not(.void) { background: rgba(0, 0, 0, .16); border-color: rgba(255, 255, 255, .45) }

`;

export const MARKUP = `
<div class="droot">
<header class="top">
  <h1>GX環境 デュエル卓</h1>
  <div class="turn"><span id="turnInfo"></span><ol id="phases" aria-label="フェイズ"></ol></div>
  <div class="topbtns">
    <button class="btn small ghost" id="soundBtn" aria-pressed="true" title="効果音のオン・オフ">音 オン</button>
    <button class="btn small ghost" id="undo" title="元に戻す（Ctrl+Z）" aria-label="元に戻す"><span aria-hidden="true">↶</span><span class="bl"> 元に戻す</span></button>
    <button class="btn small" id="menuBtn" aria-haspopup="dialog" aria-label="メニュー"><span aria-hidden="true">☰</span><span class="bl"> メニュー</span></button>
    <button class="btn small" id="closeDuel" hidden aria-label="ルールブックに戻る">✕<span class="long"> ルールブックに戻る</span></button>
  </div>
</header>

<div class="app">
  <main class="table" aria-label="デュエル">
    <div class="pstrip opp" id="side1"><span class="who"></span><span class="lp"></span><span class="tag" hidden></span><span class="meta"></span></div>
    <div class="hand opp" id="hand1"></div>
    <div id="board"></div>
    <div id="result" hidden></div>
    <section class="panel" id="chain" hidden aria-live="polite"></section>
    <div class="tray" id="tray"><button class="tray-handle" id="trayHandle" type="button" aria-expanded="true" aria-controls="hand0"><span class="grip" aria-hidden="true"></span><span class="tray-lbl" id="trayLbl">手札をしまう</span></button><div class="hand me" id="hand0"></div></div>
    <div class="pstrip me" id="side0"><span class="who"></span><span class="lp"></span><span class="tag" hidden></span><span class="meta"></span></div>
    <div class="dock" id="dock">
      <div class="dock-status"><span id="actor"></span><span id="actorHint"></span></div>
      <div class="dock-extra"><button class="btn small" id="stopBtn" aria-pressed="false" hidden title="次に発動できるタイミングで、必ず止めて聞く">✋ 次で止める</button><button class="btn small" id="logBtn">ログ</button></div>
      <div class="dock-acts"><div id="phaseBtns"></div><button class="btn primary go" id="goBtn"></button></div>
    </div>
  </main>
  <aside class="sidecol">
    <section class="panel sheet" id="detailSheet" aria-live="polite">
      <div class="sheet-head"><span></span><button class="btn small ghost" data-close="detail">閉じる</button></div>
      <div id="detail"></div>
    </section>
    <section class="panel sheet" id="logSheet">
      <div class="sheet-head"><span></span><button class="btn small ghost" data-close="log">閉じる</button></div>
      <div class="loghead"><h3>ログ</h3></div><ol id="log"></ol>
    </section>
  </aside>
</div>
<div id="scrim" hidden></div>

<div class="overlay" id="menu" hidden role="dialog" aria-modal="true" aria-labelledby="menuTitle">
  <div class="box">
    <div class="box-head"><h3 id="menuTitle">メニュー</h3><button class="btn small ghost" id="menuClose">閉じる</button></div>
    <div class="menu-grid">
      <label for="deck0">あなたのデッキ（P1）<select id="deck0"></select><span class="deck-fmt" id="deckFmt0"></span></label>
      <label for="deck1">相手のデッキ（P2）<select id="deck1"></select><span class="deck-fmt" id="deckFmt1"></span></label>
      <label for="mode">対戦相手<select id="mode"><option value="cpu">CPU</option><option value="hot">2人で交互に操作</option></select></label>
      <label for="first">先攻<select id="first"><option value="0">P1（あなた）</option><option value="1">P2</option><option value="r">ランダム</option></select></label>
      <label for="chainMode">チェーンの確認<select id="chainMode"><option value="auto">おまかせ（相手が動いた時だけ聞く）</option><option value="always">いつも聞く</option><option value="never">聞かない（「次で止める」の時だけ）</option></select></label>
      <label for="fxMode">攻撃の演出<select id="fxMode"><option value="full">あり</option><option value="short">短く（2倍速）</option><option value="none">なし</option></select></label>
      <label for="cpuSpeed">CPUの速さ<select id="cpuSpeed"><option value="slow">ゆっくり</option><option value="normal" selected>ふつう</option><option value="fast">はやい</option></select></label>
    </div>
    <label class="check" id="hideOppRow"><input type="checkbox" id="hideOpp"> 手番でない側の手札を伏せる</label>
    <div class="menu-row">
      <button class="btn primary" id="newDuel">新しいデュエルを始める</button>
    </div>
    <div class="menu-row">
      <button class="btn danger" id="surrender">サレンダーする</button>
    </div>
    <p class="menu-note">カードを押すと、そのカードでできる操作が出ます。光っているカードは今発動できます。墓地・除外・EXの枠を押すと中身を見られます。Ctrl+Z で元に戻せます。</p>
  </div>
</div>
<div class="overlay" id="pileDlg" hidden role="dialog" aria-modal="true"><div class="box" id="pileBox"></div></div>
<div id="toast" role="status" hidden></div>
</div>
`;
