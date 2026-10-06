/**
 * 炼丹淬体 & 福禄炼制系统（docs/数值假设.md #39–#41，纯逻辑可单测）。
 *
 * 四维本体属性（智力/速度/淬体/机缘）各自接入既有公式：
 *   智力 → 修为获取加成（乘算）
 *   速度 → 灵气雨/幻境 角色移动速度加成（乘算）
 *   淬体 → 战斗减伤（防转减伤，供 CombatSystem 调用）
 *   机缘 → 突破基础成功率加成（加算，clamp 前）
 * 福禄 → 永久攻防加值（与锻体乘算系数、法器档位加值并列）。
 */
import { SaveData } from '../saveModel';
import { EconomySystem } from './EconomySystem';
import {
    ALCHEMY_FATE_RATE,
    ALCHEMY_FORGING_DEF_RATIO,
    ALCHEMY_SPEED_MOVE,
    ALCHEMY_WISDOM_XIUWEI,
    AlchemyStat,
    FORTUNES,
    FortuneConfig,
    MATERIALS,
    PillConfig,
    PillGrade,
    getFortune,
    getPill,
} from '../config/alchemy';

/** 炼丹失败原因 */
export type CraftFail = 'locked' | 'lingshiNotEnough' | 'materialNotEnough' | 'capped';

/** 福禄炼制失败原因 */
export type FortuneFail = 'locked' | 'lingshiNotEnough' | 'materialNotEnough' | 'maxed';

export class AlchemySystem {
    constructor(private eco: EconomySystem) {}

    // ---------- 四维读取 ----------

    /** 某四维的当前值 */
    stat(save: SaveData, key: AlchemyStat): number {
        return save.alchemy[key];
    }

    /** 某四维的封顶值（取已解锁最高品阶的 cap；未解锁任何品阶为 0） */
    statCap(save: SaveData): number {
        let cap = 0;
        for (const p of this.unlockedPills(save)) cap = Math.max(cap, p.cap);
        return cap;
    }

    /** 四维是否全部达到封顶 */
    allMaxed(save: SaveData): boolean {
        const cap = this.statCap(save);
        if (cap <= 0) return true;
        const a = save.alchemy;
        return a.wisdom >= cap && a.speed >= cap && a.forging >= cap && a.fate >= cap;
    }

    /** 已解锁的丹药品阶（按境界） */
    unlockedPills(save: SaveData): PillConfig[] {
        return [getPill('chu'), getPill('zhong'), getPill('gao')].filter(
            (p) => save.realmIndex >= p.unlockRealm,
        );
    }

    /** 已解锁的福禄品阶 */
    unlockedFortunes(save: SaveData): FortuneConfig[] {
        return FORTUNES.filter((f) => save.realmIndex >= f.unlockRealm);
    }

    // ---------- 炼丹 ----------

    /** 某品阶是否可炼制（四维未达该品阶封顶） */
    canCraft(save: SaveData, grade: PillGrade): CraftFail | null {
        const p = getPill(grade);
        if (save.realmIndex < p.unlockRealm) return 'locked';
        if (!this.eco.canAfford(p.lingshiCost)) return 'lingshiNotEnough';
        if (p.materialCost > 0 && this.materialCount(save) < p.materialCost) return 'materialNotEnough';
        // 四维只要有一个没到该品阶封顶即可继续炼（四维等量，所以判断第一个即可）
        if (save.alchemy.wisdom >= p.cap) return 'capped';
        return null;
    }

    /** 炼制一次丹药：消耗灵石 + 灵材，四维各 +statGain（不超过该品阶封顶） */
    craft(save: SaveData, grade: PillGrade): boolean {
        if (this.canCraft(save, grade) !== null) return false;
        const p = getPill(grade);
        if (!this.eco.spend(p.lingshiCost)) return false;
        if (p.materialCost > 0) {
            if (!this.consumeMaterials(save, p.materialCost)) {
                // 灵材不足则退还灵石（理论上 canCraft 已拦截，此处兜底）
                this.eco.addLingshi(p.lingshiCost, false);
                return false;
            }
        }
        const gain = Math.min(p.statGain, p.cap - save.alchemy.wisdom);
        save.alchemy.wisdom += gain;
        save.alchemy.speed += gain;
        save.alchemy.forging += gain;
        save.alchemy.fate += gain;
        return true;
    }

