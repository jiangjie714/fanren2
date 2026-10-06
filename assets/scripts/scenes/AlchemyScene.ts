import { Label, Layers, Node } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { AudioMgr } from '../infra/AudioMgr';
import { REALMS } from '../core/config/realms';
import { TEXTS } from '../core/config/texts';
import { PILLS, STAT_NAMES, MATERIALS, AlchemyStat } from '../core/config/alchemy';
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
 * 炼丹淬体页（M13 #39）：四维本体资质（智力/速度/淬体/机缘）+ 三品灵丹炼制。
 * 丹药按境界解锁、可反复炼制、各自封顶；四维各自接入既有公式。
 */
export class AlchemyScene implements IScene {
    node: Node;
    private bar: StatusBarHandle = { node: null as unknown as Node, refresh: () => {} };
    private body: Node | null = null;

    constructor() {
        this.node = new Node('AlchemyScene');
        this.node.layer = Layers.Enum.UI_2D;
    }

    onEnter() {
        const n = this.node;
        pageBackground(n, 'art/ui/bg_home/spriteFrame');
        pageHeader(n, TEXTS.alchemyTitle, () => Game.stack.pop());
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

        // ── 四维本体资质卡（与丹药行等高 100，四维改 4 列横排）──
        const statCard = spritePanel(this.body, 668, 100, undefined, THEME.tintPanel);
        statCard.setPosition(0, 280, 0);
        fadeIn(statCard, 12);
        labelL(statCard, '本体资质 · 四维', 24, { bold: true, color: THEME.goldLight }).setPosition(-306, 32, 0);
        const cap = Game.alchemy.statCap(save);
        if (cap > 0) {
            label(statCard, `当前封顶 ${cap}`, 15, { color: THEME.inkSoft }).setPosition(244, 32, 0);
        }
        const rows: Array<[AlchemyStat, string]> = [
            ['wisdom', `${TEXTS.alchemyStatWisdomDesc}${(save.alchemy.wisdom * 0.1).toFixed(1)}%`],
            ['speed', `${TEXTS.alchemyStatSpeedDesc}${(save.alchemy.speed * 0.15).toFixed(1)}%`],
            ['forging', `${TEXTS.alchemyStatForgingDesc}${save.alchemy.forging * 0.5}`],
            ['fate', `${TEXTS.alchemyStatFateDesc}${(save.alchemy.fate * 0.04).toFixed(1)}%`],
        ];
        rows.forEach(([key, effect], i) => {
            const x = -216 + i * 148;
            label(statCard, `${STAT_NAMES[key]} ${save.alchemy[key]}`, 21, { bold: true, color: THEME.paper }).setPosition(x, 0, 0);
            label(statCard, effect, 14, { color: THEME.success, width: 140, shrink: true }).setPosition(x, -26, 0);
        });

        // ── 三品灵丹炼制（行距 108 = 行高 100 + 间隙 8，与资质/灵材卡同节奏）──
        PILLS.forEach((p, i) => {
            const y = 150 - i * 108;
            const row = spritePanel(this.body!, 668, 100, undefined, THEME.tintCard);
            row.setPosition(0, y, 0);
            fadeIn(row, 10, i * 0.04);
            const unlocked = save.realmIndex >= p.unlockRealm;
            const canFail = Game.alchemy.canCraft(save, p.grade);

            labelL(row, p.name, 25, { bold: true, color: unlocked ? THEME.goldLight : THEME.disabled })
                .setPosition(-306, 26, 0);
            labelL(row, unlocked ? p.desc : TEXTS.alchemyLocked(REALMS[p.unlockRealm].name), 17, {
                color: unlocked ? THEME.inkSoft : THEME.disabled, width: 380, shrink: true,
            }).setPosition(-306, -10, 0);

            const btn = spriteButton(row, 190, 60, '', () => this.craft(p.grade), { fontSize: 18 });
            btn.node.setPosition(224, 0, 0);
            const btnLabel = btn.labelNode.getComponent(Label)!;
            if (!unlocked) {
                btn.setEnabled(false);
                btn.setText(TEXTS.alchemyLocked(REALMS[p.unlockRealm].name));
                btnLabel.fontSize = 15;
            } else if (canFail === 'capped') {
                btn.setEnabled(false);
                btn.setText(TEXTS.alchemyCrafted);
                btnLabel.fontSize = 18;
            } else if (canFail === 'lingshiNotEnough') {
                btn.setEnabled(false);
                btn.setText(TEXTS.alchemyNoLingshi);
                btnLabel.fontSize = 15;
            } else if (canFail === 'materialNotEnough') {
                btn.setEnabled(false);
                btn.setText(TEXTS.alchemyNoMaterial);
                btnLabel.fontSize = 14;
            } else {
                btn.setText(`${TEXTS.alchemyCraft}\n${TEXTS.alchemyCost(p.lingshiCost, p.materialCost)}`);
                btnLabel.fontSize = 15;
                btnLabel.lineHeight = 22;
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

        label(this.body, TEXTS.alchemyHint, 18, { color: THEME.inkSoft }).setPosition(0, -510, 0);
    }

    private craft(grade: 'chu' | 'zhong' | 'gao') {
        if (!Game.alchemy.craft(Game.save, grade)) {
            toast(this.node, TEXTS.alchemyNoLingshi);
            return;
        }
        AudioMgr.play('rare');
        Game.persist();
        this.render();
    }
}
