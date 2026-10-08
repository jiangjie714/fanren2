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
    chapterScale,
    deriveBattle,
    deriveGame,
    deriveMatch3,
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
        expect(chapterOf(31)).toBe(4);
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

    it('M17 match3 可玩：三玩法全接入无回退', () => {
        expect((AVAILABLE_GAMES as readonly string[]).indexOf('puzzle')).toBeGreaterThanOrEqual(0);
        expect((AVAILABLE_GAMES as readonly string[]).indexOf('match3')).toBeGreaterThanOrEqual(0);
        const ch1 = TRAIL_CHAPTERS[0];
        const idx = ch1.typePlan.indexOf('match3');
        if (idx >= 0) expect(deriveGame(idx + 1)).toBe('match3');
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

    it('第 4 章幽冥血渊：配比 5:3:2 且奖励跨章爬升', () => {
        const ch4 = TRAIL_CHAPTERS[3];
        expect(ch4.id).toBe('yuanxue');
        expect(ch4.monsters.length).toBe(6);
        // 9 格 plan 内 battle=4，加 Boss 恒 battle 凑 5:3:2 总口径
        const count = (g: string) => ch4.typePlan.filter((x) => x === g).length;
        expect(count('battle')).toBe(4);
        expect(count('puzzle')).toBe(3);
        expect(count('match3')).toBe(2);
        // 奖励跨章爬升：整体量级高于第 3 章（章首回低为既有节奏，如 ch2 首段 < ch1 末段）
        const ch3 = TRAIL_CHAPTERS[2];
        expect(ch4.rewardSections[2][1]).toBeGreaterThan(ch3.rewardSections[2][1]);
        expect(ch4.bossReward[1]).toBeGreaterThan(ch3.bossReward[1]);
    });

    it('deriveMatch3 HP 封顶 38：第 4 章不再线性抬升（36 已 0.44 通关率）', () => {
        expect(deriveMatch3(31).hp).toBe(38);
        expect(deriveMatch3(40).hp).toBe(38);
    });

    it('M19 第 5 章玄冥冰原：配比 5:3:2 且奖励继续爬升', () => {
        expect(TRAIL_CHAPTERS.length).toBe(5);
        const ch5 = TRAIL_CHAPTERS[4];
        expect(ch5.id).toBe('xuanming');
        expect(ch5.monsters.length).toBe(6);
        const count = (g: string) => ch5.typePlan.filter((x) => x === g).length;
        expect(count('battle')).toBe(4);
        expect(count('puzzle')).toBe(3);
        expect(count('match3')).toBe(2);
        const ch4 = TRAIL_CHAPTERS[3];
        expect(ch5.rewardSections[2][1]).toBeGreaterThan(ch4.rewardSections[2][1]);
        expect(ch5.bossReward[1]).toBeGreaterThan(ch4.bossReward[1]);
    });

    it('chapterScale：线性 0.15/章，1.8 封顶（M19 由 1.6 抬高，给第 5 章纵深）', () => {
        expect(chapterScale(1)).toBeCloseTo(1);
        expect(chapterScale(4)).toBeCloseTo(1.45);
        expect(chapterScale(5)).toBeCloseTo(1.6);
        expect(chapterScale(6)).toBeCloseTo(1.75);
        expect(chapterScale(7)).toBeCloseTo(1.8);
        expect(chapterScale(9)).toBeCloseTo(1.8);
    });
});

/** M15 过滤口径：非 battle 一律回退 battle（与实现一致） */
function eff(g: string): string {
    return (AVAILABLE_GAMES as readonly string[]).indexOf(g) >= 0 ? g : 'battle';
}
