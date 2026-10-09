/** M9a 成就配置：12 项（数值假设 #31）；M22 增 2 项剑气成就序列（spec §9） */
import { SaveData } from '../saveModel';
import { LINGENS } from './lingens';
import { swordAtk } from './tower';

export type AchievementId =
    | 'firstOpen' | 'firstTribulation' | 'firstBreakthrough'
    | 'immortalTrib' | 'perfectTrib' | 'combo15'
    | 'collection4' | 'collectionAll'
    | 'open100' | 'lingshi100k'
    | 'illusion120' | 'illusion180'
    | 'towerSword100k' | 'towerSword1m';

export interface AchievementReward {
    lingshi?: number;
    fragments?: number;
}

export interface AchievementConfig {
    id: AchievementId;
    name: string;
    desc: string;
    /** 达成指标：从存档聚合（只读） */
    metric: (save: SaveData) => number;
    target: number;
    /** 进度展示口径 */
    unit?: string;
    reward: AchievementReward;
}

const tribulations = (s: SaveData) => s.stats.breakthroughWins + s.stats.breakthroughFails;

export const ACHIEVEMENTS: AchievementConfig[] = [
    { id: 'firstOpen',          name: '初入仙途', desc: '开启第 1 次宝箱',           metric: (s) => s.stats.opens,             target: 1,   reward: { lingshi: 200 } },
    { id: 'firstTribulation',   name: '初历天劫', desc: '完成第 1 场渡劫',           metric: (s) => tribulations(s),           target: 1,   reward: { lingshi: 200 } },
    { id: 'firstBreakthrough',  name: '踏入练气', desc: '首次突破成功',              metric: (s) => s.stats.breakthroughWins,  target: 1,   reward: { lingshi: 300 } },
    { id: 'immortalTrib',       name: '仙阶接引', desc: '单次渡劫评分达到 75',       metric: (s) => s.stats.bestTribScore,     target: 75,  reward: { lingshi: 500 } },
    { id: 'perfectTrib',        name: '完美接引', desc: '零劫雨仙阶接引 1 次',       metric: (s) => s.stats.perfectTribulations, target: 1, reward: { lingshi: 800, fragments: 2 } },
    { id: 'combo15',            name: '心流如水', desc: '单局连击达到 15',           metric: (s) => s.stats.bestCombo,         target: 15,  reward: { lingshi: 500 } },
    { id: 'collection4',        name: '灵根初集', desc: '解锁 4 件灵根图鉴',         metric: (s) => s.unlocked.length,         target: 4,   reward: { lingshi: 500, fragments: 2 } },
    { id: 'collectionAll',      name: '万灵归宗', desc: '集齐全部灵根图鉴',          metric: (s) => s.unlocked.length,         target: LINGENS.length, reward: { lingshi: 2000, fragments: 5 } },
    { id: 'open100',            name: '开箱百次', desc: '累计开启 100 次宝箱',       metric: (s) => s.stats.opens,             target: 100, reward: { lingshi: 1000 } },
    { id: 'lingshi100k',        name: '家财万贯', desc: '累计获得 10 万灵石',        metric: (s) => s.stats.lingshiEarned,     target: 100000, unit: '灵石', reward: { lingshi: 1000, fragments: 3 } },
    { id: 'illusion120',        name: '心魔退散', desc: '幻境单局得分达到 120',      metric: (s) => s.illusionBestEver,        target: 120, reward: { lingshi: 800 } },
    { id: 'illusion180',        name: '心魔大圣', desc: '幻境单局得分达到 180',      metric: (s) => s.illusionBestEver,        target: 180, reward: { lingshi: 1500, fragments: 4 } },
    { id: 'towerSword100k',     name: '剑气凝霜', desc: '剑气淬炼至 10 万',          metric: (s) => Math.floor(swordAtk(s.tower.swordLevel)), target: 100000, unit: '剑气', reward: { lingshi: 1000, fragments: 3 } },
    { id: 'towerSword1m',       name: '剑气破百万', desc: '剑气淬炼至 100 万',        metric: (s) => Math.floor(swordAtk(s.tower.swordLevel)), target: 1000000, unit: '剑气', reward: { lingshi: 3000, fragments: 5 } },
];

export function getAchievement(id: string): AchievementConfig {
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) throw new Error(`unknown achievement: ${id}`);
    return a;
}
