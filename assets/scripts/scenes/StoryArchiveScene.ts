/**
 * M30 仙闻录（#56）：剧情节拍的回看页。
 *
 * 三组（启程 / 境界 / 妖径）单列清单；**已听过**可随时回看（tap → StoryLayer.replay，
 * 不重复标记 seen），**未听过**显示「？？？」+ 未听闻（不剧透）。
 *
 * 与 PathScene 的分工：修仙之路是「进度总览」（只读），本页是「故事档案」（可回看）——
 * 入口挂在 PathScene 底部卡片，不占首页左右 rail（M23/M26/M29 已陆续占满）。
 *
 * 行输入用裸 Button（Transition.NONE）+ spritePanel 底：spriteButton/iconButton 会把
 * 点击区撑到 MIN_TOUCH(88)，44px 行高的清单会出现邻行 hit 重叠，故这里自持命中区。
 */
import { Button, Layers, Node, UIOpacity } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { TEXTS } from '../core/config/texts';
import { STORY_BEATS, storyHeard, type StoryBeat, type StoryGroup } from '../core/story';
import { storyBeatsByGroup } from '../core/config/story';
import { StoryLayer } from '../ui/StoryLayer';
import { statusBar } from '../ui/StatusBar';
import {
    THEME,
    faded,
    label,
    labelL,
    pageBackground,
    pageHeader,
    spritePanel,
    toast,
} from '../ui/ThemeLib';

/** 组面板排版常量（设计系） */
const ROW_H = 44;
const GROUP_TITLE_H = 48;
const GROUP_PAD_B = 12;
const ROW_W = 620;

export class StoryArchiveScene implements IScene {
    node: Node;

    constructor() {
        this.node = new Node('StoryArchiveScene');
        this.node.layer = Layers.Enum.UI_2D;
    }

    onEnter() {
        const n = this.node;
        pageBackground(n, 'art/ui/bg_home/spriteFrame');
        pageHeader(n, TEXTS.storyArchivePageTitle, () => Game.stack.pop());
        statusBar(n, 436);

        // 三组自上而下堆叠：启程(1) → 境界(5) → 妖径(9)。top 从状态栏下方 350 起，
        // 组间距 14；总高 104+14+280+14+456 = 868，底缘 -518，在安全线 -536 内。
        let top = 350;
        top = this.buildGroup(n, 'journey', TEXTS.storyGroupJourney, top) - 14;
        top = this.buildGroup(n, 'realm', TEXTS.storyGroupRealm, top) - 14;
        this.buildGroup(n, 'trail', TEXTS.storyGroupTrail, top);
    }

    onResume() {
        // 全部静态构建，无动态区块；显式 no-op 声明契约（P1-3）。
    }

    /** 建一个分组面板，返回其下边界 y（供下一组堆叠） */
    private buildGroup(parent: Node, group: StoryGroup, title: string, top: number): number {
        const beats = storyBeatsByGroup(group);
        const h = GROUP_TITLE_H + beats.length * ROW_H + GROUP_PAD_B;
        const cy = top - h / 2;
        const panel = spritePanel(parent, 660, h, undefined, THEME.tintPanel);
        panel.setPosition(0, cy, 0);
        labelL(panel, `— ${title} —`, 24, { bold: true, color: THEME.goldLight })
            .setPosition(-300, h / 2 - 26, 0);
        beats.forEach((b, i) => {
            const ry = h / 2 - GROUP_TITLE_H - ROW_H / 2 - i * ROW_H;
            this.buildRow(panel, b, ry);
        });
        return cy - h / 2;
    }

    /** 单行：底 panel + 标题 + 状态；听过可回看，未听过Toast 不剧透 */
    private buildRow(panel: Node, beat: StoryBeat, ry: number) {
        const heard = storyHeard(Game.save, beat.id);
        const row = spritePanel(panel, ROW_W, ROW_H - 6, undefined, heard ? THEME.tintCard : THEME.tintPanel);
        row.setPosition(0, ry, 0);
        if (!heard) {
            // 置灰用 UIOpacity（项目硬约束：不禁用 Button、不染色）
            row.addComponent(UIOpacity).opacity = 130;
        }
        labelL(row, heard ? beat.title : '？？？', 20, {
            bold: true,
            color: heard ? THEME.goldLight : faded(THEME.paper, 200),
            width: 400,
            shrink: true,
        }).setPosition(-290, 0, 0);
        // 右缘收进行卡右缘 310：右对齐盒 100 宽 → 锚点 260（盒 210..310）
        label(row, heard ? TEXTS.storyReread : TEXTS.storyUnheard, 18, {
            color: heard ? THEME.goldLight : THEME.cinnabar,
            align: 'right',
            width: 100,
        }).setPosition(260, 0, 0);

        const b = row.addComponent(Button);
        b.transition = Button.Transition.NONE;
        b.target = row;
        row.on(Button.EventType.CLICK, () => {
            if (heard) StoryLayer.replay(beat.id);
            else toast(this.node, TEXTS.storyUnheardToast);
        });
    }
}
