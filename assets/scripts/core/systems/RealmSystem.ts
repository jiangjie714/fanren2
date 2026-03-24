/** 境界系统：机缘积累判定、突破流程、成功率合成与边界（PRD 2.1 / 2.3 / 第五节） */
import { Rng } from '../rng';
import { SaveData } from '../saveModel';
import { MAX_REALM_INDEX, REALMS, RealmConfig } from '../config/realms';
import { RATE_MAX, RATE_MIN } from '../config/drops';
import { BREAKTHROUGH_XIUWEI_BONUS, PROTECT_KEEP_RATIO, QUIT_JIYUAN_LOSS } from '../config/economy';
import { EconomySystem } from './EconomySystem';

export class RealmSystem {
    constructor(private save: SaveData, private eco: EconomySystem, private rng: Rng) {}

    get realmIndex(): number { return this.save.realmIndex; }
    get realm(): RealmConfig { return REALMS[this.save.realmIndex]; }
    /** 下一境界（null = 已达化神） */
    get next(): RealmConfig | null {
        return this.save.realmIndex < MAX_REALM_INDEX ? REALMS[this.save.realmIndex + 1] : null;
    }

    /** 机缘是否满足突破条件 */
    canBreakthrough(): boolean {
        const n = this.next;
        return !!n && this.eco.jiyuan >= n.needJiyuan && n.needJiyuan > 0;
    }

    /** 最终突破成功率 = clamp(目标境界基础 + 金雨加成 + 连击加成 - 劫雨扣减 - 心魔, 10%, 95%) */
    computeFinalRate(targetIndex: number, goldBonus: number, penalty: number, mindDemon: boolean, comboBonus = 0): number {
        const base = REALMS[targetIndex].baseRate;
        const md = mindDemon ? 0.05 : 0;
        return Math.min(RATE_MAX, Math.max(RATE_MIN, base + goldBonus + comboBonus - penalty - md));
    }

    /** 概率判定（纯随机一掷；10% 仍可能成功，95% 仍可能失败） */
    roll(rate: number): boolean {
        return this.rng.float() < rate;
    }

    /** 突破成功：机缘清零（消耗于晋升）、境界 +1、晋升修为奖励 */
    succeed(extraXiuwei = 0): RealmConfig {
        const target = this.next!;
        this.eco.loseJiyuanPct(1); // 机缘清零
        this.save.realmIndex += 1;
        this.eco.addXiuwei(BREAKTHROUGH_XIUWEI_BONUS + extraXiuwei, false);
        this.save.stats.breakthroughWins += 1;
        return target;
    }

    /** 突破失败：机缘保留 50%（扣除一半），修为清零；护道广告可保留 50% 修为 */
    fail(protectedByAd: boolean): { lostXiuwei: number; lostJiyuan: number } {
        const lostXiuwei = this.eco.clearXiuwei(protectedByAd ? PROTECT_KEEP_RATIO : 0);
        const lostJiyuan = this.eco.loseJiyuanPct(0.5);
        this.save.stats.breakthroughFails += 1;
        return { lostXiuwei, lostJiyuan };
    }

    /** 灵气雨中途退出：判定失败；机缘扣 30%（保留 70%），修为清零，无护道广告 */
    quitRain(): { lostXiuwei: number; lostJiyuan: number } {
        const lostXiuwei = this.eco.clearXiuwei(0);
        const lostJiyuan = this.eco.loseJiyuanPct(QUIT_JIYUAN_LOSS);
        this.save.stats.breakthroughFails += 1;
        return { lostXiuwei, lostJiyuan };
    }
}
