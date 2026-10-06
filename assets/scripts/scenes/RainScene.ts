import { Color, EventTouch, Graphics, Input, Label, Layers, Node, tween, UIOpacity, UITransform, Vec3 } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { Ads } from '../infra/Ads';
import { AudioMgr } from '../infra/AudioMgr';
import { RainMode, RainSession, RAIN_FIELD, RainDrop } from '../core/systems/RainSystem';
import { recordIllusion, recordTribulation } from '../core/systems/StatsRecorder';
import { comboBonus, RAIN_WAVES, waveAt } from '../core/config/drops';
import { TEXTS } from '../core/config/texts';
import {
    ButtonHandle,
    DESIGN_H,
    DESIGN_W,
    SAFE,
    THEME,
    faded,
    fadeIn,
    iconButton,
    image,
    label,
    pageBackground,
    spriteButton,
    spritePanel,
    toast,
    uinode,
    visibleHeight,
    visibleWidth,
} from '../ui/ThemeLib';
import { showDialog } from '../ui/dialog';
import { animDir, animFrames, spriteAnimation } from '../ui/ThemeLib';
import { ResultScene } from './ResultScene';
import { IllusionResultScene } from './IllusionResultScene';

/** 波次开场横幅文案（按 RAIN_WAVES 下标） */
const WAVE_TEXTS = [TEXTS.waveYunyu, TEXTS.waveLingchao, TEXTS.waveJieyun];
/** 聚灵咒施法动画（2x3 网格 6 帧），8fps ≈ 0.75s。 */
const CAST_FRAMES = 6;
const CAST_FPS = 8;

/** 灵气雨渡劫页：HUD 与玩法分层，雨滴与角色使用主题资产。幻境模式（M8）复用同页。 */
export class RainScene implements IScene {
    node: Node;
    private mode: RainMode;
    private session!: RainSession;
    private dropNodes = new Map<number, Node>();
    /** syncDrops 每帧复用：避免每帧 new Set（P2-2） */
    private dropSeen = new Set<number>();
    private fieldNode!: Node;
    private player!: Node;
    private countdown!: Label;
    private rateLabel!: Label;
    private countLabel!: Label;
    private statusLabel!: Label;
    private waveBanner!: Node;
    private magnetAura!: Node;
    private magnetBtn: ButtonHandle | null = null;
    private lastWaveIndex = -1;
    private lastCombo = 0;
    private mindOverlay!: Node;
    private purifyBtn: ButtonHandle | null = null;
    private magnetBtnPositionX = 176;
    private targetX = 0;
    private finished = false;
    private dragging = false;
    private lastCounts = { gold: 0, blue: 0, red: 0 };

    constructor(mode: RainMode = 'tribulation') {
        this.node = new Node('RainScene');
        this.node.layer = Layers.Enum.UI_2D;
        this.mode = mode;
    }

