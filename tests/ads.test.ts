import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Ads 依赖 cc（Color/Label/Node/tween）与 ui/ThemeLib。测试用自定义 provider 覆盖默认
// MockAdProvider，故两者均需 mock，避免加载真实引擎/UI 实现（本环境无法跑 Cocos）。
vi.mock('cc', () => ({
    Color: class {},
    Label: class {},
    Node: class {},
    tween: () => ({ delay: () => ({ call: () => ({ start: () => {} }) }) }),
}));
vi.mock('../assets/scripts/ui/ThemeLib', () => ({
    dimLayer: vi.fn(),
    label: vi.fn(),
    spriteButton: vi.fn(),
    spritePanel: vi.fn(),
    THEME: {},
    uinode: vi.fn(),
}));

import { Ads } from '../assets/scripts/infra/Ads';
import type { AdProvider, AdCallbacks } from '../assets/scripts/infra/Ads';

interface RecordedCall {
    place: string;
    host: unknown;
    cb: AdCallbacks;
}

let calls: RecordedCall[];

beforeEach(() => {
    vi.restoreAllMocks();
    calls = [];
    // 可控 provider：仅记录调用，不依赖 tween/真实弹窗
    const provider: AdProvider = {
        show: (place, host, cb) => {
            calls.push({ place: place as string, host, cb });
        },
    };
    Ads.setProvider(provider);
});

// 用例间隔离：若上一用例结束时广告仍在 inFlight（未结算，P0 单飞守卫未解除），
// 主动结算最后一次 show，避免 inFlight 泄漏到下一用例导致首 show 被静默忽略。
afterEach(() => {
    if ((Ads as any).inFlight && calls.length > 0) {
        calls[calls.length - 1].cb.onSuccess();
    }
});

describe('Ads.auditConfig（上线前广告位配置自检）', () => {
    it('总数与 AD_PLACES 对齐，configured + missing 自洽', () => {
        const a = Ads.auditConfig();
        expect(a.total, '广告位总数应等于 AD_PLACES 键数（M15 移除 expeditionRecall、增 trailRevive/trailHint 后为 10）').toBe(10);
        expect(a.configured + a.missing.length).toBe(a.total);
        expect(a.names).toHaveLength(a.total);
    });

    it('missing 里的位确实无 ID，其余位确实有 ID（防自检误报）', () => {
        const a = Ads.auditConfig();
        a.names.forEach((n) => {
            const inMissing = a.missing.indexOf(n.place) >= 0;
            expect(!!n.id, `${n.place} 的 ID 状态与 missing 判定不一致`).toBe(!inMissing);
        });
    });
});

