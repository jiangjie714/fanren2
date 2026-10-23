import { describe, it, expect } from 'vitest';
import { defaultSave, migrate } from '../assets/scripts/core/saveModel';

/**
 * v15 starter 字段（D1-60s T1，#59）。
 * 只测存档层：新手流的 UI/发放逻辑在 T4（tests/starter.test.ts 同文件追加）。
 */
describe('v15 starter 字段（D1-60s T1）', () => {
    it('defaultSave：version 15 + starter 白纸（新号走新手流）', () => {
        const d = defaultSave();
        expect(d.version).toBe(17);
        expect(d.starter).toEqual({ done: false, jiyuanGranted: false });
    });

    it('v14 零进度档（realmIndex=0 且 opens=0）迁移 → starter 白纸，不视为老玩家', () => {
        const raw = { version: 14, lingshi: 200, realmIndex: 0, stats: { opens: 0 } };
        const s = migrate(raw);
        expect(s.version).toBe(17);
        expect(s.starter).toEqual({ done: false, jiyuanGranted: false });
    });

    it('v14 老档 realmIndex>0 → done=true（不补课、不重复发 60 机缘）', () => {
        const raw = { version: 14, lingshi: 5000, realmIndex: 3, stats: { opens: 40 } };
        const s = migrate(raw);
        expect(s.version).toBe(17);
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
        expect(vet.version).toBe(17);
        expect(vet.starter.done).toBe(true);
        const fresh = migrate({ version: 1, lingshi: 500 });
        expect(fresh.version).toBe(17);
        expect(fresh.starter).toEqual({ done: false, jiyuanGranted: false });
    });

    it('未知版本仍重置为新档（version 17 + starter 白纸）', () => {
        expect(migrate({ version: 99 }).version).toBe(17);
        expect(migrate({ version: 99 }).starter).toEqual({ done: false, jiyuanGranted: false });
        expect(migrate(null).starter).toEqual({ done: false, jiyuanGranted: false });
    });
});

/**
 * v17 解锁表适用范围（D1-60s §4「只对新号生效」）。
 *
 * 判定重点不是字段能否保存，而是**新老号的划分口径**：老玩家不能被收走入口，
 * 新号必须按表走。`starter.done` 两方都是 true，所以只能靠这个独立布尔。
 */
describe('v17 unlocks.seasoned（解锁表只对新号生效）', () => {
    it('白纸新档 → seasoned=false（按境界表逐步解锁）', () => {
        expect(defaultSave().unlocks).toEqual({ seasoned: false });
    });

    it('v16 有进度老档 → seasoned=true（全开，不削减已有入口）', () => {
        expect(migrate({ version: 16, realmIndex: 1 }).unlocks.seasoned).toBe(true);
        expect(migrate({ version: 16, realmIndex: 4 }).unlocks.seasoned).toBe(true);
        expect(migrate({ version: 16, stats: { opens: 5 } }).unlocks.seasoned).toBe(true);
    });

    it('v16 零进度档 → seasoned=false（这就是全新号）', () => {
        expect(migrate({ version: 16 }).unlocks.seasoned).toBe(false);
        expect(migrate({ version: 15, realmIndex: 0, stats: { opens: 0 } }).unlocks.seasoned).toBe(false);
    });

    it('已带 unlocks 的档布尔化；脏值落 false（宁可当新号，也不漏全开）', () => {
        expect(migrate({ version: 17, unlocks: { seasoned: true } }).unlocks.seasoned).toBe(true);
        expect(migrate({ version: 17, unlocks: { seasoned: 1 } }).unlocks.seasoned).toBe(true);
        expect(migrate({ version: 17, unlocks: {} }).unlocks.seasoned).toBe(false);
        expect(migrate({ version: 17, unlocks: null }).unlocks.seasoned).toBe(false);
        expect(migrate({ version: 17, unlocks: 'yes' }).unlocks.seasoned).toBe(false);
    });

    it('v16 → v17 不丢任何既有字段（天数/天劫/宗门原样保留）', () => {
        const old: any = defaultSave();
        old.version = 16;
        old.realmIndex = 2;
        old.lingshi = 1234;
        old.tianjie.best = 88;
        old.sect.id = 'qingyun';
        const m = migrate(old);
        expect(m.version).toBe(17);
        expect(m.lingshi).toBe(1234);
        expect(m.realmIndex).toBe(2);
        expect(m.tianjie.best).toBe(88);
        expect(m.sect.id).toBe('qingyun');
        expect(m.unlocks.seasoned).toBe(true);
    });
});
