import { Graphics, Label, Layers, Node, Tween, UIOpacity, tween, Vec3 } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { Analytics } from '../infra/Analytics';
import { SaveStore } from '../infra/SaveStore';
import { claimDailyGift } from '../infra/dailyGift';
import { Ads } from '../infra/Ads';
import { enterIllusion } from '../infra/enterIllusion';
import { REALMS } from '../core/config/realms';
import { themeOf } from '../core/config/trial';
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
    labelL,
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
import { TowerScene } from './TowerScene';
import { TianjieScene } from './TianjieScene';
import { formatCompact } from '../core/bignum';
import { LudaoScene } from './LudaoScene';
import { QuestScene } from './QuestScene';
import { RainScene } from './RainScene';
import { SettingsScene } from './SettingsScene';
import { ShopScene } from './ShopScene';
import { PlayerScene } from './PlayerScene';
import { WeaponScene } from './WeaponScene';
import { PathScene } from './PathScene';
import { CheckinScene } from './CheckinScene';
import { OfflineScene } from './OfflineScene';
import { OFFLINE_ABSENCE_CAP } from '../core/offline';
import { AudioMgr } from '../infra/AudioMgr';
import { showDialog } from '../ui/dialog';
import { AlchemyScene } from './AlchemyScene';
import { FortuneScene } from './FortuneScene';
import { ACTIVITY_CHESTS } from '../core/config/quests';
import type { GuideAnchor } from '../core/guide';

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
    /** 引导条副行（显示「为什么推荐这件事」）；主文案走 breakBtn.setText */
    private guideSubLabel!: Label;
    /** 引导条当前状态定格的动作（refreshGuide 写入，onGuideTap 读取） */
    private guideAction: 'break' | 'trial' | 'box' | 'gift' = 'break';
    private giftBtn!: ButtonHandle;
    /** M36 优化：昨日天劫提示条（今日未打且有昨日战报时出现在 gift 行上方） */
    private tianjieNudge: Node | null = null;
    private questBtn!: ButtonHandle;
    private trailBtn!: ButtonHandle;
    private towerBtn!: ButtonHandle;
    /** 剑冢横幅主标 / 天劫切换后需要跟着改文案，故保留引用 */
    private towerTitleLabel!: Label;
    /** 横幅当前路由用途（M36：练气前显示「每日天劫」，之后显示「剑冢试炼」） */
    private towerAction: 'tower' | 'tianjie' = 'tower';
    private towerSubLabel!: Label;
    private questDot!: Node;
    /** M26 签到入口红点：今日尚未领取时点亮 */
    private checkinDot!: Node;
    private ludaoBtn!: ButtonHandle;
    private ludaoDot!: Node;
    private weaponBtn!: ButtonHandle;
    private realmName!: Label;
    private statLabel!: Label;
    private collectionBtn!: ButtonHandle;
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
        // 60 秒漏斗起点：一次安装只发一次 first_home（老玩家也会补发一次，用于历史基线）
        Analytics.trackOnce('first_home', 'first_home', {
            realm_index: Game.save.realmIndex,
            total_opens: Game.save.stats.opens,
        });
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
        // ── #49 首日体验 A1：这条带改为「今日引导条」（状态驱动语境 CTA）──
        // 位置与尺寸**完全不变**（-68 / 500×102），10 个既有入口（环形 5 + 右栏 4 + 设置）
        // 一个不动 → tools/ui-shots.mjs 的截图基线不受影响。变化只在「文案 + 去向」：
        // 优先级（高→低）①机缘够→渡劫 ②秘境体力有→秘境 ③灵石≥50→开箱 ④都不够→领机遇。
        this.breakBtn = spriteButton(n, 500, 102, '冲击境界', () => this.onGuideTap(), {
            fontSize: 32,
            variant: 'primary',
        });
        this.breakBtn.node.setPosition(0, -68, 0);
        // 两行版式：主文案上移 16、副行下移 24（原单行 CTA 的包围盒不变）
        this.breakBtn.labelNode.setPosition(0, 16, 0);
        this.breakBtn.labelNode.getComponent(Label)!.lineHeight = 44;
        this.guideSubLabel = label(this.breakBtn.node, '', 18, {
            color: faded(THEME.void, 200),
            width: 460,
        }).getComponent(Label)!;
        this.guideSubLabel.node.setPosition(0, -24, 0);

        // ── M22 剑冢试炼横幅入口（方案 C）：主 CTA 下方宽横幅，Secondary 权重 ──
        // 全页唯一的宽横幅，填的正是当前最空的那条带子；CTA 下缘（-119）留 16px 间隙。
        this.towerBtn = spriteButton(n, 660, 88, '', () => {
            // M36：练气前横幅是「每日天劫」入口（首日 60 秒后第一个可玩内容），练气后回到剑冢
            if (this.towerAction === 'tianjie') Game.stack.push(new TianjieScene());
            else Game.stack.push(new TowerScene());
        }, {
            fontSize: 24,
            variant: 'secondary',
            textColor: THEME.goldLight,
        });
        this.towerBtn.node.setPosition(0, -179, 0);
        image(this.towerBtn.node, 'art/ui/icons/icon_tower/spriteFrame', 56, 56).setPosition(-278, 0, 0);
        // 主标左移、副行右移，拉开 30px 净间隙。
        // 旧值（主标 -96 居中 / 副行左缘 -82）实测主标右缘 -40 与副行左缘撞车 42px，
        // 截图里「剑冢试炼」被「最高第 N 层」压住 —— 横幅内左右两栏必须按包围盒分栏。
        this.towerTitleLabel = label(this.towerBtn.node, TEXTS.towerTitle, 28, {
            bold: true,
            color: THEME.goldLight,
        }).getComponent(Label)!;
        this.towerTitleLabel.node.setPosition(-170, 0, 0);
        this.towerSubLabel = labelL(this.towerBtn.node, '', 18, { color: THEME.paper, width: 360 }).getComponent(Label);
        this.towerSubLabel!.node.setPosition(-84, 0, 0);

        // ── M12 五入口环形（梅花布局）：四钮围环 + 中央圆形仙府商店 ──
        // 旧版 2×2 表格四入口（含设置）改为：设置独立成左上角齿轮圆钮，
        // 炼丹淬体/福禄炼制为 M13 新功能入口。
        // M22：为剑冢横幅让位，整环下移 99px（spec §5.1，五条水平间隙均 ≥12px）。
        const ringEntries: Array<[string, string, number, number, number, () => void]> = [
            // [名称, 图标, x, y, 圆盘直径, 回调]
            ['仙缘宝盒', 'box', -130, -287, 96, () => Game.stack.push(new BoxScene())],
            ['灵根图鉴', 'collection', 130, -287, 96, () => Game.stack.push(new CollectionScene())],
            ['炼丹淬体', 'alchemy', -130, -451, 96, () => Game.stack.push(new AlchemyScene())],
            ['福禄炼制', 'fortune', 130, -451, 96, () => Game.stack.push(new FortuneScene())],
            ['仙府商店', 'shop', 0, -367, 124, () => Game.stack.push(new ShopScene())],
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
        // M22：随环形一并下移（spec §5.1 给 -572，实测标签底缘 -527 与礼包顶缘间隙仅 6px，
        // 不满足「≥12px」硬约束，故再下移 10px 到 -582：间隙 16px、底边留白 19px）
        this.giftBtn.node.setPosition(0, -582, 0);
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
        this.trailBtn.node.setPosition(286, 266, 0);
        railLabel('妖径', 214);

        // M9a 论道入口：排行（降级版）/ 论武 / 幻境 / 成就
        this.ludaoBtn = iconButton(n, 'art/ui/icons/icon_ludao/spriteFrame', () => Game.stack.push(new LudaoScene()), 72, 72);
        this.ludaoBtn.node.setPosition(286, 162, 0);
        railLabel('论道', 110);
        this.ludaoDot = makeRedDot(n, 310, 186);

        // M11 法器阁入口：锻体 + 六档法器
        this.weaponBtn = iconButton(n, 'art/ui/icons/icon_weapon/spriteFrame', () => Game.stack.push(new WeaponScene()), 72, 72);
        this.weaponBtn.node.setPosition(286, 58, 0);
        railLabel('法器', 6);

        // M23 修仙之路入口：五线进度总览（境界/妖径/剑冢/图鉴/成就）
        // rail 从 4 钮（间距 130）压缩为 5 钮（间距 104）：规格首选的法器下方 -150
        // 被 M22 剑冢横幅（y=-179，660 宽）堵死，压缩间距是不动 CTA/横幅/环形的唯一解。
        iconButton(n, 'art/ui/icons/icon_rank/spriteFrame', () => Game.stack.push(new PathScene()), 72, 72)
            .node.setPosition(286, -46, 0);
        railLabel('仙路', -98);

        // A11 图鉴入口：改为与右侧 rail（法器 / 论道 / 妖径 / 修行）**完全同构**的圆钮。
        //
        // 旧版是 130×96 信息卡挂在 (-267, -20)，右缘 -202 切进主 CTA（左缘 -250）48px —— 截图里
        // 金底按钮左端被暗卡压掉一角。几何上无解：左侧 rail 位在 332 安全线与 CTA 左缘之间只有
        // 82px（-332 → -250），装不下 130 宽的卡；把 CTA 收窄到容得下 130 会砍掉 24% 宽，毁掉
        // 「全页唯一金色实底锚点」的设计意图（截图基线也锁死在 -68 / 500×102）。改为 rail 同构：
        // 视觉 72@-286 → [-322,-250]，与 CTA **恰好相切**，既对称又不叠压。进度信息移到圆钮下方
        // 的标签区，与右侧 rail 的「法器 / 论道 / 妖径 / 修行」同规。
        // M26 连续登录签到入口：插在左侧 rail 的空位（设置 370 与图鉴 58 之间），
        // 左 rail 只有 2 个钮、上下各留 >100px，不动任何既有坐标。
        // 图标暂用 icon_streak（「连续」语义最贴切）占位，待美术补 icon_checkin 后替换。
        iconButton(n, 'art/ui/icons/icon_streak/spriteFrame', () => Game.stack.push(new CheckinScene()), 72, 72)
            .node.setPosition(-286, 266, 0);
        railLabel('签到', 214, -286);
        this.checkinDot = makeRedDot(n, -262, 290);

        // M29 离线吐纳入口：插在左侧 rail 的空位（签到 266 与图鉴 58 之间，间距 104
        // 与右侧 rail 压缩后的节律一致），不动任何既有坐标。图标用 icon_timer（语义
        // 最贴「挂机计时」）占位，待美术补 icon_offline 后替换（同 M26 签到钮口径）。
        iconButton(n, 'art/ui/icons/icon_timer/spriteFrame', () => Game.stack.push(new OfflineScene()), 72, 72)
            .node.setPosition(-286, 162, 0);
        railLabel(TEXTS.offlineRail, 110, -286);

        this.collectionBtn = iconButton(n, 'art/ui/icons/icon_collection/spriteFrame', () => Game.stack.push(new CollectionScene()), 72, 72);
        this.collectionBtn.node.setPosition(-286, 58, 0);
        railLabel('图鉴', 6, -286);
        // 计数与进度：两行小字挂在圆钮正下方，宽度收在安全线内（-332 → -250 = 82px 可用）。
        // 进度条中心 -50：底缘 -55 与剑冢横幅顶缘 -135 留 80px 间隙
        // （M23 rail 压缩后随法器对称上移到 58）。
        this.collectionLabel = label(n, '', 18, {
            bold: true,
            color: THEME.paper,
            outline: faded(THEME.void, 220),
            outlineWidth: 3,
        }).getComponent(Label)!;
        this.collectionLabel.node.setPosition(-286, -28, 0);
        this.collectionBar = progressBar(n, 72, 10);
        this.collectionBar.node.setPosition(-286, -50, 0);

        this.refresh();
        // M29 离线吐纳：归来演出（弹窗由 Game 结算的结果驱动，进门/回前台各消费一次）
        this.maybeShowOfflineDialog();
    }

    onResume() {
        this.refresh();
        this.maybeShowOfflineDialog();
    }

    /**
     * M29 归来弹窗：把「离线期间吐纳所得」摊给玩家看。
     *
     * 注意结算**不在这里**做 —— `Game.settleOffline()` 在启动 / 回到前台的那一刻
     * 已经落袋（见 Game.offlineResult 注释：放首页会让从二级页离开的那次收益被
     * 随后的在线心跳吃掉）。这里只负责一次性消费并演出。
     */
    private maybeShowOfflineDialog() {
        const got = Game.offlineResult;
        if (!got) return;
        Game.offlineResult = null;
        AudioMgr.play('success');
        const h = Math.floor(got.minutes / 60);
        const m = got.minutes % 60;
        const lines: Array<string | { text: string; color?: number }> = [
            TEXTS.offlineDuration(h, m),
            { text: TEXTS.offlineGain(got.xiuwei, got.lingshi), color: 1 },
        ];
        if (got.minutes >= OFFLINE_ABSENCE_CAP) lines.push(TEXTS.offlineCappedHint);
        showDialog(this.node, {
            title: TEXTS.offlineDialogTitle,
            lines,
            width: 620,
            buttons: [{ text: TEXTS.offlineDialogBtn, primary: true }],
        });
    }

    /**
     * M27 新手引导锚点（`GuideHost` 协议）：告诉引导层「此刻该指哪儿」。
     *
     * 坐标写在**本页构建代码旁边**而非引导层里硬编码一张坐标表 —— 页面改版式时
     * 这里会跟着改，不会出现「引导指向已经搬走的按钮」。矩形比视觉尺寸外扩 8–14px，
     * 保证洞边缘也点得到（差 1px 点不中是最常见的挖洞坑）。
     */
    guideAnchor(): GuideAnchor {
        return Game.realm.canBreakthrough()
            // 主 CTA「冲击境界」（视觉 500×102 @ (0,-68)）
            ? { x: 0, y: -68, w: 508, h: 110 }
            // 环形「仙缘宝盒」钮（视觉 96 @ (-130,-287)）
            : { x: -130, y: -287, w: 110, h: 110 };
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

        // M22：剑冢横幅副行（最高层 + 塔内剑气；塔内数值不外溢主页 atk/def/power）
        // M36：练气前（realmIndex 0）横幅改挂「每日天劫」——首日 60 秒走完后
        // 玩家第一个能每天玩的内容；练气后恢复剑冢，天劫交给论道页排行 tab 的
        // 常驻入口条承接（R1 修复 2026-10-23——此前本注释声称有入口，实际没有）。
        if (save.realmIndex === 0) {
            this.towerAction = 'tianjie';
            const tv = Game.tianjie.view(save);
            this.towerTitleLabel.string = TEXTS.tianjieTitle;
            this.towerSubLabel.string = tv.attemptsLeft > 0
                ? TEXTS.tianjieAttempts(tv.attemptsLeft, 3)
                : TEXTS.tianjieAttemptsNone;
        } else {
            this.towerAction = 'tower';
            this.towerTitleLabel.string = TEXTS.towerTitle;
            this.towerSubLabel.string = TEXTS.towerBannerSub(save.tower.best, formatCompact(Game.tower.atk(save)));
        }

        this.refreshGuide();
        this.giftBtn.node.active = !Game.save.daily.dailyGiftUsed && Ads.isConfigured('dailyGift');
        this.refreshTianjieNudge();

        // M8 红点：修行 = 有可领的活跃度宝箱
        const chestClaimable = ACTIVITY_CHESTS.some((c) => Game.quests.canClaimChest(Game.save, c.at));
        this.questDot.active = chestClaimable;
        this.ludaoDot.active = Game.ach.claimableCount(Game.save) > 0;
        // M26：签到红点 = 今日尚未领取（回前台/领完返回都会走 refresh 刷新）
        this.checkinDot.active = Game.checkin.view(Game.save).canClaim;

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

    /**
     * 今日引导条（#49 首日体验 §4.A A1）：永远把「当前最该做的事」顶到脸上。
     *
     * 优先级（高→低）：①机缘够→渡劫（最高情绪）②秘境体力有→秘境（15 秒短局）
     * ③灵石 ≥50→开箱（攒机缘）④都不够→领机遇（复用每日仙缘）。
     * 边界明确：机缘够且体力也满时**机缘优先**（spec §4.A A1 / R5，不留给运行时判定模糊）。
     *
     * 与存档同源计算，`refresh()` / `onResume()` 都会重算（后者经 refresh）。
     */
    private refreshGuide() {
        const save = Game.save;
        const next = Game.realm.next;
        const need = next ? next.needJiyuan : 0;
        const jiyuan = Game.eco.jiyuan;
        if (Game.realm.canBreakthrough()) {
            // ① 渡劫；首战走「天道庇佑」文案（#49 A3）
            const first = Game.realm.firstBreakthroughProtect;
            this.guideAction = 'break';
            this.breakBtn.setText(first ? TEXTS.firstBattleBanner : TEXTS.homeGuideBreak(next!.name));
            this.guideSubLabel.string = first
                ? TEXTS.homeGuideFirstSub(jiyuan, need)
                : TEXTS.homeGuideBreakSub(jiyuan, need);
        } else if (Game.trial.canStart(save)) {
            // ② 秘境：首日唯一「立刻能玩」的内容
            this.guideAction = 'trial';
            this.breakBtn.setText(TEXTS.homeGuideTrial);
            this.guideSubLabel.string = TEXTS.homeGuideTrialSub(save.trial.stamina, themeOf().name);
        } else if (save.lingshi >= 50) {
            // ③ 开箱：机缘的主要来源
            this.guideAction = 'box';
            this.breakBtn.setText(TEXTS.homeGuideBox);
            this.guideSubLabel.string = TEXTS.homeGuideBoxSub(save.lingshi, jiyuan, need);
        } else {
            // ④ 领机遇：灵石不足，看广告得 300
            this.guideAction = 'gift';
            this.breakBtn.setText(TEXTS.homeGuideGift);
            this.guideSubLabel.string = TEXTS.homeGuideGiftSub;
        }
        // 引导条恒可点（四态各有去向），与旧版「机缘未满则置灰」不同
        this.breakBtn.setEnabled(true);
    }

    /**
     * 昨日天劫提示条（M36 优化，2026-10-22）：今天是「未打 + 有昨日战报」时，
     * 在每日仙缘行上方压一条窄提示「昨日 39 分 · 今日已换题」。
     *
     * 为什么挂在首页而不是每日天劫入口页：入口页只有已经想去的人才会进；
     * 提示条负责把「昨天打过的人」拉回来——这是天劫参与率（目标 ≥50%）漏得最多的一段。
     * 文案给的是「今日已换题」而非分数排名，避免变成焦虑型提醒（合规/体验都更稳）。
     */
    private refreshTianjieNudge() {
        const show = Game.tianjie.shouldNudge(Game.save);
        if (!show) {
            if (this.tianjieNudge) {
                this.tianjieNudge.destroy();
                this.tianjieNudge = null;
            }
            return;
        }
        if (this.tianjieNudge) return; // 已建且仍需要：不重复建（位置上不依赖任何数值）
        const last = Game.tianjie.lastReport();
        const bar = spriteButton(this.node, 660, 64, '', () => Game.stack.push(new TianjieScene()), {
            fontSize: 21,
            variant: 'secondary',
            textColor: THEME.goldLight,
        });
        // 每日仙缘行在 -582；提示条贴在它上方，与剑冢横幅（-179）之间不冲突
        bar.node.setPosition(0, -498, 0);
        const text = last ? `昨日天劫 ${last.score} 分 · 今日已换题，再来一局？` : '今日天劫已换题';
        labelL(bar.node, text, 21, { color: THEME.goldLight, width: 600, shrink: true }).setPosition(-300, 0, 0);
        this.tianjieNudge = bar.node;
    }

    /** 引导条点击：按 refreshGuide 定格的状态路由 */
    private onGuideTap() {
        switch (this.guideAction) {
            case 'break': this.enterRain(); break;
            case 'trial': enterIllusion(this.node); break;
            case 'box': Game.stack.push(new BoxScene()); break;
            default: claimDailyGift(this.node); break;
        }
    }
}
