/**
 * 心魔幻境入口：免费档直接进、广告档看完广告才扣次数（防二次发放，P0-3 同源逻辑）。
 * 由 QuestScene / LudaoScene 共用，收敛到单一实现，避免两份逻辑日后分叉。
 */
import { Node } from 'cc';
import { Game } from './Game';
import { Ads } from './Ads';
import { RainScene } from '../scenes/RainScene';
import { TEXTS } from '../core/config/texts';
import { toast } from '../ui/ThemeLib';

export function enterIllusion(node: Node): void {
    const kind = Game.illusion.startKind(Game.save);
    if (kind === 'none') {
        toast(node, TEXTS.illusionNone);
        return;
    }
    if (kind === 'free') {
        Game.illusion.consumeStart(Game.save, 'free');
        Game.persist();
        Game.stack.push(new RainScene('illusion'));
        return;
    }
    Ads.show('illusionExtra', node, {
        onSuccess: () => {
            if (!Game.illusion.consumeStart(Game.save, 'ad')) return;
            Game.persist();
            Game.stack.push(new RainScene('illusion'));
        },
    });
}
