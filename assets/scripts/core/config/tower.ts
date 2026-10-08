/**
 * M22 剑冢试炼配置：层需求/煞晶/淬剑/剑气 四条链 + 一层战斗模拟（数值假设 #48）。
 *
 * 纯函数、无渲染、无外部随机源 —— 同层号任何时刻派生结果一致（防退出重进刷局）。
 *
 * ⚠ 四条链是紧耦合的，但有且只有一个变量在动（每层煞晶 ×1.39）。改动下列任一常量
 *   （1.05 / 1.13 / 1.16 / 1.39）都必须重跑 tests/tower-balance.test.ts —— 那是本作的
 *   「无限但缓慢」曲线的唯一守护。
 */

// ---------- 一层战斗时间轴（spec §4.2） ----------

/** 每层限时（秒） */
export const FLOOR_TIME_SEC = 15;
/** 剑罡上限（本局生命条，每层开局重置） */
export const GANG_MAX = 100;
/** 我方自动出剑间隔（秒） */
export const SWORD_INTERVAL = 0.5;
/** 单次出剑伤害系数（DPS = 剑气） */
export const SWORD_DMG_RATIO = 0.5;
/** 妖物普攻间隔（秒） */
export const MONSTER_ATK_INTERVAL = 2.5;
/** 妖物普攻侵蚀剑罡 */
export const MONSTER_ATK_GANG = 12;
/** 妖物蓄力间隔（秒） */
export const CHARGE_INTERVAL = 5.0;
/** 蓄力窗口时长（秒）：窗口内可「凝神一击」打断 */
export const CHARGE_WINDOW = 2.0;
/** 打断额外伤害系数（剑气 ×2） */
export const INTERRUPT_DMG_RATIO = 2;
/** 打断回复剑罡 */
export const INTERRUPT_GANG = 6;
/** 打断造成的妖物眩晕（秒）：期间妖物计时暂停 */
export const INTERRUPT_STUN = 1.0;
/** 未打断：侵蚀剑罡 */
export const CHARGE_HIT_GANG = 20;
/** 未打断：妖物回复（maxHp 口径，见文件末注释） */
export const CHARGE_HEAL_RATIO = 0.12;
/** 妖血 = req(f) × 本系数 */
export const MONSTER_HP_RATIO = 15;
/** 战斗模拟步长（秒）；足够细以对齐 spec 门槛表，又不至于拖慢单测 */
export const SIM_DT = 0.05;

// ---------- 四条链 ----------

/** 剑气 = 10 × 1.05^淬剑等级（无封顶，唯一无限增长的量纲） */
export const SWORD_BASE = 10;
export const SWORD_GROWTH = 1.05;
/** 淬剑成本 = round(20 × 1.13^n)（n = 当前等级，即升到 n+1 的花费） */
export const FORGE_COST_BASE = 20;
export const FORGE_COST_GROWTH = 1.13;
/** 层需求 = 8 × 1.16^(f-1) */
export const REQ_BASE = 8;
export const REQ_GROWTH = 1.16;
/** 每层煞晶 = floor(25 × 1.39^(f-1)) ← 唯一校准旋钮 */
export const CRYSTAL_BASE = 25;
export const CRYSTAL_GROWTH = 1.39;

/** 剑气（淬剑等级 → 塔内攻击数值） */
export function swordAtk(level: number): number {
    return SWORD_BASE * Math.pow(SWORD_GROWTH, level);
}

/** 淬剑成本（从 level 升到 level+1 的煞晶花费） */
export function forgeCost(level: number): number {
    return Math.round(FORGE_COST_BASE * Math.pow(FORGE_COST_GROWTH, level));
}

/** 层需求剑气（推该层所需的剑气门槛） */
export function req(floor: number): number {
    return REQ_BASE * Math.pow(REQ_GROWTH, floor - 1);
}

/** 通关该层的煞晶产出 */
export function floorCrystal(floor: number): number {
    return Math.floor(CRYSTAL_BASE * Math.pow(CRYSTAL_GROWTH, floor - 1));
}

/** 妖物血量 */
export function monsterHp(floor: number): number {
    return MONSTER_HP_RATIO * req(floor);
}

// ---------- 局（run） ----------

/** 回魂再战：本局剑气增益（乘算叠加） */
export const REVIVE_BOOST = 1.25;
/** 每局回魂次数上限（1.25³ ≈ 1.953） */
export const REVIVE_MAX = 3;
/** 起手层回退层数（既免复读低层，也保证开局 5 层连胜的首因效应） */
export const START_FLOOR_BACK = 4;

/** 起手层 = max(1, best − 4) */
export function startFloor(best: number): number {
    return Math.max(1, best - START_FLOOR_BACK);
}

