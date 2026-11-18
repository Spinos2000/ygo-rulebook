// 対戦画面の見た目（CSS）と骨組み（HTML）。Shadow DOM の中に入れるので、置き場所のページのスタイルとぶつからない。
// 色は置き場所のページが --d-* で渡す（単独のページ index.html、ルールページのどちらでも）。渡されない色は下の既定値になる。
export const CSS = `
/* レイアウト：デュエルマットを中心に、相手（上）→マット→自分（下）→操作ドック（画面下に固定）。
   PCでは右にカード詳細・ログの列。スマホではカード詳細とログは下から出るシートになる */
:host { display: block }
/* 色の名前は .droot の中だけで使う（:host に置くと、置き場所のページの同じ名前の色と循環してしまう） */
.droot {
  --bg: var(--d-bg, #e9eeea);
  --panel: var(--d-panel, #fbfcfb);
  --panel-2: var(--d-panel-2, #f1f5f2);
  --ink: var(--d-ink, #17211c);
  --sub: var(--d-sub, #5a6a61);
  --line: var(--d-line, #ccd7d0);
  --mat: var(--d-mat, #1d4737);
  --mat-2: var(--d-mat-2, #163a2c);
  --mat-line: var(--d-mat-line, #5c8c78);
  --mat-ink: var(--d-mat-ink, #d6ece1);
  --accent: var(--d-accent, #c48a22);
  --accent-ink: var(--d-accent-ink, #1d1405);
  --accent-soft: color-mix(in srgb, var(--accent) 16%, var(--panel));
  --opp: var(--d-opp, #b4544a);
  --bad: var(--d-bad, #b23a3a);
  --f-normal: var(--d-f-normal, #e6cf7c); --f-effect: var(--d-f-effect, #d9875a); --f-ritual: var(--d-f-ritual, #7c9fe0);
  --f-fusion: var(--d-f-fusion, #9d7cc9); --f-spell: var(--d-f-spell, #3a9c86); --f-trap: var(--d-f-trap, #b8577f);
  --card-ink: #1b1508;
  --back: #6b4a2a; --back2: #553a20;
  --shadow: var(--d-shadow, 0 10px 30px rgba(10, 30, 20, .18));
  --display: var(--d-display, "Dela Gothic One", "Hiragino Sans", "Yu Gothic", sans-serif);
  --body: var(--d-body, "Zen Kaku Gothic New", "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif);
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
.hand { display: flex; gap: 6px; overflow-x: auto; padding: 4px 2px 6px; min-height: 0; scrollbar-width: thin }
.hand .card { flex: 0 0 auto; width: 64px; font-size: 10px }
.hand.opp { min-height: 34px }
.hand.opp .card { width: 28px; font-size: 0 }
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
.pile .pl { position: absolute; bottom: 2px; left: 0; right: 0 }
.pile .cnt { position: absolute; top: -6px; right: -4px; background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: 999px; font-size: 10px; padding: 0 5px; font-variant-numeric: tabular-nums }
.r0 .zone:not(.void), .r1 .zone:not(.void) { border-color: color-mix(in srgb, var(--mat-line) 60%, var(--opp) 40%) }

/* ---------- カード ---------- */
.card { position: relative; width: 72%; aspect-ratio: 59 / 86; border-radius: 4px; border: 1px solid rgba(0,0,0,.35); padding: 2px 3px; display: flex; flex-direction: column; justify-content: space-between; text-align: left;
  color: var(--card-ink); font-size: clamp(7px, 1.05vw, 10px); line-height: 1.2; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,.4); transition: transform .12s, box-shadow .12s }
.card .nm { font-weight: 700; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; word-break: break-all }
.card .lv { font-size: .9em; opacity: .8 }
.card .st { font-variant-numeric: tabular-nums; font-weight: 700; white-space: nowrap; overflow: hidden }
.card .st i { font-style: normal; opacity: .5 }
.card .st.sub { font-weight: 500; color: #fff }
.card.def { transform: rotate(90deg) }
.card.sel { outline: 3px solid var(--accent); outline-offset: 2px }
.card.can { box-shadow: 0 0 0 2px var(--accent), 0 0 12px color-mix(in srgb, var(--accent) 70%, transparent) }
.card.picked { outline: 3px solid var(--accent); outline-offset: 1px }
.card.mod .st { color: #0b6b3a }
.f-spell.mod .st, .f-trap.mod .st { color: inherit }
.f-normal { background: var(--f-normal) } .f-effect { background: var(--f-effect) } .f-ritual { background: var(--f-ritual) }
.f-fusion { background: var(--f-fusion) } .f-spell { background: var(--f-spell); color: #f4fffb } .f-trap { background: var(--f-trap); color: #fff4f9 }
.card.back { background: repeating-linear-gradient(45deg, var(--back) 0 5px, var(--back2) 5px 10px); color: #f0dcc4 }
.card.back .bn { font-size: .85em; opacity: .75; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; word-break: break-all }
.card.mini { width: 60%; pointer-events: none }
.badge { position: absolute; top: 1px; right: 1px; background: var(--accent); color: var(--accent-ink); border-radius: 4px; font-size: 9px; padding: 0 3px; font-weight: 700 }
.badge.eq { top: auto; bottom: 1px; background: #2f5f8f; color: #fff }
.hand .card:not(.back):hover { transform: translateY(-3px) }

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
#phaseBtns { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end }
#phaseBtns .btn { white-space: normal; text-align: center; line-height: 1.3 }
#soundBtn[aria-pressed="false"] { color: var(--sub); text-decoration: line-through }
.dock .thinking::after { content: "…"; display: inline-block; animation: dots 1.2s steps(4) infinite; width: 1.2em; overflow: hidden; vertical-align: bottom }
@keyframes dots { from { width: 0 } to { width: 1.2em } }
.dock-extra { display: none }
#result { padding: 10px 14px; border-radius: 12px; background: var(--accent); color: var(--accent-ink); font-weight: 700; text-align: center }

/* ---------- カード詳細・選択 ---------- */
.sheet-head { display: none }
#detail h3 { margin: 0 0 4px; font-size: 17px; text-wrap: balance }
#detail .tl { margin: 0 0 4px; font-size: 12px; color: var(--sub) }
#detail .tx { margin: 8px 0 0; font-size: 13px; white-space: pre-wrap; max-height: 200px; overflow: auto; border-top: 1px solid var(--line); padding-top: 8px }
#detail .prompt { margin: 4px 0 8px; font-weight: 700; font-size: 15px }
.acts { display: flex; flex-direction: column; gap: 8px; margin-top: 12px }
.acts .act { justify-content: flex-start; text-align: left; min-height: 44px; white-space: normal }
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
.menu-grid select { min-height: 40px; border-radius: 10px; border: 1px solid var(--line); background: var(--panel); padding: 0 10px; color: var(--ink); font-weight: 500 }
.menu-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px }
.menu-row .btn { flex: 1 }
.menu-note { font-size: 12px; color: var(--sub); margin: 12px 0 0 }
.check { display: flex; align-items: center; gap: 8px; font-size: 13px; margin-top: 12px }
.pilelist { display: flex; flex-wrap: wrap; gap: 6px }
.pilelist .card { width: 64px }
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
  .hand .card { width: 56px }
  #board { padding: 5px; gap: 4px; border-radius: 12px; max-width: none }
  #board .row { gap: 4px }
  .zone .zl { font-size: 8px }
  .card { font-size: clamp(6px, 2vw, 9px) }
  .droot { padding-bottom: 0 }
  /* ドックは画面の一番下に固定し、その分だけ下に余白をとる */
  .droot { --dock-h: 130px }
  .table { padding-bottom: 150px }
  .dock { position: fixed; left: 0; right: 0; bottom: 0; margin: 0;
    padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); grid-template-columns: minmax(0, 1fr) auto; border-inline: none; border-bottom: none }
  #phaseBtns { grid-column: 1 / -1; justify-content: stretch }
  #phaseBtns:empty { display: none }
  #phaseBtns .btn { flex: 1 }
  .dock-extra { display: flex; gap: 6px; grid-column: 2; grid-row: 1 }
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
@media (prefers-reduced-motion: reduce) { .card, .btn, .sheet, .pstrip .lp { transition: none; animation: none } }
`;

