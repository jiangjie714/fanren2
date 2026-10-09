import { Color, Graphics, Label, Layers, Node, tween, UIOpacity, Vec3 } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { Ads } from '../infra/Ads';
import { AudioMgr } from '../infra/AudioMgr';
import { RainResult, RainSession } from '../core/systems/RainSystem';
import { formatRankValue } from '../core/systems/SocialRank';
import { DouyinSocial, SOCIAL_KEYS } from '../infra/DouyinSocial';
import { Share } from '../infra/Share';
import { MAX_REALM_INDEX, REALMS } from '../core/config/realms';
import { TEXTS } from '../core/config/texts';
import {
    ButtonHandle,
    DESIGN_H,
    DESIGN_W,
    THEME,
    faded,
    fadeIn,
    label,
    labelL,
    pageBackground,
    spriteButton,
    scrim,
    spritePanel,
    toast,
    uinode,
    washedPanel,
} from '../ui/ThemeLib';

export interface ResultParams {
    session: RainSession;
    result: RainResult;
    rate: number;
    success: boolean;
    targetIndex: number;
    /** 突破判定时的道心层数（明细对账用；判定后成功清零/失败 +1 均不改此值） */
    daoxin?: number;
}

/** 渡劫结算页：评级、概率明细、状态徽章与主行动保持在同一条视觉链上。 */
export class ResultScene implements IScene {
    node: Node;
    private p: ResultParams;
    private lostXiuwei = 0;
    private xwBefore = 0;
    private daoxinGain = 0;
    private protectedUsed = false;
    private protectBtn: ButtonHandle | null = null;
    private applied = false;

    constructor(params: ResultParams) {
        this.node = new Node('ResultScene');
        this.node.layer = Layers.Enum.UI_2D;
        this.p = params;
    }

