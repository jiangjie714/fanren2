import { Graphics, Label, Layers, Node, Tween, UIOpacity, tween, Vec3 } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { SaveStore } from '../infra/SaveStore';
import { claimDailyGift } from '../infra/dailyGift';
import { REALMS } from '../core/config/realms';
import { TEXTS } from '../core/config/texts';
import { statusBar } from '../ui/StatusBar';
import {
    ButtonHandle,
    DESIGN_H,
    DESIGN_W,
    ProgressBarHandle,
    THEME,
    animDir,
    animFrames,
    faded,
    fadeIn,
    iconButton,
    image,
    label,
    pageBackground,
    progressBar,
    spriteAnimation,
    spriteButton,
    spritePanel,
    toast,
    uinode,
    makeRedDot,
} from '../ui/ThemeLib';
import { BoxScene } from './BoxScene';
import { CollectionScene } from './CollectionScene';
import { TrailScene } from './TrailScene';
import { LudaoScene } from './LudaoScene';
import { QuestScene } from './QuestScene';
import { RainScene } from './RainScene';
import { SettingsScene } from './SettingsScene';
import { ShopScene } from './ShopScene';
import { PlayerScene } from './PlayerScene';
import { WeaponScene } from './WeaponScene';
import { AlchemyScene } from './AlchemyScene';
import { FortuneScene } from './FortuneScene';
import { ACTIVITY_CHESTS } from '../core/config/quests';

/**
 * 全境界逐帧动画化（2026-10 第三批）：境界 0 男女各一套 idle，境界 1~5
 * 每阶一套 idle（char_idle_r01..r05）。帧目录未随包时 spriteAnimation
 * 立即回调 onFinished → 回退静态立绘，不会闪空白。
 */
