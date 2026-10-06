/**
 * M13 炼丹淬体 & 福禄炼制配置（docs/数值假设.md #39–#41）。
 *
 * 设计基调：
 * - 炼丹淬体：四维「智力 / 速度 / 淬体 / 机缘」本体属性，按境界解锁三品
 *   （初 / 中 / 高），每品可反复炼制、各自封顶。四维各自接入既有公式：
 *     智力 → 修为获取加成（乘算）
 *     速度 → 灵气雨/幻境 角色横向移动速度加成（乘算）
 *     淬体 → 战斗减伤（防转减伤，见 CombatSystem）
 *     机缘 → 突破基础成功率加成（加算进 clamp 前）
 * - 福禄炼制：永久攻防加成，三品（初 / 中 / 高），与锻体（乘算系数）、法器
 *   （档位加值）并列的第三种成长线（固定攻防加值）。
 * - 原料：初品纯灵石；中/高品需灵石 + 灵材（炼材由开箱/历练/斩妖掉落）。
 */

/** 丹药品阶 */
export type PillGrade = 'chu' | 'zhong' | 'gao';

/** 四维属性 key（本体资质，非攻防） */
export type AlchemyStat = 'wisdom' | 'speed' | 'forging' | 'fate';

// ---------- #39 炼丹淬体：四维本体属性 ----------

export interface PillConfig {
    /** 品阶 */
    grade: PillGrade;
    /** 品阶名（中文） */
    name: string;
    /** 解锁所需境界下标（0=凡人） */
    unlockRealm: number;
    /** 炼制一次的灵石成本 */
    lingshiCost: number;
    /** 炼制一次需要的灵材数量（0 = 不需灵材） */
    materialCost: number;
    /** 单次炼制给四维各加多少（四维等量） */
    statGain: number;
    /** 该品阶四维的封顶值（达到后不可再炼制） */
    cap: number;
    /** 品阶描述 */
    desc: string;
}

/** 炼丹三品：初/中/高（#39） */
export const PILLS: PillConfig[] = [
    {
        grade: 'chu', name: '初品灵丹', unlockRealm: 0, lingshiCost: 120, materialCost: 0,
        statGain: 2, cap: 60, desc: '凡草初炼，温养根基，四维各增其二。',
    },
    {
        grade: 'zhong', name: '中品灵丹', unlockRealm: 1, lingshiCost: 400, materialCost: 2,
        statGain: 5, cap: 150, desc: '灵材为引，炉火纯青，四维各增其五。',
    },
    {
        grade: 'gao', name: '高品灵丹', unlockRealm: 3, lingshiCost: 1200, materialCost: 5,
        statGain: 12, cap: 360, desc: '天材地宝，夺造化之功，四维各增十二。',
    },
];

/** 四维中文名（展示序：智力 / 速度 / 淬体 / 机缘） */
export const STAT_NAMES: Record<AlchemyStat, string> = {
    wisdom: '智力',
    speed: '速度',
    forging: '淬体',
    fate: '机缘',
};

/** 四维每点换算的实际增益口径（#39 公式接入） */
export const ALCHEMY_WISDOM_XIUWEI = 0.001;   // 每点智力 +0.1% 修为获取（乘算）
export const ALCHEMY_SPEED_MOVE = 0.0015;     // 每点速度 +0.15% 灵气雨移动速度（乘算）
export const ALCHEMY_FATE_RATE = 0.0004;      // 每点机缘 +0.04% 突破基础成功率（加算，clamp 前）

/** 淬体减伤：每点淬体转化的等效减伤比例（#39，接入 CombatSystem 减伤） */
export const ALCHEMY_FORGING_DEF_RATIO = 0.5;

// ---------- #40 福禄炼制：永久攻防加成 ----------

export interface FortuneConfig {
    grade: PillGrade;
    name: string;
    /** 解锁所需境界下标 */
    unlockRealm: number;
    /** 炼制一次的灵石成本 */
    lingshiCost: number;
    /** 炼制一次需要的灵材数量 */
    materialCost: number;
    /** 单次炼制的攻/防加成 */
    atk: number;
    def: number;
    /** 该品阶炼制次数上限 */
    maxCrafts: number;
    desc: string;
}

/** 福禄三品（#40）：一次性攻防加值，与锻体（乘算）、法器（档位）并列 */
export const FORTUNES: FortuneConfig[] = [
    {
        grade: 'chu', name: '初品福禄', unlockRealm: 0, lingshiCost: 300, materialCost: 0,
        atk: 8, def: 4, maxCrafts: 5, desc: '小福小禄，护体安身，攻防各有所增。',
    },
    {
        grade: 'zhong', name: '中品福禄', unlockRealm: 1, lingshiCost: 900, materialCost: 3,
        atk: 30, def: 15, maxCrafts: 5, desc: '福泽渐厚，气运加身，攻防再上层楼。',
    },
    {
        grade: 'gao', name: '高品福禄', unlockRealm: 3, lingshiCost: 2600, materialCost: 6,
        atk: 90, def: 45, maxCrafts: 5, desc: '大福大禄，气运如虹，攻防冠绝同阶。',
    },
];

// ---------- 灵材（炼材） ----------

export interface MaterialConfig {
    id: string;
    name: string;
    /** 掉落来源描述（用于展示） */
    source: string;
    desc: string;
}

/** 灵材种类（开箱/历练/斩妖掉落，供中高品炼制） */
export const MATERIALS: MaterialConfig[] = [
    { id: 'lingcao', name: '灵草', source: '开箱 · 历练', desc: '山野灵草，药性温平，炼材之基。' },
    { id: 'lingshi_core', name: '灵石髓', source: '开箱 · 斩妖', desc: '灵石深层的髓心，蕴含精纯灵气。' },
    { id: 'yaodan_core', name: '妖兽丹', source: '斩妖', desc: '妖兽内丹，气血浑厚，高品炼材。' },
];

export function getPill(grade: PillGrade): PillConfig {
    return PILLS.find((p) => p.grade === grade)!;
}

export function getFortune(grade: PillGrade): FortuneConfig {
    return FORTUNES.find((f) => f.grade === grade)!;
}

/** 灵材掉落：返回本次掉落的灵材 id 数组（用于开箱/历练/斩妖结算） */
export function materialPool(grade: 'low' | 'mid' | 'high'): string[] {
    if (grade === 'low') return ['lingcao'];
    if (grade === 'mid') return ['lingcao', 'lingshi_core'];
    return ['lingshi_core', 'yaodan_core'];
}

/** 灵材名称（展示用） */
export function materialName(id: string): string {
    return MATERIALS.find((m) => m.id === id)?.name ?? id;
}
