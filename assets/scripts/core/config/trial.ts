/**
 * M14 秘境试炼：体力经济 + 三主题轮换（数值假设 #42）。
 * 秘境沿用幻境评分公式（金×4 + 最大连击×2 − 红×3，#29）不变——主题只改
 * 权重/速率/落速/视觉，不改评分与命中判定，保证周榜（illusion_week）与
 * 幻境成就（#31）口径零改动。
 */

export type TrialThemeId = 'lingyu' | 'jieyun' | 'huanxin';

// ---------- 体力经济（#42） ----------
/** 体力上限 */
export const STAMINA_MAX = 10;
/** 回复速率：15 分钟 1 点（约 2.5h 回满） */
export const STAMINA_REGEN_MS = 15 * 60_000;
/** 广告一次补 5 点（trialStamina 位，M14-5 接入） */
export const STAMINA_AD_REFILL = 5;
/** 每日广告补给上限 */
export const STAMINA_AD_PER_DAY = 3;
/** 每局消耗 */
export const STAMINA_COST_PER_RUN = 1;

/** 秘境主题：按日轮换改变雨滴权重、生成速率、落速与视觉 */
export interface TrialTheme {
    id: TrialThemeId;
    name: string;
    /** 秘境页背景（ThemeLib art bundle 路径） */
    bg: string;
    /** 金/红雨权重（无蓝雨，同幻境口径） */
    goldWeight: number;
    redWeight: number;
    /** 生成速率（滴/秒） */
    spawnRate: number;
    /** 落速倍率（randomFallSpeed=true 时不使用） */
    fallSpeedMult: number;
    /** 幻心：每滴落速在 ×0.8~×1.3 间随机 */
    randomFallSpeed: boolean;
    /** 劫云：红雨成排（同 #22 波③编排，恒保安全缝） */
    redRows: boolean;
    /** 幻心：局中边缘暗角干扰次数与单次时长（纯视觉，不改命中判定） */
    vignetteBursts: number;
    vignetteMs: number;
    /** 产出系数（乘算作用于灵石与灵材，灵材向上取整） */
    rewardMult: number;
    /** 一句话主题描述（入口卡片用） */
    desc: string;
}

export const TRIAL_THEMES: readonly TrialTheme[] = [
    {
        id: 'lingyu', name: '灵雨秘境', bg: 'art/ui/bg_rain/spriteFrame',
        goldWeight: 78, redWeight: 22, spawnRate: 4.2, fallSpeedMult: 0.95,
        randomFallSpeed: false, redRows: false, vignetteBursts: 0, vignetteMs: 0,
        rewardMult: 1.0, desc: '金雨如瀑，爽局冲高分',
    },
    {
        id: 'jieyun', name: '劫云秘境', bg: 'art/ui/bg_trial_jieyun/spriteFrame',
        goldWeight: 55, redWeight: 45, spawnRate: 4.6, fallSpeedMult: 1.25,
        randomFallSpeed: false, redRows: true, vignetteBursts: 0, vignetteMs: 0,
        rewardMult: 1.3, desc: '雷劫成排，险中求厚赏',
    },
    {
        id: 'huanxin', name: '幻心秘境', bg: 'art/ui/bg_trial_huanxin/spriteFrame',
        goldWeight: 65, redWeight: 35, spawnRate: 4.0, fallSpeedMult: 1.0,
        randomFallSpeed: true, redRows: false, vignetteBursts: 2, vignetteMs: 1200,
        rewardMult: 1.15, desc: '心魔乱目，雨速无常',
    },
];

/** 本地日序（自 epoch 起的整天数，按本地时区取日）——同日恒定，与系统时刻无关 */
export function dayIndexOf(now: Date = new Date()): number {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.floor(day.getTime() / 86_400_000);
}

/** 按日序确定性派生主题（dayIndex % 3，负数安全） */
export function themeForDay(dayIndex: number): TrialTheme {
    return TRIAL_THEMES[((dayIndex % TRIAL_THEMES.length) + TRIAL_THEMES.length) % TRIAL_THEMES.length];
}

/** 当前日期对应的今日主题 */
export function themeOf(now: Date = new Date()): TrialTheme {
    return themeForDay(dayIndexOf(now));
}

// ---------- 结算档位产出（#42 §4.E：灵石减半、主产灵材；倍率在 M14-2 连胜轨接入） ----------

export interface TrialTierConfig {
    at: number;
    name: string;
    lingshi: number;
    /** 灵材产出（材料 id → 数量；乘主题系数与连胜倍率后向上取整） */
    mats: Record<string, number>;
    fragments: number;
    jiyuan: number;
}

/** 档位阈值与名称沿用 #29（评分公式与周榜口径不变），产出改为灵石减半 + 灵材为主 */
export const TRIAL_TIERS: readonly TrialTierConfig[] = [
    { at: 60, name: '初入幻境', lingshi: 75, mats: { lingcao: 1 }, fragments: 0, jiyuan: 0 },
    { at: 120, name: '心魔退散', lingshi: 150, mats: { lingcao: 2, lingshi_core: 1 }, fragments: 2, jiyuan: 0 },
    { at: 180, name: '心魔大圣', lingshi: 250, mats: { yaodan_core: 1, lingcao: 2 }, fragments: 4, jiyuan: 30 },
];
