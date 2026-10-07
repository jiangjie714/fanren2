import { Color, Label, Layers, Node } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { AudioMgr } from '../infra/AudioMgr';
import { Ads } from '../infra/Ads';
import { RainResult } from '../core/systems/RainSystem';
import { RewardItem } from '../core/systems/BoxSystem';
import { decodeIllusionWeek } from '../core/systems/SocialRank';
import { DouyinSocial, SOCIAL_KEYS, encodeIllusionWeek } from '../infra/DouyinSocial';
import { ILLUSION } from '../core/config/illusion';
import { streakMult } from '../core/config/trial';
import { TEXTS } from '../core/config/texts';
import {
    ButtonHandle,
    DESIGN_H,
    THEME,
    fadeIn,
    label,
    pageBackground,
    spriteButton,
    spritePanel,
} from '../ui/ThemeLib';
import { RainScene } from './RainScene';

export interface IllusionResultParams {
    result: RainResult;
    /** IllusionSystem.finish 发放的档位奖励（可为空） */
    rewards: RewardItem[];
    /** M14 连胜轨（#43）：结算后连胜与奖励倍率；旧调用缺省为 0 */
    streak?: number;
    mult?: number;
    /** 中断待护持：<60 且中断前连胜 >0 */
    interrupted?: boolean;
    /** 中断前的连胜层数（护持恢复用） */
    streakBefore?: number;
    /** M14-3 段位轨（#44）：本局段位分与当前段位 */
    rankGained?: number;
    rankName?: string;
    rankScore?: number;
}

/** 秘境试炼结算页：得分、连胜、档位与天道赏赐（M8 E 节 + M14 #42/#43；与渡劫结算页独立）。 */
export class IllusionResultScene implements IScene {
    node: Node;
    private p: Required<IllusionResultParams>;
    private againBtn: ButtonHandle | null = null;
    private reviveUsed = false;
    private streakLabel: Label | null = null;
    private reviveTitle: Label | null = null;
    private reviveDesc: Label | null = null;
    private reviveBtn: ButtonHandle | null = null;
    private giveUpBtn: ButtonHandle | null = null;
    private rewardLabel: Label | null = null;
    private doubleBtn: ButtonHandle | null = null;
    private doubled = false;

    constructor(params: IllusionResultParams) {
        this.node = new Node('IllusionResultScene');
        this.node.layer = Layers.Enum.UI_2D;
        this.p = {
            streak: 0, mult: 0, interrupted: false, streakBefore: 0,
            rankGained: 0, rankName: '', rankScore: 0,
            ...params,
        };
    }

