/**
 * 广告服务：统一激励广告入口，玩家主动触发，绝不自动弹出。
 * Web/调试用模拟弹窗；抖音端由平台 Provider 接入真实激励视频。
 */
import { Color, Label, Node, tween } from 'cc';
import { AdPlace } from '../core/config/ads';
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
        this.provider.show(place, host, {
            onSuccess: () => { settle(); cb.onSuccess(); },
            onSkip: () => { settle(); cb.onSkip?.(); },
        });
    }
}