export const MARKUP = `
<div class="droot">
<header class="top">
  <h1>GX環境 デュエル卓</h1>
  <div class="turn"><span id="turnInfo"></span><ol id="phases" aria-label="フェイズ"></ol></div>
  <div class="topbtns">
    <button class="btn small ghost" id="soundBtn" aria-pressed="true" title="効果音のオン・オフ">音 オン</button>
    <button class="btn small ghost" id="undo" title="Ctrl+Z">元に戻す</button>
    <button class="btn small" id="menuBtn" aria-haspopup="dialog">メニュー</button>
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
    <div class="hand me" id="hand0"></div>
    <div class="pstrip me" id="side0"><span class="who"></span><span class="lp"></span><span class="tag" hidden></span><span class="meta"></span></div>
    <div class="dock" id="dock">
      <div class="dock-status"><span id="actor"></span><span id="actorHint"></span></div>
      <div class="dock-extra"><button class="btn small" id="logBtn">ログ</button></div>
      <div id="phaseBtns"></div>
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
      <label for="deck0">あなたのデッキ（P1）<select id="deck0"></select></label>
      <label for="deck1">相手のデッキ（P2）<select id="deck1"></select></label>
      <label for="mode">対戦相手<select id="mode"><option value="cpu">CPU</option><option value="hot">2人で交互に操作</option></select></label>
      <label for="first">先攻<select id="first"><option value="0">P1（あなた）</option><option value="1">P2</option><option value="r">ランダム</option></select></label>
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
