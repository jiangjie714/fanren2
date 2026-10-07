/**
 * 抖音小游戏激励广告 Provider（PRD 2.5）：
 * 通过 tt.createRewardedVideoAd 拉起激励视频，看完发奖，中途关闭走 onSkip。
 * 广告位 ID 在 core/config/ads.ts 配置；未配置 ID 或非抖音端自动降级为跳过。
 */
import { AdCallbacks, AdProvider } from './Ads';
import { AdPlace, DOUYIN_AD_UNIT_IDS } from '../core/config/ads';

/** 抖音全局对象（仅小游戏端存在；类型保持宽松以通过无 tt 环境编译） */
declare const tt: any;

interface RewardedVideoAd {
    load(): Promise<void>;
    show(): Promise<void>;
    onClose(cb: (res: { isEnded?: boolean }) => void): void;
    offClose(cb: (res: { isEnded?: boolean }) => void): void;
    onError(cb: (err: unknown) => void): void;
    offError(cb: (err: unknown) => void): void;
}

export class DouyinAdProvider implements AdProvider {
    private ads = new Map<AdPlace, RewardedVideoAd>();

    show(place: AdPlace, _host: unknown, cb: AdCallbacks) {
        const adUnitId = DOUYIN_AD_UNIT_IDS[place];
        if (typeof tt === 'undefined' || !adUnitId) {
            // 非抖音端或未配置广告位：视为跳过并发可见反馈（调用方 onSkip toast），
            // 控制台留痕便于上线前发现漏配。调试期可在 设置页长按 → 广告模拟直通
            // 让所有广告位立即按已播完发放（提审前必须关闭）。
            console.warn(`[fanren] 广告位未配置或非抖音端，place=${place}`);
            cb.onSkip?.();
            return;
        }
        let ad = this.ads.get(place);
        if (!ad) {
            ad = tt.createRewardedVideoAd({ adUnitId });
            this.ads.set(place, ad);
        }
        const onClose = (res: { isEnded?: boolean }) => {
            detach();
            if (res && res.isEnded) cb.onSuccess();
            else cb.onSkip?.();
        };
        const onError = () => {
            detach();
            cb.onSkip?.();
        };
        const detach = () => {
            ad!.offClose(onClose);
            ad!.offError(onError);
        };
        ad.onClose(onClose);
        ad.onError(onError);
        ad.show().catch(() => {
            // 首次拉取失败：加载后重试一次
            ad!.load()
                .then(() => ad!.show())
                .catch(() => {
                    detach();
                    cb.onSkip?.();
                });
        });
    }
}

/** 当前是否运行在抖音小游戏端 */
export function isDouyinRuntime(): boolean {
    return typeof tt !== 'undefined';
}
