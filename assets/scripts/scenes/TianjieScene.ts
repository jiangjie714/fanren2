import { Graphics, Label, Layers, Node } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { AudioMgr } from '../infra/AudioMgr';
import { TEXTS } from '../core/config/texts';
import { TIANJIE, Modifier, dailySeed } from '../core/tianjie';
import { TianjieView } from '../core/systems/TianjieSystem';
import {
    ButtonHandle,
    DESIGN_H,
    DESIGN_W,
    THEME,
    faded,
    fadeIn,
    label,
    labelL,
    pageBackground,
    pageHeader,
    spriteButton,
    spritePanel,
    uinode,
} from '../ui/ThemeLib';
import { RainScene } from './RainScene';

/**
 * 每日天劫入口页（M36）：今日种子/连续天数/历史最高/今日词条/剩余次数 + 「迎劫」。
 *
 * 设计约束：
 * - **不放广告**：天劫是零广告的公平挑战（spec §「不做」），这里任何广告位都会破坏
 *   「同种子比手」的语义；
 * - **词条面板必须全可见**：3 条词条 + 计分倍率一眼看完，玩家才知道今天值不值得打；
 * - 次数用尽时主按钮置灰并给出「明日再来」，不提供「看广告加次」——次数是挑战的代价。
 */
export class TianjieScene implements IScene {
    node: Node;
    private startBtn: ButtonHandle | null = null;
    private view: TianjieView;

    constructor() {
        this.node = new Node('TianjieScene');
        this.node.layer = Layers.Enum.UI_2D;
        this.view = Game.tianjie.view(Game.save);
    }

    onEnter() {
        const n = this.node;
        pageBackground(n, 'art/ui/bg_rain/spriteFrame');
        pageHeader(n, TEXTS.tianjiePageTitle, () => Game.stack.pop());

        const v = this.view;
        // ── 标题区：标题 + 副行（全服同种子） ──
        label(n, TEXTS.tianjieTitle, 44, {
            bold: true,
            color: THEME.goldLight,
            outline: faded(THEME.void, 220),
            outlineWidth: 3,
        }).setPosition(0, DESIGN_H / 2 - 300, 0);
        label(n, TEXTS.tianjieSubtitle, 21, {
            color: THEME.paper,
            width: 620,
            shrink: true,
            outline: faded(THEME.void, 210),
            outlineWidth: 2,
        }).setPosition(0, DESIGN_H / 2 - 348, 0);

        // ── 状态卡：今日种子 / 剩余次数 / 今日最佳 / 历史最高 / 连续 ──
        const stat = spritePanel(n, 660, 190, undefined, THEME.tintPanel);
        stat.setPosition(0, DESIGN_H / 2 - 470, 0);
        fadeIn(stat, 14);
        labelL(stat, TEXTS.tianjieSeed(dailySeed(v.day)), 20, { color: THEME.inkSoft }).setPosition(-300, 56, 0);
        label(stat, TEXTS.tianjieAttempts(v.attemptsLeft, TIANJIE.attemptsPerDay), 26, {
            bold: true,
            color: v.attemptsLeft > 0 ? THEME.goldLight : THEME.rainRed,
        }).setPosition(110, 56, 0);
        labelL(stat, TEXTS.tianjieTodayBest(v.todayBest), 23, { bold: true, color: THEME.paper }).setPosition(-300, 6, 0);
        labelL(stat, TEXTS.tianjieBest(v.best), 23, { color: THEME.inkSoft }).setPosition(20, 6, 0);
        const streakText = v.streak > 0 ? TEXTS.tianjieStreak(v.streak) : TEXTS.tianjieStreakZero;
        labelL(stat, streakText, 21, { color: v.streak > 0 ? THEME.rainGold : THEME.inkSoft }).setPosition(-300, -40, 0);
        labelL(stat, TEXTS.tianjieNoAd, 18, { color: THEME.inkSoft }).setPosition(-300, -78, 0);

        // ── 词条面板：3 条词条 + 合计倍率 ──
        const modPanel = spritePanel(n, 660, 330, undefined, THEME.tintDeep);
        modPanel.setPosition(0, DESIGN_H / 2 - 760, 0);
        fadeIn(modPanel, 14, 0.05);
        label(modPanel, '今日词条', 28, { bold: true, color: THEME.goldLight }).setPosition(0, 120, 0);
        label(modPanel, TEXTS.tianjieScoreMult(v.scoreMult), 22, { bold: true, color: THEME.rainGold })
            .setPosition(0, 80, 0);
        v.mods.forEach((m, i) => this.renderModifier(modPanel, m, i));

        // ── 主按钮：迎劫 / 次数用尽 ──
        const can = v.attemptsLeft > 0;
        this.startBtn = spriteButton(n, 520, 100, can ? TEXTS.tianjieStart : TEXTS.tianjieAttemptsNone, () => this.start(), {
            fontSize: 34,
            variant: can ? 'primary' : 'secondary',
            textColor: can ? THEME.void : THEME.inkSoft,
        });
        this.startBtn.node.setPosition(0, -DESIGN_H / 2 + 200, 0);
        this.startBtn.setEnabled(can);

        // 昨日战报行（今日还没打时最有说服力：「上次 39 分，今天能不能超过」）
        if (v.attemptsUsed === 0) {
            const last = Game.tianjie.lastReport();
            if (last && last.day !== v.day) {
                label(n, `上局（${last.day}）${last.rating} · ${last.score} 分`, 20, {
                    color: THEME.rainGold,
                    width: 600,
                    shrink: true,
                    outline: faded(THEME.void, 210),
                    outlineWidth: 2,
                }).setPosition(0, -DESIGN_H / 2 + 160, 0);
            }
        }

        // 说明行：压在云海亮部，需描边
        label(n, '每日重置 3 次 · 同一场雨 · 不计养成加成', 18, {
            color: THEME.inkSoft,
            width: 600,
            shrink: true,
            outline: faded(THEME.void, 215),
            outlineWidth: 2,
        }).setPosition(0, -DESIGN_H / 2 + 120, 0);
    }

