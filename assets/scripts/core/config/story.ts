/**
 * M30 剧情文本（docs/数值假设.md #56）的节拍注册表 —— 纯数据，零 `cc` 依赖。
 *
 * 与 `config/trail.ts` 同款配置范式：内容（文案）与判定条件都在表内落地，
 * 渲染层（ui/StoryLayer.ts）与判定层（core/story.ts）都不硬编码场景知识。
 *
 * 设计约束（spec §2/§5）：
 * - 每个节拍一生只播一次（听过即标记 seen，跳过也标记）；仙闻录回看不重复标记
 * - 每行 ≤ 22 字：对话面板一行容量（560 宽 / 26px），超长会折行撑破面板
 * - 说话者统一「旁白」，开局加一位「老者」；不用立绘，文字 chip 表达（零美术资源）
 * - 文风短句留白；合规口径同既有文案（无赌博/暴力词汇）
 */

/** 节拍分组（仙闻录的分组标题序） */
export type StoryGroup = 'journey' | 'realm' | 'trail';

export const STORY_GROUPS: readonly StoryGroup[] = ['journey', 'realm', 'trail'];

/** 参与剧情的场景 node.name（与 guide.ts 的 GUIDE_SCENE_* 同口径） */
export const STORY_SCENE_HOME = 'HomeScene';
export const STORY_SCENE_RESULT = 'ResultScene';
export const STORY_SCENE_TRAIL = 'TrailScene';

/** 一行对白 */
export interface StoryLine {
    speaker: string;
    text: string;
}

/**
 * 判定用的最小存档切片（结构类型，不 import saveModel —— 保持本配置零依赖）。
 * `realmIndex` 给开局节拍用；`seen` 由判定层传入。
 */
export interface StorySaveSlice {
    realmIndex: number;
    seen: string[];
}

/** 场景自报 + 渲染层补全的判定上下文 */
export interface StoryCtx {
    /** 栈顶场景 node.name */
    scene: string;
    /** ResultScene 自报：本次渡劫结算（境界节拍只在成功页触发） */
    breakthrough?: { success: boolean; targetIndex: number };
    /** TrailScene 自报：当前章节号（妖径节拍按章触发） */
    trailChapter?: number;
}

export interface StoryBeat {
    id: string;
    /** 允许播放的场景 node.name */
    at: string;
    group: StoryGroup;
    /** 节拍标题：对话面板页眉 + 仙闻录行标题（自含分组语境，无需额外字段） */
    title: string;
    lines: StoryLine[];
    /** 触发条件（存档 + ctx 推导；纯函数） */
    when(save: StorySaveSlice, ctx: StoryCtx): boolean;
}

const seen = (save: StorySaveSlice, id: string) => save.seen.indexOf(id) >= 0;

const NARRATOR = '旁白';
const ELDER = '老者';

