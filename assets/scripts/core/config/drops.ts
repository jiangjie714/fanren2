/** 表 3：灵气雨雨滴配置表（PRD 2.3 / 附件表3） */
export type DropType = 'gold' | 'blue' | 'red';

export interface DropTypeConfig {
    type: DropType;
    name: string;
    /** 生成权重（月卡生效时红色权重下调） */
    weight: number;
    /** 金/红的单次成功率变化区间（正负号在效果定义里） */
    deltaMin: number;
    deltaMax: number;
}

export const DROP_TYPES: Record<DropType, DropTypeConfig> = {
    gold: { type: 'gold', name: '金色灵雨', weight: 50, deltaMin: 0.03, deltaMax: 0.08 },
    blue: { type: 'blue', name: '蓝色清雨', weight: 35, deltaMin: 0, deltaMax: 0 },
    red:  { type: 'red',  name: '暗红劫雨', weight: 15, deltaMin: 0.04, deltaMax: 0.09 },
};

/** 雨滴生成速率（滴/秒） */
export const DROP_SPAWN_RATE = 2.5;

/** 月卡特权：劫雨权重减少量（15 → 12，即 -20%） */
export const MONTH_CARD_RED_WEIGHT_REDUCE = 3;

/** 净化劫雨广告：屏蔽劫雨时长（秒） */
export const PURIFY_DURATION = 3;

/** 心魔干扰：单局拾取劫雨达到该数量触发（额外扣概率 + 干扰特效） */
export const MIND_DEMON_RED_COUNT = 6;

/** 心魔额外扣减的成功率 */
export const MIND_DEMON_PENALTY = 0.05;

/** 突破成功率边界（PRD：最低 10%，最高 95%） */
export const RATE_MIN = 0.10;
export const RATE_MAX = 0.95;

/** 灵气雨评级（V2：按渡劫评分判定，数值假设 #26） */
export type RainRating = '凡阶接引' | '灵阶接引' | '仙阶完美接引';

// ---------- V2 交互深化（数值假设 #22–#26） ----------

/** 波次编排：8 秒三段式（速率 = 开启事件/秒，权重按事件计） */
export interface RainWave {
    name: string;
    /** 波次开始时间（秒，自开局起） */
    startAt: number;
    spawnRate: number;
    /** 金/蓝/红 权重 */
    weights: [number, number, number];
    /** 红雨成排生成：每排滴数 [min, max]，[0, 0] = 不成排 */
    redRow: [number, number];
}

export const RAIN_WAVES: RainWave[] = [
    { name: '蕴雨', startAt: 0, spawnRate: 2.2, weights: [50, 35, 15], redRow: [0, 0] },
    { name: '灵雨潮', startAt: 3.0, spawnRate: 4.2, weights: [65, 30, 5], redRow: [0, 0] },
    { name: '劫云压顶', startAt: 5.5, spawnRate: 3.0, weights: [45, 30, 25], redRow: [2, 2] },
];

/** 按已进行时间取当前波次 */
export function waveAt(elapsed: number): RainWave {
    let w = RAIN_WAVES[0];
    for (const x of RAIN_WAVES) {
        if (elapsed >= x.startAt) w = x;
    }
    return w;
}

/** 动态难度：波③红雨权重每境界档 +2，落速每境界档 +5% */
export const WAVE3_RED_WEIGHT_PER_REALM = 2;
export const FALL_SPEED_PER_REALM = 0.05;

/** 红雨成排时保留的安全缝宽度（px，恒有 ≥1 条可穿越） */
export const RED_ROW_GAP = 170;

/** 连击：每 COMBO_STEP 连击 +0.5% 成功率，上限 +3%（漏接金雨/拾劫雨清零） */
export const COMBO_STEP = 3;
export const COMBO_BONUS_PER_STEP = 0.005;
export const COMBO_BONUS_MAX = 0.03;

export function comboBonus(combo: number): number {
    return Math.min(COMBO_BONUS_MAX, Math.floor(Math.max(0, combo) / COMBO_STEP) * COMBO_BONUS_PER_STEP);
}

/** 聚灵咒：单局 1 次，磁吸金雨时长与拾取半径倍数 */
export const MAGNET_DURATION = 2.5;
export const MAGNET_CATCH_MULT = 2;

/** 渡劫评分 = clamp(金×3 + 最大连击×2 + 蓝×1 − 红×2, 0, 100) */
export const SCORE_WEIGHTS = { gold: 3, combo: 2, blue: 1, red: 2 } as const;
export const SCORE_MIN = 0;
export const SCORE_MAX = 100;
export const RATING_SPIRIT_SCORE = 40;
export const RATING_IMMORTAL_SCORE = 75;

export function judgeScore(gold: number, maxCombo: number, blue: number, red: number): number {
    const raw = gold * SCORE_WEIGHTS.gold + maxCombo * SCORE_WEIGHTS.combo
        + blue * SCORE_WEIGHTS.blue - red * SCORE_WEIGHTS.red;
    return Math.min(SCORE_MAX, Math.max(SCORE_MIN, Math.round(raw)));
}

/** 渡劫评分 → 评级 */
export function judgeRating(score: number): RainRating {
    if (score >= RATING_IMMORTAL_SCORE) return '仙阶完美接引';
    if (score >= RATING_SPIRIT_SCORE) return '灵阶接引';
    return '凡阶接引';
}
