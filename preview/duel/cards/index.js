// カード効果（最新エラッタ後のテキストと公式データベースの補足情報に基づく）
                                                                       
                                                               
import {
  defOf, nameOf, opp, choose, chooseOne, monstersOf, allMonsters, spellTrapsOf, fieldCards, isFaceUpMonster, isMonsterZone,
  canSpecialSummon, specialSummon, sendToGy, sendToGyLogged, addToHand, destroy, release, payLp, equipCard, equippedBySelf, linkCards,
  negateActivation, negateSummon, targetValid, addLingering, newStep, log, pl, currentAtk, FIELD_ZONES, sameCard,
  placeCounters, scriptOf, removeCounters, counterHolders, counterRoom, addStatMod, drawCards, gainLp, effectDamage, negateAttack,
  banish, isOnField, isImmune, emit, millTop, randomOf, freeMZones, moveCard, currentDef, targetable, swapControl, advanceSummonNow, pushAnim, pickMZone, releasable, paysCost, normalSummonNow, createTokens, takeControl, setFaceDown, changePositionByEffect, isToken, summonedThisTurn, shuffleDeck, specialSummonedThisTurn, tributesFor, freeSZones, advanceTributeSets, extraSummonedThisTurn,
} from '../engine/game.js?v=20261121-1618-480d81464d';
                                                              
