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
        Ads.show('illusionExtra' as any, host, { onSuccess: () => {}, onSkip: () => {} });
        expect(calls).toHaveLength(2);
        expect(calls[1].place).toBe('illusionExtra');
    });

    it('onSkip 同样解除 inFlight', () => {
        const host = {} as any;
        Ads.show('dailyGift' as any, host, { onSuccess: () => {}, onSkip: () => {} });
        calls[0].cb.onSkip!();
        Ads.show('dailyGift' as any, host, { onSuccess: () => {}, onSkip: () => {} });
        expect(calls).toHaveLength(2);
    });

    it('place/host 透传到 provider.show', () => {
        const host = { id: 'h' } as any;
        Ads.show('boxCharge' as any, host, { onSuccess: () => {} });
        expect(calls[0].place).toBe('boxCharge');
        expect(calls[0].host).toBe(host);
    });
});
