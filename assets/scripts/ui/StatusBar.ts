/** 夜墨星辰状态栏：暗金风格境界、灵石与机缘进度胶囊。 */
import { Color, Label, Node } from 'cc';
import { REALMS } from '../core/config/realms';
import { Game } from '../infra/Game';
import { DESIGN_H, image, label, progressBar, spritePanel, THEME, uinode } from './ThemeLib';

export interface StatusBarHandle {
    node: Node;
    refresh(): void;
}

export function statusBar(parent: Node, y = DESIGN_H / 2 - 132): StatusBarHandle {
    const n = uinode('statusBar', parent, 720, 132);
    n.setPosition(0, y, 0);

    // Dark panel with gold border
    spritePanel(n, 664, 124);

    const realmLb = label(n, '境界【凡人】', 27, {
        bold: true,
        color: THEME.goldLight,
        align: 'left',
        width: 260,
        shadow: true,
        shadowColor: THEME.shadow,
    });
    realmLb.setPosition(-168, 26, 0);

    image(n, 'art/ui/icons/icon_lingshi/spriteFrame', 36, 36).setPosition(280, 26, 0);
    const lingshiLb = label(n, '0', 27, {
        bold: true,
        color: THEME.goldLight,
        align: 'right',
        width: 120,
    });
    lingshiLb.setPosition(196, 26, 0);

    // Teal progress bar for jiyuan
    const bar = progressBar(n, 608, 36, { text: '机缘 0/0', fontSize: 20 });
    bar.node.setPosition(0, -26, 0);

    const refresh = () => {
        const save = Game.save;
        if (!save) return;
        realmLb.getComponent(Label)!.string = `境界【${REALMS[save.realmIndex].name}】`;
        lingshiLb.getComponent(Label)!.string = `${save.lingshi}`;
        const next = REALMS[save.realmIndex + 1];
        if (next) {
            bar.set(Math.min(1, save.jiyuan / next.needJiyuan), `机缘 ${save.jiyuan}/${next.needJiyuan}`);
        } else {
            bar.set(1, '机缘 圆满');
        }
    };
    refresh();
    return { node: n, refresh };
}
