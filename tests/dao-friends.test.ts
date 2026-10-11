/**
 * M25 道友档案化（子项目② a 层，数值假设 #50）：
 * 20 位虚拟道友确定性档案（境界偏移 6/-1 · 8/0 · 6/+1 分布、个人攻防带宽、倾向）、
 * makeFriendOpponent 纯派生、交情礼（100/场、日封顶 200、跨日重置）。
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../assets/scripts/core/rng';
import { defaultSave, SaveData } from '../assets/scripts/core/saveModel';
import { EconomySystem } from '../assets/scripts/core/systems/EconomySystem';
import { CombatSystem } from '../assets/scripts/core/systems/CombatSystem';
import { REALM_COMBAT, PK_OPP_NAMES, PK_FRIEND_GIFT, PK_FRIEND_GIFT_CAP } from '../assets/scripts/core/config/combat';
import {
    DAO_FRIEND_COUNT,
    DAO_FRIEND_REALM_OFFSETS,
    daoFriendOffset,
    daoFriendRealm,
    daoFriendStance,
    makeFriendOpponent,
    daoFriendLabel,
} from '../assets/scripts/core/daoFriends';

const mkSave = (realmIndex = 3): SaveData => {
    const s = defaultSave();
    s.realmIndex = realmIndex;
    return s;
};

describe('M25 道友档案（#50）', () => {
    it('20 位道友，境界偏移分布 6 位 −1 / 8 位 0 / 6 位 +1', () => {
        expect(DAO_FRIEND_COUNT).toBe(20);
        expect(DAO_FRIEND_COUNT).toBe(PK_OPP_NAMES.length);
        expect(DAO_FRIEND_REALM_OFFSETS.length).toBe(20);
        const count = (v: number) => DAO_FRIEND_REALM_OFFSETS.filter((x) => x === v).length;
        expect(count(-1)).toBe(6);
        expect(count(0)).toBe(8);
        expect(count(1)).toBe(6);
    });

    it('道友境界 = clamp(playerRealm + offset)：金丹玩家看高一境的道友为元婴', () => {
        // 找一位 offset=+1 的道友
        const up = DAO_FRIEND_REALM_OFFSETS.indexOf(1);
        expect(daoFriendRealm(mkSave(3), up)).toBe(4);
        const down = DAO_FRIEND_REALM_OFFSETS.indexOf(-1);
        expect(daoFriendRealm(mkSave(3), down)).toBe(2);
        // 凡人玩家：−1 道友 clamp 到 0（不出现负境界）
        expect(daoFriendRealm(mkSave(0), down)).toBe(0);
        // 化神玩家：+1 道友 clamp 到 5（封顶）
        expect(daoFriendRealm(mkSave(5), up)).toBe(5);
    });

    it('确定性：同玩家境界下同道友恒同战力（纯派生，与 Rng 无关）', () => {
        const save = mkSave(3);
        const a = makeFriendOpponent(save, 7);
        const b = makeFriendOpponent(save, 7);
        expect(a).toEqual(b);
        // 战力 = REALM_COMBAT[道友境界] × 个人带宽（1.0–1.3）
        const realm = daoFriendRealm(save, 7);
        const base = REALM_COMBAT[realm];
        expect(a.atk).toBeGreaterThanOrEqual(Math.round(base.atk));
        expect(a.atk).toBeLessThanOrEqual(Math.round(base.atk * 1.3));
        expect(a.def).toBeGreaterThanOrEqual(Math.round(base.def));
        expect(a.def).toBeLessThanOrEqual(Math.round(base.def * 1.3));
        expect(a.mode).toBe('friend');
        expect(a.friendIndex).toBe(7);
        expect(a.name).toBe(PK_OPP_NAMES[7]);
    });

    it('战力跟随玩家境界：玩家境界升 → 同位道友战力升（local 比较目标）', () => {
        const low = makeFriendOpponent(mkSave(2), 7);
        const high = makeFriendOpponent(mkSave(3), 7);
        expect(high.atk + high.def).toBeGreaterThan(low.atk + low.def);
    });

    it('倾向三态：攻强/守固/均衡由 atkBand−defBand 派生且 20 位三态俱全', () => {
        const stances = Array.from({ length: 20 }, (_, i) => daoFriendStance(i));
        expect(stances.every((s) => s === '攻强' || s === '守固' || s === '均衡')).toBe(true);
        expect(new Set(stances).size).toBe(3);
        // 档案文案：名字 + 境界字 + 倾向
        const label = daoFriendLabel(mkSave(3), 7);
        expect(label).toContain(PK_OPP_NAMES[7]);
    });
});

describe('M25 交情礼（日封顶 200）', () => {
    it('friend 胜利给 100/场，日累计封顶 200（第 3 场起 0）', () => {
        const save = mkSave(3);
        const eco = new EconomySystem(save);
        const combat = new CombatSystem(eco, new Rng(1));
        const before = save.lingshi;
        expect(combat.friendGift(save).amount).toBe(PK_FRIEND_GIFT);
        expect(save.daily.pkFriendGift).toBe(PK_FRIEND_GIFT);
        expect(combat.friendGift(save).amount).toBe(PK_FRIEND_GIFT);
        expect(save.daily.pkFriendGift).toBe(2 * PK_FRIEND_GIFT);
        // 第 3 场：余额只剩 0（2×100 = 200 封顶）
        expect(combat.friendGift(save).amount).toBe(0);
        expect(save.lingshi - before).toBe(PK_FRIEND_GIFT_CAP);
    });

    it('失败不给、跨日重置清零（dailyReset 显式重置）', () => {
        const save = mkSave(3);
        const eco = new EconomySystem(save);
        const combat = new CombatSystem(eco, new Rng(1));
        // friendGift 只在胜利后调用（调用方契约）；这里直接验证封顶与重置语义
        combat.friendGift(save);
        // 跨日
        const eco2 = new EconomySystem(save);
        eco2.dailyReset(new Date(Date.now() + 86400_000));
        expect(save.daily.pkFriendGift).toBe(0);
        expect(combat.friendGift(save).amount).toBe(PK_FRIEND_GIFT);
    });
});
