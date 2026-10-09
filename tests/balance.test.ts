/**
 * 数值平衡模拟（docs/数值假设.md #10/#11 的量化验证）。
 * 蒙特卡洛统计打印报告 + 宽松区间断言，防止后续调参把经济曲线改崩。
 * M9a 扩展："典型一日"模拟覆盖任务/妖径/秘境/活跃度收入（M15 起历练=妖径爬关）（玩法深化设计.md 八节风险表）。
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../assets/scripts/core/rng';
import { defaultSave, SaveData } from '../assets/scripts/core/saveModel';
import { EconomySystem } from '../assets/scripts/core/systems/EconomySystem';
import { BoxSystem } from '../assets/scripts/core/systems/BoxSystem';
import { QuestSystem } from '../assets/scripts/core/systems/QuestSystem';
import { IllusionSystem } from '../assets/scripts/core/systems/IllusionSystem';
import { TrialSystem } from '../assets/scripts/core/systems/TrialSystem';
import { TrailSystem } from '../assets/scripts/core/systems/TrailSystem';
import { TowerSystem } from '../assets/scripts/core/systems/TowerSystem';
import { MAINLINE } from '../assets/scripts/core/config/tower';
import { TRIAL_THEMES, TRIAL_TIERS, RANK_TIERS } from '../assets/scripts/core/config/trial';
import { CombatSystem } from '../assets/scripts/core/systems/CombatSystem';
import { AlchemySystem } from '../assets/scripts/core/systems/AlchemySystem';
import { BOXES } from '../assets/scripts/core/config/boxes';
import { PILLS, FORTUNES } from '../assets/scripts/core/config/alchemy';
import { REALMS } from '../assets/scripts/core/config/realms';
import { DAILY_LINGSHI_AID_AMOUNT, DAILY_LINGSHI_AID_LIMIT } from '../assets/scripts/core/config/economy';

/** 灵材库存总量（三阶炼材求和） */
function sumMaterials(s: SaveData): number {
    let n = 0;
    for (const k in s.fortune.materials) n += s.fortune.materials[k];
    return n;
}

function runSimulation(boxId: 'fansu' | 'xiuzhen' | 'tiandao', runs: number, seed: number) {
    const rng = new Rng(seed);
    const save: SaveData = defaultSave();
    save.lingshi = 10_000_000;
    save.realmIndex = 3; // 金丹：解锁全部宝箱
    const eco = new EconomySystem(save);
    const box = new BoxSystem(save, eco, rng);
    const cost = BOXES.find((b) => b.id === boxId)!.cost;

    let spent = 0;
    let lingshiIncome = 0; // 灵石毛收入（不含成本）
    let gainedJiyuan = 0;
    for (let i = 0; i < runs; i++) {
        const before = save.lingshi;
        const r = box.open(boxId);
        spent += cost;
        lingshiIncome += save.lingshi - before + cost; // 净变化 + 成本 = 毛收入
        gainedJiyuan += r.rewards.filter((x) => x.kind === 'jiyuan').reduce((a, b) => a + b.amount, 0);
    }
    return {
        boxId,
        runs,
        回收率: lingshiIncome / spent,
        平均机缘每次: gainedJiyuan / runs,
    };
}

const PITY_EXPECTED_CYCLE: Record<string, number> = {
    // 每轮连续低收益的期望长度：1/(稀有率)，保底在第 4 次封顶
    fansu: 1 / 0.30,
    xiuzhen: 1 / 0.40,
    tiandao: 1 / 0.55,
};

