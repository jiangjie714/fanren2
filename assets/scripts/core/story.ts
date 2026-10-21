/**
 * M30 剧情文本（docs/数值假设.md #56）的判定层。
 *
 * **分层约束**：本模块零 `import 'cc'`、零 System 依赖 —— 只回答「此刻该播放哪个节拍」，
 * 渲染由 `ui/StoryLayer.ts` 负责，场景上下文由各场景 `storyCtx()` 自报
 * （同 M27 引导的 `guideAnchor()` 范式），可脱离引擎单测（tests/story.test.ts）。
 *
 * 设计要点（spec §2/§3）：
 * - **一次只播一个节拍**：按注册序返回第一个「未听过 + 场景门命中 + 条件命中」的节拍；
 * - **听过即标记，跳过也标记**：每个节拍一生一次（开局节拍条件恒真，不落盘会在首页反复重播）；
 * - **零数值改动**：不发奖励、不改概率/经济 → 明确不入 #38 护栏②；
 * - 老档 migrate 后不补课：境界节拍只在新的成功结算页触发，opening 要求 `realmIndex === 0`。
 */
import { SaveData } from './saveModel';
import {
    STORY_BEATS,
    STORY_BEAT_IDS,
    StoryBeat,
    StoryCtx,
    StorySaveSlice,
    storyBeatById,
} from './config/story';

export { STORY_BEATS, STORY_BEAT_IDS, storyBeatById } from './config/story';
export type { StoryBeat, StoryCtx, StorySaveSlice, StoryLine, StoryGroup } from './config/story';

/** 场景自报的剧情上下文（不含 scene，由渲染层从栈顶 node.name 补全） */
export interface StorySceneCtx {
    breakthrough?: { success: boolean; targetIndex: number };
    trailChapter?: number;
}

/** 参与剧情的场景实现的协议（同 GuideHost）；不需要剧情的场景不实现 */
export interface StoryHost {
    storyCtx(): StorySceneCtx | null;
}

/** 判定所需的最小存档切片 */
type StorySave = Pick<SaveData, 'realmIndex' | 'story' | 'starter'>;

/** 已听过的节拍 id（脏档安全：缺字段按空数组） */
export function storySeen(save: StorySave): string[] {
    const seen = save.story && save.story.seen;
    return Array.isArray(seen) ? seen : [];
}

/** 标记听过（幂等：已含则不动，不会重复落盘） */
export function markStorySeen(save: StorySave, id: string): void {
    if (!save.story) save.story = { seen: [] };
    if (!Array.isArray(save.story.seen)) save.story.seen = [];
    if (save.story.seen.indexOf(id) < 0) save.story.seen.push(id);
}

/** 是否已听过 */
export function storyHeard(save: StorySave, id: string): boolean {
    return storySeen(save).indexOf(id) >= 0;
}

/**
 * 当前应播放的节拍；`null` = 不播放。
 *
 * 判定序：注册序 → 未听过 → 场景门（`at === ctx.scene`）→ 节拍条件 `when`。
 * 任一刻度最多命中一个（场景门互斥），不存在叠放；播完标记 seen 后下一次才可能命中下一个。
 */
export function storyBeatFor(save: StorySave, ctx: StoryCtx): StoryBeat | null {
    const slice: StorySaveSlice = {
        realmIndex: save.realmIndex,
        seen: storySeen(save),
        // 脏档安全：starter 缺字段（未迁移老档直读）按未走完，不误开演（D1-60s #59）
        starterDone: Boolean(save.starter && save.starter.done),
    };
    for (const b of STORY_BEATS) {
        if (b.at !== ctx.scene) continue;
        if (slice.seen.indexOf(b.id) >= 0) continue;
        if (b.when(slice, ctx)) return b;
    }
    return null;
}
