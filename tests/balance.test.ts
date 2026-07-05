/**
 * 数值平衡模拟（docs/数值假设.md #10/#11 的量化验证）。
 * 蒙特卡洛统计打印报告 + 宽松区间断言，防止后续调参把经济曲线改崩。
 * M9a 扩展："典型一日"模拟覆盖任务/历练/幻境/活跃度收入（玩法深化设计.md 八节风险表）。
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../assets/scripts/core/rng';
import { defaultSave, SaveData } from '../assets/scripts/core/saveModel';
import { EconomySystem } from '../assets/scripts/core/systems/EconomySystem';
import { BoxSystem } from '../assets/scripts/core/systems/BoxSystem';
import { QuestSystem } from '../assets/scripts/core/systems/QuestSystem';
import { ExpeditionSystem } from '../assets/scripts/core/systems/ExpeditionSystem';
import { IllusionSystem } from '../assets/scripts/core/systems/IllusionSystem';
import { CombatSystem } from '../assets/scripts/core/systems/CombatSystem';
import { BOXES } from '../assets/scripts/core/config/boxes';

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
     * 4 任务全完成 + 2 次历练（秘谷/荒古各一，均斩妖胜利）+ 2 次幻境（好手 98 分）
     * + 5 场论武（裸装口径，不看蓄力广告）+ 活跃度三箱全领。
     * 断言：1) 日灵石净收入有界；2) 机缘"直接投放"（活跃箱 50 + 幻境档位 30 +
     * 历练事件 0~20 + 斩妖 0~10）有界——宝箱稀有档机缘是玩家驱动产出，不在每日上限口径内。
     * M11 更新：纳入斩妖/论武收入后重新定基线（#10/#38，上限与 docs/数值假设.md 同步）。
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
            const expedition = new ExpeditionSystem(eco, rng);
            const illusion = new IllusionSystem(eco);
            const combat = new CombatSystem(eco, rng);

            const START = 1000;
            eco.addLingshi(START, false);

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
            // 历练 2 次（秘谷/荒古各一，稳健选项），归来斩妖均胜利
            for (const dest of ['migu', 'gudong'] as const) {
                expedition.start(save, dest, 0);
                combat.slayRewards(save, dest); // 斩妖胜利结算
                expedition.resolve(save, 1, 20 * 60_000);
            }
            // 幻境 2 次（好手：金 20/连击 12/红 2 → 98 分，60 档内）
            for (let i = 0; i < 2; i++) {
                illusion.consumeStart(save, i === 0 ? 'free' : 'ad');
                illusion.finish(save, 20, 12, 2);
            }
            // 论武 5 场（裸装口径：不看蓄力广告，胜率 ≈53%）
            for (let i = 0; i < 5 && combat.canPk(save); i++) {
                combat.consumePk(save);
                const opp = combat.makeOpponent(save, 'random', rng);
                const outcome = combat.simulateBattle(combat.chargedStats(save, 0), opp, rng);
                const streak = combat.recordPkResult(save, outcome.win);
                if (outcome.win) combat.pkWinRewards(save, streak);
            }
            // 活跃度三箱全领
            for (const at of [30, 60, 100]) {
                if (quests.canClaimChest(save, at)) quests.claimChest(save, at, rng);
            }

            // 机缘直接投放：开箱之后所有入账（事件/斩妖/幻境/活跃箱）
            const jiyuanGranted = save.jiyuan - jiyuanAfterBoxes;
            const net = save.lingshi - START;
            report.push(`seed=${seed}: 日灵石净收入=${net} 机缘直接投放=${jiyuanGranted} 结余=${save.lingshi}`);
            expect(net).toBeGreaterThanOrEqual(0);
            expect(net).toBeLessThanOrEqual(6000);
            expect(jiyuanGranted).toBeLessThanOrEqual(120);
        }
        console.log('=== 典型一日报告 ===\n' + report.join('\n'));
    });
});
