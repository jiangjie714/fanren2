/**
 * M22 剑冢结算页（#48）：局数据流水的单页呈现。
 * 失败收兵与主动收兵都落到这里（主动退出零惩罚是刻意设计）。
 */
import { Label, Layers, Node } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { AudioMgr } from '../infra/AudioMgr';
import { TEXTS } from '../core/config/texts';
import { formatCompact } from '../core/bignum';
import { THEME, fadeIn, label, pageBackground, spriteButton, spritePanel } from '../ui/ThemeLib';
import { TowerBattleScene } from './TowerBattleScene';

/** 一局的结算数据（TowerSystem.settle 的输出 + 局内读数） */
export interface TowerRunResult {
    deepest: number;
    best: number;
    newBest: boolean;
    crystalEarned: number;
    levelFrom: number;
    levelTo: number;
    lingshi: number;
    mats: number;
    xiuwei: number;
    capped: boolean;
    revives: number;
}

const LINE_STEP = 44;

export class TowerResultScene implements IScene {
    node: Node;
    private p: TowerRunResult;

    constructor(params: TowerRunResult) {
        this.node = new Node('TowerResultScene');
        this.node.layer = Layers.Enum.UI_2D;
        this.p = params;
    }

    onEnter() {
        const n = this.node;
        const p = this.p;
        pageBackground(n, 'art/ui/bg_result/spriteFrame');

        const title = label(n, TEXTS.towerResultWin, 34, { bold: true, color: THEME.goldLight });
        title.setPosition(0, 512, 0);
        fadeIn(title, 14);
        label(n, TEXTS.towerResultDeepest(p.deepest, p.best), 24, {
            color: THEME.paper,
            width: 560,
            shrink: true,
        }).setPosition(0, 462, 0);
        if (p.newBest) {
            label(n, TEXTS.towerResultNewBest, 26, {
                bold: true,
                color: THEME.rainGold,
                outline: THEME.cinnabarDeep,
                outlineWidth: 3,
            }).setPosition(0, 418, 0);
        }

        // 明细：煞晶 / 淬剑等级变化 / 主线回灌三行
        const lines: string[] = [
            TEXTS.towerResultCrystal(formatCompact(p.crystalEarned)),
            TEXTS.towerResultLevel(p.levelFrom, p.levelTo),
            `${TEXTS.towerResultMainline} · 灵石 +${p.lingshi} · 灵草 +${p.mats} · 修为 +${p.xiuwei}`,
        ];
        if (p.capped) lines.push(TEXTS.towerResultCapped);
        if (p.revives > 0) lines.push(TEXTS.towerResultRevives(p.revives));

        const detailH = lines.length * LINE_STEP + 60;
        const detailTop = 380;
        const detail = spritePanel(n, 628, detailH);
        detail.setPosition(0, detailTop - detailH / 2, 0);
        fadeIn(detail, 16, 0.05);
        const lineTopLocal = (lines.length * LINE_STEP) / 2 - 18;
        lines.forEach((t, i) => {
            label(detail, t, i === 0 ? 26 : 23, {
                bold: i <= 1,
                color: i === 0 ? THEME.goldLight : THEME.paper,
                width: 540,
                shrink: true,
            }).setPosition(0, lineTopLocal - i * LINE_STEP, 0);
        });

        const btnY = Math.max(-500, detailTop - detailH - 90);
        const again = spriteButton(n, 300, 88, TEXTS.towerResultAgain, () => {
            Game.stack.swap(new TowerBattleScene());
        }, { fontSize: 26, variant: 'primary', textColor: THEME.void });
        again.node.setPosition(-162, btnY, 0);
        const home = spriteButton(n, 300, 88, TEXTS.towerResultHome, () => {
            Game.stack.popToRoot(); // 栈底即主页
        }, { fontSize: 26, variant: 'secondary', textColor: THEME.paper });
        home.node.setPosition(162, btnY, 0);

        AudioMgr.play('rare');
    }
}
