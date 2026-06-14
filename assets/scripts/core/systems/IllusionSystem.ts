/** 心魔幻境系统：每日次数、计分档位奖励、周最佳（数值假设 #29） */
import { SaveData } from '../saveModel';
import { ILLUSION, IllusionTier, judgeIllusionScore, judgeIllusionTier, weekKeyOf } from '../config/illusion';
import { RewardItem } from './BoxSystem';
import { EconomySystem } from './EconomySystem';

export type IllusionStartKind = 'free' | 'ad' | 'none';

export interface IllusionFinishResult {
    score: number;
    tier: IllusionTier | null;
    /** 本次实际发放的奖励（无新档位为空） */
    rewards: RewardItem[];
    isBestToday: boolean;
    weekBest: number;
}

export class IllusionSystem {
    constructor(private eco: EconomySystem) {}

    /** 跨周清零周最佳（Game 初始化与回前台时调用；发生清零返回 true） */
    checkWeek(save: SaveData, now: Date = new Date()): boolean {
        const key = weekKeyOf(now);
        if (save.illusionWeekKey === key) return false;
        save.illusionWeekKey = key;
        save.illusionWeekBest = 0;
        return true;
    }

    /** 今日还能否挑战：免费 1 次 → 广告 1 次 → 无 */
    startKind(save: SaveData): IllusionStartKind {
        if (!save.daily.illusionFreeUsed) return 'free';
        if (!save.daily.illusionAdUsed) return 'ad';
        return 'none';
    }

    /** 消耗一次次数（kind 由 startKind 决定，调用方在广告成功回调后传 'ad'） */
    consumeStart(save: SaveData, kind: 'free' | 'ad'): boolean {
        if (kind === 'free') {
            if (save.daily.illusionFreeUsed) return false;
            save.daily.illusionFreeUsed = true;
            return true;
        }
        if (save.daily.illusionAdUsed) return false;
        save.daily.illusionAdUsed = true;
        return true;
    }

    /**
     * 结算一局：计分 → 判档 → 只发放"高于今日已领档位"的最高一档奖励；
     * 更新今日/本周最佳。分数低于 60 无档位、无奖励。
     */
    finish(save: SaveData, gold: number, maxCombo: number, red: number): IllusionFinishResult {
        const score = judgeIllusionScore(gold, maxCombo, red);
        const isBestToday = score > save.daily.illusionBest;
        if (isBestToday) save.daily.illusionBest = score;
        if (score > save.illusionWeekBest) save.illusionWeekBest = score;

        const tier = judgeIllusionTier(score);
        const rewards: RewardItem[] = [];
        if (tier) {
            const cfg = ILLUSION.tiers.find((t) => t.name === tier)!;
            if (cfg.at > save.daily.illusionRewardedTier) {
                save.daily.illusionRewardedTier = cfg.at;
                if (cfg.lingshi) {
                    const got = this.eco.addLingshi(cfg.lingshi);
                    rewards.push({ kind: 'lingshi', amount: got, label: `灵石 +${got}` });
                }
                if (cfg.fragments) {
                    const id = 'jinmu';
                    save.fragments[id] = (save.fragments[id] ?? 0) + cfg.fragments;
                    rewards.push({ kind: 'fragment', amount: cfg.fragments, lingengId: id, label: `灵根碎片 ×${cfg.fragments}` });
                }
                if (cfg.jiyuan) {
                    this.eco.addJiyuan(cfg.jiyuan);
                    rewards.push({ kind: 'jiyuan', amount: cfg.jiyuan, label: `突破机缘 +${cfg.jiyuan}` });
                }
            }
        }
        return { score, tier, rewards, isBestToday, weekBest: save.illusionWeekBest };
    }
}
