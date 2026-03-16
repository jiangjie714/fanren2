/** 灵根收集 & 图鉴（PRD 2.4；docs/数值假设.md #9）——仅外观 + 少量修为加成，不改概率 */
export type LingengGrade = '普通灵根' | '稀有灵根' | '变异灵根' | '先天道体';

export interface LingengConfig {
    id: string;
    name: string;
    grade: LingengGrade;
    /** 合成所需碎片数 */
    need: number;
    /** 解锁后修为获取加成（乘算加成） */
    xiuweiBonus: number;
    desc: string;
}

export const LINGENS: LingengConfig[] = [
    { id: 'jinmu',   name: '金木双灵根', grade: '普通灵根', need: 5,  xiuweiBonus: 0.01, desc: '五行相济，修行平平却胜在心性坚韧。' },
    { id: 'shuituo', name: '水土灵根',   grade: '普通灵根', need: 5,  xiuweiBonus: 0.01, desc: '厚土载物，静水守拙。' },
    { id: 'huoyan',  name: '火焰灵根',   grade: '普通灵根', need: 5,  xiuweiBonus: 0.01, desc: '性烈如火，进境虽缓其志愈燃。' },
    { id: 'fenglei', name: '风雷灵根',   grade: '稀有灵根', need: 10, xiuweiBonus: 0.02, desc: '风雷激荡，百年难遇的修行奇才。' },
    { id: 'bingpo',  name: '冰魄灵根',   grade: '稀有灵根', need: 10, xiuweiBonus: 0.02, desc: '冰肌玉骨，道心澄明。' },
    { id: 'tianling',name: '天灵根',     grade: '变异灵根', need: 20, xiuweiBonus: 0.03, desc: '天道亲睐，灵气如渊。' },
    { id: 'guyun',   name: '古韵灵根',   grade: '变异灵根', need: 20, xiuweiBonus: 0.03, desc: '上古遗韵，与天地同息。' },
    { id: 'xiandao', name: '先天道体',   grade: '先天道体', need: 50, xiuweiBonus: 0.05, desc: '万中无一的先天道体，一生刹那通玄。' },
];

export function getLingeng(id: string): LingengConfig {
    const l = LINGENS.find((x) => x.id === id);
    if (!l) throw new Error(`unknown lingeng: ${id}`);
    return l;
}

/** 开箱碎片掉落池：按宝箱档次决定可掉落的灵根范围 */
export function fragmentPool(boxId: string): string[] {
    if (boxId === 'fansu') return ['jinmu', 'shuituo', 'huoyan'];
    if (boxId === 'xiuzhen') return ['jinmu', 'shuituo', 'huoyan', 'fenglei', 'bingpo'];
    return LINGENS.map((l) => l.id);
}
