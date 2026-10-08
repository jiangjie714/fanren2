/**
 * M22 剑冢首页（#48）：剑气/淬剑经济面板 + 三档淬剑 + 入冢入口。
 *
 * 数据完全由 core 派生（formatCompact 统一呈现，UI 不出现裸数）；
 * 层刻度尺用 Graphics 绘制，零美术 —— 剑冢的「无限感」由数字与刻度承担。
 */
import { Graphics, Label, Layers, Node } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { TEXTS } from '../core/config/texts';
import { formatCompact } from '../core/bignum';
import { MAINLINE, REVIVE_MAX, SWORD_GROWTH, req, startFloor } from '../core/config/tower';
import { statusBar, StatusBarHandle } from '../ui/StatusBar';
import {
    ButtonHandle,
    THEME,
    faded,
    fadeIn,
    label,
    pageBackground,
    pageHeader,
    spriteButton,
    spritePanel,
    toast,
    uinode,
} from '../ui/ThemeLib';
import { TowerBattleScene } from './TowerBattleScene';

/** 距通过某层还需几级淬剑（0 = 已可破） */
export function levelsToFloor(atk: number, floor: number): number {
    const need = req(floor);
    if (atk >= need) return 0;
    return Math.ceil(Math.log(need / atk) / Math.log(SWORD_GROWTH));
}

export class TowerScene implements IScene {
    node: Node;
    private bar: StatusBarHandle = { node: null as unknown as Node, refresh: () => {} };
    private atkLabel: Label | null = null;
    private levelLabel: Label | null = null;
    private crystalLabel: Label | null = null;
    private costLabel: Label | null = null;
    private nextLabel: Label | null = null;
    private dailyLabel: Label | null = null;
    private scaleLabel: Label | null = null;
    private scale!: Node;
    private enterBtn: ButtonHandle | null = null;
    private forgeBtns: ButtonHandle[] = [];

    constructor() {
        this.node = new Node('TowerScene');
        this.node.layer = Layers.Enum.UI_2D;
    }

    onEnter() {
        const n = this.node;
        pageBackground(n, 'art/ui/bg_tower/spriteFrame');
        pageHeader(n, TEXTS.towerPageTitle, () => Game.stack.pop());
        this.bar = statusBar(n, 436);

        // 主数据卡：剑气（大字）+ 淬剑等级 + 煞晶 + 成本 + 距下一层
        const card = spritePanel(n, 628, 250, undefined, THEME.tintPanel);
        card.setPosition(0, 246, 0);
        fadeIn(card, 12);
        label(card, TEXTS.towerSwordAtk, 22, { color: THEME.inkSoft }).setPosition(-232, 92, 0);
        this.atkLabel = label(card, '10', 52, { bold: true, color: THEME.goldLight }).getComponent(Label);
        this.atkLabel!.node.setPosition(-120, 62, 0);
        this.levelLabel = label(card, '', 24, { bold: true, color: THEME.paper }).getComponent(Label);
        this.levelLabel!.node.setPosition(180, 92, 0);
        this.crystalLabel = label(card, '', 26, { bold: true, color: THEME.success }).getComponent(Label);
        this.crystalLabel!.node.setPosition(0, 8, 0);
        this.costLabel = label(card, '', 22, { color: THEME.paper }).getComponent(Label);
        this.costLabel!.node.setPosition(0, -42, 0);
        this.nextLabel = label(card, '', 24, { bold: true, color: THEME.rainGold, width: 560, shrink: true }).getComponent(Label);
        this.nextLabel!.node.setPosition(0, -92, 0);

        // 层刻度尺（Graphics 零美术）：标出最高层 / 本局起点 / 下一目标
        const scalePanel = spritePanel(n, 628, 108, undefined, THEME.tintDeep);
        scalePanel.setPosition(0, 62, 0);
        fadeIn(scalePanel, 10, 0.03);
        this.scale = uinode('scale', scalePanel, 560, 58);
        this.scaleLabel = label(scalePanel, '', 20, { color: THEME.paper }).getComponent(Label);
        this.scaleLabel!.node.setPosition(0, -38, 0);

        // 三档淬剑（增量标配：成本最低但爽感最高）
        const forgeRow: Array<[string, number | 'max']> = [
            [TEXTS.towerForge1, 1],
            [TEXTS.towerForge10, 10],
            [TEXTS.towerForgeMax, 'max'],
        ];
        forgeRow.forEach(([t, k], i) => {
            const b = spriteButton(n, 196, 84, t, () => this.forge(k), {
                fontSize: 26,
                variant: i === 2 ? 'primary' : 'secondary',
                textColor: i === 2 ? THEME.void : THEME.goldLight,
            });
            b.node.setPosition(-212 + i * 212, -84, 0);
            this.forgeBtns.push(b);
        });

        // 入冢主 CTA
        this.enterBtn = spriteButton(n, 520, 100, '', () => this.enter(), {
            fontSize: 30,
            variant: 'primary',
            textColor: THEME.void,
        });
        this.enterBtn.node.setPosition(0, -226, 0);

        // 底部：今日回灌进度（日封顶可见化，防「打了却没收益」的疑惑）
        const foot = spritePanel(n, 628, 116, undefined, THEME.tintDeep);
        foot.setPosition(0, -376, 0);
        fadeIn(foot, 10, 0.06);
        this.dailyLabel = label(foot, '', 22, { bold: true, color: THEME.goldLight, width: 580, shrink: true }).getComponent(Label);
        this.dailyLabel!.node.setPosition(0, 16, 0);
        label(foot, TEXTS.towerBlurb, 19, { color: THEME.paper, width: 580, shrink: true }).setPosition(0, -26, 0);

        this.refresh();
    }

