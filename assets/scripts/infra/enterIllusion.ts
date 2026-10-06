/**
 * 秘境试炼入口（M14 #42）：体力 ≥1 直接开局并扣 1 点；
 * 体力不足时提示等待回复（广告补给 trialStamina 在 M14-5 接入）。
 * 由 QuestScene / LudaoScene 共用，收敛到单一实现，避免两份逻辑日后分叉。
 * 旧版「免费 1 次 + 广告 1 次」次数经济已被体力制取代（#29 部分废弃）。
 */
import { Node } from 'cc';
import { Game } from './Game';
import { RainScene } from '../scenes/RainScene';
import { TEXTS } from '../core/config/texts';
import { toast } from '../ui/ThemeLib';

export function enterIllusion(node: Node): void {
    if (!Game.trial.canStart(Game.save)) {
        toast(node, TEXTS.illusionNone);
        return;
    }
    Game.trial.consumeStart(Game.save);
    Game.persist();
    Game.stack.push(new RainScene('illusion'));
}
