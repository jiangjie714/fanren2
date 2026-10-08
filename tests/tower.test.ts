import { describe, expect, it } from 'vitest';
import {
    CRYSTAL_GROWTH,
    FORGE_COST_GROWTH,
    REQ_GROWTH,
    SWORD_GROWTH,
    floorCrystal,
    forgeCost,
    milestonesCrossed,
    minAtkFor,
    monsterHp,
    req,
    reviveMult,
    simulateFloor,
    startFloor,
    swordAtk,
} from '../assets/scripts/core/config/tower';
import { formatCompact } from '../assets/scripts/core/bignum';
import { TowerSystem } from '../assets/scripts/core/systems/TowerSystem';
import { defaultSave, migrate, SaveData } from '../assets/scripts/core/saveModel';

describe('M22 剑冢：四条链单调性与无封顶', () => {
    it('剑气 ×1.05/级、成本 ×1.13、层需求 ×1.16、煞晶 ×1.39', () => {
        expect(SWORD_GROWTH).toBeCloseTo(1.05, 10);
        expect(FORGE_COST_GROWTH).toBeCloseTo(1.13, 10);
        expect(REQ_GROWTH).toBeCloseTo(1.16, 10);
        expect(CRYSTAL_GROWTH).toBeCloseTo(1.39, 10);
    });

    it('四条链各自严格递增且无封顶常量', () => {
        for (let n = 0; n < 60; n++) {
            expect(swordAtk(n + 1)).toBeGreaterThan(swordAtk(n));
            expect(forgeCost(n + 1)).toBeGreaterThan(forgeCost(n));
            expect(req(n + 2)).toBeGreaterThan(req(n + 1));
            expect(floorCrystal(n + 2)).toBeGreaterThan(floorCrystal(n + 1));
        }
        // 无封顶：任意大等级仍在增长（不出现平台）
        expect(swordAtk(2000)).toBeGreaterThan(swordAtk(1000));
        expect(forgeCost(2000)).toBeGreaterThan(forgeCost(1000));
    });

    it('首层基准：剑气 10 / 层需求 8 / 煞晶 25 / 妖血 120', () => {
        expect(swordAtk(0)).toBeCloseTo(10, 6);
        expect(req(1)).toBeCloseTo(8, 6);
        expect(floorCrystal(1)).toBe(25);
        expect(monsterHp(1)).toBeCloseTo(120, 6);
    });

    it('推一层需涨 16% 剑气 = 4 次淬剑（1.05⁴ > 1.16）', () => {
        expect(Math.ceil(Math.log(1.16) / Math.log(1.05))).toBe(4);
        // 4 次淬剑的成本涨 1.13⁴ ≈ 1.63，同期一层产出只涨 1.39 → 落差即「层/日衰减」的机理
        expect(Math.pow(1.13, 4)).toBeGreaterThan(1.39);
    });
});

describe('M22 剑冢：一层战斗门槛（spec §4.2）', () => {
    it('门槛剑气下零打断恒败、打断 1 次刚好过（不操作就是过不去）', () => {
        for (const f of [1, 10, 50]) {
            const x = req(f);
            expect(simulateFloor(x, f, 0).win, `层 ${f} 零打断应败`).toBe(false);
            expect(simulateFloor(x, f, 1).win, `层 ${f} 打断 1 次应过`).toBe(true);
            // 技巧红利：全打断时 0.8 倍门槛即可过
            expect(simulateFloor(x * 0.8, f, 2).win, `层 ${f} 全打断 0.8x 应过`).toBe(true);
            expect(simulateFloor(x * 0.8, f, 0).win).toBe(false);
        }
    });

    it('门槛自洽：打断 1 次 ≈ 1.00、全打断 ≈ 0.80（技巧红利约 20%）', () => {
        const f = 30;
        const base = req(f);
        const x1 = minAtkFor(f, 1) / base;
        const x2 = minAtkFor(f, 2) / base;
        expect(x1).toBeGreaterThan(0.97);
        expect(x1).toBeLessThan(1.03);
        expect(x2).toBeGreaterThan(0.77);
        expect(x2).toBeLessThan(0.83);
        // 技巧红利有界：约 20% 层进度，不会破坏主线经济
        expect(x2 / x1).toBeGreaterThan(0.76);
        expect(x2 / x1).toBeLessThan(0.86);
    });

    it('19× 剑气 ≥ 15req 的解析式与模拟一致（全打断档）', () => {
        const f = 20;
        const need = (15 * req(f)) / 19;
        expect(simulateFloor(need * 1.02, f, 2).win).toBe(true);
        expect(simulateFloor(need * 0.97, f, 2).win).toBe(false);
    });

    it('剑罡归零也算失败，且时间不超过 15s', () => {
        const r = simulateFloor(req(5) * 0.1, 5, 1);
        expect(r.win).toBe(false);
        expect(r.timeSec).toBeLessThanOrEqual(15);
        expect(r.gang).toBeGreaterThanOrEqual(0);
    });
});

