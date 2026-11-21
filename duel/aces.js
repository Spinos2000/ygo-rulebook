// 切り札の演出の数え方（画面だけで使う）。どのカードが切り札かは、MEMEの判定（src/ai/aces.ts の aceInfo）で決める

/**
 * 大きい演出を出すかどうか：同じ1枚（uid）が、この対戦で初めて場に出た時だけ。
 * 同じ名前の別のカードは uid が違うので、それぞれ初めての時に大きく出る。予備の判定は大きくしない。
 * seen は対戦ごとに作り直す Set。呼ぶと seen に記録する
 */
export function firstEntrance(seen, uid, fallback) {
  const first = !seen.has(uid);
  seen.add(uid);
  return first && !fallback;
}
