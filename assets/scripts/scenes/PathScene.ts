import { Graphics, Label, Layers, Node } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { computePathOverview, PathOverview, RealmNode } from '../core/path';
import { REALMS } from '../core/config/realms';
import { TEXTS } from '../core/config/texts';
import { statusBar } from '../ui/StatusBar';
import {
    THEME,
    faded,
    fadeIn,
    label,
    labelL,
    pageBackground,
    pageHeader,
    spritePanel,
    uinode,
} from '../ui/ThemeLib';

/** M23 修仙之路：五线进度总览（纯只读，无交互）。数据全部来自 computePathOverview。 */
export class PathScene implements IScene {
    node: Node;
    private bar = { refresh: () => {} };

    constructor() {
        this.node = new Node('PathScene');
        this.node.layer = Layers.Enum.UI_2D;
    }

    onEnter() {
        const n = this.node;
        pageBackground(n, 'art/ui/bg_home/spriteFrame');
        pageHeader(n, TEXTS.pathPageTitle, () => Game.stack.pop());
        this.bar = statusBar(n, 436);

        const p = computePathOverview(Game.save);

        // ── 顶部摘要卡：总进度（= 境界完成度） + 当前/下一境界 ──
        const summary = spritePanel(n, 660, 116, undefined, THEME.tintPanel);
        summary.setPosition(0, 296, 0);
        fadeIn(summary, 12);
        labelL(summary, '修仙之路 · 总进度', 24, { bold: true, color: THEME.goldLight })
            .setPosition(-300, 38, 0);
        label(summary, p.nextName ? `${Math.round(p.realmProgress * 100)}%` : '大圆满', 24, {
            bold: true, color: THEME.goldLight,
        }).setPosition(300, 38, 0);

        drawBar(summary, 600, 22, 8, p.realmProgress);
        const pct = label(summary, '', 17, {
            bold: true, color: THEME.paper, outline: faded(THEME.void, 235),
        });
        pct.setPosition(0, 8, 0);
        pct.getComponent(Label)!.string = p.nextName
            ? `境界进度 ${p.realmIndex}/5`
            : '已至化神大圆满';
        label(summary, p.nextName
            ? `当前【${p.realmName}】 · 下一目标【${p.nextName}】`
            : `当前【${p.realmName}】 · 此岸即彼岸`, 19, { color: THEME.inkSoft })
            .setPosition(0, -30, 0);

        // ── 境界时间轴：6 节点，当前节点加高挂机缘进度条与副线 ──
        let yTop = 230;
        for (const node of p.nodes) {
            const isCur = node.index === p.realmIndex;
            const h = isCur ? 210 : 64;
            const card = spritePanel(n, 660, h, undefined, THEME.tintPanel);
            card.setPosition(0, yTop - h / 2, 0);
            fadeIn(card, 10, node.index * 0.03);
            if (isCur) this.renderCurrent(card, node, p);
            else this.renderEdge(card, node);
            yTop -= h + 6;
        }

        this.refresh();
    }

    onResume() {
        this.refresh();
    }

    /** 已达成 / 未来节点：单行卡片 */
    private renderEdge(card: Node, node: RealmNode) {
        if (node.state === 'done') {
            labelL(card, `✔ ${node.name}`, 24, { bold: true, color: THEME.goldLight }).setPosition(-300, 0, 0);
            label(card, '已达成', 19, { color: THEME.inkSoft }).setPosition(295, 0, 0);
        } else {
            labelL(card, `○ ${node.name}`, 24, { bold: true, color: THEME.inkSoft }).setPosition(-300, 0, 0);
            // 未来节点：到这一境界的门槛是「从前一境界突破上来」。
            // 右对齐且右缘收在 320：整串约 133px 宽，居中锚点 300 会捅出卡片右缘 330。
            label(card, `需突破【${REALMS[node.index - 1].name}】`, 19, {
                color: faded(THEME.inkSoft, 160), width: 180, align: 'right',
            }).setPosition(230, 0, 0);
        }
    }

    /** 当前境界节点：机缘进度条（化神无）+ 副线四项 */
    private renderCurrent(card: Node, node: RealmNode, p: PathOverview) {
        const atMax = !node.ratio;
        labelL(card, `● ${node.name}`, 28, { bold: true, color: THEME.goldLight }).setPosition(-300, 80, 0);
        label(card, atMax ? '大圆满' : '当前境界', 19, { color: THEME.goldLight }).setPosition(300, 80, 0);

        if (!atMax) {
            drawBar(card, 600, 22, 46, node.ratio!);
            const pct = label(card, `机缘 ${node.jiyuan}/${node.needJiyuan}`, 17, {
                bold: true, color: THEME.paper, outline: faded(THEME.void, 235),
            });
            pct.setPosition(0, 46, 0);
        } else {
            label(card, '机缘已圆满，此界无敌', 19, { color: THEME.inkSoft }).setPosition(0, 46, 0);
        }

        // 副线：全局累计进度（展示位置挂当前节点，非境界绑定，见 spec §3.4）
        const s = p.sub;
        labelL(card, `妖径 第${s.trailChapter}章 · 第${s.trailLayer}层　｜　剑冢 最高第${s.towerBest}层 · 淬剑${s.towerSwordLevel}级`, 19, {
            color: THEME.inkSoft, width: 600, shrink: true,
        }).setPosition(-300, -6, 0);

        // 副线第二行：图鉴/成就各占一半（右组右缘必须 ≤320，否则捅出卡片）
        labelL(card, '图鉴', 19, { color: THEME.inkSoft }).setPosition(-300, -44, 0);
        drawBar(card, 170, 14, -44, s.lingenCount / s.lingenTotal, -130);
        label(card, `${s.lingenCount}/${s.lingenTotal}`, 16, {
            bold: true, color: THEME.paper, outline: faded(THEME.void, 235),
        }).setPosition(-130, -44, 0);

        labelL(card, '成就', 19, { color: THEME.inkSoft }).setPosition(20, -44, 0);
        drawBar(card, 170, 14, -44, s.achievementCount / s.achievementTotal, 200);
        label(card, `${s.achievementCount}/${s.achievementTotal}`, 16, {
            bold: true, color: THEME.paper, outline: faded(THEME.void, 235),
        }).setPosition(200, -44, 0);
    }

    private refresh() {
        this.bar.refresh();
    }
}

/** 进度条（QuestScene 同款 Graphics 范式）：cx 为条中心 y，ox 为条中心 x（默认 0）。 */
function drawBar(parent: Node, w: number, h: number, cy: number, ratio: number, cx = 0) {
    const barNode = uinode('bar', parent, w, h);
    barNode.setPosition(cx, cy, 0);
    const bg = barNode.addComponent(Graphics);
    bg.fillColor = faded(THEME.void, 235);
    bg.roundRect(-w / 2, -h / 2, w, h, h / 2);
    bg.fill();
    const fill = uinode('fill', barNode, w, h);
    const fg = fill.addComponent(Graphics);
    fg.fillColor = THEME.gold;
    fg.roundRect(-w / 2, -h / 2, w, h, h / 2);
    fg.fill();
    fill.setScale(Math.max(0.001, Math.min(1, ratio)), 1, 1);
    return barNode;
}
