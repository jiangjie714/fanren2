/** 经济系统：灵石/修为/机缘账本、修为小等级、每日重置（纯逻辑，可单测） */
import { SaveData, todayString } from '../saveModel';
import {
    DAILY_LINGSHI_AID_AMOUNT,
    DAILY_LINGSHI_AID_LIMIT,
    LINGSHI_BONUS_PER_LEVEL,
    MAX_SMALL_LEVEL,
    XIUWEI_PER_LEVEL,
} from '../config/economy';

export class EconomySystem {
    /** 修为获取加成提供者（由灵根收集系统注入：1 + Σ解锁加成） */
    xiuweiBonusProvider: () => number = () => 1;

    constructor(private save: SaveData) {}

    // ---------- 灵石 ----------
    get lingshi(): number { return this.save.lingshi; }
    canAfford(n: number): boolean { return this.save.lingshi >= n; }
    spend(n: number): boolean {
        if (!this.canAfford(n)) return false;
        this.save.lingshi -= n;
        return true;
    }
    addLingshi(n: number, applyBonus = true): number {
        const bonus = applyBonus ? this.lingshiBonus() : 1;
        const got = Math.round(n * bonus);
        this.save.lingshi += got;
        if (got > 0) this.save.stats.lingshiEarned += got; // M9a 成就指标：累计获得灵石
        return got;
    }

    // ---------- 修为（小等级经验） ----------
    get xiuwei(): number { return this.save.xiuwei; }
    /** 修为获取加成：灵根图鉴加成（乘算） */
    get xiuweiBonus(): number { return this.xiuweiBonusProvider(); }
    /** 获得修为；返回实际入账值 */
    addXiuwei(n: number, applyBonus = true): number {
        const got = Math.max(0, Math.round(n * (applyBonus ? this.xiuweiBonus : 1)));
        this.save.xiuwei += got;
        return got;
    }
    /** 按比例损失修为（劫难），返回损失值 */
    loseXiuweiPct(pct: number): number {
        const loss = Math.round(this.save.xiuwei * pct);
        this.save.xiuwei -= loss;
        return loss;
    }
    /** 突破失败修为清零；keepRatio>0 时保留比例（渡劫护道 50%） */
    clearXiuwei(keepRatio = 0): number {
        const keep = Math.round(this.save.xiuwei * keepRatio);
        const lost = this.save.xiuwei - keep;
        this.save.xiuwei = keep;
        return lost;
    }
    /** 修为小等级（每 100 修为 1 级，上限 50） */
    smallLevel(): number {
        return Math.min(MAX_SMALL_LEVEL, Math.floor(this.save.xiuwei / XIUWEI_PER_LEVEL));
    }
    /** 灵石收益加成（1 + 等级×2%） */
    lingshiBonus(): number {
        return 1 + this.smallLevel() * LINGSHI_BONUS_PER_LEVEL;
    }

    // ---------- 机缘 ----------
    get jiyuan(): number { return this.save.jiyuan; }
    addJiyuan(n: number): void { this.save.jiyuan += n; }
    /** 按比例损失机缘（突破失败保留 50% / 中途退出保留 70%） */
    loseJiyuanPct(pct: number): number {
        const loss = Math.round(this.save.jiyuan * pct);
        this.save.jiyuan -= loss;
        return loss;
    }

    // ---------- 每日重置 ----------
    /** 跨天时重置每日状态（启动与回到前台时调用） */
    dailyReset(now: Date = new Date()): boolean {
        const t = todayString(now);
        if (this.save.daily.date === t) return false;
        this.save.daily.date = t;
        this.save.daily.dailyGiftUsed = false;
        this.save.daily.monthlyClaimed = false;
        this.save.daily.lingshiAidCount = 0;
        // v2（M8）：任务/活跃度/历练/幻境的每日状态一并重置（数值假设 #27–#29）
        this.save.daily.questProgress = {};
        this.save.daily.activityClaimed = [];
        this.save.daily.expeditionUsed = 0;
        this.save.daily.expeditionRecallUsed = false;
        this.save.daily.illusionFreeUsed = false;
        this.save.daily.illusionAdUsed = false;
        this.save.daily.illusionBest = 0;
        this.save.daily.illusionRewardedTier = 0;
        this.save.daily.pkUsed = 0;
        // v6（M14 #42）：秘境广告补给次数随日重置；体力本身走惰性时间戳回复，不随天清
        if (this.save.trial) this.save.trial.adRefillToday = 0;
        return true;
    }

    // ---------- 灵石救济（每日限次，docs/数值假设.md #19） ----------
    /** 今日剩余救济次数 */
    aidRemaining(): number {
        return Math.max(0, DAILY_LINGSHI_AID_LIMIT - this.save.daily.lingshiAidCount);
    }

    /** 申请灵石救济：发灵石并计数；次数用尽返回 null（调用方负责先看广告） */
    requestLingshiAid(): number | null {
        if (this.aidRemaining() <= 0) return null;
        this.save.daily.lingshiAidCount += 1;
        this.addLingshi(DAILY_LINGSHI_AID_AMOUNT, false);
        return DAILY_LINGSHI_AID_AMOUNT;
    }

    // ---------- 月卡 ----------
    get monthCardActive(): boolean {
        return this.save.monthlyCardExpire > Date.now();
    }
    activateMonthlyCard(days: number, durationMs: number): void {
        const base = Math.max(Date.now(), this.save.monthlyCardExpire);
        this.save.monthlyCardExpire = base + days * durationMs;
    }

    /**
     * 月卡每日特权（PRD 2.6 / #14）：月卡有效且今日未领 → 发 1 张修真宝盒券。
     * Game.init 与回前台时自动调用；无月卡或已领返回 false。
     */
    claimMonthlyTicket(): boolean {
        if (!this.monthCardActive) return false;
        if (this.save.daily.monthlyClaimed) return false;
        this.save.daily.monthlyClaimed = true;
        this.save.xiuzhenTickets += 1;
        return true;
    }
}