export const STORY_BEATS: readonly StoryBeat[] = [
    // ---------- 启程：开局（首页，未突破过） ----------
    {
        id: 'opening',
        at: STORY_SCENE_HOME,
        group: 'journey',
        title: '仙途启程',
        lines: [
            { speaker: NARRATOR, text: '凡尘一梦四十载，你在残卷里翻到半页仙谱。' },
            { speaker: NARRATOR, text: '当夜窗外落雨，雨里带着灵。' },
            { speaker: ELDER, text: '既有缘看见，便是缘。仙路自此始——' },
        ],
        when: (save) => save.realmIndex === 0 && !seen(save, 'opening'),
    },
    // ---------- 境界：每次大境界突破成功（渡劫结算页） ----------
    {
        id: 'realm_1',
        at: STORY_SCENE_RESULT,
        group: 'realm',
        title: '练气 · 第一缕灵气',
        lines: [
            { speaker: NARRATOR, text: '第一缕灵气入体，如寒夜添衣。' },
            { speaker: NARRATOR, text: '你借着微光看清那道门槛——' },
            { speaker: NARRATOR, text: '原此前四十年，都算是睡着。' },
        ],
        when: (save, ctx) =>
            !seen(save, 'realm_1') && !!ctx.breakthrough && ctx.breakthrough.success && ctx.breakthrough.targetIndex === 1,
    },
    {
        id: 'realm_2',
        at: STORY_SCENE_RESULT,
        group: 'realm',
        title: '筑基 · 道基初筑',
        lines: [
            { speaker: NARRATOR, text: '道基初筑，如屋有梁。' },
            { speaker: NARRATOR, text: '风霜再烈，总算有了立锥之地。' },
        ],
        when: (save, ctx) =>
            !seen(save, 'realm_2') && !!ctx.breakthrough && ctx.breakthrough.success && ctx.breakthrough.targetIndex === 2,
    },
    {
        id: 'realm_3',
        at: STORY_SCENE_RESULT,
        group: 'realm',
        title: '金丹 · 我命非由天',
        lines: [
            { speaker: NARRATOR, text: '一粒金丹吞入腹，始知我命非由天。' },
            { speaker: NARRATOR, text: '前路仍有三千劫，但已敢回头看。' },
        ],
        when: (save, ctx) =>
            !seen(save, 'realm_3') && !!ctx.breakthrough && ctx.breakthrough.success && ctx.breakthrough.targetIndex === 3,
    },
    {
        id: 'realm_4',
        at: STORY_SCENE_RESULT,
        group: 'realm',
        title: '元婴 · 暂借的皮囊',
        lines: [
            { speaker: NARRATOR, text: '元婴出窍，看自己端坐，如看别人。' },
            { speaker: NARRATOR, text: '原来「我」之一字，也只是暂借的皮囊。' },
        ],
        when: (save, ctx) =>
            !seen(save, 'realm_4') && !!ctx.breakthrough && ctx.breakthrough.success && ctx.breakthrough.targetIndex === 4,
    },
    {
        id: 'realm_5',
        at: STORY_SCENE_RESULT,
        group: 'realm',
        title: '化神 · 山还是山',
        lines: [
            { speaker: NARRATOR, text: '雷云散尽，你站在最高处。' },
            { speaker: NARRATOR, text: '山还是山。只是你再无需仰望。' },
        ],
        when: (save, ctx) =>
            !seen(save, 'realm_5') && !!ctx.breakthrough && ctx.breakthrough.success && ctx.breakthrough.targetIndex === 5,
    },
    // ---------- 妖径：每章首次踏入章节地图 ----------
    {
        id: 'trail_1',
        at: STORY_SCENE_TRAIL,
        group: 'trail',
        title: '第1章 · 入山第一夜',
        lines: [
            { speaker: NARRATOR, text: '入山第一夜，雾里有眼睛。' },
            { speaker: NARRATOR, text: '你握紧凡铁剑——它尚不懂得灵，' },
            { speaker: NARRATOR, text: '却懂得你的手。' },
        ],
        when: (save, ctx) => !seen(save, 'trail_1') && ctx.trailChapter === 1,
    },
    {
        id: 'trail_2',
        at: STORY_SCENE_TRAIL,
        group: 'trail',
        title: '第2章 · 霞是血的另一种说法',
        lines: [
            { speaker: NARRATOR, text: '霞是血的另一种说法。' },
            { speaker: NARRATOR, text: '谷中妖物学会了人语，' },
            { speaker: NARRATOR, text: '学会的第一句，便是你的名字。' },
        ],
        when: (save, ctx) => !seen(save, 'trail_2') && ctx.trailChapter === 2,
    },
    {
        id: 'trail_3',
        at: STORY_SCENE_TRAIL,
        group: 'trail',
        title: '第3章 · 没说完的话',
        lines: [
            { speaker: NARRATOR, text: '石碑压着上古的封印，' },
            { speaker: NARRATOR, text: '也压着一句没有说完的话。' },
            { speaker: NARRATOR, text: '你绕碑而行，里面有东西跟着你绕。' },
        ],
        when: (save, ctx) => !seen(save, 'trail_3') && ctx.trailChapter === 3,
    },
    {
        id: 'trail_4',
        at: STORY_SCENE_TRAIL,
        group: 'trail',
        title: '第4章 · 下面接着的东西',
        lines: [
            { speaker: NARRATOR, text: '血无海深，渊无底深。' },
            { speaker: NARRATOR, text: '走下去的每一步，' },
            { speaker: NARRATOR, text: '都有东西在下面接着。' },
        ],
        when: (save, ctx) => !seen(save, 'trail_4') && ctx.trailChapter === 4,
    },
    {
        id: 'trail_5',
        at: STORY_SCENE_TRAIL,
        group: 'trail',
        title: '第5章 · 唯一的雷',
        lines: [
            { speaker: NARRATOR, text: '冰原千年无人声，' },
            { speaker: NARRATOR, text: '你的心跳，成了唯一的雷。' },
            { speaker: NARRATOR, text: '某些冰层下，睁开了眼睛。' },
        ],
        when: (save, ctx) => !seen(save, 'trail_5') && ctx.trailChapter === 5,
    },
    {
        id: 'trail_6',
        at: STORY_SCENE_TRAIL,
        group: 'trail',
        title: '第6章 · 剑讲的道理',
        lines: [
            { speaker: NARRATOR, text: '雷落在这里，从不讲道理。' },
            { speaker: NARRATOR, text: '但你的剑讲——' },
            { speaker: NARRATOR, text: '它说：再来。' },
        ],
        when: (save, ctx) => !seen(save, 'trail_6') && ctx.trailChapter === 6,
    },
    {
        id: 'trail_7',
        at: STORY_SCENE_TRAIL,
        group: 'trail',
        title: '第7章 · 不肯认输的话',
        lines: [
            { speaker: NARRATOR, text: '海水在这里学会了燃烧。' },
            { speaker: NARRATOR, text: '火里浮着前人的骸骨，' },
            { speaker: NARRATOR, text: '也浮着前人不肯认输的话。' },
        ],
        when: (save, ctx) => !seen(save, 'trail_7') && ctx.trailChapter === 7,
    },
    {
        id: 'trail_8',
        at: STORY_SCENE_TRAIL,
        group: 'trail',
        title: '第8章 · 草的样子',
        lines: [
            { speaker: NARRATOR, text: '风把石头切成齑粉，' },
            { speaker: NARRATOR, text: '却没切动一株草。' },
            { speaker: NARRATOR, text: '你记下草的样子，然后走进风里。' },
        ],
        when: (save, ctx) => !seen(save, 'trail_8') && ctx.trailChapter === 8,
    },
    {
        id: 'trail_9',
        at: STORY_SCENE_TRAIL,
        group: 'trail',
        title: '第9章 · 废墟最高处',
        lines: [
            { speaker: NARRATOR, text: '星辰陨落之地，天也碎成一片墟。' },
            { speaker: NARRATOR, text: '废墟最高处，有人在等你。' },
            { speaker: NARRATOR, text: '等了很久。' },
        ],
        when: (save, ctx) => !seen(save, 'trail_9') && ctx.trailChapter === 9,
    },
];

/** 全部节拍 id（顺序即注册序） */
export const STORY_BEAT_IDS: readonly string[] = STORY_BEATS.map((b) => b.id);

/** 按 id 取节拍（仙闻录回看用）；未注册 id 返回 null */
export function storyBeatById(id: string): StoryBeat | null {
    for (const b of STORY_BEATS) {
        if (b.id === id) return b;
    }
    return null;
}

/** 按分组取节拍（仙闻录分组渲染用，保序） */
export function storyBeatsByGroup(group: StoryGroup): readonly StoryBeat[] {
    return STORY_BEATS.filter((b) => b.group === group);
}