import {
  target, countDragons, ritualCan, ritualSummon, fusionCan, fusionSummon, isNormal, isRitualMonster, level, deckOf, handOf, gyOf, oppMonsters,
  deckMaterialSet, sendDeckMaterials,
} from './common.js?v=20261121-1618-480d81464d';
                                              

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
        const opts = deckOf(s, x.player).filter(u => defOf(s, u).kind === 'monster' && !defOf(s, u).defUnknown && (defOf(s, u).def ?? 0) <= 1500);
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
        // 同じカードが何か所にもある時は、まず「どこから」を選ぶ（カードの見た目が同じで区別しにくいため）
        const ZN                         = { hand: '手札', deck: 'デッキ', gy: '墓地' };
        const zones = [...new Set(opts.map(u => s.cards[u].zone))];
        const from = zones.length > 1 ? zones[choose(x, { kind: 'option', prompt: '「ブラック・マジシャン」をどこから特殊召喚しますか？', options: zones.map(z => ZN[z] ?? z) })] : zones[0];
        const u = chooseOne(x, `特殊召喚する「ブラック・マジシャン」を選んでください（${ZN[from] ?? from}）`, opts.filter(v => s.cards[v].zone === from));
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
      activate: x => { target(x, 'リリースする自分のモンスターを選んでください', relMons(x.s, x.player)); },
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
        sendToGyLogged(s, [g], 'effect');
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
        sendToGyLogged(s, [cost], 'cost');
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

  /* ================= デッキ dno8（サイバーダーク）の更新（2026-11-20）で追加 ================= */
  /* 神の警告 */
  '9008': {
    effects: [{
      id: 'e1', label: '2000LPを払い、召喚する効果の発動または召喚を無効にし破壊', type: 'card', ss: 3, damageStep: true, summonWindow: true,
      can: x => x.s.players[x.player].lp >= 2000 && warningModes(x).length > 0,
      activate: x => {
        const s = x.s;
        const modes = warningModes(x);
        const m = modes.length > 1 ? modes[choose(x, { kind: 'option', prompt: 'どちらの効果を発動しますか？', options: modes.map(v => v === 1 ? '召喚する効果の発動を無効' : '召喚を無効') })] : modes[0];
        payLp(s, x.player, 2000);
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
  /* 万能地雷グレイモヤ */
  '4692': {
    effects: [{
      id: 'e1', label: '相手の攻撃表示モンスターの内、攻撃力が一番高いモンスター1体を破壊', type: 'card', ss: 2,
      can: x => !!x.s.battle && x.s.battle.step === 'declared' && x.s.cards[x.s.battle.attacker].controller === opp(x.player) && oppAtkMonsters(x).length > 0,
      // 対象を取らない。処理する時に、攻撃表示モンスターの中で攻撃力が一番高いもの（同じなら選ぶ）を破壊する
      resolve: x => {
        const list = oppAtkMonsters(x);
        if (!list.length) return;
        const max = Math.max(...list.map(u => currentAtk(x.s, u)));
        const top = list.filter(u => currentAtk(x.s, u) === max);
        const u = top.length > 1 ? chooseOne(x, '破壊するモンスターを選んでください（攻撃力が一番高いモンスターが複数）', top) : top[0];
        if (u !== null) destroy(x.s, [u], 'effect');
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
      activate: x => { sendToGyLogged(x.s, [x.self], 'cost'); },
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
      resolve: x => { if (sameCard(x.s, x.self, x.link .serial) && isMonsterZone(x.s.cards[x.self])) sendToGyLogged(x.s, [x.self], 'effect'); },
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
      resolve: x => { if (sameCard(x.s, x.self, x.link .serial) && isMonsterZone(x.s.cards[x.self])) sendToGyLogged(x.s, [x.self], 'effect'); },
    }],
  },
  /* 見習い魔術師 */
  '5650': {
    effects: [{
      id: 'e1', label: '①：フィールドのカード1枚に魔力カウンターを1つ置く', type: 'trigger', ss: 1, damageStep: true,
      trigger: { mandatory: true, when: false, match: (s, self, ev) => ev.type === 'summoned' && ev.uid === self },
      // 置けるカードが無くても発動する（補足情報。処理は何もしない）
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
        sendToGyLogged(x.s, [m], 'cost');
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
      activate: x => { x.link .targets.push(x.s.battle .attacker); }, // 「対象：」の記録は発動の処理（エンジン）がまとめて出す
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
        const others = relMons(s, x.player).filter(u => u !== x.self);
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
    endWipe: true,
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
        if (u !== null) sendToGyLogged(x.s, [u], 'effect');
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
      activate: x => { if (paysCost(x)) millTop(x.s, x.player, 3, 'cost'); },
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
        if (u !== null) sendToGyLogged(x.s, [u], 'effect');
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

  /* ================= デッキ dno11（D-HEROデッキ）で追加 ================= */
  /* D-HERO デビルガイ */
  '6658': {
    effects: [{
      id: 'e1', label: '①：相手モンスター1体を2回目の自分スタンバイフェイズまで除外', type: 'ignition', ss: 1, opt: 'card',
      // 表側攻撃表示の場合に発動と処理ができる。既に攻撃宣言したターンには発動できない
      can: x => x.s.cards[x.self].position === 'atk' && x.s.opt[`${x.player}:attackDecl`] !== x.s.turn && monstersOf(x.s, opp(x.player)).length > 0,
      activate: x => {
        // 「このカード名の効果を発動するターン、自分は攻撃宣言できない」
        addLingering(x.s, { type: 'noAttackDecl', player: x.player, turn: x.s.turn });
        target(x, '除外する相手モンスターを選んでください', monstersOf(x.s, opp(x.player)));
      },
      resolve: x => {
        const s = x.s, t = x.link .targets[0];
        if (!isFaceUpMonster(s, x.self) || s.cards[x.self].position !== 'atk' || !sameCard(s, x.self, x.link .serial)) return;
        if (!targetValid(s, x.link ) || !isMonsterZone(s.cards[t]) || s.cards[t].controller === x.player) return;
        const c = s.cards[t], faceUp = c.faceUp, position = c.position ?? 'atk', controller = c.controller;
        banish(s, [t], 'effect');
        if (s.cards[t].zone !== 'banished') return;
        // 裏側で除外したモンスターは、このターンのエンドフェイズに裏側守備表示で戻る
        addLingering(s, faceUp
          ? { type: 'returnToField', uid: t, serial: s.cards[t].serial, player: x.player, turnsLeft: 2, controller, position, faceUp: true, turn: s.turn + 4 }
          : { type: 'returnToField', uid: t, serial: s.cards[t].serial, player: x.player, atEnd: true, controller, position: 'def', faceUp: false, turn: s.turn });
      },
    }],
  },
  /* E・HERO エアーマン */
  '6784': {
    effects: [{
      id: 'e1', label: '①：魔法・罠を破壊するか、「HERO」を手札に加える', type: 'trigger', ss: 1, damageStep: true,
      trigger: { mandatory: false, when: true, match: (s, self, ev) => ev.type === 'summoned' && ev.uid === self && ev.how !== 'flip' },
      can: x => airmanModes(x).length > 0,
      activate: x => {
        const modes = airmanModes(x);
        const m = modes.length > 1 ? modes[choose(x, { kind: 'option', prompt: 'どちらの効果を発動しますか？', options: modes.map(v => v === 0 ? '他の「HERO」の数まで魔法・罠を破壊' : 'デッキから「HERO」を手札に加える') })] : modes[0];
        x.link .data.mode = m;
      },
      resolve: x => {
        const s = x.s;
        if (x.link .data.mode === 0) {
          const n = otherHeroes(x).length, sts = [...spellTrapsOf(s, 0), ...spellTrapsOf(s, 1)];
          if (!n || !sts.length) return;
          const pick = choose(x, { kind: 'cards', prompt: `破壊する魔法・罠カードを${Math.min(n, sts.length)}枚まで選んでください`, options: sts, min: 1, max: Math.min(n, sts.length) });
          destroy(s, pick, 'effect');
        } else {
          const u = chooseOne(x, '手札に加える「HERO」モンスターを選んでください', deckOf(s, x.player).filter(u => isHeroMonster(s, u)));
          if (u !== null) addToHand(s, [u]);
        }
      },
    }],
  },
  /* D-HERO ダイヤモンドガイ */
  '6660': {
    effects: [{
      id: 'e1', label: '①：デッキの一番上をめくり、通常魔法なら墓地へ（次の自分ターンにその効果を発動できる）', type: 'ignition', ss: 1, opt: 'card',
      can: x => x.s.players[x.player].deck.length > 0,
      resolve: x => {
        const s = x.s, deck = s.players[x.player].deck;
        if (!deck.length) return;
        const u = deck[deck.length - 1], d = defOf(s, u);
        log(s, `${pl(x.player)}：デッキの一番上をめくる（${nameOf(s, u)}）`);
        if (d.kind === 'spell' && d.subtype === '通常') {
          sendToGy(s, [u], 'effect');
          // 次の自分ターンのメインフェイズに、その通常魔法カードの発動時の効果を発動できる
          if (s.cards[u].zone === 'gy') addLingering(s, { type: 'diamondSpell', player: x.player, uid: u, serial: s.cards[u].serial, turn: s.turn + 2 });
        } else {
          moveCard(s, u, 'deck', { bottom: true });
          log(s, `${nameOf(s, u)}をデッキの一番下に戻す`);
        }
      },
    }],
  },
  /* D-HERO ダッシュガイ */
  '6753': {
    defAfterAttack: true,
    effects: [{
      id: 'e1', label: '①：他のモンスター1体をリリースし、攻撃力をターン終了時まで1000アップ', type: 'ignition', ss: 1, opt: 'card',
      can: x => relMons(x.s, x.player).some(u => u !== x.self),
      activate: x => { const u = chooseOne(x, 'リリースするモンスターを選んでください（コスト）', relMons(x.s, x.player).filter(u => u !== x.self)) ; release(x.s, [u], 'cost'); },
      resolve: x => { if (isFaceUpMonster(x.s, x.self) && sameCard(x.s, x.self, x.link .serial)) addStatMod(x.s, x.self, 1000, 0, true); },
    }, {
      id: 'e3', label: '③：ドローしたモンスターを特殊召喚', type: 'trigger', ss: 1, zones: ['gy'],
      trigger: {
        mandatory: false, when: true,
        match: (s, self, ev) => ev.type === 'drew' && s.cards[self].zone === 'gy' && !s.cards[self].counters.dashUsed && ev.player === s.cards[self].owner
          && s.phase === 'draw' && s.turnPlayer === ev.player && defOf(s, ev.uid).kind === 'monster',
      },
      can: x => dashDrawn(x) !== null,
      activate: x => {
        const s = x.s, u = dashDrawn(x) ;
        s.cards[x.self].counters.dashUsed = 1; // 墓地に存在する限り1度だけ
        log(s, `${pl(x.player)}：ドローした${nameOf(s, u)}を見せる`);
        x.link .data.u = u; x.link .data.serial = s.cards[u].serial;
      },
      resolve: x => {
        const s = x.s, u = x.link .data.u          ;
        if (!sameCard(s, x.self, x.link .serial) || s.cards[x.self].zone !== 'gy') return;
        if (sameCard(s, u, x.link .data.serial          ) && s.cards[u].zone === 'hand') specialSummon(x, [u]);
      },
    }],
  },
  /* D-HERO ディアボリックガイ */
  '6949': {
    effects: [{
      id: 'e1', label: '①：墓地のこのカードを除外し、デッキから「D-HERO ディアボリックガイ」を特殊召喚', type: 'ignition', ss: 1, zones: ['gy'],
      can: x => deckOf(x.s, x.player).some(u => defOf(x.s, u).name === 'D-HERO ディアボリックガイ' && canSpecialSummon(x.s, u, x.player, 'special', [], x.self)),
      activate: x => { log(x.s, `${pl(x.player)}：${nameOf(x.s, x.self)}を除外`); banish(x.s, [x.self], 'cost'); },
      resolve: x => {
        const u = chooseOne(x, '特殊召喚する「D-HERO ディアボリックガイ」を選んでください', deckOf(x.s, x.player).filter(u => defOf(x.s, u).name === 'D-HERO ディアボリックガイ' && canSpecialSummon(x.s, u, x.player)));
        if (u !== null) specialSummon(x, [u]);
      },
    }],
  },
  /* D-HERO ディスクガイ */
  '7095': {
    // 墓地へ送られたターンには墓地から特殊召喚できない（効果ではない）
    specialSummonOk: (s, self) => !(s.cards[self].zone === 'gy' && s.cards[self].counters.gyTurn === s.turn),
    effects: [{
      id: 'e1', label: '①：2枚ドロー（デュエル中に1度）', type: 'trigger', ss: 1, damageStep: true,
      trigger: { mandatory: false, when: false, match: (s, self, ev) => ev.type === 'summoned' && ev.uid === self && ev.how === 'special' && ev.from === 'gy' },
      can: x => x.s.players[x.player].deck.length >= 2 && !x.s.opt[`${x.player}:duel:7095`],
      activate: x => { x.s.opt[`${x.player}:duel:7095`] = 1; }, // このカード名の効果はデュエル中に1度しか使用できない
      resolve: x => { drawCards(x.s, x.player, 2); },
    }],
  },
  /* D-HERO ドゥームガイ */
  '6756': {
    // 戦闘で破壊され墓地へ送られた：次の自分のスタンバイフェイズに発動する印
    onDestroyed: (s, before, reason) => { const c = s.cards[before.uid]; if (reason === 'battle' && c.zone === 'gy') c.counters.doom = s.turn; },
    effects: [{
      id: 'e1', label: '墓地の「D-HERO」1体を特殊召喚', type: 'trigger', ss: 1, zones: ['gy'],
      trigger: {
        mandatory: true, when: false,
        match: (s, self, ev) => ev.type === 'phase' && ev.phase === 'standby' && s.cards[self].zone === 'gy' && ev.player === s.cards[self].owner && (s.cards[self].counters.doom ?? s.turn) < s.turn,
      },
      can: x => doomTargets(x).length > 0,
      activate: x => { delete x.s.cards[x.self].counters.doom; target(x, '特殊召喚する「D-HERO」モンスターを選んでください', doomTargets(x)); },
      resolve: x => { const t = x.link .targets[0]; if (targetValid(x.s, x.link ) && x.s.cards[t].zone === 'gy') specialSummon(x, [t]); },
    }],
  },
  /* D-HERO ドグマガイ */
  '6757': {
    cannotNormalSummon: true,
    specialSummonOk: () => false,
    procSummon: {
      zones: ['hand'], label: '「D-HERO」を含む自分のモンスター3体をリリースして特殊召喚',
      can: (s, _self, p) => relMons(s, p).length >= 3 && relMons(s, p).some(u => isDHero(s, u)),
      pay: x => {
        const s = x.s, mine = relMons(s, x.player);
        const h = chooseOne(x, 'リリースする「D-HERO」モンスターを選んでください', mine.filter(u => isDHero(s, u))) ;
        const rest = choose(x, { kind: 'cards', prompt: 'ほかにリリースするモンスターを2体選んでください', options: mine.filter(u => u !== h), min: 2, max: 2 });
        release(s, [h, ...rest]);
        newStep(s); // リリースと特殊召喚は同時に行われない
      },
    },
    effects: [{
      id: 'e1', label: '①：相手のLPを半分にする', type: 'trigger', ss: 1,
      trigger: {
        mandatory: true, when: false,
        match: (s, self, ev) => ev.type === 'phase' && ev.phase === 'standby' && isFaceUpMonster(s, self) && !!s.cards[self].counters.byProc
          && ev.player === opp(s.cards[self].controller) && s.cards[self].summonedTurn === s.turn - 1,
      },
      resolve: x => {
        const s = x.s, o = opp(x.player), lp = s.players[o].lp;
        s.players[o].lp = Math.ceil(lp / 2);
        log(s, `${pl(o)}のLPは半分になった（LP ${s.players[o].lp}）`);
      },
    }],
  },
  /* D-HERO Bloo-D */
  '7096': {
    cannotNormalSummon: true,
    specialSummonOk: () => false,
    procSummon: {
      zones: ['hand'], label: '自分のモンスター3体をリリースして特殊召喚',
      can: (s, _self, p) => relMons(s, p).length >= 3,
      pay: x => {
        const pick = choose(x, { kind: 'cards', prompt: 'リリースするモンスターを3体選んでください', options: relMons(x.s, x.player), min: 3, max: 3 });
        release(x.s, pick);
        newStep(x.s);
      },
    },
    // ①：相手フィールドの表側表示モンスターの効果は無効化される
    negatesMonster: (s, self, t) => s.cards[t].controller !== s.cards[self].controller,
    effects: [equipEnemyEffect('e2', '②：相手モンスター1体を装備する')],
    // ③：装備したモンスターの元々の攻撃力の半分アップ
    statAdd: (s, self) => { const e = equippedBySelf(s, self); return { atk: e !== null && s.cards[e].faceUp ? Math.ceil((defOf(s, e).atk ?? 0) / 2) : 0, def: 0 }; },
  },
  /* D-HERO ドレッドガイ */
  '6661': {
    // ②：特殊召喚時に適用。このターン、自分の「D-HERO」は破壊されず、その戦闘で自分への戦闘ダメージは0
    onSpecialSummoned: (s, self) => { addLingering(s, { type: 'dheroProtect', player: s.cards[self].controller, turn: s.turn }); log(s, 'このターン、「D-HERO」モンスターは破壊されず、その戦闘で受ける戦闘ダメージは0'); },
    // ③：自分フィールドの他の「D-HERO」の元々の攻撃力の合計
    statSet: (s, self) => {
      const n = monstersOf(s, s.cards[self].controller).filter(u => u !== self && isFaceUpMonster(s, u) && isDHero(s, u)).reduce((a, u) => a + (defOf(s, u).atk ?? 0), 0);
      return { atk: n, def: n };
    },
    effects: [{
      id: 'e1', label: '①：「D-HERO」以外を破壊し、墓地の「D-HERO」を2体まで特殊召喚', type: 'trigger', ss: 1, damageStep: true,
      trigger: {
        mandatory: true, when: false,
        match: (s, self, ev) => ev.type === 'summoned' && ev.uid === self && ev.how === 'special' && !!s.resolving && defOf(s, s.resolving.uid).name === '幽獄の時計塔',
      },
      resolve: x => {
        const s = x.s, p = x.player;
        const others = monstersOf(s, p).filter(u => !(s.cards[u].faceUp && isDHero(s, u)));
        if (others.length) destroy(s, others, 'effect');
        newStep(s); // 2つの処理は同時に行われない
        const gy = gyOf(s, p).filter(u => isDHero(s, u) && defOf(s, u).kind === 'monster' && canSpecialSummon(s, u, p));
        if (!gy.length) return;
        const max = Math.min(2, gy.length, freeMZones(s, p).length);
        const pick = choose(x, { kind: 'cards', prompt: `墓地から特殊召喚する「D-HERO」を${max}体まで選んでください`, options: gy, min: 0, max });
        if (pick.length) specialSummon(x, pick);
      },
    }],
  },
  /* デステニー・ドロー */
  '6950': {
    effects: [{
      id: 'e1', label: '「D-HERO」カードを1枚捨て、2枚ドロー', type: 'card', ss: 1,
      can: x => x.s.players[x.player].deck.length >= 2 && (!paysCost(x) || handOf(x.s, x.player).some(u => u !== x.self && isDHero(x.s, u))),
      activate: x => {
        if (!paysCost(x)) return;
        const c = chooseOne(x, '捨てる「D-HERO」カードを選んでください（コスト）', handOf(x.s, x.player).filter(u => isDHero(x.s, u))) ;
        log(x.s, `${pl(x.player)}：${nameOf(x.s, c)}を捨てる`);
        sendToGy(x.s, [c], 'discard');
      },
      resolve: x => { drawCards(x.s, x.player, 2); },
    }],
  },
  /* オーバー・デステニー */
  '6951': {
    effects: [{
      id: 'e1', label: '墓地の「D-HERO」のレベルの半分以下の「D-HERO」をデッキから特殊召喚', type: 'card', ss: 1,
      can: x => overDestinyTargets(x).length > 0,
      activate: x => { target(x, '対象にする墓地の「D-HERO」モンスターを選んでください', overDestinyTargets(x)); },
      resolve: x => {
        const s = x.s, t = x.link .targets[0];
        if (!targetValid(s, x.link ) || s.cards[t].zone !== 'gy') return;
        const u = chooseOne(x, 'デッキから特殊召喚する「D-HERO」モンスターを選んでください', halfLevelDHeroes(x, level(s, t)));
        if (u === null || !specialSummon(x, [u]).length) return;
        addLingering(s, { type: 'destroyAtEnd', uid: u, serial: s.cards[u].serial, turn: s.turn });
      },
    }],
  },
  /* スケープ・ゴート */
  '4818': {
    effects: [{
      id: 'e1', label: '「羊トークン」4体を守備表示で特殊召喚', type: 'card', ss: 2,
      // 既に召喚・反転召喚・特殊召喚したターンには発動できない。メインモンスターゾーンが4か所以上空いていること
      can: x => !summonedThisTurn(x.s, x.player) && freeMZones(x.s, x.player).length >= 4,
      activate: x => { addLingering(x.s, { type: 'noSummonExcept', player: x.player, uid: x.self, turn: x.s.turn }); },
      resolve: x => { if (freeMZones(x.s, x.player).length >= 4) createTokens(x, 'token:sheep', 4, 'def'); },
    }],
  },
  /* 羊トークン：アドバンス召喚のためにはリリースできない */
  'token:sheep': { noAdvanceTribute: true },
  /* 増援 */
  '5328': {
    effects: [{
      id: 'e1', label: 'デッキからレベル4以下の戦士族を手札に加える', type: 'card', ss: 1,
      can: x => reinforceTargets(x).length > 0,
      resolve: x => { const u = chooseOne(x, '手札に加える戦士族モンスターを選んでください', reinforceTargets(x)); if (u !== null) addToHand(x.s, [u]); },
    }],
  },
  /* テラ・フォーミング */
  '5537': {
    effects: [{
      id: 'e1', label: 'デッキからフィールド魔法を手札に加える', type: 'card', ss: 1,
      can: x => fieldSpellsInDeck(x).length > 0,
      resolve: x => { const u = chooseOne(x, '手札に加えるフィールド魔法カードを選んでください', fieldSpellsInDeck(x)); if (u !== null) addToHand(x.s, [u]); },
    }],
  },
  /* ダーク・シティ */
  '6758': {
    effects: [{ id: 'e1', label: '発動する', type: 'card', ss: 1, resolve: () => {} }],
    // ①：「D-HERO」がより攻撃力の高いモンスターを攻撃した場合、ダメージ計算時のみ1000アップ（お互いの「D-HERO」に適用）
    battleAtkBonus: (s, _self, a, t) => (t !== null && isDHero(s, a) && currentAtk(s, t) > currentAtk(s, a) ? 1000 : 0),
  },
  /* 幽獄の時計塔 */
  '6668': {
    noBattleDamageFor: (s, self, p) => p === s.cards[self].controller && (s.cards[self].counters.clock ?? 0) >= 4,
    effects: [{ id: 'e1', label: '発動する', type: 'card', ss: 1, resolve: () => {} }, {
      id: 'e2', label: '時計カウンターを1つ置く', type: 'trigger', ss: 1, zones: ['fzone'],
      trigger: { mandatory: true, when: false, match: (s, self, ev) => ev.type === 'phase' && ev.phase === 'standby' && s.cards[self].zone === 'fzone' && s.cards[self].faceUp && ev.player === opp(s.cards[self].controller) },
      resolve: x => {
        const c = x.s.cards[x.self];
        if (!sameCard(x.s, x.self, x.link .serial) || c.zone !== 'fzone' || !c.faceUp) return;
        c.counters.clock = (c.counters.clock ?? 0) + 1;
        log(x.s, `${nameOf(x.s, x.self)}に時計カウンターを1つ置く（${c.counters.clock}）`);
      },
    }, {
      id: 'e3', label: '手札・デッキから「D-HERO ドレッドガイ」を特殊召喚', type: 'trigger', ss: 1, zones: ['gy'], damageStep: true,
      trigger: { mandatory: true, when: true, match: (s, self, ev) => ev.type === 'destroyed' && ev.uid === self && ev.from === 'fzone' && s.cards[self].zone === 'gy' && (ev.prevCounters?.clock ?? 0) >= 4 },
      resolve: x => {
        const s = x.s, p = x.player;
        const u = chooseOne(x, '特殊召喚する「D-HERO ドレッドガイ」を選んでください', [...handOf(s, p), ...deckOf(s, p)].filter(u => defOf(s, u).name === 'D-HERO ドレッドガイ' && canSpecialSummon(s, u, p)));
        if (u !== null) specialSummon(x, [u]);
      },
    }],
  },
  /* ライトニング・ボルテックス */
  '5217': {
    effects: [{
      id: 'e1', label: '手札を1枚捨て、相手の表側表示モンスターを全て破壊', type: 'card', ss: 1,
      can: x => (!paysCost(x) || handOf(x.s, x.player).some(u => u !== x.self)) && oppFaceUp(x).length > 0,
      activate: x => {
        if (!paysCost(x)) return;
        const c = chooseOne(x, '捨てる手札を選んでください（コスト）', handOf(x.s, x.player).filter(u => u !== x.self)) ;
        log(x.s, `${pl(x.player)}：${nameOf(x.s, c)}を捨てる`);
        sendToGy(x.s, [c], 'discard');
      },
      resolve: x => { const t = oppFaceUp(x); if (t.length) destroy(x.s, t, 'effect'); },
    }],
  },
  /* デステニー・シグナル */
  '6679': {
    effects: [{
      id: 'e1', label: '手札・デッキからレベル4以下の「D-HERO」を特殊召喚', type: 'card', ss: 2, damageStep: true,
      can: x => x.s.lastEvents.some(e => e.type === 'destroyed' && e.reason === 'battle' && e.controller === x.player && x.s.cards[e.uid].zone === 'gy') && signalTargets(x).length > 0,
      resolve: x => { const u = chooseOne(x, '特殊召喚する「D-HERO」モンスターを選んでください', signalTargets(x)); if (u !== null) specialSummon(x, [u]); },
    }],
  },
  /* D－カウンター */
  '6952': {
    effects: [{
      id: 'e1', label: '攻撃モンスターを破壊', type: 'card', ss: 2,
      can: x => {
        const b = x.s.battle;
        return !!b && b.step === 'declared' && !b.negated && b.target !== null && x.s.cards[b.attacker].controller === opp(x.player)
          && x.s.cards[b.target].controller === x.player && isFaceUpMonster(x.s, b.target) && isDHero(x.s, b.target);
      },
      activate: x => { x.link .data.a = x.s.battle .attacker; x.link .data.serial = x.s.cards[x.s.battle .attacker].serial; },
      resolve: x => { const a = x.link .data.a          ; if (sameCard(x.s, a, x.link .data.serial          ) && isMonsterZone(x.s.cards[a])) destroy(x.s, [a], 'effect'); },
    }],
  },
  /* マジック・ジャマー */
  '4862': {
    effects: [{
      id: 'e1', label: '手札を1枚捨て、魔法カードの発動を無効にし破壊', type: 'card', ss: 3, damageStep: true,
      can: x => {
        const top = x.s.chain[x.s.chain.length - 1];
        return !!top && top.cardActivation && top.cardKind === 'spell' && !top.negated && x.s.players[x.player].hand.length > 0;
      },
      activate: x => {
        x.link .data.index = x.s.chain.length - 1;
        const c = chooseOne(x, '捨てる手札を選んでください（コスト）', handOf(x.s, x.player)) ;
        log(x.s, `${pl(x.player)}：${nameOf(x.s, c)}を捨てる`);
        sendToGy(x.s, [c], 'discard');
      },
      resolve: x => { negateActivation(x.s, x.s.chain[x.link .data.index          ]); },
    }],
  },

  /* ================= デッキ dno12（絵札の騎士デッキ）で追加 ================= */
  /* キングス・ナイト */
  '5558': {
    effects: [{
      id: 'e1', label: '①：デッキから「ジャックス・ナイト」を特殊召喚', type: 'trigger', ss: 1,
      trigger: { mandatory: false, when: true, match: (s, self, ev) => ev.type === 'summoned' && ev.uid === self && (ev.how === 'normal' || ev.how === 'advance') },
      // 発動するタイミングで、自分フィールドに表側表示の「クィーンズ・ナイト」が存在すること
      can: x => monstersOf(x.s, x.player).some(u => isFaceUpMonster(x.s, u) && defOf(x.s, u).name === 'クィーンズ・ナイト') && jacks(x).length > 0,
      resolve: x => { const u = chooseOne(x, '特殊召喚する「ジャックス・ナイト」を選んでください', jacks(x)); if (u !== null) specialSummon(x, [u]); },
    }],
  },
  /* 異次元の女戦士 */
  '5719': {
    effects: [{
      id: 'e1', label: '①：戦闘を行ったそれぞれのモンスターを除外', type: 'trigger', ss: 1, damageStep: true,
      trigger: {
        mandatory: false, when: false,
        match: (s, self, ev) => ev.type === 'afterDamageCalc' && ev.target !== null && (ev.attacker === self || ev.target === self)
          && isMonsterZone(s.cards[self]) && s.cards[ev.attacker].controller !== s.cards[ev.target].controller,
      },
      activate: x => {
        const b = x.s.battle , other = b.attacker === x.self ? b.target  : b.attacker;
        x.link .data.other = other; x.link .data.oserial = x.s.cards[other].serial;
      },
      resolve: x => {
        const s = x.s, o = x.link .data.other          , list           = [];
        if (sameCard(s, x.self, x.link .serial) && isMonsterZone(s.cards[x.self])) list.push(x.self);
        if (sameCard(s, o, x.link .data.oserial          ) && isMonsterZone(s.cards[o])) list.push(o);
        if (list.length) { log(s, `${list.map(u => nameOf(s, u)).join('、')}を除外`); banish(s, list, 'effect'); }
      },
    }],
  },
  /* コマンド・ナイト */
  '5017': {
    // ①：自分フィールドの戦士族モンスターの攻撃力は400アップ（このカード自身にも適用）
    statAdd: () => ({ atk: 400, def: 0 }),
    aura: (s, self, t) => (s.cards[t].controller === s.cards[self].controller && defOf(s, t).race === '戦士族' ? { atk: 400, def: 0 } : null),
    // ②：自分フィールドに他のモンスターが存在する限り、相手はこのカードを攻撃対象に選択できない
    cannotBeAttackTarget: (s, self) => monstersOf(s, s.cards[self].controller).some(u => u !== self),
  },
  /* 無敗将軍 フリード */
  '5316': {
    negatesSpellTargeting: true,
    drawReplace: (s, self) => deckOf(s, s.cards[self].controller).filter(u => defOf(s, u).kind === 'monster' && defOf(s, u).race === '戦士族' && level(s, u) <= 4),
  },
  /* 翻弄するエルフの剣士：攻撃力1900以上のモンスターとの戦闘では破壊されない */
  '5244': {
    battleIndestructibleVs: (s, _self, other) => other !== null && currentAtk(s, other) >= 1900,
  },
  /* 旗鼓堂々 */
  '10797': {
    effects: [{
      id: 'e1', label: '墓地の装備魔法をモンスターに装備する（エンドフェイズに破壊）', type: 'card', ss: 2, hardOpt: true,
      can: x => gyEquips(x).some(e => equipTargets(x.s, e).length > 0),
      activate: x => {
        // このカードを発動したターン、自分はモンスターを特殊召喚できない
        addLingering(x.s, { type: 'noSpecial', player: x.player, turn: x.s.turn });
        const e = target(x, '装備する墓地の装備魔法カードを選んでください', gyEquips(x).filter(e => equipTargets(x.s, e).length > 0));
        target(x, '装備するモンスターを選んでください', equipTargets(x.s, e));
      },
      resolve: x => {
        const s = x.s, [e, t] = x.link .targets;
        if (!targetValid(s, x.link , 0) || !targetValid(s, x.link , 1) || s.cards[e].zone !== 'gy' || !isFaceUpMonster(s, t)) return;
        if (!equipTargets(s, e).includes(t) || !freeSZones(s, x.player).length) return;
        moveCard(s, e, 'szone', { index: freeSZones(s, x.player)[0], faceUp: true, controller: x.player });
        equipCard(s, e, t, { stay: true });
        log(s, `${nameOf(s, e)}を${nameOf(s, t)}に装備`);
        addLingering(s, { type: 'destroyAtEnd', uid: e, serial: s.cards[e].serial, turn: s.turn });
      },
    }],
  },
  /* 拘束解放波 */
  '8335': {
    effects: [{
      id: 'e1', label: '自分の装備魔法と、相手のセットされた魔法・罠を全て破壊', type: 'card', ss: 1,
      can: x => ownFaceUpEquips(x).length > 0 && oppSetST(x).length > 0,
      activate: x => { target(x, '破壊する自分の装備魔法カードを選んでください', ownFaceUpEquips(x)); },
      resolve: x => {
        const s = x.s, t = x.link .targets[0], list = oppSetST(x);
        if (targetValid(s, x.link ) && isOnField(s.cards[t])) list.unshift(t);
        if (list.length) destroy(s, list, 'effect'); // 同時に破壊する
      },
    }],
  },
  /* 強欲で謙虚な壺 */
  '8993': {
    effects: [{
      id: 'e1', label: 'デッキの上から3枚をめくり、1枚を手札に加える', type: 'card', ss: 1, hardOpt: true,
      // モンスターを特殊召喚したターンには発動できない。発動したターンは特殊召喚できない
      can: x => x.s.players[x.player].deck.length >= 3 && !specialSummonedThisTurn(x.s, x.player),
      activate: x => { if (paysCost(x)) addLingering(x.s, { type: 'noSpecial', player: x.player, turn: x.s.turn }); },
      resolve: x => {
        const s = x.s, deck = s.players[x.player].deck, top = deck.slice(-3).reverse();
        if (!top.length) return;
        log(s, `${pl(x.player)}：デッキの上から${top.length}枚をめくる（${top.map(u => nameOf(s, u)).join('、')}）`);
        const u = chooseOne(x, '手札に加えるカードを選んでください', top) ;
        addToHand(s, [u]);
        newStep(s); // 残りをデッキに戻してシャッフル
        shuffleDeck(s, x.player);
        log(s, `${pl(x.player)}：残りのカードをデッキに戻してシャッフル`);
      },
    }],
  },
  /* 最強の盾 */
  '10539': {
    equipOk: (s, _self, t) => defOf(s, t).race === '戦士族',
    effects: [equipSpell('戦士族モンスターに装備する')],
    // 攻撃表示：攻撃力は元々の守備力分アップ／守備表示：守備力は元々の攻撃力分アップ
    aura: (s, self, t) => {
      if (s.cards[self].equippedTo !== t) return null;
      const d = defOf(s, t);
      return s.cards[t].position === 'atk' ? { atk: d.def ?? 0, def: 0 } : { atk: 0, def: d.atk ?? 0 };
    },
  },
  /* 死皇帝の陵墓 */
  '6759': {
    effects: [{ id: 'e1', label: '発動する', type: 'card', ss: 1, resolve: () => {} }, {
      id: 'e2', label: '①：LPを払い、リリースが必要な手札のモンスター1体をリリースなしで通常召喚できるようにする', type: 'ignition', ss: 1, zones: ['fzone'], anyPlayer: true,
      can: x => tombModes(x).length > 0,
      activate: x => {
        const modes = tombModes(x);
        const n = modes.length > 1 ? modes[choose(x, { kind: 'option', prompt: 'どちらの効果を発動しますか？', options: modes.map(v => `${v * 1000}LPを払い、${v}体のリリースが必要なモンスター`) })] : modes[0];
        payLp(x.s, x.player, n * 1000);
        x.link .data.n = n;
      },
      resolve: x => {
        const s = x.s, n = x.link .data.n          ;
        if (s.players[x.player].normalSummonUsed) return;
        const u = chooseOne(x, `リリースなしで通常召喚するモンスター（${n}体のリリースが必要）を選んでください`, tombMonsters(x, n));
        if (u === null) return;
        // 効果の処理の中で、リリースなしで通常召喚（セットもできる）
        const set = !scriptOf(s, u).cannotSet && choose(x, { kind: 'option', prompt: `${nameOf(s, u)}をどうしますか？`, options: ['召喚する', 'セットする'] }) === 1;
        normalSummonNow(x, u, set);
      },
    }],
  },
  /* 収縮 */
  '5355': {
    effects: [{
      id: 'e1', label: '表側表示モンスター1体の元々の攻撃力をターン終了時まで半分にする', type: 'card', ss: 2, damageStep: true,
      // ダメージステップはダメージ計算前まで
      can: x => !(x.s.battle && ['afterCalc', 'dsEnd', 'end'].includes(x.s.battle.step)) && allMonsters(x.s).some(u => isFaceUpMonster(x.s, u)),
      activate: x => { target(x, '対象のモンスターを選んでください', allMonsters(x.s).filter(u => isFaceUpMonster(x.s, u))); },
      resolve: x => {
        const s = x.s, t = x.link .targets[0];
        if (!targetValid(s, x.link ) || !isFaceUpMonster(s, t)) return;
        const base = defOf(s, t).atk ?? 0;
        addStatMod(s, t, -(base - Math.floor(base / 2)), 0, true);
        log(s, `${nameOf(s, t)}の元々の攻撃力はターン終了時まで半分になる`);
      },
    }],
  },
  /* 戦士の生還 */
  '5330': {
    effects: [{
      id: 'e1', label: '墓地の戦士族モンスター1体を手札に加える', type: 'card', ss: 1,
      can: x => gyWarriors(x).length > 0,
      activate: x => { target(x, '手札に加える戦士族モンスターを選んでください', gyWarriors(x)); },
      resolve: x => { const t = x.link .targets[0]; if (targetValid(x.s, x.link ) && x.s.cards[t].zone === 'gy') addToHand(x.s, [t]); },
    }],
  },
  /* 団結の力 */
  '5212': {
    effects: [equipSpell('モンスターに装備する')],
    // 装備モンスターの攻撃力・守備力は、自分フィールドの表側表示モンスターの数×800アップ
    aura: (s, self, t) => {
      if (s.cards[self].equippedTo !== t) return null;
      const n = monstersOf(s, s.cards[self].controller).filter(u => isFaceUpMonster(s, u)).length * 800;
      return { atk: n, def: n };
    },
  },
  /* デーモンの斧 */
  '4310': {
    effects: [equipSpell('モンスターに装備する'), {
      id: 'e2', label: '②：自分のモンスター1体をリリースし、このカードをデッキの一番上に戻す', type: 'trigger', ss: 1, zones: ['gy'], damageStep: true,
      trigger: { mandatory: false, when: true, match: (s, self, ev) => ev.type === 'toGy' && ev.uid === self && (ev.from === 'szone' || ev.from === 'fzone') && s.cards[self].zone === 'gy' },
      can: x => relMons(x.s, x.player).length > 0,
      activate: x => { const u = chooseOne(x, 'リリースするモンスターを選んでください（コスト）', relMons(x.s, x.player)) ; release(x.s, [u], 'cost'); },
      resolve: x => {
        if (!sameCard(x.s, x.self, x.link .serial) || x.s.cards[x.self].zone !== 'gy') return;
        moveCard(x.s, x.self, 'deck');
        log(x.s, `${nameOf(x.s, x.self)}をデッキの一番上に戻す`);
      },
    }],
    aura: (s, self, t) => (s.cards[self].equippedTo === t ? { atk: 1000, def: 0 } : null),
  },
  /* 脆刃の剣 */
  '14877': {
    effects: [{
      ...equipSpell('モンスターに装備する'),
      // ①：自分フィールドに1枚しか表側表示で存在できない
      can: x => !spellTrapsOf(x.s, x.player).some(u => u !== x.self && x.s.cards[u].faceUp && defOf(x.s, u).name === '脆刃の剣') && allMonsters(x.s).some(t => isFaceUpMonster(x.s, t)),
    }, {
      id: 'e3', label: '③：このカードを墓地へ送る', type: 'trigger', ss: 1, zones: ['szone'], damageStep: true,
      trigger: { mandatory: true, when: false, match: (s, self, ev) => ev.type === 'damage' && ev.battle && ev.amount >= 2000 && s.cards[self].zone === 'szone' && s.cards[self].faceUp && ev.player === s.cards[self].controller },
      resolve: x => { if (sameCard(x.s, x.self, x.link .serial) && isOnField(x.s.cards[x.self])) sendToGyLogged(x.s, [x.self], 'effect'); },
    }],
    aura: (s, self, t) => (s.cards[self].equippedTo === t ? { atk: 2000, def: 0 } : null),
    bothTakeBattleDamage: (s, self, m) => s.cards[self].equippedTo === m,
  },
  /* 融合武器ムラサメブレード */
  '5388': {
    equipOk: (s, _self, t) => defOf(s, t).race === '戦士族',
    effects: [equipSpell('戦士族モンスターに装備する')],
    aura: (s, self, t) => (s.cards[self].equippedTo === t ? { atk: 800, def: 0 } : null),
    // ②：モンスターに装備されているこのカードは効果では破壊されない
    indestructibleByEffect: (s, self) => s.cards[self].equippedTo !== null,
  },
  /* くず鉄のかかし */
  '7694': {
    staysOnField: true,
    effects: [{
      id: 'e1', label: '攻撃を無効にし、このカードをそのままセットする', type: 'card', ss: 2,
      can: x => !!x.s.battle && x.s.battle.step === 'declared' && !x.s.battle.negated && x.s.cards[x.s.battle.attacker].controller === opp(x.player),
      activate: x => { x.link .targets.push(x.s.battle .attacker); }, // 「対象：」の記録は発動の処理（エンジン）がまとめて出す
      resolve: x => {
        const s = x.s, t = x.link .targets[0];
        if (targetValid(s, x.link ) && s.battle && s.battle.attacker === t) negateAttack(s);
        newStep(s); // その後、そのままセットする（同時には行われない）
        if (sameCard(s, x.self, x.link .serial) && isOnField(s.cards[x.self])) {
          s.cards[x.self].faceUp = false;
          s.cards[x.self].enteredTurn = s.turn; // セットされたターンには発動できない
          log(s, `${nameOf(s, x.self)}をそのままセットする`);
        }
      },
    }],
  },
  /* アルカナ ナイトジョーカー */
  '6454': {
    fusionOnly: true,
    fusionMaterials: ['クィーンズ・ナイト', 'ジャックス・ナイト', 'キングス・ナイト'],
    effects: [{
      id: 'e1', label: '①：同じ種類の手札を1枚捨て、このカードを対象とする効果を無効にする', type: 'quick', ss: 2, opt: 'card',
      can: x => {
        const top = x.s.chain[x.s.chain.length - 1];
        if (!top || top.negated || top.effectNegated || !top.targets.some((t, i) => t === x.self && targetValid(x.s, top, i))) return false;
        return handOf(x.s, x.player).some(u => defOf(x.s, u).kind === top.cardKind);
      },
      activate: x => {
        const s = x.s, top = s.chain[s.chain.length - 1];
        x.link .data.index = s.chain.length - 1;
        const c = chooseOne(x, '捨てる手札を選んでください（コスト：同じ種類のカード）', handOf(s, x.player).filter(u => defOf(s, u).kind === top.cardKind)) ;
        log(s, `${pl(x.player)}：${nameOf(s, c)}を捨てる`);
        sendToGy(s, [c], 'discard');
      },
      resolve: x => {
        const l = x.s.chain[x.link .data.index          ];
        if (!l) return;
        l.effectNegated = true;
        log(x.s, `${nameOf(x.s, l.uid)}の効果を無効にした`);
      },
    }],
  },
  /* ================= デッキ dno13（月書恐竜デッキ）で追加 ================= */
  /* 暗黒恐獣：相手フィールドに守備表示モンスターしか存在しない場合、直接攻撃できる */
  '5889': {
    canDirectAttack: (s, self) => {
      const o = opp(s.cards[self].controller), mons = monstersOf(s, o);
      // 魔法・罠カードの有無は関係ない（モンスターが守備表示だけなら直接攻撃できる）
      return mons.length > 0 && mons.every(u => s.cards[u].position === 'def');
    },
  },
  /* 究極恐獣 */
  '6777': {
    attackAll: true,
    // ①：攻撃可能な「究極恐獣」が存在する場合、「究極恐獣」以外のモンスターは攻撃できない
    forbidsAttack: (s, self, m) => s.cards[m].controller === s.cards[self].controller && defOf(s, m).name !== '究極恐獣' && s.turnPlayer === s.cards[self].controller && ultimateCanAttack(s, self),
  },
  /* クリッター */
  '4054': {
    effects: [{
      id: 'e1', label: '①：デッキから攻撃力1500以下のモンスターを手札に加える', type: 'trigger', ss: 1, zones: ['gy'], damageStep: true, opt: 'name',
      trigger: { mandatory: true, when: false, match: (s, self, ev) => leftFieldTo(ev, self) && s.cards[self].zone === 'gy' },
      resolve: x => {
        const s = x.s;
        const u = chooseOne(x, '手札に加える攻撃力1500以下のモンスターを選んでください', deckOf(s, x.player).filter(u => defOf(s, u).kind === 'monster' && !defOf(s, u).atkUnknown && (defOf(s, u).atk ?? 0) <= 1500));
        if (u === null) return;
        addToHand(s, [u]);
        addLingering(s, { type: 'noActivateName', player: x.player, name: defOf(s, u).name, turn: s.turn });
      },
    }],
  },
  /* 暗黒ブラキ */
  '10924': {
    effects: [{
      id: 'e1', label: '①：フィールドのモンスター1体を表側守備表示にする', type: 'trigger', ss: 1,
      trigger: { mandatory: false, when: true, match: (s, self, ev) => ev.type === 'summoned' && ev.uid === self && (ev.how === 'normal' || ev.how === 'advance') },
      can: x => notFaceUpDef(x.s).length > 0,
      activate: x => { target(x, '表側守備表示にするモンスターを選んでください', notFaceUpDef(x.s)); },
      resolve: x => { const t = x.link .targets[0]; if (targetValid(x.s, x.link ) && isMonsterZone(x.s.cards[t]) && !(x.s.cards[t].faceUp && x.s.cards[t].position === 'def')) changePositionByEffect(x.s, t, 'def'); },
    }],
  },
  /* 竜脚獣ブラキオン */
  '7559': {
    specialSummonOk: (s, self) => s.cards[self].zone !== 'deck',
    altTribute: { count: 1, ok: (s, u) => defOf(s, u).race === '恐竜族' },
    doubleDamageWhenAttacked: true,
    effects: [{
      id: 'e1', label: '①：このカードを裏側守備表示にする', type: 'ignition', ss: 1, opt: 'card',
      resolve: x => { if (isFaceUpMonster(x.s, x.self) && sameCard(x.s, x.self, x.link .serial)) setFaceDown(x.s, [x.self]); },
    }, {
      id: 'e2', label: '②：このカード以外のフィールドのモンスターを全て裏側守備表示にする', type: 'trigger', ss: 1,
      trigger: { mandatory: true, when: false, match: (s, self, ev) => ev.type === 'summoned' && ev.uid === self && ev.how === 'flip' },
      resolve: x => { setFaceDown(x.s, allMonsters(x.s).filter(u => u !== x.self)); },
    }],
  },
  /* シールドクラッシュ */
  '6003': {
    effects: [{
      id: 'e1', label: '守備表示モンスター1体を破壊', type: 'card', ss: 1,
      can: x => defMonsters(x.s).length > 0,
      activate: x => { target(x, '破壊する守備表示モンスターを選んでください', defMonsters(x.s)); },
      resolve: x => { const t = x.link .targets[0]; if (targetValid(x.s, x.link ) && isMonsterZone(x.s.cards[t]) && x.s.cards[t].position === 'def') destroy(x.s, [t], 'effect'); },
    }],
  },
  /* 軽量化 */
  '6215': {
    effects: [{ id: 'e1', label: '発動する', type: 'card', ss: 1, resolve: () => {} }, {
      id: 'e2', label: '手札のレベル7以上のモンスターをデッキに戻してシャッフルし、1枚ドロー', type: 'ignition', ss: 1, zones: ['szone'], opt: 'card',
      can: x => handOf(x.s, x.player).some(u => defOf(x.s, u).kind === 'monster' && level(x.s, u) >= 7),
      resolve: x => {
        const s = x.s;
        const u = chooseOne(x, 'デッキに加えるレベル7以上のモンスターを選んでください', handOf(s, x.player).filter(u => defOf(s, u).kind === 'monster' && level(s, u) >= 7));
        if (u === null) return;
        moveCard(s, u, 'deck'); shuffleDeck(s, x.player);
        log(s, `${pl(x.player)}：${nameOf(s, u)}をデッキに加えてシャッフル`);
        newStep(s);
        drawCards(s, x.player, 1);
      },
    }],
  },
  /* 大進化薬 */
  '6819': {
    staysOnField: true,
    // ①：自分はレベル5以上の恐竜族モンスターを召喚する場合に必要なリリースをなくせる
    freeTribute: (s, self, m, p) => p === s.cards[self].controller && defOf(s, m).race === '恐竜族' && level(s, m) >= 5,
    // 相手ターンで数えて3ターン目の相手エンドフェイズに破壊される（効果ではない）
    onEndPhase: (s, self) => {
      const c = s.cards[self];
      if (s.turnPlayer === c.controller) return;
      c.counters.evoTurns = (c.counters.evoTurns ?? 0) + 1;
      if (c.counters.evoTurns >= 3) { log(s, `${nameOf(s, self)}は相手ターンで数えて3ターン目のエンドフェイズになったので破壊される`); destroy(s, [self], 'rule'); }
    },
    effects: [{
      id: 'e1', label: '自分の恐竜族モンスターをリリースして発動', type: 'card', ss: 1,
      can: x => !paysCost(x) || relMons(x.s, x.player).some(u => defOf(x.s, u).race === '恐竜族'),
      activate: x => { if (!paysCost(x)) return; const u = chooseOne(x, 'リリースする恐竜族モンスターを選んでください（コスト）', relMons(x.s, x.player).filter(u => defOf(x.s, u).race === '恐竜族')) ; release(x.s, [u], 'cost'); },
      resolve: () => {},
    }],
  },
  /* 月の書 */
  '5432': {
    effects: [{
      id: 'e1', label: '表側表示モンスター1体を裏側守備表示にする', type: 'card', ss: 2,
      can: x => faceUpNonToken(x.s).length > 0,
      activate: x => { target(x, '裏側守備表示にするモンスターを選んでください', faceUpNonToken(x.s)); },
      resolve: x => { const t = x.link .targets[0]; if (targetValid(x.s, x.link ) && isFaceUpMonster(x.s, t)) setFaceDown(x.s, [t]); },
    }],
  },
  /* テールスイング */
  '6822': {
    effects: [{
      id: 'e1', label: '相手の裏側表示モンスターか、レベルが低いモンスターを2体まで手札に戻す', type: 'card', ss: 1,
      can: x => bigDinos(x).some(d => tailTargets(x, level(x.s, d)).length > 0),
      activate: x => { target(x, '自分のレベル5以上の恐竜族モンスターを選んでください', bigDinos(x).filter(d => tailTargets(x, level(x.s, d)).length > 0)); },
      resolve: x => {
        const s = x.s, d = x.link .targets[0];
        if (!targetValid(s, x.link ) || !isFaceUpMonster(s, d)) return;
        const opts = tailTargets(x, level(s, d));
        if (!opts.length) return;
        const pick = choose(x, { kind: 'cards', prompt: '手札に戻す相手モンスターを2体まで選んでください', options: opts, min: 1, max: Math.min(2, opts.length) });
        addToHand(s, pick);
      },
    }],
  },
  /* モンスターゲート */
  '5980': {
    effects: [{
      id: 'e1', label: 'モンスターをリリースし、通常召喚可能なモンスターが出るまでデッキをめくって特殊召喚', type: 'card', ss: 1,
      can: x => (!paysCost(x) || relMons(x.s, x.player).length > 0) && deckOf(x.s, x.player).some(u => normalSummonable(x.s, u)),
      activate: x => { if (!paysCost(x)) return; const u = chooseOne(x, 'リリースするモンスターを選んでください（コスト）', relMons(x.s, x.player)) ; release(x.s, [u], 'cost'); },
      resolve: x => {
        const s = x.s, deck = s.players[x.player].deck, revealed           = [];
        let hit                = null;
        for (let i = deck.length - 1; i >= 0; i--) { revealed.push(deck[i]); if (normalSummonable(s, deck[i])) { hit = deck[i]; break; } }
        log(s, `${pl(x.player)}：デッキの上から${revealed.length}枚をめくる（${revealed.map(u => nameOf(s, u)).join('、')}）`);
        const rest = revealed.filter(u => u !== hit);
        if (hit !== null && canSpecialSummon(s, hit, x.player)) specialSummon(x, [hit]);
        if (rest.length) sendToGyLogged(s, rest, 'effect');
      },
    }],
  },
  /* 闇の護封剣 */
  '6268': {
    // ②：相手フィールドのモンスターは表示形式を変更できない
    forbidsPositionChange: (s, self, m) => s.cards[m].controller !== s.cards[self].controller,
    // 2回目の自分スタンバイフェイズに破壊される（効果ではない）
    onStandby: (s, self) => {
      const c = s.cards[self];
      if (s.turnPlayer !== c.controller) return;
      c.counters.standbys = (c.counters.standbys ?? 0) + 1;
      if (c.counters.standbys >= 2) { log(s, `${nameOf(s, self)}は2回目の自分スタンバイフェイズになったので破壊される`); destroy(s, [self], 'rule'); }
    },
    effects: [{
      id: 'e1', label: '相手の表側表示モンスターを全て裏側守備表示にする', type: 'card', ss: 1,
      // 永続魔法なので、処理の時にこのカードが場に無ければ（チェーンしたサイクロンで破壊された等）何もしない（公式Q&A [5385]）
      resolve: x => { if (!sameCard(x.s, x.self, x.link .serial) || !isOnField(x.s.cards[x.self])) return; setFaceDown(x.s, monstersOf(x.s, opp(x.player)).filter(u => isFaceUpMonster(x.s, u) && !isToken(x.s, u))); },
    }],
  },
  /* 化石発掘 */
  '6811': {
    destroyWhenLinkDestroyed: true,
    // ②：この効果で特殊召喚したモンスターは、このカードが魔法＆罠ゾーンに存在する限り効果が無効化される
    negatesMonster: (s, self, t) => s.cards[self].zone === 'szone' && s.cards[self].link === t && s.cards[t].serial === s.cards[self].linkSerial,
    // このカードがフィールドから離れた時に、そのモンスターを破壊する
    onLeaveField: (s, before) => {
      const t = before.link;
      if (t !== null && before.linkSerial === s.cards[t].serial && isMonsterZone(s.cards[t])) destroy(s, [t], 'rule');
    },
    effects: [{
      id: 'e1', label: '手札を1枚捨て、墓地の恐竜族モンスターを特殊召喚', type: 'card', ss: 2,
      can: x => handOf(x.s, x.player).length > 0 && gyDinos(x).length > 0,
      activate: x => {
        const c = chooseOne(x, '捨てる手札を選んでください（コスト）', handOf(x.s, x.player)) ;
        log(x.s, `${pl(x.player)}：${nameOf(x.s, c)}を捨てる`);
        sendToGy(x.s, [c], 'discard');
        target(x, '特殊召喚する恐竜族モンスターを選んでください', gyDinos(x));
      },
      resolve: x => {
        const s = x.s, t = x.link .targets[0];
        if (!targetValid(s, x.link ) || s.cards[t].zone !== 'gy' || !sameCard(s, x.self, x.link .serial)) return;
        if (specialSummon(x, [t]).length) linkCards(s, x.self, t);
      },
    }],
  },
  /* 砂塵のバリア －ダスト・フォース－ */
  '12184': {
    effects: [{
      id: 'e1', label: '相手の攻撃表示モンスターを全て裏側守備表示にする', type: 'card', ss: 2,
      can: x => !!x.s.battle && x.s.battle.step === 'declared' && x.s.cards[x.s.battle.attacker].controller === opp(x.player) && oppAtkNonToken(x).length > 0,
      resolve: x => {
        const s = x.s, done = setFaceDown(s, oppAtkNonToken(x));
        // この効果で裏側守備表示になったモンスターは表示形式を変更できない
        for (const u of done) addLingering(s, { type: 'noPositionChange', uid: u, serial: s.cards[u].serial, turn: 1e9 });
      },
    }],
  },
  /* 重力解除 */
  '5857': {
    effects: [{
      id: 'e1', label: 'フィールドの表側表示モンスター全ての表示形式を変更する', type: 'card', ss: 2,
      can: x => allMonsters(x.s).some(u => isFaceUpMonster(x.s, u)),
      resolve: x => { for (const u of allMonsters(x.s).filter(u => isFaceUpMonster(x.s, u))) changePositionByEffect(x.s, u); },
    }],
  },
  /* バースト・リバース */
  '10801': {
    effects: [{
      id: 'e1', label: '2000LPを払い、墓地のモンスター1体を裏側守備表示で特殊召喚', type: 'card', ss: 2,
      can: x => x.s.players[x.player].lp >= 2000 && gyOf(x.s, x.player).some(u => canSpecialSummon(x.s, u, x.player)),
      activate: x => { payLp(x.s, x.player, 2000); target(x, '特殊召喚するモンスターを選んでください', gyOf(x.s, x.player).filter(u => canSpecialSummon(x.s, u, x.player))); },
      resolve: x => { const t = x.link .targets[0]; if (targetValid(x.s, x.link ) && x.s.cards[t].zone === 'gy') specialSummon(x, [t], { position: 'faceDownDef' }); },
    }],
  },
  /* もの忘れ */
  '10551': {
    effects: [{
      id: 'e1', label: '相手の表側攻撃表示モンスターの効果の発動を無効にし、表側守備表示にする', type: 'card', ss: 2,
      can: x => {
        const top = x.s.chain[x.s.chain.length - 1];
        if (!top || top.cardKind !== 'monster' || top.player !== opp(x.player) || top.negated || top.effectNegated) return false;
        const c = x.s.cards[top.uid];
        return sameCard(x.s, top.uid, top.serial) && isFaceUpMonster(x.s, top.uid) && c.position === 'atk';
      },
      activate: x => { x.link .data.index = x.s.chain.length - 1; },
      resolve: x => {
        const s = x.s, l = s.chain[x.link .data.index          ];
        if (!l) return;
        l.effectNegated = true;
        log(s, `${nameOf(s, l.uid)}の効果を無効にした`);
        if (sameCard(s, l.uid, l.serial) && isFaceUpMonster(s, l.uid) && s.cards[l.uid].position === 'atk') changePositionByEffect(s, l.uid, 'def');
      },
    }],
  },
  /* ================= デッキ dno14（海馬デッキ）で追加 ================= */
  /* Z－メタル・キャタピラー（ユニオン） */
  '5555': { effects: unionEffects(['X－ヘッド・キャノン', 'Y－ドラゴン・ヘッド']), unionGuard: true, aura: (s, self, t) => (s.cards[self].equippedTo === t ? { atk: 600, def: 600 } : null) },
  /* Y－ドラゴン・ヘッド（ユニオン） */
  '5552': { effects: unionEffects(['X－ヘッド・キャノン']), unionGuard: true, aura: (s, self, t) => (s.cards[self].equippedTo === t ? { atk: 400, def: 400 } : null) },
  /* W－ウィング・カタパルト（ユニオン） */
  '6475': { effects: unionEffects(['V－タイガー・ジェット']), unionGuard: true, aura: (s, self, t) => (s.cards[self].equippedTo === t ? { atk: 400, def: 400 } : null) },
  /* オベリスクの巨神兵 */
  '4998': {
    tributes: 3, cannotSet: true, summonUnnegatable: true, summonLock: true, untargetable: true,
    effects: [{
      id: 'e4', label: '④：自分のモンスター2体をリリースし、相手フィールドのモンスターを全て破壊', type: 'ignition', ss: 1,
      // この効果を発動するターン、このカードは攻撃宣言できない（既に攻撃したターンには発動できない）
      can: x => x.s.cards[x.self].attackedTurn !== x.s.turn && relMons(x.s, x.player).filter(u => u !== x.self).length >= 2,
      activate: x => {
        const pick = choose(x, { kind: 'cards', prompt: 'リリースするモンスターを2体選んでください（コスト）', options: relMons(x.s, x.player).filter(u => u !== x.self), min: 2, max: 2 });
        release(x.s, pick, 'cost');
        x.s.cards[x.self].counters.noAtkTurn = x.s.turn;
      },
      resolve: x => { const t = monstersOf(x.s, opp(x.player)); if (t.length) destroy(x.s, t, 'effect'); },
    }, {
      id: 'e5', label: '⑤：特殊召喚されたこのカードを墓地へ送る', type: 'trigger', ss: 1,
      trigger: { mandatory: true, when: false, match: (s, self, ev) => ev.type === 'phase' && ev.phase === 'end' && isFaceUpMonster(s, self) && s.cards[self].summonedHow === 'special' },
      resolve: x => { if (sameCard(x.s, x.self, x.link .serial) && isMonsterZone(x.s.cards[x.self])) sendToGyLogged(x.s, [x.self], 'effect'); },
    }],
  },
  /* シャインエンジェル */
  '4924': {
    effects: [{
      id: 'e1', label: 'デッキから攻撃力1500以下の光属性モンスターを攻撃表示で特殊召喚', type: 'trigger', ss: 1, zones: ['gy'], damageStep: true,
      trigger: { mandatory: false, when: true, match: (s, self, ev) => ev.type === 'destroyed' && ev.uid === self && ev.reason === 'battle' && s.cards[self].zone === 'gy' },
      can: x => shineTargets(x).length > 0,
      resolve: x => { const u = chooseOne(x, '特殊召喚する光属性モンスターを選んでください', shineTargets(x)); if (u !== null) specialSummon(x, [u], { position: 'atk' }); },
    }],
  },
  /* 召喚僧サモンプリースト */
  '6400': {
    cannotBeReleased: true, // ②：モンスターゾーンに存在する限り、このカードはリリースできない（アドバンス召喚・特殊召喚の手順・コストのどれでも）
    effects: [{
      id: 'e1', label: '①：このカードを守備表示にする', type: 'trigger', ss: 1,
      trigger: { mandatory: true, when: false, match: (s, self, ev) => ev.type === 'summoned' && ev.uid === self && (ev.how === 'normal' || ev.how === 'advance' || ev.how === 'flip') },
      resolve: x => { if (isFaceUpMonster(x.s, x.self) && x.s.cards[x.self].position === 'atk') changePositionByEffect(x.s, x.self, 'def'); },
    }, {
      id: 'e3', label: '③：手札の魔法カードを1枚捨て、デッキからレベル4モンスターを特殊召喚', type: 'ignition', ss: 1, opt: 'card',
      can: x => handOf(x.s, x.player).some(u => defOf(x.s, u).kind === 'spell') && deckOf(x.s, x.player).some(u => defOf(x.s, u).kind === 'monster' && level(x.s, u) === 4 && canSpecialSummon(x.s, u, x.player)),
      activate: x => {
        const c = chooseOne(x, '捨てる魔法カードを選んでください（コスト）', handOf(x.s, x.player).filter(u => defOf(x.s, u).kind === 'spell')) ;
        log(x.s, `${pl(x.player)}：${nameOf(x.s, c)}を捨てる`);
        sendToGy(x.s, [c], 'discard');
      },
      resolve: x => {
        const s = x.s;
        const u = chooseOne(x, '特殊召喚するレベル4モンスターを選んでください', deckOf(s, x.player).filter(u => defOf(s, u).kind === 'monster' && level(s, u) === 4 && canSpecialSummon(s, u, x.player)));
        if (u !== null && specialSummon(x, [u]).length) s.cards[u].counters.noAtkTurn = s.turn; // このターン攻撃できない
      },
    }],
  },
  /* D・D・R */
  '7519': {
    // このカードがフィールドから離れた時にそのモンスターは破壊される
    onLeaveField: (s, before) => { const t = before.equippedTo; if (t !== null && s.cards[t].serial === before.equipSerial && isMonsterZone(s.cards[t])) destroy(s, [t], 'rule'); },
    effects: [{
      id: 'e1', label: '手札を1枚捨て、除外されている自分のモンスターを攻撃表示で特殊召喚して装備', type: 'card', ss: 1,
      can: x => handOf(x.s, x.player).some(u => u !== x.self) && banishedMine(x).length > 0,
      activate: x => {
        const c = chooseOne(x, '捨てる手札を選んでください（コスト）', handOf(x.s, x.player).filter(u => u !== x.self)) ;
        log(x.s, `${pl(x.player)}：${nameOf(x.s, c)}を捨てる`);
        sendToGy(x.s, [c], 'discard');
        target(x, '特殊召喚する除外されているモンスターを選んでください', banishedMine(x));
      },
      resolve: x => {
        const s = x.s, t = x.link .targets[0];
        if (!targetValid(s, x.link ) || s.cards[t].zone !== 'banished' || !sameCard(s, x.self, x.link .serial)) return;
        if (specialSummon(x, [t], { position: 'atk' }).length) equipCard(s, x.self, t, { stay: true });
      },
    }],
  },
  /* エネミーコントローラー */
  '5505': {
    effects: [{
      id: 'e1', label: '相手モンスターの表示形式を変更するか、自分のモンスターをリリースしてコントロールを得る', type: 'card', ss: 2,
      can: x => oppFaceUpMons(x).length > 0,
      activate: x => {
        const s = x.s, modes = relMons(s, x.player).length ? [0, 1] : [0];
        const m = modes.length > 1 ? choose(x, { kind: 'option', prompt: 'どちらの効果を発動しますか？', options: ['相手モンスターの表示形式を変更', '自分のモンスターをリリースし、コントロールを得る'] }) : 0;
        x.link .data.mode = m;
        if (m === 1) { const u = chooseOne(x, 'リリースするモンスターを選んでください（コスト）', relMons(s, x.player)) ; release(s, [u], 'cost'); }
        target(x, '対象の相手モンスターを選んでください', oppFaceUpMons(x));
      },
      resolve: x => {
        const s = x.s, t = x.link .targets[0];
        if (!targetValid(s, x.link ) || !isFaceUpMonster(s, t) || s.cards[t].controller === x.player) return;
        if (x.link .data.mode === 0) changePositionByEffect(s, t);
        else takeControl(s, t, x.player);
      },
    }],
  },
  /* 同胞の絆 */
  '6154': {
    effects: [{
      id: 'e1', label: '2000LPを払い、自分のモンスターと種族・属性・レベルが同じモンスター2体をデッキから特殊召喚', type: 'card', ss: 1,
      // このカードを発動するターン、自分はバトルフェイズを行えない（既に行ったターンには発動できない）
      can: x => x.s.opt[`${x.player}:battleTurn`] !== x.s.turn && x.s.players[x.player].lp >= 2000 && freeMZones(x.s, x.player).length >= 2 && bondTargets(x).length > 0,
      activate: x => {
        if (paysCost(x)) { addLingering(x.s, { type: 'noBattle', player: x.player, turn: x.s.turn }); payLp(x.s, x.player, 2000); }
        target(x, '対象にする自分のレベル4以下のモンスターを選んでください', bondTargets(x));
      },
      resolve: x => {
        const s = x.s, t = x.link .targets[0];
        if (targetValid(s, x.link ) && isFaceUpMonster(s, t) && freeMZones(s, x.player).length >= 2) {
          const opts = bondKin(x, t), a = chooseOne(x, '特殊召喚するモンスターを選んでください（1体目）', opts);
          const b = a === null ? null : chooseOne(x, '特殊召喚するモンスターを選んでください（2体目・別のカード名）', opts.filter(u => defOf(s, u).name !== defOf(s, a).name));
          if (a !== null && b !== null) specialSummon(x, [a, b]);
        }
        // このカードの発動後、ターン終了時まで自分はモンスターを特殊召喚できない
        addLingering(s, { type: 'noSpecial', player: x.player, turn: s.turn });
      },
    }],
  },
  /* 龍の鏡 */
  '6433': {
    effects: [{ id: 'e1', label: 'フィールド・墓地の素材を除外し、ドラゴン族の融合モンスターを融合召喚', type: 'card', ss: 1, can: x => fusionCan(x, DRAGON_MIRROR), resolve: x => fusionSummon(x, DRAGON_MIRROR) }],
  },
  /* 左腕の代償 */
  '5637': {
    effects: [{
      id: 'e1', label: 'このカード以外の手札を全て除外し、デッキから魔法カードを手札に加える', type: 'card', ss: 1,
      // このカードを発動するターン、自分は魔法・罠カードをセットできない（既にセットしたターンには発動できない）
      can: x => x.s.opt[`${x.player}:setST`] !== x.s.turn && handOf(x.s, x.player).filter(u => u !== x.self).length >= 2 && deckOf(x.s, x.player).some(u => defOf(x.s, u).kind === 'spell'),
      activate: x => {
        if (!paysCost(x)) return;
        addLingering(x.s, { type: 'noSetST', player: x.player, turn: x.s.turn });
        const h = handOf(x.s, x.player).filter(u => u !== x.self);
        log(x.s, `${pl(x.player)}：手札を全て除外（${h.length}枚）`);
        banish(x.s, h, 'cost');
      },
      resolve: x => { const u = chooseOne(x, '手札に加える魔法カードを選んでください', deckOf(x.s, x.player).filter(u => defOf(x.s, u).kind === 'spell')); if (u !== null) addToHand(x.s, [u]); },
    }],
  },
  /* トレード・イン */
  '7248': {
    effects: [{
      id: 'e1', label: '手札のレベル8モンスターを1体捨て、2枚ドロー', type: 'card', ss: 1,
      can: x => x.s.players[x.player].deck.length >= 2 && (!paysCost(x) || handOf(x.s, x.player).some(u => defOf(x.s, u).kind === 'monster' && level(x.s, u) === 8)),
      activate: x => {
        if (!paysCost(x)) return;
        const c = chooseOne(x, '捨てるレベル8モンスターを選んでください（コスト）', handOf(x.s, x.player).filter(u => defOf(x.s, u).kind === 'monster' && level(x.s, u) === 8)) ;
        log(x.s, `${pl(x.player)}：${nameOf(x.s, c)}を捨てる`);
        sendToGy(x.s, [c], 'discard');
      },
      resolve: x => { drawCards(x.s, x.player, 2); },
    }],
  },
  /* 異次元からの帰還 */
  '6078': {
    effects: [{
      id: 'e1', label: 'LPを半分払い、除外されている自分のモンスターを可能な限り特殊召喚（エンドフェイズに除外）', type: 'card', ss: 2,
      can: x => banishedMine(x).length > 0 && freeMZones(x.s, x.player).length > 0,
      activate: x => { payLp(x.s, x.player, Math.floor(x.s.players[x.player].lp / 2)); },
      resolve: x => {
        const s = x.s, opts = banishedMine(x), n = Math.min(opts.length, freeMZones(s, x.player).length);
        if (!n) return;
        const pick = choose(x, { kind: 'cards', prompt: `特殊召喚するモンスターを${n}体選んでください`, options: opts, min: n, max: n });
        for (const u of specialSummon(x, pick)) addLingering(s, { type: 'banishAtEnd', uid: u, serial: s.cards[u].serial, turn: s.turn });
      },
    }],
  },
  /* VWXYZ－ドラゴン・カタパルトキャノン */
  '6484': {
    ...contactFusion(['VW－タイガー・カタパルト', 'XYZ－ドラゴン・キャノン'], true),
    effects: [{
      id: 'e1', label: '①：相手フィールドのカード1枚を除外', type: 'ignition', ss: 1, opt: 'card',
      can: x => fieldCards(x.s, opp(x.player)).length > 0,
      activate: x => { target(x, '除外する相手のカードを選んでください', fieldCards(x.s, opp(x.player))); },
      resolve: x => { const t = x.link .targets[0]; if (targetValid(x.s, x.link ) && isOnField(x.s.cards[t])) { log(x.s, `${nameOf(x.s, t)}を除外`); banish(x.s, [t], 'effect'); } },
    }, {
      id: 'e2', label: '②：攻撃対象モンスターの表示形式を変更する', type: 'trigger', ss: 1,
      trigger: { mandatory: false, when: true, match: (s, self, ev) => ev.type === 'attackDeclared' && ev.attacker === self && ev.target !== null },
      can: x => !!x.s.battle && x.s.battle.target !== null && isMonsterZone(x.s.cards[x.s.battle.target]),
      activate: x => { x.link .targets.push(x.s.battle .target ); },
      resolve: x => { const t = x.link .targets[0]; if (targetValid(x.s, x.link ) && isMonsterZone(x.s.cards[t])) changePositionByEffect(x.s, t, undefined, true); },
    }],
  },
  /* VW－タイガー・カタパルト */
  '6483': {
    ...contactFusion(['V－タイガー・ジェット', 'W－ウィング・カタパルト'], true),
    effects: [discardTargetEffect('①：手札を1枚捨て、相手モンスター1体の表示形式を変更', '表示形式を変更する相手モンスターを選んでください', x => monstersOf(x.s, opp(x.player)),
      (x, t) => { if (isMonsterZone(x.s.cards[t])) changePositionByEffect(x.s, t, undefined, true); })],
  },
  /* XYZ－ドラゴン・キャノン */
  '5556': {
    ...contactFusion(['X－ヘッド・キャノン', 'Y－ドラゴン・ヘッド', 'Z－メタル・キャタピラー'], false),
    effects: [discardTargetEffect('①：手札を1枚捨て、相手フィールドのカード1枚を破壊', '破壊する相手のカードを選んでください', x => fieldCards(x.s, opp(x.player)),
      (x, t) => { if (isOnField(x.s.cards[t])) destroy(x.s, [t], 'effect'); })],
  },
  /* XY－ドラゴン・キャノン */
  '5553': {
    ...contactFusion(['X－ヘッド・キャノン', 'Y－ドラゴン・ヘッド'], false),
    effects: [discardTargetEffect('①：手札を1枚捨て、相手の表側表示の魔法・罠1枚を破壊', '破壊する相手の表側表示の魔法・罠カードを選んでください', x => spellTrapsOf(x.s, opp(x.player)).filter(u => x.s.cards[u].faceUp),
      (x, t) => { if (isOnField(x.s.cards[t]) && x.s.cards[t].faceUp) destroy(x.s, [t], 'effect'); })],
  },
  /* YZ－キャタピラー・ドラゴン */
  '5626': {
    ...contactFusion(['Y－ドラゴン・ヘッド', 'Z－メタル・キャタピラー'], false),
    effects: [discardTargetEffect('①：手札を1枚捨て、相手の裏側表示モンスター1体を破壊', '破壊する相手の裏側表示モンスターを選んでください', x => monstersOf(x.s, opp(x.player)).filter(u => !x.s.cards[u].faceUp),
      (x, t) => { if (isMonsterZone(x.s.cards[t]) && !x.s.cards[t].faceUp) destroy(x.s, [t], 'effect'); })],
  },
  /* XZ－キャタピラー・キャノン */
  '5625': {
    ...contactFusion(['X－ヘッド・キャノン', 'Z－メタル・キャタピラー'], false),
    effects: [discardTargetEffect('①：手札を1枚捨て、相手の裏側表示の魔法・罠1枚を破壊', '破壊する相手の裏側表示の魔法・罠カードを選んでください', x => spellTrapsOf(x.s, opp(x.player)).filter(u => !x.s.cards[u].faceUp),
      (x, t) => { if (isOnField(x.s.cards[t]) && !x.s.cards[t].faceUp) destroy(x.s, [t], 'effect'); })],
  },
  /* 青眼の究極竜 */
  '4386': { fusionMaterials: ['青眼の白龍', '青眼の白龍', '青眼の白龍'] },
  /* ================= デッキ dno9（A召喚デッキ）で追加 ================= */
  /* 創世神 */
  '6176': {
    specialSummonOk: (s, self) => s.cards[self].zone !== 'gy', // 墓地からの特殊召喚はできない
    effects: [{
      id: 'e1', label: '手札を1枚墓地へ送り、墓地のモンスター1体を特殊召喚', type: 'ignition', ss: 1, opt: 'card',
      can: x => handOf(x.s, x.player).length > 0 && gyOf(x.s, x.player).some(u => canSpecialSummon(x.s, u, x.player)),
      activate: x => { target(x, '特殊召喚する墓地のモンスターを選んでください', gyOf(x.s, x.player).filter(u => canSpecialSummon(x.s, u, x.player))); },
      resolve: x => {
        const s = x.s, t = x.link .targets[0];
        const h = chooseOne(x, '墓地へ送る手札を選んでください', handOf(s, x.player));
        if (h === null) return;
        sendToGyLogged(s, [h], 'effect'); // 手札を墓地へ送る処理と特殊召喚は同時に行われる
        if (targetValid(s, x.link ) && s.cards[t].zone === 'gy') specialSummon(x, [t]);
      },
    }],
  },
  /* 虚無魔人：特殊召喚できない。お互いにモンスターを特殊召喚できない */
  '6881': { specialSummonOk: () => false, blocksSpecialSummon: () => true },
  /* 使徒喰い虫 */
  '6122': {
    effects: [{
      id: 'e1', label: 'リバース：フィールドのモンスター2体を破壊', type: 'trigger', ss: 1, damageStep: true,
      trigger: { mandatory: true, when: false, match: (s, self, ev) => ev.type === 'flipped' && ev.uid === self },
      activate: x => {
        const opts = allMonsters(x.s).filter(u => targetable(x.s, u));
        if (!opts.length) return;
        const n = Math.min(2, opts.length);
        const t = choose(x, { kind: 'cards', prompt: `破壊するモンスターを${n}体選んでください`, options: opts, min: n, max: n });
        x.link .targets.push(...t);
      },
      resolve: x => { const ok = x.link .targets.filter((t, i) => targetValid(x.s, x.link , i) && isMonsterZone(x.s.cards[t])); if (ok.length) destroy(x.s, ok, 'effect'); },
    }],
  },
  /* 邪神アバター */
  '7091': {
    specialSummonOk: () => false,
    tributes: 3,
    // 攻撃力・守備力は自身の効果で決まり、装備魔法・オシリスなどの上げ下げを受けない（公式Q&A [6526][11913]）
    statFixed: true,
    // ②：「邪神アバター」以外のフィールドの攻撃力が一番高いモンスターの攻撃力＋100
    statSet: (s, self) => {
      const others = allMonsters(s).filter(u => u !== self && isFaceUpMonster(s, u) && defOf(s, u).name !== '邪神アバター');
      const n = (others.length ? Math.max(...others.map(u => currentAtk(s, u))) : 0) + 100;
      return { atk: n, def: n };
    },
    effects: [{
      id: 'e1', label: '①：相手ターンで数えて2ターンの間、相手は魔法・罠カードを発動できない', type: 'trigger', ss: 1, damageStep: true,
      trigger: { mandatory: true, when: false, match: (s, self, ev) => ev.type === 'summoned' && ev.uid === self && (ev.how === 'normal' || ev.how === 'advance') },
      resolve: x => {
        const s = x.s, o = opp(x.player);
        // 相手ターンで数えて2ターン：自分のターンなら次とその次の相手ターンまで、相手ターンならそのターン・次の自分のターン・次の相手ターンまで
        const until = s.turnPlayer === o ? s.turn + 2 : s.turn + 3;
        addLingering(s, { type: 'noSpellTrap', player: o, turn: until });
        log(s, `${pl(o)}は相手ターンで数えて2ターンの間、魔法・罠カードを発動できない`);
      },
    }],
  },
  /* 邪帝ガイウス */
  '7516': {
    effects: [{
      id: 'e1', label: '①：フィールドのカード1枚を除外（闇属性モンスターなら相手に1000ダメージ）', type: 'trigger', ss: 1,
      trigger: { mandatory: true, when: false, match: (s, self, ev) => ev.type === 'summoned' && ev.uid === self && ev.how === 'advance' },
      can: x => [...fieldCards(x.s, 0), ...fieldCards(x.s, 1)].length > 0,
      activate: x => { target(x, '除外するカードを選んでください', [...fieldCards(x.s, 0), ...fieldCards(x.s, 1)]); },
      resolve: x => {
        const s = x.s, t = x.link .targets[0];
        if (!targetValid(s, x.link ) || !isOnField(s.cards[t])) return;
        // 裏側表示のモンスターも表側で除外されるので、闇属性ならダメージを与える（公式Q&A [7110]）
        const dark = isMonsterZone(s.cards[t]) && isDark(s, t);
        log(s, `${nameOf(s, t)}を除外`);
        banish(s, [t], 'effect');
        if (dark && s.cards[t].zone === 'banished') effectDamage(s, opp(x.player), 1000);
      },
    }],
  },
  /* 神獣王バルバロス */
  '7346': {
    tributeOptions: [0, 2, 3],
    // ②：リリースなしで通常召喚したこのカードの元々の攻撃力は1900
    statSet: (s, self) => (s.cards[self].counters.tributes === 0 && s.cards[self].summonedHow === 'normal' ? { atk: 1900, def: defOf(s, self).def ?? 0 } : null),
    effects: [{
      id: 'e4', label: '④：相手フィールドのカードを全て破壊', type: 'trigger', ss: 1,
      trigger: { mandatory: true, when: false, match: (s, self, ev) => ev.type === 'summoned' && ev.uid === self && s.cards[self].counters.tributes === 3 },
      resolve: x => { const t = fieldCards(x.s, opp(x.player)); if (t.length) destroy(x.s, t, 'effect'); },
    }],
  },
  /* 人造人間－サイコ・ショッカー */
  '4758': { blocksTraps: () => true },
  /* 派手ハネ */
  '6124': {
    effects: [{
      id: 'e1', label: 'リバース：フィールドのモンスターを3体まで手札に戻す', type: 'trigger', ss: 1, damageStep: true,
      trigger: { mandatory: false, when: false, match: (s, self, ev) => ev.type === 'flipped' && ev.uid === self },
      can: x => allMonsters(x.s).some(u => targetable(x.s, u)),
      activate: x => {
        const opts = allMonsters(x.s).filter(u => targetable(x.s, u) && !(x.s.battle?.destroyed.includes(u)));
        const t = choose(x, { kind: 'cards', prompt: '手札に戻すモンスターを3体まで選んでください', options: opts, min: 1, max: Math.min(3, opts.length) });
        x.link .targets.push(...t);
      },
      resolve: x => { const ok = x.link .targets.filter((t, i) => targetValid(x.s, x.link , i) && isMonsterZone(x.s.cards[t])); if (ok.length) addToHand(x.s, ok); },
    }],
  },
  /* マシュマロン */
  '6000': {
    battleIndestructible: true,
    effects: [{
      id: 'e2', label: '②：攻撃したプレイヤーに1000ダメージ', type: 'trigger', ss: 1, damageStep: true,
      trigger: { mandatory: true, when: false, match: (s, self, ev) => ev.type === 'afterDamageCalc' && ev.target === self && !!s.battle?.targetWasFaceDown },
      resolve: x => { effectDamage(x.s, opp(x.player), 1000); },
    }],
  },
  /* 黄泉ガエル */
  '6603': {
    effects: [{
      id: 'e1', label: '①：墓地のこのカードを特殊召喚', type: 'trigger', ss: 1, zones: ['gy'],
      trigger: { mandatory: false, when: false, match: (s, self, ev) => ev.type === 'phase' && ev.phase === 'standby' && s.cards[self].zone === 'gy' && ev.player === s.cards[self].owner },
      // 自分フィールドに「黄泉ガエル」が存在せず、魔法・罠カードが存在しない場合に発動と処理ができる
      can: x => !monstersOf(x.s, x.player).some(u => x.s.cards[u].faceUp && defOf(x.s, u).name === '黄泉ガエル') && spellTrapsOf(x.s, x.player).length === 0 && canSpecialSummon(x.s, x.self, x.player),
      resolve: x => { if (spellTrapsOf(x.s, x.player).length === 0 && x.s.cards[x.self].zone === 'gy' && sameCard(x.s, x.self, x.link .serial)) specialSummon(x, [x.self]); },
    }],
  },
  /* 光と闇の竜 */
  '6821': {
    specialSummonOk: () => false,
    forcedNegate: 'neg',
    effects: [{
      id: 'neg', label: '発動を無効にし、攻撃力・守備力が500ダウン', type: 'quick', ss: 2, damageStep: true,
      can: () => false, // 自分では選べない（効果モンスターの効果・魔法・罠カードの発動に必ずチェーンする）
      activate: x => { x.link .data.index = x.s.chain.length - 1; },
      resolve: x => {
        const s = x.s, l = s.chain[x.link .data.index          ];
        // 2体いる時のチェーン3の竜など、きっかけの発動に直接チェーンしていなければ効果は適用されない（公式Q&A [6350]）
        const trig = x.link .data.trigger                      ;
        if (trig !== undefined && trig !== s.chain.length - 2) return;
        if (!l || !isFaceUpMonster(s, x.self) || !sameCard(s, x.self, x.link .serial) || s.battle?.destroyed.includes(x.self)) return;
        if (currentAtk(s, x.self) < 500 || currentDef(s, x.self) < 500) return;
        negateActivation(s, l, false);
        addStatMod(s, x.self, -500, -500);
      },
    }, {
      id: 'e3', label: '自分フィールドのカードを全て破壊し、墓地のモンスター1体を特殊召喚', type: 'trigger', ss: 1, zones: ['gy'], damageStep: true,
      trigger: { mandatory: true, when: false, match: (s, self, ev) => ev.type === 'destroyed' && ev.uid === self && s.cards[self].zone === 'gy' },
      // 補足情報：墓地に特殊召喚可能なモンスターがいない場合や、自分フィールドにカードが無い場合でも発動する
      activate: x => {
        const opts = gyOf(x.s, x.player).filter(u => u !== x.self && canSpecialSummon(x.s, u, x.player, 'special', fieldCards(x.s, x.player)));
        if (opts.length) target(x, '特殊召喚するモンスターを選んでください', opts);
      },
      resolve: x => {
        const s = x.s, mine = fieldCards(s, x.player);
        if (mine.length) destroy(s, mine, 'effect');
        newStep(s);
        const t = x.link .targets[0];
        if (t !== undefined && targetValid(s, x.link ) && s.cards[t].zone === 'gy') specialSummon(x, [t]);
      },
    }],
  },
  /* アドバンス・フォース：レベル7以上のモンスターは、レベル5以上のモンスター1体をリリースしてアドバンス召喚できる */
  '8659': {
    effects: [{ id: 'e1', label: '発動する', type: 'card', ss: 1, resolve: () => {} }],
    tributeAid: (s, self, m, p) => (p === s.cards[self].controller && level(s, m) >= 7 && tributesFor(s, m) === 2 ? { count: 1, ok: (st, u) => (defOf(st, u).level ?? 0) >= 5 } : null),
  },
  /* 強制転移 */
  '5162': {
    effects: [{
      id: 'e1', label: 'お互いにモンスター1体を選び、コントロールを入れ替える', type: 'card', ss: 1,
      can: x => monstersOf(x.s, 0).length > 0 && monstersOf(x.s, 1).length > 0,
      resolve: x => {
        const s = x.s, o = opp(x.player);
        const a = chooseOne(x, 'コントロールを入れ替える自分のモンスターを選んでください', monstersOf(s, x.player));
        const b = chooseOne(x, 'コントロールを入れ替える自分のモンスターを選んでください', monstersOf(s, o), o);
        if (a === null || b === null) return;
        if (swapControl(s, a, b)) for (const u of [a, b]) addLingering(s, { type: 'noPositionChange', uid: u, serial: s.cards[u].serial, turn: s.turn });
      },
    }],
  },
  /* 帝王の烈旋 */
  '11275': {
    effects: [{
      id: 'e1', label: 'このターン1度だけ、アドバンス召喚で相手のモンスター1体をリリースできる', type: 'card', ss: 2, hardOpt: true,
      // このカードを発動するターン、自分はEXデッキからモンスターを特殊召喚できない（既に特殊召喚したターンには発動できない。公式Q&A [10972]）
      can: x => !extraSummonedThisTurn(x.s, x.player),
      activate: x => { if (paysCost(x)) addLingering(x.s, { type: 'noExtraSpecial', player: x.player, turn: x.s.turn }); },
      resolve: x => { addLingering(x.s, { type: 'tributeOpp', player: x.player, turn: x.s.turn }); log(x.s, `${pl(x.player)}：このターン1度だけ、アドバンス召喚で相手のモンスター1体をリリースできる`); },
    }],
  },
  /* デビルズ・サンクチュアリ */
  '5632': {
    effects: [{
      id: 'e1', label: '「メタルデビル・トークン」1体を特殊召喚', type: 'card', ss: 1,
      can: x => freeMZones(x.s, x.player).length > 0,
      resolve: x => { for (const u of createTokens(x, 'token:metaldevil', 1, 'atk')) x.s.cards[u].noAttack = true; },
    }],
  },
  /* メタルデビル・トークン：攻撃できず、戦闘で発生するコントローラーへの戦闘ダメージは代わりに相手が受ける。自分スタンバイフェイズ毎に1000LPを払うか破壊 */
  'token:metaldevil': {
    redirectBattleDamage: true,
    onStandby: (s, self) => {
      const c = s.cards[self];
      if (s.turnPlayer !== c.controller) return;
      if (s.players[c.controller].lp > 1000) payLp(s, c.controller, 1000);
      else { log(s, `${nameOf(s, self)}は1000LPを払わずに破壊する`); destroy(s, [self], 'rule'); }
    },
  },
  /* 成金ゴブリン */
  '4895': {
    effects: [{
      id: 'e1', label: '1枚ドローし、相手は1000LP回復', type: 'card', ss: 1,
      can: x => x.s.players[x.player].deck.length > 0,
      resolve: x => { const n = x.s.players[x.player].hand.length; drawCards(x.s, x.player, 1); if (x.s.players[x.player].hand.length > n) { newStep(x.s); gainLp(x.s, opp(x.player), 1000); } },
    }],
  },
  /* メタル・リフレクト・スライム */
  '5686': {
    effects: [{
      id: 'e1', label: 'モンスター（水族・星10・攻0／守3000）として守備表示で特殊召喚', type: 'card', ss: 2,
      can: x => freeMZones(x.s, x.player).length > 0 && !(x.s.battle && ['dsStart', 'beforeCalc', 'afterCalc', 'dsEnd', 'end'].includes(x.s.battle.step)),
      resolve: x => {
        const s = x.s;
        if (!sameCard(s, x.self, x.link .serial) || !isOnField(s.cards[x.self]) || !freeMZones(s, x.player).length) return;
        moveCard(s, x.self, 'mzone', { index: pickMZone(x, x.self, x.player), faceUp: true, position: 'def', controller: x.player });
        const c = s.cards[x.self]; c.noAttack = true; c.summonedHow = 'special'; c.summonedTurn = s.turn;
        log(s, `${pl(x.player)}：${nameOf(s, x.self)}をモンスターとして守備表示で特殊召喚`);
        emit(s, { type: 'summoned', uid: x.self, player: x.player, how: 'special' });
        pushAnim(s, { kind: 'summon', uid: x.self, how: 'special', mats: [] });
      },
    }],
  },
  /* 強制脱出装置 */
  '5914': {
    effects: [{
      id: 'e1', label: 'フィールドのモンスター1体を手札に戻す', type: 'card', ss: 2,
      can: x => allMonsters(x.s).length > 0 && !(x.s.battle && ['dsStart', 'beforeCalc', 'afterCalc', 'dsEnd', 'end'].includes(x.s.battle.step)),
      activate: x => { target(x, '手札に戻すモンスターを選んでください', allMonsters(x.s)); },
      resolve: x => { const t = x.link .targets[0]; if (targetValid(x.s, x.link ) && isMonsterZone(x.s.cards[t])) addToHand(x.s, [t]); },
    }],
  },
  /* 超古代生物の墓場：特殊召喚されたレベル6以上のモンスターは攻撃宣言できず、お互いはそれらの効果を発動できない */
  '8230': {
    effects: [{ id: 'e1', label: '発動する', type: 'card', ss: 2, resolve: () => {} }],
    forbidsAttack: (s, _self, m) => ancientTarget(s, m),
    blocksMonsterEffects: (s, _self, u) => ancientTarget(s, u),
  },
  /* 連撃の帝王 */
  '11204': {
    effects: [{ id: 'e1', label: '発動する', type: 'card', ss: 2, resolve: () => {} }, {
      id: 'e2', label: '①：モンスター1体をアドバンス召喚する（相手のメインフェイズ・バトルフェイズ）', type: 'quick', ss: 2, zones: ['szone'], opt: 'card',
      can: x => x.s.turnPlayer !== x.player && ['main1', 'battle', 'main2'].includes(x.s.phase) && !(x.s.battle && ['dsStart', 'beforeCalc', 'afterCalc', 'dsEnd', 'end'].includes(x.s.battle.step)) && rengekiMonsters(x).length > 0,
      resolve: x => {
        const s = x.s;
        const u = chooseOne(x, 'アドバンス召喚するモンスターを選んでください', rengekiMonsters(x));
        if (u === null) return;
        // リリースの組み合わせ（バルバロスの3体リリース・審神者の別のリリース・アドバンス・フォース・帝王の烈旋も含む）から選ぶ
        const sets = advanceTributeSets(s, x.player, u);
        if (!sets.length) return;
        const tr = sets.length === 1 ? sets[0] : sets[choose(x, { kind: 'option', prompt: `${nameOf(s, u)}のリリースを選んでください`, options: sets.map(t => `リリース：${t.map(v => nameOf(s, v)).join('・')}`) })];
        advanceSummonNow(x, u, tr);
      },
    }],
  },
  /* 洗脳－ブレインコントロール */
  '4803': {
    effects: [{
      id: 'e1', label: '800LPを払い、相手の通常召喚可能な表側表示モンスターのコントロールをエンドフェイズまで得る', type: 'card', ss: 1,
      can: x => x.s.players[x.player].lp >= 800 && brainTargets(x).length > 0 && freeMZones(x.s, x.player).length > 0,
      activate: x => { if (paysCost(x)) payLp(x.s, x.player, 800); target(x, 'コントロールを得る相手モンスターを選んでください', brainTargets(x)); },
      resolve: x => { const t = x.link .targets[0]; if (targetValid(x.s, x.link ) && isFaceUpMonster(x.s, t) && x.s.cards[t].controller !== x.player) takeControl(x.s, t, x.player); },
    }],
  },
  /* ================= デッキ dno10（墓守デッキ）で追加 ================= */
  /* 墓守の長 */
  '5515': {
    uniqueOnField: true,
    shieldsOwnGy: true,
    effects: [{
      id: 'e1', label: '墓地の「墓守の」モンスター1体を特殊召喚', type: 'trigger', ss: 1,
      trigger: { mandatory: false, when: true, match: (s, self, ev) => ev.type === 'summoned' && ev.uid === self && ev.how === 'advance' },
      can: x => gkGy(x).length > 0,
      resolve: x => { const u = chooseOne(x, '特殊召喚する「墓守の」モンスターを選んでください', gkGy(x)); if (u !== null) specialSummon(x, [u]); },
    }],
  },
  /* 守護者スフィンクス */
  '5422': {
    effects: [{
      id: 'e1', label: 'このカードを裏側守備表示にする（1ターンに1度）', type: 'ignition', ss: 1, opt: 'card',
      resolve: x => { if (isFaceUpMonster(x.s, x.self) && sameCard(x.s, x.self, x.link .serial)) setFaceDown(x.s, [x.self]); },
    }, {
      id: 'e2', label: '相手フィールドのモンスターを全て手札に戻す', type: 'trigger', ss: 1,
      trigger: { mandatory: true, when: false, match: (s, self, ev) => ev.type === 'summoned' && ev.uid === self && ev.how === 'flip' },
      resolve: x => { const t = monstersOf(x.s, opp(x.player)); if (t.length) addToHand(x.s, t); },
    }],
  },
  /* 墓守の審神者 */
  '10920': {
    altTribute: [{ count: 3, ok: () => true }, { count: 1, ok: (s, u) => isGk(s, u) }],
    effects: [{
      id: 'e1', label: '①：リリースした「墓守」の数まで効果を選んで発動', type: 'trigger', ss: 1,
      trigger: { mandatory: false, when: true, match: (s, self, ev) => ev.type === 'summoned' && ev.uid === self && ev.how === 'advance' && (s.cards[self].tributedWith ?? []).some(u => isGk(s, u)) },
      activate: x => {
        const s = x.s, n = (s.cards[x.self].tributedWith ?? []).filter(u => isGk(s, u)).length;
        const names = ['攻撃力をリリースしたモンスターのレベルの合計×100アップ', '相手の裏側表示モンスターを全て破壊', '相手のモンスターの攻撃力・守備力を2000ダウン'];
        const chosen           = [];
        for (let i = 0; i < Math.min(n, 3); i++) {
          const rest = [0, 1, 2].filter(v => !chosen.includes(v));
          const opts = i === 0 ? rest.map(v => names[v]) : ['（ここまでにする）', ...rest.map(v => names[v])];
          const k = choose(x, { kind: 'option', prompt: `発動する効果を選んでください（${i + 1}つ目）`, options: opts });
          if (i > 0 && k === 0) break;
          chosen.push(rest[i === 0 ? k : k - 1]);
        }
        x.link .data.modes = chosen;
      },
      resolve: x => {
        const s = x.s, modes = x.link .data.modes            ;
        if (modes.includes(0) && isFaceUpMonster(s, x.self)) {
          const lv = (s.cards[x.self].tributedWith ?? []).reduce((a, u) => a + level(s, u), 0);
          addStatMod(s, x.self, lv * 100, 0);
        }
        if (modes.includes(1)) { const t = monstersOf(s, opp(x.player)).filter(u => !s.cards[u].faceUp); if (t.length) destroy(s, t, 'effect'); }
        if (modes.includes(2)) for (const u of monstersOf(s, opp(x.player)).filter(u => isFaceUpMonster(s, u))) addStatMod(s, u, -2000, -2000);
      },
    }],
  },
  /* 墓守の召喚師 */
  '9282': {
    effects: [{
      id: 'e1', label: 'デッキから守備力1500以下の「墓守の」モンスターを手札に加える', type: 'trigger', ss: 1, zones: ['gy'], damageStep: true,
      trigger: { mandatory: true, when: true, match: (s, self, ev) => leftFieldTo(ev, self) && s.cards[self].zone === 'gy' && s.cards[self].owner === s.cards[self].controller },
      resolve: x => {
        const s = x.s;
        const u = chooseOne(x, '手札に加える「墓守の」モンスターを選んでください', deckOf(s, x.player).filter(u => isGk(s, u) && defOf(s, u).kind === 'monster' && !defOf(s, u).defUnknown && (defOf(s, u).def ?? 0) <= 1500));
        if (u !== null) addToHand(s, [u]);
      },
    }],
  },
  /* 墓守の司令官 */
  '7106': {
    effects: [{
      id: 'e1', label: 'このカードを捨て、デッキから「王家の眠る谷－ネクロバレー」を手札に加える', type: 'ignition', ss: 1, zones: ['hand'],
      can: x => deckOf(x.s, x.player).some(u => defOf(x.s, u).name === '王家の眠る谷－ネクロバレー'),
      activate: x => { log(x.s, `${pl(x.player)}：${nameOf(x.s, x.self)}を捨てる`); sendToGy(x.s, [x.self], 'discard'); },
      resolve: x => { const u = chooseOne(x, '手札に加えるカードを選んでください', deckOf(x.s, x.player).filter(u => defOf(x.s, u).name === '王家の眠る谷－ネクロバレー')); if (u !== null) addToHand(x.s, [u]); },
    }],
  },
  /* 墓守の大神官 */
  '8638': {
    altTribute: { count: 1, ok: (s, u) => defOf(s, u).name.startsWith('墓守の') },
    statAdd: (s, self) => ({ atk: gyOf(s, s.cards[self].controller).filter(u => defOf(s, u).kind === 'monster' && defOf(s, u).name.startsWith('墓守の')).length * 200, def: 0 }),
    destroyReplaceHand: (s, self) => handOf(s, s.cards[self].controller).filter(u => defOf(s, u).kind === 'monster' && defOf(s, u).name.startsWith('墓守の')),
  },
  /* 墓守の偵察者 */
  '5509': {
    effects: [{
      id: 'e1', label: 'リバース：デッキから攻撃力1500以下の「墓守の」モンスターを特殊召喚', type: 'trigger', ss: 1, damageStep: true,
      trigger: { mandatory: true, when: false, match: (s, self, ev) => ev.type === 'flipped' && ev.uid === self },
      resolve: x => {
        const s = x.s;
        const u = chooseOne(x, '特殊召喚する「墓守の」モンスターを選んでください', deckOf(s, x.player).filter(u => defOf(s, u).kind === 'monster' && defOf(s, u).name.startsWith('墓守の') && !defOf(s, u).atkUnknown && (defOf(s, u).atk ?? 0) <= 1500 && canSpecialSummon(s, u, x.player)));
        if (u !== null) specialSummon(x, [u]);
      },
    }],
  },
  /* 墓守の番兵 */
  '5511': {
    effects: [{
      id: 'e1', label: 'リバース：相手モンスター1体を手札に戻す', type: 'trigger', ss: 1, damageStep: true,
      trigger: { mandatory: true, when: false, match: (s, self, ev) => ev.type === 'flipped' && ev.uid === self },
      activate: x => { const o = monstersOf(x.s, opp(x.player)).filter(u => targetable(x.s, u)); if (o.length) target(x, '手札に戻す相手モンスターを選んでください', o); },
      resolve: x => { const t = x.link .targets[0]; if (t !== undefined && targetValid(x.s, x.link ) && isMonsterZone(x.s.cards[t])) addToHand(x.s, [t]); },
    }],
  },
  /* 墓守の末裔 */
  '8639': {
    effects: [{
      id: 'e1', label: '他の「墓守の」モンスターをリリースし、相手フィールドのカード1枚を破壊', type: 'ignition', ss: 1,
      can: x => relMons(x.s, x.player).some(u => u !== x.self && isFaceUpMonster(x.s, u) && defOf(x.s, u).name.startsWith('墓守の')) && fieldCards(x.s, opp(x.player)).length > 0,
      activate: x => {
        const u = chooseOne(x, 'リリースする「墓守の」モンスターを選んでください（コスト）', relMons(x.s, x.player).filter(u => u !== x.self && isFaceUpMonster(x.s, u) && defOf(x.s, u).name.startsWith('墓守の'))) ;
        release(x.s, [u], 'cost');
        target(x, '破壊する相手のカードを選んでください', fieldCards(x.s, opp(x.player)));
      },
      resolve: x => { const t = x.link .targets[0]; if (targetValid(x.s, x.link ) && isOnField(x.s.cards[t])) destroy(x.s, [t], 'effect'); },
    }],
  },
  /* グリモの魔導書 */
  '10187': {
    effects: [{
      id: 'e1', label: 'デッキから「グリモの魔導書」以外の「魔導書」カードを手札に加える', type: 'card', ss: 1, hardOpt: true,
      can: x => grimoires(x).length > 0,
      resolve: x => { const u = chooseOne(x, '手札に加える「魔導書」カードを選んでください', grimoires(x)); if (u !== null) addToHand(x.s, [u]); },
    }],
  },
  /* 王家の眠る谷－ネクロバレー */
  '5533': {
    necroValley: true,
    effects: [{ id: 'e1', label: '発動する', type: 'card', ss: 1, resolve: () => {} }],
    // ①：フィールドの「墓守」モンスターの攻撃力・守備力は500アップ（自分のモンスターも相手のモンスターも）
    aura: (s, _self, t) => (isGk(s, t) ? { atk: 500, def: 500 } : null),
  },
  /* ネクロバレーの玉座 */
  '13942': {
    effects: [{
      id: 'e1', label: '「墓守」モンスターを手札に加えるか、手札の「墓守」モンスターを召喚する', type: 'card', ss: 1, hardOpt: true,
      can: x => throneModes(x).length > 0,
      activate: x => {
        const modes = throneModes(x);
        x.link .data.mode = modes.length > 1 ? modes[choose(x, { kind: 'option', prompt: 'どちらの効果を発動しますか？', options: modes.map(v => (v === 0 ? 'デッキから「墓守」モンスターを手札に加える' : '手札の「墓守」モンスターを召喚する')) })] : modes[0];
      },
      resolve: x => {
        const s = x.s;
        if (x.link .data.mode === 0) { const u = chooseOne(x, '手札に加える「墓守」モンスターを選んでください', deckOf(s, x.player).filter(u => isGk(s, u))); if (u !== null) addToHand(s, [u]); return; }
        const u = chooseOne(x, '召喚する「墓守」モンスターを選んでください', throneSummonable(x));
        if (u !== null) summonByEffect(x, u);
      },
    }],
  },
  /* 墓守の石版：「王家の眠る谷－ネクロバレー」の効果では無効化されない */
  '8667': {
    ignoresNecroValley: true,
    effects: [{
      id: 'e1', label: '墓地の「墓守の」モンスター2体を手札に加える', type: 'card', ss: 1,
      can: x => gyOf(x.s, x.player).filter(u => defOf(x.s, u).kind === 'monster' && defOf(x.s, u).name.startsWith('墓守の')).length >= 2,
      activate: x => {
        const t = choose(x, { kind: 'cards', prompt: '手札に加える「墓守の」モンスターを2体選んでください', options: gyOf(x.s, x.player).filter(u => defOf(x.s, u).kind === 'monster' && defOf(x.s, u).name.startsWith('墓守の')), min: 2, max: 2 });
        x.link .targets.push(...t);
      },
      resolve: x => { const ok = x.link .targets.filter((t, i) => targetValid(x.s, x.link , i) && x.s.cards[t].zone === 'gy'); if (ok.length) addToHand(x.s, ok); },
    }],
  },
  /* ルドラの魔導書 */
  '13101': {
    effects: [{
      id: 'e1', label: '「魔導書」カードか魔法使い族モンスターを墓地へ送り、2枚ドロー', type: 'card', ss: 1, hardOpt: true,
      can: x => x.s.players[x.player].deck.length >= 2 && rudraCosts(x).length > 0,
      resolve: x => {
        const u = chooseOne(x, '墓地へ送るカードを選んでください', rudraCosts(x));
        if (u === null) return;
        sendToGyLogged(x.s, [u], 'effect');
        if (x.s.cards[u].zone === 'gy') drawCards(x.s, x.player, 2);
      },
    }],
  },
  /* 降霊の儀式：このカードの発動は「王家の眠る谷－ネクロバレー」によっては制限されない */
  '5548': {
    ignoresNecroValley: true,
    effects: [{
      id: 'e1', label: '墓地の「墓守の」モンスター1体を特殊召喚', type: 'card', ss: 2,
      can: x => gyOf(x.s, x.player).some(u => defOf(x.s, u).name.startsWith('墓守の') && canSpecialSummon(x.s, u, x.player, 'special', [], x.self)),
      activate: x => { target(x, '特殊召喚する「墓守の」モンスターを選んでください', gyOf(x.s, x.player).filter(u => defOf(x.s, u).name.startsWith('墓守の') && canSpecialSummon(x.s, u, x.player, 'special', [], x.self))); },
      resolve: x => { const t = x.link .targets[0]; if (targetValid(x.s, x.link ) && x.s.cards[t].zone === 'gy') specialSummon(x, [t]); },
    }],
  },
  /* アヌビスの裁き */
  '5232': {
    effects: [{
      id: 'e1', label: '手札を1枚捨て、魔法・罠を破壊する相手の魔法カードの発動を無効にし破壊', type: 'card', ss: 3,
      can: x => {
        const top = x.s.chain[x.s.chain.length - 1];
        return !!top && top.cardActivation && top.cardKind === 'spell' && top.player === opp(x.player) && !top.negated && destroysSpellTrap(x.s, top.uid) && x.s.players[x.player].hand.length > 0;
      },
      activate: x => {
        x.link .data.index = x.s.chain.length - 1;
        const c = chooseOne(x, '捨てる手札を選んでください（コスト）', handOf(x.s, x.player)) ;
        log(x.s, `${pl(x.player)}：${nameOf(x.s, c)}を捨てる`);
        sendToGy(x.s, [c], 'discard');
      },
      resolve: x => {
        const s = x.s;
        negateActivation(s, s.chain[x.link .data.index          ]);
        const o = monstersOf(s, opp(x.player)).filter(u => isFaceUpMonster(s, u));
        if (!o.length || !choose(x, { kind: 'yesno', prompt: '相手の表側表示モンスター1体を破壊し、その攻撃力分のダメージを与えますか？' })) return;
        newStep(s);
        const t = chooseOne(x, '破壊するモンスターを選んでください', o) ;
        const atk = currentAtk(s, t);
        if (destroy(s, [t], 'effect').length) effectDamage(s, opp(x.player), atk);
      },
    }],
  },
  /* アヌビスの呪い */
  '6067': {
    effects: [{
      id: 'e1', label: '攻撃表示の効果モンスターを全て守備表示にし、元々の守備力を0にする', type: 'card', ss: 2,
      can: x => anubisTargets(x.s).length > 0 && !(x.s.battle && ['dsStart', 'beforeCalc', 'afterCalc', 'dsEnd', 'end'].includes(x.s.battle.step)),
      resolve: x => {
        const s = x.s;
        for (const u of anubisTargets(s)) {
          if (isImmune(s, u)) continue;
          changePositionByEffect(s, u, 'def');
          // このターン、元々の守備力は0になり、表示形式を変更できない
          addStatMod(s, u, 0, -(defOf(s, u).def ?? 0), true);
          addLingering(s, { type: 'noPositionChange', uid: u, serial: s.cards[u].serial, turn: s.turn });
        }
      },
    }],
  },
  /* ネクロバレーの王墓 */
  '10962': {
    effects: [{
      id: 'e1', label: '効果モンスターの効果・魔法・罠カードの発動を無効にし破壊', type: 'card', ss: 3, hardOpt: true,
      can: x => {
        const s = x.s, top = s.chain[s.chain.length - 1];
        if (!top || top.negated || !(top.cardKind === 'monster' || top.cardActivation)) return false;
        const all = [...fieldCards(s, 0), ...fieldCards(s, 1)];
        return all.some(u => isFaceUpMonster(s, u) && isGk(s, u)) && all.some(u => s.cards[u].faceUp && defOf(s, u).name === '王家の眠る谷－ネクロバレー');
      },
      activate: x => { x.link .data.index = x.s.chain.length - 1; },
      resolve: x => { negateActivation(x.s, x.s.chain[x.link .data.index          ]); },
    }],
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
/** 神の警告：①モンスターを召喚・特殊召喚する効果を含む、効果モンスターの効果・魔法・罠カードの発動／②召喚・反転召喚・特殊召喚する際 */
function warningModes(x     )            {
  const s = x.s, res            = [];
  const top = s.chain[s.chain.length - 1];
  if (top && !top.negated && summonsByEffect(s, top)) res.push(1);
  const w = s.window;
  if (!top && w.kind === 'priority' && w.mode === 'summoning' && w.cont.type === 'summon' && s.cards[w.cont.uid].summoning && !scriptOf(s, w.cont.uid).summonUnnegatable) res.push(2);
  return res;
}
/** その発動が、モンスターを召喚・特殊召喚する効果を含むか（効果の説明に「召喚」がある。「召喚できない」などの制限は除く） */
function summonsByEffect(s           , l           )          {
  const e = (scriptOf(s, l.uid).effects || []).find(v => v.id === l.effect.replace(/^dg:/, ''));
  if (!e) return false;
  if (l.cardKind !== 'monster' && !l.cardActivation && !l.effect.startsWith('dg:')) return false;
  return /召喚/.test(e.label) && !/召喚できない|召喚を無効|召喚・反転召喚・特殊召喚された|召喚された/.test(e.label);
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

/* ---------- デッキ dno11（D-HEROデッキ）の共通処理 ---------- */
const isDHero = (s           , u        ) => defOf(s, u).name.startsWith('D-HERO');
const isHeroMonster = (s           , u        ) => defOf(s, u).kind === 'monster' && defOf(s, u).name.includes('HERO');
/** エアーマン：自分フィールドの他の表側表示「HERO」モンスター */
const otherHeroes = (x     ) => monstersOf(x.s, x.player).filter(u => u !== x.self && isFaceUpMonster(x.s, u) && isHeroMonster(x.s, u));
function airmanModes(x     )            {
  const res            = [];
  if (otherHeroes(x).length) res.push(0);
  if (deckOf(x.s, x.player).some(u => isHeroMonster(x.s, u))) res.push(1);
  return res;
}
/** ダッシュガイ③：このドローフェイズにドローしたモンスター */
function dashDrawn(x     )                {
  const s = x.s, p = s.cards[x.self].owner;
  const ev = [...s.events].reverse().find(e => e.type === 'drew' && e.player === p && defOf(s, e.uid).kind === 'monster');
  if (!ev || ev.type !== 'drew' || s.cards[ev.uid].zone !== 'hand' || !canSpecialSummon(s, ev.uid, p)) return null;
  return ev.uid;
}
const doomTargets = (x     ) => gyOf(x.s, x.player).filter(u => isDHero(x.s, u) && defOf(x.s, u).kind === 'monster' && defOf(x.s, u).name !== 'D-HERO ドゥームガイ' && canSpecialSummon(x.s, u, x.player));
const halfLevelDHeroes = (x     , lv        ) => deckOf(x.s, x.player).filter(u => isDHero(x.s, u) && defOf(x.s, u).kind === 'monster' && level(x.s, u) <= Math.floor(lv / 2) && canSpecialSummon(x.s, u, x.player));
const overDestinyTargets = (x     ) => gyOf(x.s, x.player).filter(u => isDHero(x.s, u) && defOf(x.s, u).kind === 'monster' && halfLevelDHeroes(x, level(x.s, u)).length > 0);
const reinforceTargets = (x     ) => deckOf(x.s, x.player).filter(u => defOf(x.s, u).kind === 'monster' && defOf(x.s, u).race === '戦士族' && level(x.s, u) <= 4);
const fieldSpellsInDeck = (x     ) => deckOf(x.s, x.player).filter(u => defOf(x.s, u).kind === 'spell' && defOf(x.s, u).subtype === 'フィールド');
const oppFaceUp = (x     ) => monstersOf(x.s, opp(x.player)).filter(u => isFaceUpMonster(x.s, u));
const signalTargets = (x     ) => [...handOf(x.s, x.player), ...deckOf(x.s, x.player)].filter(u => isDHero(x.s, u) && defOf(x.s, u).kind === 'monster' && level(x.s, u) <= 4 && canSpecialSummon(x.s, u, x.player));

/* ---------- デッキ dno12（絵札の騎士デッキ）の共通処理 ---------- */
const jacks = (x     ) => deckOf(x.s, x.player).filter(u => defOf(x.s, u).name === 'ジャックス・ナイト' && canSpecialSummon(x.s, u, x.player));
/** 装備魔法が装備できる表側表示のモンスター（equipOk が無ければ全て） */
function equipTargets(s           , equip        )           {
  const ok = scriptOf(s, equip).equipOk;
  return allMonsters(s).filter(t => isFaceUpMonster(s, t) && (!ok || ok(s, equip, t)));
}
/** 装備魔法の発動：表側表示のモンスター1体を対象にして装備する */
function equipSpell(label        )               {
  return {
    id: 'e1', label, type: 'card', ss: 1,
    can: x => equipTargets(x.s, x.self).length > 0,
    activate: x => { target(x, '装備するモンスターを選んでください', equipTargets(x.s, x.self)); },
    resolve: x => {
      const s = x.s, t = x.link .targets[0];
      if (!targetValid(s, x.link ) || !isFaceUpMonster(s, t) || !equipTargets(s, x.self).includes(t)) return;
      if (!sameCard(s, x.self, x.link .serial) || !isOnField(s.cards[x.self])) return;
      equipCard(s, x.self, t, { stay: true });
      log(s, `${nameOf(s, x.self)}を${nameOf(s, t)}に装備`);
    },
  };
}
const gyEquips = (x     ) => gyOf(x.s, x.player).filter(u => defOf(x.s, u).kind === 'spell' && defOf(x.s, u).subtype === '装備');
const ownFaceUpEquips = (x     ) => spellTrapsOf(x.s, x.player).filter(u => x.s.cards[u].faceUp && defOf(x.s, u).kind === 'spell' && defOf(x.s, u).subtype === '装備');
const oppSetST = (x     ) => spellTrapsOf(x.s, opp(x.player)).filter(u => !x.s.cards[u].faceUp);
const gyWarriors = (x     ) => gyOf(x.s, x.player).filter(u => defOf(x.s, u).kind === 'monster' && defOf(x.s, u).race === '戦士族');
/** 死皇帝の陵墓：n 体のリリースが必要な手札のモンスター */
const tombMonsters = (x     , n        ) => handOf(x.s, x.player).filter(u => defOf(x.s, u).kind === 'monster' && defOf(x.s, u).frame !== 'ritual' && defOf(x.s, u).frame !== 'fusion' && !scriptOf(x.s, u).cannotNormalSummon && tributesFor(x.s, u) === n);
function tombModes(x     )           {
  const s = x.s, p = x.player;
  if (s.players[p].normalSummonUsed || !freeMZones(s, p).length) return [];
  return [1, 2].filter(n => s.players[p].lp >= n * 1000 && tombMonsters(x, n).length > 0);
}

/* ---------- デッキ dno13（月書恐竜デッキ）の共通処理 ---------- */
/** 究極恐獣：このバトルフェイズにまだ攻撃できるか（他のモンスターの攻撃を禁じる判定用。永続効果の循環を避けて直接調べる） */
function ultimateCanAttack(s           , self        )          {
  const c = s.cards[self];
  if (s.phase !== 'battle' || !isFaceUpMonster(s, self) || c.position !== 'atk' || c.noAttack) return false;
  if (c.attackedTurn !== s.turn) return true;
  const list = c.attackedList ?? [];
  return !list.includes(null) && monstersOf(s, opp(c.controller)).some(t => !list.includes(t));
}
const notFaceUpDef = (s           ) => allMonsters(s).filter(u => !(s.cards[u].faceUp && s.cards[u].position === 'def'));
const defMonsters = (s           ) => allMonsters(s).filter(u => s.cards[u].position === 'def');
const faceUpNonToken = (s           ) => allMonsters(s).filter(u => isFaceUpMonster(s, u) && !isToken(s, u));
const bigDinos = (x     ) => monstersOf(x.s, x.player).filter(u => isFaceUpMonster(x.s, u) && defOf(x.s, u).race === '恐竜族' && level(x.s, u) >= 5);
const tailTargets = (x     , lv        ) => monstersOf(x.s, opp(x.player)).filter(u => !x.s.cards[u].faceUp || level(x.s, u) < lv);
/** 通常召喚可能なモンスター（儀式・融合・「通常召喚できない」以外） */
const normalSummonable = (s           , u        ) => { const d = defOf(s, u); return d.kind === 'monster' && d.frame !== 'ritual' && d.frame !== 'fusion' && !scriptOf(s, u).cannotNormalSummon; };
const gyDinos = (x     ) => gyOf(x.s, x.player).filter(u => defOf(x.s, u).race === '恐竜族' && canSpecialSummon(x.s, u, x.player));
const oppAtkNonToken = (x     ) => monstersOf(x.s, opp(x.player)).filter(u => x.s.cards[u].position === 'atk' && !isToken(x.s, u));

/* ---------- デッキ dno14（海馬デッキ）の共通処理 ---------- */
/** ユニオン：1ターンに1度、①の2つの効果のどちらかを使う */
const unionUsed = (x     ) => x.s.opt[`${x.player}:union:${x.self}`] === x.s.turn;
const markUnion = (x     ) => { x.s.opt[`${x.player}:union:${x.self}`] = x.s.turn; };
const unionTargets = (x     , names          ) => monstersOf(x.s, x.player).filter(u => u !== x.self && isFaceUpMonster(x.s, u) && names.includes(defOf(x.s, u).name));
function unionEffects(names          )                 {
  return [{
    id: 'u1', label: `①：「${names.join('」か「')}」に装備する`, type: 'ignition', ss: 1,
    can: x => !unionUsed(x) && unionTargets(x, names).length > 0 && freeSZones(x.s, x.player).length > 0,
    activate: x => { markUnion(x); target(x, '装備するモンスターを選んでください', unionTargets(x, names)); },
    resolve: x => {
      const s = x.s, t = x.link .targets[0];
      if (!sameCard(s, x.self, x.link .serial) || !isMonsterZone(s.cards[x.self])) return;
      // 処理時に対象が表側表示で存在しない場合、このカードは墓地へ送られる（効果で墓地へ送られた扱いにはならない）
      if (!targetValid(s, x.link ) || !isFaceUpMonster(s, t) || s.cards[t].controller !== x.player || !equipCard(s, x.self, t)) { sendToGy(s, [x.self], 'rule'); return; }
      log(s, `${nameOf(s, x.self)}を${nameOf(s, t)}に装備`);
    },
  }, {
    id: 'u2', label: '①：装備されているこのカードを特殊召喚する', type: 'ignition', ss: 1, zones: ['szone'],
    can: x => !unionUsed(x) && x.s.cards[x.self].equippedTo !== null && canSpecialSummon(x.s, x.self, x.player),
    activate: x => { markUnion(x); },
    resolve: x => { if (sameCard(x.s, x.self, x.link .serial) && x.s.cards[x.self].zone === 'szone') specialSummon(x, [x.self]); },
  }];
}
/** 自分フィールドの上記カードを除外した場合のみEXデッキから特殊召喚できる（融合召喚はできない）。revive：その後は墓地から特殊召喚できる */
function contactFusion(names          , revive         )                      {
  const can = (s           , p          ) => names.every(n => fieldCards(s, p).some(u => defOf(s, u).name === n));
  return {
    specialSummonOk: (s, self, how) => how !== 'fusion' && (revive || s.cards[self].zone !== 'gy'),
    procSummon: {
      zones: ['extra'], label: `自分フィールドの${names.map(n => `「${n}」`).join('・')}を除外して特殊召喚`,
      can: (s, _self, p) => can(s, p),
      pay: x => {
        const s = x.s, picks           = [];
        for (const n of names) picks.push(chooseOne(x, `除外する「${n}」を選んでください`, fieldCards(s, x.player).filter(u => defOf(s, u).name === n && !picks.includes(u))) );
        log(s, `${pl(x.player)}：${picks.map(u => nameOf(s, u)).join('、')}を除外`);
        banish(s, picks, 'material');
        newStep(s); // 除外と特殊召喚は同時に行われない
      },
    },
  };
}
/** 手札を1枚捨て、相手のカード1枚を対象にして発動する起動効果（XYZ・VW など） */
function discardTargetEffect(label        , prompt        , opts                      , apply                             )               {
  return {
    id: 'e1', label, type: 'ignition', ss: 1,
    can: x => handOf(x.s, x.player).length > 0 && opts(x).length > 0,
    activate: x => {
      const c = chooseOne(x, '捨てる手札を選んでください（コスト）', handOf(x.s, x.player)) ;
      log(x.s, `${pl(x.player)}：${nameOf(x.s, c)}を捨てる`);
      sendToGy(x.s, [c], 'discard');
      target(x, prompt, opts(x));
    },
    resolve: x => { const t = x.link .targets[0]; if (targetValid(x.s, x.link )) apply(x, t); },
  };
}
const shineTargets = (x     ) => deckOf(x.s, x.player).filter(u => defOf(x.s, u).kind === 'monster' && defOf(x.s, u).attribute === '光' && (defOf(x.s, u).atk ?? 0) <= 1500 && canSpecialSummon(x.s, u, x.player));
const banishedMine = (x     ) => x.s.players[x.player].banished.filter(u => x.s.cards[u].faceUp && defOf(x.s, u).kind === 'monster' && canSpecialSummon(x.s, u, x.player));
const oppFaceUpMons = (x     ) => monstersOf(x.s, opp(x.player)).filter(u => isFaceUpMonster(x.s, u));
/** 同胞の絆：カード名が異なり、種族・属性・レベルが同じデッキのモンスター */
const bondKin = (x     , t        ) => {
  const s = x.s, d = defOf(s, t);
  return deckOf(s, x.player).filter(u => { const e = defOf(s, u); return e.kind === 'monster' && e.name !== d.name && e.race === d.race && e.attribute === d.attribute && e.level === d.level && canSpecialSummon(s, u, x.player); });
};
const bondTargets = (x     ) => monstersOf(x.s, x.player).filter(u => isFaceUpMonster(x.s, u) && level(x.s, u) <= 4 && new Set(bondKin(x, u).map(v => defOf(x.s, v).name)).size >= 2);
const DRAGON_MIRROR             = { pool: (s, p) => [...monstersOf(s, p), ...gyOf(s, p)], move: 'banish', filter: (s, f) => defOf(s, f).race === 'ドラゴン族' };

/** リリースできる自分のモンスター（召喚僧サモンプリーストはリリースできない） */
function relMons(s           , p          )           { return monstersOf(s, p).filter(u => releasable(s, u)); }

/* ---------- デッキ dno9（A召喚デッキ）の共通処理 ---------- */
/** 闇属性か（光と闇の竜は「闇」としても扱う） */
const isDark = (s           , u        ) => defOf(s, u).attribute === '闇' || defOf(s, u).name === '光と闇の竜';
/** 超古代生物の墓場：特殊召喚されたレベル6以上のモンスター */
const ancientTarget = (s           , u        ) => isFaceUpMonster(s, u) && ['special', 'ritual', 'fusion'].includes(s.cards[u].summonedHow ?? '') && level(s, u) >= 6;
/** 連撃の帝王：アドバンス召喚できる手札のモンスター（必要な数のリリースができること） */
const rengekiMonsters = (x     ) => handOf(x.s, x.player).filter(u => {
  const d = defOf(x.s, u);
  return d.kind === 'monster' && d.frame !== 'ritual' && d.frame !== 'fusion' && !scriptOf(x.s, u).cannotNormalSummon && advanceTributeSets(x.s, x.player, u).length > 0;
});
const brainTargets = (x     ) => monstersOf(x.s, opp(x.player)).filter(u => isFaceUpMonster(x.s, u) && normalSummonable(x.s, u));

/* ---------- デッキ dno10（墓守デッキ）の共通処理 ---------- */
const isGk = (s           , u        ) => defOf(s, u).kind === 'monster' && defOf(s, u).name.includes('墓守');
const gkGy = (x     ) => gyOf(x.s, x.player).filter(u => defOf(x.s, u).kind === 'monster' && defOf(x.s, u).name.startsWith('墓守の') && canSpecialSummon(x.s, u, x.player));
const grimoires = (x     ) => deckOf(x.s, x.player).filter(u => defOf(x.s, u).name.includes('魔導書') && defOf(x.s, u).name !== 'グリモの魔導書');
const rudraCosts = (x     ) => [
  ...handOf(x.s, x.player).filter(u => u !== x.self && defOf(x.s, u).name.includes('魔導書') && defOf(x.s, u).name !== 'ルドラの魔導書'),
  ...spellTrapsOf(x.s, x.player).filter(u => u !== x.self && x.s.cards[u].faceUp && defOf(x.s, u).name.includes('魔導書') && defOf(x.s, u).name !== 'ルドラの魔導書'),
  ...monstersOf(x.s, x.player).filter(u => isFaceUpMonster(x.s, u) && defOf(x.s, u).race === '魔法使い族'),
];
/** ネクロバレーの玉座：手札から召喚できる「墓守」モンスター（リリースが要らないもの） */
const throneSummonable = (x     ) => handOf(x.s, x.player).filter(u => isGk(x.s, u) && normalSummonable(x.s, u) && tributesFor(x.s, u) === 0 && freeMZones(x.s, x.player).length > 0);
function throneModes(x     )           {
  const res           = [];
  if (deckOf(x.s, x.player).some(u => isGk(x.s, u))) res.push(0);
  if (throneSummonable(x).length) res.push(1);
  return res;
}
/** 効果で手札のモンスターを召喚する（通常召喚の回数は使わない。ネクロバレーの玉座） */
function summonByEffect(x     , u        )       {
  const s = x.s, z = freeMZones(s, x.player);
  if (!z.length || s.cards[u].zone !== 'hand') return;
  moveCard(s, u, 'mzone', { index: z[0], faceUp: true, position: 'atk', controller: x.player });
  const c = s.cards[u]; c.summonedHow = 'normal'; c.summonedTurn = s.turn;
  log(s, `${pl(x.player)}：${nameOf(s, u)}を召喚`);
  pushAnim(s, { kind: 'summon', uid: u, how: 'normal', mats: [] });
  emit(s, { type: 'summoned', uid: u, player: x.player, how: 'normal' });
}
/** 「フィールドの魔法・罠カードを破壊する」効果を持つ魔法カードか（アヌビスの裁き） */
const destroysSpellTrap = (s           , u        ) => /魔法・罠カード[^。]*破壊|魔法・罠[^。]*全て破壊/.test(defOf(s, u).text || '');
/** 効果モンスターか（儀式・融合でも効果を持つものは効果モンスター。サクリファイス・F・G・Dなど） */
const isEffectMonster = (s           , u        ) => defOf(s, u).frame === 'effect' || (defOf(s, u).monsterTypes ?? []).includes('効果');
const anubisTargets = (s           ) => allMonsters(s).filter(u => isFaceUpMonster(s, u) && s.cards[u].position === 'atk' && isEffectMonster(s, u));
