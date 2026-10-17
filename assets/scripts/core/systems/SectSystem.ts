/**
 * M31 宗门社交（A18，docs/数值假设.md #57）的**入账层**。
 *
 * 判定与状态推进全在 `core/sect.ts`（纯函数），本层只做两件事：
 * 把奖励/扣支写进既有账本（EconomySystem），并给场景一个统一入口。
 *
 * 发奖统一复用既有账本，**不开新的加钱口子**：
 * - 修为走 `addXiuwei(n, true)` —— 宗门是玩法产出，吃既有获取加成（同主线口径）；
 * - 机缘走 `addJiyuan`；碎片走 `save.fragments` 直写（同 QuestSystem/TrialSystem 口径）；
 * - 捐献扣灵石走 `eco.spend(n)`（**纯沉没**，20% 返贡献点是唯一回流）。
 */
import { SaveData, todayString } from '../saveModel';
import { STAMINA_MAX } from '../config/trial';
import {
    SectGain,
    SectShopGive,
    claimSalary,
    donate,
    claimHelp,
    buyShopItem,
} from '../sect';
import { EconomySystem } from './EconomySystem';

export class SectSystem {
    constructor(private eco?: EconomySystem) {}

    /** 领俸禄并入账（修为 + 贡献点已在判定层写回；碎片在此入账） */
    claimSalary(save: SaveData, now: Date = new Date()): SectGain | null {
        const g = claimSalary(save, todayString(now));
        if (!g) return null;
        if (g.xiuwei > 0 && this.eco) this.eco.addXiuwei(g.xiuwei, true);
        if (g.frag > 0) save.fragments['jinmu'] = (save.fragments['jinmu'] ?? 0) + g.frag;
        return g;
    }

    /** 捐献一档（扣灵石 + 判定层推进 exp/contrib）；余额不足/超日限返回 null */
    donate(save: SaveData, tier: number, now: Date = new Date()) {
        const r = donate(save, tier, todayString(now));
        if (!r) return null;
        if (this.eco) this.eco.spend(tier);
        return r;
    }

    /** 领取道友助力并入账（修为；贡献点判定层已写回） */
    claimHelp(save: SaveData, now: Date = new Date()) {
        const r = claimHelp(save, todayString(now));
        if (!r) return null;
        if (r.gain.xiuwei > 0 && this.eco) this.eco.addXiuwei(r.gain.xiuwei, true);
        return r;
    }

    /** 购买商店商品（贡献点判定层已扣；give 在此入账） */
    buyShopItem(save: SaveData, id: string, now: Date = new Date()): SectShopGive | null {
        const give = buyShopItem(save, id, todayString(now));
        if (!give) return null;
        if (give.lingshi && give.lingshi > 0 && this.eco) this.eco.addLingshi(give.lingshi, false);
        if (give.jiyuan && give.jiyuan > 0 && this.eco) this.eco.addJiyuan(give.jiyuan);
        const frags = give.fragments ?? {};
        Object.keys(frags).forEach((fid) => {
            const n = frags[fid];
            if (n > 0) save.fragments[fid] = (save.fragments[fid] ?? 0) + n;
        });
        if (give.stamina && give.stamina > 0) {
            save.trial.stamina = Math.min(STAMINA_MAX, save.trial.stamina + give.stamina);
        }
        if (give.pkCharge && give.pkCharge > 0) {
            save.daily.pkUsed = Math.max(0, save.daily.pkUsed - give.pkCharge);
        }
        return give;
    }
}
