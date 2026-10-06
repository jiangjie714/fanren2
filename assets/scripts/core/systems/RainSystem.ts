/**
 * 灵气雨手操系统（PRD 2.3 + V2 玩法深化 B 节）：三波编排生成、红雨成排（保安全缝）、
 * 连击、聚灵咒、净化劫雨、心魔干扰、渡劫评分与评级。纯逻辑无渲染，渲染层读取 session 状态。
 * 坐标为设计分辨率系（720×1280，中心原点）。
 */
import { Rng } from '../rng';
import {
    comboBonus,
    DROP_TYPES,
    DropType,
    FALL_SPEED_PER_REALM,
    judgeRating,
    judgeScore,
    MAGNET_CATCH_MULT,
    MAGNET_DURATION,
    MIND_DEMON_RED_COUNT,
    MONTH_CARD_RED_WEIGHT_REDUCE,
    PURIFY_DURATION,
    RainRating,
    RainWave,
    RATE_MAX,
    RATE_MIN,
    RED_ROW_GAP,
    WAVE3_RED_WEIGHT_PER_REALM,
    waveAt,
} from '../config/drops';
import { GOLD_RAIN_XIUWEI } from '../config/economy';
import { ILLUSION, IllusionTier, judgeIllusionScore, judgeIllusionTier } from '../config/illusion';

export type RainMode = 'tribulation' | 'illusion';

export interface RainDrop {
    id: number;
    type: DropType;
    x: number;
    y: number;
    /** 下落速度 px/s（正值下落） */
    vy: number;
    radius: number;
    /** 已被拾取/出界移除标记 */
    dead: boolean;
}

export interface RainSession {
    targetIndex: number;
    /** 基础成功率（目标境界） */
    baseRate: number;
    mode: RainMode;
    duration: number;
    timeLeft: number;
    /** 已进行时间（秒），驱动波次切换 */
    elapsed: number;
    /** 玩家角色 x（设计系，限制在可玩区内） */
    playerX: number;
    drops: RainDrop[];
    /** 金雨成功率加成累计 */
    goldBonus: number;
    /** 劫雨扣减累计（已含清雨护盾折减） */
    penalty: number;
    /** 蓝色清雨护盾层数（抵消下一片劫雨 50% 惩罚） */
    shields: number;
    goldCount: number;
    blueCount: number;
    redCount: number;
    /** 当前连击 / 本局最大连击 */
    combo: number;
    maxCombo: number;
    /** 聚灵咒剩余时间（秒） */
    magnetTimeLeft: number;
    magnetUsed: boolean;
    /** 净化劫雨剩余时间（秒） */
    purifyTimeLeft: number;
    purifyUsed: boolean;
    /** 心魔干扰是否已触发 */
    mindDemon: boolean;
    finished: boolean;
    /** 金雨额外修为累计（突破成功时入账） */
    extraXiuwei: number;
    /** 月卡：劫雨权重降低 */
    monthCard: boolean;
    /** 角色跟随手指的惯性系数（默认 RAIN_FIELD.followLerp，炼丹「速度」四维放大） */
    followLerp: number;
}

export interface RainResult {
    /** 渡劫评级（幻境模式下为幻境档位名） */
    rating: RainRating | IllusionTier | null;
    /** 模式 */
    mode: RainMode;
    /** 评分（渡劫 0–100 / 幻境 0–200，评级与排行依据） */
    score: number;
    maxCombo: number;
    /** 按最大连击折算的额外成功率加成（仅渡劫） */
    comboBonus: number;
    goldBonus: number;
    penalty: number;
    mindDemon: boolean;
    extraXiuwei: number;
    goldCount: number;
    blueCount: number;
    redCount: number;
}

/** 场地参数（渲染层共用） */
export const RAIN_FIELD = {
    /** 可玩区横向范围 */
    xMin: -330,
    xMax: 330,
    /** 生成高度（屏幕上方） */
    spawnY: 700,
    /** 玩家纵向位置 */
    playerY: -520,
    /** 拾取判定：横向距离与纵向距离 */
    catchX: 70,
    catchY: 70,
    /** 角色横向移动速度 px/s（手指拖动时直接跟随） */
    followLerp: 18,
    dropRadius: 22,
};

export class RainSystem {
    private nextDropId = 1;
    private spawnAcc = 0;
    /** 当前波次（仅渡劫模式使用） */
    private currentWave: RainWave;

    constructor(private rng: Rng) {
        this.currentWave = waveAt(0);
    }

    createSession(targetIndex: number, monthCard: boolean, mode: RainMode = 'tribulation'): RainSession {
        const duration = mode === 'illusion' ? ILLUSION.duration : 8;
        return {
            targetIndex,
            baseRate: 0, // 基础成功率由 RealmSystem.computeFinalRate 依目标境界索引计算，会话内只存索引
            mode,
            duration,
            timeLeft: duration,
            elapsed: 0,
            playerX: 0,
            drops: [],
            goldBonus: 0,
            penalty: 0,
            shields: 0,
            goldCount: 0,
            blueCount: 0,
            redCount: 0,
            combo: 0,
            maxCombo: 0,
            magnetTimeLeft: 0,
            magnetUsed: false,
            purifyTimeLeft: 0,
            purifyUsed: false,
            mindDemon: false,
            finished: false,
            extraXiuwei: 0,
            monthCard,
            followLerp: RAIN_FIELD.followLerp,
        };
    }

