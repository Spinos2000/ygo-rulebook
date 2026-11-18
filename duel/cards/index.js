// カード効果（最新エラッタ後のテキストと公式データベースの補足情報に基づく）
                                                                       
                                                    
import {
  defOf, nameOf, opp, choose, chooseOne, monstersOf, allMonsters, spellTrapsOf, fieldCards, isFaceUpMonster, isMonsterZone,
  canSpecialSummon, specialSummon, sendToGy, addToHand, destroy, release, payLp, equipCard, equippedBySelf, linkCards,
  negateActivation, negateSummon, targetValid, addLingering, newStep, log, pl, currentAtk, FIELD_ZONES, sameCard,
  placeCounters, scriptOf, removeCounters, counterHolders, counterRoom, addStatMod, drawCards, gainLp, effectDamage, negateAttack,
  banish, isOnField, isImmune, emit, millTop, randomOf, freeMZones,
} from '../engine/game.js';
                                                              
import {
  target, countDragons, ritualCan, ritualSummon, fusionCan, fusionSummon, isNormal, isRitualMonster, level, deckOf, handOf, gyOf, oppMonsters,
  deckMaterialSet, sendDeckMaterials,
} from './common.js';
                                              

/* ---------- サクリファイス系：相手モンスターを装備する ---------- */
function equipEnemyEffect(id        , label        )               {
  return {
    id, label, type: 'ignition', ss: 1, opt: 'card',
    // 「１体のみ装備可能」：既にこの効果で装備している間は発動できない
    can: x => equippedBySelf(x.s, x.self) === null && oppMonsters(x).length > 0,
    activate: x => { target(x, '装備する相手モンスターを選んでください', oppMonsters(x)); },
    resolve: x => {
      const s = x.s, link = x.link ;
      if (!targetValid(s, link)) return;
      const t = link.targets[0];
      if (!isMonsterZone(s.cards[t]) || s.cards[t].controller === x.player) return;
      // 処理時にこのカードがモンスターゾーンに表側表示で存在しない場合、対象は墓地へ送られる（効果で墓地へ送られた扱いにはならない）
      if (!isFaceUpMonster(s, x.self) || !sameCard(s, x.self, link.serial)) { sendToGy(s, [t], 'rule'); return; }
      if (equippedBySelf(s, x.self) !== null) { sendToGy(s, [t], 'rule'); return; }
      const faceUp = s.cards[t].faceUp; // 裏側守備表示なら裏側のまま装備
      if (!equipCard(s, t, x.self, { by: x.self, faceUp })) { sendToGy(s, [t], 'rule'); return; }
      log(s, `${faceUp ? nameOf(s, t) : '裏側のモンスター'}を${nameOf(s, x.self)}に装備`);
    },
  };
}
const equipStats = (s           , self        ) => {
  const e = equippedBySelf(s, self);
  if (e === null) return null;
  if (!s.cards[e].faceUp) return { atk: 0, def: 0 };
  const d = defOf(s, e);
  return { atk: d.atk ?? 0, def: d.def ?? 0 };
};

/* ---------- 共通の条件 ---------- */
const gyNormals = (x     ) => gyOf(x.s, x.player).filter(u => isNormal(x.s, u) && canSpecialSummon(x.s, u, x.player));
const ownFaceUpNormalsOnField = (x     ) => monstersOf(x.s, x.player).filter(u => isFaceUpMonster(x.s, u) && isNormal(x.s, u));
const leftFieldTo = (ev                                               , self        ) => ev.type === 'toGy' && ev.uid === self && FIELD_ZONES.includes(ev.from         );

