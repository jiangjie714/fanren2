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

// ---------- 广告模拟直通（抖音未嵌广告位期间的调试开关，#46 补充） ----------
// 背景：抖音端激励视频广告位须在字节后台逐个申请，未嵌入期间（ID 全空）所有
// 广告点都走 onSkip——护持清零、体力/翻倍发不出，重度流程跑不通。此开关开启后
// Ads.show 不再询问 provider，所有广告位立即按「已播完」结算（onSuccess 直通）。
// 持久化到平台 storage（Web localStorage / 抖音 tt.setStorageSync）；
// ⚠️ 提审/上线前必须关闭：虚假激励展示属审核风险项。

const SIM_KEY = 'fanren_ad_sim_auto';

function readSimFlag(): boolean {
    try {
        if (typeof localStorage !== 'undefined') return localStorage.getItem(SIM_KEY) === '1';
        const tt = (globalThis as any).tt;
        if (tt?.getStorageSync) return tt.getStorageSync(SIM_KEY) === '1';
    } catch { /* storage 不可用时按默认关 */ }
    return false;
}

function writeSimFlag(on: boolean): void {
    try {
        if (typeof localStorage !== 'undefined') {
            if (on) localStorage.setItem(SIM_KEY, '1');
            else localStorage.removeItem(SIM_KEY);
            return;
        }
        const tt = (globalThis as any).tt;
        if (tt?.setStorageSync) {
            if (on) tt.setStorageSync(SIM_KEY, '1');
            else tt.removeStorageSync(SIM_KEY);
        }
    } catch { /* 写失败仅影响下次启动的默认值 */ }
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
    /** 广告模拟直通开关（模块加载时从 storage 恢复上次会话的选择） */
    private static simAuto = readSimFlag();

    static setProvider(p: AdProvider) {
        this.provider = p;
    }

    /** 当前是否开启广告模拟直通（设置页诊断面板展示用） */
    static get simAutoSuccess(): boolean {
        return this.simAuto;
    }

    /** 切换广告模拟直通并持久化（提审前务必关闭） */
    static setSimAuto(on: boolean) {
        this.simAuto = on;
        writeSimFlag(on);
        console.warn(`[fanren] 广告模拟直通 = ${on ? '开（所有广告位立即发放）' : '关'}`);
    }

    static show(place: AdPlace, host: Node, cb: AdCallbacks) {
        // 模拟直通：跳过 provider，立即按「已播完」结算。同样走 inFlight 单飞守卫，
        // 防直通回调落地前连点造成重复发奖；异步回调保持与真实广告一致的
        // 「播完才发奖」时序，避免调用方在 onSuccess 里同步再弹广告的重入。
        if (this.simAuto) {
            if (this.inFlight) {
                console.warn(`[fanren] ad in flight, ignore show(${place})`);
                return;
            }
            this.inFlight = true;
            console.warn(`[fanren] 广告模拟直通：place=${place} 视为已播完`);
            setTimeout(() => {
                this.inFlight = false;
                cb.onSuccess();
            }, 0);
            return;
        }
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
