import { Color, Graphics, Label, Layers, Node, UIOpacity, tween, Vec3 } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { Ads } from '../infra/Ads';
import { SaveStore } from '../infra/SaveStore';
import { BoxResult } from '../core/systems/BoxSystem';
import { AD_PLACES } from '../core/config/ads';
import { REALMS } from '../core/config/realms';
import { TEXTS } from '../core/config/texts';
import { statusBar } from '../ui/StatusBar';
import {
    ButtonHandle,
    DESIGN_H,
    DESIGN_W,
    THEME,
    animFrames,
    faded,
    fadeIn,
    iconButton,
    image,
    label,
    pageBackground,
    spriteAnimation,
    spriteButton,
    spritePanel,
    toast,
    uinode,
} from '../ui/ThemeLib';
import { BoxScene } from './BoxScene';
import { CollectionScene } from './CollectionScene';
import { ExpeditionScene } from './ExpeditionScene';
import { LudaoScene } from './LudaoScene';
import { QuestScene } from './QuestScene';
import { RainScene } from './RainScene';
import { SettingsScene } from './SettingsScene';
import { ShopScene } from './ShopScene';
import { WeaponScene } from './WeaponScene';
import { showAgreementDialog, showPrivacyDialog, showProbabilityDialog } from '../ui/infoDialogs';
import { ACTIVITY_CHESTS } from '../core/config/quests';

/**
 * 已产出逐帧待机动画的境界。
 *
 * 尚未动画化的境界走静态立绘 —— 不做「先试加载动画、失败再回退」的探测，
 * 因为帧加载是异步的，回退会先闪一帧空白。显式白名单在构建期就能确定行为。
 */
const ANIMATED_REALMS = new Set<number>([0]);
/** 待机动画帧数（2x3 网格切出 6 帧）与播放速率。4fps ≈ 1.5s 一个呼吸循环。 */
const IDLE_FRAMES = 6;
const IDLE_FPS = 4;

/**
 * Ink-wash home. The background and avatar are layered images; all controls
 * remain built in code so state refreshes without a Cocos scene graph rebuild.
 */
export class HomeScene implements IScene {
    node: Node;

    private bar = { refresh: () => {} };
    private breakBtn!: ButtonHandle;
    private giftBtn!: ButtonHandle;
    private questBtn!: ButtonHandle;
    private expeditionBtn!: ButtonHandle;
    private questDot!: Node;
    private expeditionDot!: Node;
    private ludaoBtn!: ButtonHandle;
    private ludaoDot!: Node;
    private weaponBtn!: ButtonHandle;
    private realmName!: Label;
    private statLabel!: Label;
    private stage!: Node;
    private shownRealm = -1;
    private shownGender: 'm' | 'f' | '' = '';

    constructor() {
        this.node = new Node('HomeScene');
        this.node.layer = Layers.Enum.UI_2D;
    }

