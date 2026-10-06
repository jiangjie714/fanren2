import { Color, Layers, Node } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { AudioMgr } from '../infra/AudioMgr';
import { RainResult } from '../core/systems/RainSystem';
import { RewardItem } from '../core/systems/BoxSystem';
import { decodeIllusionWeek } from '../core/systems/SocialRank';
import { DouyinSocial, SOCIAL_KEYS, encodeIllusionWeek } from '../infra/DouyinSocial';
import { ILLUSION } from '../core/config/illusion';
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
}

/** 心魔幻境结算页：得分、档位与天道赏赐（M8 E 节；与渡劫结算页独立）。 */
export class IllusionResultScene implements IScene {
    node: Node;
    private p: IllusionResultParams;
    private againBtn: ButtonHandle | null = null;

    constructor(params: IllusionResultParams) {
        this.node = new Node('IllusionResultScene');
        this.node.layer = Layers.Enum.UI_2D;
        this.p = params;
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

        const detail = spritePanel(n, 628, 360);
        detail.setPosition(0, 120, 0);
        fadeIn(detail, 16, 0.05);
        const lines: string[] = [
            `金色灵雨    ×${r.goldCount}`,
            `最大连击    ×${r.maxCombo}`,
            `劫雨沾身    ×${r.redCount}`,
            `本周最佳    ${Game.save.illusionWeekBest} 分`,
        ];
        lines.forEach((t, i) => {
            label(detail, t, 26, { color: THEME.paper, align: 'left', width: 440 })
                .setPosition(0, 128 - i * 62, 0);
        });

        // 档位奖励
        const rewardPanel = spritePanel(n, 628, 150, undefined, THEME.tintPanel);
        rewardPanel.setPosition(0, -130, 0);
        if (r.rating && this.p.rewards.length) {
            label(rewardPanel, TEXTS.illusionTierReward(String(r.rating)), 24, { bold: true, color: THEME.goldLight })
                .setPosition(0, 44, 0);
            label(rewardPanel, this.p.rewards.map((x) => x.label).join('　'), 25, {
                bold: true, color: THEME.paper, width: 560, shrink: true,
            }).setPosition(0, -8, 0);
            AudioMgr.play('rare');
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
                line.setPosition(0, -246, 0);
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
        this.againBtn.node.setPosition(-108, -470, 0);
        if (!canAgain) {
            this.againBtn.setEnabled(false);
            this.againBtn.setText(TEXTS.illusionNone);
        }
        const back = spriteButton(n, 206, 88, '返回仙府', () => Game.stack.popToRoot(), {
            fontSize: 26,
            variant: 'secondary',
            textColor: THEME.paper,
        });
        back.node.setPosition(166, -470, 0);
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
