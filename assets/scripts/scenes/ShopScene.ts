import { Color, Layers, Node } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { claimDailyGift } from '../infra/dailyGift';
import { IAP_ENABLED, IAP_ITEMS } from '../core/config/iap';
import { TEXTS } from '../core/config/texts';
import { showDialog } from '../ui/dialog';
import {
    DESIGN_H,
    THEME,
    image,
    label,
    pageBackground,
    pageHeader,
    spriteButton,
    spritePanel,
    toast,
    uinode,
} from '../ui/ThemeLib';

/**
 * 仙府商店页 — PRD 页面6。
 * 商品卡竖排（月卡/外观）。合规：IAP_ENABLED=false（无版号）时商品灰置展示"暂未开放"，
 * 不展示任何价格与购买引导；仅保留广告资源入口（每日仙缘）。
 */
export class ShopScene implements IScene {
    node: Node;

    constructor() {
        this.node = new Node('ShopScene');
        this.node.layer = Layers.Enum.UI_2D;
    }

    onEnter() {
        const n = this.node;
        pageBackground(n, 'art/ui/bg_home/spriteFrame');
        pageHeader(n, '仙府商店', () => Game.stack.pop());

        // 顶部灵石结余胶囊
        const curPill = spritePanel(n, 280, 44, undefined, THEME.tintCard);
        curPill.setPosition(0, 475, 0);
        image(curPill, 'art/ui/icons/icon_lingshi/spriteFrame', 28, 28).setPosition(-85, 0, 0);
        label(curPill, `灵石结余: ${Game.save.lingshi}`, 22, { bold: true, color: THEME.goldLight })
            .setPosition(15, 0, 0);

        const cardW = 650;

        // 专区 1：仙府特惠 · 每日仙缘
        label(n, '— 仙府特惠 · 每日仙缘 —', 22, { bold: true, color: THEME.goldLight })
            .setPosition(0, 415, 0);

        const used = Game.save.daily.dailyGiftUsed;
        const gift = spritePanel(n, cardW, 120, undefined, THEME.tintPanel);
        gift.setPosition(0, 325, 0);
        image(gift, 'art/ui/icons/icon_ad/spriteFrame', 68, 68).setPosition(-240, 0, 0);
        // 左缘严格对齐：中心在 -35，宽度 285 → 左缘在 -177，右缘在 107（避开右侧按钮）
        label(gift, TEXTS.dailyGiftBtn, 27, { bold: true, color: THEME.goldLight, align: 'left', width: 285 })
            .setPosition(-35, 20, 0);
        label(gift, '观看机缘领免费凡俗宝盒 (每日1次)', 18, { color: THEME.inkSoft, align: 'left', width: 285 })
            .setPosition(-35, -20, 0);
        const giftBtn = spriteButton(gift, 138, 64, used ? '已领取' : '领 取', () => claimDailyGift(this.node), {
            fontSize: 24,
            variant: used ? 'ghost' : 'primary',
            textColor: used ? THEME.disabled : THEME.void,
        });
        giftBtn.node.setPosition(232, 0, 0);
        if (used) giftBtn.setEnabled(false);

        // 专区 2：宗门奇珍 · 仙玉专区
        label(n, '— 宗门奇珍 · 仙玉专区 —', 22, { bold: true, color: THEME.goldLight })
            .setPosition(0, 235, 0);

        let itemY = 155;
        const iapCardH = 112;
        for (const item of IAP_ITEMS) {
            const card = spritePanel(n, cardW, iapCardH, undefined,
                IAP_ENABLED ? THEME.tintPanel : THEME.tintMuted);
            card.setPosition(0, itemY, 0);
            const iconId = item.id === 'monthlyCard' ? 'icon_jiyuan' : 'icon_collection';
            image(card, `art/ui/icons/${iconId}/spriteFrame`, 68, 68).setPosition(-240, 0, 0);
            label(card, item.name, 25, {
                bold: true,
                color: IAP_ENABLED ? THEME.goldLight : THEME.ink,
                align: 'left',
                width: 285,
            }).setPosition(-35, 18, 0);
            label(card, item.effect, 18, { color: THEME.inkSoft, align: 'left', width: 285 })
                .setPosition(-35, -20, 0);
            const buyBtn = spriteButton(card, 138, 60,
                IAP_ENABLED ? `${TEXTS.shopBuyBtn} ¥${item.price}` : TEXTS.shopUnavailable,
                () => this.buy(item.id, item.name), {
                    fontSize: 23,
                    variant: IAP_ENABLED ? 'primary' : 'ghost',
                    textColor: IAP_ENABLED ? THEME.void : THEME.disabled,
                });
            buyBtn.node.setPosition(232, 0, 0);
            if (!IAP_ENABLED) buyBtn.setEnabled(false);
            itemY -= iapCardH + 14;
        }

        // 内购状态提示
        if (!IAP_ENABLED) {
            label(n, `✦ ${TEXTS.shopIapNotice} · 敬请期待后续版本 ✦`, 20, { color: THEME.goldLight })
                .setPosition(0, -220, 0);
        }

        // 底部合规守则面板（充实界面、符合抖音小游戏上架规范）
        const noticePanel = spritePanel(n, 650, 96, undefined, THEME.tintPanel);
        noticePanel.setPosition(0, -465, 0);
        label(noticePanel, '— 仙府修仙守则 —', 22, { bold: true, color: THEME.goldLight })
            .setPosition(0, 18, 0);
        label(noticePanel, TEXTS.shopIapOnlyVisual, 19, { color: THEME.inkSoft })
            .setPosition(0, -18, 0);
    }

    onResume() {
        // 每日仙缘领取后会 push 开箱页，返回时按钮仍是 onEnter 时的旧快照。
        // 整页重建（页面本身无长驻 tween/监听，重建安全），否则玩家看到
        // 「已领取」却还能点，且 dailyGift 内部若不复核就会无限刷（P0-3）。
        this.node.destroyAllChildren();
        this.onEnter();
    }

    private buy(id: string, name: string) {
        if (!IAP_ENABLED) {
            showDialog(this.node, {
                title: name,
                lines: [TEXTS.shopIapNotice, TEXTS.shopIapOnlyVisual],
                buttons: [{ text: '关闭' }],
            });
            return;
        }
        // IAP_ENABLED=true 时走平台支付（抖音端 tt.requestGamePayment；本占位在 M6 后接真实支付）
        void id;
        toast(this.node, '支付通道待接入');
    }
}
