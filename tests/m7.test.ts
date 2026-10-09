import { describe, expect, it } from 'vitest';
import { Rng } from '../assets/scripts/core/rng';
import { defaultSave, SaveData } from '../assets/scripts/core/saveModel';
import { EconomySystem } from '../assets/scripts/core/systems/EconomySystem';
import { BoxSystem } from '../assets/scripts/core/systems/BoxSystem';
import { RealmSystem } from '../assets/scripts/core/systems/RealmSystem';
import { RainSession, RainSystem, RAIN_FIELD } from '../assets/scripts/core/systems/RainSystem';
import {
    comboBonus,
    COMBO_BONUS_MAX,
    MAGNET_CATCH_MULT,
    RAIN_WAVES,
    RED_ROW_GAP,
    judgeRating,
    judgeScore,
    waveAt,
} from '../assets/scripts/core/config/drops';
import { RESONATE_MULT } from '../assets/scripts/core/config/boxes';

function makeSave(): SaveData {
    return defaultSave();
}

/**
 * 「非首战」存档。首战保护（#49 A3）会把新号首次冲击练气的 `computeFinalRate(1, …)`
 * 短路成 1；测**基础公式/边界夹取**的用例需要绕过它，标记一次既有失败即可。
 */
function veteranSave(): SaveData {
    const s = defaultSave();
    s.stats.breakthroughFails = 1;
    return s;
}

function makeBox(save: SaveData, rng: Rng) {
    const eco = new EconomySystem(save);
    return { box: new BoxSystem(save, eco, rng), eco };
}

describe('M7 灵气雨：三波编排（数值假设 #22）', () => {
    it('waveAt：按已进行时间切波', () => {
        expect(waveAt(0)).toBe(RAIN_WAVES[0]);
        expect(waveAt(2.9)).toBe(RAIN_WAVES[0]);
        expect(waveAt(3.0)).toBe(RAIN_WAVES[1]);
        expect(waveAt(5.5)).toBe(RAIN_WAVES[2]);
        expect(waveAt(7.9)).toBe(RAIN_WAVES[2]);
    });

    it('tick 驱动 elapsed，各波按速率生成（固定种子，区间断言防回归）', () => {
        const rs = new RainSystem(new Rng(11));
        const s = rs.createSession(1, false);
        for (let i = 0; i < 30; i++) rs.tick(s, 0.1, 0); // 3.0s：全在波①
        const wave1Drops = s.drops.length;
        expect(s.elapsed).toBeCloseTo(3.0, 6);
        expect(wave1Drops).toBeGreaterThanOrEqual(5);   // 2.2/s × 3s ≈ 6.6（含拾取移除，只多不少）
        expect(wave1Drops).toBeLessThanOrEqual(8);
        for (let i = 0; i < 25; i++) rs.tick(s, 0.1, 0); // +2.5s：波② 4.2/s
        // 波②生成 ≈10.5 事件，但尾部雨滴已进入拾取带被移除，用宽松下界
        expect(s.drops.length).toBeGreaterThanOrEqual(wave1Drops + 5);
    });

    it('波③成排劫雨：同排同速，且恒保留一条 RED_ROW_GAP 安全缝', () => {
        const rs = new RainSystem(new Rng(42));
        const s = rs.createSession(5, false); // 化神目标，动态难度最高
        s.elapsed = RAIN_WAVES[2].startAt;    // 直接入波③
        const rows: Record<number, RainSession['drops']> = {};
        for (let i = 0; i < 400; i++) {
            const before = s.drops.length;
            rs.tick(s, 1 / 60, 0);
            for (let j = before; j < s.drops.length; j++) {
                const d = s.drops[j];
                if (d.type !== 'red') continue;
                (rows[d.vy] ??= []).push(d);
            }
        }
        const rowList = Object.values(rows).filter((r) => r.length >= 2);
        expect(rowList.length).toBeGreaterThan(0); // 确有成排生成
        for (const row of rowList) {
            const vy = row[0].vy;
            expect(row.every((d) => d.vy === vy)).toBe(true);        // 同排同速
            const xs = [RAIN_FIELD.xMin, ...row.map((d) => d.x).sort((a, b) => a - b), RAIN_FIELD.xMax];
            let maxGap = 0;
            for (let i = 1; i < xs.length; i++) maxGap = Math.max(maxGap, xs[i] - xs[i - 1]);
            expect(maxGap).toBeGreaterThanOrEqual(RED_ROW_GAP);      // 至少一条可穿越安全缝
        }
    });
});

