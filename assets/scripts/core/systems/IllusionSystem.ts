/**
 * 心魔幻境/秘境试炼结算系统：计分档位奖励、周最佳（数值假设 #29）。
 * M14（#42）起进入凭证由「每日 1 免费 + 1 广告」改为体力制（TrialSystem），
 * 本系统只负责结算与周榜口径；周榜键 illusion_week 语义不变（M9b 零改动）。
 */
import { SaveData } from '../saveModel';
import { ILLUSION, IllusionTier, judgeIllusionScore, judgeIllusionTier, weekKeyOf } from '../config/illusion';
import { RewardItem } from './BoxSystem';
import { EconomySystem } from './EconomySystem';

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
