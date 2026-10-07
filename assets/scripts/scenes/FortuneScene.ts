import { Label, Layers, Node } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { AudioMgr } from '../infra/AudioMgr';
import { REALMS } from '../core/config/realms';
import { TEXTS } from '../core/config/texts';
import { FORTUNES, MATERIALS } from '../core/config/alchemy';
import { statusBar, StatusBarHandle } from '../ui/StatusBar';
import {
    THEME,
    fadeIn,
    label,
    labelL,
    pageBackground,
    pageHeader,
    spriteButton,
    spritePanel,
    toast,
    uinode,
} from '../ui/ThemeLib';

/**
 * 福禄炼制页（M13 #40）：三品福禄永久攻防加值 + 灵材库存。
 * 与锻体（乘算系数）、法器（档位加值）并列的第三种成长线；每品可炼 maxCrafts 次。
 */
export class FortuneScene implements IScene {
    node: Node;
    private bar: StatusBarHandle = { node: null as unknown as Node, refresh: () => {} };
    private body: Node | null = null;

    constructor() {
        this.node = new Node('FortuneScene');
        this.node.layer = Layers.Enum.UI_2D;
    }

    onEnter() {
        const n = this.node;
        pageBackground(n, 'art/ui/bg_home/spriteFrame');
        pageHeader(n, TEXTS.fortuneTitle, () => Game.stack.pop());
        this.bar = statusBar(n, 436);
        this.render();
    }

    onResume() {
        this.render();
    }

    private render() {
        this.body?.destroy();
        this.bar.refresh();
        const n = this.node;
        this.body = uinode('body', n, 720, 1280);
        const save = Game.save;

        // ── 当前福禄总加成卡（高 116：24px 标题距上边框需 ≥10px，100 高只剩 2px 贴边）──
        const total = Game.alchemy.fortuneBonus(save);
        const statCard = spritePanel(this.body, 668, 116, undefined, THEME.tintPanel);
        statCard.setPosition(0, 272, 0);
        fadeIn(statCard, 12);
        labelL(statCard, TEXTS.playerFortune, 24, { bold: true, color: THEME.goldLight }).setPosition(-306, 28, 0);
        labelL(statCard, `${TEXTS.statAtk} +${total.atk}  ·  ${TEXTS.statDef} +${total.def}`, 24, {
            bold: true, color: THEME.paper,
        }).setPosition(-306, -8, 0);
        const stats = Game.combat.deriveStats(save);
        labelL(statCard, `${TEXTS.statPower} ${stats.power}`, 17, { color: THEME.paperDim }).setPosition(-306, -36, 0);

        // ── 三品福禄炼制（行距 108 = 行高 100 + 间隙 8，与福禄/灵材卡同节奏）──
        FORTUNES.forEach((f, i) => {
            const y = 150 - i * 108;
            const row = spritePanel(this.body!, 668, 100, undefined, THEME.tintCard);
            row.setPosition(0, y, 0);
            fadeIn(row, 10, i * 0.04);
            const unlocked = save.realmIndex >= f.unlockRealm;
            const crafted = Game.alchemy.fortuneCraftCount(save, f.grade);
            const canFail = Game.alchemy.canCraftFortune(save, f.grade);

            labelL(row, f.name, 25, { bold: true, color: unlocked ? THEME.goldLight : THEME.disabled })
                .setPosition(-306, 24, 0);
            labelL(row, unlocked
                ? `${TEXTS.fortuneAtkDef(f.atk, f.def)}  ·  已炼 ${crafted}/${f.maxCrafts}`
                : TEXTS.alchemyLocked(REALMS[f.unlockRealm].name), 18, {
                color: unlocked ? THEME.inkSoft : THEME.disabled, width: 380, shrink: true,
            }).setPosition(-306, -12, 0);

            const btn = spriteButton(row, 170, 58, '', () => this.craft(f.grade), { fontSize: 17 });
            btn.node.setPosition(238, 0, 0);
            const btnLabel = btn.labelNode.getComponent(Label)!;
            if (!unlocked) {
                btn.setEnabled(false);
                btn.setText(TEXTS.alchemyLocked(REALMS[f.unlockRealm].name));
                btnLabel.fontSize = 15;
            } else if (canFail === 'maxed') {
                btn.setEnabled(false);
                btn.setText(TEXTS.fortuneMaxed);
                btnLabel.fontSize = 15;
            } else if (canFail === 'lingshiNotEnough') {
                btn.setEnabled(false);
                btn.setText(TEXTS.alchemyNoLingshi);
                btnLabel.fontSize = 15;
            } else if (canFail === 'materialNotEnough') {
                btn.setEnabled(false);
                btn.setText(TEXTS.alchemyNoMaterial);
                btnLabel.fontSize = 13;
            } else {
                btn.setText(`${TEXTS.fortuneCraft}\n${TEXTS.alchemyCost(f.lingshiCost, f.materialCost)}`);
                btnLabel.fontSize = 14;
                btnLabel.lineHeight = 20;
            }
        });

        // ── 灵材库存提示（等高 100）──
        const matCard = spritePanel(this.body, 668, 100, undefined, THEME.tintCard);
        matCard.setPosition(0, -174, 0);
        fadeIn(matCard, 10, 0.12);
        labelL(matCard, TEXTS.materialTitle, 22, { bold: true, color: THEME.goldLight }).setPosition(-306, 26, 0);
        const matText = MATERIALS.map((m) => `${m.name} ×${Game.alchemy.materialOf(save, m.id)}`)
            .join(' · ');
        labelL(matCard, matText || TEXTS.materialNone, 18, { color: THEME.paperDim, width: 590, shrink: true })
            .setPosition(-306, -20, 0);

        label(this.body, TEXTS.fortuneHint, 18, { color: THEME.inkSoft }).setPosition(0, -510, 0);
    }

    private craft(grade: 'chu' | 'zhong' | 'gao') {
        if (!Game.alchemy.craftFortune(Game.save, grade)) {
            toast(this.node, TEXTS.alchemyNoLingshi);
            return;
        }
        AudioMgr.play('rare');
        Game.persist();
        this.render();
    }
}
