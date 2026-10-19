# ygo-rulebook 作業メモ

- 本番は `index.html`、試作は `preview/index.html`（https://spinos2000.github.io/ygo-rulebook/preview/）。
- 変更はまず `preview/index.html` で作り、ユーザーがOKしたら `index.html` にコピーして本番へ。
- 本番に出すときは、`AUTO_LOG` 配列（更新履歴のスクリプト内）に1件追加する。id は `auto-日付-内容`、createdAt は公開時刻（ms）。これで更新履歴とお知らせに自動で載る。
- デザイン：アカデミアの3寮カラー（淡いトーン）×アメコミ風。明朝体は使わない。太字・見出しは Zen Maru Gothic、本文は M PLUS Rounded 1c、英数字は Fredoka。真っ黒・原色は使わない。
- Firestore のルールは `firestore.rules`。変更したらユーザーにFirebaseコンソールで「公開」してもらう。
