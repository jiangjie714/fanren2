import { Color, Graphics, ImageAsset, Label, Layers, Node, Sprite, SpriteFrame, Texture2D } from 'cc';
import { RANK_KEYS, RankKey } from '../core/systems/SocialRank';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { Ads } from '../infra/Ads';
import { AudioMgr } from '../infra/AudioMgr';
import { ACHIEVEMENTS, AchievementConfig } from '../core/config/achievements';
import { REALMS } from '../core/config/realms';
import { ILLUSION } from '../core/config/illusion';
import { TEXTS } from '../core/config/texts';
import { showDialog } from '../ui/dialog';
import {
    ButtonHandle,
    DESIGN_H,
    DESIGN_W,
    THEME,
    faded,
    fadeIn,
    image,
    label,
    labelL,
    pageBackground,
    pageHeader,
    progressBar,
    spriteButton,
    spritePanel,
    toast,
    uinode,
} from '../ui/ThemeLib';
import { DouyinSocial } from '../infra/DouyinSocial';
import { RainScene } from './RainScene';
import { PkBattleScene } from './PkBattleScene';
import { PK_DAILY_LIMIT, WEAPONS } from '../core/config/combat';

type LudaoTab = 'rank' | 'illusion' | 'achieve' | 'pk';

/** 虚拟道友目标线（排行降级版）：按境界预设的同侪参考值（docs/项目现状与后续规划.md 三、3.1） */
const PEER_XIUWEI = [300, 1500, 4000, 12000, 30000, 80000];

/** 论道页：排行（降级版）/ 幻境 / 成就 三 tab（M9a；好友榜 M9b 接入开放数据域）。 */
export class LudaoScene implements IScene {
    node: Node;
    private bar = { refresh: () => {} };
    private tab: LudaoTab = 'rank';
    private tabbar: Node | null = null;
    private content: Node | null = null;
    private achieveBtns = new Map<string, ButtonHandle>();
    private illusionBtn: ButtonHandle | null = null;
    // M9b 好友榜视图（开放数据域共享画布 → 动态纹理）
    private odcKey: RankKey = 'realm_value';
    private odcTexture: Texture2D | null = null;
    private odcSpriteFrame: SpriteFrame | null = null;
    private odcPollAcc = 0;
    private odcChips = new Map<RankKey, ButtonHandle>();

    constructor() {
        this.node = new Node('LudaoScene');
        this.node.layer = Layers.Enum.UI_2D;
    }

    onEnter() {
        const n = this.node;
        pageBackground(n, 'art/ui/bg_home/spriteFrame');
        pageHeader(n, TEXTS.ludaoPageTitle, () => Game.stack.pop());
        Game.checkAchievements(); // 兜底：登录时已达标但未扫描的成就（红点/领取态生效）
        this.renderTabbar();
        this.renderTab();
    }

    onResume() {
        Game.checkAchievements();
        this.renderTab();
        this.renderTabbar();
    }

    onExit() {
        // P2-1：释放子域共享画布动态纹理，否则每次进出论道页都泄漏一张 GPU 纹理
        this.releaseOdcTexture();
    }

    /** 销毁子域画布动态纹理与 spriteFrame（幂等） */
    private releaseOdcTexture() {
        this.odcSpriteFrame = null;
        if (this.odcTexture) {
            this.odcTexture.destroy();
            this.odcTexture = null;
        }
    }

    private renderTabbar() {
        this.tabbar?.destroy();
        const n = this.node;
        this.tabbar = uinode('tabbar', n, DESIGN_W, 80);
        const tabs: Array<[LudaoTab, string]> = [
            ['rank', TEXTS.ludaoTabRank],
            ['illusion', TEXTS.ludaoTabIllusion],
            ['pk', '论武'],
            ['achieve', TEXTS.ludaoTabAchieve],
        ];
        tabs.forEach(([id, name], i) => {
            const active = id === this.tab;
            const btn = spriteButton(this.tabbar!, 164, 70, name, () => this.switchTab(id), {
                fontSize: 25,
                variant: active ? 'primary' : 'secondary',
                textColor: active ? THEME.white : THEME.ink,
            });
            btn.node.setPosition((i - 1.5) * 172, DESIGN_H / 2 - 160, 0);
            if (id === 'achieve' && Game.ach.claimableCount(Game.save) > 0) {
                this.makeDot(btn.node);
            }
        });
    }

