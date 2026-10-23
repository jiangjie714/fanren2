import { Label, Layers, Node, Sprite, UIOpacity } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { AudioMgr } from '../infra/AudioMgr';
import { Analytics } from '../infra/Analytics';
import { TEXTS } from '../core/config/texts';
import { REALMS } from '../core/config/realms';
import { BoxResult } from '../core/systems/BoxSystem';
import {
    DESIGN_H,
    THEME,
    faded,
    fadeIn,
    image,
    label,
    pageBackground,
    spriteButton,
    uinode,
} from '../ui/ThemeLib';
import { RainScene } from './RainScene';
import { HomeScene } from './HomeScene';

const FREE_BOXES = 3;
/**
 * 新手三连补足的目标机缘 = **下一次突破（练气）的门槛**。
 *
 * 2026-10-23 改为直接读 `REALMS[1].needJiyuan`（原本是硬编码 60 + 注释「与门槛同源」）：
 * 硬编码时若门槛上调（如 60→80），新手三连补到 60 就破不了境，D1「首日必成一次」
 * 会静默失效——这类漂移单测测不出（两处都「看得过去」），只能靠同源消除。
 * `config/realms.ts` 零 import，不存在循环依赖。
 */
const STARTER_JIYUAN = REALMS[1].needJiyuan;

/**
 * D1-60s 新手三连开箱（#59 / spec T4）：
 * 3 只凡俗盒免费开（走 BoxSystem.open({free:true})，仍计保底/统计），
 * 第 3 只开完把机缘补到 60，写 `starter.done`，然后直接进首战渡劫。
 *
 * 这是「60 秒」的核心：跳过 BoxScene 的蓄力/圆满三连/结算弹窗，
 * 把 3 次开箱压成 3 次点击；开箱的爽感保留，等待与广告全部去掉。
 */
export class StarterBoxScene implements IScene {
    node: Node;
    private opened = 0;
    private finished = false;
    private chests: Node[] = [];
    private mainBtn: ReturnType<typeof spriteButton> | null = null;
    private titleLabel!: Label;
    private subLabel!: Label;
    private rewardLabel!: Label;
    private lastRewards: string[] = [];
    private startedAt = 0;

    constructor() {
        this.node = new Node('StarterBoxScene');
        this.node.layer = Layers.Enum.UI_2D;
    }

    onEnter() {
        // 已走完三连（可能中途退出/重启）：不再重复发免费盒，回主页走首战 CTA
        if (Game.save.starter.done) {
            Game.stack.replace(new HomeScene());
            return;
        }
        const n = this.node;
        this.startedAt = Date.now();
        pageBackground(n, 'art/ui/bg_home/spriteFrame');

        this.titleLabel = label(n, TEXTS.starterBoxTitle, 42, {
            bold: true,
            color: THEME.goldLight,
            outline: faded(THEME.void, 220),
            outlineWidth: 3,
        }).getComponent(Label)!;
        this.titleLabel.node.setPosition(0, DESIGN_H / 2 - 160, 0);

        this.subLabel = label(n, TEXTS.starterBoxSub, 22, {
            color: THEME.paper,
            width: 620,
            shrink: true,
            outline: faded(THEME.void, 210),
            outlineWidth: 2,
        }).getComponent(Label)!;
        this.subLabel.node.setPosition(0, DESIGN_H / 2 - 210, 0);

        // 三只宝盒：未开灰置、已开点亮
        const xs = [-190, 0, 190];
        xs.forEach((x, i) => {
            const holder = uinode(`starterChest${i}`, n, 180, 180);
            holder.setPosition(x, 100, 0);
            const chest = image(holder, 'art/boxes/box_fansu/spriteFrame', 160, 160);
            const sp = chest.getComponent(Sprite);
            if (sp) sp.color = THEME.tintMuted;
            const tag = label(holder, `第 ${i + 1} 只`, 20, {
                color: THEME.inkSoft,
                outline: faded(THEME.void, 200),
                outlineWidth: 2,
            });
            tag.setPosition(0, -102, 0);
            this.chests.push(chest);
        });

        this.rewardLabel = label(n, '', 22, {
            color: THEME.paper,
            width: 620,
            shrink: true,
            outline: faded(THEME.void, 215),
            outlineWidth: 2,
        }).getComponent(Label)!;
        this.rewardLabel.node.setPosition(0, -40, 0);

        this.mainBtn = spriteButton(n, 520, 104, TEXTS.starterBoxCount(1), () => this.onMain(), {
            fontSize: 32,
            variant: 'primary',
            textColor: THEME.void,
        });
        this.mainBtn.node.setPosition(0, -300, 0);

        label(n, TEXTS.starterBoxNoAd, 18, {
            color: THEME.inkSoft,
            width: 600,
            shrink: true,
            outline: faded(THEME.void, 200),
            outlineWidth: 2,
        }).setPosition(0, -420, 0);

        fadeIn(n, 14);
    }

