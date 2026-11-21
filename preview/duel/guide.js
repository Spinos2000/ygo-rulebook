// 操作ガイド：対戦卓をはじめて開いた時に1回だけ出す「この卓の触り方」（ルールの説明はしない。使う人は遊戯王を知っている人）。
// ☰メニューの「📖 操作ガイド」から、いつでも見直せる。6枚、1枚は絵文字1つと2行まで。
// env：touch（指で操作する端末か）、land（スマホを横にしているか）で、言葉を少し変える

export const GUIDE_KEY = 'gx-duel-guide-v1'; // この端末で見たかどうか

/** ガイドの6枚（タイトル・本文2行） */
export function guidePages(env = {}) {
  const drag = env.touch ? '指で引っ張る' : 'マウスで引っ張る';
  const hand = env.land ? 'スマホを横にしている時は、手札の欄をタップすると開きます。' : env.touch ? '手札は、上に払うと開いて、下に払うとしまえます。' : '';
  return [
    { icon: '🃏', title: '置く', lines: [`手札のカードを押して選び、置きたいマスへ${drag}。`, '横に払うと「召喚⇔セット」「発動⇔セット」が切りかわり、下に払うとやめます。'] },
    { icon: '⚔️', title: '攻撃', lines: [`自分のモンスターを、相手のモンスター（いなければ相手の帯）へ${drag}。`, '引っ張っている間、勝ち負けの見込みが出ます。'] },
    { icon: '✨', title: '発動・効果を見る', lines: ['カードを2回押すと効果が読めます。光っているカードは、今発動できます。', '相手が発動した時は「対抗して発動しますか？」と聞かれます。✋「次は聞いて」で、次は必ず聞きます。'] },
    { icon: '⏭️', title: 'フェイズを進める', lines: ['下の大きいボタン（バトルへ・エンドへ）で次へ。上の帯のフェイズを押しても移れます。', 'ターンを終える「エンド」は、押し間違えないように2回押しです。'] },
    { icon: '↶', title: 'ひとつ戻す・記録', lines: ['「↶ ひとつ戻す」で、自分の操作を1つずつ戻せます（戻した勝ちは実績に数えません）。', '「記録」でここまでの流れ、墓地・除外・EXデッキの枠を押すと中身が見られます。'] },
    { icon: '☰', title: 'メニュー', lines: ['発動の聞き方・演出・CPUの速さの設定、降参、新しいデュエル、この操作ガイドがあります。', hand || 'カード名に下線がある時は、押すと公式Q&Aが読めます。'] },
  ];
}

const escH = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

/** i 枚目の中身（窓の中に入れる HTML） */
export function guideHtml(i, env = {}) {
  const pages = guidePages(env), n = pages.length, k = Math.max(0, Math.min(n - 1, i)), p = pages[k];
  return `<div class="gd-card" data-gd-page="${k}"><div class="gd-icon" aria-hidden="true">${escH(p.icon)}</div><h3 class="gd-title">${escH(p.title)}</h3>`
    + p.lines.map(l => `<p class="gd-line">${escH(l)}</p>`).join('') + '</div>'
    + `<div class="gd-dots" aria-label="${k + 1} / ${n}">${pages.map((_, j) => `<i class="${j === k ? 'on' : ''}"></i>`).join('')}</div>`
    + `<div class="gd-btns"><button type="button" class="btn ghost" data-gd="close">とじる</button>`
    + (k > 0 ? `<button type="button" class="btn ghost" data-gd="prev">← もどる</button>` : '')
    + (k < n - 1 ? `<button type="button" class="btn primary" data-gd="next">次へ →</button>` : `<button type="button" class="btn primary" data-gd="close">はじめる</button>`) + '</div>';
}