describe('M7 灵气雨：连击（数值假设 #24）', () => {
    it('comboBonus 边界：每 3 连击 +0.5%，上限 3%', () => {
        expect(comboBonus(0)).toBe(0);
        expect(comboBonus(2)).toBe(0);
        expect(comboBonus(3)).toBeCloseTo(0.005, 10);
        expect(comboBonus(9)).toBeCloseTo(0.015, 10);
        expect(comboBonus(18)).toBeCloseTo(COMBO_BONUS_MAX, 10);
        expect(comboBonus(99)).toBeCloseTo(COMBO_BONUS_MAX, 10);
        expect(comboBonus(-5)).toBe(0);
    });

    it('拾金/蓝连击 +1，拾劫雨清零；最大连击保留峰值', () => {
        const rs = new RainSystem(new Rng(7));
        const s = rs.createSession(1, false);
        rs['applyCatch'](s, 'gold');
        rs['applyCatch'](s, 'blue');
        expect(s.combo).toBe(2);
        rs['applyCatch'](s, 'gold');
        expect(s.maxCombo).toBe(3);
        rs['applyCatch'](s, 'red');
        expect(s.combo).toBe(0);
        expect(s.maxCombo).toBe(3);
    });

    it('漏接金雨清零连击；漏接蓝雨不清零', () => {
        const rs = new RainSystem(new Rng(7));
        const s = rs.createSession(1, false);
        rs['applyCatch'](s, 'gold');
        rs['applyCatch'](s, 'gold');
        expect(s.combo).toBe(2);
        // 金雨落在远离玩家处 → 漏接
        s.drops.push({ id: 999, type: 'gold', x: 300, y: 600, vy: 4000, radius: 22, dead: false });
        rs.tick(s, 0.4, 0);
        expect(s.combo).toBe(0);
        rs['applyCatch'](s, 'blue');
        rs['applyCatch'](s, 'blue');
        expect(s.combo).toBe(2);
        s.drops.push({ id: 998, type: 'blue', x: 300, y: 600, vy: 4000, radius: 22, dead: false });
        rs.tick(s, 0.4, 0);
        expect(s.combo).toBe(2); // 蓝雨漏接不清零
    });
});

describe('M7 灵气雨：聚灵咒（数值假设 #25）', () => {
    it('单局 1 次；生效期磁吸半径 ×2 可拾取远处金雨', () => {
        const rs = new RainSystem(new Rng(7));
        const s = rs.createSession(1, false);
        expect(rs.useMagnet(s)).toBe(true);
        expect(rs.useMagnet(s)).toBe(false);
        expect(s.magnetTimeLeft).toBeCloseTo(2.5, 6);
        // x=130 超出基础 catchX(70)，磁吸后 140 覆盖
        s.drops.push({ id: 1, type: 'gold', x: 130, y: RAIN_FIELD.playerY, vy: 0, radius: 22, dead: false });
        rs.tick(s, 1 / 60, 0);
        expect(s.goldCount).toBe(1);
        // 无磁吸时同位置拾取不到
        const s2 = rs.createSession(1, false);
        s2.drops.push({ id: 1, type: 'gold', x: RAIN_FIELD.catchX + 10, y: RAIN_FIELD.playerY, vy: 0, radius: 22, dead: false });
        rs.tick(s2, 1 / 60, 0);
        expect(s2.goldCount).toBe(0);
        expect(MAGNET_CATCH_MULT).toBe(2);
    });
});

describe('M7 渡劫评分（数值假设 #26）', () => {
    it('judgeScore 公式与 0–100 夹取', () => {
        expect(judgeScore(15, 15, 4, 0)).toBe(79);   // 45+30+4
        expect(judgeScore(13, 16, 7, 4)).toBe(70);   // 39+32+7-8
        expect(judgeScore(0, 0, 0, 50)).toBe(0);
        expect(judgeScore(40, 30, 20, 0)).toBe(100); // 上限夹取
        expect(judgeScore(0, 0, 0, 0)).toBe(0);
    });

    it('finish() 汇总评分/最大连击/连击加成', () => {
        const rs = new RainSystem(new Rng(7));
        const s = rs.createSession(1, false);
        for (let i = 0; i < 5; i++) rs['applyCatch'](s, 'gold');
        rs['applyCatch'](s, 'blue');
        rs['applyCatch'](s, 'red');
        const r = rs.finish(s);
        expect(r.maxCombo).toBe(6); // 金×5 + 蓝×1 的峰值
        expect(r.comboBonus).toBeCloseTo(0.01, 10); // floor(6/3) × 0.5%
        expect(r.score).toBe(judgeScore(r.goldCount, 6, r.blueCount, r.redCount));
        expect(r.rating).toBe(judgeRating(r.score));
        expect(s.finished).toBe(true);
    });

    it('连击加成进入最终成功率并被边界夹取', () => {
        const realm = new RealmSystem(veteranSave(), new EconomySystem(veteranSave()), new Rng(1));
        const base = realm.computeFinalRate(1, 0, 0, false);
        const withCombo = realm.computeFinalRate(1, 0, 0, false, 0.03);
        expect(withCombo).toBeCloseTo(base + 0.03, 10);
        expect(realm.computeFinalRate(1, 99, 0, false, 0.03)).toBe(0.95); // 仍不越上界
    });
});