export const SCRIPTS                             = {
  /* サクリファイス */
  '4737': {
    effects: [equipEnemyEffect('e1', '①：相手モンスター1体を装備する')],
    statSet: equipStats,
    battleReplace: (s, self) => equippedBySelf(s, self),
    reflectBattleDamage: (s, self) => equippedBySelf(s, self) !== null,
  },
  /* サウザンド・アイズ・サクリファイス */
  '4740': {
    fusionMaterials: ['サクリファイス', '千眼の邪教神'],
    effects: [equipEnemyEffect('e2', '②：相手モンスター1体を装備する')],
    forbidsAttack: () => true,
    forbidsPositionChange: () => true,
    statSet: equipStats,
    battleReplace: (s, self) => equippedBySelf(s, self),
  },
  /* バスター・ブレイダー */
  '4983': {
    statAdd: (s, self) => { const n = countDragons(s, [opp(s.cards[self].controller)]) * 500; return { atk: n, def: 0 }; },
  },
  /* 超魔導剣士－ブラック・パラディン */
  '5628': {
    fusionOnly: true,
    fusionMaterials: ['ブラック・マジシャン', 'バスター・ブレイダー'],
    statAdd: s => ({ atk: countDragons(s, [0, 1]) * 500, def: 0 }),
    effects: [{
      id: 'e2', label: '②：手札を1枚捨て、魔法カードの発動を無効にし破壊', type: 'quick', ss: 2, damageStep: true,
      can: x => {
        const top = x.s.chain[x.s.chain.length - 1];
        return !!top && top.cardActivation && top.cardKind === 'spell' && !top.negated && x.s.players[x.player].hand.length > 0;
      },
      activate: x => {
        const s = x.s;
        x.link .data.index = s.chain.length - 1;
        const c = chooseOne(x, '捨てる手札を選んでください（コスト）', handOf(s, x.player)) ;
        log(s, `${pl(x.player)}：${nameOf(s, c)}を捨てる`);
        sendToGy(s, [c], 'discard'); // コストで捨てる（効果で捨てた扱い）
      },
      resolve: x => {
        // 処理時にこのカードがモンスターゾーンに表側表示で存在しない場合は適用されない
        if (!isFaceUpMonster(x.s, x.self) || !sameCard(x.s, x.self, x.link .serial)) return;
        negateActivation(x.s, x.s.chain[x.link .data.index          ]);
      },
    }],
  },
  /* 黒き森のウィッチ */
  '4580': {
    effects: [{
      id: 'e1', label: '①：守備力1500以下のモンスターを手札に加える', type: 'trigger', ss: 1, opt: 'name', zones: ['gy'], damageStep: true,
      trigger: { mandatory: true, when: false, match: (s, self, ev) => leftFieldTo(ev, self) && s.cards[self].zone === 'gy' },
      resolve: x => {
        const s = x.s;
        const opts = deckOf(s, x.player).filter(u => defOf(s, u).kind === 'monster' && (defOf(s, u).def ?? 0) <= 1500);
        const u = chooseOne(x, 'デッキから手札に加えるモンスターを選んでください', opts);
        if (u === null) return;
        addToHand(s, [u]);
        // このターン、この効果で手札に加えたカード及びその同名カードの効果を発動できない
        addLingering(s, { type: 'noActivateName', player: x.player, name: defOf(s, u).name, turn: s.turn });
      },
    }],
  },
  /* 熟練の黒魔術師 */
  '5649': {
    counterMax: () => 3,
    onSpellResolved: (s, self) => { if (isFaceUpMonster(s, self)) placeCounters(s, self, 1); },
    effects: [{
      id: 'e2', label: '②：このカードをリリースし「ブラック・マジシャン」を特殊召喚', type: 'ignition', ss: 1,
      can: x => {
        const s = x.s;
        if ((s.cards[x.self].counters.magic ?? 0) < 3) return false;
        const p = x.player;
        return [...handOf(s, p), ...deckOf(s, p), ...gyOf(s, p)].some(u => defOf(s, u).name === 'ブラック・マジシャン' && canSpecialSummon(s, u, p, 'special', [x.self]));
      },
      activate: x => { release(x.s, [x.self], 'cost'); },
      resolve: x => {
        const s = x.s, p = x.player;
        const opts = [...handOf(s, p), ...deckOf(s, p), ...gyOf(s, p)].filter(u => defOf(s, u).name === 'ブラック・マジシャン' && canSpecialSummon(s, u, p));
        const u = chooseOne(x, '特殊召喚する「ブラック・マジシャン」を選んでください（手札・デッキ・墓地）', opts);
        if (u !== null) specialSummon(x, [u]);
      },
    }],
  },
  /* マンジュ・ゴッド */
  '5900': {
    effects: [{
      id: 'e1', label: '①：儀式モンスターか儀式魔法を手札に加える', type: 'trigger', ss: 1,
      trigger: { mandatory: false, when: true, match: (s, self, ev) => ev.type === 'summoned' && ev.uid === self && ['normal', 'advance', 'flip'].includes(ev.how) },
      resolve: x => {
        const s = x.s;
        const opts = deckOf(s, x.player).filter(u => isRitualMonster(s, u) || (defOf(s, u).kind === 'spell' && defOf(s, u).subtype === '儀式'));
        const u = chooseOne(x, 'デッキから手札に加えるカードを選んでください', opts);
        if (u !== null) addToHand(s, [u]);
      },
    }],
  },
  /* イリュージョンの儀式 */
  '4802': {
    effects: [ritualSpell({ monsters: ['サクリファイス'], mode: 'atLeast', target: () => 1, materials: 'handField' })],
  },
  /* カオス－黒魔術の儀式 */
  '4727': {
    effects: [ritualSpell({ monsters: ['マジシャン・オブ・ブラックカオス'], mode: 'atLeast', target: () => 8, materials: 'handField' })],
  },
  /* 高等儀式術 */
  '6996': {
    effects: [ritualSpell({ monsters: null, mode: 'equal', target: (s, m) => level(s, m), materials: 'deckNormal' })],
  },
  /* 融合 */
  '4837': {
    effects: [{ id: 'e1', label: '融合召喚する', type: 'card', ss: 1, can: fusionCan, resolve: fusionSummon }],
  },
  /* 千本ナイフ */
  '5166': {
    effects: [{
      id: 'e1', label: '相手モンスター1体を破壊', type: 'card', ss: 1,
      can: x => fieldCards(x.s, x.player).some(u => x.s.cards[u].faceUp && defOf(x.s, u).name === 'ブラック・マジシャン') && oppMonsters(x).length > 0,
      activate: x => { target(x, '破壊する相手モンスターを選んでください', oppMonsters(x)); },
      resolve: x => {
        const s = x.s, t = x.link .targets[0];
        // 処理時に対象のコントロールが自分に移っている場合は適用されない
        if (targetValid(s, x.link ) && isMonsterZone(s.cards[t]) && s.cards[t].controller !== x.player) destroy(s, [t], 'effect');
      },
    }],
  },
  /* 闇の量産工場 */
  '6129': {
    effects: [{
      id: 'e1', label: '墓地の通常モンスター2体を手札に加える', type: 'card', ss: 1,
      can: x => gyOf(x.s, x.player).filter(u => isNormal(x.s, u)).length >= 2,
      activate: x => {
        const t = choose(x, { kind: 'cards', prompt: '手札に加える通常モンスターを2体選んでください', options: gyOf(x.s, x.player).filter(u => isNormal(x.s, u)), min: 2, max: 2 });
        x.link .targets.push(...t);
      },
      resolve: x => {
        const ok = x.link .targets.filter((t, i) => targetValid(x.s, x.link , i) && x.s.cards[t].zone === 'gy');
        if (ok.length) addToHand(x.s, ok);
      },
    }],
  },
  /* 古のルール */
  '6995': {
    effects: [{
      id: 'e1', label: '手札からレベル5以上の通常モンスターを特殊召喚', type: 'card', ss: 1,
      can: x => handOf(x.s, x.player).some(u => isNormal(x.s, u) && level(x.s, u) >= 5 && canSpecialSummon(x.s, u, x.player)),
      resolve: x => {
        const u = chooseOne(x, '特殊召喚するモンスターを選んでください', handOf(x.s, x.player).filter(u => isNormal(x.s, u) && level(x.s, u) >= 5 && canSpecialSummon(x.s, u, x.player)));
        if (u !== null) specialSummon(x, [u]);
      },
    }],
  },
  /* 死者蘇生 */
  '4842': {
    effects: [{
      id: 'e1', label: '墓地のモンスター1体を特殊召喚', type: 'card', ss: 1,
      can: x => [...gyOf(x.s, 0), ...gyOf(x.s, 1)].some(u => canSpecialSummon(x.s, u, x.player)),
      activate: x => { target(x, '特殊召喚するモンスターを選んでください（自分か相手の墓地）', [...gyOf(x.s, 0), ...gyOf(x.s, 1)].filter(u => canSpecialSummon(x.s, u, x.player))); },
      resolve: x => { const t = x.link .targets[0]; if (targetValid(x.s, x.link ) && x.s.cards[t].zone === 'gy') specialSummon(x, [t]); },
    }],
  },
  /* ハーピィの羽根帚 */
  '4678': {
    effects: [{
      id: 'e1', label: '相手フィールドの魔法・罠カードを全て破壊', type: 'card', ss: 1,
      can: x => spellTrapsOf(x.s, opp(x.player)).length > 0,
      resolve: x => { destroy(x.s, spellTrapsOf(x.s, opp(x.player)), 'effect'); },
    }],
  },
  /* ディメンション・マジック */
  '5752': {
    effects: [{
      id: 'e1', label: '自分のモンスターをリリースし、手札の魔法使い族を特殊召喚', type: 'card', ss: 2,
      can: x => {
        const s = x.s, p = x.player;
        if (!monstersOf(s, p).some(u => isFaceUpMonster(s, u) && defOf(s, u).race === '魔法使い族')) return false;
        return monstersOf(s, p).some(t => handOf(s, p).some(h => defOf(s, h).race === '魔法使い族' && canSpecialSummon(s, h, p, 'special', [t])));
      },
      activate: x => { target(x, 'リリースする自分のモンスターを選んでください', monstersOf(x.s, x.player)); },
      resolve: x => {
        const s = x.s, p = x.player, t = x.link .targets[0];
        if (!targetValid(s, x.link ) || !isMonsterZone(s.cards[t]) || s.cards[t].controller !== p) return;
        release(s, [t], 'release');
        // リリースと特殊召喚は同時に行われる扱い
        const u = chooseOne(x, '手札から特殊召喚する魔法使い族モンスターを選んでください', handOf(s, p).filter(h => defOf(s, h).race === '魔法使い族' && canSpecialSummon(s, h, p)));
        if (u === null) return;
        if (!specialSummon(x, [u]).length) return;
        const all = allMonsters(s);
        if (all.length && choose(x, { kind: 'yesno', prompt: 'フィールドのモンスター1体を破壊しますか？' })) {
          newStep(s); // その後（特殊召喚と破壊は同時に行われない）
          const d = chooseOne(x, '破壊するモンスターを選んでください', all) ;
          destroy(s, [d], 'effect');
        }
      },
    }],
  },
  /* 早すぎた埋葬 */
  '4966': {
    effects: [{
      id: 'e1', label: '800LPを払い、墓地のモンスターを特殊召喚して装備', type: 'card', ss: 1,
      can: x => x.s.players[x.player].lp >= 800 && gyOf(x.s, x.player).some(u => canSpecialSummon(x.s, u, x.player)),
      activate: x => {
        payLp(x.s, x.player, 800);
        target(x, '特殊召喚するモンスターを選んでください', gyOf(x.s, x.player).filter(u => canSpecialSummon(x.s, u, x.player)));
      },
      resolve: x => {
        const s = x.s, t = x.link .targets[0];
        if (!targetValid(s, x.link ) || s.cards[t].zone !== 'gy') return;
        if (!sameCard(s, x.self, x.link .serial)) return;
        if (specialSummon(x, [t], { position: 'atk' }).length) equipCard(s, x.self, t);
      },
    }],
    // このカードが破壊される時にそのモンスターは破壊される（装備モンスターが裏側表示になったことによる破壊では、モンスターは残る）
    onDestroyed: (s, before, reason) => {
      if (reason === 'rule' || before.equippedTo === null) return;
      if (sameCard(s, before.equippedTo, before.equipSerial ) && isMonsterZone(s.cards[before.equippedTo])) destroy(s, [before.equippedTo], 'effect');
    },
  },
  /* 思い出のブランコ */
  '7256': {
    effects: [{
      id: 'e1', label: '墓地の通常モンスターを特殊召喚（エンドフェイズに破壊）', type: 'card', ss: 1,
      can: x => gyNormals(x).length > 0,
      activate: x => { target(x, '特殊召喚する通常モンスターを選んでください', gyNormals(x)); },
      resolve: x => {
        const s = x.s, t = x.link .targets[0];
        if (!targetValid(s, x.link ) || s.cards[t].zone !== 'gy') return;
        if (specialSummon(x, [t]).length) addLingering(s, { type: 'destroyAtEnd', uid: t, serial: s.cards[t].serial, turn: s.turn });
      },
    }],
  },
  /* 黙する死者 */
  '5367': {
    effects: [{
      id: 'e1', label: '墓地の通常モンスターを守備表示で特殊召喚', type: 'card', ss: 1,
      can: x => gyNormals(x).length > 0,
      activate: x => { target(x, '特殊召喚する通常モンスターを選んでください', gyNormals(x)); },
      resolve: x => {
        const s = x.s, t = x.link .targets[0];
        if (!targetValid(s, x.link ) || s.cards[t].zone !== 'gy') return;
        if (specialSummon(x, [t], { position: 'def' }).length) s.cards[t].noAttack = true;
      },
    }],
  },
  /* 召喚師のスキル */
  '7220': {
    effects: [{
      id: 'e1', label: 'デッキからレベル5以上の通常モンスターを手札に加える', type: 'card', ss: 1,
      can: x => deckOf(x.s, x.player).some(u => isNormal(x.s, u) && level(x.s, u) >= 5),
      resolve: x => {
        const u = chooseOne(x, '手札に加えるモンスターを選んでください', deckOf(x.s, x.player).filter(u => isNormal(x.s, u) && level(x.s, u) >= 5));
        if (u !== null) addToHand(x.s, [u]);
      },
    }],
  },
  /* 苦渋の決断 */
  '12009': {
    effects: [{
      id: 'e1', label: 'デッキの通常モンスターを墓地へ送り、同名モンスターを手札に加える', type: 'card', ss: 1, hardOpt: true,
      can: x => pairsInDeck(x).length > 0,
      resolve: x => {
        const s = x.s;
        const g = chooseOne(x, '墓地へ送るレベル4以下の通常モンスターを選んでください', pairsInDeck(x));
        if (g === null) return;
        const same = deckOf(s, x.player).filter(u => u !== g && defOf(s, u).name === defOf(s, g).name);
        sendToGy(s, [g], 'effect');
        addToHand(s, [same[0]]);
      },
    }],
  },
  /* 予想GUY */
  '11740': {
    effects: [{
      id: 'e1', label: 'デッキからレベル4以下の通常モンスターを特殊召喚', type: 'card', ss: 1,
      can: x => monstersOf(x.s, x.player).length === 0 && deckOf(x.s, x.player).some(u => isNormal(x.s, u) && level(x.s, u) <= 4 && canSpecialSummon(x.s, u, x.player)),
      resolve: x => {
        const u = chooseOne(x, '特殊召喚するモンスターを選んでください', deckOf(x.s, x.player).filter(u => isNormal(x.s, u) && level(x.s, u) <= 4 && canSpecialSummon(x.s, u, x.player)));
        if (u !== null) specialSummon(x, [u]);
      },
    }],
  },
  /* 戦線復活の代償 */
  '7223': {
    effects: [{
      id: 'e1', label: '通常モンスターを墓地へ送り、墓地のモンスターを特殊召喚して装備', type: 'card', ss: 1,
      // 対象に選べるモンスターが墓地に存在する状況でなければ発動できない（コストで墓地へ送ったモンスターも対象に選べる）
      can: x => ownFaceUpNormalsOnField(x).length > 0 && [...gyOf(x.s, 0), ...gyOf(x.s, 1)].some(u => canSpecialSummon(x.s, u, x.player, 'special', ownFaceUpNormalsOnField(x))),
      activate: x => {
        const s = x.s;
        const cost = chooseOne(x, '墓地へ送る自分フィールドの通常モンスターを選んでください（コスト）', ownFaceUpNormalsOnField(x)) ;
        sendToGy(s, [cost], 'cost');
        target(x, '特殊召喚するモンスターを選んでください（自分か相手の墓地）', [...gyOf(s, 0), ...gyOf(s, 1)].filter(u => canSpecialSummon(s, u, x.player)));
      },
      resolve: x => {
        const s = x.s, t = x.link .targets[0];
        if (!targetValid(s, x.link ) || s.cards[t].zone !== 'gy') return;
        if (!sameCard(s, x.self, x.link .serial)) return;
        if (specialSummon(x, [t]).length) equipCard(s, x.self, t);
      },
    }],
    // このカードがフィールド上から離れた時、装備モンスターを破壊する
    onLeaveField: (s, before) => {
      if (before.equippedTo === null) return;
      if (sameCard(s, before.equippedTo, before.equipSerial ) && isMonsterZone(s.cards[before.equippedTo])) destroy(s, [before.equippedTo], 'effect');
    },
  },
  /* 聖なるバリア －ミラーフォース－ */
  '4887': {
    effects: [{
      id: 'e1', label: '相手の攻撃表示モンスターを全て破壊', type: 'card', ss: 2,
      // 相手フィールドに攻撃表示モンスターが存在しなければ発動できない（公式Q&A：超重武者ビッグベン－K）
      can: x => !!x.s.battle && x.s.battle.step === 'declared' && x.s.cards[x.s.battle.attacker].controller === opp(x.player) && oppAtkMonsters(x).length > 0,
      resolve: x => { destroy(x.s, oppAtkMonsters(x), 'effect'); },
    }],
  },
  /* 奈落の落とし穴 */
  '5400': {
    effects: [{
      id: 'e1', label: '召喚・特殊召喚された攻撃力1500以上のモンスターを破壊し除外', type: 'card', ss: 2,
      can: x => bottomlessTargets(x).length > 0,
      activate: x => {
        const t = bottomlessTargets(x);
        x.link .data.uids = t;
        x.link .data.serials = t.map(u => x.s.cards[u].serial);
      },
      resolve: x => {
        const s = x.s;
        const uids = x.link .data.uids            , serials = x.link .data.serials            ;
        const list = uids.filter((u, i) => sameCard(s, u, serials[i]) && isFaceUpMonster(s, u) && currentAtk(s, u) >= 1500);
        if (list.length) destroy(s, list, 'effect', { banish: true });
      },
    }],
  },
  /* 正統なる血統 */
  '7013': {
    destroyWhenLinkLeaves: true,
    effects: [{
      id: 'e1', label: '墓地の通常モンスターを攻撃表示で特殊召喚', type: 'card', ss: 2,
      can: x => gyNormals(x).length > 0,
      activate: x => { target(x, '特殊召喚する通常モンスターを選んでください', gyNormals(x)); },
      resolve: x => {
        const s = x.s, t = x.link .targets[0];
        if (!targetValid(s, x.link ) || s.cards[t].zone !== 'gy') return;
        if (!sameCard(s, x.self, x.link .serial)) return;
        if (specialSummon(x, [t], { position: 'atk' }).length) linkCards(s, x.self, t);
      },
    }],
    // このカードがフィールドから離れた時にそのモンスターは破壊される
    onLeaveField: (s, before) => {
      if (before.link === null) return;
      if (sameCard(s, before.link, before.linkSerial ) && isMonsterZone(s.cards[before.link])) destroy(s, [before.link], 'effect');
    },
  },
  /* 神の宣告 */
  '4861': {
    effects: [{
      id: 'e1', label: 'LPを半分払い、発動または召喚を無効にし破壊', type: 'card', ss: 3, damageStep: true, summonWindow: true,
      can: x => judgmentModes(x).length > 0,
      activate: x => {
        const s = x.s;
        const modes = judgmentModes(x);
        const m = modes.length > 1 ? modes[choose(x, { kind: 'option', prompt: 'どちらの効果を発動しますか？', options: modes.map(v => v === 1 ? '魔法・罠の発動を無効' : '召喚を無効') })] : modes[0];
        // 払った後のLPは半分（端数切り上げ）＝払う量は切り捨て。LP1なら払う量0でLP1のまま（通説。公式の一次資料は未確認）
        payLp(s, x.player, Math.floor(s.players[x.player].lp / 2));
        if (m === 1) x.link .data = { mode: 1, index: s.chain.length - 1 };
        else {
          const w = s.window;
          if (w.kind !== 'priority' || w.cont.type !== 'summon') throw new Error('召喚する際ではありません');
          x.link .data = { mode: 2, uid: w.cont.uid, serial: s.cards[w.cont.uid].serial, how: w.cont.how };
        }
      },
      resolve: x => {
        const s = x.s, d = x.link .data;
        if (d.mode === 1) negateActivation(s, s.chain[d.index          ]);
        else if (sameCard(s, d.uid          , d.serial          ) && s.cards[d.uid          ].summoning) negateSummon(s, d.uid          , d.how                                 );
      },
    }],
  },

  /* ================= デッキ 5m2qcka（遊戯デッキ）で追加 ================= */
  /* サイレント・マジシャン LV４ */
  '6167': {
    levelUpTo: '6170',
    counterMax: () => 5,
    // ①：相手がドローする度に魔力カウンターを1つ（1つの処理で複数枚ドローしても1つ）
    onDraw: (s, self, drawer) => { if (isFaceUpMonster(s, self) && drawer !== s.cards[self].controller) placeCounters(s, self, 1); },
    // ②：攻撃力は魔力カウンターの数×500アップ
    statAdd: (s, self) => ({ atk: (s.cards[self].counters.magic ?? 0) * 500, def: 0 }),
    effects: [{
      id: 'e3', label: '③：このカードを墓地へ送り「サイレント・マジシャン LV８」を特殊召喚', type: 'trigger', ss: 1,
      trigger: { mandatory: false, when: false, match: (s, self, ev) => ev.type === 'phase' && ev.phase === 'standby' && ev.player === s.cards[self].controller && isFaceUpMonster(s, self) && lv4Ready(s, self) },
      can: x => lv4Ready(x.s, x.self) && levelTargets(x.s, x.player, '6170', [x.self], x.self).length > 0,
      activate: x => { sendToGy(x.s, [x.self], 'cost'); },
      resolve: x => {
        const u = chooseOne(x, '特殊召喚する「サイレント・マジシャン LV８」を選んでください（手札・デッキ）', levelTargets(x.s, x.player, '6170', [], x.self));
        if (u !== null) specialSummon(x, [u]);
      },
    }],
  },
  /* サイレント・マジシャン LV８ */
  '6170': {
    cannotNormalSummon: true,
    // 「サイレント・マジシャン LV４」の効果でのみ特殊召喚できる（一度出た後も、他のカードの効果では特殊召喚できない）
    specialSummonOk: (s, _self, _how, src) => src !== null && s.cards[src]?.code === '6167',
    properSpecial: () => true,
    // ①：相手の魔法カードの効果を受けない
    immuneTo: (s, self, src) => src.kind === 'spell' && src.player !== s.cards[self].controller,
  },
  /* オシリスの天空竜 */
  '4999': {
    tributes: 3, cannotSet: true, summonUnnegatable: true, summonLock: true,
    // ③：攻撃力・守備力は自分の手札の数×1000アップ
    statAdd: (s, self) => { const n = s.players[s.cards[self].controller].hand.length * 1000; return { atk: n, def: n }; },
    effects: [{
      id: 'e4', label: '④：攻撃表示で召喚・特殊召喚された相手モンスターの攻撃力を2000ダウン', type: 'trigger', ss: 1, damageStep: true,
      // 既にモンスターゾーンに表側表示で存在する状態で、相手モンスターが出た場合だけ（同時に特殊召喚された場合は発動しない：公式Q&A [12153]）
      trigger: { mandatory: true, when: false, match: (s, self, ev) => ev.type === 'summoned' && isFaceUpMonster(s, self) && (s.cards[self].enteredStep ?? -1) < ev.step && osirisPrey(s, self, ev.uid) },
      activate: x => {
        // 同時に複数体が召喚・特殊召喚された場合は、攻撃表示の全てに適用する
        const list = x.s.lastEvents.filter(e => e.type === 'summoned').map(e => (e                   ).uid).filter(u => osirisPrey(x.s, x.self, u));
        x.link .data.uids = list; x.link .data.serials = list.map(u => x.s.cards[u].serial);
      },
      resolve: x => {
        const s = x.s, uids = x.link .data.uids            , serials = x.link .data.serials            ;
        for (let i = 0; i < uids.length; i++) {
          const u = uids[i];
          if (!sameCard(s, u, serials[i]) || !isFaceUpMonster(s, u)) continue; // 裏側守備表示になっていれば適用しない
          // コントロールが移っていても適用する（公式Q&A [11907]）
          const before = currentAtk(s, u);
          addStatMod(s, u, -2000, 0);
          log(s, `${nameOf(s, u)}の攻撃力が2000ダウン（${currentAtk(s, u)}）`);
          // この効果で0に「した」場合だけ破壊する。元々0のモンスターは破壊されない（公式Q&A [11912]）
          if (before > 0 && currentAtk(s, u) === 0) destroy(s, [u], 'effect');
        }
      },
    }, {
      id: 'e5', label: '⑤：特殊召喚されている場合、エンドフェイズに墓地へ送る', type: 'trigger', ss: 1,
      trigger: { mandatory: true, when: false, match: (s, self, ev) => ev.type === 'phase' && ev.phase === 'end' && isFaceUpMonster(s, self) && isSpecialSummoned(s, self) },
      resolve: x => { if (sameCard(x.s, x.self, x.link .serial) && isMonsterZone(x.s.cards[x.self])) sendToGy(x.s, [x.self], 'effect'); },
    }],
  },
  /* 破壊竜ガンドラ */
  '6076': {
    specialSummonOk: () => false,
    effects: [{
      id: 'e1', label: '①：LPを半分払い、フィールドの他のカードを全て破壊し除外', type: 'ignition', ss: 1,
      can: x => allFieldCards(x.s).some(u => u !== x.self),
      // 払う量は神の宣告と同じ扱い（払った後のLPが半分の切り上げ）
      activate: x => { payLp(x.s, x.player, Math.floor(x.s.players[x.player].lp / 2)); },
      resolve: x => {
        const s = x.s;
        const done = destroy(s, allFieldCards(s).filter(u => u !== x.self), 'effect', { banish: true });
        if (done.length && sameCard(s, x.self, x.link .serial) && isFaceUpMonster(s, x.self)) {
          addStatMod(s, x.self, done.length * 300, 0);
          log(s, `${nameOf(s, x.self)}の攻撃力が${done.length * 300}アップ`);
        }
      },
    }, {
      id: 'e2', label: '②：召喚・反転召喚したターンのエンドフェイズに墓地へ送る', type: 'trigger', ss: 1,
      trigger: {
        mandatory: true, when: false,
        match: (s, self, ev) => ev.type === 'phase' && ev.phase === 'end' && isFaceUpMonster(s, self) && s.cards[self].summonedTurn === s.turn && ['normal', 'advance', 'flip'].includes(s.cards[self].summonedHow ?? ''),
      },
      resolve: x => { if (sameCard(x.s, x.self, x.link .serial) && isMonsterZone(x.s.cards[x.self])) sendToGy(x.s, [x.self], 'effect'); },
    }],
  },
  /* 見習い魔術師 */
  '5650': {
    effects: [{
      id: 'e1', label: '①：フィールドのカード1枚に魔力カウンターを1つ置く', type: 'trigger', ss: 1, damageStep: true,
      trigger: { mandatory: true, when: false, match: (s, self, ev) => ev.type === 'summoned' && ev.uid === self },
      // 置けるカードが無くても発動する（処理は何もしない）
      activate: x => { const h = counterHolders(x.s); if (h.length) target(x, '魔力カウンターを置くカードを選んでください', h); },
      resolve: x => { if (x.link .targets.length && targetValid(x.s, x.link )) placeCounters(x.s, x.link .targets[0], 1); },
    }, {
      id: 'e2', label: '②：デッキからレベル2以下の魔法使い族を裏側守備表示で特殊召喚', type: 'trigger', ss: 1, damageStep: true, zones: ['gy'],
      trigger: { mandatory: false, when: true, match: (s, self, ev) => ev.type === 'destroyed' && ev.uid === self && ev.reason === 'battle' },
      can: x => apprenticeTargets(x).length > 0,
      resolve: x => {
        const u = chooseOne(x, '裏側守備表示で特殊召喚するモンスターを選んでください', apprenticeTargets(x));
        if (u !== null) specialSummon(x, [u], { position: 'faceDownDef' });
      },
    }],
  },
  /* レベルアップ！ */
  '6133': {
    effects: [{
      id: 'e1', label: '「LV」モンスターを墓地へ送り、記されたモンスターを特殊召喚', type: 'card', ss: 1,
      can: x => levelUpSources(x).length > 0,
      activate: x => {
        const m = chooseOne(x, '墓地へ送る「LV」モンスターを選んでください（コスト）', levelUpSources(x)) ;
        x.link .data.to = scriptOf(x.s, m).levelUpTo;
        sendToGy(x.s, [m], 'cost');
      },
      resolve: x => {
        // 召喚条件を無視して、手札またはデッキから特殊召喚する
        const u = chooseOne(x, '特殊召喚するモンスターを選んでください（手札・デッキ）', levelTargets(x.s, x.player, x.link .data.to          , [], x.self, 'ignore'));
        if (u !== null) specialSummon(x, [u], { how: 'ignore' });
      },
    }],
  },
  /* 魔力掌握 */
  '8136': {
    effects: [{
      id: 'e1', label: '魔力カウンターを1つ置き、「魔力掌握」を手札に加える', type: 'card', ss: 1, hardOpt: true,
      can: x => counterHolders(x.s).length > 0,
      activate: x => { target(x, '魔力カウンターを置くカードを選んでください', counterHolders(x.s)); },
      resolve: x => {
        const s = x.s;
        if (!targetValid(s, x.link )) return;
        // カウンターを置けなかった場合は、「魔力掌握」を手札に加えることもできない（公式Q&A [8204]）
        if (!placeCounters(s, x.link .targets[0], 1)) return;
        const more = deckOf(s, x.player).filter(u => defOf(s, u).name === '魔力掌握');
        if (more.length && choose(x, { kind: 'yesno', prompt: 'デッキから「魔力掌握」を手札に加えますか？' })) {
          newStep(s); // その後（同時ではない）
          addToHand(s, [more[0]]);
        }
      },
    }],
  },
  /* 一時休戦 */
  '9778': {
    effects: [{
      id: 'e1', label: 'お互いに1枚ドローし、次の相手ターン終了時までダメージを0にする', type: 'card', ss: 1,
      resolve: x => {
        const s = x.s;
        drawBoth(s, 1);
        addLingering(s, { type: 'noDamage', turn: s.turn + 1 });
        log(s, '次の相手ターン終了時まで、お互いが受けるダメージは0になる');
      },
    }],
  },
  /* 封印の黄金櫃 */
  '6161': {
    effects: [{
      id: 'e1', label: 'デッキからカード1枚を除外（2回目の自分スタンバイフェイズに手札に加える）', type: 'card', ss: 1,
      can: x => deckOf(x.s, x.player).length > 0,
      resolve: x => {
        const s = x.s;
        const u = chooseOne(x, '除外するカードを選んでください', deckOf(s, x.player));
        if (u === null) return;
        banish(s, [u], 'effect');
        log(s, `${pl(x.player)}：${nameOf(s, u)}を除外`);
        addLingering(s, { type: 'returnAtStandby', player: x.player, uid: u, serial: s.cards[u].serial, turnsLeft: 2, turn: 1e9 });
      },
    }],
  },
  /* チキンレース */
  '11851': {
    // ①：相手よりLPが少ないプレイヤーが受けるダメージは0
    damageZeroFor: (s, _self, p) => s.players[p].lp < s.players[opp(p)].lp,
    effects: [{ id: 'e1', label: '発動する', type: 'card', ss: 1, resolve: () => {} }, {
      id: 'e2', label: '②：1000LPを払い、効果を1つ選んで発動', type: 'ignition', ss: 1, zones: ['fzone'], anyPlayer: true, opt: 'card', chainLock: true,
      can: x => x.s.players[x.player].lp >= 1000,
      activate: x => {
        // デッキが0枚なら「1枚ドローする」は選べない（公式Q&A [15563]）
        const modes = [0, 1, 2].filter(m => m !== 0 || x.s.players[x.player].deck.length > 0);
        const label = ['1枚ドローする', 'このカードを破壊する', '相手は1000LP回復する'];
        const i = choose(x, { kind: 'option', prompt: 'どの効果を発動しますか？', options: modes.map(m => label[m]) });
        payLp(x.s, x.player, 1000);
        x.link .data.mode = modes[i];
      },
      resolve: x => {
        const s = x.s, m = x.link .data.mode          ;
        if (m === 0) drawCards(s, x.player, 1);
        else if (m === 1) { if (sameCard(s, x.self, x.link .serial) && isOnField(s.cards[x.self])) destroy(s, [x.self], 'effect'); }
        else gainLp(s, opp(x.player), 1000);
      },
    }],
  },
  /* 魔法族の里 */
  '7916': {
    blocksSpells: (s, self, p) => {
      const ctrl = s.cards[self].controller;
      const has = (q          ) => monstersOf(s, q).some(u => isFaceUpMonster(s, u) && defOf(s, u).race === '魔法使い族');
      if (p === ctrl) return !has(ctrl);          // ②：自分フィールドに魔法使い族がいなければ、自分は魔法カードを発動できない
      return has(ctrl) && !has(p);                // ①：自分フィールドにのみ魔法使い族がいれば、相手は魔法カードを発動できない
    },
    effects: [{ id: 'e1', label: '発動する', type: 'card', ss: 1, resolve: () => {} }],
  },
  /* 暗黒界の取引 */
  '7002': {
    effects: [{
      id: 'e1', label: 'お互いに1枚ドローし、その後手札を1枚捨てる', type: 'card', ss: 1,
      can: x => x.s.players[0].deck.length > 0 && x.s.players[1].deck.length > 0,
      resolve: x => {
        const s = x.s, tp = s.turnPlayer;
        drawBoth(s, 1);
        newStep(s); // その後
        // ターンプレイヤーから捨て、その内容を見てから相手が捨てる（2枚は同時に捨てた扱い）
        const picks           = [];
        for (const p of [tp, opp(tp)]              ) {
          const u = chooseOne(x, '捨てる手札を1枚選んでください', handOf(s, p), p);
          if (u !== null) picks.push(u);
        }
        if (picks.length) { log(s, `${picks.map(u => nameOf(s, u)).join('、')}を捨てる`); sendToGy(s, picks, 'discard'); }
      },
    }],
  },
  /* 手札抹殺 */
  '4821': {
    effects: [{
      id: 'e1', label: '手札を全て捨て、捨てた枚数分ドローする', type: 'card', ss: 1,
      can: x => {
        const s = x.s, mine = handOf(s, x.player).filter(u => u !== x.self).length;
        return (mine + s.players[opp(x.player)].hand.length) > 0 && s.players[x.player].deck.length >= mine;
      },
      resolve: x => {
        const s = x.s;
        const counts = [s.players[0].hand.length, s.players[1].hand.length];
        const all = [...handOf(s, 0), ...handOf(s, 1)];
        if (!all.length) return;
        log(s, `お互いの手札を全て捨てる（${counts[0]}枚・${counts[1]}枚）`);
        sendToGy(s, all, 'discard');
        newStep(s); // その後
        drawEach(s, counts);
      },
    }],
  },
  /* サイクロン */
  '4909': {
    effects: [{
      id: 'e1', label: 'フィールドの魔法・罠カード1枚を破壊', type: 'card', ss: 2,
      can: x => stCards(x.s).some(u => u !== x.self),
      activate: x => { target(x, '破壊する魔法・罠カードを選んでください', stCards(x.s).filter(u => u !== x.self)); },
      resolve: x => { if (targetValid(x.s, x.link ) && isOnField(x.s.cards[x.link .targets[0]])) destroy(x.s, [x.link .targets[0]], 'effect'); },
    }],
  },
  /* 光の護封剣 */
  '4354': {
    staysOnField: true,
    // ②：相手モンスターは攻撃宣言できない（魔法カードの効果を受けないモンスターは攻撃できる）
    forbidsAttack: (s, self, m) => s.cards[m].controller !== s.cards[self].controller,
    // 相手ターンで数えて3ターン後の相手エンドフェイズに破壊される（効果ではない）
    onEndPhase: (s, self) => {
      const c = s.cards[self];
      if (s.turnPlayer === c.controller) return;
      c.counters.swordTurns = (c.counters.swordTurns ?? 0) + 1;
      if (c.counters.swordTurns >= 3) { log(s, `${nameOf(s, self)}は相手ターンで数えて3ターン目のエンドフェイズになったので破壊される`); destroy(s, [self], 'rule'); }
    },
    effects: [{
      id: 'e1', label: '相手の裏側表示モンスターを表側表示にし、相手は攻撃宣言できなくなる', type: 'card', ss: 1,
      resolve: x => {
        const s = x.s;
        const list = monstersOf(s, opp(x.player)).filter(u => !s.cards[u].faceUp && !isImmune(s, u));
        for (const u of list) { s.cards[u].faceUp = true; emit(s, { type: 'flipped', uid: u }); }
        if (list.length) log(s, `${list.map(u => nameOf(s, u)).join('、')}を表側表示にする`);
      },
    }],
  },
  /* 手札断殺 */
  '7389': {
    effects: [{
      id: 'e1', label: 'お互いに手札を2枚墓地へ送り、2枚ドローする', type: 'card', ss: 2,
      can: x => {
        const s = x.s;
        const mine = handOf(s, x.player).filter(u => u !== x.self).length;
        return mine >= 2 && s.players[opp(x.player)].hand.length >= 2 && s.players[0].deck.length >= 2 && s.players[1].deck.length >= 2;
      },
      resolve: x => {
        const s = x.s, tp = s.turnPlayer;
        // 処理時にどちらかの手札が1枚以下なら、何も行わない（公式Q&A [7060]）
        if (s.players[0].hand.length < 2 || s.players[1].hand.length < 2) { log(s, '手札が2枚未満のプレイヤーがいるため、何も行われない'); return; }
        const picks           = [];
        for (const p of [tp, opp(tp)]              ) {
          picks.push(...choose(x, { kind: 'cards', prompt: '墓地へ送る手札を2枚選んでください', options: handOf(s, p), min: 2, max: 2, player: p }));
        }
        log(s, `${picks.map(u => nameOf(s, u)).join('、')}を墓地へ送る`);
        sendToGy(s, picks, 'effect');
        newStep(s); // その後
        drawBoth(s, 2);
      },
    }],
  },
  /* 漆黒のパワーストーン */
  '5668': {
    effects: [{
      id: 'e1', label: '魔力カウンターを3つ置いて発動する', type: 'card', ss: 2,
      activate: x => {
        const s = x.s;
        s.cards[x.self].counters.magic = 3; // 効果ではなく、発動した時点で置かれる
        log(s, `${nameOf(s, x.self)}に魔力カウンターを3つ置く`);
        // ①の条件を満たしていれば、同じチェーンブロックで①の効果も発動できる
        if (powerStoneCan(x) && choose(x, { kind: 'yesno', prompt: '①の効果（魔力カウンターを移す）も発動しますか？' })) {
          target(x, '魔力カウンターを置くカードを選んでください', powerStoneTargets(x));
          x.link .data.move = true;
          s.opt[`${x.player}:card:${x.self}:${s.cards[x.self].serial}:e2`] = s.turn;
        }
      },
      resolve: x => { if (x.link .data.move) powerStoneMove(x); },
    }, {
      id: 'e2', label: '①：このカードの魔力カウンターを1つ、他のカードに移す', type: 'quick', ss: 2, zones: ['szone'], opt: 'card',
      can: x => powerStoneCan(x),
      activate: x => { target(x, '魔力カウンターを置くカードを選んでください', powerStoneTargets(x)); },
      resolve: x => powerStoneMove(x),
    }],
  },
  /* 魔宮の賄賂 */
  '7349': {
    effects: [{
      id: 'e1', label: '相手の魔法・罠カードの発動を無効にし破壊、相手は1枚ドロー', type: 'card', ss: 3, damageStep: true,
      can: x => {
        const top = x.s.chain[x.s.chain.length - 1];
        return !!top && top.player !== x.player && top.cardActivation && (top.cardKind === 'spell' || top.cardKind === 'trap') && !top.negated && x.s.players[opp(x.player)].deck.length > 0;
      },
      activate: x => { x.link .data.index = x.s.chain.length - 1; },
      resolve: x => {
        const s = x.s;
        negateActivation(s, s.chain[x.link .data.index          ]);
        drawCards(s, opp(x.player), 1); // 無効と破壊が行われなくても、相手はドローする
      },
    }],
  },
  /* リビングデッドの呼び声 */
  '4989': {
    destroyWhenLinkDestroyed: true,
    effects: [{
      id: 'e1', label: '自分の墓地のモンスター1体を攻撃表示で特殊召喚', type: 'card', ss: 2,
      can: x => gyOf(x.s, x.player).some(u => canSpecialSummon(x.s, u, x.player, 'special', [], x.self)),
      activate: x => { target(x, '特殊召喚するモンスターを選んでください', gyOf(x.s, x.player).filter(u => canSpecialSummon(x.s, u, x.player, 'special', [], x.self))); },
      resolve: x => {
        const s = x.s, t = x.link .targets[0];
        if (!targetValid(s, x.link ) || s.cards[t].zone !== 'gy' || !sameCard(s, x.self, x.link .serial)) return;
        if (specialSummon(x, [t], { position: 'atk' }).length) linkCards(s, x.self, t);
      },
    }],
    // このカードがフィールドから離れる時にそのモンスターは破壊される
    onLeaveField: (s, before) => {
      if (before.link === null) return;
      if (sameCard(s, before.link, before.linkSerial ) && isMonsterZone(s.cards[before.link])) destroy(s, [before.link], 'effect');
    },
  },
  /* 魔法の筒 */
  '5124': {
    effects: [{
      id: 'e1', label: '攻撃を無効にし、その攻撃力分のダメージを相手に与える', type: 'card', ss: 2,
      can: x => !!x.s.battle && x.s.battle.step === 'declared' && !x.s.battle.negated && x.s.cards[x.s.battle.attacker].controller === opp(x.player),
      activate: x => { x.link .targets.push(x.s.battle .attacker); log(x.s, `対象：${nameOf(x.s, x.s.battle .attacker)}`); },
      resolve: x => {
        const s = x.s, t = x.link .targets[0];
        if (!targetValid(s, x.link ) || !isFaceUpMonster(s, t) || !s.battle || s.battle.attacker !== t) return;
        const atk = currentAtk(s, t);
        negateAttack(s);
        effectDamage(s, opp(x.player), atk);
      },
    }],
  },
  /* 六芒星の呪縛 */
  '4355': {
    destroyWhenLinkDestroyed: true,
    forbidsAttack: (s, self, m) => isLinked(s, self, m),
    forbidsPositionChange: (s, self, m) => isLinked(s, self, m),
    effects: [{
      id: 'e1', label: '相手モンスター1体を攻撃・表示形式の変更をできなくする', type: 'card', ss: 2,
      can: x => monstersOf(x.s, opp(x.player)).length > 0,
      activate: x => { target(x, '対象にする相手モンスターを選んでください', monstersOf(x.s, opp(x.player))); },
      resolve: x => {
        const s = x.s, t = x.link .targets[0];
        if (targetValid(s, x.link ) && isMonsterZone(s.cards[t]) && sameCard(s, x.self, x.link .serial)) linkCards(s, x.self, t);
      },
    }],
  },

  /* ================= デッキ dno7（暗黒混沌ユベル界）で追加 ================= */
  /* ライトロード・マジシャン ライラ */
  '7592': {
    effects: [{
      id: 'e1', label: '①：このカードを守備表示にし、相手の魔法・罠カード1枚を破壊', type: 'ignition', ss: 1,
      can: x => isFaceUpMonster(x.s, x.self) && x.s.cards[x.self].position === 'atk' && spellTrapsOf(x.s, opp(x.player)).length > 0,
      activate: x => { target(x, '破壊する相手の魔法・罠カードを選んでください', spellTrapsOf(x.s, opp(x.player))); },
      resolve: x => {
        const s = x.s, c = s.cards[x.self];
        if (!sameCard(s, x.self, x.link .serial) || !isMonsterZone(c)) return;
        // 次の自分ターンの終了時まで表示形式を変更できない（処理時にこの状態になる）
        addLingering(s, { type: 'noPositionChange', uid: x.self, serial: c.serial, turn: s.turn + 2 });
        if (!c.faceUp || c.position !== 'atk' || isImmune(s, x.self)) return;
        c.position = 'def';
        log(s, `${nameOf(s, x.self)}を守備表示にする`);
        if (targetValid(s, x.link ) && isOnField(s.cards[x.link .targets[0]])) destroy(s, [x.link .targets[0]], 'effect');
      },
    }, {
      id: 'e2', label: '②：自分のデッキの上から3枚を墓地へ送る', type: 'trigger', ss: 1,
      trigger: { mandatory: true, when: false, match: (s, self, ev) => ev.type === 'phase' && ev.phase === 'end' && ev.player === s.cards[self].controller && isFaceUpMonster(s, self) },
      resolve: x => { millTop(x.s, x.player, 3); },
    }],
  },
  /* ライトロード・ハンター ライコウ */
  '7595': {
    effects: [{
      id: 'e1', label: '①：フィールドのカード1枚を破壊でき、デッキの上から3枚を墓地へ送る', type: 'trigger', ss: 1, damageStep: true,
      trigger: { mandatory: true, when: false, match: (_s, self, ev) => ev.type === 'flipped' && ev.uid === self },
      resolve: x => {
        const s = x.s;
        // 破壊は任意（処理時に選ぶ）。墓地へ送る処理は必ず行う（同時に行う扱い）
        const pick = choose(x, { kind: 'cards', prompt: '破壊するフィールドのカードを選んでください（選ばなくてもよい）', options: allFieldCards(s), min: 0, max: 1 });
        if (pick.length) destroy(s, pick, 'effect');
        millTop(s, x.player, 3);
      },
    }],
  },
  /* ユベル */
  '7409': {
    battleIndestructible: true, noSelfBattleDamage: true,
    effects: [yubelReflect(), {
      id: 'e3', label: '③：自分フィールドの他のモンスター1体をリリースするか、このカードを破壊する', type: 'trigger', ss: 1,
      trigger: { mandatory: true, when: false, match: (s, self, ev) => ev.type === 'phase' && ev.phase === 'end' && ev.player === s.cards[self].controller && isFaceUpMonster(s, self) },
      resolve: x => {
        const s = x.s;
        if (!sameCard(s, x.self, x.link .serial) || !isMonsterZone(s.cards[x.self])) return;
        const others = monstersOf(s, x.player).filter(u => u !== x.self);
        if (others.length && choose(x, { kind: 'option', prompt: 'どちらを行いますか？', options: ['他のモンスター1体をリリースする', 'このカードを破壊する'] }) === 0) {
          const u = chooseOne(x, 'リリースするモンスターを選んでください', others) ;
          release(s, [u], 'release');
        } else destroy(s, [x.self], 'effect');
      },
    }, {
      id: 'e4', label: '④：「ユベル－Das Abscheulich Ritter」を特殊召喚', type: 'trigger', ss: 1, damageStep: true,
      // ③の効果以外で破壊された時（破壊された直後のみ：タイミングを逃す）
      trigger: { mandatory: false, when: true, match: (s, self, ev) => ev.type === 'destroyed' && ev.uid === self && !(ev.srcUid === self && ev.srcEffect === 'e3') && (s.cards[self].zone === 'gy' || (s.cards[self].zone === 'banished' && s.cards[self].faceUp)) },
      can: x => yubelTargets(x, '7410').length > 0,
      resolve: x => {
        const u = chooseOne(x, '特殊召喚する「ユベル－Das Abscheulich Ritter」を選んでください（手札・デッキ・墓地）', yubelTargets(x, '7410'));
        if (u !== null) specialSummon(x, [u]);
      },
    }],
  },
  /* ユベル－Das Abscheulich Ritter */
  '7410': {
    cannotNormalSummon: true, battleIndestructible: true, noSelfBattleDamage: true,
    specialSummonOk: (s, _self, _how, src) => src !== null && s.cards[src]?.code === '7409',
    properSpecial: () => true,
    effects: [yubelReflect(), {
      id: 'e3', label: '③：フィールドの他のモンスターを全て破壊', type: 'trigger', ss: 1,
      trigger: { mandatory: true, when: false, match: (s, self, ev) => ev.type === 'phase' && ev.phase === 'end' && ev.player === s.cards[self].controller && isFaceUpMonster(s, self) },
      resolve: x => { destroy(x.s, allMonsters(x.s).filter(u => u !== x.self), 'effect'); },
    }, {
      id: 'e4', label: '④：「ユベル－Das Extremer Traurig Drachen」を特殊召喚', type: 'trigger', ss: 1, damageStep: true,
      // 表側表示のこのカードがフィールドから離れた時（デッキに戻った・裏側で除外された場合は発動できない）
      trigger: {
        mandatory: false, when: true,
        match: (s, self, ev) => ev.type === 'leftField' && ev.uid === self && !!ev.wasFaceUp && s.cards[self].zone !== 'deck' && s.cards[self].zone !== 'extra' && !(s.cards[self].zone === 'banished' && !s.cards[self].faceUp),
      },
      can: x => yubelTargets(x, '7411').length > 0,
      resolve: x => {
        const u = chooseOne(x, '特殊召喚する「ユベル－Das Extremer Traurig Drachen」を選んでください（手札・デッキ・墓地）', yubelTargets(x, '7411'));
        if (u !== null) specialSummon(x, [u]);
      },
    }],
  },
  /* ユベル－Das Extremer Traurig Drachen */
  '7411': {
    cannotNormalSummon: true, battleIndestructible: true, noSelfBattleDamage: true,
    specialSummonOk: (s, _self, _how, src) => src !== null && s.cards[src]?.code === '7410',
    properSpecial: () => true,
    effects: [{
      id: 'e2', label: '②：戦闘を行った相手モンスターの攻撃力分のダメージを与え、そのモンスターを破壊', type: 'trigger', ss: 1, damageStep: true,
      trigger: {
        mandatory: true, when: false,
        match: (s, self, ev) => ev.type === 'damageStepEnd' && ev.target !== null && (ev.attacker === self || ev.target === self) && ev.atkPos.includes(self) && s.cards[self].zone !== 'deck',
      },
      activate: x => {
        const ev = [...x.s.lastEvents].reverse().find(e => e.type === 'damageStepEnd')                                                             ;
        if (!ev) return;
        const other = ev.attacker === x.self ? ev.target  : ev.attacker;
        x.link .data.other = other; x.link .data.serial = x.s.cards[other].serial; x.link .data.atk = ev.atkOf[other] ?? 0;
      },
      resolve: x => {
        const s = x.s, d = x.link .data;
        if (d.other === undefined) return;
        const other = d.other          ;
        // フィールドにいれば今の攻撃力、いなければ戦闘時の攻撃力
        const onField = sameCard(s, other, d.serial          ) && isFaceUpMonster(s, other);
        const atk = onField ? currentAtk(s, other) : (d.atk          );
        const lp = s.players[opp(x.player)].lp;
        effectDamage(s, opp(x.player), atk);
        // ダメージを与えることに成功した場合、そのモンスターを破壊する（同時に行う扱い）
        if (s.players[opp(x.player)].lp < lp && onField) destroy(s, [other], 'effect');
      },
    }],
  },
  /* 終末の騎士 */
  '7423': {
    effects: [{
      id: 'e1', label: '①：デッキから闇属性モンスター1体を墓地へ送る', type: 'trigger', ss: 1, damageStep: true,
      trigger: { mandatory: false, when: true, match: (_s, self, ev) => ev.type === 'summoned' && ev.uid === self },
      can: x => deckOf(x.s, x.player).some(u => defOf(x.s, u).kind === 'monster' && defOf(x.s, u).attribute === '闇'),
      resolve: x => {
        const u = chooseOne(x, '墓地へ送る闇属性モンスターを選んでください', deckOf(x.s, x.player).filter(u => defOf(x.s, u).kind === 'monster' && defOf(x.s, u).attribute === '闇'));
        if (u !== null) sendToGy(x.s, [u], 'effect');
      },
    }],
  },
  /* メタモルポット */
  '4597': {
    effects: [{
      id: 'e1', label: '①：手札を全て捨て、お互いに5枚ドロー', type: 'trigger', ss: 1, damageStep: true,
      trigger: { mandatory: true, when: false, match: (_s, self, ev) => ev.type === 'flipped' && ev.uid === self },
      resolve: x => {
        const s = x.s;
        const all = [...handOf(s, 0), ...handOf(s, 1)];
        if (all.length) { log(s, '手札があるプレイヤーは手札を全て捨てる'); sendToGy(s, all, 'discard'); }
        newStep(s); // その後
        drawBoth(s, 5);
      },
    }],
  },
  /* 混沌帝龍 －終焉の使者－ */
  '5860': {
    cannotNormalSummon: true, exclusive: true,
    // 召喚条件を無視する効果でなければ、決められた方法でしか特殊召喚できない
    specialSummonOk: () => false,
    procSummon: {
      zones: ['hand'], label: '墓地の光・闇属性モンスターを1体ずつ除外して特殊召喚',
      can: (s, _self, p) => freeMZones(s, p).length > 0 && gyAttr(s, p, '光').length > 0 && gyAttr(s, p, '闇').length > 0,
      pay: x => {
        const s = x.s;
        const l = chooseOne(x, '除外する光属性モンスターを選んでください', gyAttr(s, x.player, '光')) ;
        const d = chooseOne(x, '除外する闇属性モンスターを選んでください', gyAttr(s, x.player, '闇')) ;
        log(s, `${pl(x.player)}：${nameOf(s, l)}と${nameOf(s, d)}を除外`);
        banish(s, [l, d], 'cost');
      },
    },
    effects: [{
      id: 'e1', label: '①：1000LPを払い、お互いの手札・フィールドのカードを全て墓地へ送る', type: 'ignition', ss: 1, opt: 'card',
      can: x => x.s.players[x.player].lp >= 1000,
      activate: x => { payLp(x.s, x.player, 1000); },
      resolve: x => {
        const s = x.s, o = opp(x.player);
        const all = [...handOf(s, 0), ...handOf(s, 1), ...allFieldCards(s)];
        const beforeGy = s.players[o].gy.length;
        log(s, 'お互いの手札・フィールドのカードを全て墓地へ送る');
        sendToGy(s, all, 'effect');
        const n = s.players[o].gy.length - beforeGy;
        if (n > 0) { newStep(s); effectDamage(s, o, n * 300); }
      },
    }],
  },
  /* 暗黒界の鬼神 ケルト */
  '11060': {
    effects: [{
      ...darkWorldTrigger('①：このカードを特殊召喚（相手の効果なら、デッキから悪魔族も特殊召喚できる）'),
      resolve: x => {
        const s = x.s;
        if (!darkWorldSelfSummon(x)) return;
        if (!discardedByOpponent(s, x.self)) return;
        const fiends = deckOf(s, x.player).filter(u => defOf(s, u).kind === 'monster' && defOf(s, u).race === '悪魔族');
        if (!fiends.length || !choose(x, { kind: 'yesno', prompt: 'デッキから悪魔族モンスター1体を特殊召喚しますか？' })) return;
        newStep(s); // さらに（同時ではない）
        const side = choose(x, { kind: 'option', prompt: 'どちらのフィールドに特殊召喚しますか？', options: ['自分フィールド', '相手フィールド'] }) === 0 ? x.player : opp(x.player);
        const u = chooseOne(x, '特殊召喚する悪魔族モンスターを選んでください', fiends.filter(f => canSpecialSummon(s, f, side, 'special', [], x.self)));
        if (u !== null) specialSummon(x, [u], { player: side });
      },
    }],
  },
  /* 暗黒界の武神 ゴルド */
  '6505': {
    effects: [{
      ...darkWorldTrigger('①：このカードを特殊召喚（相手の効果なら、相手のカードを2枚まで破壊）'),
      activate: x => {
        const s = x.s;
        const opts = fieldCards(s, opp(x.player));
        if (discardedByOpponent(s, x.self) && opts.length) {
          const t = choose(x, { kind: 'cards', prompt: '破壊する相手のカードを2枚まで選んでください（選ばなくてもよい）', options: opts, min: 0, max: 2 });
          x.link .targets.push(...t);
        }
      },
      resolve: x => {
        const s = x.s;
        if (!darkWorldSelfSummon(x)) return;
        const t = x.link .targets.filter((u, i) => targetValid(s, x.link , i) && isOnField(s.cards[u]) && s.cards[u].controller !== x.player);
        if (t.length) { newStep(s); destroy(s, t, 'effect'); }
      },
    }],
  },
  /* 暗黒界の龍神 グラファ */
  '9712': {
    procSummon: {
      zones: ['gy'], label: '自分の「暗黒界」モンスター1体を手札に戻し、墓地から特殊召喚',
      can: (s, _self, p) => graphaReturnable(s, p).length > 0,
      pay: x => {
        const s = x.s;
        const u = chooseOne(x, '手札に戻す「暗黒界」モンスターを選んでください', graphaReturnable(s, x.player)) ;
        addToHand(s, [u], 'cost');
      },
    },
    effects: [{
      ...darkWorldTrigger('②：相手のカード1枚を破壊（相手の効果なら、相手の手札を確認して特殊召喚できる）'),
      can: x => fieldCards(x.s, opp(x.player)).length > 0,
      activate: x => { target(x, '破壊する相手のカードを選んでください', fieldCards(x.s, opp(x.player))); },
      resolve: x => {
        const s = x.s, o = opp(x.player);
        if (!targetValid(s, x.link ) || !isOnField(s.cards[x.link .targets[0]])) return;
        const done = destroy(s, [x.link .targets[0]], 'effect');
        // 破壊できなかった場合、手札を確認する処理は行わない（公式Q&A [11328]）
        if (!done.length || !discardedByOpponent(s, x.self)) return;
        newStep(s);
        const u = randomOf(s, [...s.players[o].hand]);
        if (u === null) return;
        log(s, `${pl(o)}の手札をランダムに1枚確認：${nameOf(s, u)}`);
        if (defOf(s, u).kind === 'monster' && canSpecialSummon(s, u, x.player, 'special', [], x.self) && choose(x, { kind: 'yesno', prompt: `${nameOf(s, u)}を自分フィールドに特殊召喚しますか？` })) {
          specialSummon(x, [u], { player: x.player });
        }
      },
    }],
  },
  /* 暗黒界の術師 スノウ */
  '9713': {
    effects: [{
      ...darkWorldTrigger('①：デッキから「暗黒界」カードを手札に加える（相手の効果なら、相手の墓地のモンスターも特殊召喚）'),
      activate: x => {
        const s = x.s;
        // 相手の効果で捨てられ、相手の墓地に特殊召喚できるモンスターがいれば、1体を対象に選ぶ
        const opts = gyOf(s, opp(x.player)).filter(u => canSpecialSummon(s, u, x.player, 'special', [], x.self));
        if (discardedByOpponent(s, x.self) && opts.length) target(x, '自分フィールドに特殊召喚する相手の墓地のモンスターを選んでください', opts);
      },
      resolve: x => {
        const s = x.s;
        const u = chooseOne(x, '手札に加える「暗黒界」カードを選んでください', deckOf(s, x.player).filter(c => defOf(s, c).name.includes('暗黒界')));
        if (u !== null) addToHand(s, [u]);
        if (x.link .targets.length && targetValid(s, x.link ) && s.cards[x.link .targets[0]].zone === 'gy') {
          newStep(s);
          specialSummon(x, [x.link .targets[0]], { position: 'def', player: x.player });
        }
      },
    }],
  },
  /* 魔法石の採掘 */
  '5688': {
    effects: [{
      id: 'e1', label: '手札を2枚捨て、墓地の魔法カード1枚を手札に加える', type: 'card', ss: 1,
      can: x => handOf(x.s, x.player).filter(u => u !== x.self).length >= 2 && gyOf(x.s, x.player).some(u => defOf(x.s, u).kind === 'spell'),
      activate: x => {
        const s = x.s;
        const d = choose(x, { kind: 'cards', prompt: '捨てる手札を2枚選んでください（コスト）', options: handOf(s, x.player).filter(u => u !== x.self), min: 2, max: 2 });
        log(s, `${pl(x.player)}：${d.map(u => nameOf(s, u)).join('、')}を捨てる`);
        sendToGy(s, d, 'discard');
        target(x, '手札に加える魔法カードを選んでください', gyOf(s, x.player).filter(u => defOf(s, u).kind === 'spell'));
      },
      resolve: x => { if (targetValid(x.s, x.link ) && x.s.cards[x.link .targets[0]].zone === 'gy') addToHand(x.s, [x.link .targets[0]]); },
    }],
  },
  /* 光の援軍 */
  '7868': {
    effects: [{
      id: 'e1', label: 'デッキの上から3枚を墓地へ送り、レベル4以下の「ライトロード」を手札に加える', type: 'card', ss: 1,
      can: x => deckOf(x.s, x.player).length >= 4 && lightswornLv4(x).length > 0,
      activate: x => { millTop(x.s, x.player, 3, 'cost'); },
      resolve: x => {
        const u = chooseOne(x, '手札に加える「ライトロード」モンスターを選んでください', lightswornLv4(x));
        if (u !== null) addToHand(x.s, [u]);
      },
    }],
  },
  /* 死者への手向け */
  '4856': {
    effects: [{
      id: 'e1', label: '手札を1枚捨て、フィールドのモンスター1体を破壊', type: 'card', ss: 1,
      can: x => handOf(x.s, x.player).some(u => u !== x.self) && allMonsters(x.s).length > 0,
      activate: x => {
        const s = x.s;
        const d = chooseOne(x, '捨てる手札を選んでください（コスト）', handOf(s, x.player).filter(u => u !== x.self)) ;
        log(s, `${pl(x.player)}：${nameOf(s, d)}を捨てる`);
        sendToGy(s, [d], 'discard');
        target(x, '破壊するモンスターを選んでください', allMonsters(s));
      },
      resolve: x => { if (targetValid(x.s, x.link ) && isMonsterZone(x.s.cards[x.link .targets[0]])) destroy(x.s, [x.link .targets[0]], 'effect'); },
    }],
  },
  /* 生還の宝札 */
  '5123': {
    effects: [{ id: 'e1', label: '発動する', type: 'card', ss: 1, resolve: () => {} }, {
      id: 'e2', label: '①：自分の墓地からモンスターが特殊召喚された時、1枚ドロー', type: 'trigger', ss: 1,
      trigger: {
        mandatory: false, when: true,
        match: (s, self, ev) => ev.type === 'summoned' && ev.from === 'gy' && s.cards[ev.uid].owner === s.cards[self].controller && isOnField(s.cards[self]) && s.cards[self].faceUp,
      },
      resolve: x => { drawCards(x.s, x.player, 1); },
    }],
  },
  /* おろかな埋葬 */
  '5236': {
    effects: [{
      id: 'e1', label: 'デッキからモンスター1体を墓地へ送る', type: 'card', ss: 1,
      can: x => deckOf(x.s, x.player).some(u => defOf(x.s, u).kind === 'monster'),
      resolve: x => {
        const u = chooseOne(x, '墓地へ送るモンスターを選んでください', deckOf(x.s, x.player).filter(u => defOf(x.s, u).kind === 'monster'));
        if (u !== null) sendToGy(x.s, [u], 'effect');
      },
    }],
  },
  /* ブラック・ホール */
  '4342': {
    effects: [{
      id: 'e1', label: 'フィールドのモンスターを全て破壊', type: 'card', ss: 1,
      can: x => allMonsters(x.s).length > 0,
      resolve: x => { destroy(x.s, allMonsters(x.s), 'effect'); },
    }],
  },
  /* サンダー・ブレイク */
  '5544': {
    effects: [{
      id: 'e1', label: '手札を1枚捨て、フィールドのカード1枚を破壊', type: 'card', ss: 2,
      can: x => x.s.players[x.player].hand.length > 0 && allFieldCards(x.s).some(u => u !== x.self),
      activate: x => {
        const s = x.s;
        const d = chooseOne(x, '捨てる手札を選んでください（コスト）', handOf(s, x.player)) ;
        log(s, `${pl(x.player)}：${nameOf(s, d)}を捨てる`);
        sendToGy(s, [d], 'discard');
        target(x, '破壊するカードを選んでください', allFieldCards(s).filter(u => u !== x.self));
      },
      resolve: x => { if (targetValid(x.s, x.link ) && isOnField(x.s.cards[x.link .targets[0]])) destroy(x.s, [x.link .targets[0]], 'effect'); },
    }],
  },
  /* 針虫の巣窟 */
  '7769': {
    effects: [{
      id: 'e1', label: '自分のデッキの上から5枚を墓地へ送る', type: 'card', ss: 2,
      can: x => deckOf(x.s, x.player).length >= 5,
      resolve: x => { millTop(x.s, x.player, 5); },
    }],
  },
  /* 復活の墓穴 */
  '6544': {
    effects: [{
      id: 'e1', label: 'お互いに墓地のモンスター1体を守備表示で特殊召喚', type: 'card', ss: 2, damageStep: true,
      can: x => {
        const s = x.s;
        const hit = s.lastEvents.some(e => e.type === 'destroyed' && e.reason === 'battle' && s.cards[e.uid].owner === x.player && s.cards[e.uid].zone === 'gy');
        return hit && revivable(s, x.player, x.player, x.self).length > 0;
      },
      activate: x => {
        const s = x.s;
        // 自分と相手が、それぞれ自分の墓地から1体を対象に選ぶ
        target(x, '特殊召喚する自分の墓地のモンスターを選んでください', revivable(s, x.player, x.player, x.self));
        const theirs = revivable(s, opp(x.player), opp(x.player), x.self);
        if (theirs.length) x.link .targets.push(chooseOne(x, '特殊召喚する自分の墓地のモンスターを選んでください', theirs, opp(x.player)) );
      },
      resolve: x => {
        const s = x.s;
        const done           = [];
        x.link .targets.forEach((t, i) => {
          if (!targetValid(s, x.link , i) || s.cards[t].zone !== 'gy') return;
          done.push(...specialSummon(x, [t], { position: 'def', player: s.cards[t].owner }));
        });
        // 特殊召喚したモンスターは、フィールドに表側表示で存在する限り表示形式を変更できない
        for (const u of done) addLingering(s, { type: 'noPositionChange', uid: u, serial: s.cards[u].serial, turn: 1e9 });
      },
    }],
  },
  /* 闇の取引 */
  '6517': {
    effects: [{
      id: 'e1', label: '相手の通常魔法の効果を「相手はランダムに手札を1枚捨てる」にする', type: 'card', ss: 2,
      can: x => {
        const s = x.s, top = s.chain[s.chain.length - 1];
        return !!top && top.player !== x.player && top.cardActivation && top.cardKind === 'spell' && defOf(s, top.uid).subtype === '通常'
          && s.players[x.player].hand.length > 0 && s.players[x.player].lp >= 1000;
      },
      activate: x => { payLp(x.s, x.player, 1000); x.link .data.index = x.s.chain.length - 1; },
      resolve: x => {
        const link = x.s.chain[x.link .data.index          ];
        if (!link) return;
        link.data.replacedDiscard = x.player;
        log(x.s, `${nameOf(x.s, link.uid)}の効果は「${pl(x.player)}はランダムに手札を1枚捨てる」になった`);
      },
    }],
  },
  /* ダメージ・ゲート */
  '8845': {
    effects: [{
      id: 'e1', label: '受けた戦闘ダメージ以下の攻撃力のモンスターを墓地から特殊召喚', type: 'card', ss: 2, damageStep: true,
      can: x => damageGateTargets(x).length > 0,
      activate: x => { target(x, '特殊召喚するモンスターを選んでください', damageGateTargets(x)); },
      resolve: x => { if (targetValid(x.s, x.link ) && x.s.cards[x.link .targets[0]].zone === 'gy') specialSummon(x, [x.link .targets[0]]); },
    }],
  },
  /* 激流葬 */
  '5114': {
    effects: [{
      id: 'e1', label: 'フィールドのモンスターを全て破壊', type: 'card', ss: 2,
      can: x => {
        const s = x.s;
        if (s.battle && ['dsStart', 'beforeCalc', 'afterCalc', 'dsEnd', 'end'].includes(s.battle.step)) return false;
        return s.lastEvents.some(e => e.type === 'summoned' && isMonsterZone(s.cards[e.uid]));
      },
      resolve: x => { destroy(x.s, allMonsters(x.s), 'effect'); },
    }],
  },

  /* ================= デッキ dno8（サイバーダーク）で追加 ================= */
  /* サイバー・ダーク・ホーン */
  '6830': { ...cyberDark(), piercing: true },
  /* サイバー・ダーク・エッジ */
  '6831': { ...cyberDark(), directAttackHalf: true },
  /* サイバー・ダーク・キール */
  '6832': {
    ...cyberDark(),
    effects: [cyberDarkEquip('summon'), {
      id: 'e3', label: '③：相手に300ダメージ', type: 'trigger', ss: 1, damageStep: true,
      // 戦闘で相手モンスターを破壊した場合（モンスターゾーンで発動する誘発効果）
      trigger: { mandatory: true, when: false, match: (s, self, ev) => ev.type === 'destroyed' && ev.reason === 'battle' && battlePartner(s, self) === ev.uid && isFaceUpMonster(s, self) },
      resolve: x => { effectDamage(x.s, opp(x.player), 300); },
    }],
  },
  /* 鎧黒竜－サイバー・ダーク・ドラゴン */
  '6833': {
    fusionOnly: true,
    fusionMaterials: ['サイバー・ダーク・ホーン', 'サイバー・ダーク・エッジ', 'サイバー・ダーク・キール'],
    effects: [cyberDarkEquip('special')],
    // ②：装備したモンスターの攻撃力分、及び自分の墓地のモンスターの数×100アップ
    statAdd: (s, self) => {
      const gy = s.players[s.cards[self].controller].gy.filter(u => defOf(s, u).kind === 'monster').length;
      return { atk: cyberEquipAtk(s, self) + gy * 100, def: 0 };
    },
    battleReplace: (s, self) => equippedBySelf(s, self),
  },
  /* レッドアイズ・ダークネスメタルドラゴン */
  '7557': {
    // ①：自分フィールドの表側表示のドラゴン族モンスター1体を除外し、手札から特殊召喚（この方法は1ターンに1度）
    procSummon: {
      zones: ['hand'], label: '自分のドラゴン族モンスター1体を除外し、手札から特殊召喚', opt: true,
      can: (s, _self, p) => faceUpDragons(s, p).length > 0,
      pay: x => {
        const u = chooseOne(x, '除外する表側表示のドラゴン族モンスターを選んでください', faceUpDragons(x.s, x.player)) ;
        log(x.s, `${pl(x.player)}：${nameOf(x.s, u)}を除外`);
        banish(x.s, [u], 'cost');
        newStep(x.s); // 除外と特殊召喚は同時に行われない
      },
    },
    effects: [{
      id: 'e2', label: '②：手札・墓地からドラゴン族モンスター1体を特殊召喚', type: 'ignition', ss: 1, opt: 'name',
      can: x => redEyesTargets(x).length > 0,
      resolve: x => {
        const u = chooseOne(x, '特殊召喚するドラゴン族モンスターを選んでください（手札・墓地）', redEyesTargets(x));
        if (u !== null) specialSummon(x, [u]);
      },
    }],
  },
  /* 仮面竜 */
  '6118': {
    effects: [{
      id: 'e1', label: '①：デッキから攻撃力1500以下のドラゴン族モンスターを特殊召喚', type: 'trigger', ss: 1, damageStep: true,
      trigger: { mandatory: false, when: true, match: (s, self, ev) => ev.type === 'destroyed' && ev.uid === self && ev.reason === 'battle' && s.cards[self].zone === 'gy' },
      can: x => maskedTargets(x).length > 0,
      resolve: x => {
        const u = chooseOne(x, '特殊召喚するドラゴン族モンスターを選んでください（デッキ）', maskedTargets(x));
        if (u !== null) specialSummon(x, [u]);
      },
    }],
  },
  /* ボマー・ドラゴン */
  '7094': {
    attackNoDamage: true,
    effects: [{
      id: 'e2', label: '②：このカードを破壊したモンスターを破壊', type: 'trigger', ss: 1, damageStep: true,
      trigger: { mandatory: true, when: false, match: (s, self, ev) => ev.type === 'destroyed' && ev.uid === self && ev.reason === 'battle' && s.cards[self].zone === 'gy' },
      activate: x => {
        const s = x.s, b = s.battle;
        if (!b) return;
        const other = b.attacker === x.self ? b.target : b.attacker;
        if (other !== null) { x.link .data.other = other; x.link .data.serial = s.cards[other].serial; }
      },
      resolve: x => {
        const s = x.s, d = x.link .data;
        if (d.other === undefined) return;
        const u = d.other          ;
        if (sameCard(s, u, d.serial          ) && isMonsterZone(s.cards[u])) destroy(s, [u], 'effect');
      },
    }],
  },
  /* オーバーロード・フュージョン */
  '6783': {
    effects: [{
      id: 'e1', label: '①：フィールド・墓地のモンスターを除外し、機械族・闇属性の融合モンスターを融合召喚', type: 'card', ss: 1,
      can: x => fusionCan(x, OVERLOAD),
      resolve: x => fusionSummon(x, OVERLOAD),
    }],
  },
  /* サイバーダーク・インパクト！ */
  '7217': {
    effects: [{
      id: 'e1', label: '①：「サイバー・ダーク」3体をデッキに戻し、「鎧黒竜－サイバー・ダーク・ドラゴン」を融合召喚', type: 'card', ss: 1,
      can: x => fusionCan(x, IMPACT),
      resolve: x => fusionSummon(x, IMPACT),
    }],
  },
  /* 未来融合－フューチャー・フュージョン */
  '6782': {
    destroyWhenLinkDestroyed: true,
    effects: [{
      id: 'e0', label: 'カードの発動', type: 'card', ss: 1,
      // 発動したターンを記録する（エクストラデッキが0枚でも、モンスターゾーンに空きが無くても発動できる：公式Q&A [9241] [11291]）
      resolve: x => { if (sameCard(x.s, x.self, x.link .serial) && isOnField(x.s.cards[x.self])) x.s.cards[x.self].counters.ffTurn = x.s.turn; },
    }, {
      id: 'e1', label: '①：融合モンスター1体を見せ、融合素材をデッキから墓地へ送る', type: 'trigger', ss: 1,
      trigger: { mandatory: true, when: false, match: (s, self, ev) => futureStandby(s, self, ev, 2) },
      resolve: x => {
        const s = x.s;
        // 処理時にこのカードがフィールドに無ければ適用されない（公式Q&A [20319]）
        if (!sameCard(s, x.self, x.link .serial) || !isOnField(s.cards[x.self])) return;
        const opts = s.players[x.player].extra.filter(u => defOf(s, u).frame === 'fusion' && deckMaterialSet(s, x.player, u));
        const f = chooseOne(x, 'お互いに確認する融合モンスターを選んでください（融合素材をデッキから墓地へ送る）', opts);
        if (f === null) { log(s, 'エクストラデッキに、デッキから融合素材を揃えられる融合モンスターがいない'); return; }
        log(s, `${pl(x.player)}：エクストラデッキの${nameOf(s, f)}を見せる`);
        s.cards[x.self].counters.ffShown = Number(s.cards[f].code);
        sendDeckMaterials(x, f);
      },
    }, {
      id: 'e2', label: '②：確認した融合モンスターを融合召喚', type: 'trigger', ss: 1,
      trigger: { mandatory: true, when: false, match: (s, self, ev) => futureStandby(s, self, ev, 4) },
      resolve: x => {
        const s = x.s;
        if (!sameCard(s, x.self, x.link .serial) || !isOnField(s.cards[x.self])) return;
        const code = s.cards[x.self].counters.ffShown;
        if (code === undefined) return;
        const opts = s.players[x.player].extra.filter(u => Number(s.cards[u].code) === code && canSpecialSummon(s, u, x.player, 'fusion', [], x.self));
        const u = chooseOne(x, '融合召喚するモンスターを選んでください', opts);
        if (u === null) return;
        if (specialSummon(x, [u], { how: 'fusion' }).length) linkCards(s, x.self, u);
      },
    }],
    // このカードがフィールドから離れた時にそのモンスターは破壊される
    onLeaveField: (s, before) => {
      if (before.link === null) return;
      if (sameCard(s, before.link, before.linkSerial ) && isMonsterZone(s.cards[before.link])) destroy(s, [before.link], 'effect');
    },
  },
  /* F・G・D */
  '5502': {
    fusionOnly: true,
    fusionMaterials: Array(5).fill(dragonMat()), // 同じ条件の素材（同一のオブジェクト）が5つ
    // ①：闇・地・水・炎・風属性モンスターとの戦闘では破壊されない
    battleIndestructibleVs: (s, _self, other) => other !== null && ['闇', '地', '水', '炎', '風'].includes(defOf(s, other).attribute ?? ''),
  },
  /* 次元幽閉 */
  '7400': {
    effects: [{
      id: 'e1', label: '攻撃モンスター1体を除外', type: 'card', ss: 2,
      can: x => { const b = x.s.battle; return !!b && b.step === 'declared' && !b.negated && x.s.cards[b.attacker].controller === opp(x.player) && isMonsterZone(x.s.cards[b.attacker]); },
      activate: x => { x.link .targets.push(x.s.battle .attacker); },
      resolve: x => {
        const s = x.s, t = x.link .targets[0];
        if (!targetValid(s, x.link ) || !isMonsterZone(s.cards[t])) return;
        banish(s, [t], 'effect');
      },
    }],
  },
  /* アポクリフォート・カーネル：「クリフォート」3体をリリースした場合のみ通常召喚できる（環境に「クリフォート」がいないため、通常召喚できない）。特殊召喚できない */
  '11543': {
    cannotNormalSummon: true,
    specialSummonOk: () => false,
  },
  /* セイクリッドの星痕：「セイクリッド」エクシーズモンスターの特殊召喚で発動する（環境にエクシーズモンスターがいないため、発動するだけ） */
  '9829': {
    effects: [{ id: 'e0', label: 'カードの発動', type: 'card', ss: 1, resolve: () => {} }],
  },
  /* ミミグル・ダンジョン */
  '20432': {
    effects: [{ id: 'e0', label: 'カードの発動', type: 'card', ss: 1, resolve: () => {} }, {
      id: 'e3', label: '③：デッキ・墓地から「ミミグル」モンスターを手札に加える', type: 'ignition', ss: 1, opt: 'name', zones: ['fzone'],
      can: x => mimighouls(x).length > 0,
      resolve: x => { const u = chooseOne(x, '手札に加える「ミミグル」モンスターを選んでください', mimighouls(x)); if (u !== null) addToHand(x.s, [u]); },
    }],
    // ②：自身のフィールドに裏側表示モンスターがいるプレイヤーは、召喚できず、このターンに特殊召喚されたモンスターで攻撃宣言できない
    blocksSummon: (s, _self, p) => hasFaceDownMonster(s, p),
    forbidsAttack: (s, _self, m) => hasFaceDownMonster(s, s.cards[m].controller) && s.cards[m].summonedTurn === s.turn && isSpecialSummoned(s, m),
  },
};

