import { Color, Graphics, Label, Layers, Node } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { Ads } from '../infra/Ads';
import { AudioMgr } from '../infra/AudioMgr';
import { ACTIVITY_CHESTS, ACTIVITY_MAX, QUESTS, QuestConfig } from '../core/config/quests';
import { ILLUSION } from '../core/config/illusion';
import { TEXTS } from '../core/config/texts';
import { statusBar } from '../ui/StatusBar';
import { showDialog } from '../ui/dialog';
import {
    ButtonHandle,
    DESIGN_H,
    DESIGN_W,
    THEME,
    faded,
    fadeIn,
    image,
    label,
    labelL,
    pageBackground,
    pageHeader,
    spriteButton,
    spritePanel,
    toast,
    uinode,
} from '../ui/ThemeLib';
import { RainScene } from './RainScene';

interface QuestRow {
    quest: QuestConfig;
    fill: Node;
    pct: Label;
}

/** 修行页：每日任务 + 活跃度宝箱 + 心魔幻境入口（M8 C/E 节）。 */
export class QuestScene implements IScene {
    node: Node;
    private bar = { refresh: () => {} };
    private rows: QuestRow[] = [];
    private chestBtns = new Map<number, ButtonHandle>();
    private illusionBtn: ButtonHandle | null = null;
    private illusionHint!: Label;

    constructor() {
        this.node = new Node('QuestScene');
        this.node.layer = Layers.Enum.UI_2D;
    }

    onEnter() {
        const n = this.node;
        pageBackground(n, 'art/ui/bg_home/spriteFrame');
        pageHeader(n, TEXTS.questPageTitle, () => Game.stack.pop());
        this.bar = statusBar(n, 436);

        // 心魔幻境入口横幅
        const illusion = spritePanel(n, 660, 112, undefined, THEME.tintPanel);
        illusion.setPosition(0, 316, 0);
        fadeIn(illusion, 12);
        image(illusion, 'art/ui/icons/icon_illusion/spriteFrame', 56, 56).setPosition(-264, 0, 0);
        // 图标占 [-292, -236]，正文一律从 -224 起，别再让文字钻到图标底下
        labelL(illusion, TEXTS.illusionTitle, 28, { bold: true, color: THEME.goldLight })
            .setPosition(-224, 22, 0);
        this.illusionHint = labelL(illusion, '', 19, {
            color: THEME.inkSoft, width: 330, shrink: true,
        }).getComponent(Label)!;
        this.illusionHint.node.setPosition(-224, -18, 0);
        this.illusionBtn = spriteButton(illusion, 172, 72, TEXTS.illusionEnter, () => this.enterIllusion(), {
            fontSize: 23,
            variant: 'primary',
            textColor: THEME.void,
        });
        this.illusionBtn.node.setPosition(214, 0, 0);

        // 任务列表。行高 108 = 三段（名称 34 / 描述 6 / 进度条 -30）刚好匀开，
        // 旧版行高 96 塞三段导致「描述压名称、进度条横穿名称」并且首字被卡片边缘裁掉。
        const ROW_H = 108;
        const ROW_GAP = 4;
        QUESTS.forEach((q, i) => {
            const row = spritePanel(n, 660, ROW_H, undefined, THEME.tintPanel);
            row.setPosition(0, 176 - i * (ROW_H + ROW_GAP), 0);
            fadeIn(row, 14, i * 0.04);
            // 卡片半宽 330，左内边距 30 -> 文本左边缘 -300，进度条 600 宽铺满
            labelL(row, q.name, 26, { bold: true, color: THEME.goldLight }).setPosition(-300, 34, 0);
            labelL(row, q.desc, 19, { color: THEME.inkSoft, width: 600, shrink: true }).setPosition(-300, 6, 0);

            const barNode = uinode('bar', row, 600, 24);
            barNode.setPosition(0, -30, 0);
            const bg = barNode.addComponent(Graphics);
            bg.fillColor = faded(THEME.void, 235);
            bg.roundRect(-300, -12, 600, 24, 12);
            bg.fill();
            const fill = uinode('fill', barNode, 600, 24);
            const fg = fill.addComponent(Graphics);
            fg.fillColor = THEME.gold;
            fg.roundRect(-300, -12, 600, 24, 12);
            fg.fill();
            fill.setScale(0.001, 1, 1);
            // 进度条文字横跨亮金填充与暗底两侧，白字 + 深墨描边才能同时镇住
            const pct = label(barNode, '', 19, {
                bold: true, color: THEME.paper, outline: faded(THEME.void, 235),
            }).getComponent(Label)!;
            pct.node.setPosition(0, 0, 0);
            this.rows.push({ quest: q, fill, pct });
        });

        // 活跃度宝箱行
        // 高 148（旧版 128 装不下：66 高的宝箱钮在 y=-36 时下缘 -69 已经捅出卡片 -64）
        const chestRow = spritePanel(n, 660, 148, undefined, THEME.tintPanel);
        chestRow.setPosition(0, -298, 0);
        fadeIn(chestRow, 14, 0.16);
        labelL(chestRow, `${TEXTS.questPageTitle} · 活跃度`, 24, { bold: true, color: THEME.goldLight })
            .setPosition(-300, 52, 0);
        label(chestRow, `完成 4 项任务各 +25 活跃度（上限 ${ACTIVITY_MAX}）`, 19, { color: THEME.inkSoft })
            .setPosition(0, 20, 0);
        ACTIVITY_CHESTS.forEach((c, i) => {
            const btn = spriteButton(chestRow, 196, 66, '', () => this.claimChest(c.at), {
                fontSize: 21,
                variant: 'secondary',
                textColor: THEME.goldLight,
            });
            btn.node.setPosition(-216 + i * 216, -32, 0);
            const rewardText = c.lingshi ? `灵石 ${c.lingshi}`
                : c.ticket ? '修真宝盒券'
                    : `机缘 ${c.jiyuan}·碎片`;
            label(btn.node, `第${i + 1}档 · ${rewardText}`, 18, { bold: true, color: THEME.paper }).setPosition(0, 14, 0);
            btn.labelNode.setPosition(0, -13, 0); // 状态行移到下半，避免与档位说明重叠
            this.chestBtns.set(c.at, btn);
        });

        label(n, '开箱、渡劫、幻境与历练归来都会自动计入任务进度', 20, {
            color: THEME.inkSoft,
            width: 600,
            shrink: true,
        }).setPosition(0, -480, 0);

        this.refresh();
    }

