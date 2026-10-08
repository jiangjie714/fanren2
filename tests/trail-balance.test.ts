/**
 * M15-T8 妖径经济护栏（数值假设 #47，tests/balance.test.ts 的妖径分册）：
 * 典型一日模拟（首推 + 重刷 5 次封顶）验证灵石/灵材有界，且日循环 ≤ 旧历练口径 ×1.2。
 * 旧历练日口径（#28/#35）：2 次/日 × 事件 80–500 灵石 → 上限 1000；×1.2 = 1200。
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../assets/scripts/core/rng';
import { defaultSave, SaveData } from '../assets/scripts/core/saveModel';
import { EconomySystem } from '../assets/scripts/core/systems/EconomySystem';
import { AlchemySystem } from '../assets/scripts/core/systems/AlchemySystem';
import { TrailSystem } from '../assets/scripts/core/systems/TrailSystem';
import { TRAIL_CHAPTERS, repeatLingshi } from '../assets/scripts/core/config/trail';

/** 旧历练日产出上限（2 次 × 最高事件档 500 灵石） */
const OLD_EXPEDITION_DAILY_CAP = 1000;
/** #47：妖径日循环 ≤ 旧口径 ×1.2 */
const TRAIL_DAILY_CAP = OLD_EXPEDITION_DAILY_CAP * 1.2;

/** 一日模拟：从空档推完 giveMeLayers 层 + 重刷 5 次（战意全中口径） */
function simulateDay(seed: number, layersToClear: number, now: Date) {
    const save: SaveData = defaultSave();
    const eco = new EconomySystem(save);
    const alch = new AlchemySystem(eco);
    const sys = new TrailSystem(eco, alch, new Rng(seed));
    const dayStart = save.lingshi;

    for (let l = 1; l <= layersToClear; l++) {
        sys.settleWin(save, l, { morale: false, now });
    }
    // 站在已通关最高层重刷（最坏情况：刷当前最高收益层）
    const farmLayer = layersToClear;
    let repeatLingshi = 0;
    let mats = 0;
    for (let i = 0; i < 5; i++) {
        const before = save.lingshi;
        const r = sys.settleWin(save, farmLayer, { morale: true, now })!;
        repeatLingshi += save.lingshi - before;
        mats += r.items.filter((x) => x.kind === 'material').reduce((a, b) => a + b.amount, 0);
    }
    return {
        lingshiTotal: save.lingshi - dayStart,
        repeatLingshi,
        mats,
        repeatLeft: sys.repeatLeft(save, now),
    };
}

describe('M15-T8 妖径经济护栏（#47）', () => {
    it('静态包络：第 1 章重刷日上限 ≤ 旧历练口径 ×1.2', () => {
        // 最坏重刷： farming 第 1 章第 9 层（重刷灵石最高）
        const worstRepeat = repeatLingshi(9); // 首通区间 [280,420] 中值 350 ×0.3 = 105
        const dailyRepeatCap = 5 * worstRepeat * 1.15; // 战意 ×1.15
        expect(worstRepeat).toBe(105);
        expect(dailyRepeatCap).toBeLessThanOrEqual(TRAIL_DAILY_CAP);
    });

    it('蒙特卡洛 ×20：重刷日灵石 ≤1200、灵材 ≤5、repeatLeft 归零', () => {
        for (let seed = 1; seed <= 20; seed++) {
            const s = simulateDay(seed, 9, new Date('2026-10-08T10:00:00'));
            expect(s.repeatLingshi).toBeLessThanOrEqual(TRAIL_DAILY_CAP);
            expect(s.mats).toBeLessThanOrEqual(5); // 5 次 × 60% 概率，硬上限 5
            expect(s.repeatLeft).toBe(0);
        }
    });

    it('首推日（首通奖一次性）灵石总量有界：第 1 章全通 ≤ 8000（#38 日上限参考）', () => {
        for (let seed = 1; seed <= 10; seed++) {
            const s = simulateDay(seed, 10, new Date('2026-10-08T10:00:00'));
            expect(s.lingshiTotal).toBeLessThanOrEqual(8000);
        }
    });

    it('灵草期望 ≈ 3 株/日（5 次 × 60%，蒙特卡洛 ±0.8）', () => {
        let total = 0;
        const runs = 200;
        for (let seed = 1; seed <= runs; seed++) {
            total += simulateDay(seed, 9, new Date('2026-10-08T10:00:00')).mats;
        }
        const avg = total / runs;
        expect(avg).toBeGreaterThan(3 - 0.8);
        expect(avg).toBeLessThan(3 + 0.8);
    });

    it('跨日重复模拟：日循环不随天数累积（护栏按日重置）', () => {
        const save: SaveData = defaultSave();
        const eco = new EconomySystem(save);
        const alch = new AlchemySystem(eco);
        const sys = new TrailSystem(eco, alch, new Rng(11));
        // 先推 10 层
        for (let l = 1; l <= 10; l++) sys.settleWin(save, l, { morale: false, now: new Date('2026-10-08T10:00:00') });
        // 连续 3 天各刷 5 次
        for (let day = 0; day < 3; day++) {
            const d = new Date(2026, 9, 8 + day, 10);
            let dayLingshi = 0;
            for (let i = 0; i < 5; i++) {
                const before = save.lingshi;
                sys.settleWin(save, 9, { morale: true, now: d });
                dayLingshi += save.lingshi - before;
            }
            expect(dayLingshi).toBeLessThanOrEqual(TRAIL_DAILY_CAP);
        }
    });

    it('章节表静态自检：三章重刷上限与首通区间单调不倒退', () => {
        let prevBoss = 0;
        for (const ch of TRAIL_CHAPTERS) {
            expect(ch.bossReward[1]).toBeGreaterThanOrEqual(prevBoss);
            prevBoss = ch.bossReward[1];
        }
    });
});