    private makeDot(parent: Node) {
        const dot = uinode('dot', parent, 18, 18);
        dot.setPosition(78, 26, 0);
        const g = dot.addComponent(Graphics);
        g.fillColor = THEME.cinnabar;
        g.circle(0, 0, 9);
        g.fill();
        g.strokeColor = faded(THEME.paper, 230);
        g.lineWidth = 2;
        g.circle(0, 0, 9);
        g.stroke();
    }

    update(dt: number) {
        if (this.tab !== 'rank' || !this.odcTexture) return;
        this.odcPollAcc += dt;
        if (this.odcPollAcc >= 0.4) {
            this.odcPollAcc = 0;
            this.blitSharedCanvas();
        }
    }

    /** 子域共享画布 → 纹理（平台差异全走 try/catch，失败停在最后一帧） */
    private blitSharedCanvas() {
        const canvas = DouyinSocial.getSharedCanvas();
        if (!canvas || !this.odcTexture) return;
        try {
            (this.odcTexture as any).uploadData(canvas);
        } catch { /* 旧基线不支持 canvas 源，保持静默 */ }
    }

    private switchTab(tab: LudaoTab) {
        if (tab === this.tab) return;
        AudioMgr.play('click');
        this.tab = tab;
        this.renderTabbar();
        this.renderTab();
    }

    private renderTab() {
        this.achieveBtns.clear();
        this.content?.destroy();
        this.releaseOdcTexture(); // 切 tab / 重进时旧纹理已随 view 销毁，这里一并回收
        const n = this.node;
        this.content = uinode('content', n, DESIGN_W, DESIGN_H);
        if (this.tab === 'rank') this.renderRank(this.content);
        else if (this.tab === 'illusion') this.renderIllusion(this.content);
        else if (this.tab === 'pk') this.renderPk(this.content);
        else this.renderAchievements(this.content);
    }

    /** 排行 tab：好友榜可用（抖音开放数据域）→ 子域画布 + 榜键切换；否则三榜降级版 */
    private renderRank(parent: Node) {
        if (DouyinSocial.available()) {
            this.renderFriendRank(parent);
            return;
        }
        this.renderRankFallback(parent);
    }

    private renderFriendRank(parent: Node) {
        const panel = spritePanel(parent, 660, 700, undefined, THEME.tintDeep);
        panel.setPosition(0, 62, 0);
        fadeIn(panel, 14);
        // 榜键切换 chips
        const chipNames: Record<RankKey, string> = {
            realm_value: '境界',
            illusion_week: '幻境',
            tribulation_best: '渡劫',
        };
        RANK_KEYS.forEach((k, i) => {
            const active = k === this.odcKey;
            const chip = spriteButton(panel, 160, 56, chipNames[k], () => this.switchOdcKey(k), {
                fontSize: 22,
                variant: active ? 'primary' : 'secondary',
                textColor: active ? THEME.white : THEME.ink,
            });
            chip.node.setPosition(-200 + i * 200, 306, 0);
            this.odcChips.set(k, chip);
        });
        // 子域画布视图
        const view = uinode('odcView', panel, 660, 640);
        view.setPosition(0, -28, 0);
        const canvas = DouyinSocial.getSharedCanvas();
        if (canvas) {
            try {
                const tex = new Texture2D();
                (tex as any).uploadData(canvas);
                const sf = new SpriteFrame();
                sf.texture = tex;
                const sp = view.addComponent(Sprite);
                sp.sizeMode = Sprite.SizeMode.CUSTOM;
                sp.spriteFrame = sf;
                this.odcTexture = tex;
                this.odcSpriteFrame = sf;
                DouyinSocial.requestRank(this.odcKey);
            } catch {
                label(view, '好友榜视图初始化失败，稍后重试', 22, { color: THEME.inkSoft, width: 600, shrink: true });
            }
        } else {
            label(view, '好友榜加载中…', 22, { color: THEME.inkSoft, width: 600, shrink: true });
        }
        label(parent, '数据来自抖音好友关系链，仅在抖音端展示', 20, {
            color: THEME.inkSoft,
            width: 620,
            shrink: true,
            outline: faded(THEME.void, 220),
            outlineWidth: 2,
        }).setPosition(0, -DESIGN_H / 2 + 130, 0);
    }