    onEnter() {
        const n = this.node;
        pageBackground(n, 'art/ui/bg_result/spriteFrame');
        const r = this.p.result;

        const title = label(n, TEXTS.illusionTitle, 34, { bold: true, color: THEME.paper });
        title.setPosition(0, 512, 0);
        fadeIn(title, 14);

        const tierColor = r.score >= ILLUSION.tiers[2].at ? THEME.rainGold
            : r.score >= ILLUSION.tiers[1].at ? THEME.goldLight
                : r.score >= ILLUSION.tiers[0].at ? THEME.rainBlue : THEME.paper;
        const tierName = r.rating ?? '未入档';
        label(n, `${tierName}`, 54, { bold: true, color: tierColor }).setPosition(0, 436, 0);
        label(n, TEXTS.illusionScoreLine(r.score, Game.save.daily.illusionBest), 24, {
            color: THEME.paper, width: 560, shrink: true,
        }).setPosition(0, 384, 0);

        // M14-3 回归修复：加入「段位分」第 6 行后原 420 高面板装不下（行距 62 × 6 行
        // 需要 372+），且底边(-114)与下方奖励面板顶边(-55)重叠 59px，段位分行正好
        // 压在接缝上被裁切。重排纵向预算：行距 56、面板 372 高上移，6 行全部入面板。
        const detail = spritePanel(n, 628, 372);
        detail.setPosition(0, 154, 0);
        fadeIn(detail, 16, 0.05);
        const multText = this.p.mult > 0 ? `×${Math.round(this.p.mult * 10) / 10}` : '';
        const streakText = this.p.interrupted
            ? `连胜中断（原 ${this.p.streakBefore} 连）`
            : this.p.mult > 0
                ? `当前连胜 ${this.p.streak} 连 · 奖励倍率 ${multText}`
                : `当前连胜 ${this.p.streak} 连 · 达 60 分起累计倍率`;
        const rankText = this.p.rankName
            ? `段位分 +${this.p.rankGained} · 本赛季「${this.p.rankName}」${this.p.rankScore} 分`
            : '';
        const lines: string[] = [
            `金色灵雨    ×${r.goldCount}`,
            `最大连击    ×${r.maxCombo}`,
            `劫雨沾身    ×${r.redCount}`,
            `本周最佳    ${Game.save.illusionWeekBest} 分`,
            streakText,
            rankText,
        ].filter(Boolean);
        const LINE_STEP = 56;
        const LINE_TOP = 138; // 面板局部坐标：首行距顶 48，末行距底 44（6 行时）
        lines.forEach((t, i) => {
            const ln = label(detail, t, 26, { color: THEME.paper, align: 'left', width: 440 });
            ln.setPosition(0, LINE_TOP - i * LINE_STEP, 0);
            if (t === streakText) this.streakLabel = ln.getComponent(Label);
        });

        // 档位奖励 / 道心护持（互斥复用同一面板）：顶边统一 -60，
        // 与明细面板底边(-32)留 28px 间隙；好友对比行、按钮区随之微调
        const isRevive = this.p.interrupted && this.p.streakBefore > 0;
        const hasRewards = !isRevive && !!r.rating && this.p.rewards.length > 0;
        const rewardH = isRevive ? 220 : hasRewards ? 214 : 150;
        const rewardPanel = spritePanel(n, 628, rewardH, undefined, THEME.tintPanel);
        rewardPanel.setPosition(0, -60 - rewardH / 2, 0);
        if (isRevive) {
            this.reviveTitle = label(rewardPanel, TEXTS.trialReviveTitle, 28, { bold: true, color: THEME.goldLight }).getComponent(Label);
            this.reviveTitle!.node.setPosition(0, 74, 0);
            this.reviveDesc = label(rewardPanel, TEXTS.trialReviveDesc(this.p.streakBefore), 23, {
                color: THEME.paper, width: 560, shrink: true,
            }).getComponent(Label);
            this.reviveDesc!.node.setPosition(0, 30, 0);
            this.reviveBtn = spriteButton(rewardPanel, 320, 72, TEXTS.trialReviveBtn, () => this.revive(), {
                fontSize: 24,
                variant: 'primary',
                textColor: THEME.void,
            });
            this.reviveBtn.node.setPosition(-102, -52, 0);
            this.giveUpBtn = spriteButton(rewardPanel, 180, 72, TEXTS.trialReviveGiveUp, () => this.decline(), {
                fontSize: 23,
                variant: 'ghost',
                textColor: THEME.inkSoft,
            });
            this.giveUpBtn.node.setPosition(150, -52, 0);
        } else if (hasRewards) {
            label(rewardPanel, TEXTS.illusionTierReward(String(r.rating)), 24, { bold: true, color: THEME.goldLight })
                .setPosition(0, 66, 0);
            this.rewardLabel = label(rewardPanel, this.p.rewards.map((x) => x.label).join('　'), 25, {
                bold: true, color: THEME.paper, width: 560, shrink: true,
            }).getComponent(Label);
            this.rewardLabel!.node.setPosition(0, 16, 0);
            AudioMgr.play('rare');
            // M14-5 doubleReward（#46）：灵石与灵材再补一份（碎片/机缘不加倍），每日 3 次
            if (Game.save.daily.doubleRewardUsed < 3) {
                this.doubleBtn = spriteButton(rewardPanel, 300, 72, TEXTS.trialDoubleBtn, () => this.double(), {
                    fontSize: 24,
                    variant: 'secondary',
                    textColor: THEME.goldLight,
                });
                this.doubleBtn.node.setPosition(0, -56, 0);
            }
        } else {
            label(rewardPanel, TEXTS.illusionNoTier, 24, { bold: true, color: THEME.inkSoft, width: 560, shrink: true })
                .setPosition(0, 0, 0);
        }

        // M9b 好友对比（抖音端可用时）：幻境周榜（我的值 = 本周最佳编码）
        if (DouyinSocial.available()) {
            const save = Game.save;
            const myWeek = encodeIllusionWeek(save.illusionWeekKey, save.illusionWeekBest);
            DouyinSocial.compare(SOCIAL_KEYS.illusionWeek, myWeek, (r) => {
                if (!r || r.total === 0 || !this.node.isValid) return;
                const line = label(n, `好友对比：已超越 ${r.beat}/${r.total} 位好友 · 最高 ${decodeIllusionWeek(r.top).score} 分`, 22, {
                    color: THEME.inkSoft,
                    width: 580,
                    shrink: true,
                });
                line.setPosition(0, -316, 0);
                fadeIn(line, 8);
            });
        }

        // 再战（消耗体力）与返回。返回按钮**无条件创建**：
        // 旧版只在可再战时创建，用完次数后页面只剩一个禁用按钮，无任何出口（P0-1 教训）。
        // M14（#42）：进入凭证由「广告加次」改为体力制，1 局 1 点。
        const canAgain = Game.trial.canStart(Game.save);
        this.againBtn = spriteButton(n, 330, 88, TEXTS.illusionEnterAd, () => this.again(), {
            fontSize: 25,
            variant: 'primary',
            textColor: THEME.void,
        });
        this.againBtn.node.setPosition(-108, isRevive ? -520 : -470, 0);
        if (!canAgain) {
            this.againBtn.setEnabled(false);
            this.againBtn.setText(TEXTS.illusionNone);
        }
        const back = spriteButton(n, 206, 88, '返回仙府', () => Game.stack.popToRoot(), {
            fontSize: 26,
            variant: 'secondary',
            textColor: THEME.paper,
        });
        back.node.setPosition(166, isRevive ? -520 : -470, 0);
    }

