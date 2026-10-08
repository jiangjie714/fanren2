/**
 * M11 战斗玩法单测（docs/数值假设.md #32–#37）：
 * 攻防派生、锻体、法器、论武模拟/蓄力/限次、存档 v4 迁移。（斩妖公式已由妖径 trail-battle.test 承接）
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../assets/scripts/core/rng';
import { defaultSave, migrate, SaveData } from '../assets/scripts/core/saveModel';
import { EconomySystem } from '../assets/scripts/core/systems/EconomySystem';
import { CombatSystem } from '../assets/scripts/core/systems/CombatSystem';
import {
    FORGING_MAX_LEVEL,
    PK_CHARGE_MAX_ADS,
    PK_DAILY_LIMIT,
    PK_WIN_LINGSHI,
    REALM_COMBAT,
    WEAPONS,
    forgingCost,
    pkChargeFactor,
} from '../assets/scripts/core/config/combat';

function make(seed = 20261005) {
    const save: SaveData = defaultSave();
    const eco = new EconomySystem(save);
    const rng = new Rng(seed);
    const combat = new CombatSystem(eco, rng);
    return { save, eco, rng, combat };
}

describe('M11 攻防属性派生（#33）', () => {
    it('凡人裸装：攻 10 防 6，战力 = 攻 + 防', () => {
        const { save, combat } = make();
        const s = combat.deriveStats(save);
        expect(s.atk).toBe(REALM_COMBAT[0].atk);
        expect(s.def).toBe(REALM_COMBAT[0].def);
        expect(s.power).toBe(s.atk + s.def);
    });

    it('锻体每级 +5%（乘算境界基础），满级 ×2', () => {
        const { save, combat } = make();
        save.combat.forging = 10;
        let s = combat.deriveStats(save);
        expect(s.atk).toBe(Math.round(REALM_COMBAT[0].atk * 1.5));
        save.combat.forging = FORGING_MAX_LEVEL;
        s = combat.deriveStats(save);
        expect(s.atk).toBe(REALM_COMBAT[0].atk * 2);
        expect(s.def).toBe(REALM_COMBAT[0].def * 2);
    });

    it('法器加值加在锻体系数之上，自动佩最高档', () => {
        const { save, combat } = make();
        save.realmIndex = 3; // 金丹
        save.combat.weapons = [1, 2];
        const s = combat.deriveStats(save);
        expect(s.atk).toBe(Math.round(REALM_COMBAT[3].atk * 1) + WEAPONS[2].atk);
        expect(s.def).toBe(REALM_COMBAT[3].def + WEAPONS[2].def);
        expect(combat.equippedTier(save)).toBe(2);
    });

    it('锻体成本按 1.35 曲线增长且满级 Infinity', () => {
        expect(forgingCost(0)).toBe(150);
        expect(forgingCost(1)).toBe(Math.round(150 * 1.35));
        expect(forgingCost(FORGING_MAX_LEVEL)).toBe(Infinity);
    });

    it('升级锻体扣灵石；灵石不足或满级失败', () => {
        const { save, eco, combat } = make();
        save.lingshi = forgingCost(0);
        expect(combat.upgradeForging(save)).toBe(true);
        expect(save.combat.forging).toBe(1);
        expect(eco.lingshi).toBe(0);
        expect(combat.upgradeForging(save)).toBe(false);
        save.combat.forging = FORGING_MAX_LEVEL;
        save.lingshi = 999_999;
        expect(combat.upgradeForging(save)).toBe(false);
    });
});

describe('M11 法器购入（#34）', () => {
    it('境界未达不可购买', () => {
        const { save, combat } = make();
        expect(combat.weaponBuyState(save, 3)).toBe('locked');
        expect(combat.buyWeapon(save, 3)).toBe(false);
    });

    it('灵石足够即可购入并自动佩用', () => {
        const { save, eco, combat } = make();
        save.realmIndex = 1;
        save.lingshi = WEAPONS[1].cost;
        expect(combat.weaponBuyState(save, 1)).toBe('affordable');
        expect(combat.buyWeapon(save, 1)).toBe(true);
        expect(eco.lingshi).toBe(0);
        expect(save.combat.weapons).toEqual([1]);
        expect(combat.weaponBuyState(save, 1)).toBe('owned');
        expect(combat.buyWeapon(save, 1)).toBe(false); // 重复购买拦截
    });

    it('灵石不足状态 poor', () => {
        const { save, combat } = make();
        save.realmIndex = 2;
        expect(combat.weaponBuyState(save, 1)).toBe('poor');
    });
});

describe('M11 论武（#36/#37）', () => {
    it('每日限次：消耗 5 次后不可再战', () => {
        const { save, combat } = make();
        for (let i = 0; i < PK_DAILY_LIMIT; i++) {
            expect(combat.canPk(save)).toBe(true);
            expect(combat.consumePk(save)).toBe(true);
        }
        expect(combat.canPk(save)).toBe(false);
        expect(combat.consumePk(save)).toBe(false);
    });

    it('跨天重置论武次数', () => {
        const { save, eco } = make();
        save.daily.pkUsed = 3;
        // 用「明天」构造跨天日期：硬编码固定日期会在时间推进到那天后失效
        // （defaultSave 的 daily.date 已是当天 → dailyReset 判定同一天直接 return false）。
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const changed = eco.dailyReset(tomorrow);
        expect(changed).toBe(true);
        expect(save.daily.pkUsed).toBe(0);
    });

    it('对手攻防按境界基础值 ×带宽 [1.0,1.25] 生成（投资不抬对手）', () => {
        const { save, combat, rng } = make(42);
        save.realmIndex = 3;
        save.combat.forging = 20;
        const base = REALM_COMBAT[3];
        for (let i = 0; i < 50; i++) {
            const opp = combat.makeOpponent(save, 'random', rng);
            expect(opp.atk).toBeGreaterThanOrEqual(base.atk);
            expect(opp.atk).toBeLessThanOrEqual(Math.round(base.atk * 1.25));
            expect(opp.def).toBeGreaterThanOrEqual(base.def);
            expect(opp.def).toBeLessThanOrEqual(Math.round(base.def * 1.25));
            expect(opp.name.length).toBeGreaterThan(0);
        }
    });

    it('战斗模拟确定性：同种子同结果，落败方气血归零或按剩余比例判定', () => {
        const { save, combat } = make();
        const my = combat.deriveStats(save);
        const run = (seed: number) => {
            const { combat: c1, rng: r1 } = make(seed);
            const { combat: c2, rng: r2 } = make(seed);
            const opp = combat.makeOpponent(save, 'random', new Rng(seed + 1));
            const a = c1.simulateBattle(my, opp, r1);
            const b = c2.simulateBattle(my, opp, r2);
            expect(a).toEqual(b);
            return a;
        };
        for (const seed of [2026, 7, 998244353]) {
            const o = run(seed);
            expect(o.rounds.length).toBeGreaterThan(0);
            if (o.win) expect(o.myHpLeft).toBeGreaterThan(0);
            else expect(o.oppHpLeft).toBeGreaterThan(0);
        }
    });

    it('蓄力提升胜率：裸装 ≈53%，满蓄力（+100%）≈82%；锻体投资进一步上移', () => {
        const { save, combat } = make(2026);
        save.realmIndex = 3;
        const wr = (ads: number, n = 3000) => {
            const rng = new Rng(777 + ads);
            const opp = combat.makeOpponent(save, 'random', rng);
            let wins = 0;
            for (let i = 0; i < n; i++) {
                if (combat.simulateBattle(combat.chargedStats(save, ads), opp, rng).win) wins++;
            }
            return wins / n;
        };
        const bare = wr(0);
        const full = wr(PK_CHARGE_MAX_ADS);
        expect(pkChargeFactor(PK_CHARGE_MAX_ADS)).toBe(2);
        expect(bare).toBeGreaterThan(0.4);
        expect(bare).toBeLessThan(0.65);
        expect(full).toBeGreaterThan(bare + 0.15);
        expect(full).toBeGreaterThan(0.7);
        // 投资成长：锻体 10 重把裸装胜率推高
        save.combat.forging = 10;
        expect(wr(0)).toBeGreaterThan(bare + 0.1);
    });

    it('胜率预估（pkWinOdds）与 simulateBattle 同公式，随蓄力单调上升', () => {
        const { save, combat } = make(2026);
        save.realmIndex = 3;
        const opp = combat.makeOpponent(save, 'random', new Rng(31));
        let prev = 0;
        for (let ads = 0; ads <= 10; ads++) {
            const odds = combat.pkWinOdds(save, ads, opp);
            expect(odds).toBeGreaterThan(0);
            expect(odds).toBeLessThan(1);
            expect(odds).toBeGreaterThanOrEqual(prev);
            prev = odds;
        }
        // 与蓄力系数逐项对照：odds = (P²·1.15)/(P²·1.15 + oppP²)
        const my = combat.chargedStats(save, 5);
        const myP2 = (my.atk + my.def) ** 2 * 1.15;
        const oppP2 = (opp.atk + opp.def) ** 2;
        expect(combat.pkWinOdds(save, 5, opp)).toBeCloseTo(myP2 / (myP2 + oppP2), 10);
    });

    it('胜方奖励随境界提升；连胜系数封顶 +25%', () => {
        const { save, eco, combat, rng } = make(9);
        void rng;
        save.realmIndex = 2;
        const items = combat.pkWinRewards(save, 1);
        const lingshi = items.find((i) => i.kind === 'lingshi')!.amount;
        expect(lingshi).toBeGreaterThanOrEqual(Math.round(PK_WIN_LINGSHI[2] * 0.9));
        expect(lingshi).toBeLessThanOrEqual(Math.round(PK_WIN_LINGSHI[2] * 1.15));
        expect(eco.lingshi).toBe(200 + lingshi);
        // 修为 = 灵石 ×0.9
        const xw = items.find((i) => i.kind === 'xiuwei')!;
        expect(xw.amount).toBe(Math.round(lingshi * 0.9));
    });

    it('战绩记录：连胜累计、落败清零、最高连胜保留', () => {
        const { save, combat } = make();
        expect(combat.recordPkResult(save, true)).toBe(1);
        expect(combat.recordPkResult(save, true)).toBe(2);
        expect(save.pk.bestStreak).toBe(2);
        combat.recordPkResult(save, false);
        expect(save.pk.streak).toBe(0);
        expect(save.pk.bestStreak).toBe(2);
        expect(save.pk.losses).toBe(1);
    });
});

describe('存档 v4 迁移（#32–#36）', () => {
    it('v3 存档升级保留全部数据并补默认档案（name 空 → 进捏人流）', () => {
        const v3 = {
            version: 3,
            lingshi: 12345,
            xiuwei: 678,
            jiyuan: 9,
            realmIndex: 2,
            stats: { opens: 10, lingshiEarned: 5000 },
            achievements: { reached: ['a1'], claimed: ['a1'] },
        };
        const d = migrate(v3);
        expect(d.version).toBe(8);
        expect(d.lingshi).toBe(12345);
        expect(d.xiuwei).toBe(678);
        expect(d.stats.lingshiEarned).toBe(5000);
        expect(d.achievements.reached).toEqual(['a1']);
        expect(d.profile.name).toBe('');
        expect(d.profile.gender).toBe('m');
        expect(d.combat).toEqual({ forging: 0, weapons: [] });
        expect(d.pk).toEqual({ wins: 0, losses: 0, streak: 0, bestStreak: 0 });
    });

    it('v4 存档回读保留捏人与战斗数据；weapons 过滤非法值', () => {
        const v4raw = {
            version: 4,
            profile: { gender: 'f', name: '霜之岚', createdAt: 100 },
            combat: { forging: 7, weapons: [0, 2, 99, -3, 2.5] },
            pk: { wins: 3, losses: 1, streak: 2, bestStreak: 3 },
            daily: { pkUsed: 2 },
        };
        const d = migrate(v4raw);
        expect(d.profile).toEqual({ gender: 'f', name: '霜之岚', createdAt: 100 });
        expect(d.combat.weapons).toEqual([0, 2]);
        expect(d.combat.forging).toBe(7);
        expect(d.pk.wins).toBe(3);
        expect(d.daily.pkUsed).toBe(2);
    });

    it('未知版本/损坏输入重置', () => {
        expect(migrate({ version: 99 }).lingshi).toBe(defaultSave().lingshi);
        expect(migrate(null).version).toBe(8);
        expect(migrate('junk').version).toBe(8);
    });
});
