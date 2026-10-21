import { describe, it, expect } from 'vitest';
import { defaultSave, migrate } from '../assets/scripts/core/saveModel';

/**
 * v15 starter 字段（D1-60s T1，#59）。
 * 只测存档层：新手流的 UI/发放逻辑在 T4（tests/starter.test.ts 同文件追加）。
 */
describe('v15 starter 字段（D1-60s T1）', () => {
    it('defaultSave：version 15 + starter 白纸（新号走新手流）', () => {
        const d = defaultSave();
        expect(d.version).toBe(15);
        expect(d.starter).toEqual({ done: false, jiyuanGranted: false });
    });

    it('v14 零进度档（realmIndex=0 且 opens=0）迁移 → starter 白纸，不视为老玩家', () => {
        const raw = { version: 14, lingshi: 200, realmIndex: 0, stats: { opens: 0 } };
        const s = migrate(raw);
        expect(s.version).toBe(15);
        expect(s.starter).toEqual({ done: false, jiyuanGranted: false });
    });

    it('v14 老档 realmIndex>0 → done=true（不补课、不重复发 60 机缘）', () => {
        const raw = { version: 14, lingshi: 5000, realmIndex: 3, stats: { opens: 40 } };
        const s = migrate(raw);
        expect(s.version).toBe(15);
        expect(s.starter).toEqual({ done: true, jiyuanGranted: true });
    });

    it('v14 老档开过箱但 realmIndex=0 → done=true', () => {
        const raw = { version: 14, lingshi: 200, realmIndex: 0, stats: { opens: 5 } };
        const s = migrate(raw);
        expect(s.starter).toEqual({ done: true, jiyuanGranted: true });
    });

    it('v15 档 roundtrip：starter 布尔值原样保留（不按进度覆写）', () => {
        const done = { ...defaultSave(), version: 15, starter: { done: true, jiyuanGranted: true } };
        expect(migrate(done).starter).toEqual({ done: true, jiyuanGranted: true });
        const fresh = { ...defaultSave(), version: 15, starter: { done: false, jiyuanGranted: false } };
        expect(migrate(fresh).starter).toEqual({ done: false, jiyuanGranted: false });
        // 发过机缘但 done=false（理论上不该出现）：信任存档，不推导
        const half = { ...defaultSave(), version: 15, starter: { done: false, jiyuanGranted: true } };
        expect(migrate(half).starter).toEqual({ done: false, jiyuanGranted: true });
    });

    it('脏档钳制：starter 非对象按进度推导；脏值布尔化（同 migrateTutorial 口径）', () => {
        // ① 非对象 + 零进度 → 白纸
        expect(migrate({ version: 14, realmIndex: 0, stats: { opens: 0 }, starter: 'nope' }).starter)
            .toEqual({ done: false, jiyuanGranted: false });
        // ② 非对象 + 有进度 → 老玩家
        expect(migrate({ version: 14, realmIndex: 2, stats: { opens: 0 }, starter: null }).starter.done).toBe(true);
        // ③ 脏值布尔化
        const m3 = migrate({ ...defaultSave(), version: 15, starter: { done: 'yes', jiyuanGranted: 1 } });
        expect(m3.starter).toEqual({ done: true, jiyuanGranted: true });
        const m4 = migrate({ ...defaultSave(), version: 15, starter: { done: '', jiyuanGranted: 0 } });
        expect(m4.starter).toEqual({ done: false, jiyuanGranted: false });
    });

    it('更老档（v1）一路迁移到 v15，starter 按进度推导', () => {
        const vet = migrate({ version: 1, lingshi: 500, realmIndex: 1, stats: { opens: 3 } });
        expect(vet.version).toBe(15);
        expect(vet.starter.done).toBe(true);
        const fresh = migrate({ version: 1, lingshi: 500 });
        expect(fresh.version).toBe(15);
        expect(fresh.starter).toEqual({ done: false, jiyuanGranted: false });
    });

    it('未知版本仍重置为新档（version 15 + starter 白纸）', () => {
        expect(migrate({ version: 99 }).version).toBe(15);
        expect(migrate({ version: 99 }).starter).toEqual({ done: false, jiyuanGranted: false });
        expect(migrate(null).starter).toEqual({ done: false, jiyuanGranted: false });
    });
});
