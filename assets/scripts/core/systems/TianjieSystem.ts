/**
 * 每日天劫系统（M36）：把「8 秒手操渡劫」从突破过场变成每天都能玩的同种子挑战。
 *
 * **分层约束**：本文件只依赖 `core/*`（不 import 'cc'、不碰 UI），可单测
 * （tests/tianjie.test.ts）。页面层（`scenes/TianjieScene.ts`）只读 view。
 *
 * 设计要点：
 * - **同种子**：今日 → `dailySeed(day) → new Rng(seed)` 建独立 `RainSystem`，
 *   每天全服同一场雨；**绝不复用 `Game.rng`**（主线随机流被污染会让同一场雨对不同人不同）；
 * - **次数经济**：每日 `TIANJIE.attemptsPerDay` 次，不设广告加次（首版），
 *   失败/退出也消耗次数——挑战必须有代价，否则分数没有意义；
 * - **惰性翻新**：`refresh()` 在读取/开打前调用，跨日就重置今日统计并结算连续天数，
 *   不依赖 `dailyReset()`（与 offline 同范式，避免每日扫描与挑战时刻的竞态）；
 * - **零经济投放**：首版不发灵石/机缘/碎片，只发「分数 + 连续天数」。
 *   这是刻意的：天劫是 DAU 引擎（榜单/分享/素材），不是经济管线，不进 #38 护栏。
 */
import { Rng } from '../rng';
import { SaveData } from '../saveModel';
import { RainResult, RainSession, RainSystem } from './RainSystem';
import {
    TIANJIE,
    Modifier,
    dateKeyOf,
    dailyModifiers,
    dailySeed,
    tianjieWeekValue,
    weekMondayOf,
} from '../tianjie';
import {
    ReportStorage,
    TIANJIE_REPORT_KEY,
    TianjieReport,
    decodeReport,
    encodeReport,
} from '../tianjieReport';

/** 页面层用的只读视图（全部派生，不落存档） */
export interface TianjieView {
    /** 今日日键 */
    day: string;
    /** 今日剩余次数 */
    attemptsLeft: number;
    /** 今日已用次数 */
    attemptsUsed: number;
    /** 今日最高分 */
    todayBest: number;
    /** 历史最高分 */
    best: number;
    /** 连续挑战天数 */
    streak: number;
    /** 历史最长连续 */
    bestStreak: number;
    /** 今日词条（最多 3 条） */
    mods: Modifier[];
    /** 词条合计计分倍率 */
    scoreMult: number;
    /** 今日种子（面板展示/分享卡可写前 6 位） */
    seed: number;
    /** 本周最佳分 */
    weekBest: number;
    /** 周榜编码值（好友榜 `tianjie_week` 上报/对比用） */
    weekValue: number;
}

/** 单局结算：页面层据此渲染结果页 */
export interface TianjieRunResult {
    /** 本局评分（已含词条倍率，0–100） */
    score: number;
    /** 评级文案（凡阶/灵阶/仙阶） */
    rating: string;
    /** 是否刷新了今日最佳 */
    newTodayBest: boolean;
    /** 是否刷新了历史最佳 */
    newBest: boolean;
    /** 本局明细（金/清/劫、连击） */
    result: RainResult;
    /** 剩余次数（结算页「再战」按钮据此置灰） */
    attemptsLeft: number;
}

export class TianjieSystem {
    /** 本局使用的独立随机源（每局新建，保证同日同种子同序列） */
    private runRng: Rng | null = null;
    /** 战报缓存（可选注入：断言真机无 localStorage 时退化为内存，不抛错） */
    private storage: ReportStorage | null;
    /** 内存兜底：storage 不可用或写入失败时至少本次会话能拿到 */
    private lastReportMem: TianjieReport | null = null;

    constructor(private now: () => number = () => Date.now(), storage: ReportStorage | null = null) {
        this.storage = storage;
    }

    /** 今日日键（本地自然日，与存档 daily.date 同口径） */
    todayKey(): string {
        return dateKeyOf(this.now());
    }

    /**
     * 惰性翻新：跨日重置今日次数/今日最佳，跨周重置周最佳；连续天数**只在真正开打时**推进
     * （见 `start()`）。幂等，可在任意读取前调用。
     *
     * 连续为什么不在这里 +1：如果翻新即 +1，那么「今天还没打、只是打开入口页」也算连续，
     * 连续天数就退化成了「打开次数」。正确语义是「今天打了一局，且昨天也打过」。
     */
    refresh(save: SaveData): void {
        const t = save.tianjie;
        const today = this.todayKey();
        const week = weekMondayOf(this.now());
        const dayChanged = t.day !== today;
        if (dayChanged) {
            t.day = today;
            t.attempts = 0;
            t.todayBest = 0;
        }
        if (t.weekKey !== week) {
            // 跨周：周榜值归零（历史最高 `best` 不动），周一 0 点换周与秘境/幻境同口径
            t.weekKey = week;
            t.weekBest = 0;
        }
    }

