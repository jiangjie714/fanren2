/**
 * 新手引导（M27，docs/数值假设.md #54）的判定层。
 *
 * **分层约束**：本模块零 `import 'cc'`，也不依赖任何 System —— 只回答「此刻该展示哪一步」，
 * 渲染由 `ui/GuideLayer.ts` 负责，目标坐标由各场景 `guideAnchor()` 自报，可脱离引擎单测
 * （tests/guide.test.ts）。
 *
 * 设计要点：
 * - **步骤由存档状态推导，不存「当前步」**：`realmIndex` / `canBreakthrough` / 当前场景三者
 *   足以决定该展示哪一步，再存一份 `step` 会产生「存档里的步 vs 实际状态」双源真相；
 * - **零数值改动**：引导不发任何奖励、不改任何门槛，只是把玩家已经能做的事指出来；
 * - **结束条件双通道**：主动跳过（写 `tutorial.done`）或首次渡劫成功（`realmIndex > 0`，
 *   由 `guideFinished` 暴露给调用方补写 `done` 并落盘）；
 * - **非引导场景静默**：返回 `null` 而非「全屏遮挡」，新页面默认不吃引导。
 */
import { SaveData } from './saveModel';
import { TEXTS } from './config/texts';

/** 三步引导的步骤标识 */
export type GuideStepId = 'openBoxEntry' | 'boxOpen' | 'breakthrough';

/** 全部步骤 id（顺序与引导推进顺序一致） */
export const GUIDE_STEP_IDS: GuideStepId[] = ['openBoxEntry', 'boxOpen', 'breakthrough'];

/** 参与引导的场景 node.name（场景自报 `guideAnchor()` 时用得上） */
export const GUIDE_SCENE_HOME = 'HomeScene';
export const GUIDE_SCENE_BOX = 'BoxScene';

export interface GuideStep {
    id: GuideStepId;
    title: string;
    body: string;
}

/**
 * 判定上下文。由引导层注入（保持本模块零 System 依赖）：
 * `canBreakthrough` 取 `Game.realm.canBreakthrough()`，`scene` 取栈顶 node.name。
 */
export interface GuideCtx {
    scene: string;
    /** 机缘是否已够渡劫 */
    canBreakthrough: boolean;
}

/** 目标矩形（设计系 720×1280 中心坐标系，中心锚）。由场景自报，比引导层硬编码更抗漂移。 */
export interface GuideAnchor {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** 参与引导的场景实现的协议：返回目标矩形；`null` = 此刻不宜引导（如浮层打开中）。 */
export interface GuideHost {
    guideAnchor(): GuideAnchor | null;
}

/** 最小存档切片：只取判定所需字段，便于测试与将来复用 */
type GuideSave = Pick<SaveData, 'realmIndex' | 'tutorial'>;

/** 玩家已主动跳过（或已判定完成）→ 引导永不再现 */
export function guideDone(save: GuideSave): boolean {
    return !!(save.tutorial && save.tutorial.done);
}

/**
 * 引导目标已达成（首次渡劫成功）但尚未写入 `done` → true。
 * 调用方（GuideLayer.sync）据此补写 `save.tutorial.done = true` 并落盘一次。
 * 已 `done` 时返回 false，保证标记动作幂等（不会每帧重复落盘）。
 */
export function guideFinished(save: GuideSave): boolean {
    return !guideDone(save) && save.realmIndex > 0;
}

/**
 * 当前应展示的引导步骤；`null` = 不展示。
 *
 * 判定顺序：已完成 → 已渡劫 → 按场景路由。开箱页优先于首页的机缘判定
 * （玩家人在开箱页时，指「开 启」比指首页入口有用）。
 */
export function guideStepFor(save: GuideSave, ctx: GuideCtx): GuideStep | null {
    if (guideDone(save)) return null;
    if (save.realmIndex > 0) return null;

    if (ctx.scene === GUIDE_SCENE_BOX) {
        return { id: 'boxOpen', title: TEXTS.guideStep2Title, body: TEXTS.guideStep2Body };
    }
    if (ctx.scene === GUIDE_SCENE_HOME) {
        return ctx.canBreakthrough
            ? { id: 'breakthrough', title: TEXTS.guideStep3Title, body: TEXTS.guideStep3Body }
            : { id: 'openBoxEntry', title: TEXTS.guideStep1Title, body: TEXTS.guideStep1Body };
    }
    return null;
}
