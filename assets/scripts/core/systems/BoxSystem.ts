/** 宝箱系统：开箱产出、天道保底、求索会话、灵气共鸣与圆满三连（PRD 2.2 + 第五节 + V2 A 节） */
import { Rng } from '../rng';
import { SaveData } from '../saveModel';
import {
    BoxId,
    getBox,
    PITY_THRESHOLD,
    RESONATE_MULT,
    SEEK_LIMIT,
    TIANDAO_UNLOCK_REALM,
    TRIPLE_BONUS_COST_PCT,
    XIUZHEN_UNLOCK_REALM,
} from '../config/boxes';
import { BOX_REWARDS } from '../config/economy';
import { fragmentPool } from '../config/lingens';
import { EconomySystem } from './EconomySystem';

export type BoxTier = 'normal' | 'rare' | 'disaster';

export type RewardKind = 'lingshi' | 'xiuwei' | 'jiyuan' | 'fragment' | 'gongfa';

export interface RewardItem {
    kind: RewardKind;
    amount: number;
    /** 展示文案，如「修为 +120」 */
    label: string;
    /** 灵根碎片 id */
    lingengId?: string;
}

export interface BoxResult {
    boxId: BoxId;
    tier: BoxTier;
    rewards: RewardItem[];
    /** 本次是否触发天道保底 */
    pityTriggered: boolean;
    /** 结算后的保底计数 */
    pityCount: number;
    /** 结算后的机缘总量（用于判断能否触发突破） */
    jiyuan: number;
    /** 本次是否灵气共鸣成功（非概率产出 ×1.15） */
    resonated: boolean;
    /** 本次是否使用修真宝盒券（免费开） */
    usedTicket: boolean;
}

export interface BoxSession {
    boxId: BoxId;
    /** 已用【继续求索】次数 */
    seeksUsed: number;
    first: BoxResult;
    /** 最后一次结果（求索后覆盖） */
    last: BoxResult;
}

export type OpenFailReason = 'lingshiNotEnough' | 'boxLocked';

export interface OpenOptions {
    /** 灵气共鸣：蓄力命中金区（只放大非概率产出，不碰概率/保底） */
    resonate?: boolean;
}

export class BoxSystem {
    /** 求索上限常量透出 */
    readonly seekLimit = SEEK_LIMIT;

    constructor(private save: SaveData, private eco: EconomySystem, private rng: Rng) {}

    isBoxUnlocked(boxId: BoxId): boolean {
        if (boxId === 'xiuzhen') return this.save.realmIndex >= XIUZHEN_UNLOCK_REALM;
        if (boxId === 'tiandao') return this.save.realmIndex >= TIANDAO_UNLOCK_REALM;
        return true;
    }

    canOpen(boxId: BoxId): { ok: boolean; reason?: OpenFailReason } {
        if (!this.isBoxUnlocked(boxId)) return { ok: false, reason: 'boxLocked' };
        // 修真宝盒券：持券免费开（活跃度宝箱获得，M8 #27）
        if (boxId === 'xiuzhen' && this.save.xiuzhenTickets > 0) return { ok: true };
        if (!this.eco.canAfford(getBox(boxId).cost)) return { ok: false, reason: 'lingshiNotEnough' };
        return { ok: true };
    }

    /**
     * 开一次宝箱：扣灵石（持修真宝盒券则免费并消耗一张）→ 天道保底判定 →
     * 按档产出（可含灵气共鸣放大）→ 更新保底计数。
     * 保底：连续 3 次非稀有，第 4 次强制稀有；开出稀有即清零；劫难不重置（PRD 第五节）。
     */
    open(boxId: BoxId, opts: OpenOptions = {}): BoxResult {
        const check = this.canOpen(boxId);
        if (!check.ok) throw new Error(`open blocked: ${check.reason}`);
        const box = getBox(boxId);
        let usedTicket = false;
        if (boxId === 'xiuzhen' && this.save.xiuzhenTickets > 0) {
            this.save.xiuzhenTickets -= 1;
            usedTicket = true;
        } else {
            this.eco.spend(box.cost);
        }

        let tier: BoxTier;
        let pityTriggered = false;
        if (box.pityEnabled && this.save.pityCount >= PITY_THRESHOLD) {
            tier = 'rare';
            pityTriggered = true;
        } else {
            const r = this.rng.float();
            if (r < box.disasterRate) tier = 'disaster';
            else if (r < box.disasterRate + box.rareRate) tier = 'rare';
            else tier = 'normal';
        }

        const rewards = this.rollRewards(boxId, tier, opts.resonate ? RESONATE_MULT : 1);
        this.applyRewards(rewards);

        // 保底计数：稀有清零，普通/劫难 +1（劫难不重置也不额外减少）
        if (tier === 'rare') this.save.pityCount = 0;
        else this.save.pityCount += 1;

        this.save.stats.opens += 1;
        return {
            boxId,
            tier,
            rewards,
            pityTriggered,
            pityCount: this.save.pityCount,
            jiyuan: this.eco.jiyuan,
            resonated: !!opts.resonate && tier !== 'disaster',
            usedTicket,
        };
    }

    /** 新建开箱会话（进入宝盒页的第一次开箱） */
    startSession(boxId: BoxId, first: BoxResult): BoxSession {
        return { boxId, seeksUsed: 0, first, last: first };
    }

