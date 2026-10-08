/**
 * M22 剑冢试炼系统：淬剑经济 + 局（run）状态机 + 主线回灌日封顶（数值假设 #48）。
 *
 * 设计要点（承接 spec）：
 * - 塔内数值「剑气」完全独立，不外溢到 CombatSystem/deriveStats —— 主线程零改动。
 * - 存档只落整数 swordLevel，剑气与成本一律由公式派生（规避浮点累积与 number 溢出）。
 * - 局内状态（当前层/回魂次数/本局煞晶）纯内存，不落档：退出即收兵，零惩罚。
 */
import { SaveData, todayString } from '../saveModel';
import {
    MAINLINE,
    REVIVE_MAX,
    forgeCost,
    floorCrystal,
    milestonesCrossed,
    reviveMult,
    startFloor,
    swordAtk,
} from '../config/tower';
import { EconomySystem } from './EconomySystem';
import { AlchemySystem } from './AlchemySystem';

/** 一次连推：从 max(1, best−4) 层起，直到力竭失败或主动收兵 */
export class TowerRun {
    /** 当前挑战层 */
    floor: number;
    /** 起手层（= max(1, best−4)） */
    readonly startFloor: number;
    /** 本局最深层（结算依据，只升不降） */
    deepest: number;
    /** 已用回魂次数（上限 REVIVE_MAX） */
    revives = 0;
    /** 本局累计煞晶（含已投入淬剑的部分，收兵时保留） */
    crystal = 0;
    /** 本局起始淬剑等级（结算页展示等级变化时用） */
    readonly startLevel: number;

    constructor(best: number, swordLevel: number) {
        this.floor = startFloor(best);
        this.startFloor = this.floor;
        this.deepest = this.floor;
        this.startLevel = swordLevel;
    }

    /** 本局剑气 = 剑气(淬剑等级) × 回魂增益（乘算叠加） */
    atkOf(swordLevel: number): number {
        return swordAtk(swordLevel) * reviveMult(this.revives);
    }

    /** 通关当前层：结算煞晶并推进到下一层 */
    win(): void {
        this.crystal += floorCrystal(this.floor);
        this.deepest = Math.max(this.deepest, this.floor);
        this.floor += 1;
    }

    /** 是否还能回魂（每局 REVIVE_MAX 次） */
    canRevive(): boolean {
        return this.revives < REVIVE_MAX;
    }

    /** 回魂再战：本层重开，剑气 ×1.25 叠加 */
    revive(): boolean {
        if (!this.canRevive()) return false;
        this.revives += 1;
        return true;
    }
}

export interface MainlineGrant {
    lingshi: number;
    mats: number;
    xiuwei: number;
    /** 是否破了纪录 */
    newBest: boolean;
    /** 日封顶是否触发（三项任一触顶即为 true，供 UI 提示） */
    capped: boolean;
}

export class TowerSystem {
    constructor(
        private eco?: EconomySystem,
        private alch?: AlchemySystem,
    ) {}

    // ---------- 淬剑 ----------

    /** 当前剑气（派生，不落档） */
    atk(save: SaveData): number {
        return swordAtk(save.tower.swordLevel);
    }

    /** 下一级淬剑成本 */
    costOf(save: SaveData): number {
        return forgeCost(save.tower.swordLevel);
    }

    /** 用当前煞晶最多能淬几级（供「淬满」档与 UI 展示） */
    affordableLevels(save: SaveData): number {
        let n = 0;
        let level = save.tower.swordLevel;
        let crystal = save.tower.crystal;
        // 上限保护：成本指数增长，循环必然很快终止；1e4 防异常数据死循环
        while (n < 10000) {
            const c = forgeCost(level);
            if (crystal < c) break;
            crystal -= c;
            level += 1;
            n += 1;
        }
        return n;
    }