    /** 单条词条行：名称（福利金/负面朱）+ 描述两行，一条 74 高，三条正好 222 */
    private renderModifier(parent: Node, m: Modifier, index: number) {
        const row = uinode('mod', parent, 600, 64);
        row.setPosition(0, 22 - index * 74, 0);
        // 左缘红色小签：福利=玉色，负面=朱色；颜色之外还有「＋/－」语义提示，不只靠色
        const tag = uinode('tag', row, 8, 44);
        tag.setPosition(-290, 6, 0);
        const g = tag.addComponent(Graphics);
        g.fillColor = m.negative ? THEME.cinnabar : THEME.jade;
        g.roundRect(-3, -22, 6, 44, 3);
        g.fill();
        labelL(row, m.name, 24, { bold: true, color: m.negative ? THEME.rainRed : THEME.goldLight })
            .setPosition(-268, 14, 0);
        labelL(row, m.desc, 19, { color: THEME.paper, width: 560, shrink: true }).setPosition(-268, -18, 0);
    }

    onResume() {
        // 从结果页返回：次数/最佳可能已变，整页重建（静态快照页，重建零风险）
        this.node.removeAllChildren();
        this.view = Game.tianjie.view(Game.save);
        this.onEnter();
    }

    private start() {
        if (this.view.attemptsLeft <= 0) return;
        AudioMgr.play('click');
        // 传入前先拿 start 的 system：RainScene 的 onEnter 会真正消耗次数并建会话，
        // 这里只做入口校验；真正的 system 由 RainScene 内部生成后挂到场景上。
        const probe = Game.tianjie.canPlay(Game.save);
        if (!probe) return;
        Game.stack.push(new RainScene('tianjie'));
    }
}
