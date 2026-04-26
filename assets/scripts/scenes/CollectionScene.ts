import { Button, Color, Graphics, Label, Layers, Node, tween, UIOpacity } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { getLingeng, LINGENS, LingengGrade } from '../core/config/lingens';
import { MAX_REALM_INDEX, REALMS } from '../core/config/realms';
import { TEXTS } from '../core/config/texts';
import { Share } from '../infra/Share';
import { showDialog } from '../ui/dialog';
import {
    DESIGN_H,
    DESIGN_W,
    THEME,
    faded,
    fadeIn,
    image,
    label,
    pageBackground,
    pageHeader,
    progressBar,
    spriteButton,
    spritePanel,
    toast,
    uinode,
} from '../ui/ThemeLib';

const GRADE_COLORS: Record<LingengGrade, Color> = {
    '普通灵根': THEME.inkSoft,
    '稀有灵根': THEME.azurite,
    '变异灵根': THEME.violet,
    '先天道体': THEME.gold,
};

/**
 * 灵根图鉴页 — PRD 页面5。
 * 3 列网格：已解锁点亮（名称/品级/加成），未解锁灰置（碎片进度）；点击查看详情并可合成。
 */
export class CollectionScene implements IScene {
    node: Node;

    constructor() {
        this.node = new Node('CollectionScene');
        this.node.layer = Layers.Enum.UI_2D;
    }

    onResume() {
        // 合成灵根（swap 换页）等跨页操作返回后整页重建，
        // 避免 UI 停留在旧状态（页面无长驻监听，重建安全）（P1-3）。
        this.node.destroyAllChildren();
        this.onEnter();
    }

    onEnter() {
        const n = this.node;
        pageBackground(n, 'art/ui/bg_home/spriteFrame');
        pageHeader(n, '灵根图鉴', () => Game.stack.pop());
        label(n, TEXTS.collectionHint, 22, { color: THEME.inkSoft }).setPosition(0, 485, 0);

        // 网格：3 列（8 件 → 3 行）
        const cardW = 212;
        const cardH = 236;
        const gapX = 14;
        const gapY = 14;
        const startX = -(cardW + gapX);
        LINGENS.forEach((cfg, i) => {
            const col = i % 3;
            const row = Math.floor(i / 3);
            const x = startX + col * (cardW + gapX);
            const y = 350 - row * (cardH + gapY);
            this.buildCard(n, cfg.id, x, y, cardW, cardH);
        });

        // M9c 境界外观展示区（带容器面板，规避文本与头像碰撞）
        this.buildRealmStrip(n);

        // 底部收集总进度面板（充盈底部空间，高于安全线）
        const p = Game.col.progress(Game.save);
        const footer = spritePanel(n, 650, 96, undefined, THEME.tintPanel);
        footer.setPosition(0, -470, 0);
        label(footer, `收集成就  ${p.unlocked}/${p.total}`, 25, { bold: true, color: THEME.goldLight })
            .setPosition(-140, 20, 0);
        label(footer, '合成灵根获修为加成 · 属性永久生效', 18, { color: THEME.inkSoft })
            .setPosition(-140, -20, 0);
        const fpb = progressBar(footer, 240, 32);
        fpb.set(p.total ? p.unlocked / p.total : 0, `${Math.round((p.total ? p.unlocked / p.total : 0) * 100)}%`);
        fpb.node.setPosition(165, 0, 0);
    }

