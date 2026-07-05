/** M9a 成就系统：达成检测与奖励领取（幂等，纯逻辑可单测） */
import { SaveData } from '../saveModel';
import { ACHIEVEMENTS, AchievementConfig } from '../config/achievements';
import { RewardItem } from './BoxSystem';
import { EconomySystem } from './EconomySystem';

export class AchievementSystem {
    constructor(private eco: EconomySystem) {}

    metricOf(save: SaveData, cfg: AchievementConfig): number {
        return cfg.metric(save);
    }

    isReached(save: SaveData, id: string): boolean {
        return save.achievements.reached.includes(id);
    }

    isClaimed(save: SaveData, id: string): boolean {
        return save.achievements.claimed.includes(id);
    }

    /**
     * 扫描全部成就：指标达标且未记录 → 写入 reached 并返回"新达成"列表。
     * 幂等：重复调用只返回空。
     */
    check(save: SaveData): AchievementConfig[] {
        const fresh: AchievementConfig[] = [];
        for (const cfg of ACHIEVEMENTS) {
            if (this.isReached(save, cfg.id)) continue;
            if (cfg.metric(save) >= cfg.target) {
                save.achievements.reached.push(cfg.id);
                fresh.push(cfg);
            }
        }
        return fresh;
    }

    /** 当前可领取（已达成未领）的成就数（红点依据） */
    claimableCount(save: SaveData): number {
        return ACHIEVEMENTS.filter((a) => this.isReached(save, a.id) && !this.isClaimed(save, a.id)).length;
    }

    /**
     * 领取成就奖励：须已达成且未领取。发灵石（正向，计 lingshiEarned）与碎片。
     * 未达成/重复领取返回 []。
     */
    claim(save: SaveData, id: string, rng: { int: (min: number, max: number) => number }): RewardItem[] {
        if (!this.isReached(save, id) || this.isClaimed(save, id)) return [];
        const cfg = ACHIEVEMENTS.find((a) => a.id === id);
        if (!cfg) return [];
        save.achievements.claimed.push(id);
        const items: RewardItem[] = [];
        if (cfg.reward.lingshi) {
            const got = this.eco.addLingshi(cfg.reward.lingshi);
            items.push({ kind: 'lingshi', amount: got, label: `灵石 +${got}` });
        }
        if (cfg.reward.fragments) {
            // 统一走普通灵根碎片池
            const pool = ['jinmu', 'shuituo', 'huoyan'];
            const fid = pool[rng.int(0, pool.length - 1)];
            save.fragments[fid] = (save.fragments[fid] ?? 0) + cfg.reward.fragments;
            items.push({ kind: 'fragment', amount: cfg.reward.fragments, lingengId: fid, label: `灵根碎片 ×${cfg.reward.fragments}` });
        }
        return items;
    }
}
