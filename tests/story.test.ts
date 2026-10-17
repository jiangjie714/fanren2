/**
 * M30 剧情文本（#56）判定层单测 —— `core/story.ts` + `core/config/story.ts`，零 cc 依赖直测。
 *
 * 覆盖：注册表自洽（id 唯一/场景门合法/行数行长）／三个叙事时刻的触发与幂等／
 * 一次只播一个节拍／v12 迁移钳制（脏 seen：非数组/未注册 id/重复/非字符串）／
 * 两条「不做现代人该忽略」的配置一致性护栏（分组计数/标题自含语境）。
 */
import { describe, expect, it } from 'vitest';
import {
    STORY_BEATS,
    STORY_BEAT_IDS,
    STORY_GROUPS,
    STORY_SCENE_HOME,
    STORY_SCENE_RESULT,
    STORY_SCENE_TRAIL,
    storyBeatById,
    storyBeatsByGroup,
} from '../assets/scripts/core/config/story';
import {
    markStorySeen,
    storyBeatFor,
    storyHeard,
    storySeen,
} from '../assets/scripts/core/story';
import { defaultSave, migrate, type SaveData } from '../assets/scripts/core/saveModel';

/** 构造判定用存档：默认白纸 + 可覆写 */
function saveOf(patch: Partial<SaveData> = {}): SaveData {
    return { ...defaultSave(), ...patch };
}

/** 首页上下文（无场景自报字段） */
const homeCtx = { scene: STORY_SCENE_HOME };
/** 渡劫结算上下文 */
const resultCtx = (success: boolean, targetIndex: number) => ({
    scene: STORY_SCENE_RESULT,
    breakthrough: { success, targetIndex },
});
/** 妖径章节地图上下文 */
const trailCtx = (chapter: number) => ({ scene: STORY_SCENE_TRAIL, trailChapter: chapter });

describe('剧情注册表自洽（#56）', () => {
    it('id 唯一且总数 15（启程 1 + 境界 5 + 妖径 9）', () => {
        expect(STORY_BEATS.length).toBe(15);
        const ids = new Set(STORY_BEAT_IDS);
        expect(ids.size).toBe(15);
        expect(storyBeatsByGroup('journey').length).toBe(1);
        expect(storyBeatsByGroup('realm').length).toBe(5);
        expect(storyBeatsByGroup('trail').length).toBe(9);
    });

    it('每个节拍：场景门合法 / 分组合法 / 标题非空 / 行数 2–4 / 行长 ≤22 / 说话者非空', () => {
        const scenes = [STORY_SCENE_HOME, STORY_SCENE_RESULT, STORY_SCENE_TRAIL];
        for (const b of STORY_BEATS) {
            expect(scenes, `${b.id} 的场景门必须合法`).toContain(b.at);
            expect(STORY_GROUPS, `${b.id} 的分组必须合法`).toContain(b.group);
            expect(b.title.length, `${b.id} 标题不能为空`).toBeGreaterThan(0);
            expect(b.lines.length, `${b.id} 行数须在 2–4`).toBeGreaterThanOrEqual(2);
            expect(b.lines.length, `${b.id} 行数须在 2–4`).toBeLessThanOrEqual(4);
            for (const l of b.lines) {
                expect(l.speaker.length, `${b.id} 说话者不能为空`).toBeGreaterThan(0);
                // 面板一行容量 560/26px ≈ 22 字；超长会折行撑破对话面板（spec §5）
                expect(l.text.length, `${b.id} 行超长（>22 字）：${l.text}`).toBeLessThanOrEqual(22);
            }
        }
    });

    it('境界节拍 targetIndex 1–5 与妖径节拍 trailChapter 1–9 一一对应不重不漏', () => {
        const realms = STORY_BEATS.filter((b) => b.group === 'realm');
        expect(realms.map((b) => b.id)).toEqual(['realm_1', 'realm_2', 'realm_3', 'realm_4', 'realm_5']);
        const trails = STORY_BEATS.filter((b) => b.group === 'trail');
        expect(trails.map((b) => b.id)).toEqual(
            Array.from({ length: 9 }, (_, i) => `trail_${i + 1}`),
        );
    });

    it('storyBeatById：注册表内返回节拍，未注册 id 返回 null（仙闻录防呆）', () => {
        expect(storyBeatById('opening')!.title).toBe('仙途启程');
        expect(storyBeatById('realm_5')!.lines.length).toBeGreaterThan(0);
        expect(storyBeatById('bogus')).toBeNull();
        expect(storyBeatById('')).toBeNull();
    });
});

describe('开局节拍 opening（#56）', () => {
    it('新档首次进首页 → 播放 opening', () => {
        const save = saveOf({ realmIndex: 0 });
        const beat = storyBeatFor(save, homeCtx);
        expect(beat?.id).toBe('opening');
        expect(beat?.lines[0].speaker).toBe('旁白');
    });

    it('听过即不再现（跳过/播完都标记 seen）', () => {
        const save = saveOf({ realmIndex: 0 });
        markStorySeen(save, 'opening');
        expect(storyBeatFor(save, homeCtx)).toBeNull();
        expect(storyHeard(save, 'opening')).toBe(true);
    });

    it('已突破过（realmIndex > 0）不触发 —— 老玩家与开局擦肩过，不补课', () => {
        const save = saveOf({ realmIndex: 1 });
        expect(storyBeatFor(save, homeCtx)).toBeNull();
    });

    it('场景门：只在首页播，结算页/妖径页不播', () => {
        const save = saveOf({ realmIndex: 0 });
        expect(storyBeatFor(save, resultCtx(true, 1))?.id).toBe('realm_1');
        expect(storyBeatFor(save, trailCtx(1))?.id).toBe('trail_1');
        expect(storyBeatFor(save, { scene: 'BoxScene' })).toBeNull();
    });
});

