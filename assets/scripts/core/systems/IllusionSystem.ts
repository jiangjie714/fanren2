/**
 * 心魔幻境/秘境试炼结算系统：计分档位奖励、周最佳（数值假设 #29）。
 * M14（#42/#43）变更：
 * - 进入凭证由「每日 1 免费 + 1 广告」改为体力制（TrialSystem）；
 * - 档位产出改用 TRIAL_TIERS（灵石减半、主产灵材），乘 **主题系数 × 连胜倍率**
 *   （碎片与机缘不吃倍率，防机缘投放失控）；
 * - 连胜轨：评分 ≥60 连胜 +1 并刷新最高；<60 立即清零（结算页可看广告护持恢复，
 *   恢复用 reviveStreak——存档随时一致，杀进程不悬挂）。
 * 评分公式与周榜键 illusion_week 语义不变（M9b 零改动）。
 */
import { SaveData } from '../saveModel';
import { ILLUSION, IllusionTier, judgeIllusionScore, judgeIllusionTier, weekKeyOf } from '../config/illusion';
import { TRIAL_TIERS, TrialTheme, streakMult } from '../config/trial';
import { MATERIALS } from '../config/alchemy';
import { RewardItem } from './BoxSystem';
import { EconomySystem } from './EconomySystem';
import { AlchemySystem } from './AlchemySystem';

export interface IllusionFinishResult {
    score: number;
    tier: IllusionTier | null;
    /** 本次实际发放的奖励（无新档位为空） */
    rewards: RewardItem[];
    isBestToday: boolean;
    weekBest: number;
    /** 结算后连胜（≥60 已 +1；<60 已清零为 0） */
    streak: number;
    /** 本局生效的奖励总倍率（主题 × 连胜；<60 为 0） */
    mult: number;
    /** 中断待护持：<60 且中断前连胜 >0，结算页应弹出「道心护持」 */
    interrupted: boolean;
    /** 中断前的连胜层数（护持成功恢复用；未中断为 0） */
    streakBefore: number;
}

function materialName(id: string): string {
    return MATERIALS.find((m) => m.id === id)?.name ?? id;
}

export class IllusionSystem {
    constructor(
        private eco: EconomySystem,
        /** 灵材库存写入（#42 产出改造）；未注入时静默跳过灵材（仅旧测试兜底） */
        private alch?: AlchemySystem,
    ) {}

    /** 跨周清零周最佳（Game 初始化与回前台时调用；发生清零返回 true） */
    checkWeek(save: SaveData, now: Date = new Date()): boolean {
        const key = weekKeyOf(now);
        if (save.illusionWeekKey === key) return false;
        save.illusionWeekKey = key;
        save.illusionWeekBest = 0;
        return true;
    }

    /**
     * 结算一局：计分 → 连胜轨 → 判档 → 只发放"高于今日已领档位"的最高一档奖励；
     * 更新今日/本周最佳。分数低于 60 无档位、无奖励，连胜清零（可护持）。
     */
    finish(save: SaveData, gold: number, maxCombo: number, red: number, theme?: TrialTheme): IllusionFinishResult {
        const score = judgeIllusionScore(gold, maxCombo, red);
        const isBestToday = score > save.daily.illusionBest;
        if (isBestToday) save.daily.illusionBest = score;
        if (score > save.illusionWeekBest) save.illusionWeekBest = score;

        // 连胜轨（#43）
        const threshold = ILLUSION.tiers[0].at; // 60
        const streakBefore = save.trial.streak;
        let mult = 0;
        if (score >= threshold) {
            save.trial.streak += 1;
            if (save.trial.streak > save.trial.bestStreak) save.trial.bestStreak = save.trial.streak;
            mult = (theme?.rewardMult ?? 1) * streakMult(save.trial.streak);
        } else {
            save.trial.streak = 0;
        }

        const tier = judgeIllusionTier(score);
        const rewards: RewardItem[] = [];
        if (tier) {
            const cfg = ILLUSION.tiers.find((t) => t.name === tier)!;
            if (cfg.at > save.daily.illusionRewardedTier) {
                save.daily.illusionRewardedTier = cfg.at;
                // 产出改用 TRIAL_TIERS（#42 §4.E）：灵石减半 + 主产灵材
                const trialCfg = TRIAL_TIERS.find((t) => t.at === cfg.at)!;
                if (trialCfg.lingshi) {
                    const got = this.eco.addLingshi(Math.floor(trialCfg.lingshi * mult));
                    rewards.push({ kind: 'lingshi', amount: got, label: `灵石 +${got}` });
                }
                for (const [id, n] of Object.entries(trialCfg.mats)) {
                    const got = Math.ceil(n * mult); // 灵材向上取整（#43）
                    this.alch?.addMaterial(save, id, got);
                    rewards.push({ kind: 'material', amount: got, materialId: id, label: `${materialName(id)} ×${got}` });
                }
                if (trialCfg.fragments) {
                    const id = 'jinmu';
                    save.fragments[id] = (save.fragments[id] ?? 0) + trialCfg.fragments;
                    rewards.push({ kind: 'fragment', amount: trialCfg.fragments, lingengId: id, label: `灵根碎片 ×${trialCfg.fragments}` });
                }
                if (trialCfg.jiyuan) {
                    this.eco.addJiyuan(trialCfg.jiyuan);
                    rewards.push({ kind: 'jiyuan', amount: trialCfg.jiyuan, label: `突破机缘 +${trialCfg.jiyuan}` });
                }
            }
        }
        return {
            score, tier, rewards, isBestToday, weekBest: save.illusionWeekBest,
            streak: save.trial.streak,
            mult,
            interrupted: score < threshold && streakBefore > 0,
            streakBefore: score < threshold ? streakBefore : 0,
        };
    }

    /**
     * 奖励翻倍（doubleReward 位，#46）：对本次已发放的灵石与灵材再补发一份
     * （碎片与机缘不加倍，同 finish 的倍率口径）。返回追加清单；无可加倍项返回空。
     * 每日 3 次频控由调用侧经 save.daily.doubleRewardUsed 计数（dailyReset 清零）。
     */
    applyDouble(save: SaveData, rewards: RewardItem[]): RewardItem[] {
        const extra: RewardItem[] = [];
        for (const r of rewards) {
            if (r.kind === 'lingshi') {
                const got = this.eco.addLingshi(r.amount);
                extra.push({ kind: 'lingshi', amount: got, label: `灵石 +${got}` });
            } else if (r.kind === 'material') {
                const n = r.amount;
                this.alch?.addMaterial(save, r.materialId!, n);
                extra.push({ kind: 'material', amount: n, materialId: r.materialId, label: `${materialName(r.materialId!)} ×${n}` });
            }
        }
        return extra;
    }
}
