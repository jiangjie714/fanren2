/**
 * M15 妖径系统：爬关进度 + 关卡奖励 + 重刷日护栏（数值假设 #47，纯逻辑无渲染）。
 * 进度 = save.trail.curLayer 单指针（curLayer-1 即已通关最高层）；
 * 奖励发放依赖 eco/alch/rng 注入——未注入时进度照常推进、奖励降级为空清单（单测兜底）。
 */
import { SaveData, todayString } from '../saveModel';
import { Rng } from '../rng';
import {
    TRAIL_MAT_CHANCE,
    TRAIL_MORALE_BONUS,
    TRAIL_REPEAT_PER_DAY,
    chapterGift,
    chapterOf,
    firstClearReward,
    repeatLingshi,
} from '../config/trail';
import { MATERIALS } from '../config/alchemy';
import { RewardItem } from './BoxSystem';
import { EconomySystem } from './EconomySystem';
import { AlchemySystem } from './AlchemySystem';

export interface TrailWinContext {
    /** 本章 QTE 全中（战意：重刷灵石 ×1.15） */
    morale: boolean;
    now: Date;
}

export interface TrailWinResult {
    /** 'first' 首通 / 'repeat' 有产出重刷 / 'gated' 护栏内零收益重刷 */
    kind: 'first' | 'repeat' | 'gated';
    /** 本次发放明细（已应用；依赖未注入时为空） */
    items: RewardItem[];
    /** 首通时顺带触发的章节大礼明细 */
    chapterGiftItems: RewardItem[];
}

export class TrailSystem {
    constructor(
        private eco?: EconomySystem,
        private alch?: AlchemySystem,
        private rng?: Rng,
    ) {}

    /** 层是否可进入：当前层（待攻克）或任意已通关层（重刷） */
    canEnter(save: SaveData, layer: number): boolean {
        return Number.isInteger(layer) && layer >= 1 && layer <= save.trail.curLayer;
    }

    /** 今日剩余有产出的重刷次数（跨日自动翻新） */
    repeatLeft(save: SaveData, now: Date = new Date()): number {
        this.flipRepeatDay(save, now);
        return Math.max(0, TRAIL_REPEAT_PER_DAY - save.trail.dailyRepeat.count);
    }

    /**
     * 通关结算：首通（推进 + 首通奖 + 章节大礼判定）/ 重刷（护栏内小额 + 灵草概率）。
     * 层号非法（超出可挑战范围）返回 null——调用方先 canEnter。
     */
    settleWin(save: SaveData, layer: number, ctx: TrailWinContext): TrailWinResult | null {
        if (!this.canEnter(save, layer)) return null;
        if (layer >= save.trail.curLayer) return this.settleFirstClear(save, layer, ctx);
        return this.settleRepeat(save, layer, ctx);
    }

    // ---------- 首通 ----------

    private settleFirstClear(save: SaveData, layer: number, ctx: TrailWinContext): TrailWinResult {
        const cfg = firstClearReward(layer);
        const items: RewardItem[] = [];
        if (this.eco && this.rng) {
            const got = this.eco.addLingshi(this.rng.int(cfg.lingshi[0], cfg.lingshi[1]));
            items.push({ kind: 'lingshi', amount: got, label: `灵石 +${got}` });
            if (cfg.xiuwei) {
                const xw = this.eco.addXiuwei(cfg.xiuwei);
                items.push({ kind: 'xiuwei', amount: xw, label: `修为 +${xw}` });
            }
            if (cfg.jiyuan) {
                this.eco.addJiyuan(cfg.jiyuan);
                items.push({ kind: 'jiyuan', amount: cfg.jiyuan, label: `突破机缘 +${cfg.jiyuan}` });
            }
            if (this.rng.float() < cfg.fragmentChance) {
                save.fragments['jinmu'] = (save.fragments['jinmu'] ?? 0) + 1;
                items.push({ kind: 'fragment', amount: 1, lingengId: 'jinmu', label: '灵根碎片 ×1' });
            }
        }
        // 推进爬关指针
        save.trail.curLayer = layer + 1;
        // 章节大礼：本章 10 关全通且未领（幂等）
        let chapterGiftItems: RewardItem[] = [];
        const chapter = chapterOf(layer);
        if (save.trail.curLayer > chapter * 10 && !save.trail.chapterGifts.includes(chapter)) {
            save.trail.chapterGifts.push(chapter);
            chapterGiftItems = this.grantChapterGift(save, chapter);
        }
        return { kind: 'first', items, chapterGiftItems };
    }

    private grantChapterGift(save: SaveData, chapter: number): RewardItem[] {
        const g = chapterGift(chapter);
        const items: RewardItem[] = [];
        if (!this.eco || !this.alch) return items;
        const got = this.eco.addLingshi(g.lingshi);
        items.push({ kind: 'lingshi', amount: got, label: `章节大礼 · 灵石 +${got}` });
        for (const [id, n] of Object.entries(g.mats)) {
            this.alch.addMaterial(save, id, n);
            const name = MATERIALS.find((m) => m.id === id)?.name ?? id;
            items.push({ kind: 'material', amount: n, materialId: id, label: `${name} ×${n}` });
        }
        if (g.fragments) {
            save.fragments['jinmu'] = (save.fragments['jinmu'] ?? 0) + g.fragments;
            items.push({ kind: 'fragment', amount: g.fragments, lingengId: 'jinmu', label: `灵根碎片 ×${g.fragments}` });
        }
        return items;
    }

    // ---------- 重刷 ----------

    private settleRepeat(save: SaveData, layer: number, ctx: TrailWinContext): TrailWinResult {
        this.flipRepeatDay(save, ctx.now);
        if (save.trail.dailyRepeat.count >= TRAIL_REPEAT_PER_DAY) {
            return { kind: 'gated', items: [], chapterGiftItems: [] };
        }
        const items: RewardItem[] = [];
        const base = repeatLingshi(layer);
        const withMorale = ctx.morale ? base * (1 + TRAIL_MORALE_BONUS) : base;
        if (this.eco) {
            const got = this.eco.addLingshi(Math.floor(withMorale));
            items.push({ kind: 'lingshi', amount: got, label: `灵石 +${got}` });
        }
        if (this.rng && this.rng.float() < TRAIL_MAT_CHANCE) {
            this.alch?.addMaterial(save, 'lingcao', 1);
            items.push({ kind: 'material', amount: 1, materialId: 'lingcao', label: '灵草 ×1' });
        }
        save.trail.dailyRepeat.count += 1;
        return { kind: 'repeat', items, chapterGiftItems: [] };
    }

    /** 跨日翻新重刷计数（本地日期键，同 daily 重置口径） */
    private flipRepeatDay(save: SaveData, now: Date): void {
        const key = todayString(now);
        if (save.trail.dailyRepeat.day !== key) {
            save.trail.dailyRepeat = { day: key, count: 0 };
        }
    }
}
