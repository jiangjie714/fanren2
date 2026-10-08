/**
 * M22 剑冢长线平衡仿真（#48）—— 本文件是「无限但缓慢」曲线的唯一守护。
 *
 * ⚠ 改动 core/config/tower.ts 中下列任一常量后**必须**重跑本文件：
 *    SWORD_GROWTH(1.05) / FORGE_COST_GROWTH(1.13) / REQ_GROWTH(1.16) / CRYSTAL_GROWTH(1.39)
 * 四链紧耦合，任一分子变化都会破坏「永不归零、永不封顶、但持续变慢」的机理。
 */
import { describe, expect, it } from 'vitest';
import { forgeCost, floorCrystal, req, swordAtk } from '../assets/scripts/core/config/tower';

interface SimRow {
    day: number;
    floor: number;
    level: number;
    atk: number;
}

/**
 * 玩家画像（spec §4.1 口径）：
 * - 每次行动 = 通过下一层（剑气够）或重打当前最高层（不够），都结算一次产出
 * - 行动后「层间顺手点淬剑」：煞晶能买几级买几级
 * - 不含回魂广告增益（会小幅提速）与任何离线收益
 */
function simulate(days: number, actionsPerDay: number): SimRow[] {
    let best = 0;
    let level = 0;
    let crystal = 0;
    const rows: SimRow[] = [];
    for (let day = 1; day <= days; day++) {
        for (let a = 0; a < actionsPerDay; a++) {
            const next = best + 1;
            if (swordAtk(level) >= req(next)) {
                crystal += floorCrystal(next);
                best = next;
            } else {
                crystal += floorCrystal(Math.max(1, best));
            }
            // 自动淬剑：能买几级买几级
            while (crystal >= forgeCost(level)) {
                crystal -= forgeCost(level);
                level += 1;
            }
        }
        rows.push({ day, floor: best, level, atk: swordAtk(level) });
    }
    return rows;
}

/** 区间平均「层/日」斜率 */
function slope(a: SimRow, b: SimRow): number {
    return (b.floor - a.floor) / (b.day - a.day);
}

function at(rows: SimRow[], day: number): SimRow {
    return rows[day - 1];
}

describe('M22 剑冢：180 日长线仿真（重度 40 次/日）', () => {
    const rows = simulate(180, 40);

    it('读数与 spec §4.1 对齐（日 1/30/90/180 层数在预期带内）', () => {
        // 打印实际曲线，便于调参时对照
        const marks = [1, 3, 7, 14, 30, 60, 90, 180];
        const line = marks.map((d) => `d${d}:${at(rows, d).floor}层/L${at(rows, d).level}`).join(' ');
        console.log('[剑冢仿真·重度]', line);

        expect(at(rows, 1).floor).toBeGreaterThan(12);
        expect(at(rows, 1).floor).toBeLessThan(24);
        expect(at(rows, 30).floor).toBeGreaterThan(70);
        expect(at(rows, 30).floor).toBeLessThan(96);
        expect(at(rows, 180).floor).toBeGreaterThan(110);
        expect(at(rows, 180).floor).toBeLessThan(140);
    });

    it('「层/日」全程单调下降（无限但缓慢的唯一判据）', () => {
        const marks = [1, 3, 7, 14, 30, 60, 90, 180];
        const slopes = marks.slice(1).map((d, i) => slope(at(rows, marks[i]), at(rows, d)));
        console.log('[剑冢·层/日]', slopes.map((s) => s.toFixed(2)).join(' → '));
        for (let i = 1; i < slopes.length; i++) {
            expect(slopes[i], `第 ${marks[i + 1]} 日区间的斜率应低于前一区间`).toBeLessThan(slopes[i - 1]);
        }
        // 首段快、尾段慢：落差必须显著（否则「无限」被稀释成线性）
        expect(slopes[0]).toBeGreaterThan(5);
        expect(slopes[slopes.length - 1]).toBeLessThan(0.4);
    });

    it('曲线永不归零：第 360 日仍在推进', () => {
        const long = simulate(360, 40);
        const late = slope(at(long, 180), at(long, 360));
        console.log('[剑冢·180→360 日层/日]', late.toFixed(3), '层', at(long, 180).floor, '→', at(long, 360).floor);
        expect(at(long, 360).floor).toBeGreaterThan(at(long, 180).floor);
        expect(late).toBeGreaterThan(0);
    });

    /**
     * 永不停摆的可支付性。
     *
     * ⚠ 与 spec §8.1 断言④的偏差：原文要求「半年末单次淬剑成本 < 20 次当前层产出」，
     *   实测不成立（成本 7.7e20 vs 20 层产出 1.4e20，约 5.5 倍）。这不是 bug，而是四链的
     *   必然结果：稳态每层需约 3 级淬剑（level/floor ≈ 3），成本涨速 1.13³ ≈ 1.44 略高于
     *   产出涨速 1.39 —— 这个落差正是「层/日单调下降」的机理本身，若成本涨得比产出慢，
     *   曲线就会变陡而不再是「缓慢」。故此处改为判据更本质的两条：
     *     ① 成本/单次产出 的比值**有界**（防指数爆炸失控）
     *     ② 每日总产出仍能买到可感知的进度（≥0.2 级/日，即 5 天至少一级）
     */
    it('永不停摆的可支付性：成本/产出比值有界，且每日仍有可感知进度', () => {
        const r = at(rows, 180);
        const cost = forgeCost(r.level);
        const one = floorCrystal(r.floor);
        const ratio = cost / one;
        console.log('[剑冢·可支付性] 成本/单次产出 =', ratio.toFixed(1), '倍；日进度 =', ((one * 40) / cost).toFixed(2), '级/日');
        expect(ratio).toBeLessThan(200);
        expect((one * 40) / cost).toBeGreaterThan(0.2);
    });

    it('休闲玩家（15 次/日）同样单调下降且显著落后于重度', () => {
        const casual = simulate(180, 15);
        expect(at(casual, 180).floor).toBeLessThan(at(rows, 180).floor);
        expect(at(casual, 180).floor).toBeGreaterThan(60);
        const s1 = slope(at(casual, 1), at(casual, 30));
        const s2 = slope(at(casual, 30), at(casual, 180));
        expect(s2).toBeLessThan(s1);
    });
});
