/**
 * M15-T3 TrailSystem 测试（数值假设 #47）：
 * 首通推进/章节大礼幂等、重刷 5 次日护栏与跨日翻新、战意倍率、Boss 首通档位、依赖降级。
 */
import { describe, expect, it } from 'vitest';
import { defaultSave, SaveData } from '../assets/scripts/core/saveModel';
import { TrailSystem } from '../assets/scripts/core/systems/TrailSystem';
import { EconomySystem } from '../assets/scripts/core/systems/EconomySystem';
import { AlchemySystem } from '../assets/scripts/core/systems/AlchemySystem';
import { Rng } from '../assets/scripts/core/rng';

const DAY1 = new Date('2026-10-08T10:00:00');
const DAY2 = new Date('2026-10-09T10:00:00');

function makeSave(): SaveData {
    return defaultSave();
}

/** 带依赖的系统（seed 固定保证可复现） */
function makeSystem(seed = 42): { sys: TrailSystem; eco: EconomySystem; alch: AlchemySystem; save: SaveData } {
    const save = makeSave();
    const eco = new EconomySystem(save);
    const alch = new AlchemySystem(eco);
    const sys = new TrailSystem(eco, alch, new Rng(seed));
    return { sys, eco, alch, save };
}

describe('M15-T3 首通推进', () => {
    it('通关当前层 → curLayer +1，灵石落在首通区间', () => {
        const { sys, save } = makeSystem();
        const r = sys.settleWin(save, 1, { morale: false, now: DAY1 });
        expect(r).not.toBeNull();
        expect(r!.kind).toBe('first');
        expect(save.trail.curLayer).toBe(2);
        const ls = r!.items.find((i) => i.kind === 'lingshi');
        expect(ls).toBeDefined();
        expect(ls!.amount).toBeGreaterThanOrEqual(80);
        expect(ls!.amount).toBeLessThanOrEqual(150);
    });

    it('非法层（超出当前可挑战层）返回 null', () => {
        const { sys, save } = makeSystem();
        expect(sys.settleWin(save, 5, { morale: false, now: DAY1 })).toBeNull();
    });

    it('连过 10 层触发章节大礼且只发一次；Boss 层首通含修为/机缘/必得碎片', () => {
        const { sys, save, eco } = makeSystem();
        const jiyuanBefore = save.jiyuan;
        for (let l = 1; l <= 10; l++) {
            expect(sys.settleWin(save, l, { morale: false, now: DAY1 })).not.toBeNull();
        }
        expect(save.trail.curLayer).toBe(11);
        expect(save.trail.chapterGifts).toEqual([1]);
        // Boss 首通：修为 > 0、机缘 +5（第 1 章 bossSlay）、碎片必得
        expect(save.xiuwei).toBeGreaterThan(0);
        expect(save.jiyuan).toBe(jiyuanBefore + 5);
        expect(save.fragments['jinmu']).toBeGreaterThanOrEqual(2); // 前 9 层概率碎片 + Boss 必得 1
        // 章节大礼幂等：重复结算同一章不重复发（重刷路径不触发大礼）
        const giftCount = save.trail.chapterGifts.length;
        sys.settleWin(save, 10, { morale: false, now: DAY1 });
        expect(save.trail.chapterGifts.length).toBe(giftCount);
        expect(eco).toBeDefined();
    });
});

describe('M15-T3 重刷护栏（#47）', () => {
    it('每日前 5 次重刷有产出，第 6 次零收益但仍成功结算', () => {
        const { sys, save } = makeSystem();
        sys.settleWin(save, 1, { morale: false, now: DAY1 }); // 首通
        for (let i = 0; i < 5; i++) {
            const r = sys.settleWin(save, 1, { morale: false, now: DAY1 });
            expect(r!.kind).toBe('repeat');
            expect(r!.items.some((x) => x.kind === 'lingshi' && x.amount > 0)).toBe(true);
        }
        expect(sys.repeatLeft(save, DAY1)).toBe(0);
        const r6 = sys.settleWin(save, 1, { morale: false, now: DAY1 });
        expect(r6).not.toBeNull();
        expect(r6!.kind).toBe('gated');
        expect(r6!.items.length).toBe(0);
    });

    it('跨日翻新：次日重刷计数归零', () => {
        const { sys, save } = makeSystem();
        sys.settleWin(save, 1, { morale: false, now: DAY1 });
        for (let i = 0; i < 5; i++) sys.settleWin(save, 1, { morale: false, now: DAY1 });
        expect(sys.repeatLeft(save, DAY1)).toBe(0);
        expect(sys.repeatLeft(save, DAY2)).toBe(5);
    });

    it('重刷灵石 = 首通中值 30% × 战意倍率（floor）', () => {
        const { sys, save } = makeSystem(1);
        sys.settleWin(save, 1, { morale: false, now: DAY1 });
        const base = Math.floor(((80 + 150) / 2) * 0.3); // 34
        const r1 = sys.settleWin(save, 1, { morale: false, now: DAY1 })!;
        expect(r1.items.find((x) => x.kind === 'lingshi')!.amount).toBe(base);
        const r2 = sys.settleWin(save, 1, { morale: true, now: DAY1 })!;
        expect(r2.items.find((x) => x.kind === 'lingshi')!.amount).toBe(Math.floor(base * 1.15));
    });

    it('重刷灵草 60% 概率入 alch 库存', () => {
        const { sys, save } = makeSystem(7);
        sys.settleWin(save, 1, { morale: false, now: DAY1 });
        const before = save.fortune.materials['lingcao'] ?? 0;
        // 连续重刷 5 次，seed=7 下至少命中一次概率位
        for (let i = 0; i < 5; i++) sys.settleWin(save, 1, { morale: false, now: DAY1 });
        expect(save.fortune.materials['lingcao'] ?? 0).toBeGreaterThan(before);
    });
});

describe('M15-T3 依赖降级', () => {
    it('未注入 eco/alch 时进度照常推进、不发奖励不抛', () => {
        const save = makeSave();
        const sys = new TrailSystem(undefined, undefined, new Rng(3));
        const r = sys.settleWin(save, 1, { morale: false, now: DAY1 });
        expect(r).not.toBeNull();
        expect(save.trail.curLayer).toBe(2);
        expect(r!.items.length).toBe(0);
    });
});
