/**
 * M14 秘境试炼系统：体力经济 + 主题轮换（数值假设 #42）。
 * 体力回复是纯惰性时间戳结算——没有后台定时器，读取时按 elapsed 补齐；
 * 主题按本地日序 dayIndex % 3 确定性派生（同日恒定，可复现）。
 * 纯逻辑无渲染；连胜/段位/周奖在 M14-2/M14-3 接入，本类先承载体力与主题。
 */
import { SaveData } from '../saveModel';
import {
    STAMINA_AD_PER_DAY,
    STAMINA_AD_REFILL,
    STAMINA_COST_PER_RUN,
    STAMINA_MAX,
    STAMINA_REGEN_MS,
    TrialTheme,
    themeOf,
} from '../config/trial';
import { weekKeyOf } from '../config/illusion';

export class TrialSystem {
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

    /** 跨周清零段位（赛季制，周一 0 点换周；M14-3 结算周奖，此处仅维护 weekKey） */
    checkWeek(save: SaveData, now: Date = new Date()): boolean {
        const key = weekKeyOf(now);
        if (save.trial.weekKey === key) return false;
        save.trial.weekKey = key;
        save.trial.weekRewardClaimed = false;
        return true;
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
