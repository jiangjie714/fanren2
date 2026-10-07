/**
 * 秘境试炼入口（M14 #42）：体力 ≥1 直接开局并扣 1 点；
 * 体力不足时引导 trialStamina 广告补给（+5 点、每日 3 次，M14-5 接线），
 * 补给次数用尽或广告跳过则提示等待回复。
 * 由 QuestScene / LudaoScene 共用，收敛到单一实现，避免两份逻辑日后分叉。
 * 旧版「免费 1 次 + 广告 1 次」次数经济已被体力制取代（#29 部分废弃）。
 */
import { Node } from 'cc';
import { Game } from './Game';
import { RainScene } from '../scenes/RainScene';
import { STAMINA_AD_PER_DAY } from '../core/config/trial';
import { TEXTS } from '../core/config/texts';
import { Ads } from './Ads';
import { toast } from '../ui/ThemeLib';

export function enterIllusion(node: Node): void {
    if (Game.trial.canStart(Game.save)) {
        Game.trial.consumeStart(Game.save);
        Game.persist();
        Game.stack.push(new RainScene('illusion'));
        return;
    }
    // 体力不足：还有补给次数 → 引导广告；否则提示等待
    if (Game.save.trial.adRefillToday < STAMINA_AD_PER_DAY) {
        Ads.show('trialStamina', node, {
            onSuccess: () => {
                Game.trial.refillByAd(Game.save);
                Game.persist();
                enterIllusion(node); // 补完体力直接进局（此时必满足 canStart）
            },
        });
        return;
    }
    toast(node, TEXTS.illusionNone);
}
