/**
 * M25 道友名录（子项目② a 层，数值假设 #50）：20 位档案道友列表页。
 * 2 列 × 5 行/页 × 2 页翻页；行内即档案（名字 · 境界 · 倾向，确定性派生见
 * core/daoFriends），点击 → 消耗 1 次切磋次数 → PkBattleScene('friend', opp)。
 * 「约人切磋」的本地社交比较：同境可战、高一境需努力（档案跟随玩家境界成长）。
 */
import { Layers, Node } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { DAO_FRIEND_COUNT, daoFriendLabel, makeFriendOpponent } from '../core/daoFriends';
import { PK_DAILY_LIMIT, PK_FRIEND_GIFT, PK_FRIEND_GIFT_CAP } from '../core/config/combat';
import { TEXTS } from '../core/config/texts';
import { statusBar } from '../ui/StatusBar';
import {
    fadeIn,
    label,
    labelL,
    pageBackground,
    pageHeader,
    spriteButton,
    spritePanel,
    toast,
    uinode,
    THEME,
} from '../ui/ThemeLib';
import { PkBattleScene } from './PkBattleScene';

/** 每页行数（2 列 × 5 行）与翻页总数 */
const PER_PAGE = 10;
const PAGES = Math.ceil(DAO_FRIEND_COUNT / PER_PAGE);

export class DaoFriendScene implements IScene {
    node: Node;
    private body: Node | null = null;
    private bar: ReturnType<typeof statusBar> | null = null;
    private page = 0;

    constructor() {
        this.node = new Node('DaoFriendScene');
        this.node.layer = Layers.Enum.UI_2D;
    }

    onEnter() {
        const n = this.node;
        pageBackground(n, 'art/ui/bg_home/spriteFrame');
        pageHeader(n, TEXTS.daoFriendPageTitle, () => Game.stack.pop());
        this.bar = statusBar(n, 436);
        this.render();
    }

    private render() {
        this.body?.destroy();
        this.bar?.refresh();
        const n = this.node;
        this.body = uinode('body', n, 720, 1280);
        const save = Game.save;

        // 顶部提示卡
        const tip = spritePanel(this.body, 660, 96, undefined, THEME.tintCard);
        tip.setPosition(0, 320, 0);
        fadeIn(tip, 12);
        labelL(tip, '道友名录', 26, { bold: true, color: THEME.goldLight }).setPosition(-306, 26, 0);
        labelL(tip, `以武会友——战胜道友得交情礼 ${PK_FRIEND_GIFT} 灵石（每日上限 ${PK_FRIEND_GIFT_CAP}）`, 19, {
            color: THEME.inkSoft, width: 600, shrink: true,
        }).setPosition(-306, -14, 0);

        // 列表：2 列 × 5 行（行内即档案）
        const start = this.page * PER_PAGE;
        for (let k = 0; k < PER_PAGE; k++) {
            const idx = start + k;
            if (idx >= DAO_FRIEND_COUNT) break;
            const col = k % 2;
            const row = Math.floor(k / 2);
            const x = col === 0 ? -164 : 164;
            const y = 200 - row * 104;
            // 统一 secondary 暗底：primary 金底需配深色字（THEME.void），双列混用会
            // 一半金一半暗、且金字压金底对比度不足；统一暗底 + 亮字排列更整齐、可读性一致
            const btn = spriteButton(this.body, 312, 88, '', () => this.challenge(idx), {
                fontSize: 20,
                variant: 'secondary',
            });
            btn.node.setPosition(x, y, 0);
            label(btn.node, daoFriendLabel(save, idx), 19, {
                bold: true, color: THEME.goldLight,
            }).setPosition(0, 22, 0);
            label(btn.node, '点击切磋 · 消耗 1 次', 15, { color: THEME.inkSoft }).setPosition(0, -14, 0);
        }

        // 翻页：◀ 1/2 ▶（点击区 88）
        const foot = uinode('foot', this.body, 720, 120);
        foot.setPosition(0, -520, 0);
        const prev = spriteButton(foot, 88, 88, '◀', () => this.flip(-1), { fontSize: 30 });
        prev.node.setPosition(-160, 0, 0);
        const next = spriteButton(foot, 88, 88, '▶', () => this.flip(1), { fontSize: 30 });
        next.node.setPosition(160, 0, 0);
        label(foot, `${this.page + 1} / ${PAGES} 页`, 24, { bold: true, color: THEME.paper }).setPosition(0, 0, 0);
        label(foot, `${TEXTS.pkRemaining(save.daily.pkUsed, PK_DAILY_LIMIT)} · 胜者得灵石与修为`, 19, {
            color: THEME.inkSoft,
        }).setPosition(0, -70, 0);
    }

    private flip(d: number) {
        this.page = (this.page + d + PAGES) % PAGES;
        this.render();
    }

    private challenge(idx: number) {
        if (!Game.combat.canPk(Game.save)) {
            toast(this.node, TEXTS.pkExhausted);
            return;
        }
        Game.stack.push(new PkBattleScene('friend', makeFriendOpponent(Game.save, idx)));
    }
}