    onEnter() {
        const n = this.node;
        // 触控根节点铺满可见高度：长屏下手指落在上下延伸区也照样能拖动角色
        n.addComponent(UITransform).setContentSize(visibleWidth(), visibleHeight());
        const targetIndex = Game.save.realmIndex + 1;
        this.session = Game.rain.createSession(targetIndex, Game.eco.monthCardActive, this.mode);
        // 炼丹「速度」四维：放大角色跟随手指的惯性系数（#39，乘算）
        this.session.followLerp *= 1 + Game.alchemy.speedMoveBonus(Game.save);

        // 秘境按今日主题换背景（#42：灵雨=金绿云海 / 劫云=紫红雷劫 / 幻心=青玉幻境）
        pageBackground(n, this.session.theme?.bg ?? 'art/ui/bg_rain/spriteFrame');
        this.fieldNode = uinode('field', n, 0, 0);

        const charIndex = Math.min(5, Math.max(0, Game.save.realmIndex));
        this.player = uinode('player', n, 130, 130);
        this.player.setPosition(0, RAIN_FIELD.playerY, 0);
        const aura = this.player.addComponent(Graphics);
        aura.fillColor = faded(THEME.gold, 45);
        aura.strokeColor = THEME.goldLight;
        aura.lineWidth = 3;
        aura.circle(0, 0, 62);
        aura.fill();
        aura.stroke();
        image(this.player, `art/characters/char_realm_0${charIndex}${Game.save.profile.gender === 'f' ? '_f' : ''}/spriteFrame`, 108, 108,
            Game.save.profile.gender === 'f' ? { fallbackPath: `art/characters/char_realm_0${charIndex}/spriteFrame` } : {});

        const hud = spritePanel(n, 648, 92, undefined, THEME.tintDeep);
        hud.setPosition(0, DESIGN_H / 2 - SAFE.top, 0);
        fadeIn(hud, -14);
        iconButton(hud, 'art/ui/icons/icon_close/spriteFrame', () => this.confirmQuit(), 86, 68)
            .node.setPosition(-266, 0, 0);
        image(hud, 'art/ui/icons/icon_timer/spriteFrame', 40, 40).setPosition(-154, 0, 0);
        this.countdown = label(hud, `${Math.ceil(this.session.duration)}s`, 38, {
            bold: true,
            color: THEME.white,
            align: 'left',
            width: 104,
        }).getComponent(Label)!;
        this.countdown.node.setPosition(-124, 0, 0);
        this.rateLabel = label(hud, '突破率 0%', 28, {
            bold: true,
            color: THEME.goldLight,
            align: 'right',
            width: 214,
        }).getComponent(Label)!;
        this.rateLabel.node.setPosition(150, 0, 0);

        const stats = spritePanel(n, 470, 62, undefined, THEME.tintPanel);
        stats.setPosition(0, DESIGN_H / 2 - 186, 0);
        fadeIn(stats, -10, 0.04);
        this.countLabel = label(stats, '金雨 0 · 清雨 0 · 劫雨 0', 23, {
            bold: true,
            color: THEME.ink,
            width: 424,
            shrink: true,
        }).getComponent(Label)!;

        // 连击 / 评分状态行（V2：技巧反馈）
        // 连击/评分行落在金色陨石带上方，亮部极高，白字不加描边会直接糊掉
        this.statusLabel = label(n, '', 24, {
            bold: true,
            color: THEME.paper,
            width: 520,
            shrink: true,
            outline: faded(THEME.void, 220),
            outlineWidth: 3,
        }).getComponent(Label)!;
        this.statusLabel.node.setPosition(0, DESIGN_H / 2 - 240, 0);

        // 波次开场横幅（高于开场 toast，避免重叠）
        this.waveBanner = uinode('waveBanner', n, 560, 64);
        this.waveBanner.setPosition(0, 330, 0);
        const bannerOp = this.waveBanner.addComponent(UIOpacity);
        bannerOp.opacity = 0;
        label(this.waveBanner, '', 36, {
            bold: true,
            color: THEME.paper,
            width: 560,
            shrink: true,
            outline: faded(THEME.void, 220),
            outlineWidth: 3,
        });

        // 聚灵咒光环（磁吸生效时显示）
        this.magnetAura = uinode('magnetAura', n, 280, 280);
        this.magnetAura.setPosition(0, RAIN_FIELD.playerY, 0);
        const auraG = this.magnetAura.addComponent(Graphics);
        auraG.strokeColor = THEME.rainGold;
        auraG.lineWidth = 5;
        auraG.circle(0, 0, 132);
        auraG.stroke();
        auraG.strokeColor = faded(THEME.goldDeep, 90);
        auraG.lineWidth = 14;
        auraG.circle(0, 0, 112);
        auraG.stroke();
        this.magnetAura.active = false;

        this.purifyBtn = spriteButton(n, 296, 76, TEXTS.purifyBtn, () => this.usePurify(), {
            fontSize: 25,
            variant: 'secondary',
            textColor: THEME.goldLight,
        });
        this.purifyBtn.node.setPosition(-160, -390, 0);
        const purifyIcon = image(this.purifyBtn.node, 'art/ui/icons/icon_purify/spriteFrame', 36, 36);
        purifyIcon.setPosition(-116, 0, 0);
        this.purifyBtn.labelNode.setPosition(20, 0, 0);
        // 幻境无净化广告（数值假设 #29）
        this.purifyBtn.node.active = this.mode !== 'illusion';
        if (this.mode === 'illusion') this.magnetBtnPositionX = 0;

        this.magnetBtn = spriteButton(n, 216, 76, `${TEXTS.magnetBtn}`, () => this.useMagnet(), {
            fontSize: 25,
            variant: 'secondary',
            textColor: THEME.goldLight,
        });
        this.magnetBtn.node.setPosition(this.magnetBtnPositionX, -390, 0);
        const magnetIcon = image(this.magnetBtn.node, 'art/ui/icons/icon_juling/spriteFrame', 36, 36);
        magnetIcon.setPosition(-70, 0, 0);
        this.magnetBtn.labelNode.setPosition(16, 0, 0);

        // 底部落在 bg_rain 的亮色云海上，辅助说明必须带描边才读得出来
        label(n, this.mode === 'illusion' ? TEXTS.illusionTip : TEXTS.rainTip, 23, {
            color: THEME.inkSoft,
            width: 560,
            shrink: true,
            outline: faded(THEME.void, 215),
            outlineWidth: 3,
        }).setPosition(0, -DESIGN_H / 2 + 44, 0);

        // 心魔全屏染色必须铺满可见高度：按 1280 固定会在长屏上下留下两条未染色带
        this.mindOverlay = uinode('mindFx', n, visibleWidth(), visibleHeight());
        const mg = this.mindOverlay.addComponent(Graphics);
        mg.fillColor = faded(THEME.cinnabarDeep, 46);
        mg.roundRect(-visibleWidth() / 2, -visibleHeight() / 2, visibleWidth(), visibleHeight(), 0);
        mg.fill();
        this.mindOverlay.active = false;

        this.refreshHud();
        toast(n, this.mode === 'illusion' ? TEXTS.illusionOpen : TEXTS.rainOpen, 28);

        n.on(Input.EventType.TOUCH_START, (e: EventTouch) => {
            this.dragging = true;
            this.updateTargetX(e);
        });
        n.on(Input.EventType.TOUCH_MOVE, (e: EventTouch) => this.updateTargetX(e));
        n.on(Input.EventType.TOUCH_END, () => { this.dragging = false; });
        n.on(Input.EventType.TOUCH_CANCEL, () => { this.dragging = false; });
    }

