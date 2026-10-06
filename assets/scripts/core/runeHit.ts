/**
 * 圆满三连符文命中判定——纯几何，便于单测，与分辨率/FIXED_WIDTH 长屏无关。
 *
 * 调用方负责把触控点换算到 runeRoot 的本地坐标（纵向中心用 visibleHeight()/2，
 * 见 BoxScene.onRuneTap），本模块只判断「给定本地坐标落在哪个符文命中框内」。
 */

export interface RuneHitConfig {
    /** 各符文 x 坐标（runeRoot 本地系） */
    xs: number[];
    /** 符文行 y 坐标（runeRoot 本地系） */
    rowY: number;
    /** 横向半命中宽 */
    halfW: number;
    /** 纵向半命中高 */
    halfH: number;
}

/**
 * 返回命中的符文下标；未命中返回 -1。
 * 命中框为以 (xs[i], rowY) 为中心、halfW×halfH 的矩形（含边界）。
 */
export function hitRune(localX: number, localY: number, cfg: RuneHitConfig): number {
    for (let i = 0; i < cfg.xs.length; i++) {
        if (
            Math.abs(localX - cfg.xs[i]) <= cfg.halfW &&
            Math.abs(localY - cfg.rowY) <= cfg.halfH
        ) {
            return i;
        }
    }
    return -1;
}
