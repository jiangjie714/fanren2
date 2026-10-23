import { Graphics, Layers, Node } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { Analytics } from '../infra/Analytics';
import { TEXTS } from '../core/config/texts';
import { showAgreementDialog, showPrivacyDialog, showProbabilityDialog } from '../ui/infoDialogs';
import {
    DESIGN_H,
    THEME,
    faded,
    fadeIn,
    iconButton,
    image,
    label,
    pageBackground,
    spriteButton,
    uinode,
} from '../ui/ThemeLib';
import { StarterBoxScene } from './StarterBoxScene';
import { HomeScene } from './HomeScene';
import { SettingsScene } from './SettingsScene';

/**
 * D1-60s 新手主页（#59 / spec T3）：只保留「开启仙缘宝盒」一条主路径。
 *
 * 为什么单独建页而不是在 HomeScene 里做条件布局：
 * - HomeScene 是 600 行的成熟页面，塞入 starter 分支会把「首日」与「长期」两套版式
 *   耦死，回归成本远高于新建一页；
 * - starter 页只活 60 秒，不需要 long-term 的 rail/红点/状态刷新，独立页更小更稳；
 * - 首次渡劫成功后由本页 `onResume` 自动 `replace(HomeScene)`，玩家无感切换。
 */
export class StarterScene implements IScene {
    node: Node;

    constructor() {
        this.node = new Node('StarterScene');
        this.node.layer = Layers.Enum.UI_2D;
    }

    onEnter() {
        // 已完成新手流 / 已突破的玩家误入 → 直接回主页（幂等兜底）
        if (Game.save.starter.done || Game.save.realmIndex > 0) {
            Game.stack.replace(new HomeScene());
            return;
        }
        const n = this.node;
        Analytics.track('starter_view', {});
        pageBackground(n, 'art/ui/bg_home/spriteFrame');

        // 顶部：道号 + 设置（不显示完整状态栏，减少首屏信息）
        label(n, TEXTS.starterTitle, 46, {
            bold: true,
            color: THEME.goldLight,
            shadow: true,
            shadowColor: THEME.shadow,
        }).setPosition(0, 300, 0);
        label(n, `${Game.save.profile.name} · ${TEXTS.starterRealm}`, 26, {
            bold: true,
            color: THEME.goldLight,
            outline: faded(THEME.void, 220),
            outlineWidth: 3,
        }).setPosition(0, DESIGN_H / 2 - 90, 0);
        iconButton(n, 'art/ui/icons/icon_settings/spriteFrame', () => Game.stack.push(new SettingsScene()), 68, 68)
            .node.setPosition(-286, DESIGN_H / 2 - 90, 0);

        // 角色（凡人立绘；女修资源缺失时回退男修）
        const charNode = uinode('starterChar', n, 340, 340);
        charNode.setPosition(0, 120, 0);
        image(charNode, `art/characters/char_realm_00${Game.save.profile.gender === 'f' ? '_f' : ''}/spriteFrame`, 300, 300,
            Game.save.profile.gender === 'f'
                ? { fallbackPath: 'art/characters/char_realm_00/spriteFrame' }
                : {});
        // 脚下光晕：Graphics 实色 + 低 alpha，避免白块
        const glow = uinode('starterGlow', n, 420, 120);
        glow.setPosition(0, -40, 0);
        const g = glow.addComponent(Graphics);
        g.fillColor = faded(THEME.gold, 26);
        g.ellipse(0, 0, 210, 46);
        g.fill();

        label(n, TEXTS.starterHint, 40, {
            bold: true,
            color: THEME.paper,
            outline: faded(THEME.void, 220),
            outlineWidth: 3,
        }).setPosition(0, -120, 0);
        label(n, TEXTS.starterSub, 22, {
            color: THEME.paperDim,
            width: 600,
            shrink: true,
            outline: faded(THEME.void, 200),
            outlineWidth: 2,
        }).setPosition(0, -172, 0);

        // 唯一主 CTA
        spriteButton(n, 520, 104, TEXTS.starterCta, () => Game.stack.push(new StarterBoxScene()), {
            fontSize: 34,
            variant: 'primary',
            textColor: THEME.void,
        }).node.setPosition(0, -330, 0);

        // 底部合规三链接（审核要求，不能省）
        const links: Array<[string, () => void]> = [
            [TEXTS.probabilityPublic, () => showProbabilityDialog(n)],
            [TEXTS.settingsUserAgreement, () => showAgreementDialog(n)],
            [TEXTS.settingsPrivacy, () => showPrivacyDialog(n)],
        ];
        const linkW = 184;
        links.forEach(([text, cb], i) => {
            spriteButton(n, linkW, 46, text, cb, {
                fontSize: 18,
                variant: 'ghost',
                textColor: THEME.inkSoft,
            }).node.setPosition((i - 1) * (linkW + 16), -DESIGN_H / 2 + 96, 0);
        });

        fadeIn(n, 16);
    }

    onResume() {
        // 首渡劫成功 / 玩家已走完三连：切回常驻主页
        if (Game.save.starter.done || Game.save.realmIndex > 0) {
            Game.stack.replace(new HomeScene());
        }
    }
}