describe('Ads single-flight（#P0 防连点重复发奖，Web mock 与抖音端统一入口）', () => {
    it('同帧二次 show 被忽略（inFlight 守卫），仅首次调 provider.show', () => {
        const host = {} as any;
        const cb1: AdCallbacks = { onSuccess: vi.fn(), onSkip: vi.fn() };
        const cb2: AdCallbacks = { onSuccess: vi.fn(), onSkip: vi.fn() };
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        Ads.show('dailyGift' as any, host, cb1);
        Ads.show('dailyGift' as any, host, cb2);
        expect(calls).toHaveLength(1);
        // provider.show 拿到的是 Ads 的包装回调；触发它应回调 cb1.onSuccess
        calls[0].cb.onSuccess();
        expect(cb1.onSuccess).toHaveBeenCalledTimes(1);
        expect(cb2.onSuccess).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('onSuccess 结算后 inFlight 解除，可再次触发并透传新 place', () => {
        const host = {} as any;
        Ads.show('dailyGift' as any, host, { onSuccess: () => {}, onSkip: () => {} });
        expect(calls).toHaveLength(1);
        calls[0].cb.onSuccess();
        Ads.show('doubleReward' as any, host, { onSuccess: () => {}, onSkip: () => {} });
        expect(calls).toHaveLength(2);
        expect(calls[1].place).toBe('doubleReward');
    });

    it('onSkip 同样解除 inFlight', () => {
        const host = {} as any;
        Ads.show('dailyGift' as any, host, { onSuccess: () => {}, onSkip: () => {} });
        calls[0].cb.onSkip!();
        Ads.show('dailyGift' as any, host, { onSuccess: () => {}, onSkip: () => {} });
        expect(calls).toHaveLength(2);
    });

    it('provider 同步抛异常后 inFlight 必须解除（否则该玩家所有广告入口永久失效）', () => {
        const host = {} as any;
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        const onSkip = vi.fn();
        // 真机场景：tt.createRewardedVideoAd 在广告位 ID 非法/未开通流量主时同步抛错
        Ads.setProvider({
            show: () => {
                throw new Error('createRewardedVideoAd failed');
            },
        });
        Ads.show('dailyGift' as any, host, { onSuccess: vi.fn(), onSkip });
        expect(onSkip, 'provider 抛错应降级为 onSkip，而非吞掉').toHaveBeenCalledTimes(1);
        expect((Ads as any).inFlight, 'inFlight 未解除 → 后续所有广告被静默忽略').toBe(false);

        // 关键回归：抛错之后仍能正常拉起广告
        calls.length = 0;
        Ads.setProvider({
            show: (place, h, cb) => {
                calls.push({ place: place as string, host: h, cb });
            },
        });
        Ads.show('protect' as any, host, { onSuccess: () => {} });
        expect(calls, '抛错后应能重新拉起广告').toHaveLength(1);
        calls[0].cb.onSuccess();
        err.mockRestore();
    });

    it('place/host 透传到 provider.show', () => {
        const host = { id: 'h' } as any;
        Ads.show('boxCharge' as any, host, { onSuccess: () => {} });
        expect(calls[0].place).toBe('boxCharge');
        expect(calls[0].host).toBe(host);
    });
});

describe('Ads 模拟直通（抖音未嵌广告位期间调试开关，提审前必须关闭）', () => {
    beforeEach(() => {
        // 用例隔离：确保开关回落到默认关闭（node 环境无 storage，setSimAuto(false) 幂等）
        Ads.setSimAuto(false);
    });

    it('默认关闭：正常询问 provider', () => {
        expect(Ads.simAutoSuccess).toBe(false);
        Ads.show('dailyGift' as any, {} as any, { onSuccess: () => {} });
        expect(calls).toHaveLength(1);
    });

    it('开启后不询问 provider，异步按已播完结算 onSuccess', async () => {
        Ads.setSimAuto(true);
        expect(Ads.simAutoSuccess).toBe(true);
        const onSuccess = vi.fn();
        const onSkip = vi.fn();
        Ads.show('trialRevive' as any, {} as any, { onSuccess, onSkip });
        // 同步阶段：provider 不被触碰（抖音端 ID 全空时本会走 onSkip 卡死流程）
        expect(calls).toHaveLength(0);
        expect(onSuccess).not.toHaveBeenCalled();
        // 异步回调落地：视为已播完
        await new Promise((r) => setTimeout(r, 0));
        expect(onSuccess).toHaveBeenCalledTimes(1);
        expect(onSkip).not.toHaveBeenCalled();
        expect((Ads as any).inFlight, '直通结算后 inFlight 应解除').toBe(false);
    });

    it('直通同样受 single-flight 守卫：回调落地前连点不重复发奖', async () => {
        Ads.setSimAuto(true);
        const onSuccess = vi.fn();
        Ads.show('doubleReward' as any, {} as any, { onSuccess });
        Ads.show('doubleReward' as any, {} as any, { onSuccess });
        await new Promise((r) => setTimeout(r, 0));
        expect(onSuccess, '连点只发一次奖').toHaveBeenCalledTimes(1);
    });

    it('关闭后恢复询问 provider（提审口径回归）', async () => {
        Ads.setSimAuto(true);
        Ads.show('protect' as any, {} as any, { onSuccess: () => {} });
        await new Promise((r) => setTimeout(r, 0));
        Ads.setSimAuto(false);
        Ads.show('protect' as any, {} as any, { onSuccess: () => {} });
        expect(calls, '关闭后应回到真实 provider 路径').toHaveLength(1);
        calls[0].cb.onSuccess();
    });
});