    onResume() {
        // 从首战返回（若首战未完成）：保持当前进度；若已完成，切主页
        if (Game.save.starter.done) {
            Game.stack.replace(new HomeScene());
        }
    }

    private onMain() {
        if (this.finished) {
            // 三连完成 → 首战（swap：下层 StarterScene 保留，结算 popToRoot 回去后自动切主页）
            Game.stack.swap(new RainScene());
            return;
        }
        this.openNext();
    }

    private openNext() {
        if (this.opened >= FREE_BOXES) return;
        let r: BoxResult;
        try {
            r = Game.box.open('fansu', { free: true });
        } catch {
            // fansu 永远解锁；异常时不要卡死新手流，直接补足机缘进入首战
            this.finishStarter();
            return;
        }
        this.opened += 1;
        AudioMgr.play(r.tier === 'rare' ? 'rare' : 'open');
        this.lastRewards = r.rewards.map((x) => x.label);
        Analytics.track('starter_box', {
            index: this.opened,
            tier: r.tier,
            jiyuan: Game.eco.jiyuan,
        });
        this.rewardLabel.string = this.lastRewards.join('　·　');
        this.lightChest(this.opened - 1);
        // 已开过的盒子不再可点，仅保留视觉

        if (this.opened >= FREE_BOXES) {
            this.finishStarter();
            return;
        }
        this.mainBtn?.setText(TEXTS.starterBoxCount(this.opened + 1));
        this.subLabel.string = `${TEXTS.starterBoxesLeft(FREE_BOXES - this.opened)} · 机缘 ${Game.eco.jiyuan}`;
        Game.persist();
    }

    /** 第 3 只开完：补足 60 机缘、写 starter.done、主按钮变「去渡劫」 */
    private finishStarter() {
        const starter = Game.save.starter;
        if (!starter.jiyuanGranted) {
            const need = Math.max(0, STARTER_JIYUAN - Game.eco.jiyuan);
            if (need > 0) Game.eco.addJiyuan(need);
            starter.jiyuanGranted = true;
        }
        starter.done = true;
        // 首战必成：确保首次突破保护仍在（stats 未产生过判定的新号）
        Game.persist();
        Analytics.track('starter_complete', {
            jiyuan: Game.eco.jiyuan,
            elapsed_ms: Math.max(0, Date.now() - this.startedAt),
        });
        this.finished = true;
        this.titleLabel.string = TEXTS.starterBoxDone;
        this.subLabel.string = TEXTS.starterBoxReward;
        this.rewardLabel.string = `${TEXTS.starterBoxReward} · 当前机缘 ${Game.eco.jiyuan}`;
        this.mainBtn?.setText(TEXTS.starterBoxGo);
        // 点亮三只（异常兜底路径可能一只未开）
        this.chests.forEach((c) => this.paintChest(c, true));
        AudioMgr.play('success');
    }

    private lightChest(i: number) {
        const c = this.chests[i];
        if (c) this.paintChest(c, true);
    }

    private paintChest(node: Node, lit: boolean) {
        const sp = node.getComponent(Sprite);
        if (sp) sp.color = lit ? THEME.white : THEME.tintMuted;
        const op = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
        op.opacity = lit ? 255 : 190;
    }
}