    onEnter() {
        const n = this.node;
        pageBackground(n, 'art/ui/bg_home/spriteFrame');

        // 坏档提示（P1-5）：SaveStore.load 发现损坏时备份原档并重置，
        // 这里给出可见反馈，绝不静默丢档。消费后复位，只提示一次。
        if (SaveStore.corrupted) {
            SaveStore.corrupted = false;
            toast(n, '检测到存档损坏，已备份原档并重新开始修行');
        }

        this.bar = statusBar(n, DESIGN_H / 2 - 132);

        this.stage = uinode('stage', n, 560, 400);
        this.stage.setPosition(0, 195, 0);

        // 底层静雅玄莲台基（温润微光 + 墨玉莲台，摒弃繁杂人造同心圆）
        const seatBase = uinode('seatBase', this.stage, 360, 120);
        seatBase.setPosition(0, -84, 0);
        const gSeat = seatBase.addComponent(Graphics);
        // 底层祥云清气光晕
        gSeat.fillColor = faded(THEME.gold, 28);
        gSeat.ellipse(0, 0, 185, 44);
        gSeat.fill();
        // 墨玉莲瓣座基。注意这里**用玄青而不是 tintSeat** —— Graphics 的 fillColor 是
        // 直涂不是乘算，误用近白 tint 令牌会画出一条白条（曾真实翻车）。
        gSeat.fillColor = faded(THEME.slate, 234);
        gSeat.roundRect(-150, -16, 300, 36, 18);
        gSeat.fill();
        gSeat.strokeColor = THEME.border;
        gSeat.lineWidth = 2;
        gSeat.roundRect(-150, -16, 300, 36, 18);
        gSeat.stroke();
        // 莲台金丝纹饰线（上移到属性行上方，属性文字刻在莲台暗玉底上）
        gSeat.strokeColor = faded(THEME.goldLight, 160);
        gSeat.lineWidth = 1.5;
        gSeat.moveTo(-110, 24);
        gSeat.lineTo(110, 24);
        gSeat.stroke();

        // 角色立绘主体（待机轻缓悬浮呼吸）
        const charNode = uinode('char', this.stage, 330, 330);
        charNode.setPosition(0, 20, 0);
        const op = charNode.addComponent(UIOpacity);
        op.opacity = 250;
        tween(charNode)
            .repeatForever(
                tween()
                    .to(1.8, { position: new Vec3(0, 26, 0), scale: new Vec3(1.02, 0.98, 1) }, { easing: 'sineInOut' })
                    .to(1.8, { position: new Vec3(0, 14, 0), scale: new Vec3(0.98, 1.02, 1) }, { easing: 'sineInOut' })
            )
            .start();
        this.realmName = label(this.stage, '【凡人】', 32, {
            bold: true,
            color: THEME.goldLight,
            shadow: true,
            shadowColor: THEME.shadow,
        }).getComponent(Label)!;
        this.realmName.node.setPosition(0, -142, 0);

        // M11：攻防战力一览（deriveStats：境界 ×锻体 + 法器）。
        // 放在莲台暗玉底上（stage -84）——旧位置 -180 会撞上 y=0 的标题「凡人开仙缘」。
        this.statLabel = label(this.stage, '', 20, {
            bold: true,
            color: THEME.paper,
            shadow: true,
            shadowColor: THEME.shadow,
        }).getComponent(Label)!;
        this.statLabel.node.setPosition(0, -84, 0);

        fadeIn(this.stage, 14);

        // 游戏标题：典雅沉稳，字号层次清晰
        label(n, '凡人开仙缘', 46, {
            bold: true,
            color: THEME.goldLight,
            shadow: true,
            shadowColor: THEME.shadow,
        }).setPosition(0, 0, 0);

        // 主 CTA：全页唯一的金色实底按钮，放大一档确立视觉锚点。
        this.breakBtn = spriteButton(n, 500, 102, '冲击境界', () => this.enterRain(), {
            fontSize: 32,
            variant: 'primary',
        });
        this.breakBtn.node.setPosition(0, -85, 0);

        // 仙缘宝盒是核心变现入口但不是本页主行动，降为暗底次级款，
        // 文字用曦金与另外三个入口（宣纸白）拉开半档区分。
        const entries: Array<[string, string, () => void, Color]> = [
            ['仙缘宝盒', 'box', () => Game.stack.push(new BoxScene()), THEME.goldLight],
            ['灵根图鉴', 'collection', () => Game.stack.push(new CollectionScene()), THEME.ink],
            ['仙府商店', 'shop', () => Game.stack.push(new ShopScene()), THEME.ink],
            ['设  置', 'settings', () => Game.stack.push(new SettingsScene()), THEME.ink],
        ];
        const positions: Array<[number, number]> = [
            [-166, -204], [166, -204], [-166, -316], [166, -316],
        ];
        entries.forEach(([title, iconPath, cb, textColor], i) => {
            const b = spriteButton(n, 322, 96, '', cb, { variant: 'secondary', fontSize: 27 });
            b.node.setPosition(positions[i][0], positions[i][1], 0);
            image(b.node, `art/ui/icons/icon_${iconPath}/spriteFrame`, 56, 56).setPosition(-64, 0, 0);
            label(b.node, title, 26, { bold: true, color: textColor }).setPosition(34, 0, 0);
        });

        this.giftBtn = spriteButton(n, 660, 78, '', () => this.dailyGift(), {
            fontSize: 23,
            variant: 'secondary',
            textColor: THEME.goldLight,
        });
        this.giftBtn.node.setPosition(0, -420, 0);
        image(this.giftBtn.node, 'art/ui/icons/icon_ad/spriteFrame', 50, 50).setPosition(-170, 0, 0);
        label(this.giftBtn.node, `${TEXTS.dailyGiftBtn} · 免费凡俗宝盒`, 23, {
            bold: true,
            color: THEME.goldLight,
        }).setPosition(30, 0, 0);

        // M8 日常循环入口：修行 / 历练（右侧对齐圆钮 + 红点）
        // 图标下沿 = y - 36，标签放到 -52 留 16px 间隙（旧值 -46 时标签顶着图标底缘）；
        // 标签压在高饱和插画上，必须给描边，否则 18px 白字在亮部直接糊掉。
        const railLabel = (text: string, y: number) => label(n, text, 18, {
            bold: true,
            color: THEME.paper,
            outline: faded(THEME.void, 220),
            outlineWidth: 3,
        }).setPosition(286, y, 0);
        this.questBtn = iconButton(n, 'art/ui/icons/icon_quest/spriteFrame', () => Game.stack.push(new QuestScene()), 72, 72);
        this.questBtn.node.setPosition(286, 370, 0);
        railLabel('修行', 318);
        this.questDot = this.makeDot(n, 286, 370);

        this.expeditionBtn = iconButton(n, 'art/ui/icons/icon_expedition/spriteFrame', () => Game.stack.push(new ExpeditionScene()), 72, 72);
        this.expeditionBtn.node.setPosition(286, 240, 0);
        railLabel('历练', 188);
        this.expeditionDot = this.makeDot(n, 286, 240);

        // M9a 论道入口：排行（降级版）/ 论武 / 幻境 / 成就
        this.ludaoBtn = iconButton(n, 'art/ui/icons/icon_ludao/spriteFrame', () => Game.stack.push(new LudaoScene()), 72, 72);
        this.ludaoBtn.node.setPosition(286, 110, 0);
        railLabel('论道', 58);
        this.ludaoDot = this.makeDot(n, 286, 110);

        // M11 法器阁入口：锻体 + 六档法器
        this.weaponBtn = iconButton(n, 'art/ui/icons/icon_weapon/spriteFrame', () => Game.stack.push(new WeaponScene()), 72, 72);
        this.weaponBtn.node.setPosition(286, -20, 0);
        railLabel('法器', -70);

        // 底部合规入口（位于 -480 处，高于底部 -536 安全线，彻底远离手势栏冲突）
        const links: Array<[string, () => void]> = [
            [TEXTS.probabilityPublic, () => showProbabilityDialog(n)],
            [TEXTS.settingsUserAgreement, () => showAgreementDialog(n)],
            [TEXTS.settingsPrivacy, () => showPrivacyDialog(n)],
        ];
        const linkW = 184;
        const linkH = 46;
        links.forEach(([text, cb], i) => {
            const b = spriteButton(n, linkW, linkH, text, cb, {
                fontSize: 19,
                variant: 'ghost',
                textColor: THEME.inkSoft,
            });
            b.node.setPosition((i - 1) * (linkW + 16), -492, 0);
        });

        this.refresh();
    }