    /** 六境界头像条：已达境界点亮可预览/分享，未达灰置带锁 */
    private buildRealmStrip(parent: Node) {
        const stripPanel = spritePanel(parent, 650, 96, undefined, THEME.tintPanel);
        stripPanel.setPosition(0, -345, 0);

        label(stripPanel, `— ${TEXTS.realmLookTitle} · 历练化身预览 —`, 18, { bold: true, color: THEME.goldLight })
            .setPosition(0, 26, 0);

        const reached = Game.save.realmIndex;
        REALMS.forEach((cfg, i) => {
            const x = -250 + i * 100;
            const chip = uinode(`look${i}`, stripPanel, 52, 52);
            chip.setPosition(x, -14, 0);
            const bg = chip.addComponent(Graphics);
            bg.fillColor = i <= reached ? faded(THEME.slate, 246) : faded(THEME.voidEnd, 214);
            bg.circle(0, 0, 26);
            bg.fill();
            bg.strokeColor = i <= reached ? THEME.goldLight : faded(THEME.bronze, 190);
            bg.lineWidth = 2;
            bg.circle(0, 0, 26);
            bg.stroke();
            const avatar = uinode('avatar', chip, 44, 44);
            avatar.setPosition(0, 2, 0);
            const av = image(avatar, `art/characters/char_realm_0${i}/spriteFrame`, 44, 44);
            void av;
            if (i > reached) {
                const op = avatar.addComponent(UIOpacity);
                op.opacity = 70;
                image(chip, 'art/ui/icons/icon_lock/spriteFrame', 20, 20).setPosition(14, -14, 0);
            }
            const btn = chip.addComponent(Button);
            btn.transition = Button.Transition.SCALE;
            btn.zoomScale = 0.94;
            btn.target = chip;
            chip.on(Button.EventType.CLICK, () => this.showRealmDialog(i));
        });
    }

    /** 境界外观预览弹窗：大立绘 + 状态 + 已解锁可分享 */
    private showRealmDialog(index: number) {
        const cfg = REALMS[index];
        const reached = Game.save.realmIndex >= index;
        const layer = uinode('realmDialog', this.node, DESIGN_W, DESIGN_H);
        const dim = layer.addComponent(Graphics);
        dim.fillColor = faded(THEME.void, 162);
        dim.roundRect(-DESIGN_W / 2, -DESIGN_H / 2, DESIGN_W, DESIGN_H, 0);
        dim.fill();
        layer.addComponent(UIOpacity).opacity = 0;
        tween(layer.getComponent(UIOpacity)!).to(0.12, { opacity: 255 }).start();

        const panel = spritePanel(layer, 560, 560, undefined, THEME.tintCard);
        label(panel, `【${cfg.name}】`, 34, { bold: true, color: THEME.goldLight }).setPosition(0, 232, 0);
        const stage = uinode('stage', panel, 240, 240);
        stage.setPosition(0, 60, 0);
        const ring = stage.addComponent(Graphics);
        ring.fillColor = faded(THEME.goldDeep, 36);
        ring.circle(0, 0, 104);
        ring.fill();
        image(stage, `art/characters/char_realm_0${index}/spriteFrame`, 220, 220);
        const lb = label(panel, reached ? TEXTS.realmLookReached : TEXTS.realmLookLocked(REALMS[Math.min(MAX_REALM_INDEX, index - 1 >= 0 ? index : 1)].name), 22, {
            color: reached ? THEME.success : THEME.inkSoft,
            width: 460,
            shrink: true,
        }).getComponent(Label)!;
        lb.node.setPosition(0, -92, 0);

        const close = spriteButton(panel, 180, 64, '关 闭', () => layer.destroy(), {
            fontSize: 24,
            variant: 'secondary',
            textColor: THEME.ink,
        });
        if (reached) {
            // 双按钮：对称排布
            close.node.setPosition(-110, -206, 0);
            const shareBtn = spriteButton(panel, 200, 64, '炫耀一下', () => {
                if (!Share.share({ title: TEXTS.shareRealmUnlock(cfg.name) })) {
                    toast(this.node, TEXTS.shareUnavailable);
                }
            }, {
                fontSize: 24,
                variant: 'primary',
                textColor: THEME.paper,
            });
            shareBtn.node.setPosition(110, -206, 0);
        } else {
            // 单按钮：居中
            close.node.setPosition(0, -206, 0);
        }
        void fadeIn;
    }

