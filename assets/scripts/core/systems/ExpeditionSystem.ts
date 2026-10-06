/** 历练系统：挂机出发、归来事件抉择（数值假设 #28，纯逻辑可单测） */
import { Rng } from '../rng';
import { SaveData } from '../saveModel';
import {
    DestId,
    DESTINATIONS,
    EventOption,
    ExpeditionEvent,
    EXPED_MAT_CHANCE,
    EXPEDITION_DAILY_LIMIT,
    EXPEDITION_DURATION_MS,
    EXPEDITION_RECALL_AFTER_MS,
    eventsOfDest,
    OutcomeEffect,
} from '../config/expeditions';
import { materialName } from '../config/alchemy';
import { RewardItem } from './BoxSystem';
import { EconomySystem } from './EconomySystem';
import { AlchemySystem } from './AlchemySystem';

export type ExpeditionStateName = 'idle' | 'running' | 'complete' | 'exhausted';

export interface ExpeditionResolution {
    eventTitle: string;
    optionLabel: string;
    /** 事件结果文案 */
    text: string;
    /** 结算明细（供 UI 展示） */
    items: RewardItem[];
    /** 是否触发劫难（扣了修为） */
    disaster: boolean;
}

export class ExpeditionSystem {
    constructor(private eco: EconomySystem, private rng: Rng) {}

    /** 炼丹淬体系统（Game.init 装配后注入；历练灵草掉落写入其灵材库存，#41） */
    private alch?: AlchemySystem;

    attachAlchemy(alch: AlchemySystem) {
        this.alch = alch;
    }

    destConfig(dest: DestId) {
        const d = DESTINATIONS.find((x) => x.id === dest);
        if (!d) throw new Error(`unknown dest: ${dest}`);
        return d;
    }

    /** 当前状态：空闲可出发 / 进行中 / 已归来待结算 / 今日次数用尽 */
    stateOf(save: SaveData, now: number): ExpeditionStateName {
        if (save.expedition.dest) {
            return now - save.expedition.startedAt >= EXPEDITION_DURATION_MS ? 'complete' : 'running';
        }
        return save.daily.expeditionUsed >= EXPEDITION_DAILY_LIMIT ? 'exhausted' : 'idle';
    }

    /** 剩余等待毫秒（running 时） */
    remainingMs(save: SaveData, now: number): number {
        return Math.max(0, EXPEDITION_DURATION_MS - (now - save.expedition.startedAt));
    }

    canStart(save: SaveData, now: number): boolean {
        return this.stateOf(save, now) === 'idle';
    }

    /** 出发：占用当日次数。次数用尽或已在途中返回 false。 */
    start(save: SaveData, dest: DestId, now: number): boolean {
        if (!this.canStart(save, now)) return false;
        save.daily.expeditionUsed += 1;
        save.expedition.dest = dest;
        save.expedition.startedAt = now;
        return true;
    }

    /** 是否可广告召回（进行中且已过 5 分钟，每日 1 次） */
    recallable(save: SaveData, now: number): boolean {
        return this.stateOf(save, now) === 'running'
            && now - save.expedition.startedAt >= EXPEDITION_RECALL_AFTER_MS
            && !save.daily.expeditionRecallUsed;
    }

    /** 广告召回：立即完成（调用方负责先弹广告） */
    recall(save: SaveData, now: number): boolean {
        if (!this.recallable(save, now)) return false;
        save.daily.expeditionRecallUsed = true;
        save.expedition.startedAt = now - EXPEDITION_DURATION_MS;
        return true;
    }

    /**
     * 预览归来事件：按出发时间戳从目的地事件池确定性派生（展示与结算一致，
     * 不落存档字段、离线跨天也稳定）。
     */
    previewEvent(save: SaveData): ExpeditionEvent {
        const pool = eventsOfDest(save.expedition.dest!);
        const idx = Math.abs(save.expedition.startedAt) % pool.length;
        return pool[idx];
    }

    /**
     * 归来结算：展示态所定的事件（previewEvent 同源），按选项加权随机结果并立刻入账。
     * 仅在 complete 状态可调用；结算后回到 idle（当日剩余次数仍可出发）。
     * lingshiMult：斩妖胜利的「战意」加成（×1.15），只作用于事件的灵石产出（#35）。
     */
    resolve(save: SaveData, optionIndex: number, now: number, lingshiMult = 1): ExpeditionResolution | null {
        if (this.stateOf(save, now) !== 'complete') return null;
        const event = this.previewEvent(save);
        const option = event.options[Math.max(0, Math.min(event.options.length - 1, optionIndex))];
        const effect = this.pickOutcome(option);

        const items: RewardItem[] = [];
        let disaster = false;
        if (effect.lingshiRange) {
            const got = this.eco.addLingshi(Math.round(this.rng.int(effect.lingshiRange[0], effect.lingshiRange[1]) * lingshiMult));
            items.push({ kind: 'lingshi', amount: got, label: `灵石 +${got}` });
        }
        if (effect.lingshi) {
            const got = this.eco.addLingshi(Math.round(effect.lingshi * lingshiMult));
            items.push({ kind: 'lingshi', amount: got, label: `灵石 +${got}` });
        }
        if (effect.jiyuan) {
            this.eco.addJiyuan(effect.jiyuan);
            items.push({ kind: 'jiyuan', amount: effect.jiyuan, label: `突破机缘 +${effect.jiyuan}` });
        }
        if (effect.fragments) {
            // 统一走凡俗碎片池（普通灵根），与活跃度宝箱口径一致
            const pool2 = ['jinmu', 'shuituo', 'huoyan'];
            const id = pool2[this.rng.int(0, pool2.length - 1)];
            save.fragments[id] = (save.fragments[id] ?? 0) + effect.fragments;
            items.push({ kind: 'fragment', amount: effect.fragments, lingengId: id, label: `灵根碎片 ×${effect.fragments}` });
        }
        if (effect.xiuweiPctLoss) {
            const lost = this.eco.loseXiuweiPct(effect.xiuweiPctLoss);
            items.push({ kind: 'xiuwei', amount: -lost, label: `修为 -${lost}` });
            disaster = true;
        }

        // 灵材掉落（#41）：历练按目的地概率采得灵草（低阶炼材），注入灵材库存供炼丹/福禄消耗。
        // 未注入炼丹系统时（如测试）静默跳过，不影响其他结算。
        const destId = save.expedition.dest!;
        if (this.rng.chance(EXPED_MAT_CHANCE[destId])) {
            const matId = 'lingcao';
            this.alch?.addMaterial(save, matId, 1);
            items.push({ kind: 'material', amount: 1, materialId: matId, label: `灵材 · ${materialName(matId)} ×1` });
        }

        save.expedition.dest = null;
        save.expedition.startedAt = 0;
        return { eventTitle: event.title, optionLabel: option.label, text: effect.text, items, disaster };
    }

    private pickOutcome(option: EventOption): OutcomeEffect {
        const total = option.outcomes.reduce((a, o) => a + o.weight, 0);
        let r = this.rng.float() * total;
        for (const o of option.outcomes) {
            r -= o.weight;
            if (r < 0) return o.effect;
        }
        return option.outcomes[option.outcomes.length - 1].effect;
    }
}
