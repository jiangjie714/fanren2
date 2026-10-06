/**
 * M14 秘境试炼系统：体力经济 + 主题轮换（数值假设 #42）。
 * 体力回复是纯惰性时间戳结算——没有后台定时器，读取时按 elapsed 补齐；
 * 主题按本地日序 dayIndex % 3 确定性派生（同日恒定，可复现）。
 * 纯逻辑无渲染；连胜/段位/周奖在 M14-2/M14-3 接入，本类先承载体力与主题。
 */
import { SaveData } from '../saveModel';
import {
    RANK_TIERS,
    STAMINA_AD_PER_DAY,
    STAMINA_AD_REFILL,
    STAMINA_COST_PER_RUN,
    STAMINA_MAX,
    STAMINA_REGEN_MS,
    RankTier,
    TrialTheme,
    rankById,
    rankGain,
    rankOf,
    rankOrder,
    themeOf,
} from '../config/trial';
import { weekKeyOf } from '../config/illusion';
import { MATERIALS } from '../config/alchemy';
import { RewardItem } from './BoxSystem';
import { EconomySystem } from './EconomySystem';
import { AlchemySystem } from './AlchemySystem';

export interface RankSettleResult {
    gained: number;
    rank: RankTier;
    rankScore: number;
}

export class TrialSystem {
    constructor(
        /** 周奖发放依赖（M14-3 claimSeason）；未注入时领取返回 null（旧测试兜底） */
        private eco?: EconomySystem,
        private alch?: AlchemySystem,
    ) {}

    /**
     * 惰性结算体力：按距 staminaAt 的整周期数回复（余数保留，不吞）。
     * 回满后把基准推进到 now（满体力期间流逝的时间不再折算，避免「满态挂机反而不涨」的怪象）。
     * 返回是否发生了回复（供 UI 刷新判断）。
     */
    settleStamina(save: SaveData, now: Date = new Date()): boolean {
        const t = save.trial;
        const ts = now.getTime();
        if (t.stamina >= STAMINA_MAX) {
            if (t.staminaAt !== ts) t.staminaAt = ts;
            return false;
        }
        const regen = Math.floor((ts - t.staminaAt) / STAMINA_REGEN_MS);
        if (regen <= 0) return false;
        const next = Math.min(STAMINA_MAX, t.stamina + regen);
        t.stamina = next;
        // 不吞余数：只推进已消耗的整周期；回满则从现在重新计时
        t.staminaAt = next >= STAMINA_MAX ? ts : t.staminaAt + regen * STAMINA_REGEN_MS;
        return true;
    }

    /** 当前可用体力（先惰性结算再读） */
    stamina(save: SaveData, now: Date = new Date()): number {
        this.settleStamina(save, now);
        return save.trial.stamina;
    }

    /** 距下一点体力的剩余毫秒（满体力为 0） */
    msToNext(save: SaveData, now: Date = new Date()): number {
        this.settleStamina(save, now);
        if (save.trial.stamina >= STAMINA_MAX) return 0;
        const elapsed = now.getTime() - save.trial.staminaAt;
        return Math.max(0, STAMINA_REGEN_MS - (elapsed % STAMINA_REGEN_MS));
    }

    /** 能否开局：体力 ≥ 每局消耗 */
    canStart(save: SaveData, now: Date = new Date()): boolean {
        return this.stamina(save, now) >= STAMINA_COST_PER_RUN;
    }

    /** 消耗一次体力开局；体力不足返回 false（调用方先 canStart 或引导广告补给） */
    consumeStart(save: SaveData, now: Date = new Date()): boolean {
        if (!this.canStart(save, now)) return false;
        save.trial.stamina -= STAMINA_COST_PER_RUN;
        return true;
    }

    /** 广告补给（trialStamina 位）：+5 点、不超上限、每日 3 次；成功返回 true */
    refillByAd(save: SaveData, now: Date = new Date()): boolean {
        const t = save.trial;
        if (t.adRefillToday >= STAMINA_AD_PER_DAY) return false;
        this.settleStamina(save, now);
        t.stamina = Math.min(STAMINA_MAX, t.stamina + STAMINA_AD_REFILL);
        t.adRefillToday += 1;
        return true;
    }

