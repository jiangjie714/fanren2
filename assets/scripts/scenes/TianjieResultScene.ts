import { Graphics, Label, Layers, Node } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { AudioMgr } from '../infra/AudioMgr';
import { Share } from '../infra/Share';
import { TEXTS } from '../core/config/texts';
import { TIANJIE, Modifier } from '../core/tianjie';
import { TianjieRunResult, TianjieView } from '../core/systems/TianjieSystem';
import {
    DESIGN_W,
    THEME,
    faded,
    fadeIn,
    label,
    labelL,
    pageBackground,
    spriteButton,
    spritePanel,
    toast,
    uinode,
} from '../ui/ThemeLib';
import { RainScene } from './RainScene';
import { TianjieShareScene } from './TianjieShareScene';

export interface TianjieResultParams {
    run: TianjieRunResult;
    view: TianjieView;
}

/**
 * 每日天劫结算页（M36）：分数/评级/明细/词条 + 「再战一次」/「返回」/「晒战报」。
 *
 * 与渡劫 ResultScene 刻意分开：渡劫页承载「修为损益/护道广告/好友对比」，
 * 天劫页只承载「分数与分享」——两页混用会让「失败=伤」的情绪泄漏到公平挑战里。
 */
export class TianjieResultScene implements IScene {
    node: Node;
    private p: TianjieResultParams;

    constructor(params: TianjieResultParams) {
        this.node = new Node('TianjieResultScene');
        this.node.layer = Layers.Enum.UI_2D;
        this.p = params;
    }

    onEnter() {
        const n = this.node;
        const { run, view } = this.p;
        pageBackground(n, 'art/ui/bg_result/spriteFrame');
        AudioMgr.play(run.score >= 75 ? 'success' : run.score >= 40 ? 'gold' : 'fail');

        label(n, TEXTS.tianjieResultTitle, 38, {
            bold: true,
            color: THEME.paper,
            outline: faded(THEME.void, 225),
            outlineWidth: 3,
        }).setPosition(0, 512, 0);

        // 评级 + 分数
        label(n, `${run.rating} · ${run.score} 分`, 58, {
            bold: true,
            color: run.score >= 75 ? THEME.goldLight : run.score >= 40 ? THEME.rainBlue : THEME.paper,
            outline: faded(THEME.void, 225),
            outlineWidth: 3,
        }).setPosition(0, 436, 0);

        // 新纪录提示（金色文字行，成功时才有）
        if (run.newBest) {
            // 新纪录渲染在分数行（436）与明细面板（156 + 284/2 = 298）之间（y=384）。
            // 不用面板：58 字级的分数与面板必然叠穿（截图实测）；纯文字行不挡任何字。
            label(n, TEXTS.tianjieNewBest, 30, {
                bold: true,
                color: THEME.goldLight,
                outline: faded(THEME.void, 225),
                outlineWidth: 3,
            }).setPosition(0, 384, 0);
        } else if (run.newTodayBest) {
            label(n, TEXTS.tianjieNewToday, 24, {
                color: THEME.rainGold,
                outline: faded(THEME.void, 225),
                outlineWidth: 3,
            }).setPosition(0, 486, 0);
        }

        // 明细卡：金/清/劫/连击/倍率
        const detail = spritePanel(n, 620, 284, undefined, THEME.tintDeep);
        detail.setPosition(0, 156, 0);
        const rows: Array<[string, string]> = [
            ['金雨', `${run.result.goldCount}`],
            ['清雨', `${run.result.blueCount}`],
            ['劫雨', `${run.result.redCount}`],
            ['最大连击', `${run.result.maxCombo}`],
            ['词条倍率', `×${view.scoreMult.toFixed(2)}`],
        ];
        rows.forEach(([k, v], i) => {
            const y = 100 - i * 46;
            labelL(detail, k, 24, { color: THEME.inkSoft }).setPosition(-270, y, 0);
            label(detail, v, 25, { bold: true, color: THEME.paper, align: 'right', width: 200 })
                .setPosition(170, y, 0);
        });

        // 底部状态行：本周最佳 + 连续（今日最佳/历史最高已在标题与「新纪录」徽章里体现，
        // 四项挤一行会掉到 18px 以下、在 result 背景的亮金上糊掉）
        label(n, `${TEXTS.tianjieWeekBest(view.weekBest)} · ${TEXTS.tianjieStreak(view.streak)}`, 21, {
            color: THEME.paper,
            width: 620,
            shrink: true,
            outline: faded(THEME.void, 215),
            outlineWidth: 2,
        }).setPosition(0, -150, 0);

        // 按钮：再战（剩余次数>0）/ 返回 / 晒战报
        const left = run.attemptsLeft;
        const retry = spriteButton(n, 260, 92, left > 0 ? TEXTS.tianjieAgain : TEXTS.tianjieAttemptsNone, () => this.retry(), {
            fontSize: 26,
            variant: left > 0 ? 'primary' : 'secondary',
            textColor: left > 0 ? THEME.void : THEME.inkSoft,
        });
        retry.setEnabled(left > 0);

        // 词条 chips（绘制顺序在所有按钮之后 = 最上层，旧版会被稍后创建的按钮压住）：
        // y=-196 落在明细面板下缘（14）与状态行（-150）之间，不压按钮行（-330）
        this.renderModChips(n, view.mods, -212);

        spriteButton(n, 160, 92, TEXTS.tianjieBack, () => this.back(), {
            fontSize: 26,
            variant: 'secondary',
            textColor: THEME.paper,
        }).node.setPosition(214, -330, 0);

        // 晒战报：并与「返回」同排（三钮一行：再战 260 / 晒战报 220 / 返回 160，间距 12，
        // 总宽 664 ≤ 安全宽 664），彻底落进底部的暗色渐隐带，不在亮金平台上
        retry.node.setPosition(-196, -330, 0);
        spriteButton(n, 220, 92, TEXTS.tianjieShare, () => this.share(run), {
            fontSize: 26,
            variant: 'secondary',
            textColor: THEME.goldLight,
        }).node.setPosition(12, -330, 0);
    }

