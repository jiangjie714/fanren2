/**
 * 离线吐纳（M29，docs/数值假设.md #55）的判定层。
 *
 * **分层约束**：本模块零 `import 'cc'`，也**不依赖任何 System**（入账在
 * `systems/OfflineSystem.ts`），只负责「离线了多久 / 能结算几分钟 / 发多少」，
 * 可脱离引擎与 UI 单测（tests/offline.test.ts）。
 *
 * ── 计时语义（最容易写错的一块）──────────────────────────────
 * 在线时由 `OfflineSystem.heartbeat` 每秒把 `offline.lastAt` 推到当前时间；
 * 进程被挂起/杀掉后 tick 停止，`lastAt` 就冻结在「最后一次在线」那一刻，
 * 于是回到前台时 `now - lastAt` ≈ 真实离线时长。**它是「没有在玩的时间」，
 * 不是「没存档的时间」** —— 故心跳必须跑，不能只在 persist 时写。
 *
 * ── 为什么是「回到前台即自动发放」而不是「待领取池」 ──────────────
 * 待领取池要额外处理：① 心跳会把未领取的收益吃掉（玩家关掉弹窗再玩一会儿，
 * 收益蒸发）；② 多次往返要不要累加（累加等于绕过单次上限）；③ 弹窗与页面
 * 两处入口的幂等。自动发放把这些 bug 一次消掉，演出由「归来弹窗」补上。
 *
 * ── 两条上限缺一不可 ────────────────────────────────────
 * 只封「单次 ≤8h」时，玩家一天分三次各挂 8h 仍可拿到 24h 的量；所以还要
 * 封「每日累计 ≤8h」（{day, dayMin} 惰性重置，与 save.tower.daily 同款写法）。
 */
import { SaveData, todayString } from './saveModel';

/** 结算门槛（分钟）：低于此不结算也不弹窗，避免「切后台看一眼回来就弹窗」 */
export const OFFLINE_MIN_MINUTES = 5;
/** 单次离线上限（分钟）：挂 24 小时也只按 8 小时算 */
export const OFFLINE_ABSENCE_CAP = 480;
/** 每日累计上限（分钟） */
export const OFFLINE_DAY_CAP = 480;

/** 每分钟产出（境界同源；见表 `OFFLINE_RATES`） */
export interface OfflineRate {
    xiuwei: number;
    lingshi: number;
}

/** 结算结果（纯产出量，不含任何账本副作用） */
export interface OfflineGain {
    /** 本次结算的分钟数（已过两层上限） */
    minutes: number;
    xiuwei: number;
    lingshi: number;
}

/** 结算视图（派生，不改存档） */
export interface OfflineView extends OfflineGain {
    /** 是否达到门槛（未过门槛时不该结算、也不该弹窗） */
    canSettle: boolean;
    /** 是否被上限截断（UI 要据此处提示「已达上限」） */
    capped: boolean;
    /** 本次结算使用的速率 */
    rate: OfflineRate;
    /** 当日已结算分钟数（已过跨日翻新） */
    dayMin: number;
    /** 当日剩余额度（分钟） */
    dayLeft: number;
}

/**
 * §3.1 吐纳速率表（每分钟），与 `REALMS` 一一对应。
 *
 * 满 8 小时（480 分钟）产出：72 / 106 / 144 / 192 / 240 / 288 灵石，
 * 288 / 432 / 576 / 768 / 960 / 1152 修为。
 * 故意压得很低：离线在最理想状态下也只约等于在线典型一日的 **~2%**（§3.4
 * 效率比）——它是「回来的小惊喜」，不是第二条经济曲线。调表前先看
 * tests/balance.test.ts 的 #38 护栏。
 */
export const OFFLINE_RATES: OfflineRate[] = [
    { xiuwei: 0.6, lingshi: 0.15 }, // 凡人
    { xiuwei: 0.9, lingshi: 0.22 }, // 练气
    { xiuwei: 1.2, lingshi: 0.3 }, // 筑基
    { xiuwei: 1.6, lingshi: 0.4 }, // 金丹
    { xiuwei: 2.0, lingshi: 0.5 }, // 元婴
    { xiuwei: 2.4, lingshi: 0.6 }, // 化神
];