    private switchOdcKey(key: RankKey) {
        if (key === this.odcKey) return;
        AudioMgr.play('click');
        this.odcKey = key;
        this.renderTabbar();
        this.renderTab();
        DouyinSocial.requestRank(key);
    }

    /** 降级版：三榜个人值 + 虚拟道友目标线 + 追赶进度条 */
    private renderRankFallback(parent: Node) {
        const save = Game.save;
        const nextRealmXiuwei = PEER_XIUWEI[Math.min(PEER_XIUWEI.length - 1, save.realmIndex + 1)];
        const nextIllusion = ILLUSION.tiers.find((t) => save.illusionWeekBest < t.at);
        const rows: Array<{ name: string; mine: string; goal: string; ratio: number; ratioText: string }> = [
            {
                name: TEXTS.rankRealmName,
                mine: `【${REALMS[save.realmIndex].name}】修为 ${save.xiuwei}`,
                goal: save.realmIndex < REALMS.length - 1
                    ? `${REALMS[save.realmIndex + 1].name}道友 · 修为 ${nextRealmXiuwei}`
                    : '已是化神大圆满',
                ratio: save.realmIndex < REALMS.length - 1 ? Math.min(1, save.xiuwei / nextRealmXiuwei) : 1,
                ratioText: save.realmIndex < REALMS.length - 1
                    ? `追赶 ${Math.round(Math.min(1, save.xiuwei / nextRealmXiuwei) * 100)}%`
                    : '圆满',
            },
            {
                name: TEXTS.rankIllusionName,
                mine: `本周最佳 ${save.illusionWeekBest} 分`,
                goal: this.nextIllusionGoal(save.illusionWeekBest),
                ratio: nextIllusion ? Math.min(1, save.illusionWeekBest / nextIllusion.at) : 1,
                ratioText: nextIllusion ? `追赶 ${Math.round(Math.min(1, save.illusionWeekBest / nextIllusion.at) * 100)}%` : '大圣',
            },
            {
                name: TEXTS.rankTribName,
                mine: `历史最高 ${save.stats.bestTribScore} 分`,
                goal: save.stats.bestTribScore >= 75 ? '已至仙阶 · 再无目标即是目标' : '仙阶道友 · 评分 75',
                ratio: Math.min(1, save.stats.bestTribScore / 75),
                ratioText: `渡劫 ${Math.round(Math.min(1, save.stats.bestTribScore / 75) * 100)}%`,
            },
        ];
        rows.forEach((r, i) => {
            const card = spritePanel(parent, 660, 206, undefined, THEME.tintPanel);
            card.setPosition(0, 336 - i * 232, 0);
            fadeIn(card, 14, i * 0.05);
            // 卡片半宽 330，左内边距 24 -> 各行统一从 -306 起。
            // 旧版 mine/goal 用 align:'left' + width:540 放在 x=-130，文本左边缘算出来是
            // -400 —— 比卡片左缘还往左 70px，整段文字画到了卡片外面（榜卡看着像没对齐）。
            labelL(card, r.name, 27, { bold: true, color: THEME.goldLight, width: 300, shrink: true })
                .setPosition(-306, 70, 0);
            labelL(card, TEXTS.rankYou(r.mine), 24, { bold: true, color: THEME.paper, width: 600, shrink: true })
                .setPosition(-306, 24, 0);
            labelL(card, TEXTS.rankGoal(r.goal), 21, { color: THEME.inkSoft, width: 600, shrink: true })
                .setPosition(-306, -16, 0);
            // 追赶进度：既补足旧版下半卡的空洞，也是比文字更直观的目标差表达。
            const bar = progressBar(card, 612, 26, { fontSize: 18 });
            bar.node.setPosition(0, -66, 0);
            bar.set(r.ratio, r.ratioText);
        });
        label(parent, `${TEXTS.rankEmpty} ｜ 好友榜将在后续版本开放`, 20, {
            color: THEME.inkSoft,
            width: 620,
            shrink: true,
            // 提示行落在插画亮部（云海金光）上，无描边会糊掉
            outline: faded(THEME.void, 220),
            outlineWidth: 2,
        }).setPosition(0, -DESIGN_H / 2 + 130, 0);
    }

