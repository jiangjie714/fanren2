import { describe, it, expect } from 'vitest';
import { hitRune, RuneHitConfig } from '../assets/scripts/core/runeHit';

// 与 BoxScene.onRuneTap 一致的布局参数（面板 y=60、符文行偏移 -6 → rowY=54）
const cfg: RuneHitConfig = {
    xs: [-170, 0, 170],
    rowY: 54,
    halfW: 62,
    halfH: 72,
};

describe('runeHit 符文命中几何（#P3 长屏修复的纯几何核心）', () => {
    it('精确命中三个符文中心', () => {
        expect(hitRune(-170, 54, cfg)).toBe(0);
        expect(hitRune(0, 54, cfg)).toBe(1);
        expect(hitRune(170, 54, cfg)).toBe(2);
    });

    it('命中框边界（±halfW/±halfH 含边界）仍命中', () => {
        // 左符文右下角边界
        expect(hitRune(-170 + 62, 54 + 72, cfg)).toBe(0);
        // 左符文左上角边界
        expect(hitRune(-170 - 62, 54 - 72, cfg)).toBe(0);
    });

    it('越过半宽即落空（相邻符文间隙）', () => {
        // 距左符文 85、距中符文 85，均 > halfW(62)
        expect(hitRune(-85, 54, cfg)).toBe(-1);
        expect(hitRune(85, 54, cfg)).toBe(-1);
    });

    it('纵向偏移超过 halfH 落空', () => {
        expect(hitRune(0, 54 + 73, cfg)).toBe(-1);
        expect(hitRune(0, 54 - 73, cfg)).toBe(-1);
    });

    it('空符文列表返回 -1', () => {
        expect(hitRune(0, 0, { xs: [], rowY: 0, halfW: 10, halfH: 10 })).toBe(-1);
    });
});
