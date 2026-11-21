// 辞書：カードの公式Q&A（MASTERの決定。中身は MIMI の src/data/rulings.ts の RULINGS）を、画面で読むための小さい部品。
// 開く場所は3つ：記録のカード名・盤面のカード（説明の欄のボタン）・説明の欄。自動で出す表示は作らない。

const escH = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

/** カードの番号 → そのカードの公式Q&A（{ id, title, question, answer } の並び。番号の小さい順）。無ければ空 */
export function rulingsFor(R, code) {
  const ids = (R && R.cards && R.cards[code]) || [];
  return ids.map(id => (R.items[id] ? { id, ...R.items[id] } : null)).filter(Boolean);
}

/** カード名 → 公式Q&Aのあるカードの番号（記録の「」の中の名前から開くため）。同じ名前が複数あれば、Q&Aのある方 */
export function nameIndex(R, pool) {
  const idx = {};
  for (const code of Object.keys((R && R.cards) || {})) { const d = pool[code]; if (d && d.name && !idx[d.name]) idx[d.name] = code; }
  return idx;
}

/** 記録の文（もう HTML 用に書き換え済み）の「カード名」のうち、公式Q&Aのあるものを押せるボタンにする */
export function linkNames(escapedText, idx) {
  return escapedText.replace(/「([^」]+)」/g, (m, name) => {
    const code = idx[name] || idx[name.replace(/&amp;/g, '&')];
    return code ? `<button type="button" class="rul-name" data-rul="${escH(code)}" title="公式Q&Aを見る">「${name}」</button>` : m;
  });
}

/** 辞書の窓の中身：カード名の見出し・件数・Q&Aの一覧（質問の短い文を押すと、質問の全文と公式の答えが開く） */
export function rulingsHtml(name, list) {
  const items = list.map(r => `<details class="rul-it"><summary><span class="rul-t">${escH(r.title)}</span><small class="rul-id">公式Q&amp;A［${escH(r.id)}］</small></summary>`
    + (r.question && r.question !== r.title ? `<p class="rul-q"><b>Q.</b> ${escH(r.question)}</p>` : '')
    + `<p class="rul-a"><b>A.</b> ${escH(r.answer)}</p></details>`).join('');
  return `<div class="box-head"><h3>📖 「${escH(name)}」の公式Q&amp;A<small>（${list.length}件）</small></h3><button type="button" class="btn small ghost" id="rulClose">閉じる</button></div>`
    + `<p class="menu-note">質問を押すと、公式の答えが開きます。</p><div class="rul-list">${items}</div>`;
}
