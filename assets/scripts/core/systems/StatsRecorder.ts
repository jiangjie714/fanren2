/** M9a 长线计数器聚合（纯函数）：渡劫/幻境结算与灵石入账时由场景层调用 */
import { SaveData } from '../saveModel';
import { RainResult } from './RainSystem';

/** 渡劫结算后记录：最高评分 / 最大连击 / 完美接引次数 */
export function recordTribulation(save: SaveData, result: RainResult): void {
    save.stats.bestTribScore = Math.max(save.stats.bestTribScore, result.score);
    save.stats.bestCombo = Math.max(save.stats.bestCombo, result.maxCombo);
    if (result.rating === '仙阶完美接引' && result.redCount === 0) {
        save.stats.perfectTribulations += 1;
    }
}

/** 幻境结算后记录：历史最高分 */
export function recordIllusion(save: SaveData, score: number): void {
    save.illusionBestEver = Math.max(save.illusionBestEver, score);
}
