/**
 * 开箱「长按连开」判定层单测（首日体验 spec §4.C1 / C2 / C3）。
 *
 * 核心约束：连开**只改交互节奏与演出**，不碰任何开箱数值（概率 / 保底 / 奖励）。
 * 因此判定逻辑全部抽成零 cc 依赖的纯函数，可脱离引擎直接断言。
 */
import { describe, expect, it } from 'vitest';
import {
    AUTO_OPEN,
    autoPitch,
    autoStopReason,
    chestGlow,
    isNovicePity,
    shouldEnterAuto,
    summarizeAutoOpens,
} from '../assets/scripts/core/boxAuto';

describe('首日体验 C1：长按连开判定', () => {
    it('按住时长达到阈值才进入连开，短按走普通开箱', () => {
        expect(shouldEnterAuto(0)).toBe(false);
        expect(shouldEnterAuto(AUTO_OPEN.holdThreshold - 0.01)).toBe(false);
        expect(shouldEnterAuto(AUTO_OPEN.holdThreshold)).toBe(true);
        expect(shouldEnterAuto(3)).toBe(true);
    });

    it('连开间隔约 1.2s、单次按住上限 12 次（规格值 + 防误触封顶）', () => {
        expect(AUTO_OPEN.interval).toBeCloseTo(1.2, 9);
        expect(AUTO_OPEN.maxPerHold).toBe(12);
    });

    const ok = { canOpen: true, boxLocked: false, canBreakthrough: false, opened: 0 };

    it('一切正常时继续连开', () => {
        expect(autoStopReason({ ...ok, opened: 0 })).toBe('none');
        expect(autoStopReason({ ...ok, opened: 5 })).toBe('none');
    });

    it('灵石不足 / 盒子未解锁 → 立即中断', () => {
        expect(autoStopReason({ ...ok, canOpen: false })).toBe('lingshiNotEnough');
        expect(autoStopReason({ ...ok, boxLocked: true })).toBe('boxLocked');
    });

    it('机缘达标可渡劫 → 中断（规格：提示可冲击下一境界）', () => {
        expect(autoStopReason({ ...ok, canBreakthrough: true })).toBe('breakthrough');
    });

    it('达到单次按住上限 → 中断（防误触无限消耗灵石，spec R4）', () => {
        expect(autoStopReason({ ...ok, opened: AUTO_OPEN.maxPerHold - 1 })).toBe('none');
        expect(autoStopReason({ ...ok, opened: AUTO_OPEN.maxPerHold })).toBe('limit');
        expect(autoStopReason({ ...ok, opened: 99 })).toBe('limit');
    });

    it('中断原因有优先级：未解锁 > 灵石不足 > 上限 > 可渡劫', () => {
        const all = { canOpen: false, boxLocked: true, canBreakthrough: true, opened: 99 };
        expect(autoStopReason(all)).toBe('boxLocked');
        expect(autoStopReason({ ...all, boxLocked: false })).toBe('lingshiNotEnough');
        expect(autoStopReason({ ...all, boxLocked: false, canOpen: true })).toBe('limit');
        expect(autoStopReason({ ...all, boxLocked: false, canOpen: true, opened: 0 })).toBe('breakthrough');
    });
});

describe('首日体验 C2：连开反馈层（纯演出）', () => {
    it('箱体灵光随连开次数递增并封顶（0→1，不超过 1）', () => {
        expect(chestGlow(0)).toBeCloseTo(0, 9);
        const g1 = chestGlow(1);
        const g4 = chestGlow(4);
        expect(g1).toBeGreaterThan(0);
        expect(g4).toBeGreaterThan(g1);
        expect(chestGlow(AUTO_OPEN.glowCap)).toBeCloseTo(1, 9);
        expect(chestGlow(AUTO_OPEN.glowCap + 50)).toBeCloseTo(1, 9); // 封顶
    });

    it('音效音高随连开层数升调，且封顶不刺耳（≤ 6 个半音）', () => {
        expect(autoPitch(0)).toBeCloseTo(1, 9); // 第 1 次是原调
        expect(autoPitch(2)).toBeGreaterThan(1);
        expect(autoPitch(6)).toBeGreaterThan(autoPitch(2));
        // 封顶：一个增四度（6 半音 ≈ ×1.4142），再连开也不继续升
        const cap = autoPitch(999);
        expect(cap).toBeCloseTo(Math.pow(2, 6 / 12), 9);
        expect(autoPitch(1000)).toBeCloseTo(cap, 9);
    });
});

describe('首日体验 C3：保底前置（新手期放大显示）', () => {
    it('累计开箱 < 5 次视为新手期，需放大保底进度', () => {
        expect(isNovicePity(0)).toBe(true);
        expect(isNovicePity(4)).toBe(true);
        expect(isNovicePity(5)).toBe(false);
        expect(isNovicePity(999)).toBe(false);
    });
});

describe('连开汇总结算：只聚合、不产生新数值', () => {
    const mk = (tier: string, rewards: any[]) => ({ tier, rewards });

    it('按品阶计数，灵石/修为/机缘分别累加', () => {
        const s = summarizeAutoOpens([
            mk('normal', [{ kind: 'lingshi', amount: 10, label: '灵石 +10' }, { kind: 'xiuwei', amount: 5, label: '修为 +5' }]),
            mk('rare', [{ kind: 'lingshi', amount: 20, label: '灵石 +20' }]),
            mk('disaster', [{ kind: 'xiuwei', amount: -3, label: '修为 -3' }, { kind: 'jiyuan', amount: 7, label: '机缘 +7' }]),
        ]);
        expect(s.opens).toBe(3);
        expect(s.normal).toBe(1);
        expect(s.rare).toBe(1);
        expect(s.disaster).toBe(1);
        expect(s.lingshi).toBe(30);
        expect(s.xiuwei).toBe(2); // 5 + (-3)，负值如实计入（连开不隐藏损失）
        expect(s.jiyuan).toBe(7);
    });

    it('碎片按 id 合并、功法按文案合并', () => {
        const s = summarizeAutoOpens([
            mk('normal', [
                { kind: 'fragment', amount: 1, label: 'a', lingengId: 'jin' },
                { kind: 'gongfa', amount: 1, label: '御剑诀' },
            ]),
            mk('normal', [
                { kind: 'fragment', amount: 2, label: 'a', lingengId: 'jin' },
                { kind: 'fragment', amount: 1, label: 'b', lingengId: 'mu' },
                { kind: 'gongfa', amount: 1, label: '御剑诀' },
            ]),
        ]);
        expect(s.fragments).toEqual([{ id: 'jin', amount: 3 }, { id: 'mu', amount: 1 }]);
        expect(s.others).toEqual([{ label: '御剑诀', amount: 2 }]);
    });

    it('空连开（未开成就松开）不炸，全零', () => {
        const s = summarizeAutoOpens([]);
        expect(s.opens).toBe(0);
        expect(s.lingshi).toBe(0);
        expect(s.fragments).toEqual([]);
        expect(s.others).toEqual([]);
    });
});