    /** 道心护持：看广告保留连胜（单次中断仅 1 支，跳过视同放弃） */
    private revive() {
        if (this.reviveUsed) return;
        Ads.show('trialRevive', this.node, {
            onSuccess: () => {
                if (this.reviveUsed) return;
                this.reviveUsed = true;
                Game.trial.reviveStreak(Game.save, this.p.streakBefore);
                Game.persist();
                this.refreshRevive(true);
            },
            onSkip: () => this.decline(),
        });
    }

    /** 放弃护持：连胜清零 */
    private decline() {
        if (this.reviveUsed) return;
        this.reviveUsed = true;
        Game.trial.breakStreak(Game.save);
        Game.persist();
        this.refreshRevive(false);
    }

    private refreshRevive(revived: boolean) {
        if (this.reviveTitle) this.reviveTitle.string = revived ? TEXTS.trialReviveDone : TEXTS.trialReviveGone;
        if (this.reviveDesc) {
            this.reviveDesc.string = revived
                ? `下局达 60 分即续写 ${this.p.streakBefore + 1} 连`
                : '下次达 60 分将从 1 连重新累计';
        }
        this.reviveBtn?.setEnabled(false);
        this.giveUpBtn?.setEnabled(false);
        if (this.streakLabel) {
            this.streakLabel.string = revived
                ? TEXTS.trialStreakLine(this.p.streakBefore, streakMult(this.p.streakBefore))
                : TEXTS.trialStreakLine(0, 1);
        }
    }

    /** 奖励翻倍（doubleReward 位）：灵石与灵材再补一份，每日 3 次（存档计数） */
    private double() {
        if (this.doubled) return;
        Ads.show('doubleReward', this.node, {
            onSuccess: () => {
                if (this.doubled) return;
                this.doubled = true;
                const extra = Game.illusion.applyDouble(Game.save, this.p.rewards);
                Game.save.daily.doubleRewardUsed += 1;
                Game.persist();
                if (this.rewardLabel) {
                    this.rewardLabel.string = [...this.p.rewards, ...extra].map((x) => x.label).join('　');
                }
                this.doubleBtn?.setEnabled(false);
                this.doubleBtn?.setText(TEXTS.trialDoubled);
            },
        });
    }

    private again() {
        if (!Game.trial.canStart(Game.save)) {
            this.againBtn?.setEnabled(false);
            this.againBtn?.setText(TEXTS.illusionNone);
            return;
        }
        Game.trial.consumeStart(Game.save);
        Game.persist();
        // 先弹回主页再压新雨：旧栈是 [Home, Rain(已结束), 本页]，
        // swap 只会换掉本页、把已结束的旧 Rain 留在栈里。
        Game.stack.popToRoot();
        Game.stack.push(new RainScene('illusion'));
    }
}