    update(dt: number) {
        if (this.finished) return;
        Game.rain.tick(this.session, dt, this.dragging ? this.targetX : this.session.playerX);
        this.syncDrops();
        this.player.setPosition(this.session.playerX, RAIN_FIELD.playerY, 0);
        this.magnetAura.setPosition(this.session.playerX, RAIN_FIELD.playerY, 0);
        this.checkWaveBanner();
        this.refreshHud();
        if (this.session.finished) this.finishRain();
    }

    onExit() {
        this.dropNodes.clear();
    }

    onResume() {
        // 渡劫是进行中的对局：HUD 每帧自刷新（refreshHud），无静态快照需要重建，
        // 整页重建反而会打断对局。显式 no-op 防止后人误补（P1-3 统一 onResume 契约）。
    }

    private refreshHud() {
        this.countdown.string = `${Math.ceil(this.session.timeLeft)}s`;
        const s = this.session;
        if (this.mode === 'illusion') {
            // 幻境：右上显示实时得分（无突破率语义）
            const live = Math.max(0, s.goldCount * 4 + s.combo * 2 - s.redCount * 3);
            this.rateLabel.string = `得分 ${live}`;
        } else {
            const liveComboBonus = comboBonus(s.combo);
            const rate = Game.realm.computeFinalRate(
                s.targetIndex, s.goldBonus, s.penalty, s.mindDemon, liveComboBonus,
            );
            this.rateLabel.string = `突破率 ${Math.round(rate * 100)}%`;
        }
        this.countLabel.string = `金雨 ${s.goldCount} · 清雨 ${s.blueCount} · 劫雨 ${s.redCount}`;

        // 状态行：连击（实时加成）+ 实时评分
        const liveScore = this.mode === 'illusion'
            ? Math.max(0, s.goldCount * 4 + s.combo * 2 - s.redCount * 3)
            : Math.max(0, s.goldCount * 3 + s.combo * 2 + s.blueCount - s.redCount * 2);
        const liveComboBonus = comboBonus(s.combo);
        this.statusLabel.string = s.combo >= 2
            ? `${TEXTS.comboFloat(s.combo)} ＋${Math.round(liveComboBonus * 1000) / 10}% ｜ 评分 ${liveScore}`
            : `评分 ${liveScore}`;

        // 连击增长脉冲
        if (s.combo > this.lastCombo && s.combo >= 2) {
            const node = this.statusLabel.node;
            node.setScale(1.25, 1.25, 1);
            tween(node).to(0.12, { scale: new Vec3(1, 1, 1) }).start();
        }
        this.lastCombo = s.combo;

        this.mindOverlay.active = this.session.mindDemon;
        this.magnetAura.active = this.session.magnetTimeLeft > 0;
        if (this.magnetBtn && this.session.magnetTimeLeft > 0) {
            this.magnetBtn.setEnabled(false);
            this.magnetBtn.setText(TEXTS.magnetActive);
        }

        // 拾取音效：按计数增量触发（每帧最多一声，优先级 金<蓝<劫）
        if (s.redCount > this.lastCounts.red) AudioMgr.play('red');
        else if (s.blueCount > this.lastCounts.blue) AudioMgr.play('blue');
        else if (s.goldCount > this.lastCounts.gold) AudioMgr.play('gold');
        this.lastCounts = { gold: s.goldCount, blue: s.blueCount, red: s.redCount };
    }

