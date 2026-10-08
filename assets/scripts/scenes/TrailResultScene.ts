/**
 * M15 妖径结算页（#47）：首通（推进 + 章节大礼）/ 有产出重刷 / 护栏内零收益
 * 三态呈现；胜利可看广告翻倍（doubleReward 复用）；失败可重试。
 * 「返回妖径」= popToRoot 后重压妖径地图（战斗页已结束，留在栈里无意义）。
 */
import { Label, Layers, Node } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { AudioMgr } from '../infra/AudioMgr';
import { Ads } from '../infra/Ads';
import { RewardItem } from '../core/systems/BoxSystem';
import { TEXTS } from '../core/config/texts';
import { THEME, ButtonHandle, fadeIn, label, pageBackground, spriteButton, spritePanel } from '../ui/ThemeLib';
import { TrailScene } from './TrailScene';
import { TrailBattleScene } from './TrailBattleScene';

export interface TrailResultParams {
    layer: number;
    win: boolean;
    /** 胜利时的结算（TrailSystem.settleWin 返回） */
    winResult?: TrailResultWin;
    monsterName: string;
    isBoss: boolean;
    /** 本章破绽 QTE 全中（战意，仅重刷生效，展示用） */
    morale: boolean;
}

/** 结构上等同 TrailWinResult（避免场景间循环依赖） */
export interface TrailResultWin {
    kind: 'first' | 'repeat' | 'gated';
    items: RewardItem[];
    chapterGiftItems: RewardItem[];
}

const LINE_STEP = 46;

export class TrailResultScene implements IScene {
    node: Node;
    private p: TrailResultParams;
    private doubleLabel: Label | null = null;
    private doubleBtn: ButtonHandle | null = null;
    private doubled = false;

    constructor(params: TrailResultParams) {
        this.node = new Node('TrailResultScene');
        this.node.layer = Layers.Enum.UI_2D;
        this.p = params;
    }

    onEnter() {
        const n = this.node;
        pageBackground(n, 'art/ui/bg_result/spriteFrame');
        const win = this.p.win;

        const title = label(n, win ? TEXTS.trailResultWin : TEXTS.trailResultLose, 34, {
            bold: true,
            color: win ? THEME.goldLight : THEME.cinnabar,
        });
        title.setPosition(0, 512, 0);
        fadeIn(title, 14);

        const lin = ((this.p.layer - 1) % 10) + 1;
        label(n, `${TEXTS.trailLayerNum(lin)} · ${this.p.monsterName}${this.p.isBoss ? ` · ${TEXTS.trailBossTag}` : ''}`, 24, {
            color: THEME.paper, width: 560, shrink: true,
        }).setPosition(0, 462, 0);

        // 结算明细：行数动态（Boss 首通可达 9 行），面板高度随之伸缩
        let lines: string[];
        if (win && this.p.winResult) {
            const r = this.p.winResult;
            const kindName = r.kind === 'first' ? TEXTS.trailKindFirst : r.kind === 'repeat' ? TEXTS.trailKindRepeat : TEXTS.trailKindGated;
            const itemLines = r.items.length ? r.items.map((x) => x.label) : ['零收益 · 明日再来'];
            lines = [kindName, ...itemLines];
            if (r.chapterGiftItems.length) lines.push(TEXTS.trailChapterGift, ...r.chapterGiftItems.map((x) => x.label));
            if (this.p.morale && r.kind === 'repeat') lines.push('战意高昂（破绽全中）· 灵石 ×1.15');
        } else {
            lines = ['妖影太过强横，修士力竭而退。', '提升攻防或再接再厉，本层随时可再战。'];
        }
        const detailH = lines.length * LINE_STEP + 66;
        const detailTop = 430;
        const detail = spritePanel(n, 628, detailH);
        detail.setPosition(0, detailTop - detailH / 2, 0);
        fadeIn(detail, 16, 0.05);
        const lineTopLocal = (lines.length * LINE_STEP) / 2 - 18;
        lines.forEach((t, i) => {
            const isKind = i === 0 && win;
            label(detail, t, isKind ? 26 : 24, {
                bold: isKind,
                color: isKind ? THEME.goldLight : THEME.paper,
                width: 540,
                shrink: true,
            }).setPosition(0, lineTopLocal - i * LINE_STEP, 0);
        });
        const detailBottom = detailTop - detailH;

        // 翻倍面板（胜利且可翻倍项存在且今日 doubleReward 未用尽，#46 复用）
        const hasDoubleable = win && !!this.p.winResult?.items.some((x) => x.kind === 'lingshi' || x.kind === 'material');
        let doubleBottom = detailBottom;
        if (win && hasDoubleable && Game.save.daily.doubleRewardUsed < 3) {
            const dh = 160;
            const dc = detailBottom - 24 - dh / 2;
            const doublePanel = spritePanel(n, 628, dh, undefined, THEME.tintPanel);
            doublePanel.setPosition(0, dc, 0);
            fadeIn(doublePanel, 12, 0.08);
            this.doubleBtn = spriteButton(doublePanel, 320, 70, TEXTS.trialDoubleBtn, () => this.double(), {
                fontSize: 24,
                variant: 'secondary',
                textColor: THEME.goldLight,
            });
            this.doubleBtn.node.setPosition(0, 24, 0);
            this.doubleLabel = label(doublePanel, '', 21, { color: THEME.inkSoft, width: 540, shrink: true }).getComponent(Label);
            this.doubleLabel!.node.setPosition(0, -34, 0);
            doubleBottom = dc - dh / 2;
        }

        // 按钮区：主按钮（首通 → 进军下一层；重刷/护栏/失败 → 再战此层）+ 返回妖径
        const btnY = Math.max(-560, doubleBottom - 24 - 44);
        const isRepeatLike = win && this.p.winResult?.kind !== 'first';
        const primaryText = !win || isRepeatLike ? TEXTS.trailRetry : TEXTS.trailNextLayer;
        const nextLayer = this.p.layer + 1;
        const primary = spriteButton(n, 300, 88, primaryText, () => {
            Game.stack.swap(new TrailBattleScene(!win || isRepeatLike ? this.p.layer : nextLayer));
        }, {
            fontSize: 26,
            variant: 'primary',
            textColor: THEME.void,
        });
        primary.node.setPosition(-162, btnY, 0);
        const back = spriteButton(n, 300, 88, TEXTS.trailBackTrail, () => {
            Game.stack.popToRoot();
            Game.stack.push(new TrailScene());
        }, {
            fontSize: 26,
            variant: 'secondary',
            textColor: THEME.paper,
        });
        back.node.setPosition(162, btnY, 0);

        if (win) AudioMgr.play('rare');
    }

    /** 结算奖励翻倍（doubleReward 位）：灵石与灵材再补一份，每日 3 次 */
    private double() {
        if (this.doubled || !this.p.winResult) return;
        Ads.show('doubleReward', this.node, {
            onSuccess: () => {
                if (this.doubled || !this.p.winResult) return;
                this.doubled = true;
                const extra = Game.trail.applyDouble(Game.save, this.p.winResult.items);
                Game.save.daily.doubleRewardUsed += 1;
                Game.persist();
                if (this.doubleLabel && extra.length) {
                    this.doubleLabel.string = `已翻倍：${extra.map((x) => x.label).join('　')}`;
                }
                this.doubleBtn?.setEnabled(false);
                this.doubleBtn?.setText(TEXTS.trialDoubled);
            },
        });
    }
}
