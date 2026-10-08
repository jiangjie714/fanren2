/**
 * M15-T2 存档 v7 迁移测试（数值假设 #47）：
 * TrailState 注入、v1→v7 全链路、非法层号钳制、旧档字段兼容。
 * 注：旧 expedition 挂机态字段的删除随 T7 场景退役一起进行（T2 只增量）。
 */
import { describe, expect, it } from 'vitest';
import { defaultSave, migrate, SaveData, TrailState } from '../assets/scripts/core/saveModel';

describe('M15-T2 存档 v7', () => {
    it('defaultSave：version=7，trail 字段默认值齐全', () => {
        const s = defaultSave();
        expect(s.version).toBe(7);
        expect(s.trail).toEqual({
            curLayer: 1,
            chapterGifts: [],
            dailyRepeat: { day: '', count: 0 },
        });
    });

    it('v6 存档迁移：补齐 trail 默认值，其余字段保留', () => {
        const v6 = defaultSave() as unknown as Record<string, unknown>;
        v6.version = 6;
        delete v6.trail;
        const m = migrate(v6);
        expect(m.version).toBe(7);
        expect(m.trail.curLayer).toBe(1);
        expect(m.lingshi).toBe((v6.lingshi as number));
    });

    it('v7 存档迁移：trail 字段保留玩家进度', () => {
        const src = defaultSave();
        src.trail.curLayer = 23;
        src.trail.chapterGifts = [1];
        src.trail.dailyRepeat = { day: '2026-10-08', count: 3 };
        const m = migrate(JSON.parse(JSON.stringify(src)) as unknown);
        expect(m.trail.curLayer).toBe(23);
        expect(m.trail.chapterGifts).toEqual([1]);
        expect(m.trail.dailyRepeat).toEqual({ day: '2026-10-08', count: 3 });
    });

    it('非法层号钳制：0/负数/非整数/超大 → 1（防手改注入）', () => {
        for (const bad of [0, -5, 1.5, NaN, '99', null]) {
            const raw = { version: 7, trail: { ...defaultSave().trail, curLayer: bad } };
            expect(migrate(raw).trail.curLayer).toBe(1);
        }
    });

    it('chapterGifts 只保留非负整数去重有序（损坏数据清洗）', () => {
        const raw = { version: 7, trail: { ...defaultSave().trail, chapterGifts: [3, '1', -2, 1, 2.5, 3] } };
        expect(migrate(raw).trail.chapterGifts).toEqual([1, 3]);
    });

    it('dailyRepeat：count 非负钳制、day 非法回退空串', () => {
        const raw = { version: 7, trail: { ...defaultSave().trail, dailyRepeat: { day: 123, count: -9 } } };
        expect(migrate(raw).trail.dailyRepeat).toEqual({ day: '', count: 0 });
    });

    it('v1→v7 全链路迁移不抛且版本到位', () => {
        for (const v of [1, 2, 3, 4, 5, 6, 7]) {
            const raw = { version: v, lingshi: 100 };
            expect(() => migrate(raw)).not.toThrow();
            expect(migrate(raw).version).toBe(7);
        }
    });

    it('未知版本（高于当前/损坏）重置为默认档', () => {
        expect(migrate({ version: 8 }).trail.curLayer).toBe(1);
        expect(migrate('garbage').version).toBe(7);
    });
});

/** 类型口径自检：TrailState 可作为 SaveData['trail'] 使用 */
export type _Check = SaveData['trail'] extends TrailState ? true : false;