    private nextIllusionGoal(best: number): string {
        const next = ILLUSION.tiers.find((t) => best < t.at);
        return next ? `${next.name}道友 · ${next.at} 分` : '已是心魔大圣';
    }

    /** 幻境 tab：状态 + 入口 */
    private renderIllusion(parent: Node) {
        const save = Game.save;
        const card = spritePanel(parent, 660, 300, undefined, THEME.tintCard);
        card.setPosition(0, 250, 0);
        fadeIn(card, 12);
        image(card, 'art/ui/icons/icon_illusion/spriteFrame', 64, 64).setPosition(-258, 100, 0);
        label(card, TEXTS.illusionTitle, 30, { bold: true, color: THEME.goldLight }).setPosition(60, 100, 0);
        label(card, TEXTS.illusionTip, 21, { color: THEME.inkSoft, width: 580, shrink: true }).setPosition(0, 44, 0);
        label(card, `今日最佳 ${save.daily.illusionBest} 分 ｜ 本周最佳 ${save.illusionWeekBest} 分 ｜ 历史最佳 ${save.illusionBestEver} 分`, 23, {
            bold: true, color: THEME.paper, width: 600, shrink: true,
        }).setPosition(0, -14, 0);

        const kind = Game.illusion.startKind(save);
        this.illusionBtn = spriteButton(card, 300, 84, '', () => this.enterIllusion(), {
            fontSize: 25,
            variant: kind === 'ad' ? 'secondary' : 'primary',
            textColor: kind === 'ad' ? THEME.goldLight : THEME.paper,
        });
        this.illusionBtn.node.setPosition(0, -96, 0);
        this.illusionBtn.setText(kind === 'none' ? TEXTS.illusionNone : kind === 'ad' ? TEXTS.illusionEnterAd : TEXTS.illusionEnter);
        if (kind === 'none') this.illusionBtn.setEnabled(false);

        // 段位一览：填补旧版卡片下方的大块留白，同时把「目标分 → 奖励」讲清楚。
        const tierPanel = spritePanel(parent, 660, 340, undefined, THEME.tintPanel);
        tierPanel.setPosition(0, -160, 0);
        fadeIn(tierPanel, 12, 0.06);
        labelL(tierPanel, '— 心魔段位 —', 24, { bold: true, color: THEME.goldLight, width: 300 })
            .setPosition(-306, 130, 0);
        ILLUSION.tiers.forEach((t, i) => {
            const reached = save.illusionBestEver >= t.at;
            const y = 66 - i * 66;
            labelL(tierPanel, t.name, 24, {
                bold: true,
                color: reached ? THEME.goldLight : THEME.inkSoft,
                width: 220,
                shrink: true,
            }).setPosition(-306, y, 0);
            labelL(tierPanel, `${t.at} 分`, 22, { color: reached ? THEME.paper : THEME.inkSoft, width: 160 })
                .setPosition(-66, y, 0);
            const reward = [t.lingshi ? `灵石 ${t.lingshi}` : '', t.fragments ? `碎片 ${t.fragments}` : '', t.jiyuan ? `仙缘 ${t.jiyuan}` : '']
                .filter(Boolean).join(' · ');
            // 右缘对齐 306：定宽 250 的盒子中心放在 306-125。
            label(tierPanel, reward, 19, {
                color: reached ? THEME.success : THEME.inkSoft,
                width: 250,
                shrink: true,
                align: 'right',
            }).setPosition(181, y, 0);
        });

        label(parent, '幻境成绩计入周榜，与好友一较高下（好友榜后续开放）', 20, {
            color: THEME.inkSoft,
            width: 620,
            shrink: true,
            outline: faded(THEME.void, 220),
            outlineWidth: 2,
        }).setPosition(0, -DESIGN_H / 2 + 130, 0);
    }