    // ---------- 福禄炼制 ----------

    canCraftFortune(save: SaveData, grade: PillGrade): FortuneFail | null {
        const f = getFortune(grade);
        if (save.realmIndex < f.unlockRealm) return 'locked';
        if (!this.eco.canAfford(f.lingshiCost)) return 'lingshiNotEnough';
        if (f.materialCost > 0 && this.materialCount(save) < f.materialCost) return 'materialNotEnough';
        if (this.fortuneCraftCount(save, grade) >= f.maxCrafts) return 'maxed';
        return null;
    }

    craftFortune(save: SaveData, grade: PillGrade): boolean {
        if (this.canCraftFortune(save, grade) !== null) return false;
        const f = getFortune(grade);
        if (!this.eco.spend(f.lingshiCost)) return false;
        if (f.materialCost > 0) {
            if (!this.consumeMaterials(save, f.materialCost)) {
                this.eco.addLingshi(f.lingshiCost, false);
                return false;
            }
        }
        save.fortune.crafts[grade] = (save.fortune.crafts[grade] ?? 0) + 1;
        return true;
    }

    fortuneCraftCount(save: SaveData, grade: PillGrade): number {
        return save.fortune.crafts[grade] ?? 0;
    }

    /** 福禄累计攻防加值 */
    fortuneBonus(save: SaveData): { atk: number; def: number } {
        let atk = 0, def = 0;
        for (const f of FORTUNES) {
            const n = this.fortuneCraftCount(save, f.grade);
            atk += f.atk * n;
            def += f.def * n;
        }
        return { atk, def };
    }

    // ---------- 灵材 ----------

    materialCount(save: SaveData): number {
        let sum = 0;
        for (const k in save.fortune.materials) sum += save.fortune.materials[k];
        return sum;
    }

    materialOf(save: SaveData, id: string): number {
        return save.fortune.materials[id] ?? 0;
    }

    /** 消耗任意灵材（按库存从前往后扣），数量不足返回 false */
    private consumeMaterials(save: SaveData, n: number): boolean {
        if (this.materialCount(save) < n) return false;
        let left = n;
        for (const m of MATERIALS) {
            const have = save.fortune.materials[m.id] ?? 0;
            const take = Math.min(have, left);
            if (take > 0) {
                save.fortune.materials[m.id] = have - take;
                left -= take;
            }
            if (left <= 0) break;
        }
        return true;
    }

    /** 发放灵材（开箱/历练/斩妖结算调用）；返回发放的灵材 id */
    addMaterial(save: SaveData, id: string, n: number): void {
        save.fortune.materials[id] = (save.fortune.materials[id] ?? 0) + n;
    }

    // ---------- 四维增益（接入既有公式） ----------

    /** 智力 → 修为获取加成（乘算，与灵根加成叠加） */
    wisdomXiuweiBonus(save: SaveData): number {
        return save.alchemy.wisdom * ALCHEMY_WISDOM_XIUWEI;
    }

    /** 速度 → 灵气雨/幻境移动速度加成（乘算） */
    speedMoveBonus(save: SaveData): number {
        return save.alchemy.speed * ALCHEMY_SPEED_MOVE;
    }

    /** 淬体 → 等效防御减伤点（供 CombatSystem 折算防御） */
    forgingDefPoints(save: SaveData): number {
        return Math.round(save.alchemy.forging * ALCHEMY_FORGING_DEF_RATIO);
    }

    /** 机缘 → 突破基础成功率加成（加算，clamp 前） */
    fateRateBonus(save: SaveData): number {
        return save.alchemy.fate * ALCHEMY_FATE_RATE;
    }
}
