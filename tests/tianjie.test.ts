import { describe, expect, it } from 'vitest';
import { Rng } from '../assets/scripts/core/rng';
import { defaultSave, migrate, TianjieState } from '../assets/scripts/core/saveModel';
import { RainSystem } from '../assets/scripts/core/systems/RainSystem';
import { TianjieSystem } from '../assets/scripts/core/systems/TianjieSystem';
import { TIANJIE_REPORT_KEY, decodeReport, encodeReport } from '../assets/scripts/core/tianjieReport';
import {
    MODIFIERS,
    MODIFIER_POOL_VERSION,
    TIANJIE,
    combinedScoreMult,
    dailyModifiers,
    dailySeed,
    dateKeyOf,
    difficultyOf,
    tianjieRating,
    tianjieScore,
} from '../assets/scripts/core/tianjie';
import { judgeScore } from '../assets/scripts/core/config/drops';

const DAY = '2026-10-22';
const DAY2 = '2026-10-23';
const NOW = new Date(2026, 9, 22, 20, 0).getTime();

/** 跑一整局：玩家保持不动（playerTargetX=0），固定步长，返回结果 */
function runRound(seed: number, mods = dailyModifiers(DAY), steps = 400, dt = 0.02) {
    const rs = new RainSystem(new Rng(seed));
    const s = rs.createSession(1, false, 'tianjie', undefined, false, mods);
    for (let i = 0; i < steps && !s.finished; i += 1) rs.tick(s, dt, 0);
    return { session: s, result: rs.finish(s) };
}

describe('每日天劫：种子与词条（同服一致）', () => {
    it('同日同种子；不同日不同种子；种子含词条池版本', () => {
        expect(dailySeed(DAY)).toBe(dailySeed(DAY));
        expect(dailySeed(DAY)).not.toBe(dailySeed(DAY2));
        expect(dailySeed(DAY)).toBe((20261022 * 10 + MODIFIER_POOL_VERSION) >>> 0);
    });

    it('同日词条确定且互不相同，条数 = 3', () => {
        const a = dailyModifiers(DAY);
        const b = dailyModifiers(DAY);
        expect(a).toHaveLength(TIANJIE.modifierCount);
        expect(a.map((m) => m.id)).toEqual(b.map((m) => m.id));
        expect(new Set(a.map((m) => m.id)).size).toBe(a.length);
    });

    it('一周内词条组合有变化（不是每天同一个）', () => {
        const combos = new Set<string>();
        for (let d = 1; d <= 7; d += 1) {
            combos.add(dailyModifiers(`2026-10-0${d}`).map((m) => m.id).join(','));
        }
        expect(combos.size).toBeGreaterThan(1);
    });

    it('每天至少一条「福利」词条（scoreMult ≥ 1）', () => {
        for (let d = 1; d <= 28; d += 1) {
            const key = `2026-11-${String(d).padStart(2, '0')}`;
            expect(dailyModifiers(key).some((m) => m.scoreMult >= 1)).toBe(true);
        }
    });

    it('计分倍率钳制在 [1, maxScoreMult]，难度档随之变化', () => {
        expect(combinedScoreMult([])).toBe(1);
        expect(combinedScoreMult([MODIFIERS[0]])).toBeCloseTo(1.15, 3);
        const all = Array.from(MODIFIERS);
        expect(combinedScoreMult(all)).toBeLessThanOrEqual(TIANJIE.maxScoreMult);
        // 单条 1.15 → 恰好进入 hard 带；1.35 及以上 → extreme
        expect(difficultyOf([MODIFIERS[0]])).toBe('hard');
        expect(difficultyOf([MODIFIERS[4]])).toBe('hard'); // crowdedSky 1.35 → ≥1.15 且 <1.5
        expect(difficultyOf([MODIFIERS[0], MODIFIERS[4]])).toBe('extreme'); // 1.15 × 1.35 ≈ 1.55
        expect(difficultyOf([])).toBe('standard');
    });

    it('计分：基础评分 × 词条倍率，clamp 0–100；无词条时与渡劫评分同公式', () => {
        expect(tianjieScore(10, 9, 2, 1, [])).toBe(judgeScore(10, 9, 2, 1));
        expect(tianjieScore(40, 20, 0, 0, [])).toBe(100);
        expect(tianjieScore(10, 9, 2, 1, [MODIFIERS[4]])).toBe(Math.min(100, Math.round(judgeScore(10, 9, 2, 1) * 1.35)));
        expect(tianjieRating(80)).toBe('仙阶');
        expect(tianjieRating(50)).toBe('灵阶');
        expect(tianjieRating(10)).toBe('凡阶');
    });

    it('dateKeyOf 用本地自然日，跨午夜切日', () => {
        expect(dateKeyOf(new Date(2026, 9, 22, 23, 59).getTime())).toBe(DAY);
        expect(dateKeyOf(new Date(2026, 9, 23, 0, 1).getTime())).toBe(DAY2);
    });
});