    onResume() {
        this.refresh();
    }

    private refresh() {
        this.bar.refresh();
        // 任务进度
        for (const row of this.rows) {
            const cur = Math.min(row.quest.target, Game.quests.progressOf(Game.save, row.quest.id));
            const done = Game.quests.isCompleted(Game.save, row.quest.id);
            row.fill.setScale(Math.max(0.001, cur / row.quest.target), 1, 1);
            row.pct.string = done ? TEXTS.questDone : `${cur}/${row.quest.target}`;
        }
        // 活跃度宝箱
        ACTIVITY_CHESTS.forEach((c) => {
            const btn = this.chestBtns.get(c.at)!;
            if (Game.quests.isChestClaimed(Game.save, c.at)) {
                btn.setEnabled(false);
                btn.setText(TEXTS.questChestClaimed);
            } else if (Game.quests.canClaimChest(Game.save, c.at)) {
                btn.setEnabled(true);
                btn.setText(TEXTS.questChestClaim);
            } else {
                btn.setEnabled(false);
                btn.setText(TEXTS.questChestLocked(c.at));
            }
        });
        // 幻境入口
        const kind = Game.illusion.startKind(Game.save);
        this.illusionHint.string = `15 秒强化灵雨 · 无清雨 · 劫雨更疾 ｜ 今日最佳 ${Game.save.daily.illusionBest} 分`;
        if (this.illusionBtn) {
            if (kind === 'none') {
                this.illusionBtn.setEnabled(false);
                this.illusionBtn.setText(TEXTS.illusionNone);
            } else if (kind === 'ad') {
                this.illusionBtn.setEnabled(true);
                this.illusionBtn.setText(TEXTS.illusionEnterAd);
            } else {
                this.illusionBtn.setEnabled(true);
                this.illusionBtn.setText(TEXTS.illusionEnter);
            }
        }
    }

    private claimChest(at: number) {
        const items = Game.quests.claimChest(Game.save, at, Game.rng);
        if (!items.length) {
            toast(this.node, TEXTS.questChestLocked(at));
            return;
        }
        AudioMgr.play('rare');
        Game.persist();
        this.refresh();
        showDialog(this.node, {
            title: `活跃度 ${at} 宝箱`,
            lines: items.map((i) => ({ text: i.label, color: 1 as const })),
            buttons: [{ text: '收 下', primary: true }],
        });
    }

    private enterIllusion() {
        const kind = Game.illusion.startKind(Game.save);
        if (kind === 'none') {
            toast(this.node, TEXTS.illusionNone);
            return;
        }
        if (kind === 'free') {
            Game.illusion.consumeStart(Game.save, 'free');
            Game.persist();
            Game.stack.push(new RainScene('illusion'));
            return;
        }
        Ads.show('illusionExtra', this.node, {
            onSuccess: () => {
                if (!Game.illusion.consumeStart(Game.save, 'ad')) return;
                Game.persist();
                Game.stack.push(new RainScene('illusion'));
            },
        });
    }
}
