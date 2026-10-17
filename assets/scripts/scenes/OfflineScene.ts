import { Layers, Node } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { OFFLINE_DAY_CAP, OFFLINE_RATES, rateOf } from '../core/offline';
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
} from '../ui/ThemeLib';

/**
 * M29 离线吐纳（#55）说明页 —— **只读**：吐纳收益在回到前台的那一刻就已经自动
 * 入账（`Game.settleOffline`），本页负责把「规则 / 今日进度 / 六境界速率」摊开，
 * 让玩家查得到为什么睡一觉只给了这么点（避免黑盒）。
 *
 * 布局（statusBar 底缘 374 → 内容自 364 起；安全区下限 -585）：
 *   摘要卡 y=306(660×116) → 速率卡 y=190(660×104) → 速率表 y=-40(660×320) → 规则 y=-260
 * 相邻组件最小间隙 6px（摘要卡↔速率卡），其余 ≥18px。
 */
export class OfflineScene implements IScene {
    node: Node;
    private bar = { refresh: () => {} };

    constructor() {
        this.node = new Node('OfflineScene');
        this.node.layer = Layers.Enum.UI_2D;
    }

    onEnter() {
        this.build();
    }

    /** 回前台/从别页返回：重建，保证今日进度与当前境界速率最新 */
    onResume() {
        this.build();
    }

    private build() {
        this.node.removeAllChildren();
        const n = this.node;
        pageBackground(n, 'art/ui/bg_home/spriteFrame');
        pageHeader(n, TEXTS.offlinePageTitle, () => Game.stack.pop());
        this.bar = statusBar(n, 436);

        const v = Game.offline.view(Game.save);
        this.renderSummary(n, v.dayMin);
        this.renderRateCard(n);
        this.renderTable(n);
        this.renderRules(n);
    }

    // ── 摘要卡：今日已吐纳分钟 / 日上限 + 余额提示 ──
    private renderSummary(n: Node, dayMin: number) {
        const card = spritePanel(n, 660, 116, undefined, THEME.tintPanel);
        card.setPosition(0, 306, 0);
        fadeIn(card, 12);

        labelL(card, TEXTS.offlinePageTitle, 26, { bold: true, color: THEME.goldLight })
            .setPosition(-300, 34, 0);
        label(card, TEXTS.offlineToday(dayMin, OFFLINE_DAY_CAP), 20, {
            bold: true, color: THEME.goldLight,
        }).setPosition(228, 34, 0);
        labelL(card, TEXTS.offlineLeftHint(Math.max(0, OFFLINE_DAY_CAP - dayMin)), 18, {
            color: THEME.inkSoft, width: 600, shrink: true,
        }).setPosition(-300, -20, 0);
    }

    // ── 当前境界速率卡 ──
    private renderRateCard(n: Node) {
        const card = spritePanel(n, 660, 104, undefined, THEME.tintPanel);
        card.setPosition(0, 190, 0);
        fadeIn(card, 12, 0.03);

        const realm = REALMS[Game.save.realmIndex];
        const rate = rateOf(Game.save.realmIndex);
        labelL(card, TEXTS.offlineRateTitle, 22, { bold: true, color: THEME.goldLight })
            .setPosition(-300, 18, 0);
        label(card, `【${realm.name}】`, 20, { bold: true, color: THEME.goldLight })
            .setPosition(228, 18, 0);
        // 副行：当前速率（Card 内 600 宽单列，不做左右分栏 —— 曾被 CheckinScene
        // 撞过车的正是「主标右缘 -40 撞副行左缘」的分栏写法）
        labelL(card, TEXTS.offlineRateLine(rate.xiuwei, rate.lingshi), 18, {
            color: THEME.inkSoft, width: 600, shrink: true,
        }).setPosition(-300, -18, 0);
    }

    // ── 六境界速率表（表头 + 6 行） ──
    private renderTable(n: Node) {
        const panel = spritePanel(n, 660, 320, undefined, THEME.tintPanel);
        panel.setPosition(0, -40, 0);
        fadeIn(panel, 12, 0.06);

        labelL(panel, TEXTS.offlineTableTitle, 22, { bold: true, color: THEME.goldLight })
            .setPosition(-300, 118, 0);
        labelL(panel, TEXTS.offlineTableHead, 17, { color: faded(THEME.inkSoft, 190) })
            .setPosition(-300, 78, 0);

        const index = Game.save.realmIndex;
        for (let i = 0; i < OFFLINE_RATES.length; i++) {
            const y = 40 - i * 36;
            const current = i === index;
            const color = current ? THEME.gold : THEME.paper;
            labelL(panel, TEXTS.offlineTableRow(REALMS[i].name, OFFLINE_RATES[i].xiuwei, OFFLINE_RATES[i].lingshi), 18, {
                bold: current, color, width: 600, shrink: true,
            }).setPosition(-300, y, 0);
        }
    }

    // ── 规则说明：把两条上限与产出范围写清楚，避免「为什么睡一觉给这么少」的黑盒感 ──
    private renderRules(n: Node) {
        labelL(n, TEXTS.offlineRules, 17, {
            color: faded(THEME.inkSoft, 200), width: 600, shrink: true,
        }).setPosition(-300, -260, 0);
    }
}
