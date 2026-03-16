/** 表 2：宝箱配置表（PRD 2.2 / 附件表2） */
export type BoxId = 'fansu' | 'xiuzhen' | 'tiandao';

export interface BoxConfig {
    id: BoxId;
    name: string;
    cost: number;
    /** 概率：普通 / 稀有(含突破机缘) / 劫难，三者之和为 1 */
    normalRate: number;
    rareRate: number;
    disasterRate: number;
    /** 是否参与天道保底 */
    pityEnabled: boolean;
    desc: string;
}

export const BOXES: BoxConfig[] = [
    { id: 'fansu',   name: '凡俗宝盒', cost: 50,  normalRate: 0.70, rareRate: 0.28, disasterRate: 0.02, pityEnabled: true, desc: '少量修为、灵石、普通灵根碎片' },
    { id: 'xiuzhen', name: '修真宝盒', cost: 200, normalRate: 0.60, rareRate: 0.32, disasterRate: 0.08, pityEnabled: true, desc: '中量修为、灵根碎片、低概率突破机缘' },
    { id: 'tiandao', name: '天道仙盒', cost: 800, normalRate: 0.45, rareRate: 0.40, disasterRate: 0.15, pityEnabled: true, desc: '大量修为、功法、高概率突破机缘、小概率劫难' },
];

export function getBox(id: BoxId): BoxConfig {
    const b = BOXES.find((x) => x.id === id);
    if (!b) throw new Error(`unknown box: ${id}`);
    return b;
}

/** 连续低收益达到该值后，下次开箱保底稀有（PRD：连续 3 次低收益，第 4 次强制稀有） */
export const PITY_THRESHOLD = 3;

/** 单次开箱会话内【继续求索】上限（PRD 2.2：连续求索最多 2 次） */
export const SEEK_LIMIT = 2;

/** 修真宝盒解锁所需境界下标（练气） */
export const XIUZHEN_UNLOCK_REALM = 1;

/** 天道仙盒解锁所需境界下标（金丹） */
export const TIANDAO_UNLOCK_REALM = 3;

// ---------- V2 交互深化（数值假设 #20–#21） ----------

/**
 * 灵气共鸣：蓄力光标停在金区松手 → 本次非概率产出（灵石/修为/碎片，正值）×1.15。
 * 不改变档位概率、不影响天道保底计数、不加机缘（合规：技巧不触碰概率）。
 */
export const RESONATE_MULT = 1.15;

/** 圆满三连：每点亮 1 枚符文追加灵石 = 箱费 ×6%，3 枚全中额外 +1 枚随机碎片 */
export const TRIPLE_BONUS_COST_PCT = 0.06;