describe('每日天劫：确定性对局（公平挑战的前提）', () => {
    it('同种子 + 同词条 → 雨滴序列完全一致；不同种子 → 不同', () => {
        const a = runRound(12345);
        const b = runRound(12345);
        expect(a.result).toEqual(b.result);
        expect(a.session.maxCombo).toBe(b.session.maxCombo);
        const c = runRound(999);
        expect(c.result.goldCount + c.result.redCount).toBeGreaterThan(0);
        expect([a.result.goldCount, a.result.redCount, a.result.score])
            .not.toEqual([c.result.goldCount, c.result.redCount, c.result.score]);
    });

    it('天劫会话不是 null 词条，渡劫会话词条恒 null（既有路径 bit-exact）', () => {
        const rs = new RainSystem(new Rng(1));
        expect(rs.createSession(1, false).tianjie).toBeNull();
        expect(rs.createSession(1, false, 'illusion').tianjie).toBeNull();
        const mods = dailyModifiers(DAY);
        expect(rs.createSession(1, false, 'tianjie', undefined, false, mods).tianjie).toEqual(mods);
    });

    it('词条不改渡劫路径：带词条参数以外的渡劫会话与无参数会话同序列', () => {
        const a = new RainSystem(new Rng(7));
        const sa = a.createSession(2, false);
        const b = new RainSystem(new Rng(7));
        const sb = b.createSession(2, false);
        for (let i = 0; i < 200; i += 1) {
            a.tick(sa, 0.02, 0);
            b.tick(sb, 0.02, 0);
        }
        expect(a.finish(sa)).toEqual(b.finish(sb));
    });

    it('「清雨断绝」词条确实不生成清雨', () => {
        const noBlue = MODIFIERS.filter((m) => m.id === 'noBlue');
        const run = runRound(dailySeed(DAY), noBlue);
        expect(run.result.blueCount).toBe(0);
    });
});