    onEnter() {
        const n = this.node;
        if (!this.applied) {
            this.applied = true;
            if (this.p.success) {
                Game.realm.succeed(this.p.result.extraXiuwei);
                AudioMgr.play('success');
            } else {
                // #45：失败瞬间按「不护道」结算（修为保留 70%、道心 +1），存档随时自洽；
                // 护道广告成功后再经 applyProtect 补至仅损一成、道心合计 +2。
                this.xwBefore = Game.eco.xiuwei;
                const f = Game.realm.fail();
                this.lostXiuwei = f.lostXiuwei;
                this.daoxinGain = f.daoxinGain;
                AudioMgr.play('fail');
            }
            Game.persist();
        }

        pageBackground(n, 'art/ui/bg_result/spriteFrame');
        // 结果页底部三段文字（结果语 / 修为损益 / 行动按钮）直接压在插画上，而 bg_result
        // 的金色光柱恰好落在中下部，白字与深绿字在这里都读不清。铺一层自下而上的渐隐遮挡，
        // 比反复重生成背景更稳，也不破坏插画本身的观感。
        // 覆盖设计系 y ∈ [-100, -640]：起于详情面板下缘，止于屏幕底。
        scrim(n, DESIGN_W, 540, THEME.void, 236).setPosition(0, -370, 0);
        // 顶部三行（标题 / 评级 / 评分行）落在 bg_result 的雷云上：闪电是纯白高亮，
        // 白字压上去会整段消失。统一给深墨描边，让文字在任何亮度带都能立住。
        const HEAD_OUTLINE = faded(THEME.void, 225);
        const title = label(n, '渡劫结果', 42, {
            bold: true,
            color: THEME.paper,
            outline: HEAD_OUTLINE,
            outlineWidth: 3,
        });
        title.setPosition(0, 512, 0);
        fadeIn(title);

        const rating = this.p.result.rating;
        const ratingColor = rating === '仙阶完美接引' ? THEME.goldLight
            : rating === '灵阶接引' ? THEME.rainBlue : THEME.paper;
        label(n, rating, 48, { bold: true, color: ratingColor, outline: HEAD_OUTLINE, outlineWidth: 3 })
            .setPosition(0, 436, 0);
        label(n, TEXTS.scoreLine(this.p.result.score, this.p.result.maxCombo), 24, {
            color: THEME.paper,
            width: 560,
            shrink: true,
            outline: HEAD_OUTLINE,
            outlineWidth: 3,
        }).setPosition(0, 388, 0);
        // 完美接引三星：仙阶且零劫雨（docs/数值假设.md #26）
        if (rating === '仙阶完美接引' && this.p.result.redCount === 0) {
            label(n, TEXTS.perfectStars, 38, { bold: true, color: THEME.rainGold }).setPosition(0, 340, 0);
            label(n, TEXTS.rainImmortal, 22, { color: THEME.goldLight }).setPosition(0, 298, 0);
        }

        // 面板高 340 而非 388：388 时按 58 的固定行距从上往下排（首行 y=152），
        // 5 行只占到 -80，面板下方空出 45、上方空 85 —— 视觉上「表挂在面板上半截」。
        // 改成按行数居中后，无论 4 行还是 5 行上下留白都一致。
        const detail = spritePanel(n, 628, 340, undefined, THEME.tintDeep);
        detail.setPosition(0, 56, 0);
        fadeIn(detail, 18, 0.05);
        const base = REALMS[this.p.targetIndex].baseRate;
        const gold = this.p.result.goldBonus;
        const penalty = this.p.result.penalty;
        const md = this.p.result.mindDemon;
        const cb = this.p.result.comboBonus;
        const fmt = (v: number) => `${v >= 0 ? '+' : '-'}${Math.round(Math.abs(v) * 100)}%`;
        // 明细用「名称左列 / 数值右列」的账目式两列排版，替代旧版
        // 「名字+数值挤在一个左对齐字符串里靠空格对齐」——空格在比例字体下对不齐。
        const rows: Array<{ k: string; v: string; final?: boolean }> = [
            { k: '基础突破率', v: `${Math.round(base * 100)}%` },
            { k: '金色灵雨', v: fmt(gold) },
            { k: '劫雨扣减', v: penalty > 0 ? `-${Math.round(penalty * 100)}%` : '0%' },
        ];
        if (cb > 0) rows.push({ k: '连击加成', v: `+${Math.round(cb * 100)}%` });
        if (md) rows.push({ k: '心魔干扰', v: '-5%' });
        // #45 道心加成行：显示突破判定时的层数加成（成功后已清零/失败后已 +1 均不影响对账）
        const daoUsed = this.p.daoxin ?? 0;
        if (daoUsed > 0) rows.push({ k: '道心加成', v: `+${daoUsed * 5}%` });
        // #49 A3 首战（天道庇佑）：明确标注「首战必成」——把它讲成设定而非漏洞（spec §7 R3）。
        // 判定读会话上的 firstBattle（与 RealmSystem / RainSystem 同源），不重复推断。
        if (this.p.session.firstBattle) rows.push({ k: '天道庇佑', v: '首战必成' });
        rows.push({ k: '最终突破率', v: `${Math.round(this.p.rate * 100)}%`, final: true });
        const PITCH = 56;
        const firstRowY = ((rows.length - 1) * PITCH) / 2;
        // 分隔线：把最终行和过程项隔开（宽度 580 与两列等宽）
        const sep = uinode('sep', detail, 580, 2);
        sep.setPosition(0, firstRowY - (rows.length - 1) * PITCH + 28, 0);
        const sepG = sep.addComponent(Graphics);
        sepG.fillColor = faded(THEME.goldLight, 96);
        sepG.roundRect(-290, -1, 580, 2, 1);
        sepG.fill();
        rows.forEach((r, i) => {
            const isFinal = !!r.final;
            labelL(detail, r.k, isFinal ? 28 : 25, {
                bold: isFinal,
                color: isFinal ? THEME.goldLight : THEME.inkSoft,
                width: 220,
                shrink: true,
            }).setPosition(-290, firstRowY - i * PITCH, 0);
            label(detail, r.v, isFinal ? 31 : 26, {
                bold: true,
                color: isFinal ? THEME.goldLight : THEME.paper,
                align: 'right',
                width: 220,
            }).setPosition(180, firstRowY - i * PITCH, 0);
        });

        const success = this.p.success;
        // 语义色靠「叠加色晕」而不是染色：玄墨紫底乘算变不出绿/红（见 ThemeLib.washedPanel）。
        // 色相之外文案本身就是「突破成功 / 突破失败」，色盲玩家同样可读。
        const badge = washedPanel(
            n,
            496,
            130,
            success ? THEME.jade : THEME.cinnabar,
            success ? 120 : 124,
        );
        badge.setPosition(0, -205, 0);
        label(badge, success ? '突破成功' : '突破失败', 62, {
            bold: true,
            // 失败用宣纸白而非朱砂 —— 朱砂字压在朱砂色晕上对比只有 ~1.5:1，会糊。
            color: success ? THEME.goldLight : THEME.paper,
            outline: faded(success ? THEME.jadeDeep : THEME.cinnabarDeep, 220),
            outlineWidth: 3,
        });

        // M9c 境界变化动画（PRD 三：仅成功时）——金光爆闪 + 徽章弹入 + 结果语落定 + 金尘上浮
        // 先建结果语再把节点交给动画：旧版 playBreakthroughFx 用「最后一个 label」猜目标，
        // 而结果语当时还没创建，动画落在了上一个无关 label 上（P1-1）。
        const resultText = success
            ? TEXTS.breakthroughSuccess(REALMS[this.p.targetIndex].name)
            : TEXTS.breakthroughFail;
        const resultLabel = label(n, resultText, 27, { color: THEME.paper, width: 560, shrink: true });
        resultLabel.setPosition(0, -278, 0);
        if (success) {
            this.playBreakthroughFx(n, badge, resultLabel);
        }

        if (!success) {
            const jyNow = Game.eco.jiyuan;
            const xwNow = Game.eco.xiuwei;
            const daoNow = Game.save.daoxin;
            // 道心提示：本次 +n（已满则提示层数封顶）
            const daoTip = daoNow >= 3
                ? ` · 道心已满 ${daoNow}/3`
                : this.daoxinGain > 0 ? ` · 道心 +${this.daoxinGain}（${daoNow}/3）` : '';
            label(n, `修为受损 -${this.lostXiuwei}（现存 ${xwNow}） · 机缘残留 ${jyNow}${daoTip}`, 23, {
                color: THEME.rainRed,
                width: 580,
                shrink: true,
            }).setPosition(0, -332, 0);
        } else {
            const xwNow = Game.eco.xiuwei;
            label(n, `金雨额外修为 +${this.p.result.extraXiuwei}（现存修为 ${xwNow}）`, 23, {
                color: THEME.success,
                width: 580,
                shrink: true,
            }).setPosition(0, -332, 0);
            // 化神通关成就（PRD 2.1：化神解锁通关成就）
            if (Game.save.realmIndex >= MAX_REALM_INDEX) {
                const badge = spritePanel(n, 520, 96, undefined, THEME.tintCard);
                badge.setPosition(0, -396, 0);
                label(badge, '通关成就 · 化神大圆满', 28, { bold: true, color: THEME.goldLight })
                    .setPosition(0, 16, 0);
                label(badge, TEXTS.realmMax, 20, { color: THEME.inkSoft }).setPosition(0, -20, 0);
            }
        }

        // M9b 好友对比（抖音端可用时）：渡劫评分榜。
        // 化神通关徽章占用 -400 位，此场景（success && 化神）跳过对比行，避免挤压。
        if (DouyinSocial.available() && !(success && Game.save.realmIndex >= MAX_REALM_INDEX)) {
            const myValue = Game.save.stats.bestTribScore;
            DouyinSocial.compare(SOCIAL_KEYS.tribulationBest, myValue, (r) => {
                if (!r || r.total === 0 || !this.node.isValid) return; // 超时/无好友数据 → 静默降级
                const line = label(n, `好友对比：已超越 ${r.beat}/${r.total} 位好友 · 最高 ${formatRankValue(SOCIAL_KEYS.tribulationBest, r.top)}`, 23, {
                    color: THEME.inkSoft,
                    width: 580,
                    shrink: true,
                });
                line.setPosition(0, -368, 0);
                fadeIn(line, 8);
            });
        }

        // 底部双按钮排版：按「宽度 + 24px 间距」整体居中计算，避免手调坐标叠加
        // （旧版成功分支 -102/112 使炫耀战绩与返回仙府横向叠了 36px）。
        // y 取 -500：成功+化神时通关成就徽章底缘 -444，留出 11px 呼吸空隙。
        const dualButtons = (
            leftW: number, leftLabel: string, onLeft: () => void,
            leftStyle: { fontSize: number; variant: 'primary' | 'secondary'; textColor: typeof THEME.void },
            rightW: number, rightLabel: string, onRight: () => void,
            rightStyle: { fontSize: number; variant: 'primary' | 'secondary'; textColor: typeof THEME.void },
        ) => {
            const GAP = 24;
            const total = leftW + GAP + rightW;
            const lx = -total / 2 + leftW / 2;
            const rx = -total / 2 + leftW + GAP + rightW / 2;
            spriteButton(n, leftW, 90, leftLabel, onLeft, leftStyle).node.setPosition(lx, -500, 0);
            spriteButton(n, rightW, 90, rightLabel, onRight, rightStyle).node.setPosition(rx, -500, 0);
        };

        if (!success) {
            this.protectBtn = spriteButton(n, 330, 90, `${TEXTS.protectBtn} · 广告`, () => this.useProtect(), {
                fontSize: 27,
                variant: 'primary',
                textColor: THEME.void,
            });
            const back = spriteButton(n, 206, 90, '返回仙府', () => Game.stack.popToRoot(), {
                fontSize: 26,
                variant: 'secondary',
                textColor: THEME.paper,
            });
            const total = 330 + 24 + 206;
            this.protectBtn.node.setPosition(-total / 2 + 165, -500, 0);
            back.node.setPosition(-total / 2 + 330 + 24 + 103, -500, 0);
        } else {
            dualButtons(
                200, '炫耀战绩', () => this.shareScore(),
                { fontSize: 26, variant: 'secondary', textColor: THEME.goldLight },
                300, '返回仙府', () => Game.stack.popToRoot(),
                { fontSize: 30, variant: 'primary', textColor: THEME.void },
            );
        }

        // 成就扫描放在境界统计写入之后（realm.succeed/fail 在本页 onEnter 顶部），
        // 「首次突破/境界达成」类成就当场达成。旧版在 RainScene 统计写入前扫描（P1-2）。
        Game.checkAchievements(this.node);
    }

