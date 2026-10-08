/**
 * M13 炼丹淬体 & 福禄炼制单测（docs/数值假设.md #39–#41）：
 * 四维派生、炼丹境界解锁/封顶/成本、福禄攻防加成/次数上限、灵材、存档 v5 迁移、四维接入公式。
 */
import { describe, expect, it } from 'vitest';
import { defaultSave, migrate, SaveData } from '../assets/scripts/core/saveModel';
import { EconomySystem } from '../assets/scripts/core/systems/EconomySystem';
import { AlchemySystem } from '../assets/scripts/core/systems/AlchemySystem';
import { CombatSystem } from '../assets/scripts/core/systems/CombatSystem';
import { Rng } from '../assets/scripts/core/rng';
import {
    ALCHEMY_FATE_RATE,
    ALCHEMY_FORGING_DEF_RATIO,
    ALCHEMY_SPEED_MOVE,
    ALCHEMY_WISDOM_XIUWEI,
    FORTUNES,
    PILLS,
    getFortune,
    getPill,
} from '../assets/scripts/core/config/alchemy';

function make(realmIndex = 0, lingshi = 1_000_000, seed = 20261006) {
    const save: SaveData = defaultSave();
    save.realmIndex = realmIndex;
    save.lingshi = lingshi;
    const eco = new EconomySystem(save);
    const alch = new AlchemySystem(eco);
    const rng = new Rng(seed);
    const combat = new CombatSystem(eco, rng);
    combat.attachAlchemy(alch);
    return { save, eco, alch, combat };
}

describe('M13 炼丹境界解锁（#39）', () => {
    it('凡人只解锁初品；练气解锁初+中；金丹解锁全部三品', () => {
        expect(make(0).alch.unlockedPills(make(0).save).map((p) => p.grade)).toEqual(['chu']);
        expect(make(1).alch.unlockedPills(make(1).save).map((p) => p.grade)).toEqual(['chu', 'zhong']);
        expect(make(3).alch.unlockedPills(make(3).save).map((p) => p.grade)).toEqual(['chu', 'zhong', 'gao']);
    });

    it('未解锁品阶 canCraft 返回 locked', () => {
        const { save, alch } = make(0);
        expect(alch.canCraft(save, 'zhong')).toBe('locked');
        expect(alch.canCraft(save, 'gao')).toBe('locked');
    });

    it('炼制一次四维各 +statGain，灵石与灵材正确扣除', () => {
        const { save, alch } = make(0);
        const p = getPill('chu');
        const before = save.alchemy.wisdom;
        const lsBefore = save.lingshi;
        expect(alch.craft(save, 'chu')).toBe(true);
        expect(save.alchemy.wisdom).toBe(before + p.statGain);
        expect(save.alchemy.speed).toBe(before + p.statGain);
        expect(save.alchemy.forging).toBe(before + p.statGain);
        expect(save.alchemy.fate).toBe(before + p.statGain);
        expect(save.lingshi).toBe(lsBefore - p.lingshiCost);
    });

    it('达到品阶封顶后 canCraft 返回 capped，不再扣灵石', () => {
        const { save, alch } = make(0);
        const p = getPill('chu');
        save.alchemy.wisdom = p.cap;
        save.alchemy.speed = p.cap;
        save.alchemy.forging = p.cap;
        save.alchemy.fate = p.cap;
        expect(alch.canCraft(save, 'chu')).toBe('capped');
        const ls = save.lingshi;
        expect(alch.craft(save, 'chu')).toBe(false);
        expect(save.lingshi).toBe(ls);
    });

    it('灵石不足返回 lingshiNotEnough', () => {
        const { save, alch } = make(0, 10);
        expect(alch.canCraft(save, 'chu')).toBe('lingshiNotEnough');
    });
});

