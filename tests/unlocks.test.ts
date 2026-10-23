/**
 * 境界解锁表（D1-60s spec §4）：判定层纯函数。
 *
 * 这张表的价值全在「约束」上，不在「能查到」上——所以测试重点不是 getter 能不能返回，
 * 而是：① 每档入口数正好是 3/7/12/16/17；② **修行与妖径必须同档**（活跃度 100 可达性）；
 * ③ 脏档不能误开高阶入口。
 */
import { describe, expect, it } from 'vitest';
import {
    UNLOCKS,
    UNLOCK_COUNT_BY_REALM,
    UNLOCK_IDS,
    isUnlocked,
    nextUnlockEntries,
    nextUnlockRealm,
    unlockOf,
    unlockedAt,
    unlockedInTier,
    unlockedSlots,
} from '../assets/scripts/core/config/unlocks';

describe('境界解锁表：表结构与计数（spec §4）', () => {
    it('17 项、id 唯一、没有重复项', () => {
        expect(UNLOCKS).toHaveLength(17);
        expect(new Set(UNLOCK_IDS).size).toBe(17);
    });

    it('每档累计入口数正好是 3 / 7 / 12 / 16 / 17（化神不再新增）', () => {
        // 境界下标：0 凡人 / 1 练气 / 2 筑基 / 3 金丹 / 4 元婴 / 5 化神
        [0, 1, 2, 3, 4, 5].forEach((realm) => {
            expect(unlockedAt(realm).length, `境界 ${realm} 入口数`).toBe(UNLOCK_COUNT_BY_REALM[realm]);
        });
        expect(UNLOCK_COUNT_BY_REALM).toEqual([3, 7, 12, 16, 17, 17]);
    });

    it('凡人只有 3 个可点（首日 60 秒不做选择）', () => {
        const ids = unlockedAt(0).map((u) => u.id).sort();
        expect(ids).toEqual(['box', 'breakthrough', 'settings']);
    });

    it('每档恰好新增 spec 列出的那几项', () => {
        expect(unlockedInTier(1).map((u) => u.id)).toEqual(['collection', 'shop', 'checkin', 'dailyGift']);
        expect(unlockedInTier(2).map((u) => u.id)).toEqual(['quests', 'trail', 'ludao', 'weapon', 'offline']);
        expect(unlockedInTier(3).map((u) => u.id)).toEqual(['tower', 'alchemy', 'fortune', 'sect']);
        expect(unlockedInTier(4).map((u) => u.id)).toEqual(['path']);
        expect(unlockedInTier(5)).toHaveLength(0);
    });
});

describe('境界解锁表：硬约束（改动前先读这条）', () => {
    it('修行与妖径必须同一档解锁 —— 否则活跃度 100 永远拿不到', () => {
        // QUESTS 含「妖径通关 1 层」。若修行在练气（1）而妖径在筑基（2），
        // 练气期可完成任务只有 3 个、活跃度上限 75，100 档宝箱不可达。
        const quests = unlockOf('quests')!;
        const trail = unlockOf('trail')!;
        expect(quests.unlockRealm).toBe(trail.unlockRealm);
        expect(quests.unlockRealm).toBe(2);
    });

    it('解锁顺序单调：不存在「低档 → 高档 → 再低档」的错序', () => {
        const realms = UNLOCKS.map((u) => u.unlockRealm);
        // 同一档内部允许任意顺序，但按境界分组后不能回退
        const grouped: number[] = [];
        realms.forEach((r) => {
            if (!grouped.length || grouped[grouped.length - 1] !== r) grouped.push(r);
        });
        expect(grouped).toEqual([...grouped].sort((a, b) => a - b));
    });

    it('每日仙缘（广告位）不早于练气 —— 首日 60 秒必须 0 支广告', () => {
        expect(unlockOf('dailyGift')!.unlockRealm).toBeGreaterThanOrEqual(1);
    });
});

describe('境界解锁表：判定与脏档防御', () => {
    it('isUnlocked 用 >= 语义（已解锁的不会因为再突破而收回）', () => {
        expect(isUnlocked('box', 0)).toBe(true);
        expect(isUnlocked('checkin', 0)).toBe(false);
        expect(isUnlocked('checkin', 1)).toBe(true);
        expect(isUnlocked('checkin', 5)).toBe(true);
        expect(isUnlocked('path', 3)).toBe(false);
        expect(isUnlocked('path', 4)).toBe(true);
    });

    it('脏档按凡人处理：NaN / 负数 / Infinity 不误开高阶入口', () => {
        expect(isUnlocked('checkin', NaN)).toBe(false);
        expect(isUnlocked('checkin', -1)).toBe(false);
        expect(isUnlocked('path', -99)).toBe(false);
        // 非有限值同样落回凡人档（不因 Infinity 就全开）
        expect(isUnlocked('path', Infinity)).toBe(false);
    });

    it('超出最高境界（化神以上）全开且不报错', () => {
        expect(unlockedAt(99)).toHaveLength(17);
        expect(nextUnlockRealm(99)).toBeNull();
        expect(nextUnlockEntries(99)).toEqual([]);
    });

    it('未知 id：isUnlocked false / unlockOf null', () => {
        expect(isUnlocked('nope' as never, 5)).toBe(false);
        expect(unlockOf('nope')).toBeNull();
    });
});

describe('境界解锁表：落位与下一档（首页/仙路总览用）', () => {
    it('unlockedSlots 只返回该落位且已解锁的项', () => {
        const ring0 = unlockedSlots(0, 'ring').map((u) => u.id);
        expect(ring0).toEqual(['box']); // 凡人环形只有宝盒
        const ring1 = unlockedSlots(1, 'ring').map((u) => u.id);
        expect(ring1).toEqual(['box', 'collection', 'shop']);
        const railR2 = unlockedSlots(2, 'railR').map((u) => u.id);
        expect(railR2).toEqual(['quests', 'trail', 'ludao', 'weapon']);
    });

    it('nextUnlockRealm 返回最小未达境界；每档只提示一档', () => {
        expect(nextUnlockRealm(0)).toBe(1);
        expect(nextUnlockRealm(1)).toBe(2);
        expect(nextUnlockRealm(2)).toBe(3);
        expect(nextUnlockRealm(4)).toBeNull();
        expect(nextUnlockEntries(1).map((u) => u.id)).toEqual(['quests', 'trail', 'ludao', 'weapon', 'offline']);
    });

    it('五个落位都有内容（不存在写了 slot 却永远不出现的项）', () => {
        const slots = ['ring', 'railR', 'railL', 'tower', 'gift', 'cta', 'page'] as const;
        slots.forEach((s) => {
            expect(unlockedSlots(5, s).length, `落位 ${s} 无任何项`).toBeGreaterThan(0);
        });
    });
});