describe('每日天劫：次数经济与跨日翻新', () => {
    it('每日 3 次；用尽后 start 返回 null', () => {
        const save = defaultSave();
        const sys = new TianjieSystem(() => NOW);
        expect(sys.view(save).attemptsLeft).toBe(TIANJIE.attemptsPerDay);
        for (let i = 0; i < TIANJIE.attemptsPerDay; i += 1) {
            expect(sys.start(save)).not.toBeNull();
        }
        expect(sys.canPlay(save)).toBe(false);
        expect(sys.start(save)).toBeNull();
        expect(save.tianjie.totalRuns).toBe(TIANJIE.attemptsPerDay);
    });

    it('次日翻新：次数回满、今日最佳清零、历史最佳保留（连续在「开打」时推进）', () => {
        const save = defaultSave();
        let now = NOW;
        const sys = new TianjieSystem(() => now);
        sys.start(save);
        sys.finish(save, { score: 66, rating: '灵阶', maxCombo: 5 } as never);
        expect(save.tianjie.todayBest).toBe(66);
        expect(save.tianjie.best).toBe(66);

        now += 86400000; // 次日
        const v = sys.view(save);
        expect(v.attemptsLeft).toBe(TIANJIE.attemptsPerDay);
        expect(v.todayBest).toBe(0);
        expect(v.best).toBe(66);
        expect(v.streak, '只打开不挑战 → 连续不推进').toBe(1);
        // 次日真正开打 → 连续 +1
        sys.start(save);
        expect(save.tianjie.streak).toBe(2);
    });

    it('连续天数只在「今天打了」时推进：断一天后重打归 1，最长连续只升不降', () => {
        const save = defaultSave();
        let now = NOW;
        const sys = new TianjieSystem(() => now);
        sys.start(save); // 第 1 天：首次开打 → 1
        expect(save.tianjie.streak).toBe(1);
        sys.start(save); // 同日再开一局不重复 +1
        expect(save.tianjie.streak).toBe(1);

        now += 86400000;
        sys.start(save); // 第 2 天且昨天有打 → 2
        expect(save.tianjie.streak).toBe(2);
        expect(save.tianjie.bestStreak).toBe(2);

        // 只打开入口页、不挑战：不算连续（否则「连续」会退化成「打开次数」）
        now += 86400000;
        sys.view(save);
        expect(save.tianjie.streak).toBe(2);

        now += 86400000; // 跳过第 4 天 → 断档
        sys.start(save);
        expect(save.tianjie.streak, '断档后重打从 1 起').toBe(1);
        expect(save.tianjie.bestStreak, '历史最长保留 2').toBe(2);
    });

    it('周榜：周最佳只升不降，跨周（周一）归零；周键编码 = 周一日期 × 1000 + 周最佳', () => {
        const save = defaultSave();
        let now = NOW; // 2026-10-22 周四
        const sys = new TianjieSystem(() => now);
        sys.start(save);
        sys.finish(save, { score: 58, rating: '灵阶', maxCombo: 5 } as never);
        expect(save.tianjie.weekKey).toBe('2026-10-19'); // 本周一
        expect(save.tianjie.weekBest).toBe(58);
        expect(sys.myWeekValue(save)).toBe(20261019 * 1000 + 58);

        // 同一周内低分局不覆盖周最佳
        sys.start(save);
        sys.finish(save, { score: 20, rating: '凡阶', maxCombo: 1 } as never);
        expect(save.tianjie.weekBest).toBe(58);

        // 跨到下周（10-26 周一）：周最佳归零、历史最高保留、周键翻新
        now = new Date(2026, 9, 26, 9, 0).getTime();
        const v = sys.view(save);
        expect(v.weekBest).toBe(0);
        expect(save.tianjie.best).toBe(58);
        expect(save.tianjie.weekKey).toBe('2026-10-26');
        expect(sys.myWeekValue(save)).toBe(20261026 * 1000);
    });

    it('结算只升不降：低分局不覆盖今日/历史最佳', () => {
        const save = defaultSave();
        const sys = new TianjieSystem(() => NOW);
        sys.start(save);
        const hi = sys.finish(save, { score: 80, rating: '仙阶', maxCombo: 9 } as never);
        expect(hi.newBest).toBe(true);
        sys.start(save);
        const lo = sys.finish(save, { score: 30, rating: '凡阶', maxCombo: 2 } as never);
        expect(lo.newBest).toBe(false);
        expect(lo.newTodayBest).toBe(false);
        expect(save.tianjie.best).toBe(80);
        expect(save.tianjie.todayBest).toBe(80);
    });

    it('结算页读到正确剩余次数', () => {
        const save = defaultSave();
        const sys = new TianjieSystem(() => NOW);
        sys.start(save);
        const r = sys.finish(save, { score: 50, rating: '灵阶', maxCombo: 4 } as never);
        expect(r.attemptsLeft).toBe(TIANJIE.attemptsPerDay - 1);
    });
});