    /** 论武 tab（M11 #36）：战力总览 + 随机/约人切磋入口 + 战绩 */
    private renderPk(parent: Node) {
        const save = Game.save;
        const stats = Game.combat.deriveStats(save);
        const card = spritePanel(parent, 660, 320, undefined, THEME.tintCard);
        card.setPosition(0, 236, 0);
        fadeIn(card, 12);
        labelL(card, '我的战力', 30, { bold: true, color: THEME.goldLight }).setPosition(-306, 116, 0);
        labelL(card, `${TEXTS.statAtk} ${stats.atk} ｜ ${TEXTS.statDef} ${stats.def} ｜ ${TEXTS.statPower} ${stats.power}`, 24, {
            bold: true, color: THEME.paper, width: 600, shrink: true,
        }).setPosition(-306, 68, 0);
        const weaponTier = Game.combat.equippedTier(save);
        const forgingLine = `${TEXTS.forgingLevel(save.combat.forging)} ｜ 法器 ${weaponTier >= 0 ? WEAPONS.find((w) => w.tier === weaponTier)!.name : '未佩'}`;
        labelL(card, forgingLine, 21, { color: THEME.inkSoft, width: 600, shrink: true })
            .setPosition(-306, 26, 0);

        const randomBtn = spriteButton(card, 300, 88, TEXTS.pkRandom, () => this.enterPk('random'), {
            fontSize: 26,
            variant: 'primary',
        });
        randomBtn.node.setPosition(-160, -66, 0);
        const friendBtn = spriteButton(card, 300, 88, TEXTS.pkFriend, () => this.enterPk('friend'), {
            fontSize: 26,
            variant: 'secondary',
            textColor: THEME.goldLight,
        });
        friendBtn.node.setPosition(160, -66, 0);
        label(card, TEXTS.pkRemaining(save.daily.pkUsed, PK_DAILY_LIMIT), 20, {
            bold: true,
            color: Game.combat.canPk(save) ? THEME.paperDim : THEME.danger,
        }).setPosition(0, -130, 0);

        const record = spritePanel(parent, 660, 240, undefined, THEME.tintPanel);
        record.setPosition(0, -90, 0);
        fadeIn(record, 12, 0.06);
        labelL(record, '论武战绩', 26, { bold: true, color: THEME.goldLight }).setPosition(-306, 82, 0);
        labelL(record, TEXTS.pkRecord(save.pk.wins, save.pk.losses, save.pk.bestStreak), 23, {
            bold: true, color: THEME.paper, width: 600, shrink: true,
        }).setPosition(-306, 34, 0);
        labelL(record, save.pk.streak > 0 ? `当前 ${TEXTS.pkStreak(save.pk.streak)}` : '当前无连胜', 21, {
            color: save.pk.streak > 0 ? THEME.success : THEME.inkSoft,
        }).setPosition(-306, -8, 0);
        labelL(record, '胜者得灵石与修为，落败可看广告蓄力再战同一对手', 19, {
            color: THEME.inkSoft, width: 600, shrink: true,
        }).setPosition(-306, -58, 0);
        labelL(record, '每场消耗 1 次每日切磋次数（共 5 次），败后再战不重复计次', 19, {
            color: THEME.inkSoft, width: 600, shrink: true,
        }).setPosition(-306, -88, 0);

        label(parent, '以武会友，点到即止——论武不计生死，只论高低', 20, {
            color: THEME.inkSoft,
            width: 620,
            shrink: true,
            outline: faded(THEME.void, 220),
            outlineWidth: 2,
        }).setPosition(0, -DESIGN_H / 2 + 130, 0);
    }

