import { Layers, Node } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { WEAPONS } from '../core/config/combat';
import { REALMS } from '../core/config/realms';
import { TEXTS } from '../core/config/texts';
import { statusBar, StatusBarHandle } from '../ui/StatusBar';
import {
    THEME,
    fadeIn,
    image,
    label,
    labelL,
    pageBackground,
    pageHeader,
    spriteButton,
    spritePanel,
    uinode,
} from '../ui/ThemeLib';
import { WeaponScene } from './WeaponScene';

/**
 * 个人属性页（M11b 细化）：道体档案 + 攻防战力 + 当前法器 + 福禄一览。
 * 入口：主页点按角色立绘。纯展示页，数值变化走各自的系统页（法器阁/论道）。
 */
export class PlayerScene implements IScene {
    node: Node;
    private bar: StatusBarHandle = { node: null as unknown as Node, refresh: () => {} };
    private body: Node | null = null;

    constructor() {
        this.node = new Node('PlayerScene');
        this.node.layer = Layers.Enum.UI_2D;
    }

    onEnter() {
        const n = this.node;
        pageBackground(n, 'art/ui/bg_home/spriteFrame');
        pageHeader(n, TEXTS.playerPageTitle, () => Game.stack.pop());
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
        const profile = save.profile;
        const stats = Game.combat.deriveStats(save);

        // ── 档案卡：立绘 + 道号 + 性别·境界 + 修为 ──
        const profileCard = spritePanel(this.body, 668, 190, undefined, THEME.tintPanel);
        profileCard.setPosition(0, 240, 0);
        fadeIn(profileCard, 12);
        const gender = profile.gender;
        image(profileCard,
            gender === 'f' ? 'art/characters/char_realm_00_f/spriteFrame' : 'art/characters/char_realm_00/spriteFrame',
            150, 150, { fallbackPath: 'art/characters/char_realm_00/spriteFrame' })
            .setPosition(-244, 0, 0);
        labelL(profileCard, profile.name || '无名修士', 34, { bold: true, color: THEME.goldLight })
            .setPosition(-140, 52, 0);
        labelL(profileCard, `${gender === 'f' ? '女修' : '男修'} · ${REALMS[save.realmIndex].name}境`, 23, {
            bold: true, color: THEME.paper,
        }).setPosition(-140, 10, 0);
        labelL(profileCard, `修为 ${save.xiuwei} · 小等级 ${Game.eco.smallLevel()} 重`, 20, { color: THEME.inkSoft })
            .setPosition(-140, -28, 0);
        labelL(profileCard, `论武 ${save.pk.wins} 胜 ${save.pk.losses} 负 · 最高连胜 ${save.pk.bestStreak}`, 20, {
            color: THEME.inkSoft, width: 420, shrink: true,
        }).setPosition(-140, -64, 0);

        // ── 属性卡：攻 / 防 / 战力 + 锻体 ──
        const statCard = spritePanel(this.body, 668, 150, undefined, THEME.tintCard);
        statCard.setPosition(0, 60, 0);
        fadeIn(statCard, 12, 0.04);
        labelL(statCard, `${TEXTS.statAtk} ${stats.atk}`, 27, { bold: true, color: THEME.goldLight })
            .setPosition(-306, 42, 0);
        labelL(statCard, `${TEXTS.statDef} ${stats.def}`, 27, { bold: true, color: THEME.goldLight })
            .setPosition(-306, 0, 0);
        labelL(statCard, `${TEXTS.statPower} ${stats.power}`, 27, { bold: true, color: THEME.paper })
            .setPosition(-306, -42, 0);
        const cost = Game.combat.forgingNextCost(save);
        label(statCard, TEXTS.playerForgeLine(save.combat.forging, cost === Infinity ? '' : `${cost}`), 21, {
            bold: true, color: THEME.paperDim, width: 300, shrink: true,
        }).setPosition(180, 0, 0);

        // ── 法器卡：当前佩用 + 前往法器阁 ──
        const weaponCard = spritePanel(this.body, 668, 120, undefined, THEME.tintPanel);
        weaponCard.setPosition(0, -95, 0);
        fadeIn(weaponCard, 12, 0.08);
        const tier = Game.combat.equippedTier(save);
        const weapon = WEAPONS.find((w) => w.tier === tier);
        image(weaponCard, `art/weapons/weapon_t${Math.max(0, tier)}/spriteFrame`, 84, 84, {
            fallbackPath: 'art/ui/icons/icon_rune/spriteFrame',
        }).setPosition(-270, 0, 0);
        labelL(weaponCard, TEXTS.playerWeapon, 20, { color: THEME.inkSoft }).setPosition(-210, 32, 0);
        labelL(weaponCard, weapon ? weapon.name : TEXTS.playerWeaponNone, 25, {
            bold: true, color: weapon ? THEME.goldLight : THEME.inkSoft, width: 380, shrink: true,
        }).setPosition(-210, -8, 0);
        if (weapon) {
            labelL(weaponCard, `${TEXTS.statAtk}+${weapon.atk}  ${TEXTS.statDef}+${weapon.def}`, 20, { color: THEME.paper })
                .setPosition(-210, -42, 0);
        }
        const goWeapon = spriteButton(weaponCard, 220, 64, TEXTS.playerGoWeapon, () => Game.stack.push(new WeaponScene()), {
            fontSize: 20,
            variant: 'primary',
        });
        goWeapon.node.setPosition(228, 0, 0);

        // ── 福禄卡：月卡 / 券 / 每日仙缘 / 灵根加成 ──
        const fortune = spritePanel(this.body, 668, 250, undefined, THEME.tintCard);
        fortune.setPosition(0, -300, 0);
        fadeIn(fortune, 12, 0.12);
        labelL(fortune, TEXTS.playerFortune, 26, { bold: true, color: THEME.goldLight }).setPosition(-306, 96, 0);
        const days = Math.max(0, Math.ceil((save.monthlyCardExpire - Date.now()) / 86_400_000));
        const rows: string[] = [
            days > 0 ? TEXTS.playerFortuneMonthly(days) : TEXTS.playerFortuneMonthlyNone,
            TEXTS.playerFortuneTicket(save.xiuzhenTickets),
            TEXTS.playerFortuneGift(save.daily.dailyGiftUsed),
            TEXTS.playerFortuneLingen(Math.round((Game.eco.xiuweiBonus - 1) * 100)),
            `${TEXTS.statPower} = 境界基础 × 锻体 + 法器`,
        ];
        rows.forEach((r, i) => {
            labelL(fortune, r, 21, { color: i === 3 ? THEME.success : THEME.paper, width: 590, shrink: true })
                .setPosition(-306, 48 - i * 40, 0);
        });
    }
}