/** 回魂 k 次后的本局剑气增益（乘算叠加，k 已由调用方钳制到 [0, REVIVE_MAX]） */
export function reviveMult(revives: number): number {
    return Math.pow(REVIVE_BOOST, Math.max(0, Math.min(REVIVE_MAX, revives)));
}

// ---------- 主线回灌（日封顶，spec §4.5） ----------

export const MAINLINE = {
    /** 灵石 = 最深层 × 4 */
    lingshiPerFloor: 4,
    lingshiCap: 1500,
    /** 灵材（灵草）：本局新跨越的每 10 层里程碑 ×1 株 */
    matsPerMilestone: 1,
    matsCap: 5,
    /** 修为 = 最深层 × 2 */
    xiuweiPerFloor: 2,
    xiuweiCap: 600,
    /** 里程碑跨度（层） */
    milestoneStep: 10,
} as const;

/** 本局新跨越的里程碑数量：从 fromFloor（不含）到 toFloor（含）之间 10 的倍数个数 */
export function milestonesCrossed(fromFloor: number, toFloor: number): number {
    let n = 0;
    for (let f = fromFloor + 1; f <= toFloor; f++) {
        if (f % MAINLINE.milestoneStep === 0) n++;
    }
    return n;
}

// ---------- 一层战斗模拟 ----------

export type TowerBattleStatus = 'ongoing' | 'win' | 'lose';

export interface FloorSimResult {
    win: boolean;
    /** 结束时刻（秒） */
    timeSec: number;
    /** 结束时剩余剑罡（0..100） */
    gang: number;
    /** 累计造成伤害 */
    damage: number;
}

/**
 * 一层战斗的实时状态机（纯逻辑、无渲染、无随机源）。
 *
 * 场景层（TowerBattleScene）与单测（simulateFloor）**共用同一份口径** —— 避免演出与
 * 数值两套逻辑漂移。UI 每帧调 advance(dt)，玩家在蓄力窗口内调 interrupt()；
 * 单测走 autoInterrupt（窗口一开就自动打断，即 spec 的「最优操作」画像）。
 *
 * 「一次都不打断」在门槛剑气下必败是**刻意设计**（spec §4.2 / R5）。
 */
export class TowerBattleSession {
    readonly maxHp: number;
    hp: number;
    gang = GANG_MAX;
    /** 已累计战斗时间（秒） */
    t = 0;
    status: TowerBattleStatus = 'ongoing';
    /** 累计造成伤害（结算表现用） */
    damage = 0;
    /** 已成功打断次数 */
    used = 0;
    /** 妖物是否处于眩晕（UI 表现用） */
    stunLeft = 0;

    private swordT = 0;
    private atkT = 0;
    private chargeT = 0;
    private windowLeft = 0;
    private readonly auto: boolean;
    private readonly maxInterrupts: number;

    constructor(public atk: number, public floor: number, opts: { autoInterrupt?: boolean; maxInterrupts?: number } = {}) {
        this.maxHp = monsterHp(floor);
        this.hp = this.maxHp;
        this.auto = opts.autoInterrupt === true;
        this.maxInterrupts = Math.max(0, Math.floor(opts.maxInterrupts ?? 0));
    }

    /** 蓄力窗口是否开启（红环是否亮起、凝神一击是否可用） */
    get chargeOpen(): boolean {
        return this.windowLeft > 0 && this.status === 'ongoing';
    }

    /** 红环填充进度 0..1（由细到满） */
    get chargeProgress(): number {
        return this.windowLeft > 0 ? Math.min(1, Math.max(0, 1 - this.windowLeft / CHARGE_WINDOW)) : 1;
    }

    /** 剩余时间（秒，UI 倒计时环） */
    get timeLeft(): number {
        return Math.max(0, FLOOR_TIME_SEC - this.t);
    }

    /** 推进 dt 秒；内部按 SIM_DT 定步长，保证与单测完全一致 */
    advance(dtSec: number): void {
        let remain = dtSec;
        while (remain > 1e-9 && this.status === 'ongoing') {
            const step = Math.min(SIM_DT, remain);
            this.step(step);
            remain -= step;
        }
    }

    /** 凝神一击（玩家点击）：仅蓄力窗口内有效，返回是否命中 */
    interrupt(): boolean {
        if (this.status !== 'ongoing' || this.windowLeft <= 0) return false;
        this.applyInterrupt();
        return true;
    }