/* ---------- サイバーダーク用の補助 ---------- */
/** 「サイバー・ダーク」：召喚（鎧黒竜は特殊召喚）に成功した場合、墓地のドラゴン族を装備カード扱いで装備する */
function cyberDarkEquip(when                      )               {
  const lv3 = when === 'summon';
  const opts = (x     ) => gyOf(x.s, x.player).filter(u => defOf(x.s, u).kind === 'monster' && defOf(x.s, u).race === 'ドラゴン族' && (!lv3 || level(x.s, u) <= 3));
  return {
    id: 'e1', label: lv3 ? '①：墓地のレベル3以下のドラゴン族モンスターを装備' : '①：墓地のドラゴン族モンスターを装備', type: 'trigger', ss: 1, damageStep: true,
    // 墓地に対象が無くても発動する（補足情報）
    trigger: {
      mandatory: true, when: false,
      match: (_s, self, ev) => ev.type === 'summoned' && ev.uid === self && (lv3 ? ev.how === 'normal' || ev.how === 'advance' : ['special', 'ritual', 'fusion'].includes(ev.how)),
    },
    activate: x => { const o = opts(x); if (o.length) target(x, '装備するドラゴン族モンスターを選んでください（墓地）', o); },
    resolve: x => {
      const s = x.s, link = x.link ;
      if (!link.targets.length || !targetValid(s, link) || s.cards[link.targets[0]].zone !== 'gy') return;
      if (!isFaceUpMonster(s, x.self) || !sameCard(s, x.self, link.serial)) return;
      const t = link.targets[0];
      if (equipCard(s, t, x.self, { by: x.self })) log(s, `${nameOf(s, t)}を${nameOf(s, x.self)}に装備`);
    },
  };
}
/** このカードの効果で装備したモンスターの攻撃力 */
function cyberEquipAtk(s           , self        )         {
  const e = equippedBySelf(s, self);
  return e === null || !s.cards[e].faceUp ? 0 : defOf(s, e).atk ?? 0;
}
/** サイバー・ダーク・ホーン／エッジ／キールの共通部分 */
function cyberDark()             {
  return {
    effects: [cyberDarkEquip('summon')],
    statAdd: (s, self) => ({ atk: cyberEquipAtk(s, self), def: 0 }),
    battleReplace: (s, self) => equippedBySelf(s, self),
  };
}
/** 今の戦闘で、このカードと戦闘を行っているモンスター */
function battlePartner(s           , self        )                {
  const b = s.battle;
  if (!b) return null;
  if (b.attacker === self) return b.target;
  if (b.target === self) return b.attacker;
  return null;
}
function faceUpDragons(s           , p          )           {
  return monstersOf(s, p).filter(u => isFaceUpMonster(s, u) && defOf(s, u).race === 'ドラゴン族');
}
function redEyesTargets(x     )           {
  const s = x.s, p = x.player;
  return [...handOf(s, p), ...gyOf(s, p)].filter(u => defOf(s, u).kind === 'monster' && defOf(s, u).race === 'ドラゴン族' && s.cards[u].code !== '7557' && canSpecialSummon(s, u, p, 'special', [], x.self));
}
function maskedTargets(x     )           {
  const s = x.s;
  return deckOf(s, x.player).filter(u => defOf(s, u).kind === 'monster' && defOf(s, u).race === 'ドラゴン族' && (defOf(s, u).atk ?? 0) <= 1500 && canSpecialSummon(s, u, x.player, 'special', [], x.self));
}
function dragonMat() { return { label: 'ドラゴン族モンスター', ok: (s           , u        ) => defOf(s, u).race === 'ドラゴン族' }; }
/** オーバーロード・フュージョン：自分のフィールド・墓地のモンスターを除外して、機械族・闇属性の融合モンスターを融合召喚 */
const OVERLOAD             = {
  pool: (s, p) => [...monstersOf(s, p), ...gyOf(s, p).filter(u => defOf(s, u).kind === 'monster')],
  move: 'banish',
  filter: (s, f) => defOf(s, f).race === '機械族' && defOf(s, f).attribute === '闇',
};
/** サイバーダーク・インパクト！：自分の手札・フィールド（装備カード扱いのものを含む）・墓地から持ち主のデッキに戻す */
const IMPACT             = {
  pool: (s, p) => [...handOf(s, p), ...monstersOf(s, p), ...s.players[p].szone.filter((u)              => u !== null && defOf(s, u).kind === 'monster'), ...gyOf(s, p)],
  move: 'deck',
  filter: (s, f) => s.cards[f].code === '6833',
};
/** 未来融合：発動後 n ターン目（1回目＝2、2回目＝4）の自分スタンバイフェイズ */
function futureStandby(s           , self        , ev           , n        )          {
  const c = s.cards[self];
  return ev.type === 'phase' && ev.phase === 'standby' && ev.player === c.controller && c.zone === 'szone' && c.faceUp && c.counters.ffTurn !== undefined && s.turn === c.counters.ffTurn + n;
}
function hasFaceDownMonster(s           , p          )          { return monstersOf(s, p).some(u => !s.cards[u].faceUp); }
function mimighouls(x     )           {
  return [...deckOf(x.s, x.player), ...gyOf(x.s, x.player)].filter(u => defOf(x.s, u).kind === 'monster' && defOf(x.s, u).name.includes('ミミグル'));
}