    /** 波次切换时播放开场横幅（幻境无波次） */
    private checkWaveBanner() {
        if (this.mode === 'illusion') return;
        const wave = waveAt(this.session.elapsed);
        const idx = RAIN_WAVES.indexOf(wave);
        if (idx === this.lastWaveIndex) return;
        this.lastWaveIndex = idx;
        const lb = this.waveBanner.getComponentInChildren(Label)!;
        lb.string = WAVE_TEXTS[idx] ?? wave.name;
        const op = this.waveBanner.getComponent(UIOpacity)!;
        this.waveBanner.setScale(0.9, 0.9, 1);
        tween(this.waveBanner).to(0.12, { scale: new Vec3(1, 1, 1) }).start();
        op.opacity = 0;
        tween(op)
            .to(0.18, { opacity: 255 })
            .delay(1.1)
            .to(0.3, { opacity: 0 })
            .start();
    }

    private useMagnet() {
        const ok = Game.rain.useMagnet(this.session);
        if (!ok) {
            toast(this.node, TEXTS.magnetUsed);
            return;
        }
        AudioMgr.play('rare');
        this.magnetBtn?.setEnabled(false);
        this.magnetBtn?.setText(TEXTS.magnetActive);
        this.playCastFx();
    }

    /**
     * 聚灵咒施法演出：播当前境界/性别的 cast 6 帧（one-shot，约 0.75s），播完恢复静态立绘。
     * 全境界+女修 cast 已随美术第三批补齐（char_cast / char_cast_f / char_cast_r01..05）；
     * 帧目录未随包时 spriteAnimation 立即回调 → 直接恢复静态立绘，不会空白。
     */
    private playCastFx() {
        const charIdx = Math.min(5, Math.max(0, Game.save.realmIndex));
        const female = Game.save.profile.gender === 'f';
        this.player.destroyAllChildren();
        spriteAnimation(this.player, animFrames(animDir('char_cast', charIdx, female), CAST_FRAMES, 'cast'), 108, 108, CAST_FPS, false,
            () => {
                if (this.player.isValid) {
                    image(this.player, `art/characters/char_realm_0${charIdx}${female ? '_f' : ''}/spriteFrame`, 108, 108,
                        female ? { fallbackPath: `art/characters/char_realm_0${charIdx}/spriteFrame` } : {});
                }
            });
    }

    private updateTargetX(e: EventTouch) {
        const world = e.getUILocation();
        this.targetX = world.x - DESIGN_W / 2;
    }

