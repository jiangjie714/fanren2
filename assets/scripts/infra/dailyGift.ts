/**
 * 每日仙缘领取（主页与商店同源逻辑，P0-3 防二次发放的唯一修复点）。
 *
 * 关键点（任一处改动须同步，故抽到此处单一实现）：
 * - 发放前以存档实时值复核 `dailyGiftUsed`，已领取者绝不二次发奖（击穿 balance 护栏的根因）；
 * - 广告看完才标记已领并发免费凡俗宝盒（先补 50 灵石再开箱，净消耗 0）；
 * - 开箱失败回滚每日标记并提示，绝不静默无反应。
 */
import { Node } from 'cc';
import { AdPlace } from '../core/config/ads';
import { Game } from './Game';
import { Ads } from './Ads';
import { BoxScene } from '../scenes/BoxScene';
import { toast } from '../ui/ThemeLib';

/** 领取每日仙缘（看广告得免费凡俗宝盒）。`place` 默认 dailyGift，调用方可显式传入配置位。 */
export function claimDailyGift(node: Node, place: AdPlace = 'dailyGift'): void {
    if (Game.save.daily.dailyGiftUsed) {
        toast(node, '今日仙缘已领取，明天再来');
        return;
    }
    Ads.show(place, node, {
        onSuccess: () => {
            Game.save.daily.dailyGiftUsed = true;
            Game.eco.addLingshi(50, false); // 补足开资，净消耗 0
            try {
                const r = Game.box.open('fansu');
                Game.persist();
                Game.stack.push(new BoxScene(r));
            } catch (e) {
                // 开箱失败：回滚每日标记并发提示，绝不静默无反应
                Game.save.daily.dailyGiftUsed = false;
                Game.persist();
                console.error('[fanren] dailyGift open failed', e);
                toast(node, '领取异常，今日次数已退还，请重试');
            }
        },
        onSkip: () => {
            // 广告未看完（含广告位未配置）：明确反馈，避免"点了没反应"
            toast(node, '广告未看完，本次未获得奖励');
        },
    });
}
