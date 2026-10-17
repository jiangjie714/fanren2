/**
 * 离线吐纳的**入账层**（M29，docs/数值假设.md #55）。
 *
 * 判定与额度推进全在 `core/offline.ts`（纯函数），本层只做三件事：
 * ① 在线心跳（把「此刻」记为在线，使离线时长只统计真正没在玩的时间）；
 * ② 结算并把产出写进既有账本；
 * ③ 输入输出 runs-only 的结果，供 `Game` 暂存给首页弹窗。
 *
 * 入账口径（复刻既有：**不开新的加钱口子**）：
 * - 灵石 `addLingshi(n, false)` —— 免费发放不吃小等级加成（与签到 #53、灵石救济 #19 同口径）；
 * - 修为 `addXiuwei(n, true)` —— 吃既有获取加成（灵根图鉴 + 炼丹智力四维），与主线产出同口径。
 */
import { SaveData } from '../saveModel';
import {
    OfflineGain,
    OfflineView,
    heartbeat,
    offlineView,
    settleOffline,
} from '../offline';
import { EconomySystem } from './EconomySystem';

export class OfflineSystem {
    constructor(private eco?: EconomySystem) {}

    /** 在线心跳：每 ~1s 调一次即可（不需要每帧） */
    touch(save: SaveData, now: number = Date.now()): void {
        heartbeat(save, now);
    }

    /** 当前可结算视图（派生；会惰性翻新日额度，不入账） */
    view(save: SaveData, now: number = Date.now()): OfflineView {
        return offlineView(save, now);
    }

    /**
     * 结算并入账（回到前台 / 启动时调用）。
     * 返回 null = 本次没有可结算收益（未过门槛或当日额度已尽）。
     */
    settle(save: SaveData, now: number = Date.now()): OfflineGain | null {
        const g = settleOffline(save, now);
        if (!g) return null;
        if (g.xiuwei > 0 && this.eco) this.eco.addXiuwei(g.xiuwei, true);
        if (g.lingshi > 0 && this.eco) this.eco.addLingshi(g.lingshi, false);
        return g;
    }
}
