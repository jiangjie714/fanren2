/**
 * 连续登录签到（M26，docs/数值假设.md #53）的判定层。
 *
 * **分层约束**：本模块零 `import 'cc'`，也**不依赖任何 System**（发奖在
 * `systems/CheckinSystem.ts`），只负责「能不能领 / 领了以后变成什么状态 / 领到哪一档」，
 * 可脱离引擎与 UI 单测（tests/checkin.test.ts）。
 *
 * 设计要点：
 * - 七日**轮回**（第 8 天回到第 1 档）而非奖励无限递增，长线不通胀；
 * - 累计里程碑（7/15/30 天）一次性，给「已坚持 N 天」的正反馈；
 * - 断签（间隔 > 1 天）经典重置为第 1 天；
 * - `lastDay === today` 即「今日已领」，故幂等不需要额外布尔字段。
 */
import { SaveData } from './saveModel';

/** 轮回长度（天） */
export const CHECKIN_CYCLE = 7;

/** 某一档的奖励内容（灵材键见 `config/alchemy.ts` MATERIALS） */
export interface CheckinReward {
    lingshi: number;
    jiyuan: number;
    mats: Record<string, number>;
}

/** 累计里程碑奖励（一次性） */
export interface CheckinMilestone {
    /** 累计登录天数门槛 */
    days: number;
    lingshi: number;
    jiyuan: number;
    mats: Record<string, number>;
    /** 修真宝盒券 */
    tickets: number;
}

/**
 * §3.1 七日轮回奖励表。日均摊 ≈307 灵石 / 1.43 机缘 / 0.43 灵材，
 * 占护栏②（#38：10800 灵石 / 40 灵材 / 120 机缘）约 3%，不推爆基线。
 */
export const CHECKIN_REWARDS: CheckinReward[] = [
    { lingshi: 100, jiyuan: 0, mats: {} },
    { lingshi: 150, jiyuan: 0, mats: {} },
    { lingshi: 200, jiyuan: 0, mats: {} },
    { lingshi: 250, jiyuan: 0, mats: {} },
    { lingshi: 300, jiyuan: 0, mats: {} },
    { lingshi: 350, jiyuan: 0, mats: {} },
    { lingshi: 800, jiyuan: 10, mats: { lingcao: 2, lingshi_core: 1 } },
];

/** §3.2 累计里程碑（一次性，幂等领取） */
export const CHECKIN_MILESTONES: CheckinMilestone[] = [
    { days: 7, lingshi: 500, jiyuan: 0, mats: {}, tickets: 0 },
    { days: 15, lingshi: 0, jiyuan: 0, mats: {}, tickets: 1 },
    { days: 30, lingshi: 0, jiyuan: 30, mats: { lingcao: 5 }, tickets: 0 },
];

/** 签到视图（派生，不改存档） */
export interface CheckinView {
    /** 当前连续天数（0 = 从未领取） */
    streak: number;
    /** 当前落在轮回第几天（1..7；0 = 从未领取） */
    cycleDay: number;
    /** 今天领取后会变成的连续天数 */
    nextStreak: number;
    /** 今天领取后落在轮回第几天 */
    cycleDayAfter: number;
    /** 今日是否已领 */
    claimedToday: boolean;
    /** 今日是否可领 */
    canClaim: boolean;
    /** 今日可领的奖励（已领时为 null） */
    pending: CheckinReward | null;
    /** 累计登录天数 */
    totalDays: number;
    /** 三条里程碑的达成/领取状态 */
    milestones: Array<{ days: number; reached: boolean; claimed: boolean; reward: CheckinMilestone }>;
    /** 下一个「已达标未领取」的里程碑（null = 无可领） */
    nextMilestone: CheckinMilestone | null;
}

/**
 * 解析 YYYY-MM-DD 为 UTC 毫秒；非法返回 null。
 * 必须做一次回推校验：`Date.UTC(2026, 12, 1)` 会把「2026-13-01」静默滚成 2027-01-01，
 * 只靠正则（\d{2}）拦不住越界月份/日期。
 */