describe('每日天劫：存档 v16 迁移', () => {
    const v15 = () => {
        const s: any = defaultSave();
        delete s.tianjie;
        s.version = 15;
        return s;
    };

    it('v15 → v16：补全零值 tianjie，不丢任何旧字段', () => {
        const old = v15();
        old.lingshi = 4321;
        old.realmIndex = 2;
        const m = migrate(old);
        expect(m.version).toBe(16);
        expect(m.lingshi).toBe(4321);
        expect(m.realmIndex).toBe(2);
        expect(m.tianjie).toEqual({
            day: '', hasDay: '', weekKey: '', weekBest: 0,
            attempts: 0, todayBest: 0, best: 0, streak: 0, bestStreak: 0, totalRuns: 0,
        });
    });

    it('脏档钳制：次数 ≤ 3、分数 0–100、todayBest ≤ best、非法日键清空', () => {
        const dirty: any = v15();
        dirty.tianjie = {
            day: 'not-a-date',
            attempts: 99,
            todayBest: 120,
            best: 55,
            streak: -5,
            bestStreak: 3,
            totalRuns: NaN,
        } as TianjieState;
        const m = migrate(dirty);
        expect(m.tianjie.day).toBe('');
        expect(m.tianjie.attempts).toBe(TIANJIE.attemptsPerDay);
        expect(m.tianjie.todayBest).toBeLessThanOrEqual(m.tianjie.best);
        expect(m.tianjie.best).toBeLessThanOrEqual(100);
        expect(m.tianjie.streak).toBe(0);
        expect(m.tianjie.bestStreak).toBeGreaterThanOrEqual(m.tianjie.streak);
        expect(m.tianjie.totalRuns).toBe(0);
    });

    it('未知版本（v17+）照旧重置为默认档', () => {
        const future: any = defaultSave();
        future.version = 17;
        future.lingshi = 9999;
        expect(migrate(future).lingshi).toBe(defaultSave().lingshi);
    });
});

