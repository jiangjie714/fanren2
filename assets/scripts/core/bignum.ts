/**
 * 大数紧凑格式化（M22 剑冢试炼专用，#48）。
 *
 * 剑冢的剑气半年可到 6.6×10⁸、煞晶到 10¹⁷ 量级 —— UI 全程不得出现裸数，
 * 否则玩家看到的只是一串没有意义的数字。本模块是「数值通胀看不懂」（spec R1）
 * 的唯一对策：呈现层统一走 formatCompact。
 *
 * 纯函数、无渲染、无随机源。
 */

/** 单位后缀：10⁰ 空、10³ K、10⁶ M、10⁹ B、10¹² T、10¹⁵ Q，其后进入 aa/ab/… 双字母序 */
const SHORT_SCALE = ['', 'K', 'M', 'B', 'T', 'Q'];

/**
 * 档位 → 后缀。档位 n 表示 10^(3n)。
 * 前 6 档（到 10¹⁵）沿用 K/M/B/T/Q；第 6 档起走 aa/ab/…/az（覆盖到 10^(3×31) ≈ 10⁹³，
 * 远超本作需求上限 10³³）。
 */
export function tierSuffix(tier: number): string {
    if (tier < SHORT_SCALE.length) return SHORT_SCALE[tier];
    const k = tier - SHORT_SCALE.length; // 0 → aa, 1 → ab …
    if (k < 26) return `a${String.fromCharCode(97 + k)}`;
    // 兜底：超出 az 后用 a + 数字（理论不可达，防越界而非真实需求）
    return `a${k}`;
}

/** 本作呈现上限档位：10³³（spec §8.3 要求覆盖到 aa… 区间） */
export const MAX_TIER = 11;

/**
 * 紧凑格式化：1234 → '1.23K'，6.6e8 → '660M'，1e33 → '1af'。
 * 规则：<1000 原样整数；其余按 3 位一档，尾数保留 3 位有效数字（1.23 / 12.3 / 123）。
 */
export function formatCompact(v: number): string {
    if (!Number.isFinite(v)) return '0';
    if (v === 0) return '0';
    const neg = v < 0;
    let x = Math.abs(v);
    if (x < 1000) {
        // 小额：整数直出，带小数时保留 1 位（煞晶余额常见 0.5 之类不会出现，但防除零/百分比入参）
        const s = x < 10 && !Number.isInteger(x) ? x.toFixed(1) : String(Math.floor(x));
        return neg ? `-${s}` : s;
    }
    let tier = Math.floor(Math.log10(x) / 3);
    // 浮点边界：999.999… 取到 0 档已由上面分支拦截；这里只防 log10 误差导致的错位
    if (tier < 1) tier = 1;
    if (tier > MAX_TIER) tier = MAX_TIER;
    const m = x / Math.pow(10, tier * 3);
    // 尾数修正：m 可能因浮点略小于 1（如 999.99995 → tier=1, m≈1.000）统一 clamp
    const mm = m >= 1000 ? 999.9 : m;
    const text = trimZeros(mm < 10 ? mm.toFixed(2) : mm < 100 ? mm.toFixed(1) : String(Math.floor(mm)));
    return `${neg ? '-' : ''}${text}${tierSuffix(tier)}`;
}

/** 去掉尾数多余的零：1.00 → 1，6.60 → 6.6，1.23 保持 */
function trimZeros(s: string): string {
    if (s.indexOf('.') < 0) return s;
    return s.replace(/0+$/, '').replace(/\.$/, '');
}