    /**
     * 淬剑：times 为购买级数（'max' = 能买多少买多少）。
     * 返回实际淬剑级数（煞晶不足时可能少于请求）。
     */
    forge(save: SaveData, times: number | 'max'): number {
        const want = times === 'max' ? this.affordableLevels(save) : Math.max(0, Math.floor(times));
        let n = 0;
        while (n < want) {
            const c = forgeCost(save.tower.swordLevel);
            if (save.tower.crystal < c) break;
            save.tower.crystal -= c;
            save.tower.swordLevel += 1;
            n += 1;
        }
        return n;
    }

    /** 加煞晶（通关/结算入账；负值钳制为 0） */
    addCrystal(save: SaveData, amount: number): void {
        if (!Number.isFinite(amount) || amount <= 0) return;
        save.tower.crystal += amount;
    }

    // ---------- 局 ----------

    /** 开一局：起手层 = max(1, best−4) */
    startRun(save: SaveData): TowerRun {
        return new TowerRun(save.tower.best, save.tower.swordLevel);
    }

    /**
     * 收兵结算：煞晶入账 + best 只升不降 + 主线回灌（日封顶）。
     * 无论失败收兵还是主动收兵都走这里 —— 主动退出零惩罚是刻意设计（止损策略）。
     */
    settle(save: SaveData, run: TowerRun, now: Date = new Date()): MainlineGrant {
        this.addCrystal(save, run.crystal);
        const prevBest = save.tower.best;
        const newBest = run.deepest > prevBest;
        const matsWant = milestonesCrossed(prevBest, run.deepest) * MAINLINE.matsPerMilestone;
        save.tower.best = Math.max(prevBest, run.deepest);

        this.flipDay(save, now);
        const d = save.tower.daily;
        const lingshi = this.take(d, 'lingshi', run.deepest * MAINLINE.lingshiPerFloor);
        const mats = this.take(d, 'mats', matsWant);
        const xiuwei = this.take(d, 'xiuwei', run.deepest * MAINLINE.xiuweiPerFloor);

        if (this.eco) {
            if (lingshi > 0) this.eco.addLingshi(lingshi);
            if (xiuwei > 0) this.eco.addXiuwei(xiuwei);
        }
        if (this.alch && mats > 0) this.alch.addMaterial(save, 'lingcao', mats);

        const capped =
            d.lingshi >= MAINLINE.lingshiCap || d.mats >= MAINLINE.matsCap || d.xiuwei >= MAINLINE.xiuweiCap;
        return { lingshi, mats, xiuwei, newBest, capped };
    }

    /** 今日回灌剩余额度（供剑冢首页底部展示 0/1500 · 0/5 · 0/600） */
    dailyLeft(save: SaveData, now: Date = new Date()): { lingshi: number; mats: number; xiuwei: number } {
        this.flipDay(save, now);
        const d = save.tower.daily;
        return {
            lingshi: Math.max(0, MAINLINE.lingshiCap - d.lingshi),
            mats: Math.max(0, MAINLINE.matsCap - d.mats),
            xiuwei: Math.max(0, MAINLINE.xiuweiCap - d.xiuwei),
        };
    }

    /** 跨日翻新回灌计数（本地日期键，与 daily 重置同口径） */
    private flipDay(save: SaveData, now: Date): void {
        const key = todayString(now);
        if (save.tower.daily.day !== key) {
            save.tower.daily = { day: key, lingshi: 0, mats: 0, xiuwei: 0 };
        }
    }

    /** 在日上限内取用额度，返回实发数量并累加进度 */
    private take(d: SaveData['tower']['daily'], key: 'lingshi' | 'mats' | 'xiuwei', want: number): number {
        const cap = key === 'lingshi' ? MAINLINE.lingshiCap : key === 'mats' ? MAINLINE.matsCap : MAINLINE.xiuweiCap;
        const left = Math.max(0, cap - d[key]);
        const give = Math.max(0, Math.min(want, left));
        d[key] += give;
        return give;
    }
}
