import { describe, expect, it } from 'vitest';
import { computePathOverview } from '../assets/scripts/core/path';
import { ACHIEVEMENTS } from '../assets/scripts/core/config/achievements';
import { LINGENS } from '../assets/scripts/core/config/lingens';
import { REALMS } from '../assets/scripts/core/config/realms';
import { defaultSave } from '../assets/scripts/core/saveModel';

describe('computePathOverview（M23 修仙之路）', () => {
    it('新档（凡人）：总进度 0，节点三态正确，当前节点挂练气机缘进度', () => {
        const save = defaultSave();
        const p = computePathOverview(save);

        expect(p.realmProgress).toBe(0);
        expect(p.realmIndex).toBe(0);
        expect(p.realmName).toBe('凡人');
        expect(p.nextName).toBe('练气');

        expect(p.nodes).toHaveLength(REALMS.length);
        expect(p.nodes[0].state).toBe('current');
        expect(p.nodes[0].jiyuan).toBe(0);
        expect(p.nodes[0].needJiyuan).toBe(60);
        expect(p.nodes[0].ratio).toBe(0);
        for (let i = 1; i < p.nodes.length; i++) {
            expect(p.nodes[i].state).toBe('future');
        }
    });

    it('中期档（金丹 3）：前 3 节点 done、当前金丹、机缘进度 120/800', () => {
        const save = defaultSave();
        save.realmIndex = 3;
        save.jiyuan = 120;
        const p = computePathOverview(save);

        expect(p.realmProgress).toBeCloseTo(3 / 5, 10);
        expect(p.realmName).toBe('金丹');
        expect(p.nextName).toBe('元婴');

        for (let i = 0; i < 3; i++) expect(p.nodes[i].state).toBe('done');
        expect(p.nodes[3].state).toBe('current');
        expect(p.nodes[3].jiyuan).toBe(120);
        // needJiyuan 口径 = 突破到「该境界」所需 → 下一境界元婴为 2000
        expect(p.nodes[3].needJiyuan).toBe(2000);
        expect(p.nodes[3].ratio).toBeCloseTo(120 / 2000, 10);
        for (let i = 4; i < p.nodes.length; i++) expect(p.nodes[i].state).toBe('future');
    });

    it('化神满：总进度 1、无下一境界、当前节点无进度字段', () => {
        const save = defaultSave();
        save.realmIndex = 5;
        const p = computePathOverview(save);

        expect(p.realmProgress).toBe(1);
        expect(p.realmName).toBe('化神');
        expect(p.nextName).toBeNull();
        expect(p.nodes.every((n) => n.state === 'done')).toBe(true);
        expect(p.nodes[5].jiyuan).toBeUndefined();
        expect(p.nodes[5].ratio).toBeUndefined();
    });

    it('机缘超额时 ratio 钳制为 1（可突破状态）', () => {
        const save = defaultSave();
        save.jiyuan = 9999; // 远超练气 60
        const p = computePathOverview(save);
        expect(p.nodes[0].ratio).toBe(1);
    });

    it('副线派生：妖径章/层、剑冢、图鉴、成就', () => {
        const save = defaultSave();
        // 全局层号 34 → 第 4 章第 4 层（每章 10 层）；curLayer=35 = 已通关 34 +1
        save.trail.curLayer = 35;
        save.tower.best = 87;
        save.tower.swordLevel = 12;
        save.unlocked = ['jinmu', 'shuituo', 'tianling'];
        save.achievements.reached = ['firstOpen', 'firstTribulation'];
        const p = computePathOverview(save);

        expect(p.sub.trailChapter).toBe(4);
        expect(p.sub.trailLayer).toBe(5); // curLayer=35 是「当前可挑战层」：第 4 章第 5 层
        expect(p.sub.towerBest).toBe(87);
        expect(p.sub.towerSwordLevel).toBe(12);
        expect(p.sub.lingenCount).toBe(3);
        expect(p.sub.lingenTotal).toBe(LINGENS.length);
        expect(p.sub.achievementCount).toBe(2);
        expect(p.sub.achievementTotal).toBe(ACHIEVEMENTS.length);
    });

    it('新档副线默认值：妖径第 1 章第 1 层、剑冢 0 层、图鉴/成就为 0', () => {
        const p = computePathOverview(defaultSave());
        expect(p.sub.trailChapter).toBe(1);
        expect(p.sub.trailLayer).toBe(1);
        expect(p.sub.towerBest).toBe(1); // 剑冢 best 起点 1（只升不降口径）
        expect(p.sub.lingenCount).toBe(0);
        expect(p.sub.achievementCount).toBe(0);
    });
});
