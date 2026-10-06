/**
 * M9b 真机联调自检捕获的单元测试：验证 DouyinSocial 在每条集成路径上把最新状态写入 diagState，
 * 供 SettingsScene 长按诊断面板在真机上读取（逻辑路径不受影响）。
 * 因 DouyinSocial 经 DouyinAd → Ads 间接 import 'cc'/'ui/ThemeLib'，这里用最小桩隔离。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DouyinSocial } from '../assets/scripts/infra/DouyinSocial';
import { defaultSave } from '../assets/scripts/core/saveModel';

vi.mock('cc', () => new Proxy({}, { get: () => undefined }));
vi.mock('../assets/scripts/ui/ThemeLib', () => new Proxy({}, { get: () => undefined }));

let posted: any[] = [];
let stored: any[] = [];
let messageHandlers: any[] = [];

function installTt(overrides: Record<string, any> = {}) {
    (globalThis as any).tt = {
        getOpenDataContext: () => ({
            postMessage: (m: any) => posted.push(m),
            canvas: { width: 660, height: 640 },
        }),
        setUserCloudStorage: (o: any) => stored.push(o),
        onMessage: (h: any) => messageHandlers.push(h),
        offMessage: () => {},
        ...overrides,
    };
}

beforeEach(() => {
    posted = [];
    stored = [];
    messageHandlers = [];
    installTt();
});

afterEach(() => {
    delete (globalThis as any).tt;
});

describe('M9b 真机联调自检捕获', () => {
    it('available() 捕获运行时与开放数据域状态（无 tt → false）', () => {
        delete (globalThis as any).tt;
        expect(DouyinSocial.available()).toBe(false);
        expect(DouyinSocial.getDiag().runtime).toBe(false);

        installTt();
        expect(DouyinSocial.available()).toBe(true);
        const d = DouyinSocial.getDiag();
        expect(d.runtime).toBe(true);
        expect(d.available).toBe(true);
    });

    it('requestRank 计数 + 主→子渲染消息', () => {
        const before = DouyinSocial.getDiag().rankRequestCount;
        DouyinSocial.requestRank('realm_value');
        expect(posted.some((m) => m.type === 'renderRank' && m.key === 'realm_value')).toBe(true);
        expect(DouyinSocial.getDiag().rankRequestCount).toBe(before + 1);
    });

    it('getSharedCanvas 捕获子域画布尺寸', () => {
        const c = DouyinSocial.getSharedCanvas();
        expect(c).not.toBeNull();
        expect(DouyinSocial.getDiag().sharedCanvas).toEqual({ w: 660, h: 640 });
    });

    it('reportScores 上报三榜并捕获 KV 值与时间戳', () => {
        const save = defaultSave();
        save.realmIndex = 3;
        save.xiuwei = 12345;
        save.illusionWeekKey = 'W-2026-10-05';
        save.illusionWeekBest = 88;
        save.stats.bestTribScore = 777;
        new DouyinSocial().reportScores(save);

        expect(stored.length).toBe(3);
        expect(DouyinSocial.getDiag().lastReport?.values).toMatchObject({
            realm_value: 3 * 1_000_000 + 12345, // 300012345
            illusion_week: 20261005 * 1000 + 88, // 20261005088
            tribulation_best: 777,
        });
    });

    it('compare 经子域回传捕获 lastCompare 与计数', () => {
        const before = DouyinSocial.getDiag().compareCount;
        let res: any = 'pending';
        DouyinSocial.compare('tribulation_best', 777, (r) => {
            res = r;
        });
        expect(posted.some((m) => m.type === 'compare')).toBe(true);

        const h = messageHandlers[messageHandlers.length - 1];
        h({ type: 'compareResult', beat: 2, total: 5, top: 999 });

        expect(res).toEqual({ beat: 2, total: 5, top: 999 });
        expect(DouyinSocial.getDiag().lastCompare).toEqual({ beat: 2, total: 5, top: 999 });
        expect(DouyinSocial.getDiag().compareCount).toBe(before + 1);
    });

    it('compare 在无开放数据域时立即回调 null（降级）', () => {
        delete (globalThis as any).tt;
        let r3: any = 'pending';
        DouyinSocial.compare('realm_value', 1, (r) => {
            r3 = r;
        });
        expect(r3).toBeNull();
    });

    it('compare 子域 800ms 无响应 → 超时降级并记录 lastError', () => {
        vi.useFakeTimers();
        installTt();
        let r4: any = 'pending';
        DouyinSocial.compare('realm_value', 1, (r) => {
            r4 = r;
        });
        vi.advanceTimersByTime(900);
        expect(r4).toBeNull();
        expect(DouyinSocial.getDiag().lastError).toContain('超时');
        vi.useRealTimers();
    });
});