/** 待机动画帧数（2x3 网格切出 6 帧）与播放速率。4fps ≈ 1.5s 一个呼吸循环。 */
const IDLE_FRAMES = 6;
const IDLE_FPS = 4;
/** 渡劫蜕变动画（3x3 网格 9 帧），8fps ≈ 1.1s 一次蜕变。 */
const BREAK_FRAMES = 9;
const BREAK_FPS = 8;

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
    private trailBtn!: ButtonHandle;
    private questDot!: Node;
    private ludaoBtn!: ButtonHandle;
    private ludaoDot!: Node;
    private weaponBtn!: ButtonHandle;
    private realmName!: Label;
    private statLabel!: Label;
    private collectionLabel!: Label;
    private collectionBar!: ProgressBarHandle;
    private stage!: Node;
    private charNode!: Node;
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
        // M11b：点按角色立绘 → 个人属性页（道体：属性/法器/福禄）
        this.stage.on(Node.EventType.TOUCH_END, () => Game.stack.push(new PlayerScene()));

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
        this.charNode = charNode;
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
        // M12：上移 12px —— 主 CTA 为五入口环形让位后，避免标题贴住按钮顶缘
        label(n, '凡人开仙缘', 46, {
            bold: true,
            color: THEME.goldLight,
            shadow: true,
            shadowColor: THEME.shadow,
        }).setPosition(0, 12, 0);

        // 主 CTA：全页唯一的金色实底按钮，放大一档确立视觉锚点。
        // M12：从 -85 上移到 -68 给下方五入口环形腾位（环形上排钮顶缘 -236，
        // 与 CTA 下缘 -119 间隙 117；再往上会贴住 y=0 的标题「凡人开仙缘」）。
        this.breakBtn = spriteButton(n, 500, 102, '冲击境界', () => this.enterRain(), {
            fontSize: 32,
            variant: 'primary',
        });
        this.breakBtn.node.setPosition(0, -68, 0);

        // ── M12 五入口环形（梅花布局）：四钮围环 + 中央圆形仙府商店 ──
        // 旧版 2×2 表格四入口（含设置）改为：设置独立成左上角齿轮圆钮，
        // 炼丹淬体/福禄炼制为 M13 新功能入口。
        const ringEntries: Array<[string, string, number, number, number, () => void]> = [
            // [名称, 图标, x, y, 圆盘直径, 回调]
            ['仙缘宝盒', 'box', -130, -188, 96, () => Game.stack.push(new BoxScene())],
            ['灵根图鉴', 'collection', 130, -188, 96, () => Game.stack.push(new CollectionScene())],
            ['炼丹淬体', 'alchemy', -130, -352, 96, () => Game.stack.push(new AlchemyScene())],
            ['福禄炼制', 'fortune', 130, -352, 96, () => Game.stack.push(new FortuneScene())],
            ['仙府商店', 'shop', 0, -268, 124, () => Game.stack.push(new ShopScene())],
        ];
        ringEntries.forEach(([title, icon, x, y, size, cb]) => {
            iconButton(n, `art/ui/icons/icon_${icon}/spriteFrame`, cb, size, size).node.setPosition(x, y, 0);
            // 圆盘钮下方的名称标签：压在高饱和插画上必须描边（与右侧 rail 同规）
            label(n, title, 19, {
                bold: true,
                color: THEME.paper,
                outline: faded(THEME.void, 220),
                outlineWidth: 3,
            }).setPosition(x, y - size / 2 - 18, 0);
        });

        // 设置：左上角齿轮圆钮（与右侧功能 rail 对称位）
        iconButton(n, 'art/ui/icons/icon_settings/spriteFrame', () => Game.stack.push(new SettingsScene()), 72, 72)
            .node.setPosition(-286, 370, 0);

        this.giftBtn = spriteButton(n, 660, 78, '', () => claimDailyGift(this.node), {
            fontSize: 23,
            variant: 'secondary',
            textColor: THEME.goldLight,
        });
        this.giftBtn.node.setPosition(0, -482, 0);
        image(this.giftBtn.node, 'art/ui/icons/icon_ad/spriteFrame', 50, 50).setPosition(-170, 0, 0);
        label(this.giftBtn.node, `${TEXTS.dailyGiftBtn} · 免费凡俗宝盒`, 23, {
            bold: true,
            color: THEME.goldLight,
        }).setPosition(30, 0, 0);

        // M8 日常循环入口：修行 / 历练（右侧对齐圆钮 + 红点）
        // 图标下沿 = y - 36，标签放到 -52 留 16px 间隙（旧值 -46 时标签顶着图标底缘）；
        // 标签压在高饱和插画上，必须给描边，否则 18px 白字在亮部直接糊掉。
        // M12：x 可传，左上角设置齿轮钮复用同款标签样式。
        const railLabel = (text: string, y: number, x = 286) => label(n, text, 18, {
            bold: true,
            color: THEME.paper,
            outline: faded(THEME.void, 220),
            outlineWidth: 3,
        }).setPosition(x, y, 0);
        railLabel('设置', 318, -286);
        this.questBtn = iconButton(n, 'art/ui/icons/icon_quest/spriteFrame', () => Game.stack.push(new QuestScene()), 72, 72);
        this.questBtn.node.setPosition(286, 370, 0);
        railLabel('修行', 318);
        this.questDot = makeRedDot(n, 310, 394);

        this.trailBtn = iconButton(n, 'art/ui/icons/icon_expedition/spriteFrame', () => Game.stack.push(new TrailScene()), 72, 72);
        this.trailBtn.node.setPosition(286, 240, 0);
        railLabel('妖径', 188);

        // M9a 论道入口：排行（降级版）/ 论武 / 幻境 / 成就
        this.ludaoBtn = iconButton(n, 'art/ui/icons/icon_ludao/spriteFrame', () => Game.stack.push(new LudaoScene()), 72, 72);
        this.ludaoBtn.node.setPosition(286, 110, 0);
        railLabel('论道', 58);
        this.ludaoDot = makeRedDot(n, 310, 134);

        // M11 法器阁入口：锻体 + 六档法器
        this.weaponBtn = iconButton(n, 'art/ui/icons/icon_weapon/spriteFrame', () => Game.stack.push(new WeaponScene()), 72, 72);
        this.weaponBtn.node.setPosition(286, -20, 0);
        railLabel('法器', -70);

        // A11 图鉴进度面板：左下角信息卡，与右侧「法器」同高对称。
        // 左侧 y=240/110 保持留白——立绘舞台与五入口环形之间的呼吸区，不填满。
        const colCard = spriteButton(n, 130, 96, '', () => Game.stack.push(new CollectionScene()), { variant: 'secondary' });
        colCard.node.setPosition(-286, -20, 0);
        label(colCard.node, '灵根图鉴', 17, { bold: true, color: THEME.goldLight }).setPosition(0, 28, 0);
        this.collectionLabel = label(colCard.node, '', 22, { bold: true, color: THEME.paper }).getComponent(Label)!;
        this.collectionLabel.node.setPosition(0, -2, 0);
        this.collectionBar = progressBar(colCard.node, 110, 16);
        this.collectionBar.node.setPosition(0, -30, 0);

        this.refresh();
    }

    onResume() {
        this.refresh();
    }

    onExit() {
        // P2-3：停掉主页立绘的 repeatForever 呼吸 tween，避免离屏后仍在每帧调度
        if (this.charNode) Tween.stopAllByTarget(this.charNode);
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
            const upgraded = this.shownRealm >= 0 && realmIndex > this.shownRealm;
            const genderChanged = save.profile.gender !== this.shownGender;
            this.shownRealm = realmIndex;
            this.shownGender = save.profile.gender;
            const holder = this.stage.getChildByName('char')!;
            holder.destroyAllChildren();
            const female = save.profile.gender === 'f';
            const suffix: string = realmIndex < 10 ? `0${realmIndex}` : String(realmIndex);
            if (upgraded && !genderChanged) {
                // 突破归来：先播渡劫蜕变动画，落定后接日常待机/立绘。
                // 蜕变帧目前只有男主一套——女修升级直接切立绘，不硬播男主体。
                this.playBreakthrough(holder, female, suffix);
            } else {
                this.showIdleOrPortrait(holder, realmIndex, female, suffix);
            }
        }
        const stats = Game.combat.deriveStats(save);
        this.statLabel.string = `${TEXTS.statAtk} ${stats.atk} · ${TEXTS.statDef} ${stats.def} · ${TEXTS.statPower} ${stats.power}`;

        const can = Game.realm.canBreakthrough();
        const next = Game.realm.next;
        this.breakBtn.setEnabled(can);
        this.breakBtn.setText(can ? `冲击境界 · ${next!.name}` : '机缘未满 · 持续修行');
        this.giftBtn.node.active = !Game.save.daily.dailyGiftUsed;

        // M8 红点：修行 = 有可领的活跃度宝箱
        const chestClaimable = ACTIVITY_CHESTS.some((c) => Game.quests.canClaimChest(Game.save, c.at));
        this.questDot.active = chestClaimable;
        this.ludaoDot.active = Game.ach.claimableCount(Game.save) > 0;

        // A11：图鉴收集进度。合成灵根后从图鉴页返回会走 onResume → 这里刷新。
        const col = Game.col.progress(Game.save);
        this.collectionLabel.string = `${col.unlocked}/${col.total}`;
        this.collectionBar.set(col.total ? col.unlocked / col.total : 0);
    }

    /** 境界立绘的日常形态：播该境界待机动画，帧缺失时回退静态立绘（女修回退男修图） */
    private showIdleOrPortrait(holder: Node, realmIndex: number, female: boolean, suffix: string) {
        spriteAnimation(holder, animFrames(animDir('char_idle', realmIndex, female), IDLE_FRAMES), 340, 340, IDLE_FPS,
            true,
            () => {
                // 帧全缺（目录未随包）→ 静态立绘兜底，避免空白主角
                if (holder.isValid) {
                    image(holder, `art/characters/char_realm_${suffix}${female ? '_f' : ''}/spriteFrame`, 340, 340,
                        female ? { fallbackPath: `art/characters/char_realm_${suffix}/spriteFrame` } : {});
                }
            });
    }

    /** 突破归来演出：播新境界的渡劫蜕变动画（break 9 帧 one-shot）播完接回日常形态；帧缺失时直接回退 */
    private playBreakthrough(holder: Node, female: boolean, suffix: string) {
        spriteAnimation(holder, animFrames(animDir('char_break', Game.save.realmIndex, female), BREAK_FRAMES, 'break'),
            340, 340, BREAK_FPS, false,
            () => {
                if (holder.isValid) this.showIdleOrPortrait(holder, Game.save.realmIndex, female, suffix);
            });
    }

    private enterRain() {
        if (!Game.realm.canBreakthrough()) {
            toast(this.node, '机缘不足，先开宝盒积累机缘吧');
            return;
        }
        Game.stack.push(new RainScene());
    }
}