describe('M13 福禄炼制（#40）', () => {
    it('福禄炼制一次攻防加值正确、计数 +1', () => {
        const { save, alch } = make(0);
        const f = getFortune('chu');
        expect(alch.craftFortune(save, 'chu')).toBe(true);
        expect(alch.fortuneCraftCount(save, 'chu')).toBe(1);
        const bonus = alch.fortuneBonus(save);
        expect(bonus.atk).toBe(f.atk);
        expect(bonus.def).toBe(f.def);
    });

    it('福禄炼制达到 maxCrafts 后 maxed，不再可炼', () => {
        const { save, alch } = make(0);
        const f = getFortune('chu');
        for (let i = 0; i < f.maxCrafts; i++) alch.craftFortune(save, 'chu');
        expect(alch.canCraftFortune(save, 'chu')).toBe('maxed');
        const ls = save.lingshi;
        expect(alch.craftFortune(save, 'chu')).toBe(false);
        expect(save.lingshi).toBe(ls);
    });

    it('福禄攻防加值进入 deriveStats（与锻体/法器叠加）', () => {
        const { save, alch, combat } = make(0);
        const before = combat.deriveStats(save);
        const f = getFortune('chu');
        alch.craftFortune(save, 'chu');
        const after = combat.deriveStats(save);
        expect(after.atk).toBe(before.atk + f.atk);
        expect(after.def).toBe(before.def + f.def);
    });
});

describe('M13 灵材（#41）', () => {
    it('中/高品炼丹需要灵材，不足时返回 materialNotEnough', () => {
        const { save, alch } = make(1); // 练气解锁中品
        const p = getPill('zhong');
        expect(p.materialCost).toBeGreaterThan(0);
        expect(alch.canCraft(save, 'zhong')).toBe('materialNotEnough');
        // 发够灵材后可炼
        for (let i = 0; i < p.materialCost; i++) alch.addMaterial(save, 'lingcao', 1);
        expect(alch.canCraft(save, 'zhong')).toBeNull();
    });

    it('灵材发放与库存计数正确', () => {
        const { save, alch } = make(0);
        alch.addMaterial(save, 'lingcao', 3);
        alch.addMaterial(save, 'lingshi_core', 2);
        expect(alch.materialOf(save, 'lingcao')).toBe(3);
        expect(alch.materialOf(save, 'lingshi_core')).toBe(2);
        expect(alch.materialCount(save)).toBe(5);
    });
});

describe('M13 四维接入公式（#39）', () => {
    it('智力 → 修为加成 = 智力 ×0.001', () => {
        const { save, alch } = make(0);
        save.alchemy.wisdom = 100;
        expect(alch.wisdomXiuweiBonus(save)).toBeCloseTo(100 * ALCHEMY_WISDOM_XIUWEI);
    });

    it('速度 → 移速加成 = 速度 ×0.0015', () => {
        const { save, alch } = make(0);
        save.alchemy.speed = 100;
        expect(alch.speedMoveBonus(save)).toBeCloseTo(100 * ALCHEMY_SPEED_MOVE);
    });

    it('淬体 → 防御减伤点 = round(淬体 ×0.5)', () => {
        const { save, alch } = make(0);
        save.alchemy.forging = 100;
        expect(alch.forgingDefPoints(save)).toBe(50);
    });

    it('机缘 → 突破成功率加成 = 机缘 ×0.0004', () => {
        const { save, alch } = make(0);
        save.alchemy.fate = 1000;
        expect(alch.fateRateBonus(save)).toBeCloseTo(1000 * ALCHEMY_FATE_RATE);
    });
});

describe('M13 存档 v5 迁移', () => {
    it('v4 → v5 补齐 alchemy/fortune 字段，保留原数据', () => {
        const v4 = {
            version: 4,
            lingshi: 500,
            profile: { gender: 'm', name: '青云子', createdAt: 1 },
            combat: { forging: 3, weapons: [0, 1] },
            pk: { wins: 5, losses: 2, streak: 1, bestStreak: 3 },
        };
        const d = migrate(v4);
        expect(d.version).toBe(7);
        expect(d.lingshi).toBe(500);
        expect(d.profile.name).toBe('青云子');
        expect(d.combat.forging).toBe(3);
        expect(d.alchemy.wisdom).toBe(0);
        expect(d.alchemy.speed).toBe(0);
        expect(d.fortune.crafts).toEqual({});
        expect(d.fortune.materials).toEqual({});
    });

    it('手改存档注入负数四维被钳制为 0', () => {
        const bad = { version: 5, alchemy: { wisdom: -50, speed: -1, forging: -9, fate: -3 } };
        const d = migrate(bad);
        expect(d.alchemy.wisdom).toBe(0);
        expect(d.alchemy.speed).toBe(0);
        expect(d.alchemy.forging).toBe(0);
        expect(d.alchemy.fate).toBe(0);
    });
});

