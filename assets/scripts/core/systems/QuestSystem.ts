/** 修行日常系统：每日任务进度、活跃度与宝箱领取（数值假设 #27，纯逻辑可单测） */
import { Rng } from '../rng';
import { SaveData } from '../saveModel';
import { ACTIVITY_CHESTS, ACTIVITY_MAX, QUESTS, QUEST_ACTIVITY, QuestId } from '../config/quests';
import { fragmentPool } from '../config/lingens';
import { RewardItem } from './BoxSystem';
import { EconomySystem } from './EconomySystem';

export class QuestSystem {
    constructor(private eco: EconomySystem) {}

    /** 任务当前进度 */
    progressOf(save: SaveData, id: QuestId): number {
        return save.daily.questProgress[id] ?? 0;
    }

    /** 上报任务进度（可超目标，完成判定按 target） */
    progress(save: SaveData, id: QuestId, n = 1): void {
        save.daily.questProgress[id] = this.progressOf(save, id) + n;
    }

    isCompleted(save: SaveData, id: QuestId): boolean {
        const q = QUESTS.find((x) => x.id === id);
        return !!q && this.progressOf(save, id) >= q.target;
    }

    /** 当前活跃度 = 完成任务数 × 25，封顶 100 */
    activityOf(save: SaveData): number {
        const done = QUESTS.filter((q) => this.isCompleted(save, q.id)).length;
        return Math.min(ACTIVITY_MAX, done * QUEST_ACTIVITY);
    }

    isChestClaimed(save: SaveData, at: number): boolean {
        return save.daily.activityClaimed.includes(at);
    }

    /** 活跃度宝箱是否可领取（达标且未领） */
    canClaimChest(save: SaveData, at: number): boolean {
        return this.activityOf(save) >= at && !this.isChestClaimed(save, at);
    }

    /**
     * 领取活跃度宝箱：发奖励并记录档位。未达标/已领返回 []。
     * 30 → 灵石 250；60 → 修真宝盒券；100 → 机缘 50 + 普通灵根碎片 ×3（数值假设 #27）。
     */
    claimChest(save: SaveData, at: number, rng: Rng): RewardItem[] {
        if (!this.canClaimChest(save, at)) return [];
        const chest = ACTIVITY_CHESTS.find((c) => c.at === at);
        if (!chest) return [];
        save.daily.activityClaimed.push(at);
        const items: RewardItem[] = [];
        if (chest.lingshi) {
            const got = this.eco.addLingshi(chest.lingshi);
            items.push({ kind: 'lingshi', amount: got, label: `灵石 +${got}` });
        }
        if (chest.ticket) {
            save.xiuzhenTickets += chest.ticket;
            items.push({ kind: 'lingshi', amount: 0, label: '修真宝盒券 ×1' });
        }
        if (chest.jiyuan) {
            this.eco.addJiyuan(chest.jiyuan);
            items.push({ kind: 'jiyuan', amount: chest.jiyuan, label: `突破机缘 +${chest.jiyuan}` });
        }
        if (chest.fragments) {
            const pool = fragmentPool('fansu');
            const id = pool[rng.int(0, pool.length - 1)];
            save.fragments[id] = (save.fragments[id] ?? 0) + chest.fragments;
            items.push({ kind: 'fragment', amount: chest.fragments, lingengId: id, label: `灵根碎片 ×${chest.fragments}` });
        }
        return items;
    }
}