describe('M22 剑冢：局（run）与回魂', () => {
    it('起手层 = max(1, best − 4)', () => {
        expect(startFloor(1)).toBe(1);
        expect(startFloor(5)).toBe(1);
        expect(startFloor(6)).toBe(2);
        expect(startFloor(50)).toBe(46);
    });

    it('回魂增益乘算叠加，上限 3 次 ≈ 1.953', () => {
        expect(reviveMult(0)).toBeCloseTo(1, 9);
        expect(reviveMult(1)).toBeCloseTo(1.25, 9);
        expect(reviveMult(2)).toBeCloseTo(1.5625, 9);
        expect(reviveMult(3)).toBeCloseTo(1.953125, 9);
        expect(reviveMult(9)).toBeCloseTo(1.953125, 9); // 超限钳制
    });
});

describe('M22 剑冢：主线回灌里程碑', () => {
    it('只统计本局新跨越的 10 的倍数层', () => {
        expect(milestonesCrossed(0, 10)).toBe(1);
        expect(milestonesCrossed(10, 19)).toBe(0);
        expect(milestonesCrossed(10, 20)).toBe(1);
        expect(milestonesCrossed(1, 30)).toBe(3);
        expect(milestonesCrossed(30, 30)).toBe(0);
    });
});

describe('M22 剑冢：淬剑与局状态机（TowerSystem）', () => {
    function save(): SaveData {
        const s = defaultSave();
        s.tower = { best: 1, swordLevel: 0, crystal: 0, daily: { day: '', lingshi: 0, mats: 0, xiuwei: 0 } };
        return s;
    }

    it('淬剑：扣煞晶升等级，剑气与成本同步派生', () => {
        const s = save();
        const sys = new TowerSystem();
        s.tower.crystal = 1000;
        expect(sys.atk(s)).toBeCloseTo(10, 6);
        expect(sys.costOf(s)).toBe(20);
        const n = sys.forge(s, 1);
        expect(n).toBe(1);
        expect(s.tower.swordLevel).toBe(1);
        expect(s.tower.crystal).toBe(980);
        expect(sys.atk(s)).toBeCloseTo(10 * 1.05, 6);
        expect(sys.costOf(s)).toBe(Math.round(20 * 1.13));
    });

    it('淬 ×10 / 满：煞晶不足时只买得起的部分', () => {
        const s = save();
        const sys = new TowerSystem();
        s.tower.crystal = 300;
        const n = sys.forge(s, 'max');
        expect(n).toBeGreaterThan(1);
        expect(s.tower.crystal).toBeGreaterThanOrEqual(0);
        expect(s.tower.crystal).toBeLessThan(sys.costOf(s)); // 剩余必定买不起下一级
        // 再淬 10 级：余额不足 1 级 → 0
        expect(sys.forge(s, 10)).toBe(0);
    });

    it('affordableLevels 与实际淬剑一致', () => {
        const s = save();
        const sys = new TowerSystem();
        s.tower.crystal = 5000;
        const k = sys.affordableLevels(s);
        expect(sys.forge(s, k)).toBe(k);
        expect(sys.affordableLevels(s)).toBe(0);
    });

    it('局：起手层 best−4，连胜推进，回魂上限 3 次且增益叠加', () => {
        const s = save();
        const sys = new TowerSystem();
        s.tower.best = 20;
        const run = sys.startRun(s);
        expect(run.floor).toBe(16);
        const baseAtk = run.atkOf(s.tower.swordLevel);
        run.win();
        expect(run.floor).toBe(17);
        expect(run.deepest).toBe(16);
        expect(run.crystal).toBe(floorCrystal(16));
        expect(run.revive()).toBe(true);
        expect(run.atkOf(s.tower.swordLevel)).toBeCloseTo(baseAtk * 1.25, 6);
        run.win();
        run.win();
        expect(run.canRevive()).toBe(true);
        run.revive();
        run.revive();
        expect(run.revives).toBe(3);
        expect(run.canRevive()).toBe(false);
        expect(sys.startRun(s).floor).toBe(16);
    });

    it('收兵：煞晶入账、best 只升不降、主线回灌按最深层', () => {
        const s = save();
        const sys = new TowerSystem();
        const run = sys.startRun(s);
        run.win(); // 层 1 通 → crystal = 25
        run.win(); // 层 2 通
        const g = sys.settle(s, run);
        expect(s.tower.crystal).toBe(25 + floorCrystal(2));
        expect(s.tower.best).toBe(2);
        expect(g.newBest).toBe(true);
        // 依赖未注入（无 eco/alch）时只推进进度，不发放主线资源
        expect(g.lingshi).toBe(8);
        expect(g.xiuwei).toBe(4);
    });

    it('日封顶：三项各自在日上限处截断，跨日翻新', () => {
        const s = save();
        const sys = new TowerSystem();
        s.tower.best = 1;
        const d1 = new Date(2026, 8, 1);
        // 单局深层：灵石 1000×4 会超 1500 上限
        const run = sys.startRun(s);
        run.deepest = 1000;
        const g1 = sys.settle(s, run, d1);
        expect(g1.lingshi).toBe(1500);
        expect(g1.xiuwei).toBe(600);
        expect(g1.mats).toBe(5); // 1000 层跨 100 个里程碑，封顶 5
        // 同日再结算：额度已用尽
        const run2 = sys.startRun(s);
        run2.deepest = 1000;
        const g2 = sys.settle(s, run2, d1);
        expect(g2.lingshi).toBe(0);
        expect(g2.xiuwei).toBe(0);
        expect(g2.capped).toBe(true);
        // 跨日：额度翻新
        const run3 = sys.startRun(s); // best 已是 1000 → 起手 996
        run3.deepest = 1010;
        const g3 = sys.settle(s, run3, new Date(2026, 8, 2));
        expect(g3.lingshi).toBe(1500); // 1010×4 仍超上限
        expect(g3.xiuwei).toBe(600);
        expect(g3.mats).toBe(1); // 新跨越第 1010 层这一个里程碑
        expect(s.tower.best).toBe(1010);
    });

    it('best 只升不降：低层收兵不影响纪录', () => {
        const s = save();
        const sys = new TowerSystem();
        s.tower.best = 30;
        const run = sys.startRun(s); // 起手 26
        run.win();
        sys.settle(s, run);
        expect(s.tower.best).toBe(30);
    });
});