    onResume() {
        this.refresh();
    }

    private refresh() {
        this.bar.refresh();
        const save = Game.save;
        const t = Game.tower;
        const atk = t.atk(save);
        const nextFloor = save.tower.best + 1;

        if (this.atkLabel) this.atkLabel.string = formatCompact(atk);
        if (this.levelLabel) this.levelLabel.string = TEXTS.towerLevel(save.tower.swordLevel);
        if (this.crystalLabel) this.crystalLabel.string = `${TEXTS.towerCrystal} ${formatCompact(save.tower.crystal)}`;
        if (this.costLabel) this.costLabel.string = TEXTS.towerCost(formatCompact(t.costOf(save)));
        if (this.nextLabel) this.nextLabel.string = TEXTS.towerToNextFloor(levelsToFloor(atk, nextFloor), nextFloor);
        if (this.enterBtn) this.enterBtn.setText(TEXTS.towerEnter(startFloor(save.tower.best)));
        if (this.scaleLabel) {
            this.scaleLabel.string = TEXTS.towerScaleHint(save.tower.best, startFloor(save.tower.best));
        }

        const left = t.dailyLeft(save);
        if (this.dailyLabel) {
            this.dailyLabel.string = TEXTS.towerDailyLine(
                MAINLINE.lingshiCap - left.lingshi, MAINLINE.lingshiCap,
                MAINLINE.matsCap - left.mats, MAINLINE.matsCap,
                MAINLINE.xiuweiCap - left.xiuwei, MAINLINE.xiuweiCap,
            );
        }
        this.drawScale(save.tower.best, save.tower.swordLevel, atk);

        // 三档按钮：买不起一级时置灰（×10/满 视余额）
        const affordable = t.affordableLevels(save);
        this.forgeBtns[0].setEnabled(affordable >= 1);
        this.forgeBtns[1].setEnabled(affordable >= 1);
        this.forgeBtns[2].setEnabled(affordable >= 1);
    }

    /** 层刻度尺：以最高层为中心的横向刻度，标出本局起点与下一目标 */
    private drawScale(best: number, level: number, atk: number) {
        const g = this.scale.getComponent(Graphics) ?? this.scale.addComponent(Graphics);
        g.clear();
        const w = 540;
        const h = 34;
        const from = startFloor(best);
        const target = best + 1;
        // 以 [from-2, target+2] 为可视区间映射到 -w/2..w/2
        const lo = Math.max(1, from - 2);
        const hi = target + 2;
        const span = Math.max(1, hi - lo);
        const xOf = (f: number) => -w / 2 + ((f - lo) / span) * w;

        g.strokeColor = THEME.border;
        g.lineWidth = 3;
        g.moveTo(-w / 2, 0);
        g.lineTo(w / 2, 0);
        g.stroke();

        // 每 5 层一个小刻度（跨度过大时隔层）
        const step = span > 30 ? 10 : 5;
        g.strokeColor = faded(THEME.paper, 120);
        g.lineWidth = 2;
        for (let f = Math.ceil(lo / step) * step; f <= hi; f += step) {
            const x = xOf(f);
            g.moveTo(x, -h / 2);
            g.lineTo(x, h / 2);
            g.stroke();
        }
        // 本局起点（青）+ 最高层（金）标记
        g.fillColor = THEME.jade;
        g.circle(xOf(from), 0, 7);
        g.fill();
        g.fillColor = THEME.goldLight;
        g.circle(xOf(best), 0, 9);
        g.fill();
        // 下一目标（描边空心）
        g.strokeColor = THEME.rainGold;
        g.lineWidth = 3;
        g.circle(xOf(target), 0, 9);
        g.stroke();
    }

    private forge(times: number | 'max') {
        const n = Game.tower.forge(Game.save, times);
        if (n > 0) Game.persist();
        toast(this.node, TEXTS.towerForgeDone(n), 26);
        this.refresh();
    }

    private enter() {
        // 首入铭层：run 起手层必有 5 层连胜（spec §4.3 首因效应），不设门槛
        Game.stack.push(new TowerBattleScene());
    }
}

/** 供结算页复用：剑冢回魂上限（UI 展示用） */
export const TOWER_REVIVE_MAX = REVIVE_MAX;
