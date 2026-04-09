/** 概率公示 / 用户协议 / 隐私政策 弹窗（主页底部与设置页共用）。概率数字与 core/config 同源。 */
import { Node } from 'cc';
import { BOXES, PITY_THRESHOLD } from '../core/config/boxes';
import { RAIN_WAVES, RATE_MAX, RATE_MIN } from '../core/config/drops';
import { ILLUSION } from '../core/config/illusion';
import { REALMS } from '../core/config/realms';
import { TEXTS } from '../core/config/texts';
import { showDialog } from './dialog';

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function showProbabilityDialog(parent: Node) {
    const lines: Array<string | { text: string; color?: number }> = [
        { text: '— 境界突破基础成功率 —', color: 1 },
        ...REALMS.slice(1).map((r) => `${r.name}：${pct(r.baseRate)}（机缘 ${r.needJiyuan}）`),
        { text: '— 宝箱产出概率 —', color: 1 },
        ...BOXES.map((b) => `${b.name}：普通${pct(b.normalRate)} / 稀有${pct(b.rareRate)} / 劫难${pct(b.disasterRate)}`),
        { text: `天道保底：连续 ${PITY_THRESHOLD} 次未得稀有，下次必出稀有`, color: 3 },
        { text: '— 灵气雨雨滴权重（三波，金/蓝/劫）—', color: 1 },
        ...RAIN_WAVES.map((w) => `${w.name}：${w.weights[0]} / ${w.weights[1]} / ${w.weights[2]}`),
        '劫云压顶波：劫雨权重 +2×(境界-1)，落速 +5%/境界',
        `月卡特权：各波劫雨权重 -3（约 -20%）`,
        { text: `— 心魔幻境（15 秒）—`, color: 1 },
        `金雨 ${ILLUSION.goldWeight} / 劫雨 ${ILLUSION.redWeight}（无清雨），落速 ×1.3`,
        { text: `最终突破成功率区间：${pct(RATE_MIN)} ~ ${pct(RATE_MAX)}`, color: 3 },
    ];
    showDialog(parent, {
        title: TEXTS.probabilityTitle,
        lines,
        width: 640,
        buttons: [{ text: '关闭' }],
    });
}

export function showAgreementDialog(parent: Node) {
    showDialog(parent, {
        title: TEXTS.agreementTitle,
        lines: [TEXTS.agreementPending],
        buttons: [{ text: '关闭' }],
    });
}

export function showPrivacyDialog(parent: Node) {
    showDialog(parent, {
        title: TEXTS.privacyTitle,
        lines: [TEXTS.privacyPending],
        buttons: [{ text: '关闭' }],
    });
}
