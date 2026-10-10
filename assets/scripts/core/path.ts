/**
 * M23 修仙之路：进度总览纯派生（spec 2026-10-10）。
 * 零 cc 依赖、零副作用——所有值从 SaveData + 配置表推导，
 * 供 PathScene 只读展示，不做任何写入。
 */
import { ACHIEVEMENTS } from './config/achievements';
import { LINGENS } from './config/lingens';
import { REALMS } from './config/realms';
import { chapterOf, layerInChapter } from './config/trail';
import { SaveData } from './saveModel';

export interface RealmNode {
    index: number;
    name: string;
    state: 'done' | 'current' | 'future';
    /** 当前节点的机缘进度（done/future 为 undefined；化神无下一境界同样 undefined） */
    jiyuan?: number;
    needJiyuan?: number;
    ratio?: number;
}

export interface SubProgress {
    /** 妖径当前章（1 起） */
    trailChapter: number;
    /** 妖径章内层（1..10，curLayer 语义 = 当前可挑战层） */
    trailLayer: number;
    towerBest: number;
    towerSwordLevel: number;
    lingenCount: number;
    lingenTotal: number;
    achievementCount: number;
    achievementTotal: number;
}

export interface PathOverview {
    /** 境界完成度 0..1（realmIndex / (REALMS.length-1)，化神=1） */
    realmProgress: number;
    realmIndex: number;
    realmName: string;
    /** null = 已至化神（无下一境界） */
    nextName: string | null;
    nodes: RealmNode[];
    sub: SubProgress;
}

export function computePathOverview(save: SaveData): PathOverview {
    const maxIndex = REALMS.length - 1;
    const realmIndex = Math.min(Math.max(0, save.realmIndex), maxIndex);
    const realmProgress = Math.min(1, Math.max(0, realmIndex / maxIndex));
    const atMax = realmIndex >= maxIndex;
    const next = atMax ? null : REALMS[realmIndex + 1];

    const nodes: RealmNode[] = REALMS.map((r, i) => {
        // 化神大圆满：全部节点视为已达成（无「当前」态）
        const state: RealmNode['state'] = atMax || i < realmIndex ? 'done' : i === realmIndex ? 'current' : 'future';
        if (state !== 'current' || !next) return { index: i, name: r.name, state };
        return {
            index: i,
            name: r.name,
            state,
            jiyuan: save.jiyuan,
            needJiyuan: next.needJiyuan,
            ratio: Math.min(1, Math.max(0, save.jiyuan / next.needJiyuan)),
        };
    });

    return {
        realmProgress,
        realmIndex,
        realmName: REALMS[realmIndex].name,
        nextName: next ? next.name : null,
        nodes,
        sub: {
            trailChapter: chapterOf(save.trail.curLayer),
            trailLayer: layerInChapter(save.trail.curLayer),
            towerBest: save.tower.best,
            towerSwordLevel: save.tower.swordLevel,
            lingenCount: save.unlocked.length,
            lingenTotal: LINGENS.length,
            achievementCount: save.achievements.reached.length,
            achievementTotal: ACHIEVEMENTS.length,
        },
    };
}
