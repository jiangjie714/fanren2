#!/usr/bin/env node
/**
 * 上线前核查（M10 代码侧收尾）：一键 GO/NO-GO。
 *
 * 覆盖「可静态核查」的构建期关卡 + 列出需人工/构建执行的步骤。
 * 构建期关卡有未过项时以非零退出码退出（便于 CI 卡点）。
 *
 * 用法：node tools/launch-check.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

const S = { ok: '✅', bad: '❌', warn: '⚠️ ', info: 'ℹ️ ' };

function block(src, startMarker) {
    const i = src.indexOf(startMarker);
    if (i < 0) return '';
    // 找到该 const 后的第一个 { 与匹配的 }
    const brace = src.indexOf('{', i);
    if (brace < 0) return '';
    let depth = 0;
    for (let k = brace; k < src.length; k++) {
        const c = src[k];
        if (c === '{') depth++;
        else if (c === '}') {
            depth--;
            if (depth === 0) return src.slice(brace, k + 1);
        }
    }
    return '';
}

// ---------- 1. 广告位配置 ----------
const adsSrc = read('assets/scripts/core/config/ads.ts');
const adPlacesBlock = block(adsSrc, 'export const AD_PLACES');
const idsBlock = block(adsSrc, 'export const DOUYIN_AD_UNIT_IDS');

const placeKeys = [...adPlacesBlock.matchAll(/^\s*([a-zA-Z]+):\s*\{\s*place:/gm)].map((m) => m[1]);
const idEntries = Object.fromEntries(
    [...idsBlock.matchAll(/^\s*([a-zA-Z]+):\s*'([^']*)',/gm)].map((m) => [m[1], m[2]]),
);

const total = placeKeys.length;
const missing = placeKeys.filter((k) => !idEntries[k] || idEntries[k].trim() === '');
const configured = total - missing.length;

// ---------- 2. 隐私/协议占位 ----------
const textsSrc = read('assets/scripts/core/config/texts.ts');
// 占位文案含「抖音审核必需」这一哨兵串；运营替换为正式文本/URL 后即消失
const privacyPending = /抖音审核必需/.test(textsSrc);

// ---------- 3. 模拟直通默认关（构建产物默认关；逐设备运行时态） ----------
const adsInfra = read('assets/scripts/infra/Ads.ts');
const simDefaultOff = /readSimFlag[\s\S]*?return false;/.test(adsInfra);

// ---------- 汇总 ----------
const buildReady = missing.length === 0 && !privacyPending;

console.log('\n========== 凡人开仙缘 · 上线前核查 ==========\n');
console.log('【A. 构建期关卡（静态自动核查）】');
console.log(`  ${missing.length === 0 ? S.ok : S.bad} 广告位配置：${configured}/${total} 已配` +
    (missing.length ? ` · 未配 ${missing.join('、')}` : ' · 全部就绪'));
console.log(`  ${privacyPending ? S.bad : S.ok} 用户协议/隐私政策：${privacyPending ? '仍为占位文本（待运营补充）' : '已替换'}`);
console.log(`  ${simDefaultOff ? S.ok : S.warn} 广告模拟直通默认：${simDefaultOff ? '关（构建产物默认关，逐设备运行时态）' : '⚠ 默认分支异常，请人工核对'}`);

console.log('\n【B. 需人工 / 构建执行的步骤（本工具不开箱验证）】');
console.log(`  ${S.info} AppID 注入：build.mjs 自动注入 tt93ffe5420d87d89502（构建日志核对 appid）`);
console.log(`  ${S.info} 分包布局：build.mjs verifySubpackageLayout 自动校验（subpackages/subres + game.json）`);
console.log(`  ${S.info} 模拟直通关闭：设置页长按「版本信息」1.5s → 上线自检 → 模拟直通: 关（提审设备必须关）`);
console.log(`  ${S.info} 真实广告位 ID：字节后台申请后填入 DOUYIN_AD_UNIT_IDS（共 ${total} 个）`);
console.log(`  ${S.info} 隐私/协议 URL：运营建站后替换 texts.ts 占位文案`);
console.log(`  ${S.info} 真机全流程回归：广告发奖 / 好友榜（M9b）/ 分享（仅抖音端真实生效）`);

console.log('\n【结论】');
if (buildReady) {
    console.log(`  ${S.ok} 构建期关卡全部通过（广告位已配齐 && 隐私文本已替换）。`);
    console.log('     剩余 B 节步骤为人工/构建动作，逐项执行后提交提审。');
} else {
    console.log(`  ${S.bad} 存在未过构建期关卡，提交前必须处理（见 A 节标记 ❌ 的项）。`);
}
console.log('==============================================\n');

process.exit(buildReady ? 0 : 1);