describe('每日天劫：战报缓存与回访提示（M36 优化）', () => {
    class MemStorage {
        private m = new Map<string, string>();
        get(k: string): string | null { return this.m.has(k) ? this.m.get(k)! : null; }
        set(k: string, v: string): void { this.m.set(k, v); }
    }

    it('结算写战报（含词条/明细），可被下一个实例读出', () => {
        const store = new MemStorage();
        let now = NOW;
        const sys = new TianjieSystem(() => now, store);
        const save = defaultSave();
        const started = sys.start(save)!;
        sys.finish(save, { score: 61, rating: '灵阶', goldCount: 11, blueCount: 2, redCount: 1, maxCombo: 6 } as never);
        const r = sys.lastReport();
        expect(r).toBeTruthy();
        expect(r!.score).toBe(61);
        expect(r!.gold).toBe(11);
        expect(r!.mods.length).toBe(TIANJIE.modifierCount);
        expect(r!.day).toBe(dateKeyOf(now));
        // 新实例（模拟重启）仍能读到
        const sys2 = new TianjieSystem(() => now, store);
        expect(sys2.lastReport()!.score).toBe(61);
        expect(store.get(TIANJIE_REPORT_KEY)).toBeTruthy();
        void started;
    });

    it('storage 抛错时退化为内存，不影响结算', () => {
        const boom = {
            get(): string | null { throw new Error('quota'); },
            set(): void { throw new Error('quota'); },
        };
        const sys = new TianjieSystem(() => NOW, boom);
        const save = defaultSave();
        sys.start(save);
        expect(() => sys.finish(save, { score: 40, rating: '灵阶', goldCount: 5, blueCount: 0, redCount: 0, maxCombo: 3 } as never)).not.toThrow();
        expect(sys.lastReport()!.score).toBe(40);
    });

    it('脏战报解码：非法日期/负分/未知词条 → 安全回落或丢弃', () => {
        expect(decodeReport(null)).toBeNull();
        expect(decodeReport('not json')).toBeNull();
        expect(decodeReport(JSON.stringify({ d: 'bad', s: 10, m: [] }))).toBeNull();
        const r = decodeReport(JSON.stringify({ d: '2026-10-21', s: -5, g: 1e9, m: ['redRowGold', 'bogus', 42] }));
        expect(r).toBeTruthy();
        expect(r!.score).toBe(0);
        expect(r!.gold).toBe(999); // 钳到上限而不是巨大值
        expect(r!.mods).toEqual(['redRowGold']); // 未知 id 丢弃
        // encode/decode 往返
        const src = { day: '2026-10-21', score: 77, rating: '仙阶', gold: 12, blue: 1, red: 0, maxCombo: 9, mods: ['swiftTide'], newBest: true, at: 1 };
        expect(decodeReport(encodeReport(src))).toEqual(src);
    });

    it('shouldNudge：今日未打且有历史战报 → true；今日打过 / 无战报 → false', () => {
        const store = new MemStorage();
        let now = NOW;
        const sys = new TianjieSystem(() => now, store);
        const save = defaultSave();
        expect(sys.shouldNudge(save), '没有战报不应提示').toBe(false);

        sys.start(save);
        sys.finish(save, { score: 55, rating: '灵阶', goldCount: 9, blueCount: 0, redCount: 0, maxCombo: 5 } as never);
        expect(sys.shouldNudge(save), '今天已打不应提示').toBe(false);

        now += 86400000; // 次日：未打 + 昨日有战报
        expect(sys.shouldNudge(save)).toBe(true);

        sys.start(save); // 今天打了
        expect(sys.shouldNudge(save)).toBe(false);
    });

    it('词条池 v2：12 条、id 唯一，且每日仍至少一条福利', () => {
        expect(MODIFIERS.length).toBe(12);
        expect(new Set(MODIFIERS.map((m) => m.id)).size).toBe(12);
        for (let d = 1; d <= 28; d += 1) {
            const key = `2026-12-${String(d).padStart(2, '0')}`;
            expect(dailyModifiers(key).some((m) => m.scoreMult >= 1)).toBe(true);
        }
        expect(MODIFIER_POOL_VERSION).toBe(2);
    });

    it('「清雨易碎」：清雨权重被压低但不为 0（与 noBlue 语义分离）', () => {
        const mods = MODIFIERS.filter((m) => m.id === 'fragileCalm');
        const rs = new RainSystem(new Rng(3));
        const s = rs.createSession(1, false, 'tianjie', undefined, false, mods);
        for (let i = 0; i < 400 && !s.finished; i += 1) rs.tick(s, 0.02, 0);
        // 清雨权重 ×0.5 后仍可能出现（不是 0），但期望显著少于常规日
        expect(mods[0].blueWeightMult).toBe(0.5);
    });
});

describe('每日天劫：词条互斥（M36 优化）', () => {
    it('同一天不会同时出现语义冲突的清雨词条（面板不得说谎）', () => {
        for (let d = 1; d <= 60; d += 1) {
            const base = new Date(2026, 9, 22 + d);
            const key = dateKeyOf(base.getTime());
            const mods = dailyModifiers(key);
            const blue = mods.filter((m) => m.conflict === 'blue');
            expect(blue.length, `${key} 出现了 ${blue.map((m) => m.id).join('+')}`).toBeLessThanOrEqual(1);
        }
    });

    it('互斥过滤后每日仍凑满 3 条、id 唯一、至少一条福利', () => {
        for (let d = 0; d < 60; d += 1) {
            const key = dateKeyOf(new Date(2026, 10, 1 + d).getTime());
            const mods = dailyModifiers(key);
            expect(mods).toHaveLength(TIANJIE.modifierCount);
            expect(new Set(mods.map((m) => m.id)).size).toBe(mods.length);
            expect(mods.some((m) => m.scoreMult >= 1)).toBe(true);
        }
    });

    it('同日同词条仍确定（互斥不引入随机差异）', () => {
        const a = dailyModifiers('2026-12-25').map((m) => m.id);
        const b = dailyModifiers('2026-12-25').map((m) => m.id);
        expect(a).toEqual(b);
    });
});
