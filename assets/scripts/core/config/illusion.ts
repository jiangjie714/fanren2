/** M8 心魔幻境：每日挑战玩法参数与结算档位（数值假设 #29） */
export type IllusionTier = '初入幻境' | '心魔退散' | '心魔大圣';

export const ILLUSION = {
    /** 单局时长（秒） */
    duration: 15,
    /** 生成速率（滴/秒） */
    spawnRate: 4.0,
    /** 权重 金/蓝/红（无蓝雨） */
    goldWeight: 70,
    redWeight: 30,
    /** 红雨落速倍率 */
    fallSpeedMult: 1.3,
    /** 计分：金×4 + 最大连击×2 − 红×3 */
    score: { gold: 4, combo: 2, red: 3 },
    scoreMax: 200,
    tiers: [
        { at: 60, name: '初入幻境', lingshi: 150, fragments: 0, jiyuan: 0 },
        { at: 120, name: '心魔退散', lingshi: 300, fragments: 2, jiyuan: 0 },
        { at: 180, name: '心魔大圣', lingshi: 500, fragments: 4, jiyuan: 30 },
    ] as IllusionTierConfig[],
    freePerDay: 1,
    adPerDay: 1,
} as const;

export interface IllusionTierConfig {
    at: number;
    name: IllusionTier;
    lingshi: number;
    fragments: number;
    jiyuan: number;
}

/** 幻境计分（独立于渡劫评分：金雨权重更高、无蓝雨分） */
export function judgeIllusionScore(gold: number, maxCombo: number, red: number): number {
    const raw = gold * ILLUSION.score.gold + maxCombo * ILLUSION.score.combo - red * ILLUSION.score.red;
    return Math.min(ILLUSION.scoreMax, Math.max(0, Math.round(raw)));
}

/** 幻境得分 → 档位；低于 60 无档位 */
export function judgeIllusionTier(score: number): IllusionTier | null {
    let tier: IllusionTier | null = null;
    for (const t of ILLUSION.tiers) {
        if (score >= t.at) tier = t.name;
    }
    return tier;
}

/** 本周周键（以本周一日期计，周一 0 点换周） */
export function weekKeyOf(now: Date = new Date()): string {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // 回退到本周一
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `W-${d.getFullYear()}-${m}-${day}`;
}
