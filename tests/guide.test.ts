/**
 * M27 新手引导（docs/数值假设.md #54）判定层。
 *
 * 覆盖：三步路由（首页攒机缘 / 开箱页开启 / 首页渡劫）、结束条件（首次渡劫成功 /
 * 主动跳过）、非引导场景静默、文案非空、存档 v10 `tutorial` 迁移。
 */
import { describe, expect, it } from 'vitest';
import { defaultSave, migrate, SaveData } from '../assets/scripts/core/saveModel';
import {
    GUIDE_SCENE_BOX,
    GUIDE_SCENE_HOME,
    GUIDE_STEP_IDS,
    guideDone,
    guideFinished,
    guideStepFor,
    type GuideCtx,
} from '../assets/scripts/core/guide';

/** 构造一份「首日新玩家」存档：凡人期、未跳过引导 */
function fresh(): SaveData {
    const s = defaultSave();
    s.realmIndex = 0;
    s.tutorial = { done: false };
    return s;
}

const home = (canBreakthrough: boolean): GuideCtx => ({ scene: GUIDE_SCENE_HOME, canBreakthrough });
const box = (canBreakthrough = false): GuideCtx => ({ scene: GUIDE_SCENE_BOX, canBreakthrough });

describe('M27 新手引导：步骤路由', () => {
    it('首页 + 机缘不足 → 步骤 1 指「仙缘宝盒」入口', () => {
        expect(guideStepFor(fresh(), home(false))?.id).toBe('openBoxEntry');
    });

    it('首页 + 机缘已足 → 步骤 3 指主 CTA 渡劫', () => {
        expect(guideStepFor(fresh(), home(true))?.id).toBe('breakthrough');
    });

    it('开箱页 → 步骤 2 指「开 启」钮（与机缘是否足够无关）', () => {
        expect(guideStepFor(fresh(), box(false))?.id).toBe('boxOpen');
        expect(guideStepFor(fresh(), box(true))?.id).toBe('boxOpen');
    });

    it('非引导场景（渡劫雨 / 妖径 / 捏人）→ 静默不显示', () => {
        const s = fresh();
        for (const scene of ['RainScene', 'TrailScene', 'ProfileScene', '', 'TowerScene']) {
            expect(guideStepFor(s, { scene, canBreakthrough: false })).toBeNull();
        }
    });

    it('三步文案齐全（标题与正文均非空）', () => {
        const s = fresh();
        const a = guideStepFor(s, home(false))!;
        const b = guideStepFor(s, box())!;
        const c = guideStepFor(s, home(true))!;
        for (const step of [a, b, c]) {
            expect(step.title.length).toBeGreaterThan(0);
            expect(step.body.length).toBeGreaterThan(0);
        }
        expect(new Set([a.id, b.id, c.id]).size).toBe(3);
    });

    it('步骤表与路由一致：GUIDE_STEP_IDS 三个 id 均可被路由命中', () => {
        expect(GUIDE_STEP_IDS.slice().sort()).toEqual(['boxOpen', 'breakthrough', 'openBoxEntry']);
        const s = fresh();
        const hit = new Set([
            guideStepFor(s, home(false))!.id,
            guideStepFor(s, box())!.id,
            guideStepFor(s, home(true))!.id,
        ]);
        GUIDE_STEP_IDS.forEach((id) => expect(hit.has(id)).toBe(true));
    });
});

describe('M27 新手引导：结束条件', () => {
    it('主动跳过后永不再现', () => {
        const s = fresh();
        s.tutorial.done = true;
        expect(guideDone(s)).toBe(true);
        expect(guideStepFor(s, home(false))).toBeNull();
        expect(guideStepFor(s, box())).toBeNull();
        expect(guideStepFor(s, home(true))).toBeNull();
    });

    it('首次渡劫成功（realmIndex > 0）→ 目标达成，不再引导', () => {
        const s = fresh();
        s.realmIndex = 1;
        expect(guideStepFor(s, home(true))).toBeNull();
        expect(guideStepFor(s, home(false))).toBeNull();
    });

    it('guideFinished：已渡劫但未标记 done → true（供调用方补写 done 并落盘）', () => {
        const s = fresh();
        expect(guideFinished(s)).toBe(false);
        s.realmIndex = 1;
        expect(guideFinished(s)).toBe(true);
        // 已标记则不再重复标记（幂等）
        s.tutorial.done = true;
        expect(guideFinished(s)).toBe(false);
    });

    it('未渡劫（realmIndex = 0）不算完成，即使开箱多次', () => {
        const s = fresh();
        s.stats.opens = 12;
        expect(guideFinished(s)).toBe(false);
        expect(guideStepFor(s, home(false))?.id).toBe('openBoxEntry');
    });
});

describe('M27 存档 v10：tutorial 迁移', () => {
    it('defaultSave 是 v10 且带 tutorial{done:false}', () => {
        const s = defaultSave();
        expect(s.version).toBe(16);
        expect(s.tutorial).toEqual({ done: false });
        expect(guideDone(s)).toBe(false);
    });

    it('v9 老档迁移：补齐 tutorial，版本升到 10', () => {
        const old = { ...defaultSave(), version: 9 } as unknown as Record<string, unknown>;
        delete old.tutorial;
        const s = migrate(old as never);
        expect(s.version).toBe(16);
        expect(s.tutorial.done).toBe(false);
    });

    it('脏值钳制：tutorial 非对象 / done 非布尔都不炸', () => {
        expect(migrate({ ...defaultSave(), tutorial: 'yes' } as never).tutorial).toEqual({ done: false });
        expect(migrate({ ...defaultSave(), tutorial: null } as never).tutorial).toEqual({ done: false });
        // done 取真值布尔：1 → true，0 → false
        expect(migrate({ ...defaultSave(), tutorial: { done: 1 } } as never).tutorial.done).toBe(true);
        expect(migrate({ ...defaultSave(), tutorial: { done: 0 } } as never).tutorial.done).toBe(false);
    });

    it('已跳过引导的老档迁移后仍保持 done（不清空玩家选择）', () => {
        const s = migrate({ ...defaultSave(), tutorial: { done: true } } as never);
        expect(s.tutorial.done).toBe(true);
        expect(guideDone(s)).toBe(true);
    });
});
