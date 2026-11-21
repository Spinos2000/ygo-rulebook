// 対戦画面を、ほかのページの中の要素（host）に入れる。Shadow DOM を使うので、置き場所のページのスタイルや id とぶつからない
import { CSS, MARKUP } from './duel-ui.js?v=20261121-1532-90aa64e789';
import { boot, resume } from './app.js?v=20261121-1532-90aa64e789';

let mounted = null;
/** host の中に対戦画面を作る（2回目以降は、止めていたCPUの手番を再開するだけ） */
export function mountDuel(host, opts = {}) {
  if (mounted === host) { resume(); return; }
  const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${CSS}</style>${MARKUP}`;
  mounted = host;
  boot(root, opts);
}
