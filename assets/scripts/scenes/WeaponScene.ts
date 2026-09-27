import { Label, Layers, Node } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { AudioMgr } from '../infra/AudioMgr';
import { REALMS } from '../core/config/realms';
import { TEXTS } from '../core/config/texts';
import { WEAPONS } from '../core/config/combat';
import { statusBar } from '../ui/StatusBar';
import {
    ButtonHandle,
    THEME,
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

/** 法器阁（M11 #34）：锻体升级 + 六档法器购入，攻防自动生效（佩最高档）。 */
export class WeaponScene implements IScene {
    node: Node;
    private bar = { refresh: () => {} };
    private body: Node | null = null;

    constructor() {
        this.node = new Node('WeaponScene');
        this.node.layer = Layers.Enum.UI_2D;
    }

    onEnter() {
        const n = this.node;
        pageBackground(n, 'art/ui/bg_home/spriteFrame');
        pageHeader(n, TEXTS.weaponTitle, () => Game.stack.pop());
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
        const stats = Game.combat.deriveStats(save);

        // 属性卡：攻防战力 + 锻体升级
        const statCard = spritePanel(this.body, 668, 168, undefined, THEME.tintPanel);
        statCard.setPosition(0, 226, 0);
        fadeIn(statCard, 12);
        labelL(statCard, `${TEXTS.statAtk} ${stats.atk}`, 26, { bold: true, color: THEME.goldLight })
            .setPosition(-306, 48, 0);
        labelL(statCard, `${TEXTS.statDef} ${stats.def}`, 26, { bold: true, color: THEME.goldLight })
            .setPosition(-306, 6, 0);
        labelL(statCard, `${TEXTS.statPower} ${stats.power}`, 22, { color: THEME.paperDim })
            .setPosition(-306, -38, 0);

        const forging = save.combat.forging;
        const forgeBtn = spriteButton(statCard, 280, 84, '', () => this.upgradeForging(), {
            fontSize: 21,
            variant: 'primary',
        });
        forgeBtn.node.setPosition(178, -6, 0);
        const cost = Game.combat.forgingNextCost(save);
        if (forging >= 20) {
            forgeBtn.setText(`${TEXTS.forgingLevel(forging)}\n${TEXTS.forgingMax}`);
            forgeBtn.setEnabled(false);
        } else {
            forgeBtn.setText(`${TEXTS.forgingLevel(forging)}\n升级 ${cost} 灵石`);
            forgeBtn.setEnabled(Game.combat.canUpgradeForging(save));
        }
        const forgeLabel = forgeBtn.labelNode.getComponent(Label)!;
        forgeLabel.lineHeight = 30;

        // 六档法器（96 高行距 104：六行 + 底部提示全部落在 -536 安全线内）
        WEAPONS.forEach((w, i) => {
            const y = 70 - i * 104;
            const row = spritePanel(this.body!, 668, 96, undefined, THEME.tintCard);
            row.setPosition(0, y, 0);
            fadeIn(row, 10, i * 0.03);
            const equipped = Game.combat.equippedTier(save) === w.tier;
            const state = Game.combat.weaponBuyState(save, w.tier);

            image(row, `art/weapons/weapon_t${w.tier}/spriteFrame`, 68, 68, {
                fallbackPath: 'art/ui/icons/icon_rune/spriteFrame',
            }).setPosition(-272, 0, 0);

            labelL(row, w.name, 25, { bold: true, color: equipped ? THEME.goldLight : THEME.paper })
                .setPosition(-222, 22, 0);
            labelL(row, `${TEXTS.statAtk}+${w.atk}  ${TEXTS.statDef}+${w.def}  ｜ 需【${REALMS[w.tier].name}】境`, 18, {
                color: THEME.inkSoft, width: 390, shrink: true,
            }).setPosition(-222, -12, 0);

            const btn = spriteButton(row, 150, 56, '', () => this.buy(w.tier), { fontSize: 19 });
            btn.node.setPosition(244, 0, 0);
            const btnLabel = btn.labelNode.getComponent(Label)!;
            if (state === 'owned') {
                btn.setEnabled(false);
                btn.setText(equipped ? TEXTS.weaponEquipped : TEXTS.weaponOwned);
                btnLabel.fontSize = 18;
            } else if (state === 'locked') {
                btn.setEnabled(false);
                btn.setText(TEXTS.weaponLocked(REALMS[w.tier].name));
                btnLabel.fontSize = 16;
            } else if (state === 'poor') {
                btn.setEnabled(false);
                btn.setText(`${w.cost} 灵石`);
                btnLabel.fontSize = 18;
            } else {
                // 双行购入钮：spriteButton 的 label lineHeight 被钉在按钮高上，
                // 两行文本必须显式压回，否则换行后上下溢出按钮（首版实测翻车）
                btn.setText(`${TEXTS.weaponBuy}\n${w.cost} 灵石`);
                btnLabel.fontSize = 18;
                btnLabel.lineHeight = 24;
            }
        });
        label(this.body, '购入法器后永久生效，自动佩用最高档', 20, { color: THEME.inkSoft })
            .setPosition(0, -520, 0);
    }

    private upgradeForging() {
        if (!Game.combat.upgradeForging(Game.save)) {
            toast(this.node, TEXTS.weaponCostShort);
            return;
        }
        AudioMgr.play('rare');
        Game.persist();
        this.render();
    }

    private buy(tier: number) {
        if (!Game.combat.buyWeapon(Game.save, tier)) {
            toast(this.node, TEXTS.weaponCostShort);
            return;
        }
        AudioMgr.play('rare');
        Game.persist();
        toast(this.node, `【${WEAPONS.find((w) => w.tier === tier)!.name}】已佩用`);
        this.render();
    }
}
