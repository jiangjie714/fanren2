/**
 * 广告服务：统一激励广告入口，玩家主动触发，绝不自动弹出。
 * Web/调试用模拟弹窗；抖音端由平台 Provider 接入真实激励视频。
 */
import { Color, Label, Node, tween } from 'cc';
import { AD_PLACES, AdPlace, DOUYIN_AD_UNIT_IDS } from '../core/config/ads';
import { TEXTS } from '../core/config/texts';
import { dimLayer, label, spriteButton, spritePanel, THEME, uinode } from '../ui/ThemeLib';

export interface AdCallbacks {
    onSuccess: () => void;
    /** 用户中途关闭或加载失败 */
    onSkip?: () => void;
}

export interface AdProvider {
    show(place: AdPlace, host: Node, cb: AdCallbacks): void;
}

/** 广告位配置自检结果（上线前核对用，见 Ads.auditConfig） */
export interface AdConfigAudit {
    total: number;
    configured: number;
    /** 尚未填入 adUnitId 的广告位 */
    missing: AdPlace[];
    names: Array<{ place: AdPlace; name: string; id: string }>;
}

class MockAdProvider implements AdProvider {
    show(place: AdPlace, host: Node, cb: AdCallbacks) {
        void place;
        const layer = dimLayer(host, 130);
        const dialog = spritePanel(layer, 572, 372, undefined, THEME.panelBg);
        label(dialog, TEXTS.adSimTitle, 34, {
            bold: true,
            color: THEME.goldLight,
        }).setPosition(0, 112, 0);
        label(dialog, 'Web 调试模拟 · 抖音端为真实激励视频', 22, { color: THEME.inkSoft })
            .setPosition(0, 62, 0);
        const cdNode = label(dialog, '3', 64, { bold: true, color: THEME.goldLight });
        cdNode.setPosition(0, -18, 0);
        const cd = cdNode.getComponent(Label)!;

        const skip = spriteButton(dialog, 236, 76, '跳过', () => {
            layer.destroy();
            cb.onSkip?.();
        }, {
            fontSize: 28,
            variant: 'ghost',
            textColor: THEME.ink,
        });
        skip.node.setPosition(0, -118, 0);

        let left = 3;
        const tick = () => {
            left -= 1;
            if (left > 0) {
                cd.string = String(left);
                tween(dialog).delay(1).call(tick).start();
            } else {
                layer.destroy();
                cb.onSuccess();
            }
        };
        tween(dialog).delay(1).call(tick).start();
    }
}

export class Ads {
    private static provider: AdProvider = new MockAdProvider();
    /** 是否有广告正在展示（P1-4 single-flight） */
    private static inFlight = false;

    static setProvider(p: AdProvider) {
        this.provider = p;
    }

    static show(place: AdPlace, host: Node, cb: AdCallbacks) {
        // single-flight：上一支广告未结束（回调未触发）时忽略后续触发。
        // 抖音端连点会在同一 ad 实例上叠加多组 onClose/onError，看完一支
        // 却触发多份 onSuccess → 重复发奖。放统一入口同时覆盖 Web mock。
        if (this.inFlight) {
            console.warn(`[fanren] ad in flight, ignore show(${place})`);
            return;
        }
        this.inFlight = true;
        const settle = () => { this.inFlight = false; };
        const wrapped: AdCallbacks = {
            onSuccess: () => { settle(); cb.onSuccess(); },
            onSkip: () => { settle(); cb.onSkip?.(); },
        };
        try {
            this.provider.show(place, host, wrapped);
        } catch (e) {
            // provider 同步抛异常时必须解除 inFlight：否则该玩家此后**所有**广告
            // 入口都会被上面的守卫永久静默忽略，且无任何恢复路径（重进游戏也无效，
            // 静态字段不随场景重建）。真机触发场景：tt.createRewardedVideoAd 在
            // 广告位 ID 非法 / 未开通流量主 / 部分机型上会同步抛错。
            settle();
            console.error(`[fanren] ad provider threw, place=${place}`, e);
            wrapped.onSkip();
        }
    }

    /**
     * 广告位配置自检（上线前用）：返回已配/未配清单。
     * 7 个位要逐个在字节后台申请，漏配一个只能等玩家点到那一处才在 warn 里发现，
     * 故在设置页长按诊断面板里一次性列出，便于上线前核对。
     */
    static auditConfig(): AdConfigAudit {
        const places = Object.keys(AD_PLACES) as AdPlace[];
        const missing = places.filter((p) => !DOUYIN_AD_UNIT_IDS[p]);
        return {
            total: places.length,
            configured: places.length - missing.length,
            missing,
            names: places.map((p) => ({ place: p, name: AD_PLACES[p].name, id: DOUYIN_AD_UNIT_IDS[p] })),
        };
    }
}