/* ---------- 暗黒混沌ユベル界用の補助 ---------- */
/** ユベル・ユベル－Das Abscheulich Ritter②：攻撃表示のこのカードが攻撃対象に選択された場合、ダメージ計算前に攻撃モンスターの攻撃力分のダメージ */
function yubelReflect()               {
  return {
    id: 'e2', label: '②：攻撃モンスターの攻撃力分のダメージを相手に与える', type: 'trigger', ss: 1, damageStep: true,
    trigger: { mandatory: true, when: false, match: (s, self, ev) => ev.type === 'beforeDamageCalc' && ev.target === self && isFaceUpMonster(s, self) && s.cards[self].position === 'atk' },
    resolve: x => {
      const s = x.s, a = s.battle?.attacker;
      if (a === undefined || !isFaceUpMonster(s, a)) return;
      effectDamage(s, opp(x.player), currentAtk(s, a));
    },
  };
}
function yubelTargets(x     , code        )           {
  const s = x.s, p = x.player;
  return [...handOf(s, p), ...deckOf(s, p), ...gyOf(s, p)].filter(u => s.cards[u].code === code && canSpecialSummon(s, u, p, 'special', [], x.self));
}
/** 暗黒界：「このカードが効果で手札から墓地へ捨てられた場合に発動する」 */
function darkWorldTrigger(label        )               {
  return {
    id: 'e1', label, type: 'trigger', ss: 1, damageStep: true, resolve: () => {},
    trigger: { mandatory: true, when: false, match: (s, self, ev) => ev.type === 'toGy' && ev.uid === self && ev.from === 'hand' && ev.reason === 'discard' && ev.by !== null && ev.by !== undefined },
  };
}
/** 相手の効果で捨てられたか */
function discardedByOpponent(s           , self        )          {
  const by = s.cards[self].counters.discardBy;
  return by !== undefined && by >= 0 && by !== s.cards[self].owner;
}
/** 墓地のこのカードを特殊召喚する（できたか） */
function darkWorldSelfSummon(x     )          {
  const s = x.s;
  if (!sameCard(s, x.self, x.link .serial) || s.cards[x.self].zone !== 'gy') return false;
  return specialSummon(x, [x.self]).length > 0;
}
/** グラファ①で手札に戻せる「暗黒界」モンスター（表側表示、グラファ以外） */
function graphaReturnable(s           , p          )           {
  return monstersOf(s, p).filter(u => isFaceUpMonster(s, u) && defOf(s, u).name.includes('暗黒界') && s.cards[u].code !== '9712');
}
function gyAttr(s           , p          , attr        )           {
  return gyOf(s, p).filter(u => defOf(s, u).kind === 'monster' && defOf(s, u).attribute === attr);
}
function lightswornLv4(x     )           {
  const s = x.s;
  return deckOf(s, x.player).filter(u => defOf(s, u).kind === 'monster' && defOf(s, u).name.startsWith('ライトロード') && (defOf(s, u).level ?? 0) <= 4);
}
function revivable(s           , owner          , to          , src        )           {
  return gyOf(s, owner).filter(u => canSpecialSummon(s, u, to, 'special', [], src));
}
function damageGateTargets(x     )           {
  const s = x.s;
  const dmg = s.lastEvents.filter(e => e.type === 'damage' && e.battle && e.player === x.player).reduce((a, e) => Math.max(a, (e                      ).amount), 0);
  if (!dmg) return [];
  return gyOf(s, x.player).filter(u => defOf(s, u).kind === 'monster' && (defOf(s, u).atk ?? 0) <= dmg && canSpecialSummon(s, u, x.player, 'special', [], x.self));
}