    onResume() {
        this.refresh();
    }

    private refresh() {
        this.bar.refresh();
        const save = Game.save;
        const realmIndex = save.realmIndex;
        this.realmName.string = save.profile.name
            ? `${save.profile.name} · 【${REALMS[realmIndex].name}】`
            : `【${REALMS[realmIndex].name}】`;
        // M11：立绘按性别切换（女修用 _f 系列，资源未随包时回退男修立绘）
        if (realmIndex !== this.shownRealm || save.profile.gender !== this.shownGender) {
            this.shownRealm = realmIndex;
            this.shownGender = save.profile.gender;
            const holder = this.stage.getChildByName('char')!;
            holder.destroyAllChildren();
            const female = save.profile.gender === 'f';
            const suffix = realmIndex < 10 ? `0${realmIndex}` : realmIndex;
            if (!female && ANIMATED_REALMS.has(realmIndex)) {
                spriteAnimation(holder, animFrames('char_idle', IDLE_FRAMES), 340, 340, IDLE_FPS);
            } else {
                image(holder, `art/characters/char_realm_${suffix}${female ? '_f' : ''}/spriteFrame`, 340, 340,
                    female ? { fallbackPath: `art/characters/char_realm_${suffix}/spriteFrame` } : {});
            }
        }
        const stats = Game.combat.deriveStats(save);
        this.statLabel.string = `${TEXTS.statAtk} ${stats.atk} · ${TEXTS.statDef} ${stats.def} · ${TEXTS.statPower} ${stats.power}`;

        const can = Game.realm.canBreakthrough();
        const next = Game.realm.next;
        this.breakBtn.setEnabled(can);
        this.breakBtn.setText(can ? `冲击境界 · ${next!.name}` : '机缘未满 · 持续修行');
        this.giftBtn.node.active = !Game.save.daily.dailyGiftUsed;

        // M8 红点：修行 = 有可领的活跃度宝箱；历练 = 已归来待抉择
        const chestClaimable = ACTIVITY_CHESTS.some((c) => Game.quests.canClaimChest(Game.save, c.at));
        this.questDot.active = chestClaimable;
        const expState = Game.expedition.stateOf(Game.save, Date.now());
        this.expeditionDot.active = expState === 'complete';
        this.ludaoDot.active = Game.ach.claimableCount(Game.save) > 0;
    }

