/**
 * 分享能力封装（PRD 2.4：图鉴/突破高光用于截图分享，提升二创传播）。
 * 抖音端走 tt.shareAppMessage（系统分享面板）；Web 调试端返回 false，调用方以 toast 提示。
 * 不采集任何用户数据，仅主动点击触发（合规：无强制分享）。
 */
import { isDouyinRuntime } from './DouyinAd';

export interface ShareOpts {
    title: string;
    /** 分享图（可选；不传用平台默认游戏卡片）。抖音端可传 tt.toTempFilePath 产物路径 */
    imageUrl?: string;
}

export class Share {
    static available(): boolean {
        if (!isDouyinRuntime()) return false;
        const tt = (globalThis as any).tt;
        return !!tt && typeof tt.shareAppMessage === 'function';
    }

    /** 发起分享；不可用/失败返回 false（调用方负责提示） */
    static share(opts: ShareOpts): boolean {
        const tt = (globalThis as any).tt;
        if (!this.available()) return false;
        try {
            tt.shareAppMessage({
                title: opts.title,
                ...(opts.imageUrl ? { imageUrl: opts.imageUrl } : {}),
            });
            return true;
        } catch (e) {
            console.warn('[fanren] share failed', e);
            return false;
        }
    }
}