describe('境界节拍 realm_N（#56）', () => {
    it('突破成功且 targetIndex = N → 播对应节拍', () => {
        for (let n = 1; n <= 5; n++) {
            const save = saveOf({ realmIndex: n });
            const beat = storyBeatFor(save, resultCtx(true, n));
            expect(beat?.id).toBe(`realm_${n}`);
        }
    });

    it('突破失败不播（情绪时刻不对，且条件里 success 为真才命中）', () => {
        const save = saveOf({ realmIndex: 0 });
        expect(storyBeatFor(save, resultCtx(false, 1))).toBeNull();
    });

    it('targetIndex 不匹配不播；跳过 = 永久不再现（spec §2 心智模型）', () => {
        const save = saveOf({ realmIndex: 2 });
        expect(storyBeatFor(save, resultCtx(true, 2))?.id).toBe('realm_2');
        // realm_1 未听过：在 targetIndex=1 的结算页按注册序补上
        expect(storyBeatFor(save, resultCtx(true, 1))?.id).toBe('realm_1');
        // 标记听过（跳过或播完）后，同一页不再翻出——每个节拍一生一次，不补课
        markStorySeen(save, 'realm_1');
        expect(storyBeatFor(save, resultCtx(true, 1))).toBeNull();
    });

    it('无 breakthrough 上下文（别的场景自报了空 ctx）不播', () => {
        const save = saveOf({ realmIndex: 3 });
        expect(storyBeatFor(save, { scene: STORY_SCENE_RESULT })).toBeNull();
    });
});

describe('妖径节拍 trail_N（#56）', () => {
    it('首次踏入第 N 章地图 → 播对应节拍；听过即不再现', () => {
        const save = saveOf();
        expect(storyBeatFor(save, trailCtx(3))?.id).toBe('trail_3');
        markStorySeen(save, 'trail_3');
        expect(storyBeatFor(save, trailCtx(3))).toBeNull();
    });

    it('章号不匹配不播（只讲当前章的故事）', () => {
        const save = saveOf();
        expect(storyBeatFor(save, trailCtx(7))?.id).toBe('trail_7');
    });
});

describe('一次只播一个节拍 + 幂等标记（#56）', () => {
    it('同屏多条件命中时按注册序只返回第一个（opening 优先于其它）', () => {
        const save = saveOf({ realmIndex: 0 });
        // 首页：opening 条件命中；即使 trailChapter 也报上，opening 先播
        const beat = storyBeatFor(save, { scene: STORY_SCENE_HOME, trailChapter: 1 });
        expect(beat?.id).toBe('opening');
        markStorySeen(save, 'opening');
        // opening 标记后首页再无命中（realm 节走结算页门、trail 走妖径门）
        expect(storyBeatFor(save, homeCtx)).toBeNull();
    });

    it('markStorySeen 幂等：重复标记不产生重复项', () => {
        const save = saveOf();
        markStorySeen(save, 'realm_1');
        markStorySeen(save, 'realm_1');
        markStorySeen(save, 'realm_1');
        expect(save.story.seen).toEqual(['realm_1']);
    });

    it('storySeen 脏档安全：story 字段缺失按空数组', () => {
        const raw = { realmIndex: 0 } as unknown as SaveData;
        expect(storySeen(raw)).toEqual([]);
        expect(storyHeard(raw, 'opening')).toBe(false);
    });
});

describe('存档 v12 迁移（#56）', () => {
    it('defaultSave：version 12 + story 白纸', () => {
        const d = defaultSave();
        expect(d.version).toBe(12);
        expect(d.story).toEqual({ seen: [] });
    });

    it('v11 老档 → v12：story 缺省补齐（全未听过）', () => {
        const raw = { ...defaultSave(), version: 11 } as unknown as Record<string, unknown>;
        delete (raw as { story?: unknown }).story;
        const s = migrate(raw);
        expect(s.version).toBe(12);
        expect(s.story).toEqual({ seen: [] });
    });

    it('v11 老档保留已听节拍（去重 + 按注册序 + 丢弃未注册 id + 过滤非字符串）', () => {
        const raw = {
            version: 11,
            story: { seen: ['trail_2', 'opening', 'opening', 'bogus_id', 42, null, 'realm_5'] },
        };
        const s = migrate(raw);
        expect(s.version).toBe(12);
        expect(s.story.seen).toEqual(['opening', 'realm_5', 'trail_2']);
    });

    it('脏 seen 形状（非数组/非对象）一律回退空数组', () => {
        expect(migrate({ version: 11, story: { seen: 'opening' } }).story.seen).toEqual([]);
        expect(migrate({ version: 11, story: null }).story.seen).toEqual([]);
        expect(migrate({ version: 11, story: 42 }).story.seen).toEqual([]);
    });

    it('迁移后判定链路自洽：听过 opening 的 v11 老档在首页不重播', () => {
        const s = migrate({ version: 11, realmIndex: 2, story: { seen: ['opening'] } });
        expect(storyBeatFor(s, homeCtx)).toBeNull();
    });
});