/** 每分钟毫秒数 */
const MS_PER_MIN = 60_000;

/** 境界对应的吐纳速率；下标越界（手改存档）按最高档封顶 */
export function rateOf(realmIndex: number): OfflineRate {
    const i = Math.max(0, Math.min(OFFLINE_RATES.length - 1, Math.floor(realmIndex) || 0));
    return OFFLINE_RATES[i];
}

/**
 * 未看到的离线时长（分钟，向下取整）。
 *
 * 三种必须归零的脏输入：非有限数（NaN/Infinity）、负数、**未来时间**
 * （系统时钟回拨或手改存档）—— 一律按 0 处理：不白送，也不倒扣。
 */
export function elapsedMinutes(lastAt: number, now: number): number {
    if (!Number.isFinite(lastAt) || !Number.isFinite(now)) return 0;
    const diff = now - lastAt;
    if (!(diff > 0)) return 0;
    return Math.floor(diff / MS_PER_MIN);
}

/** 日累计额度的惰性翻新：跨自然日即归零并返回当日有效值（不写盘，调用方负责 persist） */
function currentDayMin(save: SaveData, now: number): number {
    const key = todayString(new Date(now));
    if (save.offline.day !== key) {
        save.offline.day = key;
        save.offline.dayMin = 0;
    }
    return Math.max(0, Math.min(OFFLINE_DAY_CAP, save.offline.dayMin || 0));
}

/** 本次可结算的分钟数（已钳单次上限与当日余额）；不含门槛判定 */
function grantableMinutes(save: SaveData, now: number): { minutes: number; capped: boolean } {
    const raw = elapsedMinutes(save.offline.lastAt, now);
    const absence = Math.min(raw, OFFLINE_ABSENCE_CAP);
    const dayMin = currentDayMin(save, now);
    const minutes = Math.min(absence, Math.max(0, OFFLINE_DAY_CAP - dayMin));
    return { minutes, capped: minutes < raw };
}

/** 派生离线视图（纯读为主，仅会惰性翻新 day/dayMin，不改 lastAt、不入账） */
export function offlineView(save: SaveData, now: number = Date.now()): OfflineView {
    const { minutes, capped } = grantableMinutes(save, now);
    const rate = rateOf(save.realmIndex);
    const canSettle = minutes >= OFFLINE_MIN_MINUTES;
    const dayMin = Math.max(0, Math.min(OFFLINE_DAY_CAP, save.offline.dayMin || 0));
    return {
        minutes,
        // 一律 floor：乘法累加会带小数，向上取整会逐年抬高实际产出
        xiuwei: Math.floor(minutes * rate.xiuwei),
        lingshi: Math.floor(minutes * rate.lingshi),
        canSettle,
        capped,
        rate,
        dayMin,
        dayLeft: Math.max(0, OFFLINE_DAY_CAP - dayMin),
    };
}

/**
 * 结算本次离线收益（**推进状态并返回产出**，实际入账由 `OfflineSystem` 执行）。
 *
 * 未过门槛 / 当日额度耗尽 → 返回 null 且**不推进 lastAt**（这段时间不会被吞掉：
 * 次日额度翻新后仍能拿到，只是推迟而已）。
 */
export function settleOffline(save: SaveData, now: number = Date.now()): OfflineGain | null {
    const v = offlineView(save, now);
    if (!v.canSettle || v.minutes <= 0) return null;
    // 原子写入：额度累加与心跳前移必须同一次调用完成，避免「结算了却没挪 lastAt」
    // 导致的重复结算（第二次视图里还会看到同一段时间）。
    save.offline.dayMin = Math.min(OFFLINE_DAY_CAP, v.dayMin + v.minutes);
    save.offline.lastAt = now;
    return { minutes: v.minutes, xiuwei: v.xiuwei, lingshi: v.lingshi };
}

/** 在线心跳：把此刻记为「仍在线」，使离线时长只统计真正没在玩的时间 */
export function heartbeat(save: SaveData, now: number = Date.now()): void {
    save.offline.lastAt = now;
}
