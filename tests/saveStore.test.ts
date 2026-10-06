/**
 * SaveStore 持久化护栏测试（P3 测试缺口 — 原零覆盖，P0 藏身之处）。
 *
 * SaveStore 依赖 'cc' 的 sys.localStorage，这里用 vi.mock 提供最小桩：
 * 内存版 localStorage（可注入写入失败以验证重试 / 坏档隔离逻辑）。
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
    const store: Record<string, string> = {};
    const setItem = vi.fn((k: string, v: string) => {
        store[k] = v;
    });
    let failNext = false;
    let failAll = false;
    return {
        store,
        setItem,
        get failNext() {
            return failNext;
        },
        set failNext(v: boolean) {
            failNext = v;
        },
        get failAll() {
            return failAll;
        },
        set failAll(v: boolean) {
            failAll = v;
        },
        get impl() {
            return {
                getItem: (k: string) => (k in store ? store[k] : null),
                setItem: (k: string, v: string) => {
                    if (failNext) {
                        failNext = false;
                        throw new Error('quota exceeded');
                    }
                    if (failAll) {
                        throw new Error('quota exceeded');
                    }
                    setItem(k, v);
                },
                removeItem: (k: string) => {
                    delete store[k];
                },
            };
        },
    };
});

vi.mock('cc', () => ({
    sys: {
        get localStorage() {
            return h.impl;
        },
    },
}));

import { SaveStore } from '../assets/scripts/infra/SaveStore';
import { defaultSave } from '../assets/scripts/core/saveModel';

const KEY = 'fanren_save_v1';
const KEY_CORRUPT = 'fanren_save_v1_corrupt_backup';

beforeEach(() => {
    for (const k of Object.keys(h.store)) delete h.store[k];
    h.setItem.mockClear();
    h.failNext = false;
    h.failAll = false;
    SaveStore.corrupted = false;
    // lastRaw 是 private static，跨测试保留会污染去重断言，这里直接清零
    (SaveStore as unknown as { lastRaw: string | null }).lastRaw = null;
});

describe('SaveStore.load', () => {
    it('无存档时返回 v5 默认档', () => {
        const save = SaveStore.load();
        expect(save.version).toBe(5);
        expect(SaveStore.corrupted).toBe(false);
    });

    it('坏档不静默丢：隔离备份 + 重置新档 + 置 corrupted 标记', () => {
        const corrupt = '{ "version": 5, "lingshi": '; // 截断的非法 JSON
        h.store[KEY] = corrupt;
        const save = SaveStore.load();
        expect(SaveStore.corrupted).toBe(true);
        // 原坏档已隔离备份，便于人工恢复
        expect(h.store[KEY_CORRUPT]).toBe(corrupt);
        // 玩家拿到一份可用新档而非卡死
        expect(save.version).toBe(5);
    });
});

describe('SaveStore.persist', () => {
    it('首写落盘到 KEY', () => {
        const data = defaultSave();
        SaveStore.persist(data);
        expect(h.setItem).toHaveBeenCalledTimes(1);
        expect(h.store[KEY]).toBe(JSON.stringify(data));
    });

    it('内容未变跳过重复 setItem（P2-5 去重）', () => {
        const data = defaultSave();
        SaveStore.persist(data);
        SaveStore.persist(data);
        expect(h.setItem).toHaveBeenCalledTimes(1);
    });

    it('写入失败重试一次，重试成功则最终落盘', () => {
        h.failNext = true; // 第一次抛，第二次（重试）成功
        const data = defaultSave();
        SaveStore.persist(data);
        // 首次抛错不计入成功路径的 setItem mock；重试成功记 1 次
        expect(h.setItem).toHaveBeenCalledTimes(1);
        expect(h.store[KEY]).toBe(JSON.stringify(data));
    });

    it('连续两次写入失败不抛错（内存态与磁盘分叉，仅记日志）', () => {
        h.failAll = true; // 首次 + 重试均抛
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const data = defaultSave();
        expect(() => SaveStore.persist(data)).not.toThrow();
        // 首次 + 重试均抛，不落盘；仅记一次日志（不抛给上层）
        expect(h.setItem).toHaveBeenCalledTimes(0);
        expect(h.store[KEY]).toBeUndefined();
        expect(spy).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });
});