    /** 红点小圆钮 */
    private makeDot(parent: Node, x: number, y: number): Node {
        const dot = uinode('dot', parent, 18, 18);
        dot.setPosition(x + 24, y + 24, 0);
        const g = dot.addComponent(Graphics);
        g.fillColor = THEME.danger;
        g.circle(0, 0, 9);
        g.fill();
        g.strokeColor = faded(THEME.paper, 230);
        g.lineWidth = 2;
        g.circle(0, 0, 9);
        g.stroke();
        dot.active = false;
        return dot;
    }

    private enterRain() {
        if (!Game.realm.canBreakthrough()) {
            toast(this.node, '机缘不足，先开宝盒积累机缘吧');
            return;
        }
        Game.stack.push(new RainScene());
    }

    private dailyGift() {
        // 前置复核：与 ShopScene 同源逻辑，发放前以存档实时值为准，绝不二次发放
        if (Game.save.daily.dailyGiftUsed) {
            toast(this.node, '今日仙缘已领取，明天再来');
            return;
        }
        Ads.show(AD_PLACES.dailyGift.place, this.node, {
            onSuccess: () => {
                Game.save.daily.dailyGiftUsed = true;
                Game.eco.addLingshi(50, false);
                try {
                    const r: BoxResult = Game.box.open('fansu');
                    Game.persist();
                    Game.stack.push(new BoxScene(r));
                } catch (e) {
                    // 开箱失败：回滚每日标记并发提示，绝不静默无反应
                    Game.save.daily.dailyGiftUsed = false;
                    Game.persist();
                    console.error('[fanren] dailyGift open failed', e);
                    toast(this.node, '领取异常，今日次数已退还，请重试');
                }
            },
            onSkip: () => {
                // 广告未看完（含广告位未配置）：明确反馈，避免"点了没反应"
                toast(this.node, '广告未看完，本次未获得奖励');
            },
        });
    }
}