    /** 一次打断结算：额外伤害 + 回剑罡 + 眩晕（眩晕期间妖物计时暂停 = 第二重收益） */
    private applyInterrupt(): void {
        this.windowLeft = 0;
        this.used += 1;
        const d = this.atk * INTERRUPT_DMG_RATIO;
        this.hp -= d;
        this.damage += d;
        if (this.hp <= 0) {
            this.hp = 0;
            this.status = 'win';
            return;
        }
        this.gang = Math.min(GANG_MAX, this.gang + INTERRUPT_GANG);
        this.stunLeft = INTERRUPT_STUN;
    }

    private step(dt: number): void {
        // 我方自动出剑（不受眩晕影响）
        this.swordT += dt;
        if (this.swordT >= SWORD_INTERVAL - 1e-9) {
            this.swordT -= SWORD_INTERVAL;
            const d = this.atk * SWORD_DMG_RATIO;
            this.hp -= d;
            this.damage += d;
            if (this.hp <= 0) {
                this.hp = 0;
                this.status = 'win';
                this.t += dt;
                return;
            }
        }

        // 妖物行动（眩晕期间计时暂停）
        if (this.stunLeft > 0) {
            this.stunLeft = Math.max(0, this.stunLeft - dt);
        } else {
            this.atkT += dt;
            if (this.atkT >= MONSTER_ATK_INTERVAL - 1e-9) {
                this.atkT -= MONSTER_ATK_INTERVAL;
                this.gang -= MONSTER_ATK_GANG;
                if (this.gang <= 0) {
                    this.gang = 0;
                    this.status = 'lose';
                    this.t += dt;
                    return;
                }
            }
            if (this.windowLeft > 0) {
                this.windowLeft -= dt;
                if (this.windowLeft <= 1e-9) {
                    // 窗口结束仍未打断：侵蚀剑罡 + 妖物回血
                    this.windowLeft = 0;
                    this.gang -= CHARGE_HIT_GANG;
                    if (this.gang <= 0) {
                        this.gang = 0;
                        this.status = 'lose';
                        this.t += dt;
                        return;
                    }
                    this.hp = Math.min(this.maxHp, this.hp + this.maxHp * CHARGE_HEAL_RATIO);
                }
            } else {
                this.chargeT += dt;
                if (this.chargeT >= CHARGE_INTERVAL - 1e-9) {
                    this.chargeT -= CHARGE_INTERVAL;
                    if (this.auto && this.used < this.maxInterrupts) this.applyInterrupt();
                    else this.windowLeft = CHARGE_WINDOW;
                }
            }
        }

        this.t += dt;
        if (this.t >= FLOOR_TIME_SEC - 1e-9) {
            this.status = 'lose';
        }
    }
}

/**
 * 一层战斗的确定性模拟（单测口径）：窗口一开就自动打断，次数由 interrupts 给定。
 * 与场景层共用 TowerBattleSession —— 数值与演出永不漂移。
 */
export function simulateFloor(atk: number, floor: number, interrupts: number): FloorSimResult {
    const s = new TowerBattleSession(atk, floor, { autoInterrupt: true, maxInterrupts: interrupts });
    s.advance(FLOOR_TIME_SEC);
    return { win: s.status === 'win', timeSec: round2(s.t), gang: s.gang, damage: s.damage };
}

/**
 * 通过第 floor 层所需的剑气下限（二分求解，供 UI「距上一层还需 k 级淬剑」与单测共用）。
 * 无解（该层在给定打断次数下不可能通过）时返回 Infinity。
 */
export function minAtkFor(floor: number, interrupts: number): number {
    if (simulateFloor(1e12, floor, interrupts).win === false) return Infinity;
    let lo = 0;
    let hi = req(floor) * 4;
    if (simulateFloor(hi, floor, interrupts).win) {
        // hi 已足够；若 req×4 都不够说明模型异常，继续放大到可解
        hi *= 4;
    }
    for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (simulateFloor(mid, floor, interrupts).win) hi = mid;
        else lo = mid;
    }
    return hi;
}

function round2(v: number): number {
    return Math.round(v * 100) / 100;
}

// ---------------------------------------------------------------------------
// 口径说明（为什么「未打断回血」按 maxHp 而非「已损血」）：
// spec §4.2 给出两档门槛 —— 打断 1 次 x ≥ 1.00、全打断 x ≥ 0.80。按 maxHp×12% 复算：
//   打断 1 次：17×剑气 ≥ 15req + 1.8req → x ≥ 0.988 ≈ 1.00 ✓
//   全打断：  19×剑气 ≥ 15req          → x ≥ 0.789 ≈ 0.80 ✓
//   零打断：  剑罡在 t=12.5 打空（5 次普攻 60 + 2 次释放 40）→ 恒败 ✓
// 只有 maxHp 口径能同时落在两档上；「已损血 12%」会算出 0.93 而偏离 spec。
// ---------------------------------------------------------------------------