    /** 推进一帧：倒计时、生成（按波次）、下落、拾取判定 */
    tick(s: RainSession, dt: number, playerTargetX: number) {
        if (s.finished) return;
        s.timeLeft -= dt;
        if (s.timeLeft <= 0) {
            s.timeLeft = 0;
            s.finished = true;
            s.drops.length = 0;
            return;
        }
        s.elapsed += dt;
        if (s.purifyTimeLeft > 0) s.purifyTimeLeft = Math.max(0, s.purifyTimeLeft - dt);
        if (s.magnetTimeLeft > 0) s.magnetTimeLeft = Math.max(0, s.magnetTimeLeft - dt);

        // 角色平滑跟随手指（惯性系数由炼丹「速度」四维放大）
        const target = Math.min(RAIN_FIELD.xMax, Math.max(RAIN_FIELD.xMin, playerTargetX));
        s.playerX += (target - s.playerX) * Math.min(1, s.followLerp * dt);

        // 生成（渡劫按当前波次的速率；幻境用平坦参数；净化期间不出劫雨）
        if (s.mode === 'illusion') {
            this.spawnAcc += dt * ILLUSION.spawnRate;
        } else {
            const wave = waveAt(s.elapsed);
            this.spawnAcc += dt * wave.spawnRate;
            this.currentWave = wave;
        }
        while (this.spawnAcc >= 1) {
            this.spawnAcc -= 1;
            this.spawn(s, this.currentWave);
        }

        // 下落与拾取
        const catchX = RAIN_FIELD.catchX * (s.magnetTimeLeft > 0 ? MAGNET_CATCH_MULT : 1);
        for (const d of s.drops) {
            if (d.dead) continue;
            d.y -= d.vy * dt; // 设计坐标系 y 向上为正，下落即 y 递减
            if (d.y < -700) {
                d.dead = true;
                if (d.type === 'gold') s.combo = 0; // 漏接金雨清零连击
                continue;
            }
            const nearY = Math.abs(d.y - RAIN_FIELD.playerY) <= RAIN_FIELD.catchY;
            const nearX = Math.abs(d.x - s.playerX) <= catchX;
            if (nearY && nearX) {
                d.dead = true;
                this.applyCatch(s, d.type);
            }
        }
        // 就地压缩移除 dead 雨滴（P2-2：替代 some()+filter() 的两次遍历与数组重建）
        let write = 0;
        for (let i = 0; i < s.drops.length; i++) {
            const d = s.drops[i];
            if (!d.dead) s.drops[write++] = d;
        }
        if (write < s.drops.length) s.drops.length = write;
    }

    /** 净化劫雨（激励广告）：3 秒内不再生成劫雨；单局 1 次；幻境模式不可用 */
    usePurify(s: RainSession): boolean {
        if (s.mode === 'illusion') return false;
        if (s.purifyUsed || s.finished) return false;
        s.purifyUsed = true;
        s.purifyTimeLeft = PURIFY_DURATION;
        return true;
    }

    /** 聚灵咒：单局 1 次，2.5 秒内金雨磁吸半径 ×2 */
    useMagnet(s: RainSession): boolean {
        if (s.magnetUsed || s.finished) return false;
        s.magnetUsed = true;
        s.magnetTimeLeft = MAGNET_DURATION;
        return true;
    }

    /** 结算：评分 + 评级/档位 + 各项累计（幻境按独立计分制） */
    finish(s: RainSession): RainResult {
        s.finished = true;
        const isIllusion = s.mode === 'illusion';
        const score = isIllusion
            ? judgeIllusionScore(s.goldCount, s.maxCombo, s.redCount)
            : judgeScore(s.goldCount, s.maxCombo, s.blueCount, s.redCount);
        const rating = isIllusion ? judgeIllusionTier(score) : judgeRating(score);
        return {
            rating,
            mode: s.mode,
            score,
            maxCombo: s.maxCombo,
            comboBonus: isIllusion ? 0 : comboBonus(s.maxCombo),
            goldBonus: s.goldBonus,
            penalty: s.penalty,
            mindDemon: s.mindDemon,
            extraXiuwei: s.extraXiuwei,
            goldCount: s.goldCount,
            blueCount: s.blueCount,
            redCount: s.redCount,
        };
    }