describe('M7 开箱：灵气共鸣（数值假设 #20）', () => {
    it('共鸣放大正向灵石/修为/碎片 ×1.15，机缘不变；保底与统计口径不受影响', () => {
        // 同种子两次开箱：无共鸣 vs 共鸣，逐项对照（种子 8 → 修真宝盒稀有档；需练气解锁）
        const run = (resonate: boolean) => {
            const save = makeSave();
            save.lingshi = 100000;
            save.realmIndex = 1;
            const { box } = makeBox(save, new Rng(8));
            const r = box.open('xiuzhen', { resonate });
            return { save, r };
        };
        const a = run(false);
        const b = run(true);
        expect(a.r.tier).toBe('rare');
        expect(b.r.tier).toBe(a.r.tier);
        expect(a.r.rewards.length).toBe(b.r.rewards.length);
        for (let i = 0; i < a.r.rewards.length; i++) {
            const x = a.r.rewards[i];
            const y = b.r.rewards[i];
            expect(x.kind).toBe(y.kind);
            if (y.kind === 'jiyuan') {
                expect(y.amount).toBe(x.amount); // 机缘不放大
            } else if (x.amount > 0) {
                expect(y.amount).toBe(Math.ceil(x.amount * RESONATE_MULT));
            }
        }
        expect(b.save.pityCount).toBe(a.save.pityCount);
        expect(b.save.stats.opens).toBe(a.save.stats.opens);
        expect(b.r.resonated).toBe(true);
        expect(a.r.resonated).toBe(false);
    });

    it('劫难扣减不被共鸣放大', () => {
        // 固定 float=0.01 → 必走劫难档；扣减比例由同一常量推导，两跑一致
        const stub = () => {
            const rng = new Rng(1);
            (rng as unknown as { float: () => number }).float = () => 0.01;
            return rng;
        };
        const run = (resonate: boolean) => {
            const save = makeSave();
            save.lingshi = 100000;
            save.xiuwei = 1000;
            const { box } = makeBox(save, stub());
            const r = box.open('fansu', { resonate });
            return { r };
        };
        const a = run(false);
        const b = run(true);
        expect(a.r.tier).toBe('disaster');
        expect(b.r.tier).toBe('disaster');
        expect(a.r.rewards[0].amount).toBe(b.r.rewards[0].amount); // 扣减一致
        expect(b.r.resonated).toBe(false);
    });
});

describe('M7 开箱：圆满三连（数值假设 #21）', () => {
    it('追加灵石 = 箱费 ×6% ×层数；不计保底、不计 opens', () => {
        const save = makeSave();
        save.lingshi = 10000;
        const { box, eco } = makeBox(save, new Rng(5));
        const before = { pity: save.pityCount, opens: save.stats.opens, ls: eco.lingshi };
        const items = box.grantTripleBonus('fansu', 2);
        expect(items.map((i) => i.kind)).toEqual(['lingshi']);
        expect(eco.lingshi - before.ls).toBe(6); // 50 × 0.06 × 2
        expect(save.pityCount).toBe(before.pity);
        expect(save.stats.opens).toBe(before.opens);
    });

    it('3 层全中额外追加 1 枚碎片；0 层无产出', () => {
        const save = makeSave();
        save.lingshi = 10000;
        const { box } = makeBox(save, new Rng(5));
        const items = box.grantTripleBonus('xiuzhen', 3);
        expect(items.map((i) => i.kind)).toEqual(['lingshi', 'fragment']);
        expect(items[0].amount).toBe(36); // 200 × 6% × 3 层
        const fragId = items[1].lingengId!;
        expect(save.fragments[fragId]).toBeGreaterThanOrEqual(1);
        expect(box.grantTripleBonus('fansu', 0)).toEqual([]);
    });
});