    /** 词条 chips 行（最多 3 条，横排居中） */
    private renderModChips(parent: Node, mods: Modifier[], y: number) {
        if (!mods.length) return;
        const w = 196;
        const pitch = w + 12;
        const startX = -((mods.length - 1) * pitch) / 2;
        mods.forEach((m, i) => {
            const chip = uinode('chip', parent, w, 56);
            chip.setPosition(startX + i * pitch, y, 0);
            const g = chip.addComponent(Graphics);
            g.fillColor = faded(m.negative ? THEME.cinnabar : THEME.slate, 190);
            g.roundRect(-w / 2, -28, w, 56, 12);
            g.fill();
            g.strokeColor = faded(m.negative ? THEME.rainRed : THEME.goldLight, 180);
            g.lineWidth = 2;
            g.roundRect(-w / 2, -28, w, 56, 12);
            g.stroke();
            label(chip, m.name, 20, {
                bold: true,
                color: m.negative ? THEME.paper : THEME.goldLight,
                width: w - 16,
                shrink: true,
            });
        });
    }

    onResume() {
        // 从下一局返回：整页重建（静态快照页）
        this.node.removeAllChildren();
        this.onEnter();
    }

    private retry() {
        if (this.p.run.attemptsLeft <= 0) return;
        AudioMgr.play('click');
        Game.stack.swap(new RainScene('tianjie'));
    }

    private back() {
        Game.stack.pop(); // 回每日天劫入口页（其 onResume 会重建次数/最佳）
    }

    /** 晒战报：进入战绩卡页（卡面可截图可导出；纯文本分享已不足以表达「同种子同词条」的炫耀点） */
    private share(run: TianjieRunResult) {
        if (!Share.available()) {
            // Web 调试端仍给一句降级提示（卡面页本身也能看，但发不出去）
            toast(this.node, TEXTS.shareUnavailable);
            return;
        }
        Game.stack.push(new TianjieShareScene({ run, view: this.p.view }));
    }
}
