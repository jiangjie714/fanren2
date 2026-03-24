/** 灵根收集系统：碎片累计、合成解锁、图鉴加成（PRD 2.4） */
import { SaveData } from '../saveModel';
import { getLingeng, LINGENS } from '../config/lingens';

export class CollectionSystem {
    addFragment(save: SaveData, id: string, n: number): void {
        save.fragments[id] = (save.fragments[id] ?? 0) + n;
    }

    fragmentsOf(save: SaveData, id: string): number {
        return save.fragments[id] ?? 0;
    }

    needOf(id: string): number {
        return getLingeng(id).need;
    }

    canCompose(save: SaveData, id: string): boolean {
        if (save.unlocked.includes(id)) return false;
        return this.fragmentsOf(save, id) >= this.needOf(id);
    }

    /** 合成解锁：扣碎片、点亮图鉴；返回是否成功 */
    compose(save: SaveData, id: string): boolean {
        if (!this.canCompose(save, id)) return false;
        save.fragments[id] -= this.needOf(id);
        save.unlocked.push(id);
        return true;
    }

    /** 已解锁灵根的修为加成总和（乘算基数 1 + Σ加成） */
    totalBonus(save: SaveData): number {
        let b = 0;
        for (const id of save.unlocked) {
            b += getLingeng(id).xiuweiBonus;
        }
        return 1 + b;
    }

    /** 图鉴总进度：已解锁 / 全部 */
    progress(save: SaveData): { unlocked: number; total: number } {
        return { unlocked: save.unlocked.length, total: LINGENS.length };
    }
}