/* ---------- 遊戯デッキ用の補助 ---------- */
/** あるターンのターンプレイヤー */
function turnPlayerAt(s           , turn        )           { return turn % 2 === 1 ? s.firstPlayer : opp(s.firstPlayer); }
/** サイレント・マジシャン LV４の③：5つ目のカウンターが置かれた「次の自分ターン」で、カウンターが5つあるか */
function lv4Ready(s           , self        )          {
  const c = s.cards[self];
  if ((c.counters.magic ?? 0) < 5 || c.counters.fullTurn === undefined) return false;
  // 5つ目が置かれた時のコントローラーだけが発動できる（公式Q&A [13773]）
  const p = c.counters.fullBy            ;
  if (c.controller !== p) return false;
  let t = c.counters.fullTurn + 1;
  while (turnPlayerAt(s, t) !== p) t++;
  return s.turn === t;
}
/** 手札・デッキから特殊召喚できる、指定コードのモンスター */
function levelTargets(s           , p          , code        , released          , src        , how                       = 'special')           {
  return [...handOf(s, p), ...deckOf(s, p)].filter(u => s.cards[u].code === code && canSpecialSummon(s, u, p, how, released, src));
}
/** レベルアップ！で墓地へ送れる「LV」モンスター（手札・デッキに記されたモンスターがいるもの） */
function levelUpSources(x     )           {
  const s = x.s;
  return monstersOf(s, x.player).filter(u => {
    const to = scriptOf(s, u).levelUpTo;
    return isFaceUpMonster(s, u) && !!to && levelTargets(s, x.player, to, [u], x.self, 'ignore').length > 0;
  });
}
function isSpecialSummoned(s           , u        )          { return ['special', 'ritual', 'fusion'].includes(s.cards[u].summonedHow ?? ''); }
/** オシリスの天空竜④の対象：相手フィールドに攻撃表示で召喚・特殊召喚されたモンスター */
function osirisPrey(s           , self        , u        )          {
  const c = s.cards[u];
  return c.controller !== s.cards[self].controller && isMonsterZone(c) && c.faceUp && c.position === 'atk';
}
function allFieldCards(s           )           { return [...fieldCards(s, 0), ...fieldCards(s, 1)]; }
function stCards(s           )           { return [...spellTrapsOf(s, 0), ...spellTrapsOf(s, 1)]; }
function apprenticeTargets(x     )           {
  const s = x.s;
  return deckOf(s, x.player).filter(u => defOf(s, u).kind === 'monster' && defOf(s, u).race === '魔法使い族' && (defOf(s, u).level ?? 0) <= 2 && canSpecialSummon(s, u, x.player, 'special', [], x.self));
}
/** お互いにドローする（同時に行った扱い） */
function drawBoth(s           , n        )       {
  const tp = s.turnPlayer;
  drawCards(s, tp, n);
  drawCards(s, opp(tp), n);
}
function drawEach(s           , counts          )       {
  const tp = s.turnPlayer;
  for (const p of [tp, opp(tp)]              ) if (counts[p] > 0) drawCards(s, p, counts[p]);
}
function powerStoneTargets(x     )           { return counterHolders(x.s).filter(u => u !== x.self); }
function powerStoneCan(x     )          {
  const s = x.s;
  return s.turnPlayer === x.player && (s.cards[x.self].counters.magic ?? 0) > 0 && powerStoneTargets(x).length > 0;
}
/** このカードの魔力カウンターを1つ取り除き、対象に1つ置く（同時）。カウンターが無くなったら破壊される */
function powerStoneMove(x     )       {
  const s = x.s;
  if (!sameCard(s, x.self, x.link .serial) || !isOnField(s.cards[x.self]) || (s.cards[x.self].counters.magic ?? 0) <= 0) return;
  if (!targetValid(s, x.link ) || counterRoom(s, x.link .targets[0]) <= 0) return;
  removeCounters(s, x.self, 1);
  placeCounters(s, x.link .targets[0], 1);
  if ((s.cards[x.self].counters.magic ?? 0) === 0) { log(s, `${nameOf(s, x.self)}の魔力カウンターが無くなったので破壊される`); destroy(s, [x.self], 'rule'); }
}
function isLinked(s           , self        , m        )          {
  const c = s.cards[self];
  return c.link === m && c.linkSerial === s.cards[m].serial;
}

