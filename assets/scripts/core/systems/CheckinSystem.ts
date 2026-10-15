/**
 * 连续登录签到的**入账层**（M26，docs/数值假设.md #53）。
 *
 * 判定与状态推进全在 `core/checkin.ts`（纯函数），本层只做两件事：
 * 把奖励写进既有账本（EconomySystem / AlchemySystem / 修真宝盒券），
 * 并给场景一个「今天该显示什么」的视图。
 *
 * 发奖统一复用既有账本，**不开新的加钱口子**：
 * - 灵石走 `addLingshi(n, false)` —— 免费发放不吃小等级加成（与灵石救济 #19 同口径）；
 * - 机缘走 `addJiyuan`；灵材走 `AlchemySystem.addMaterial`；券走 `save.xiuzhenTickets`。
 */
import { SaveData, todayString } from '../saveModel';
import {
    CheckinMilestone,
    CheckinReward,
    CheckinView,
    checkinView,
    claimCheckin,
    claimMilestone,
} from '../checkin';
import { EconomySystem } from './EconomySystem';
import { AlchemySystem } from './AlchemySystem';

/** 可被入账的奖励形状（CheckinReward 与 CheckinMilestone 的公共部分） */
interface Grantable {
    lingshi: number;
    jiyuan: number;
    mats: Record<string, number>;
}

export class CheckinSystem {
    constructor(
        private eco?: EconomySystem,
        private alch?: AlchemySystem,
    ) {}

    /** 当前签到视图（派生，不改存档） */
    view(save: SaveData, now: Date = new Date()): CheckinView {
        return checkinView(save, todayString(now));
    }

    /** 领取今日签到并入账；今日已领返回 null（幂等） */
    claim(save: SaveData, now: Date = new Date()): CheckinReward | null {
        const r = claimCheckin(save, todayString(now));
        if (!r) return null;
        this.grant(save, r);
        return r;
    }

    /** 领取累计里程碑并入账；未达标 / 已领过返回 null */
    claimMilestone(save: SaveData, days: number): CheckinMilestone | null {
        const m = claimMilestone(save, days);
        if (!m) return null;
        this.grant(save, m);
        if (m.tickets > 0) save.xiuzhenTickets += m.tickets;
        return m;
    }

    private grant(save: SaveData, r: Grantable): void {
        if (r.lingshi > 0 && this.eco) this.eco.addLingshi(r.lingshi, false);
        if (r.jiyuan > 0 && this.eco) this.eco.addJiyuan(r.jiyuan);
        if (!this.alch) return;
        const ids = Object.keys(r.mats ?? {});
        for (let i = 0; i < ids.length; i++) {
            const n = r.mats[ids[i]];
            if (n > 0) this.alch.addMaterial(save, ids[i], n);
        }
    }
}