    /** 会话内可继续求索（上限 2 次） */
    canSeek(session: { seeksUsed: number }): boolean {
        return session.seeksUsed < SEEK_LIMIT;
    }

    /** 继续求索：再开一次同档宝箱（正常消耗灵石） */
    seek(session: { boxId: BoxId; seeksUsed: number; last?: BoxResult }, opts: OpenOptions = {}): BoxResult {
        if (!this.canSeek(session)) throw new Error('seek limit reached');
        session.seeksUsed += 1;
        const result = this.open(session.boxId, opts);
        if (session && 'last' in session) session.last = result;
        return result;
    }

    /**
     * 圆满三连（V2 A3）：按点亮层数追加奖励。仅灵石（箱费 ×6%/层）+ 3 层全中 1 枚随机碎片，
     * 永不产出机缘/稀有；不计入天道保底计数、不计入 stats.opens（不绕过保底与统计口径）。
     */
    grantTripleBonus(boxId: BoxId, layers: number): RewardItem[] {
        if (layers <= 0) return [];
        const box = getBox(boxId);
        const out: RewardItem[] = [];
        const ls = Math.max(1, Math.round(box.cost * TRIPLE_BONUS_COST_PCT * layers));
        const got = this.eco.addLingshi(ls);
        out.push({ kind: 'lingshi', amount: got, label: `灵石 +${got}` });
        if (layers >= 3) {
            const frag = this.fragmentReward(boxId, 1);
            this.applyRewards([frag]);
            out.push(frag);
        }
        return out;
    }

    // ---------- 内部：产出与入账 ----------
    private rollRewards(boxId: BoxId, tier: BoxTier, mult = 1): RewardItem[] {
        const table = BOX_REWARDS[boxId];
        const rewards: RewardItem[] = [];
        const rr = (r: { min: number; max: number }) => this.rng.int(r.min, r.max);

        if (tier === 'normal') {
            const n = table.normal;
            const xw = rr(n.xiuwei);
            rewards.push({ kind: 'xiuwei', amount: xw, label: `修为 +${xw}` });
            if (this.rng.chance(n.lingshiChance)) {
                const ls = rr(n.lingshi);
                rewards.push({ kind: 'lingshi', amount: ls, label: `灵石 +${ls}` });
            }
            if (this.rng.chance(n.fragmentChance)) {
                rewards.push(this.fragmentReward(boxId, rr(n.fragmentCount)));
            }
        } else if (tier === 'rare') {
            const n = table.rare;
            const xw = rr(n.xiuwei);
            rewards.push({ kind: 'xiuwei', amount: xw, label: `修为 +${xw}` });
            const jy = rr(n.jiyuan);
            rewards.push({ kind: 'jiyuan', amount: jy, label: `突破机缘 +${jy}` });
            rewards.push(this.fragmentReward(boxId, rr(n.fragmentCount)));
            if (this.rng.chance(n.lingshiChance)) {
                rewards.push({ kind: 'lingshi', amount: rr(n.lingshi), label: '' });
            }
            if (this.rng.chance(n.gongfaChance)) {
                rewards.push({ kind: 'gongfa', amount: 500, label: '无名功法·修为 +500' });
            }
        } else {
            const pct = this.rng.range(table.disaster.xiuweiLossPct.min, table.disaster.xiuweiLossPct.max);
            const loss = Math.max(1, Math.round(this.eco.xiuwei * pct));
            rewards.push({ kind: 'xiuwei', amount: -loss, label: `修为 -${loss}` });
        }
        if (mult !== 1) this.amplifyRewards(rewards, mult);
        return rewards;
    }

    /** 灵气共鸣放大：仅正向灵石/修为/碎片；机缘与劫难扣减不受影响 */
    private amplifyRewards(rewards: RewardItem[], mult: number) {
        for (const r of rewards) {
            if (r.amount <= 0) continue;
            if (r.kind === 'lingshi' || r.kind === 'xiuwei') {
                r.amount = Math.ceil(r.amount * mult);
            } else if (r.kind === 'fragment') {
                r.amount = Math.ceil(r.amount * mult);
                r.label = `灵根碎片 ×${r.amount}`;
            }
        }
    }

    private fragmentReward(boxId: BoxId, count: number): RewardItem {
        const pool = fragmentPool(boxId);
        const id = pool[this.rng.int(0, pool.length - 1)];
        return { kind: 'fragment', amount: count, lingengId: id, label: `灵根碎片 ×${count}` };
    }

    private applyRewards(rewards: RewardItem[]) {
        for (const r of rewards) {
            if (r.kind === 'lingshi') {
                // 灵石入账走小等级加成，实际值以返回为准
                const got = this.eco.addLingshi(r.amount);
                r.label = `灵石 +${got}`;
            } else if (r.kind === 'xiuwei' && r.amount > 0) {
                const got = this.eco.addXiuwei(r.amount);
                r.label = `修为 +${got}`;
            } else if (r.kind === 'xiuwei' && r.amount < 0) {
                this.save.xiuwei = Math.max(0, this.save.xiuwei + r.amount);
            } else if (r.kind === 'jiyuan') {
                this.eco.addJiyuan(r.amount);
            } else if (r.kind === 'fragment') {
                const id = r.lingengId!;
                this.save.fragments[id] = (this.save.fragments[id] ?? 0) + r.amount;
            } else if (r.kind === 'gongfa') {
                const got = this.eco.addXiuwei(r.amount);
                r.label = `无名功法·修为 +${got}`;
            }
        }
    }
}