    /** 今日视图（先 refresh） */
    view(save: SaveData): TianjieView {
        this.refresh(save);
        const t = save.tianjie;
        const mods = dailyModifiers(t.day);
        return {
            day: t.day,
            attemptsLeft: Math.max(0, TIANJIE.attemptsPerDay - t.attempts),
            attemptsUsed: t.attempts,
            todayBest: t.todayBest,
            best: t.best,
            streak: t.streak,
            bestStreak: t.bestStreak,
            mods,
            scoreMult: this.multOf(mods),
            seed: dailySeed(t.day),
            weekBest: t.weekBest,
            weekValue: this.weekValue(t.weekKey, t.weekBest),
        };
    }

    canPlay(save: SaveData): boolean {
        return this.view(save).attemptsLeft > 0;
    }

    /**
     * 开一局：消耗 1 次并返回一个**独立**的 RainSystem + 会话。
     * 调用方必须用返回的 `system` 驱动本局（不要用 `Game.rain`），
     * 否则主线随机流与天劫随机流会互相污染，同一天不同玩家序列不一致。
     */
    start(save: SaveData): { system: RainSystem; session: RainSession; mods: Modifier[] } | null {
        const v = this.view(save);
        if (v.attemptsLeft <= 0) return null;
        save.tianjie.attempts += 1;
        save.tianjie.totalRuns += 1;
        // 连续天数：今天第一次打，且上一次真正打的是昨天 → +1；否则（断档/首次/同日重开）不动或归 1
        const t = save.tianjie;
        const today = this.todayKey();
        if (t.hasDay !== today) {
            t.streak = t.hasDay === this.yesterdayKey() ? t.streak + 1 : 1;
            t.bestStreak = Math.max(t.bestStreak, t.streak);
            t.hasDay = today;
        }
        this.runRng = new Rng(v.seed);
        const system = new RainSystem(this.runRng);
        // 目标境界只影响「动态难度」（波③劫雨权重 + 落速），天劫按玩家当前境界取，
        // 但词条是全局统一的；为公平起见固定 targetIndex = 1（练气档基线），
        // 避免高境界玩家天然面对更难的雨（同种子榜单必须同难度）。
        const session = system.createSession(1, false, 'tianjie', undefined, false, v.mods);
        return { system, session, mods: v.mods };
    }

    /** 结算：写今日/历史最佳与连续天数，返回页面层要的差异信息 */
    finish(save: SaveData, result: RainResult): TianjieRunResult {
        const t = save.tianjie;
        const score = Math.max(0, Math.min(100, Math.round(result.score)));
        const newTodayBest = score > t.todayBest;
        const newBest = score > t.best;
        if (newTodayBest) t.todayBest = score;
        if (newBest) t.best = score;
        if (score > t.weekBest) t.weekBest = score;
        this.saveReport({
            day: t.day,
            score,
            rating: String(result.rating ?? ''),
            gold: result.goldCount,
            blue: result.blueCount,
            red: result.redCount,
            maxCombo: result.maxCombo,
            mods: dailyModifiers(t.day).map((m) => m.id),
            newBest,
            at: this.now(),
        });
        return {
            score,
            rating: String(result.rating ?? ''),
            newTodayBest,
            newBest,
            result,
            attemptsLeft: Math.max(0, TIANJIE.attemptsPerDay - t.attempts),
        };
    }

    // ---------------- 战报缓存 ----------------

    /** 写战报（storage 失败时退化为内存；绝不因缓存问题阻断结算） */
    private saveReport(r: TianjieReport): void {
        this.lastReportMem = r;
        if (!this.storage) return;
        try {
            this.storage.set(TIANJIE_REPORT_KEY, encodeReport(r));
        } catch {
            // 配额满/隐私模式：内存兜底已就位
        }
    }

    /** 上次战报（读到脏数据/无缓存返回 null）；只作展示，不参与任何判定 */
    lastReport(): TianjieReport | null {
        if (this.storage) {
            try {
                const got = decodeReport(this.storage.get(TIANJIE_REPORT_KEY));
                if (got) return got;
            } catch {
                // 读失败走内存兜底
            }
        }
        return this.lastReportMem;
    }

    /** 是否「今天还没打、但有昨天/更早的战报」——首页迎劫提示条据此浮现 */
    shouldNudge(save: SaveData): boolean {
        this.refresh(save);
        if (save.tianjie.attempts > 0) return false;
        const r = this.lastReport();
        return !!r && r.day !== this.todayKey() && r.score > 0;
    }

    /** 词条合计倍率（与 core/tianjie 的 combinedScoreMult 同源，惰性引入避免重复实现） */
    private multOf(mods: Modifier[]): number {
        let m = 1;
        mods.forEach((x) => { m *= x.scoreMult; });
        return Math.min(TIANJIE.maxScoreMult, Math.max(1, Math.round(m * 1000) / 1000));
    }

    /** 周榜编码（周一键 × 1000 + 周最佳），供好友榜上报/对比 */
    weekValue(weekKey: string, weekBest: number): number {
        return tianjieWeekValue(weekKey, weekBest);
    }

    /** 当前玩家周榜值（DouyinSocial 上报/论道页注入「我」行用） */
    myWeekValue(save: SaveData): number {
        this.refresh(save);
        return this.weekValue(save.tianjie.weekKey, save.tianjie.weekBest);
    }

    private yesterdayKey(): string {
        return dateKeyOf(this.now() - 86400000);
    }
}
