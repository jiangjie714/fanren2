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
    derivePuzzle,
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

    it('M20 第 6 章九霄雷泽：配比 5:3:2 且奖励继续爬升', () => {
        // 章节总数用下界断言——新增章节时不必回改历史用例（基线统一见 M21 用例）
        expect(TRAIL_CHAPTERS.length).toBeGreaterThanOrEqual(6);
        const ch6 = TRAIL_CHAPTERS[5];
        expect(ch6.id).toBe('leize');
        expect(ch6.monsters.length).toBe(6);
        const count = (g: string) => ch6.typePlan.filter((x) => x === g).length;
        expect(count('battle')).toBe(4);
        expect(count('puzzle')).toBe(3);
        expect(count('match3')).toBe(2);
        const ch5 = TRAIL_CHAPTERS[4];
        expect(ch6.rewardSections[2][1]).toBeGreaterThan(ch5.rewardSections[2][1]);
        expect(ch6.bossReward[1]).toBeGreaterThan(ch5.bossReward[1]);
        expect(ch6.fragmentChance[2]).toBeGreaterThan(ch5.fragmentChance[2]);
    });

    it('第 6 章难度系数 1.75 未触 1.8 封顶，仍有纵深', () => {
        expect(chapterScale(6)).toBeLessThan(1.8);
        expect(chapterOf(51)).toBe(6);
        expect(deriveMatch3(51).hp).toBe(38);
    });

    it('M21 第 7 章焚天炎海：配比 5:3:2 且奖励继续爬升', () => {
        expect(TRAIL_CHAPTERS.length).toBeGreaterThanOrEqual(9); // 章节总数下界；精确基线见 M28 用例
        const ch7 = TRAIL_CHAPTERS[6];
        expect(ch7.id).toBe('fentian');
        expect(ch7.monsters.length).toBe(6);
        const count = (g: string) => ch7.typePlan.filter((x) => x === g).length;
        expect(count('battle')).toBe(4);
        expect(count('puzzle')).toBe(3);
        expect(count('match3')).toBe(2);
        const ch6 = TRAIL_CHAPTERS[5];
        expect(ch7.rewardSections[2][1]).toBeGreaterThan(ch6.rewardSections[2][1]);
        expect(ch7.bossReward[1]).toBeGreaterThan(ch6.bossReward[1]);
        expect(ch7.bossSlay.xiuwei).toBeGreaterThan(ch6.bossSlay.xiuwei);
        expect(ch7.fragmentChance[2]).toBeGreaterThan(ch6.fragmentChance[2]);
    });

    it('M24 第 8 章罡风天壑：配比 4:3:2 且奖励按 1.35× 继续爬升', () => {
        expect(TRAIL_CHAPTERS.length).toBeGreaterThanOrEqual(9); // 章节总数下界；精确基线见 M28 用例
        const ch8 = TRAIL_CHAPTERS[7];
        expect(ch8.id).toBe('gangfeng');
        expect(ch8.name).toBe('罡风天壑');
        expect(ch8.monsters.length).toBe(6);
        const count = (g: string) => ch8.typePlan.filter((x) => x === g).length;
        expect(count('battle')).toBe(4);
        expect(count('puzzle')).toBe(3);
        expect(count('match3')).toBe(2);
        const ch7 = TRAIL_CHAPTERS[6];
        expect(ch8.rewardSections[2][1]).toBeGreaterThan(ch7.rewardSections[2][1]);
        expect(ch8.bossReward[1]).toBeGreaterThan(ch7.bossReward[1]);
        expect(ch8.bossSlay.xiuwei).toBeGreaterThan(ch7.bossSlay.xiuwei);
        expect(ch8.bossSlay.jiyuan).toBe(130);
        expect(ch8.fragmentChance).toEqual([0.45, 0.65, 0.85]);
        expect(ch8.gift.lingshi).toBe(28500);
        expect(ch8.gift.fragments).toBe(8);
        // 静态区间锚点（防手滑改值）
        expect(ch8.rewardSections[0]).toEqual([2700, 3580]);
        expect(ch8.rewardSections[1]).toEqual([3190, 4180]);
        expect(ch8.rewardSections[2]).toEqual([3820, 4980]);
        expect(ch8.bossReward).toEqual([4050, 5580]);
        expect(ch8.bossSlay.xiuwei).toBe(5900);
    });

    it('M28 第 9 章星陨天墟：配比 4:3:2 且奖励按 1.35× 继续爬升', () => {
        expect(TRAIL_CHAPTERS.length).toBeGreaterThanOrEqual(9); // 章节总数下界；精确基线见 M32 用例
        const ch9 = TRAIL_CHAPTERS[8];
        expect(ch9.id).toBe('xingxu');
        expect(ch9.name).toBe('星陨天墟');
        expect(ch9.monsters.length).toBe(6);
        expect(ch9.boss.id).toBe('xingjun');
        const count = (g: string) => ch9.typePlan.filter((x) => x === g).length;
        expect(count('battle')).toBe(4);
        expect(count('puzzle')).toBe(3);
        expect(count('match3')).toBe(2);
        const ch8 = TRAIL_CHAPTERS[7];
        expect(ch9.rewardSections[2][1]).toBeGreaterThan(ch8.rewardSections[2][1]);
        expect(ch9.bossReward[1]).toBeGreaterThan(ch8.bossReward[1]);
        expect(ch9.bossSlay.xiuwei).toBeGreaterThan(ch8.bossSlay.xiuwei);
        expect(ch9.bossSlay.jiyuan).toBe(160);
        expect(ch9.fragmentChance).toEqual([0.5, 0.7, 0.9]);
        expect(ch9.gift.lingshi).toBe(38500);
        expect(ch9.gift.fragments).toBe(9);
        // 静态区间锚点（防手滑改值）
        expect(ch9.rewardSections[0]).toEqual([3650, 4830]);
        expect(ch9.rewardSections[1]).toEqual([4310, 5640]);
        expect(ch9.rewardSections[2]).toEqual([5160, 6720]);
        expect(ch9.bossReward).toEqual([5470, 7530]);
        expect(ch9.bossSlay.xiuwei).toBe(7960);
    });

    it('M28 第 9 章派生：层 81–90 归属第 9 章，Boss 关恒 battle 且为天墟星君', () => {
        expect(chapterOf(81)).toBe(9);
        expect(chapterOf(90)).toBe(9);
        expect(deriveBattle(90).isBoss).toBe(true);
        expect(deriveBattle(90).monsterName).toBe('天墟星君');
        expect(deriveGame(90)).toBe('battle');
        // 普通关妖怪全部落在第 9 章池内
        const pool = TRAIL_CHAPTERS[8].monsters.map((m) => m.name);
        for (let layer = 81; layer <= 89; layer++) {
            expect(pool).toContain(deriveBattle(layer).monsterName);
        }
        // 第 9 章难度系数 2.10（M24 曲线无封顶，本章不改公式）
        expect(chapterScale(9)).toBeCloseTo(2.1);
    });

    it('M32 第 10 章混沌归墟：配比 4:3:2 且奖励按 1.35× 继续爬升', () => {
        expect(TRAIL_CHAPTERS.length).toBeGreaterThanOrEqual(10); // 章节总数下界；精确基线见 M34 用例
        const ch10 = TRAIL_CHAPTERS[9];
        expect(ch10.id).toBe('hundun');
        expect(ch10.name).toBe('混沌归墟');
        expect(ch10.monsters.length).toBe(6);
        expect(ch10.boss.id).toBe('daojun');
        const count = (g: string) => ch10.typePlan.filter((x) => x === g).length;
        expect(count('battle')).toBe(4);
        expect(count('puzzle')).toBe(3);
        expect(count('match3')).toBe(2);
        // 与 8/9 章序列都不同（避免连打三章同序的重复感）
        expect(ch10.typePlan.join()).not.toBe(TRAIL_CHAPTERS[7].typePlan.join());
        expect(ch10.typePlan.join()).not.toBe(TRAIL_CHAPTERS[8].typePlan.join());
        // 无连续两个相同玩法
        for (let i = 1; i < ch10.typePlan.length; i++) {
            expect(ch10.typePlan[i]).not.toBe(ch10.typePlan[i - 1]);
        }
        const ch9 = TRAIL_CHAPTERS[8];
        expect(ch10.rewardSections[2][1]).toBeGreaterThan(ch9.rewardSections[2][1]);
        expect(ch10.bossReward[1]).toBeGreaterThan(ch9.bossReward[1]);
        expect(ch10.bossSlay.xiuwei).toBeGreaterThan(ch9.bossSlay.xiuwei);
        expect(ch10.bossSlay.jiyuan).toBe(190);
        expect(ch10.fragmentChance).toEqual([0.55, 0.75, 0.95]);
        expect(ch10.gift.lingshi).toBe(52000);
        expect(ch10.gift.fragments).toBe(10);
        // 静态区间锚点（防手滑改值；规则 = 第 9 章端点 ×1.35 取整到十位）
        expect(ch10.rewardSections[0]).toEqual([4930, 6520]);
        expect(ch10.rewardSections[1]).toEqual([5820, 7610]);
        expect(ch10.rewardSections[2]).toEqual([6970, 9070]);
        expect(ch10.bossReward).toEqual([7380, 10170]);
        expect(ch10.bossSlay.xiuwei).toBe(10750);
        // gift mats 各 +1
        expect(ch10.gift.mats).toEqual({ lingcao: 14, lingshi_core: 12, yaodan_core: 10 });
    });

    it('M32 第 10 章派生：层 91–100 归属第 10 章，Boss 关恒 battle 且为混沌道君', () => {
        expect(chapterOf(91)).toBe(10);
        expect(chapterOf(100)).toBe(10);
        expect(deriveBattle(100).isBoss).toBe(true);
        expect(deriveBattle(100).monsterName).toBe('混沌道君');
        expect(deriveGame(100)).toBe('battle');
        // 普通关妖怪全部落在第 10 章池内
        const pool = TRAIL_CHAPTERS[9].monsters.map((m) => m.name);
        for (let layer = 91; layer <= 99; layer++) {
            expect(pool).toContain(deriveBattle(layer).monsterName);
        }
        // 第 10 章难度系数 2.25（M24 曲线无封顶，本章不改公式）
        expect(chapterScale(10)).toBeCloseTo(2.25);
        // 首通奖励：Boss 关 fragmentChance 恒为 1（与掉率表无关）
        expect(firstClearReward(100).fragmentChance).toBe(1);
    });

    it('M33 第 11 章溯光长河：配比 4:2:3 且奖励按 1.35× 继续爬升', () => {
        expect(TRAIL_CHAPTERS.length).toBeGreaterThanOrEqual(11); // 章节总数下界；精确基线见 M34 用例
        const ch11 = TRAIL_CHAPTERS[10];
        expect(ch11.id).toBe('sugang');
        expect(ch11.name).toBe('溯光长河');
        expect(ch11.monsters.length).toBe(6);
        expect(ch11.boss.id).toBe('shenzhu');
        const count = (g: string) => ch11.typePlan.filter((x) => x === g).length;
        expect(count('battle')).toBe(4);
        expect(count('puzzle')).toBe(2);
        expect(count('match3')).toBe(3);
        // 与 9/10 章序列都不同（避免连打三章同序的重复感）
        expect(ch11.typePlan.join()).not.toBe(TRAIL_CHAPTERS[8].typePlan.join());
        expect(ch11.typePlan.join()).not.toBe(TRAIL_CHAPTERS[9].typePlan.join());
        // 无连续两个相同玩法
        for (let i = 1; i < ch11.typePlan.length; i++) {
            expect(ch11.typePlan[i]).not.toBe(ch11.typePlan[i - 1]);
        }
        const ch10 = TRAIL_CHAPTERS[9];
        expect(ch11.rewardSections[2][1]).toBeGreaterThan(ch10.rewardSections[2][1]);
        expect(ch11.bossReward[1]).toBeGreaterThan(ch10.bossReward[1]);
        expect(ch11.bossSlay.xiuwei).toBeGreaterThan(ch10.bossSlay.xiuwei);
        expect(ch11.bossSlay.jiyuan).toBe(220);
        // 碎片掉率 +0.05/章规律的自然终点：第 11 章第三段触顶 1.00（spec §3.1 决策）
        expect(ch11.fragmentChance).toEqual([0.6, 0.8, 1]);
        expect(ch11.gift.lingshi).toBe(70200);
        expect(ch11.gift.fragments).toBe(11);
        // 静态区间锚点（防手滑改值；规则 = 第 10 章端点 ×1.35 取整到十位）
        expect(ch11.rewardSections[0]).toEqual([6660, 8800]);
        expect(ch11.rewardSections[1]).toEqual([7860, 10270]);
        expect(ch11.rewardSections[2]).toEqual([9410, 12240]);
        expect(ch11.bossReward).toEqual([9960, 13730]);
        expect(ch11.bossSlay.xiuwei).toBe(14510);
        // gift mats 各 +1
        expect(ch11.gift.mats).toEqual({ lingcao: 15, lingshi_core: 13, yaodan_core: 11 });
    });

    it('M33 第 11 章派生：层 101–110 归属第 11 章，Boss 关恒 battle 且为光阴蜃主', () => {
        expect(chapterOf(101)).toBe(11);
        expect(chapterOf(110)).toBe(11);
        expect(deriveBattle(110).isBoss).toBe(true);
        expect(deriveBattle(110).monsterName).toBe('光阴蜃主');
        expect(deriveGame(110)).toBe('battle');
        // 普通关妖怪全部落在第 11 章池内
        const pool = TRAIL_CHAPTERS[10].monsters.map((m) => m.name);
        for (let layer = 101; layer <= 109; layer++) {
            expect(pool).toContain(deriveBattle(layer).monsterName);
        }
        // 第 11 章难度系数 2.40（M24 曲线无封顶，本章不改公式）
        expect(chapterScale(11)).toBeCloseTo(2.4);
        // 拼图 60s 触底维持 / 三消 HP 38 封顶维持（第 11 章 68 → 钳 38）
        expect(derivePuzzle(105).timeLimitSec).toBe(60);
        expect(deriveMatch3(105).hp).toBe(38);
        // 首通奖励：Boss 关 fragmentChance 恒为 1（与掉率表无关）
        expect(firstClearReward(110).fragmentChance).toBe(1);
        // 普通关第三段触顶 1.00（spec §3.1）
        expect(firstClearReward(107).fragmentChance).toBe(1);
        expect(firstClearReward(107).lingshi).toEqual([9410, 12240]);
    });

    it('M34 第 12 章道心魔渊：配比 3:3:3 且奖励按 1.35× 继续爬升', () => {
        expect(TRAIL_CHAPTERS.length).toBe(12); // ← 章节总数基线：M34 起 12 章
        const ch12 = TRAIL_CHAPTERS[11];
        expect(ch12.id).toBe('daoxin');
        expect(ch12.name).toBe('道心魔渊');
        expect(ch12.monsters.length).toBe(6);
        expect(ch12.boss.id).toBe('mowo');
        const count = (g: string) => ch12.typePlan.filter((x) => x === g).length;
        expect(count('battle')).toBe(3);
        expect(count('puzzle')).toBe(3);
        expect(count('match3')).toBe(3);
        // 与既有 11 章序列全都不同（最深章纯三轮换，第 3 章 b,m,p 起是另一种排布）
        for (let i = 0; i < 11; i++) {
            expect(ch12.typePlan.join()).not.toBe(TRAIL_CHAPTERS[i].typePlan.join());
        }
        // 无连续两个相同玩法
        for (let i = 1; i < ch12.typePlan.length; i++) {
            expect(ch12.typePlan[i]).not.toBe(ch12.typePlan[i - 1]);
        }
        const ch11 = TRAIL_CHAPTERS[10];
        expect(ch12.rewardSections[2][1]).toBeGreaterThan(ch11.rewardSections[2][1]);
        expect(ch12.bossReward[1]).toBeGreaterThan(ch11.bossReward[1]);
        expect(ch12.bossSlay.xiuwei).toBeGreaterThan(ch11.bossSlay.xiuwei);
        expect(ch12.bossSlay.jiyuan).toBe(250);
        // 碎片掉率：第 11 章触顶 1.00 后封顶不变（spec §3.1 决策：概率无设计空间 + 等距结构保持）
        expect(ch12.fragmentChance).toEqual([0.6, 0.8, 1]);
        expect(ch12.gift.lingshi).toBe(94770);
        expect(ch12.gift.fragments).toBe(12);
        // 静态区间锚点（防手滑改值；规则 = 第 11 章端点 ×1.35 取整到十位）
        expect(ch12.rewardSections[0]).toEqual([8990, 11880]);
        expect(ch12.rewardSections[1]).toEqual([10610, 13860]);
        expect(ch12.rewardSections[2]).toEqual([12700, 16520]);
        expect(ch12.bossReward).toEqual([13450, 18540]);
        expect(ch12.bossSlay.xiuwei).toBe(19590);
        // gift mats 各 +1
        expect(ch12.gift.mats).toEqual({ lingcao: 16, lingshi_core: 14, yaodan_core: 12 });
    });

    it('M34 第 12 章派生：层 111–120 归属第 12 章，Boss 关恒 battle 且为魔我道尊', () => {
        expect(chapterOf(111)).toBe(12);
        expect(chapterOf(120)).toBe(12);
        expect(deriveBattle(120).isBoss).toBe(true);
        expect(deriveBattle(120).monsterName).toBe('魔我道尊');
        expect(deriveGame(120)).toBe('battle');
        // 普通关妖怪全部落在第 12 章池内
        const pool = TRAIL_CHAPTERS[11].monsters.map((m) => m.name);
        for (let layer = 111; layer <= 119; layer++) {
            expect(pool).toContain(deriveBattle(layer).monsterName);
        }
        // 第 12 章难度系数 2.55（M24 曲线无封顶，本章不改公式）
        expect(chapterScale(12)).toBeCloseTo(2.55);
        // 拼图 60s 触底维持 / 三消 HP 38 封顶维持（第 12 章 72 → 钳 38）
        expect(derivePuzzle(115).timeLimitSec).toBe(60);
        expect(deriveMatch3(115).hp).toBe(38);
        // 首通奖励：Boss 关 fragmentChance 恒为 1（与掉率表无关）
        expect(firstClearReward(120).fragmentChance).toBe(1);
        // 普通关第三段封顶 1.00（spec §3.1 触顶后不再增长）
        expect(firstClearReward(117).fragmentChance).toBe(1);
        expect(firstClearReward(117).lingshi).toEqual([12700, 16520]);
    });

    it('M24 chapterScale 分段续爬：第 7 章仍 1.8，第 8 章起 1.8+0.15(ch−7) 无封顶', () => {
        // 存量 bit-exact：前 7 章与旧式 min(1.8, 1+0.15(ch−1)) 全等
        for (let ch = 1; ch <= 7; ch++) {
            expect(chapterScale(ch)).toBe(Math.min(1.8, 1 + (ch - 1) * 0.15));
        }
        expect(chapterScale(8)).toBeCloseTo(1.95);
        expect(chapterScale(9)).toBeCloseTo(2.1);
        expect(chapterScale(20)).toBeCloseTo(3.75); // 无封顶永续（1.8+0.15×13）
        // 三消 HP 仍封顶 38 不再加码（拼图 60s 触底同理，均维持）
        expect(deriveMatch3(71).hp).toBe(38);
        expect(deriveMatch3(80).hp).toBe(38);
    });

    it('chapterScale：线性 0.15/章，1.8 封顶（M19 由 1.6 抬高，给第 5 章纵深）', () => {
        expect(chapterScale(1)).toBeCloseTo(1);
        expect(chapterScale(4)).toBeCloseTo(1.45);
        expect(chapterScale(5)).toBeCloseTo(1.6);
        expect(chapterScale(6)).toBeCloseTo(1.75);
        expect(chapterScale(7)).toBeCloseTo(1.8);
    });
});

/** M15 过滤口径：非 battle 一律回退 battle（与实现一致） */
function eff(g: string): string {
    return (AVAILABLE_GAMES as readonly string[]).indexOf(g) >= 0 ? g : 'battle';
}