function parseDay(s: string): number | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const t = Date.UTC(y, mo - 1, d);
    const back = new Date(t);
    if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
    return t;
}

/**
 * 两个日期键相差天数（`to - from`）。跨月/跨年/闰年由 Date.UTC 保证；
 * 任一非法返回 null。用 UTC 毫秒差整除，规避本地时区夏令时的 ±1 小时抖动。
 */
export function dayGap(from: string, to: string): number | null {
    const a = parseDay(from);
    const b = parseDay(to);
    if (a === null || b === null) return null;
    return Math.round((b - a) / 86_400_000);
}

/** 连续第 n 天对应轮回内的第几档（1..7） */
export function cycleDayOf(streak: number): number {
    if (streak <= 0) return 0;
    return ((streak - 1) % CHECKIN_CYCLE) + 1;
}

/** 第 n 天（连续）对应的奖励档（按轮回取模） */
export function rewardForDay(day: number): CheckinReward {
    return CHECKIN_REWARDS[cycleDayOf(day) - 1] ?? CHECKIN_REWARDS[0];
}

/** 若今天领取，连续天数会变成多少（断签则为 1，从未领取也是 1） */
export function nextStreakIfClaim(save: SaveData, today: string): number {
    const c = save.checkin;
    if (!c || c.lastDay === today) return Math.max(0, c?.streak ?? 0);
    if (c.lastDay === '') return 1;
    const gap = dayGap(c.lastDay, today);
    // 日期非法（手改存档）时按断签处理，不给「白续」
    if (gap === null || gap > 1) return 1;
    return c.streak + 1;
}

/** 派生签到视图（纯读，不改存档） */
export function checkinView(save: SaveData, today: string): CheckinView {
    const c = save.checkin;
    const claimedToday = c.lastDay === today;
    const canClaim = !claimedToday;
    const streak = Math.max(0, c.streak);
    const nextStreak = nextStreakIfClaim(save, today);
    const totalDays = Math.max(0, c.totalDays);
    const claimedSet = c.milestonesClaimed ?? [];

    const milestones = CHECKIN_MILESTONES.map((m) => ({
        days: m.days,
        reached: totalDays >= m.days,
        claimed: claimedSet.indexOf(m.days) >= 0,
        reward: m,
    }));

    let nextMilestone: CheckinMilestone | null = null;
    for (const m of milestones) {
        if (m.reached && !m.claimed) { nextMilestone = m.reward; break; }
    }

    return {
        streak,
        cycleDay: cycleDayOf(streak),
        nextStreak,
        cycleDayAfter: cycleDayOf(nextStreak),
        claimedToday,
        canClaim,
        pending: canClaim ? rewardForDay(nextStreak) : null,
        totalDays,
        milestones,
        nextMilestone,
    };
}

/**
 * 领取今日签到：**推进状态并返回奖励**，实际入账由 `CheckinSystem` 执行
 * （本模块不碰账本，保持纯函数）。
 *
 * 幂等：今日已领返回 null。断签（间隔 > 1 天）重置为第 1 天。
 */
export function claimCheckin(save: SaveData, today: string): CheckinReward | null {
    const c = save.checkin;
    if (c.lastDay === today) return null;
    const next = nextStreakIfClaim(save, today);
    c.streak = next;
    c.totalDays = Math.max(0, c.totalDays) + 1;
    c.lastDay = today;
    return rewardForDay(next);
}

/**
 * 领取累计里程碑（幂等）。成功返回该里程碑（供调用方入账），
 * 未达标 / 已领过 / 无此档位返回 null。
 */
export function claimMilestone(save: SaveData, days: number): CheckinMilestone | null {
    const c = save.checkin;
    const m = CHECKIN_MILESTONES.find((x) => x.days === days);
    if (!m) return null;
    if (c.totalDays < m.days) return null;
    if (!c.milestonesClaimed) c.milestonesClaimed = [];
    if (c.milestonesClaimed.indexOf(m.days) >= 0) return null;
    c.milestonesClaimed.push(m.days);
    return m;
}
