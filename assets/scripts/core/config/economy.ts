/**
 * 经济数值：宝箱产出区间、小等级规则、突破规则（docs/数值假设.md #1~#4、#10~#13）。
 */
import { BoxId } from './boxes';

/** 初始灵石 */
export const INITIAL_LINGSHI = 200;

/** 修为小等级：每 150 修为 1 级，每级 +1.5% 灵石收益，上限 40 级（终局 +60%）
 *  ——与 tests/balance.test.ts 联动校准：终局毛回收率 ≈1.16×1.6 ≈ 1.85x，不破经济 */
export const XIUWEI_PER_LEVEL = 150;
export const LINGSHI_BONUS_PER_LEVEL = 0.015;
export const MAX_SMALL_LEVEL = 40;

/** 突破失败：修为清零；护道广告保留 50% */
export const PROTECT_KEEP_RATIO = 0.5;

/** 中途退出灵气雨：机缘扣除比例 */
export const QUIT_JIYUAN_LOSS = 0.3;

/** 单次突破成功后的境界晋升修为奖励 */
export const BREAKTHROUGH_XIUWEI_BONUS = 50;

export interface RewardRange { min: number; max: number }

/** 宝箱产出区间（灵石部分受小等级加成；平均回收 ≈ 成本×1.1 保免费正循环） */
export interface BoxRewardTable {
    normal: {
        xiuwei: RewardRange;
        /** 灵石出现概率与区间 */
        lingshiChance: number;
        lingshi: RewardRange;
        /** 碎片出现概率与数量 */
        fragmentChance: number;
        fragmentCount: RewardRange;
    };
    rare: {
        xiuwei: RewardRange;
        jiyuan: RewardRange;
        fragmentCount: RewardRange;
        /** 功法（天道仙盒稀有额外）出现概率 */
        gongfaChance: number;
        /** 稀有档灵石（保经济正循环，docs/数值假设.md #10） */
        lingshiChance: number;
        lingshi: RewardRange;
    };
    /** 劫难：按当前修为百分比扣除 */
    disaster: { xiuweiLossPct: RewardRange };
}

/** 目标毛回收率 ≈1.1x 成本（假设 #10）；以下参数由 tests/balance.test.ts 蒙特卡洛验证 */
export const BOX_REWARDS: Record<BoxId, BoxRewardTable> = {
    fansu: {
        normal:   { xiuwei: { min: 20, max: 40 },  lingshiChance: 0.5, lingshi: { min: 90, max: 180 },   fragmentChance: 0.2, fragmentCount: { min: 1, max: 1 } },
        rare:     { xiuwei: { min: 80, max: 140 }, jiyuan: { min: 5, max: 10 },   fragmentCount: { min: 1, max: 2 }, gongfaChance: 0, lingshiChance: 0.5, lingshi: { min: 50, max: 100 } },
        disaster: { xiuweiLossPct: { min: 0.05, max: 0.15 } },
    },
    xiuzhen: {
        normal:   { xiuwei: { min: 80, max: 150 },  lingshiChance: 0.6, lingshi: { min: 250, max: 480 },  fragmentChance: 0.25, fragmentCount: { min: 1, max: 2 } },
        rare:     { xiuwei: { min: 300, max: 500 }, jiyuan: { min: 20, max: 40 },  fragmentCount: { min: 2, max: 3 }, gongfaChance: 0, lingshiChance: 0.6, lingshi: { min: 200, max: 400 } },
        disaster: { xiuweiLossPct: { min: 0.05, max: 0.15 } },
    },
    tiandao: {
        normal:   { xiuwei: { min: 300, max: 550 },  lingshiChance: 0.8, lingshi: { min: 900, max: 2000 }, fragmentChance: 0.3, fragmentCount: { min: 2, max: 3 } },
        rare:     { xiuwei: { min: 1000, max: 1600 }, jiyuan: { min: 60, max: 120 }, fragmentCount: { min: 3, max: 5 }, gongfaChance: 0.5, lingshiChance: 1.0, lingshi: { min: 500, max: 1000 } },
        disaster: { xiuweiLossPct: { min: 0.05, max: 0.15 } },
    },
};

/** 金色灵雨额外修为（每片，突破成功时结算） */
export const GOLD_RAIN_XIUWEI: RewardRange = { min: 10, max: 25 };

/** 灵石救济（灵石不足时看广告）：每日次数与单次金额（docs/数值假设.md #19，堵住无限刷灵石口子） */
export const DAILY_LINGSHI_AID_LIMIT = 3;
export const DAILY_LINGSHI_AID_AMOUNT = 300;