    private enterPk(mode: 'random' | 'friend') {
        if (!Game.combat.canPk(Game.save)) {
            toast(this.node, TEXTS.pkExhausted);
            return;
        }
        Game.stack.push(new PkBattleScene(mode));
    }

    /** 成就 tab：12 项双列卡片 */
    private renderAchievements(parent: Node) {
        ACHIEVEMENTS.forEach((a, i) => {
            const col = i % 2;
            const row = Math.floor(i / 2);
            const card = spritePanel(parent, 324, 148, undefined, THEME.tintPanel);
            card.setPosition(-170 + col * 340, 340 - row * 162, 0);
            fadeIn(card, 12, i * 0.02);

            const reached = Game.ach.isReached(Game.save, a.id);
            const claimed = Game.ach.isClaimed(Game.save, a.id);
            const metric = Game.ach.metricOf(Game.save, a);
            const cur = Math.min(a.target, metric);
            // 卡片半宽 162，左内边距 22 -> 三行统一从 -140 起（旧版名称在 -158，
            // 只离卡边 4px，首字几乎被切；描述/奖励却在 -151，三条左边界互不相同）。
            labelL(card, a.name, 22, { bold: true, color: THEME.goldLight, width: 290, shrink: true })
                .setPosition(-140, 50, 0);
            labelL(card, a.desc, 16, { color: THEME.inkSoft, width: 290, shrink: true })
                .setPosition(-140, 22, 0);
            const rewardText = [a.reward.lingshi ? `灵石 ${a.reward.lingshi}` : '', a.reward.fragments ? `碎片 ${a.reward.fragments}` : '']
                .filter(Boolean).join('·');
            labelL(card, `奖励 ${rewardText}`, 15, { color: THEME.inkSoft, width: 290, shrink: true })
                .setPosition(-140, -2, 0);

            const btn = spriteButton(card, 120, 52, '', () => this.claim(a.id), {
                fontSize: 19,
                variant: 'secondary',
                textColor: THEME.goldLight,
            });
            btn.node.setPosition(-92, -42, 0);
            if (claimed) {
                btn.setEnabled(false);
                btn.setText(TEXTS.achieveClaimed);
            } else if (reached) {
                btn.setEnabled(true);
                btn.setText(TEXTS.achieveClaim);
            } else {
                btn.setEnabled(false);
                btn.setText(`${cur}/${a.target}${a.unit ?? ''}`);
            }
            this.achieveBtns.set(a.id, btn);
            this.drawProgressLine(card, metric / a.target);
        });
    }

    private claim(id: string) {
        const items = Game.ach.claim(Game.save, id, Game.rng);
        if (!items.length) {
            toast(this.node, '成就尚未达成或已领取');
            return;
        }
        AudioMgr.play('rare');
        Game.persist();
        this.renderTab();
        showDialog(this.node, {
            title: '成就奖励',
            lines: items.map((i) => ({ text: i.label, color: 1 as const })),
            buttons: [{ text: '收 下', primary: true }],
        });
    }

    private enterIllusion() {
        const kind = Game.illusion.startKind(Game.save);
        if (kind === 'none') {
            toast(this.node, TEXTS.illusionNone);
            return;
        }
        if (kind === 'free') {
            Game.illusion.consumeStart(Game.save, 'free');
            Game.persist();
            Game.stack.push(new RainScene('illusion'));
            return;
        }
        Ads.show('illusionExtra', this.node, {
            onSuccess: () => {
                if (!Game.illusion.consumeStart(Game.save, 'ad')) return;
                Game.persist();
                Game.stack.push(new RainScene('illusion'));
            },
        });
    }

    /** 生成成就进度图形条（卡片顶部 3px 细线，达成点亮） */
    private drawProgressLine(card: Node, ratio: number) {
        const bar = uinode('pline', card, 290, 4);
        bar.setPosition(0, 66, 0);
        const g = bar.addComponent(Graphics);
        g.fillColor = ratio >= 1 ? THEME.rainGold : THEME.border;
        g.roundRect(-145, -2, 290 * Math.max(0.02, Math.min(1, ratio)), 4, 2);
        g.fill();
    }
}
