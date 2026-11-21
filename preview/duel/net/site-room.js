// サイトの部屋（電卓のリンク対戦と同じ Firestore の rooms/{部屋}/peers/{自分}）を、DuelLink にそのまま渡すつなぎの部品
// - サイト（rules-page/repo/index.html・preview/index.html）の room() は { join(name) → Promise<{ presence, onPeers, leave }> } の形。
//   presence(p) は自分の欄に { p, updatedAt } を書き、onPeers は { uid, isMe, presence: p, updatedAt } の一覧を返す（6時間より古い欄は出さない）。
//   これは src/net/duel-link.ts の Room と同じ形なので、そのまま使える
// - 部屋の名前は、電卓の部屋（キー番号そのまま／ygo2-…）とぶつからないように「ygo-duel-キー番号」にする
// - Firestore への書きこみの回数を数えられるようにしておく（countingRoom）
                                           

/** サイトの room() が返すもの（画面から mountDuel に渡してもらう） */
                                                                  

/** 対戦の部屋の名前（4桁のキー番号から） */
export function duelRoomName(key        )         {
  if (!/^\d{4}$/.test(key)) throw new Error('キー番号は4桁の数字です');
  return 'ygo-duel-' + key;
}

/** サイトの部屋に入る */
export function joinSiteRoom(api             , key        )                {
  return api.join(duelRoomName(key));
}

/** 書きこみの回数を数える部屋（測る用・画面で回数を見たい時用） */
export function countingRoom(room      )                                           {
  const r = {
    writes: 0,
    bytes: 0,
    presence: (p         ) => { r.writes++; r.bytes = JSON.stringify(p ?? {}).length; return room.presence(p); },
    onPeers: room.onPeers.bind(room),
    leave: room.leave.bind(room),
  };
  return r;
}
