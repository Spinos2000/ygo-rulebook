// プレイヤーの呼び名と、エンジンが作った文の言い換え（画面に出す言葉だけ。ルールの処理には関係ない）
// エンジンの文は「P1」「P2」でプレイヤーを書くので、CPU対戦では画面に出す前に「あなた」「CPU」に置きかえる。
// 置きかえはすべてこのファイルの関数を通す（記録・勝ち負けの理由・結果の欄・「できません」の知らせ）。

/** プレイヤーの呼び名：CPU対戦では「あなた」（P1）と「CPU」（P2） */
export const playerName = (p, cpu) => (cpu ? (p === 0 ? 'あなた' : 'CPU') : `P${p + 1}`);

/** 勝ち負けの短い言葉：CPU対戦では「あなたの勝ち／あなたの負け」、2人対戦では「P1の勝利」 */
export const resultText = (winner, cpu) => (winner === 'draw' ? '引き分け' : cpu ? (winner === 0 ? 'あなたの勝ち' : 'あなたの負け') : `${playerName(winner, false)}の勝利`);

/** 相手の呼び方：CPU対戦では「CPU」、2人対戦では「相手」 */
export const oppWord = cpu => (cpu ? 'CPU' : '相手');

/** エンジンが作った文の中の「P1」「P2」を、画面に出す呼び名に置きかえる */
export const whoText = (text, cpu) => {
  const t = String(text ?? '');
  return cpu ? t.replace(/P([12])(?!\d)/g, (_, n) => playerName(Number(n) - 1, true)) : t;
};
