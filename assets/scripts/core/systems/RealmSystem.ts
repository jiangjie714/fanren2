/** 境界系统：机缘积累判定、突破流程、成功率合成与边界（PRD 2.1 / 2.3 / 第五节） */
import { Rng } from '../rng';
import { SaveData } from '../saveModel';
import { MAX_REALM_INDEX, REALMS, RealmConfig } from '../config/realms';
import { RATE_MAX, RATE_MIN } from '../config/drops';
import { BREAKTHROUGH_XIUWEI_BONUS, FAIL_XIUWEI_KEEP, PROTECT_XIUWEI_KEEP, QUIT_JIYUAN_LOSS } from '../config/economy';
import { DAOXIN_MAX, DAOXIN_RATE_BONUS } from '../config/trial';
import { EconomySystem } from './EconomySystem';

export class RealmSystem {
    constructor(private save: SaveData, private eco: EconomySystem, private rng: Rng) {}

    /** 突破成功率加成提供者（炼丹「机缘」四维注入：+0.04%/点，加算进 clamp 前） */
    fateBonusProvider: () => number = () => 0;

    get realmIndex(): number { return this.save.realmIndex; }
    get realm(): RealmConfig { return REALMS[this.save.realmIndex]; }
    /** 下一境界（null = 已达化神） */
    get next(): RealmConfig | null {
        return this.save.realmIndex < MAX_REALM_INDEX ? REALMS[this.save.realmIndex + 1] : null;
    }

    /**
     * 首战保护判定（#49 首日体验 §4.A A3「天道庇佑」）。
     *
     * 条件 = 仍在凡人（realmIndex 0，目标必为练气）**且**从未发生过任何突破判定
     * （`breakthroughWins + breakthroughFails === 0`）。这样「首战」天然只命中第 1 次：
     * 无论成功（wins→1）还是失败（fails→1），条件立刻不再成立，第 2 次起完全回到
     * `clamp(10%, 95%)`，不把冲击高境界变成确定事件。
     *
     * 刻意**不落存档字段**：复用既有 `stats` 计数即可完全派生（存档结构不变，无需 bump）。
     */
    get firstBreakthroughProtect(): boolean {
        return this.save.realmIndex === 0
            && this.save.stats.breakthroughWins + this.save.stats.breakthroughFails === 0;
    }

    /** 机缘是否满足突破条件 */
    canBreakthrough(): boolean {
        const n = this.next;
        return !!n && this.eco.jiyuan >= n.needJiyuan && n.needJiyuan > 0;
    }

    /**
     * 最终突破成功率 = clamp(目标境界基础 + 金雨加成 + 连击加成 - 劫雨扣减 - 心魔
     *   + 机缘四维加成 + 道心加成, 10%, 95%)（#45：道心每层 +5%，加算进 clamp 前，
     *   与机缘四维同口径；不提供「必成」，仍受上下界约束）
     *
     * #49 例外：**首战（首次冲击练气）**走「天道庇佑」，直接返回 100%。
     *   长期公式与 clamp 均不变，只是首战结果被顶到上限；第 2 次起完全回到上式。
     *   首战时道心/机缘四维等加成无意义（仍照常计算但不影响结论），故直接短路返回。
     */
    computeFinalRate(targetIndex: number, goldBonus: number, penalty: number, mindDemon: boolean, comboBonus = 0): number {
        if (targetIndex === 1 && this.firstBreakthroughProtect) return 1;
        const base = REALMS[targetIndex].baseRate;
        const md = mindDemon ? 0.05 : 0;
        const fate = this.fateBonusProvider();
        const daoxin = Math.min(DAOXIN_MAX, Math.max(0, this.save.daoxin)) * DAOXIN_RATE_BONUS;
        return Math.min(RATE_MAX, Math.max(RATE_MIN, base + goldBonus + comboBonus - penalty - md + fate + daoxin));
    }

    /** 概率判定（纯随机一掷；10% 仍可能成功，95% 仍可能失败） */
    roll(rate: number): boolean {
        return this.rng.float() < rate;
    }

    /** 突破成功：机缘清零（消耗于晋升）、境界 +1、晋升修为奖励；道心清零（#45：成功即失效） */
    succeed(extraXiuwei = 0): RealmConfig {
        const target = this.next!;
        this.eco.loseJiyuanPct(1); // 机缘清零
        this.save.realmIndex += 1;
        this.eco.addXiuwei(BREAKTHROUGH_XIUWEI_BONUS + extraXiuwei, false);
        this.save.stats.breakthroughWins += 1;
        this.save.daoxin = 0;
        return target;
    }

    /**
     * 突破失败（#45 改造）：机缘保留 50%；修为**保留 70%**（即扣 30%，不再清零）；
     * 道心 +1（上限 3，已满则不增）。护道广告的两段式结算走 fail() + applyProtect()，
     * 保证失败瞬间存档即自洽（玩家中途杀进程不悬挂未决策状态）。
     */
    fail(): { lostXiuwei: number; lostJiyuan: number; daoxinGain: number } {
        const lostXiuwei = this.eco.clearXiuwei(FAIL_XIUWEI_KEEP);
        const lostJiyuan = this.eco.loseJiyuanPct(0.5);
        const daoxinGain = Math.max(0, Math.min(DAOXIN_MAX - this.save.daoxin, 1));
        this.save.daoxin += daoxinGain;
        this.save.stats.breakthroughFails += 1;
        return { lostXiuwei, lostJiyuan, daoxinGain };
    }

    /**
     * 护道广告成功（protect 位，#45）：修为补至「仅损一成」（保留 90%），
     * 道心再 +1（与失败即时 +1 合计 +2，上限 3）。由结算页在广告回调后调用。
     * @param xiuweiBefore 失败结算前的修为（结算页 onEnter 时记录）
     * @param lostXiuwei fail() 返回的修为损失
     */
    applyProtect(xiuweiBefore: number, lostXiuwei: number): { restored: number; daoxinGain: number } {
        const restored = Math.max(0, Math.round(xiuweiBefore * PROTECT_XIUWEI_KEEP) - (xiuweiBefore - lostXiuwei));
        if (restored > 0) this.eco.addXiuwei(restored, false);
        const daoxinGain = Math.max(0, Math.min(DAOXIN_MAX - this.save.daoxin, 1));
        this.save.daoxin += daoxinGain;
        return { restored, daoxinGain };
    }

    /** 灵气雨中途退出：判定失败；机缘扣 30%（保留 70%），修为清零，无护道广告 */
    quitRain(): { lostXiuwei: number; lostJiyuan: number } {
        const lostXiuwei = this.eco.clearXiuwei(0);
        const lostJiyuan = this.eco.loseJiyuanPct(QUIT_JIYUAN_LOSS);
        this.save.stats.breakthroughFails += 1;
        return { lostXiuwei, lostJiyuan };
    }
}