    private syncDrops() {
        const seen = this.dropSeen;
        seen.clear();
        for (const d of this.session.drops) {
            seen.add(d.id);
            let node = this.dropNodes.get(d.id);
            if (!node) {
                node = this.makeDropNode(d);
                this.dropNodes.set(d.id, node);
            }
            node.setPosition(d.x, d.y, 0);
        }
        for (const [id, node] of this.dropNodes) {
            if (!seen.has(id)) {
                node.destroy();
                this.dropNodes.delete(id);
            }
        }
    }

    private makeDropNode(d: RainDrop): Node {
        const path = d.type === 'gold' ? 'art/ui/raindrop_gold/spriteFrame'
            : d.type === 'blue' ? 'art/ui/raindrop_blue/spriteFrame'
                : 'art/ui/raindrop_red/spriteFrame';
        const size = d.radius * 2.35;
        return image(this.fieldNode, path, size, size);
    }

    private usePurify() {
        const ok = Game.rain.usePurify(this.session);
        if (!ok) {
            toast(this.node, '本局净化机会已用完');
            return;
        }
        Ads.show('purify', this.node, {
            onSuccess: () => {
                this.purifyBtn?.setEnabled(false);
                this.purifyBtn?.setText('净化生效中');
                toast(this.node, '劫雨已净化 3 秒');
            },
            onSkip: () => {
                this.session.purifyUsed = false;
                this.session.purifyTimeLeft = 0;
            },
        });
    }

    private confirmQuit() {
        showDialog(this.node, {
            title: this.mode === 'illusion' ? '退出幻境' : '退出渡劫',
            lines: [this.mode === 'illusion' ? '退出则本局幻境作废（不计分），确定退出？' : TEXTS.quitRainConfirm],
            buttons: [
                { text: this.mode === 'illusion' ? '继续幻境' : '继续渡劫' },
                {
                    text: '退出',
                    cb: () => {
                        if (this.finished) return;
                        this.finished = true;
                        if (this.mode === 'illusion') {
                            Game.stack.pop(); // 幻境退出无惩罚
                        } else {
                            Game.realm.quitRain();
                            Game.persist();
                            Game.stack.popToRoot();
                        }
                    },
                },
            ],
        });
    }

    private finishRain() {
        if (this.finished) return;
        this.finished = true;
        const result = Game.rain.finish(this.session);
        if (this.mode === 'illusion') {
            // M8/M14 秘境结算：计分 → 连胜轨 → 档位奖励（主题系数 × 连胜倍率）→ 结算页
            const fin = Game.illusion.finish(Game.save, result.goldCount, result.maxCombo, result.redCount, this.session.theme ?? undefined);
            recordIllusion(Game.save, result.score);
            Game.quests.progress(Game.save, 'tribulation');
            Game.quests.progress(Game.save, 'goldRain', result.goldCount);
            Game.checkAchievements(this.node);
            Game.persist();
            Game.social.reportScores(Game.save); // M9b：幻境周榜上报
            Game.stack.push(new IllusionResultScene({
                result,
                rewards: fin.rewards,
                streak: fin.streak,
                mult: fin.mult,
                interrupted: fin.interrupted,
                streakBefore: fin.streakBefore,
            }));
            return;
        }
        // 任务进度：完成一场渡劫 + 累计金雨；长线计数
        // 注意：成就扫描不在这里做——突破成功/失败的境界统计要等 ResultScene 写入，
        // 此处扫描会让「首次突破/境界达成」类成就延迟到下次登录才补发（P1-2）。
        Game.quests.progress(Game.save, 'tribulation');
        Game.quests.progress(Game.save, 'goldRain', result.goldCount);
        recordTribulation(Game.save, result);
        const rate = Game.realm.computeFinalRate(
            this.session.targetIndex, result.goldBonus, result.penalty, result.mindDemon, result.comboBonus,
        );
        const success = Game.realm.roll(rate);
        Game.persist();
        Game.social.reportScores(Game.save); // M9b：渡劫评分榜上报
        Game.stack.push(new ResultScene({
            session: this.session,
            result,
            rate,
            success,
            targetIndex: this.session.targetIndex,
        }));
    }
}