    // ---------- 内部 ----------
    private spawn(s: RainSession, wave: RainWave) {
        if (s.mode === 'illusion') {
            // 幻境：平坦参数（无蓝雨、无成排、落速 ×1.3、无动态难度）
            const idx = this.rng.pickWeighted([ILLUSION.goldWeight, 0, ILLUSION.redWeight]);
            const type: DropType = idx === 0 ? 'gold' : 'red';
            s.drops.push({
                id: this.nextDropId++,
                type,
                x: this.rng.range(RAIN_FIELD.xMin, RAIN_FIELD.xMax),
                y: RAIN_FIELD.spawnY,
                vy: this.rng.range(380, 520) * ILLUSION.fallSpeedMult,
                radius: RAIN_FIELD.dropRadius,
                dead: false,
            });
            return;
        }
        let type: DropType;
        if (s.purifyTimeLeft > 0) {
            // 净化期间仅金雨/蓝雨，按原权重比例折算（50:35）
            type = this.rng.pickWeighted([50, 35]) === 0 ? 'gold' : 'blue';
        } else {
            const redWeight = Math.max(0, wave.weights[2] - (s.monthCard ? MONTH_CARD_RED_WEIGHT_REDUCE : 0)
                + (wave.redRow[1] > 0 ? WAVE3_RED_WEIGHT_PER_REALM * (s.targetIndex - 1) : 0));
            const idx = this.rng.pickWeighted([wave.weights[0], wave.weights[1], redWeight]);
            type = idx === 0 ? 'gold' : idx === 1 ? 'blue' : 'red';
        }
        const speedMult = 1 + FALL_SPEED_PER_REALM * (s.targetIndex - 1);
        if (type === 'red' && wave.redRow[1] > 0) {
            this.spawnRedRow(s, wave, speedMult);
            return;
        }
        s.drops.push({
            id: this.nextDropId++,
            type,
            x: this.rng.range(RAIN_FIELD.xMin, RAIN_FIELD.xMax),
            y: RAIN_FIELD.spawnY,
            vy: this.rng.range(380, 520) * speedMult,
            radius: RAIN_FIELD.dropRadius,
            dead: false,
        });
    }

    /** 波③成排劫雨：同排同速下落，恒保留一条 RED_ROW_GAP 安全缝（考验预判走位） */
    private spawnRedRow(s: RainSession, wave: RainWave, speedMult: number) {
        const count = this.rng.int(wave.redRow[0], wave.redRow[1]);
        if (count <= 0) return;
        const halfGap = RED_ROW_GAP / 2;
        const gapCenter = this.rng.range(RAIN_FIELD.xMin + halfGap, RAIN_FIELD.xMax - halfGap);
        const vy = this.rng.range(380, 520) * speedMult;
        for (let i = 0; i < count; i++) {
            let x = this.rng.range(RAIN_FIELD.xMin, RAIN_FIELD.xMax);
            if (Math.abs(x - gapCenter) <= halfGap) {
                // 落进安全缝则推到缝外最近的边缘（保证缝完全畅通）
                x = x < gapCenter
                    ? Math.max(RAIN_FIELD.xMin, gapCenter - halfGap - 10)
                    : Math.min(RAIN_FIELD.xMax, gapCenter + halfGap + 10);
            }
            s.drops.push({
                id: this.nextDropId++,
                type: 'red',
                x,
                y: RAIN_FIELD.spawnY,
                vy,
                radius: RAIN_FIELD.dropRadius,
                dead: false,
            });
        }
    }

    private applyCatch(s: RainSession, type: DropType) {
        if (type === 'gold') {
            const g = this.rng.range(DROP_TYPES.gold.deltaMin, DROP_TYPES.gold.deltaMax);
            s.goldBonus += g;
            s.extraXiuwei += this.rng.int(GOLD_RAIN_XIUWEI.min, GOLD_RAIN_XIUWEI.max);
            s.goldCount += 1;
            s.combo += 1;
            s.maxCombo = Math.max(s.maxCombo, s.combo);
        } else if (type === 'blue') {
            s.shields += 1;
            s.blueCount += 1;
            s.combo += 1;
            s.maxCombo = Math.max(s.maxCombo, s.combo);
        } else {
            const raw = this.rng.range(DROP_TYPES.red.deltaMin, DROP_TYPES.red.deltaMax);
            if (s.shields > 0) {
                s.shields -= 1;
                s.penalty += raw * 0.5;
            } else {
                s.penalty += raw;
            }
            s.redCount += 1;
            s.combo = 0;
            // 心魔干扰：仅打标记，-5% 惩罚由 RealmSystem.computeFinalRate 统一扣减，避免重复
            if (s.redCount >= MIND_DEMON_RED_COUNT && !s.mindDemon) {
                s.mindDemon = true;
            }
        }
    }

    /** 当前累计成功率（含边界），供 UI 实时显示 */
    currentRate(s: RainSession, compute: (gold: number, penalty: number, md: boolean) => number): number {
        return compute(s.goldBonus, s.penalty, s.mindDemon);
    }

    /** 供渲染/UI 用的边界夹取 */
    clampRate(rate: number): number {
        return Math.min(RATE_MAX, Math.max(RATE_MIN, rate));
    }
}