describe('M22 存档 v7 → v8', () => {
    it('缺省补齐：v7 老档迁移后 tower 为初始态且版本为 8', () => {
        const raw = { ...defaultSave(), version: 7 };
        delete (raw as Partial<SaveData>).tower;
        const m = migrate(raw);
        expect(m.version).toBe(8);
        expect(m.tower).toEqual({
            best: 1,
            swordLevel: 0,
            crystal: 0,
            daily: { day: '', lingshi: 0, mats: 0, xiuwei: 0 },
        });
    });

    it('合法值保留', () => {
        const raw = { ...defaultSave(), version: 7, tower: { best: 42, swordLevel: 120, crystal: 9876.5, daily: { day: '2026-10-09', lingshi: 100, mats: 1, xiuwei: 50 } } };
        const m = migrate(raw);
        expect(m.tower.best).toBe(42);
        expect(m.tower.swordLevel).toBe(120);
        expect(m.tower.crystal).toBe(9876.5);
        expect(m.tower.daily.lingshi).toBe(100);
    });

    it('非法值钳制：best ≥1、等级/煞晶/回灌 ≥0，非数字填缺省', () => {
        const raw = {
            ...defaultSave(),
            version: 7,
            tower: { best: -5, swordLevel: -3, crystal: -1, daily: { day: 123, lingshi: -9, mats: 'x', xiuwei: NaN } },
        };
        const m = migrate(raw as unknown as SaveData);
        expect(m.tower.best).toBe(1);
        expect(m.tower.swordLevel).toBe(0);
        expect(m.tower.crystal).toBe(0);
        expect(m.tower.daily).toEqual({ day: '', lingshi: 0, mats: 0, xiuwei: 0 });
    });

    it('v1 → v8 全链路兼容：最原始档也能迁到当前模型', () => {
        const m = migrate({ version: 1, lingshi: 10 });
        expect(m.version).toBe(8);
        expect(m.tower.best).toBe(1);
        expect(m.trail.curLayer).toBe(1);
        expect(m.profile.name).toBe('');
    });

    it('损坏档（null/字符串/未知版本）→ 重置为 v8 缺省', () => {
        expect(migrate(null).version).toBe(8);
        expect(migrate('junk').version).toBe(8);
        expect(migrate({ version: 99 }).version).toBe(8);
    });
});

describe('M22 bignum.formatCompact', () => {
    it('小额与分档', () => {
        expect(formatCompact(0)).toBe('0');
        expect(formatCompact(7)).toBe('7');
        expect(formatCompact(999)).toBe('999');
        expect(formatCompact(1234)).toBe('1.23K');
        expect(formatCompact(12345)).toBe('12.3K');
        expect(formatCompact(123456)).toBe('123K');
        expect(formatCompact(6.6e8)).toBe('660M');
        expect(formatCompact(1e9)).toBe('1B');
        expect(formatCompact(1e12)).toBe('1T');
        expect(formatCompact(1e15)).toBe('1Q');
        expect(formatCompact(1e18)).toBe('1aa');
        expect(formatCompact(1e33)).toBe('1af');
    });

    it('[0, 10³³) 全覆盖：档位与尾数不越界、无 NaN', () => {
        for (let e = 0; e <= 33; e += 0.5) {
            const v = Math.pow(10, e);
            const s = formatCompact(v);
            expect(s).not.toMatch(/NaN|Infinity|undefined/);
            expect(s.length).toBeGreaterThan(0);
            expect(s.length).toBeLessThanOrEqual(8);
        }
    });

    it('负数与非法值', () => {
        expect(formatCompact(-1234)).toBe('-1.23K');
        expect(formatCompact(NaN)).toBe('0');
        expect(formatCompact(Infinity)).toBe('0');
    });
});
