/**
 * 存档持久化：Web 用 localStorage；Cocos 的 sys.localStorage 在抖音小游戏端同样可用。
 * 键名恒为 fanren_save_v1（靠 saveModel 内部 version 迁移，不要改名）。
 */
import { sys } from 'cc';
import { migrate, SaveData } from '../core/saveModel';

const KEY = 'fanren_save_v1';
/** 坏档隔离备份键（固定单键，重写覆盖，不随损坏次数增长） */
const KEY_CORRUPT = 'fanren_save_v1_corrupt_backup';

export class SaveStore {
    /** 本次启动是否发现坏档（原档已备份、已重置新档）；由主页消费后置 false 提示玩家（P1-5） */
    static corrupted = false;
    /** 上次落盘的序列化串：内容未变则跳过 setItem，消除「连续写两次」的重复 IO（P2-5） */
    private static lastRaw: string | null = null;

    static load(): SaveData {
        try {
            const raw = sys.localStorage.getItem(KEY);
            return migrate(raw ? JSON.parse(raw) : null);
        } catch {
            // 坏档不静默丢（P1-5）：先把原始内容隔离备份（留人工恢复/分析的余地），
            // 再重置新档，并置位标记让 UI 层给出可见提示。
            this.corrupted = true;
            try {
                const raw = sys.localStorage.getItem(KEY);
                if (raw) sys.localStorage.setItem(KEY_CORRUPT, raw);
            } catch { /* 备份失败也继续，不能因备份把玩家挡在门外 */ }
            console.error('[fanren] save corrupted, backed up and reset');
            return migrate(null);
        }
    }

    static persist(data: SaveData): void {
        const raw = JSON.stringify(data);
        // 内容与上次落盘一致 → 跳过 setItem（局部 IO 比序列化贵得多，且是双写的唯一重复成本）
        if (raw === this.lastRaw) return;
        try {
            sys.localStorage.setItem(KEY, raw);
            this.lastRaw = raw;
        } catch (e) {
            // 写入失败重试一次（瞬态配额/序列化问题）；仍失败则高声报错：
            // 此时内存态与磁盘态已分叉，下次启动会回滚玩家进度（P1-5）。
            try {
                sys.localStorage.setItem(KEY, raw);
                this.lastRaw = raw;
            } catch (e2) {
                console.error('[fanren] save persist failed twice, progress may roll back', e, e2);
            }
        }
    }
}