    onResume() {
        // 终局页：UI 全部由构造参数一次性构建，没有需要刷新的动态区块；
        // 也没有子页会压在本页之上。显式 no-op 声明契约（P1-3）。
    }

    /** 渡劫高光分享（PRD 2.5 素材产出位；抖音端系统分享，Web 端 toast 提示） */
    private shareScore() {
        const realm = REALMS[this.p.targetIndex].name;
        if (!Share.share({ title: TEXTS.shareBreakthrough(realm) })) {
            toast(this.node, TEXTS.shareUnavailable);
        }
    }

    /**
     * 境界变化动画：全屏金光爆闪 → 徽章弹入（back 缓动）→ 结果语自上落定 → 金尘上浮消散。
     * 全部本地 tween，结束后画面与静态版一致。
     */
    private playBreakthroughFx(n: Node, badge: Node, resultLabel: Node) {
        const flash = uinode('flashFx', n, 720, 1280);
        const fg = flash.addComponent(Graphics);
        fg.fillColor = faded(THEME.goldDeep, 150);
        fg.circle(0, -80, 300);
        fg.fill();
        const fop = flash.addComponent(UIOpacity);
        fop.opacity = 0;
        tween(fop)
            .delay(0.1)
            .to(0.18, { opacity: 130 })
            .to(0.4, { opacity: 0 })
            .call(() => flash.destroy())
            .start();

        badge.setScale(0.5, 0.5, 1);
        tween(badge)
            .delay(0.2)
            .to(0.2, { scale: new Vec3(1.08, 1.08, 1) }, { easing: 'backOut' })
            .to(0.08, { scale: new Vec3(1, 1, 1) })
            .start();

        // 结果语自上落定（目标由调用方显式传入，不再按「最后一个 label」猜）
        {
            const op = resultLabel.addComponent(UIOpacity);
            op.opacity = 0;
            const y0 = resultLabel.position.y;
            resultLabel.setScale(1.4, 1.4, 1);
            resultLabel.setPosition(resultLabel.position.x, y0 + 26, 0);
            tween(op).delay(0.45).to(0.25, { opacity: 255 }).start();
            tween(resultLabel)
                .delay(0.45)
                .to(0.25, { position: new Vec3(resultLabel.position.x, y0, 0), scale: new Vec3(1, 1, 1) }, { easing: 'sineOut' })
                .start();
        }

        const motes = uinode('motesFx', n, 720, 1280);
        const mg = motes.addComponent(Graphics);
        mg.fillColor = faded(THEME.goldDeep, 210);
        const pts: Array<[number, number]> = [[-240, -180], [-80, -260], [90, -200], [230, -280], [-160, -60], [180, -40]];
        pts.forEach(([x, y], i) => {
            mg.circle(x, y, 5 + (i % 3) * 2);
        });
        mg.fill();
        pts.forEach(([x, y], i) => {
            const m = uinode(`mote${i}`, motes, 16, 16);
            const g2 = m.addComponent(Graphics);
            g2.fillColor = faded(THEME.goldLight, 230);
            g2.circle(0, 0, 5 + (i % 3) * 2);
            g2.fill();
            const mop = m.addComponent(UIOpacity);
            mop.opacity = 0;
            tween(mop)
                .delay(0.3 + i * 0.08)
                .to(0.1, { opacity: 255 })
                .to(0.9, { opacity: 0 })
                .start();
            tween(m)
                .delay(0.3 + i * 0.08)
                .by(0.9, { position: new Vec3((i % 2 === 0 ? 1 : -1) * 14, 150, 0) }, { easing: 'sineOut' })
                .call(() => m.destroy())
                .start();
        });
        tween(motes)
            .delay(1.6)
            .call(() => motes.destroy())
            .start();
    }

    private useProtect() {
        if (this.protectedUsed || this.lostXiuwei <= 0) return;
        Ads.show('protect', this.node, {
            onSuccess: () => {
                this.protectedUsed = true;
                // #45：补至仅损一成 + 道心再 +1（合计 +2，上限 3）
                const r = Game.realm.applyProtect(this.xwBefore, this.lostXiuwei);
                Game.persist();
                this.protectBtn?.setEnabled(false);
                const total = this.daoxinGain + r.daoxinGain;
                this.protectBtn?.setText(total > 0
                    ? `已护道 +${r.restored} · 道心 +${total}`
                    : `已护道 +${r.restored} · 道心已满`);
            },
        });
    }
}