describe('数值平衡模拟（打印报告，宽松断言防崩坏）', () => {
    it('宝箱灵石回收率与机缘节奏在假设区间内', () => {
        const runs = 5000;
        const report: string[] = [];
        for (const boxId of ['fansu', 'xiuzhen', 'tiandao'] as const) {
            const s = runSimulation(boxId, runs, 20261003);
            report.push(
                `${s.boxId}: 回收率=${s.回收率.toFixed(2)}x 平均机缘=${s.平均机缘每次.toFixed(1)}`,
            );
            // 毛回收率：基础目标 ≈1.16x（假设 #10），含小等级灵石加成（终局 +60%）后 ≈1.85x；
            // 区间 0.9 ~ 2.0 防两头崩坏
            expect(s.回收率).toBeGreaterThan(0.9);
            expect(s.回收率).toBeLessThan(2.0);
        }
        // 机缘节奏（假设 #11）：修真宝盒 10~15 次触发首次突破（需 100 机缘）
        const xiuzhenJiyuan = runSimulation('xiuzhen', runs, 20261003).平均机缘每次;
        const boxesToFirstBreak = 100 / xiuzhenJiyuan;
        report.push(`修真宝盒触发首次突破需 ≈${boxesToFirstBreak.toFixed(1)} 次（假设 10~15 次）`);
        expect(boxesToFirstBreak).toBeGreaterThan(5);
        expect(boxesToFirstBreak).toBeLessThan(25);
        console.log('=== 数值平衡报告 ===\n' + report.join('\n'));
    });

    /**
     * M9a：典型一日模拟（玩法深化设计.md 八节"幻境经济膨胀"风险）。
     * 口径（对齐真实玩家而非完美脚本）：每日固定开修真箱 12 次、三连层数随机
     * （均值 1.5 层——三连全中虽可 +0.18x，但正期望被"每日次数有限"约束兜底）；
     * 4 任务全完成 + 2 次历练（秘谷/荒古各一，均斩妖胜利）+ 秘境 4 局（M14 体力制
     * 重度口径：劫云主题最坏包络、评分爬档 60→120→180、连胜倍率、翻倍广告 ×3）
     * + 5 场论武（裸装口径，不看蓄力广告）+ 活跃度三箱全领。
     * 断言：1) 日灵石净收入有界；2) 机缘"直接投放"（活跃箱 50 + 秘境档位 30 +
     * 历练事件 0~20 + 斩妖 0~10）有界——宝箱稀有档机缘是玩家驱动产出，不在每日上限口径内。
     * M11 更新：纳入斩妖/论武收入后重新定基线（#10/#38，上限与 docs/数值假设.md 同步）。
     * M14 终审：纳入秘境产出（#42–#46）后基线 6000→8000、灵材 12→32、机缘 120 维持。
     */
    it('典型一日：灵石净收入有界，机缘直接投放不超每日上限', () => {
        const report: string[] = [];
        for (const seed of [20261001, 20261006, 20261031]) {
            const rng = new Rng(seed);
            const save: SaveData = defaultSave();
            save.realmIndex = 3;
            save.lingshi = 0;
            const eco = new EconomySystem(save);
            const box = new BoxSystem(save, eco, rng);
            const quests = new QuestSystem(eco);
            // 炼丹淬体系统（M13）：接入战斗/妖径/秘境的灵材产出与四维/福禄加值（#39–#42）
            const alch = new AlchemySystem(eco);
            // 妖径（M15 #47）：历练重构后的爬关产出系统
            const trail = new TrailSystem(eco, alch, rng);
            const illusion = new IllusionSystem(eco, alch);
            const combat = new CombatSystem(eco, rng);

            const START = 1000;
            eco.addLingshi(START, false);

            combat.attachAlchemy(alch);
            const matAtStart = sumMaterials(save);

            // 开箱 12 次（典型投入时长），三连层数随机（0~3，均值 1.5）
            for (let i = 0; i < 12; i++) {
                if (!box.canOpen('xiuzhen').ok) break;
                box.open('xiuzhen');
                quests.progress(save, 'openBoxes');
                box.grantTripleBonus('xiuzhen', rng.int(0, 3));
            }
            // 机缘直接投放口径沿用 #10：宝箱稀有档机缘是玩家驱动产出，从开箱之后开始计量
            const jiyuanAfterBoxes = save.jiyuan;
            // 任务口径：渡劫/接引/历练完成
            quests.progress(save, 'tribulation');
            quests.progress(save, 'goldRain', 15);
            quests.progress(save, 'expedition');
            // 妖径重刷 5 次（日护栏打满，#47）：中期玩家（第 1 章第 8 层待攻克）重刷第 5 层，
            // 灵石 = repeatLingshi(5)×5 ≈ 305、灵草 60%×5 期望 3 株
            save.trail.curLayer = 8;
            for (let i = 0; i < 5; i++) trail.settleWin(save, 5, { morale: false, now: new Date(0) });
            // 秘境 4 局（M14 体力制重度口径，#42–#46 终审）：体力 10 点充裕；
            // 主题取劫云（×1.3 最坏系数）作为护栏包络；评分爬档 60→120→180
            // （每日每档只发一次，第 4 局同档无产出）；连胜 1→4（×1.0/1.2/1.5/1.5）；
            // 前 3 局用 doubleReward 广告翻倍（每日 3 次，#46）；段位分同步入账。
            const trial = new TrialSystem();
            const jieyun = TRIAL_THEMES.find((t) => t.id === 'jieyun')!;
            let doubleUsed = 0;
            for (const [gold, combo, red] of [
                [17, 2, 0], // 72 分 → 60 档
                [30, 3, 1], // 123 分 → 120 档
                [40, 15, 2], // 184 分 → 180 档
                [40, 15, 2], // 同档无新产出
            ] as const) {
                trial.consumeStart(save);
                const r = illusion.finish(save, gold, combo, red, jieyun);
                if (r.rewards.length && doubleUsed < 3) {
                    doubleUsed++;
                    illusion.applyDouble(save, r.rewards);
                }
                trial.settleRank(save, r.score);
            }
            // 论武 5 场（裸装口径：不看蓄力广告，胜率 ≈53%）
            for (let i = 0; i < 5 && combat.canPk(save); i++) {
                combat.consumePk(save);
                const opp = combat.makeOpponent(save, 'random', rng);
                const outcome = combat.simulateBattle(combat.chargedStats(save, 0), opp, rng);
                const streak = combat.recordPkResult(save, outcome.win);
                if (outcome.win) combat.pkWinRewards(save, streak);
            }
            // 剑冢 3 局（M22 #48）：中层玩家连续收兵口径。日回灌受 1500/5/600 封顶，
            // 单局（最深层 40 上下）远够不到上限 —— 这里刻意让 3 局都撞上限，测封顶本身生效。
            const tower = new TowerSystem(eco, alch);
            const towerLingshiBefore = save.lingshi;
            const towerMatsBefore = sumMaterials(save);
            for (let i = 0; i < 3; i++) {
                const run = tower.startRun(save);
                run.deepest = 500; // 单局 500 层 → 灵石 want 2000 必撞 1500 上限
                tower.settle(save, run, new Date(0));
            }
            const towerLingshi = save.lingshi - towerLingshiBefore;
            const towerMats = sumMaterials(save) - towerMatsBefore;
            // 三条日上限必须精确截断（不是「大概不超过」）。
            // 灵石上限按**名义值**截断，实收再叠加玩家自身加成（灵石收益加成 = 1+等级×2%，
            // 典型一日口径下约 ×1.48），故断言为「≥名义上限且 ≤上限×1.6」；灵材无加成，精确等于上限。
            expect(towerLingshi).toBeGreaterThanOrEqual(MAINLINE.lingshiCap);
            expect(towerLingshi).toBeLessThanOrEqual(Math.ceil(MAINLINE.lingshiCap * 1.6));
            expect(towerMats).toBe(MAINLINE.matsCap);
            expect(tower.dailyLeft(save, new Date(0)).lingshi).toBe(0);

            // 活跃度三箱全领
            for (const at of [30, 60, 100]) {
                if (quests.canClaimChest(save, at)) quests.claimChest(save, at, rng);
            }

            // 机缘直接投放：开箱之后所有入账（事件/斩妖/幻境/活跃箱）
            const jiyuanGranted = save.jiyuan - jiyuanAfterBoxes;
            const net = save.lingshi - START;
            report.push(`seed=${seed}: 日灵石净收入=${net} 机缘直接投放=${jiyuanGranted} 灵材获取=${sumMaterials(save) - matAtStart} 结余=${save.lingshi}`);
            expect(net).toBeGreaterThanOrEqual(0);
            // #38 终审（M14 后重定基线）：旧口径实测 2620–5137（上限 6000）；
            // 纳入秘境重度口径（三档爬升×劫云1.3×连胜1.5 + 翻倍广告）+1561 后
            // 实测 4181–6410，上限重定 8000（含段位周奖日均摊前余量）；
            // M22 纳入剑冢日回灌（+1500 封顶，#48）→ 上限重定 9500。
            expect(net).toBeLessThanOrEqual(9500);
            expect(jiyuanGranted).toBeLessThanOrEqual(120);

            // #38 纳入灵材/丹药消耗口径：当日产出的灵石+灵材投入炼丹/福禄（纯 SINK），
            // 验证封顶机制使投入有界、余额不为负、双资源循环不构成印钞机。
            const matGained = sumMaterials(save) - matAtStart;
            // 灵材按日有界（#42/#46 终审：秘境重度口径爬三档+翻倍 ≈28，斩妖/历练 ≈3；
            // M22 剑冢日封顶 +5，#48）→ 上限 37，不构成无限炼材来源
            expect(matGained).toBeLessThanOrEqual(37);
            let pills = 0;
            while (alch.canCraft(save, 'chu') === null && pills < 100) {
                alch.craft(save, 'chu');
                pills++;
            }
            expect(pills).toBeLessThanOrEqual(30); // 初品四维 60 封顶 → 最多 30 次
            let forts = 0;
            while (alch.canCraftFortune(save, 'chu') === null && forts < 100) {
                alch.craftFortune(save, 'chu');
                forts++;
            }
            expect(forts).toBeLessThanOrEqual(5); // 初品福禄 5 次封顶
            expect(save.lingshi).toBeGreaterThanOrEqual(0);
            expect(sumMaterials(save)).toBeGreaterThanOrEqual(0);
        }
        console.log('=== 典型一日报告 ===\n' + report.join('\n'));
    });

    /**
     * M13：炼丹/福禄「双资源消耗」封顶有界（#38/#39/#40）。
     * 丹药/福禄是纯 SINK——消耗灵石+灵材、只产出封顶的四维/攻防，本身不构成印钞机。
     * 此用例从配置推导满炼总投入，断言其远小于锻体/法器大坑（≈40 万），且灵材需求有限，
     * 防止后续松绑封顶时无意中造出无上限的资源漏斗。
     */
    it('炼丹/福禄 灵石+灵材 封顶总投入有界（不构成无限印钞机）', () => {
        // 炼丹：每品 crafts = ceil(cap / statGain)，四维等量
        let pillLs = 0, pillMat = 0;
        for (const p of PILLS) {
            const crafts = Math.ceil(p.cap / p.statGain);
            pillLs += crafts * p.lingshiCost;
            pillMat += crafts * p.materialCost;
        }
        // 福禄：每品 maxCrafts 封顶
        let fortLs = 0, fortMat = 0;
        for (const f of FORTUNES) {
            fortLs += f.maxCrafts * f.lingshiCost;
            fortMat += f.maxCrafts * f.materialCost;
        }
        const totalLs = pillLs + fortLs;
        const totalMat = pillMat + fortMat;
        // 实测：灵石 ≈ 70,600（炼丹 51,600 + 福禄 19,000），灵材 ≈ 255
        expect(totalLs).toBeGreaterThan(0);
        expect(totalLs).toBeLessThan(100_000);
        expect(totalMat).toBeLessThan(500);
        // 与锻体/法器大坑（#38：约 22 万 + 18 万）相比，丹药/福禄是更小且封顶的支线
        expect(totalLs).toBeLessThan(400_000);
    });

    /**
     * M14 终审（#42–#46）：秘境产出静态包络（配置推导，不跑模拟）。
     * 从 TRIAL_TIERS / TRIAL_THEMES / streakMult / RANK_TIERS 推导理论最坏日产出，
     * 断言其有界且低于"典型一日"护栏余量——未来调参（提档位产出/提倍率/加段位奖）
     * 若突破包络会在此处爆掉，逼着同步重审护栏②基线。
     */
    it('秘境产出静态包络：档位×主题×连胜×翻倍 有界，段位周奖日均摊有限', () => {
        const maxThemeMult = Math.max(...TRIAL_THEMES.map((t) => t.rewardMult));
        const maxStreakMult = 2.5; // streakMult 封顶（≥7 连胜）
        const mult = maxThemeMult * maxStreakMult; // 理论最坏单局倍率 3.25
        const doubleX = 2; // doubleReward 广告对灵石/灵材再补一份
        // 档位产出（每日每档只发一次 → 全日上限 = 三档之和），取整逐档对齐实现
        // （灵石 floor、灵材 ceil；碎片与机缘不吃倍率、不翻倍）
        const tierLingshi = TRIAL_TIERS.reduce((a, t) => a + Math.floor(t.lingshi * mult), 0);
        const tierMats = TRIAL_TIERS.reduce(
            (a, t) => a + Object.keys(t.mats).reduce((x, k) => x + Math.ceil(t.mats[k] * mult), 0), 0,
        );
        const tierJiyuan = TRIAL_TIERS.reduce((a, t) => a + t.jiyuan, 0);
        // 当前配置的理论最坏：灵石 3084 / 灵材 52 / 机缘 30——
        // 常数即现配置包络，任何调参抬升都会在此爆掉，逼着同步重审护栏②
        const worstLingshi = tierLingshi * doubleX;
        const worstMats = tierMats * doubleX;
        expect(worstLingshi).toBeLessThanOrEqual(3100);
        expect(worstMats).toBeLessThanOrEqual(52);
        expect(tierJiyuan).toBeLessThanOrEqual(30);
        // 段位周奖：最高档（超凡）6000 灵石/周 → 日均摊 ≈858，已含在护栏②的 8000 余量内；
        // 未来上调周奖须同步复核护栏②
        const maxWeekly = Math.max(...RANK_TIERS.map((t) => t.lingshi));
        expect(maxWeekly / 7).toBeLessThanOrEqual(900);
    });

    /**
     * 首日护栏（#49 首日体验 spec §4.B B2）。
     *
     * 与上一条「典型一日」互为镜像：那条的起点是 `realmIndex = 3`（金丹、全宝箱）
     * + 1000 灵石，描述的是**中后期重度玩家**的一天；本条从 `defaultSave()` 起
     * （凡人、realmIndex 0、初始 200 灵石、机缘 0），描述的是**首日新号**。
     *
     * 价值：这是「首次飞升首日可达」的唯一防线 —— 若日后有人把练气门槛抬到首日上限
     * 之上，本条会直接变红。
     *
     * ⚠ 实测校准（2026-10-09）：三种子首日上限 **117–122 机缘**（远高于门槛 60）。
     *   故本条的实际敏感区间是「门槛 > ~120」；把门槛**调回 100 不会**触发（120 ≥ 100）。
     *   spec 原文设想的「调回 100 即变红」在真实数值下不成立 —— 实测首日路径（救济 900
     *   + 活跃 250 + 活跃 100 档机缘 50 + 27 次凡俗宝盒）比 spec 估算的「50–65 机缘」
     *   高得多（spec 只算了宝箱、漏了活跃度 100 档的 50 机缘）。门槛 60 因此有 ~2x 余量。
     *
     * 口径：只走新号真实可达的路径。注意**凡人只解锁凡俗宝盒**（修真宝盒需练气，
     * `XIUZHEN_UNLOCK_REALM = 1`），所以机缘来源只能是凡俗宝盒 + 活跃度 100 档。
     */
    it('首日：新号一日可得资源足以跨过练气门槛（#49 的唯一防线）', () => {
        const report: string[] = [];
        const jiyuanOf: number[] = [];
        for (const seed of [20261007, 20261008, 20261009]) {
            const rng = new Rng(seed);
            const save: SaveData = defaultSave();
            expect(save.realmIndex).toBe(0); // 新号视角（凡人）
            const eco = new EconomySystem(save);
            const box = new BoxSystem(save, eco, rng);
            const quests = new QuestSystem(eco);

            // ① 每日仙缘：免费凡俗宝盒（先补 50 灵石再开箱，净消耗 0 —— 与 claimDailyGift 同口径）
            eco.addLingshi(BOXES.find((b) => b.id === 'fansu')!.cost, false);
            box.open('fansu');
            quests.progress(save, 'openBoxes');

            // ② 灵石救济 3×300（新号灵石见底时的唯一补给口，#19）
            eco.addLingshi(DAILY_LINGSHI_AID_LIMIT * DAILY_LINGSHI_AID_AMOUNT, false);

            // ③ 首日任务全清（含秘境/渡劫 1 场 → 活跃度打满 100）→ 三箱全领
            quests.progress(save, 'tribulation');
            quests.progress(save, 'goldRain', 15);
            quests.progress(save, 'expedition');
            quests.progress(save, 'openBoxes', 3);
            for (const at of [30, 60, 100]) {
                if (quests.canClaimChest(save, at)) quests.claimChest(save, at, rng);
            }

            // ④ 把当日灵石投入凡俗宝盒（机缘的主要来源；天道保底兜底低收益）。
            // 必须有次数上限：宝箱毛回收率 ≈1.1× 成本（#10），用 while 判断余额会**永不终止**
            // （灵石越开越多）。取 27 次 ≈ 首日可得 1350 灵石 ÷ 50（每次 50），
            // 对应「首日开箱会话时长」，不模拟无限挂机。
            let opens = 0;
            for (let i = 0; i < 27; i++) {
                if (!box.canOpen('fansu').ok) break;
                box.open('fansu');
                opens += 1;
            }

            report.push(`seed=${seed} 开箱=${opens} 机缘=${save.jiyuan}`);
            jiyuanOf.push(save.jiyuan);
        }
        console.log('[首日] ' + report.join(' | ') + ` ｜ 门槛=${REALMS[1].needJiyuan}`);
        expect(Math.min(...jiyuanOf)).toBeGreaterThanOrEqual(REALMS[1].needJiyuan);
    });
});