function ritualSpell(spec                                 )               {
  return { id: 'e1', label: '儀式召喚する', type: 'card', ss: 1, can: x => ritualCan(x, spec), resolve: x => ritualSummon(x, spec) };
}
function oppAtkMonsters(x     )           {
  return monstersOf(x.s, opp(x.player)).filter(u => isFaceUpMonster(x.s, u) && x.s.cards[u].position === 'atk');
}
function pairsInDeck(x     )           {
  const s = x.s, deck = deckOf(s, x.player);
  return deck.filter(u => isNormal(s, u) && level(s, u) <= 4 && deck.some(v => v !== u && defOf(s, v).name === defOf(s, u).name));
}
function bottomlessTargets(x     )           {
  const s = x.s;
  if (s.battle && ['dsStart', 'beforeCalc', 'afterCalc', 'dsEnd', 'end'].includes(s.battle.step)) return [];
  const res           = [];
  for (const ev of s.lastEvents) {
    if (ev.type !== 'summoned' || ev.player !== opp(x.player)) continue;
    if (isFaceUpMonster(s, ev.uid) && currentAtk(s, ev.uid) >= 1500 && !res.includes(ev.uid)) res.push(ev.uid);
  }
  return res;
}
function judgmentModes(x     )            {
  const s = x.s, res            = [];
  const top = s.chain[s.chain.length - 1];
  if (top && top.cardActivation && top.cardKind !== 'monster' && !top.negated) res.push(1);
  const w = s.window;
  // 「召喚は無効化されない」モンスター（オシリスの天空竜）の召喚には発動できない
  if (!top && w.kind === 'priority' && w.mode === 'summoning' && w.cont.type === 'summon' && s.cards[w.cont.uid].summoning && !scriptOf(s, w.cont.uid).summonUnnegatable) res.push(2);
  return res;
}