    private buildCard(parent: Node, id: string, x: number, y: number, w: number, h: number) {
        const cfg = getLingeng(id);
        const save = Game.save;
        const unlocked = save.unlocked.includes(id);
        const frags = Game.col.fragmentsOf(save, id);

        const card = spritePanel(parent, w, h, undefined, unlocked ? THEME.tintCard : THEME.tintMuted);
        card.setPosition(x, y, 0);

        // 图标区（未解锁暗色沉槽 + 锁）。图标 92 而非 80：卡高 236 里文字块只占底部
        // 约 90，图标太小会让卡片中段空出一大块（视觉上「上下脱节」）。
        const iconSize = 92;
        const icon = uinode('icon', card, iconSize, iconSize);
        icon.setPosition(0, 44, 0);
        if (unlocked) {
            image(icon, 'art/ui/icons/icon_collection/spriteFrame', iconSize, iconSize);
        } else {
            const g = icon.addComponent(Graphics);
            // 沉槽用玄墨令牌。旧值是硬编码 navy (24,32,60)，在紫相面板上是一块冷蓝脏斑。
            g.fillColor = faded(THEME.void, 230);
            g.circle(0, 0, iconSize / 2 - 4);
            g.fill();
            g.strokeColor = faded(THEME.bronze, 190);
            g.lineWidth = 1.5;
            g.circle(0, 0, iconSize / 2 - 4);
            g.stroke();
            image(icon, 'art/ui/icons/icon_lock/spriteFrame', 38, 38);
        }

        label(card, unlocked ? cfg.name : '？？？', 24, {
            bold: true,
            color: unlocked ? GRADE_COLORS[cfg.grade] : THEME.disabled,
        }).setPosition(0, -22, 0);
        label(card, cfg.grade, 19, { color: unlocked ? GRADE_COLORS[cfg.grade] : THEME.disabled })
            .setPosition(0, -54, 0);

        if (unlocked) {
            label(card, `修为加成 +${Math.round(cfg.xiuweiBonus * 100)}%`, 18, { color: THEME.success })
                .setPosition(0, -82, 0);
        } else {
            label(card, `碎片 ${frags}/${cfg.need}`, 18, { color: frags >= cfg.need ? THEME.goldLight : THEME.inkSoft })
                .setPosition(0, -82, 0);
        }

        // 整卡点击 → 详情
        const btn = card.addComponent(Button);
        btn.transition = Button.Transition.SCALE;
        btn.zoomScale = 0.97;
        btn.target = card;
        card.on(Button.EventType.CLICK, () => this.showDetail(id));
    }

    private showDetail(id: string) {
        const cfg = getLingeng(id);
        const save = Game.save;
        const unlocked = save.unlocked.includes(id);
        const frags = Game.col.fragmentsOf(save, id);

        const lines: Array<string | { text: string; color?: number }> = [
            { text: `${cfg.grade} · 修为获取加成 +${Math.round(cfg.xiuweiBonus * 100)}%` },
            { text: cfg.desc },
            unlocked
                ? { text: TEXTS.collectionComposed, color: 3 }
                : { text: `灵根碎片 ${frags}/${cfg.need}`, color: frags >= cfg.need ? 1 : undefined },
        ];

        const canCompose = Game.col.canCompose(save, id);
        showDialog(this.node, {
            title: cfg.name,
            lines,
            buttons: [
                ...(canCompose ? [{
                    text: TEXTS.collectionCompose,
                    primary: true,
                    cb: () => this.compose(id),
                }] : []),
                { text: '关闭' },
            ],
        });
    }

    private compose(id: string) {
        if (!Game.col.compose(Game.save, id)) {
            toast(this.node, '碎片不足，无法合成');
            return;
        }
        Game.checkAchievements(this.node); // 图鉴类成就（M9a）
        Game.persist();
        const cfg = getLingeng(id);
        toast(this.node, `灵根「${cfg.name}」解锁！`);
        // 重建本页：点亮新灵根、刷新修为加成来源。
        // 用 swap 只替换栈顶 —— 旧版 replace 会把栈底 Home 一并销毁，
        // 返回时栈空白屏（P0-2）。
        Game.stack.swap(new CollectionScene());
    }
}