    /** 今日主题（按本地日序确定性派生；同日任何时刻调用结果一致） */
    themeOf(now: Date = new Date()): TrialTheme {
        return themeOf(now);
    }

    // ---------- 段位轨（#44，M14-3） ----------

    /**
     * 每局段位结算：rankScore += max(0, floor((score-60)/5))；
     * bestRank 只升不降（跨赛季展示用，不影响周奖）。
     */
    settleRank(save: SaveData, score: number): RankSettleResult {
        const gained = rankGain(score);
        save.trial.rankScore += gained;
        const rank = rankOf(save.trial.rankScore);
        if (rankOrder(rank.id) > rankOrder(save.trial.bestRank)) save.trial.bestRank = rank.id;
        return { gained, rank, rankScore: save.trial.rankScore };
    }

    /**
     * 赛季结算（周一 0 点换周，Game 初始化/回前台调用）：
     * 上周段位 = 结算时 rankScore 对应段位 → 记入 seasonRank 待玩家手动领周奖
     * （未领取到下周一作废，制造回归压力）；rankScore 清零重开新赛季。
     * rankScore 为 0（本周一局未打或最高恰好 0 分）视为未参与，不发周奖。
     */
    checkWeek(save: SaveData, now: Date = new Date()): boolean {
        const key = weekKeyOf(now);
        if (save.trial.weekKey === key) return false;
        save.trial.seasonRank = save.trial.rankScore > 0 ? rankOf(save.trial.rankScore).id : '';
        save.trial.rankScore = 0;
        save.trial.weekKey = key;
        save.trial.weekRewardClaimed = false;
        return true;
    }

    /** 本周是否可领上赛季周奖 */
    canClaimSeason(save: SaveData): boolean {
        return save.trial.seasonRank !== '' && !save.trial.weekRewardClaimed;
    }

    /**
     * 领取上赛季周奖（幂等，weekRewardClaimed）：灵石/灵材/碎片/机缘一次发全。
     * 返回实际发放清单；无可领或依赖未注入返回 null。
     */
    claimSeason(save: SaveData): RewardItem[] | null {
        if (!this.canClaimSeason(save) || !this.eco || !this.alch) return null;
        const tier = rankById(save.trial.seasonRank);
        const rewards: RewardItem[] = [];
        if (tier.lingshi) {
            const got = this.eco.addLingshi(tier.lingshi);
            rewards.push({ kind: 'lingshi', amount: got, label: `灵石 +${got}` });
        }
        for (const [id, n] of Object.entries(tier.mats)) {
            this.alch.addMaterial(save, id, n);
            const name = MATERIALS.find((m) => m.id === id)?.name ?? id;
            rewards.push({ kind: 'material', amount: n, materialId: id, label: `${name} ×${n}` });
        }
        if (tier.fragments) {
            save.fragments['jinmu'] = (save.fragments['jinmu'] ?? 0) + tier.fragments;
            rewards.push({ kind: 'fragment', amount: tier.fragments, lingengId: 'jinmu', label: `灵根碎片 ×${tier.fragments}` });
        }
        if (tier.jiyuan) {
            this.eco.addJiyuan(tier.jiyuan);
            rewards.push({ kind: 'jiyuan', amount: tier.jiyuan, label: `突破机缘 +${tier.jiyuan}` });
        }
        save.trial.weekRewardClaimed = true;
        return rewards;
    }

    /**
     * 连胜中断清零（#43）：评分 <60 的局在结算时立即清零——存档随时一致，
     * 玩家即使中途杀进程也不会带着未决策的连胜悬挂。看广告护持成功后用
     * reviveStreak 恢复（IllusionSystem.finish 返回中断前的层数）。
     */
    breakStreak(save: SaveData): number {
        const before = save.trial.streak;
        save.trial.streak = 0;
        return before;
    }

    /** 道心护持成功（trialRevive 位）：恢复中断前的连胜层数 */
    reviveStreak(save: SaveData, streakBefore: number): void {
        if (streakBefore <= 0) return;
        save.trial.streak = streakBefore;
        if (save.trial.streak > save.trial.bestStreak) save.trial.bestStreak = save.trial.streak;
    }
}

