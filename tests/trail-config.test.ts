/**
 * M15-T1 妖径配置与派生层测试（数值假设 #47）：
 * 章节/层换算、玩法派生确定性、Boss 关规则、妖怪池归属、奖励表与重刷护栏常量。
 */
import { describe, expect, it } from 'vitest';
import {
    AVAILABLE_GAMES,
    TRAIL_CHAPTERS,
    TRAIL_LAYERS_PER_CHAPTER,
    TRAIL_MAT_CHANCE,
    TRAIL_REPEAT_PER_DAY,
    chapterGift,
    chapterOf,
    deriveBattle,
    deriveGame,
    firstClearReward,
    layerInChapter,
    repeatLingshi,
} from '../assets/scripts/core/config/trail';

describe('M15-T1 章节/层换算', () => {
    it('chapterOf：1..10 → 第 1 章；11..20 → 第 2 章', () => {
        expect(chapterOf(1)).toBe(1);
        expect(chapterOf(10)).toBe(1);
        expect(chapterOf(11)).toBe(2);
        expect(chapterOf(20)).toBe(2);
        expect(chapterOf(21)).toBe(3);
    });

    it('layerInChapter 边界：10 → 10、11 → 1', () => {
        expect(layerInChapter(1)).toBe(1);
        expect(layerInChapter(10)).toBe(10);
        expect(layerInChapter(11)).toBe(1);
        expect(layerInChapter(30)).toBe(10);
    });

    it('章节表至少 3 章，每章 10 关、typePlan 长度 = 9、奖励表齐全', () => {
        expect(TRAIL_CHAPTERS.length).toBeGreaterThanOrEqual(3);
        for (const ch of TRAIL_CHAPTERS) {
            expect(ch.typePlan.length).toBe(TRAIL_LAYERS_PER_CHAPTER - 1);
            expect(ch.monsters.length).toBeGreaterThanOrEqual(4);
            expect(ch.rewardSections.length).toBe(3);
            expect(ch.fragmentChance.length).toBe(3);
        }
    });
});

describe('M15-T1 玩法派生', () => {
    it('Boss 关（层号 % 10 === 0）恒为战斗', () => {
        for (const layer of [10, 20, 30, 100]) {
            expect(deriveGame(layer)).toBe('battle');
            expect(deriveBattle(layer).isBoss).toBe(true);
        }
    });

    it('普通关派生类型来自章节 typePlan 且下标正确', () => {
        const plan = TRAIL_CHAPTERS[0].typePlan;
        expect(deriveGame(1)).toBe(eff(plan[0]));
        expect(deriveGame(9)).toBe(eff(plan[8]));
        expect(deriveGame(12)).toBe(eff(TRAIL_CHAPTERS[1].typePlan[1]));
    });

    it('章节计划内同一玩法不连续超过 2 层（含 Boss 战斗边界拼接）', () => {
        for (const ch of TRAIL_CHAPTERS) {
            const seq: string[] = [...ch.typePlan, 'battle'];
            let run = 1;
            for (let i = 1; i < seq.length; i++) {
                run = seq[i] === seq[i - 1] ? run + 1 : 1;
                expect(run).toBeLessThanOrEqual(2);
            }
            expect(seq.length).toBe(TRAIL_LAYERS_PER_CHAPTER);
        }
    });

    it('M15 仅 battle 可玩：非 battle 派生回退 battle', () => {
        expect(AVAILABLE_GAMES).toEqual(['battle']);
        const ch1 = TRAIL_CHAPTERS[0];
        const idx = ch1.typePlan.findIndex((g) => g !== 'battle');
        if (idx >= 0) expect(deriveGame(idx + 1)).toBe('battle');
    });

    it('deriveBattle 确定性：同层 100 次结果一致', () => {
        const first = deriveBattle(7);
        for (let i = 0; i < 100; i++) {
            const r = deriveBattle(7);
            expect(r.monsterId).toBe(first.monsterId);
            expect(r.personality).toBe(first.personality);
        }
    });

    it('妖怪来自本章池；Boss 关用本章 Boss', () => {
        const ch1 = TRAIL_CHAPTERS[0];
        const normal = deriveBattle(3);
        expect(ch1.monsters.some((m) => m.id === normal.monsterId)).toBe(true);
        const boss = deriveBattle(10);
        expect(boss.monsterId).toBe(ch1.boss.id);
    });

    it('性格为三选一（swift/iron/blood）', () => {
        for (const layer of [1, 2, 3, 4, 5, 13, 27]) {
            expect(['swift', 'iron', 'blood']).toContain(deriveBattle(layer).personality);
        }
    });
});

describe('M15-T1 奖励表（#47）', () => {
    it('首通灵石区间有效且随章节内进度爬升', () => {
        const r1 = firstClearReward(1);
        const r5 = firstClearReward(5);
        const r9 = firstClearReward(9);
        for (const r of [r1, r5, r9]) {
            expect(r.lingshi[0]).toBeGreaterThan(0);
            expect(r.lingshi[1]).toBeGreaterThanOrEqual(r.lingshi[0]);
        }
        expect(r5.lingshi[0]).toBeGreaterThanOrEqual(r1.lingshi[1] - 1);
        expect(r9.lingshi[0]).toBeGreaterThanOrEqual(r5.lingshi[1] - 1);
        expect(r1.fragmentChance).toBeCloseTo(0.1);
        expect(r5.fragmentChance).toBeCloseTo(0.3);
        expect(r9.fragmentChance).toBeCloseTo(0.5);
    });

    it('Boss 首通含修为/机缘档位（对齐 #35 斩妖荒古档）', () => {
        const boss = firstClearReward(10);
        expect(boss.isBoss).toBe(true);
        expect(boss.xiuwei).toBeGreaterThan(0);
        expect(boss.jiyuan).toBeGreaterThan(0);
        expect(boss.fragmentChance).toBe(1);
    });

    it('重刷灵石 = 首通区间中值 ×30% 向下取整', () => {
        const f = firstClearReward(1);
        expect(repeatLingshi(1)).toBe(Math.floor(((f.lingshi[0] + f.lingshi[1]) / 2) * 0.3));
    });

    it('章节大礼：灵石/灵材/必得碎片齐备', () => {
        const g = chapterGift(1);
        expect(g.lingshi).toBeGreaterThan(0);
        expect(Object.keys(g.mats).length).toBeGreaterThan(0);
        expect(g.fragments).toBeGreaterThanOrEqual(1);
    });

    it('重刷护栏常量：每日 5 次、灵草概率 60%', () => {
        expect(TRAIL_REPEAT_PER_DAY).toBe(5);
        expect(TRAIL_MAT_CHANCE).toBe(0.6);
    });
});

/** M15 过滤口径：非 battle 一律回退 battle（与实现一致） */
function eff(g: string): string {
    return AVAILABLE_GAMES.includes(g as never) ? g : 'battle';
}
