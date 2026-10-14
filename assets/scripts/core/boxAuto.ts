/**
 * 开箱「长按连开」的判定与演出参数（首日体验 spec §4.C）。
 *
 * **最重要的一条约束**：连开**只改交互节奏与演出**，绝不触碰开箱的任何数值 ——
 * 概率、保底、奖励全部走 `BoxSystem.open()` 原路径，连开只是「替玩家重复点按钮」。
 * 所以本模块不引入任何新的数值常量，只提供节奏 / 中止 / 演出三类纯函数，
 * 零 `cc` 依赖，可脱离引擎单测（tests/box-auto.test.ts）。
 */

/** 连开节奏参数（spec §4.C1） */
export const AUTO_OPEN = {
    /** 按住多久判定为「长按连开」（秒）。低于此值仍走普通单次开箱 */
    holdThreshold: 0.35,
    /** 连开间隔（秒）：开箱 → 演出 → 再开 */
    interval: 1.2,
    /** 单次按住最多连开次数（spec R4：防误触按住不放无限消耗灵石） */
    maxPerHold: 12,
    /** 箱体灵光递增到满所需的连开次数（演出封顶，再开不再变） */
    glowCap: 8,
    /** 音高最多升几个半音（6 = 增四度，悦耳且不过尖） */
    pitchCapSemitones: 6,
    /** 每连开几次升 1 个半音 */
    opensPerSemitone: 2,
    /** C3：累计开箱少于该次数视为新手期（保底进度放大显示） */
    noviceOpens: 5,
};

/** 连开中止原因；`'none'` 表示继续 */
export type AutoStopReason = 'none' | 'lingshiNotEnough' | 'boxLocked' | 'breakthrough' | 'limit';

export interface AutoOpenCtx {
    /** `BoxSystem.canOpen().ok` */
    canOpen: boolean;
    /** `BoxSystem.canOpen().reason === 'boxLocked'` */
    boxLocked: boolean;
    /** 机缘已达标、可冲击下一境界 */
    canBreakthrough: boolean;
    /** 本次按住已开箱次数 */
    opened: number;
}

/** 按住时长是否足以进入连开模式 */
export function shouldEnterAuto(pressT: number): boolean {
    return pressT >= AUTO_OPEN.holdThreshold;
}

/**
 * 连开的下一次开箱前判定中止原因（spec §4.C1 中断条件 + R4 上限）。
 * 优先级：未解锁 > 灵石不足 > 达上限 > 可渡劫 > 继续。
 */
export function autoStopReason(ctx: AutoOpenCtx): AutoStopReason {
    if (ctx.boxLocked) return 'boxLocked';
    if (!ctx.canOpen) return 'lingshiNotEnough';
    if (ctx.opened >= AUTO_OPEN.maxPerHold) return 'limit';
    if (ctx.canBreakthrough) return 'breakthrough';
    return 'none';
}

/**
 * C2 箱体灵光强度：0（无）→ 1（满）。
 * Sprite.color 无法超过 255 去"变亮"，故演出上用「灵光halo透明度 + 箱体微放大」表达，
 * 由本函数统一给出 0..1 的强度系数，保证视觉与次数单调一致。
 */
export function chestGlow(opened: number): number {
    if (opened <= 0) return 0;
    return Math.min(1, opened / AUTO_OPEN.glowCap);
}

/** C2 音效阶梯：按连开层数升调的播放速率倍率（1 = 原调） */
export function autoPitch(opened: number): number {
    const steps = Math.min(
        AUTO_OPEN.pitchCapSemitones,
        Math.floor(Math.max(0, opened) / AUTO_OPEN.opensPerSemitone),
    );
    return Math.pow(2, steps / 12);
}

/** C3 保底前置：新手期（累计开箱 < 5 次）需放大显示保底进度 */
export function isNovicePity(opens: number): boolean {
    return opens < AUTO_OPEN.noviceOpens;
}

// ---------------- 连开汇总（纯聚合，不进数值） ----------------

/** 结构化最小约束：只取聚合所需字段，避免本模块反向依赖 BoxSystem */
export interface AutoRewardLike {
    kind: string;
    amount: number;
    label: string;
    lingengId?: string;
}

export interface AutoResultLike {
    tier: string;
    rewards: AutoRewardLike[];
}

export interface AutoSummary {
    /** 连开次数 */
    opens: number;
    normal: number;
    rare: number;
    disaster: number;
    lingshi: number;
    xiuwei: number;
    jiyuan: number;
    /** 灵根碎片按 id 合并 */
    fragments: Array<{ id: string; amount: number }>;
    /** 功法 / 材料等按文案合并 */
    others: Array<{ label: string; amount: number }>;
}

/**
 * 把一次连开的若干次开箱结果聚合成一份汇总。
 * 只做「加总同类」，不产生任何新奖励，也不改变单次的数值结果。
 */
export function summarizeAutoOpens(results: AutoResultLike[]): AutoSummary {
    const s: AutoSummary = {
        opens: results.length,
        normal: 0,
        rare: 0,
        disaster: 0,
        lingshi: 0,
        xiuwei: 0,
        jiyuan: 0,
        fragments: [],
        others: [],
    };
    const frag = new Map<string, number>();
    const other = new Map<string, number>();

    for (const r of results) {
        if (r.tier === 'rare') s.rare += 1;
        else if (r.tier === 'disaster') s.disaster += 1;
        else s.normal += 1;

        for (const it of r.rewards ?? []) {
            switch (it.kind) {
                case 'lingshi': s.lingshi += it.amount; break;
                case 'xiuwei': s.xiuwei += it.amount; break;
                case 'jiyuan': s.jiyuan += it.amount; break;
                case 'fragment': {
                    const id = it.lingengId ?? '';
                    frag.set(id, (frag.get(id) ?? 0) + it.amount);
                    break;
                }
                default:
                    other.set(it.label, (other.get(it.label) ?? 0) + it.amount);
                    break;
            }
        }
    }
    // ⚠ 不要写 [...map.entries()]：本项目构建目标的降级编译会把它变成
    // `[].concat(map.entries())`，而 concat **不会展开迭代器** —— 结果数组里
    // 只有一个 MapIterator，后续取 [_ref[0]] 恒为 undefined。单测跑在 node
    // （原生支持迭代器展开）测不出来，只有构建产物会炸（已踩过：打包后
    // showAutoSummary 抛 "unknown lingeng: undefined"）。用 forEach 显式收集。
    const fragments: Array<{ id: string; amount: number }> = [];
    frag.forEach((amount, id) => fragments.push({ id, amount }));
    const others: Array<{ label: string; amount: number }> = [];
    other.forEach((amount, label) => others.push({ label, amount }));
    s.fragments = fragments;
    s.others = others;
    return s;
}
