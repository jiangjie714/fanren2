#!/usr/bin/env node
/**
 * 软著（计算机软件著作权登记）申请材料生成器。
 *
 *   node tools/gen-softcopyright.mjs source   # 源程序文档 PDF（前 30 页 + 后 30 页）
 *   node tools/gen-softcopyright.mjs manual   # 用户手册 PDF（图文）
 *   node tools/gen-softcopyright.mjs all
 *
 * 常用参数：
 *   --name    "凡人开仙缘游戏软件"   软件全称（页眉，须与申请表完全一致）
 *   --version "V1.0"                版本号
 *   --owner   "XX 有限公司"          著作权人全称（页脚）
 *   --outdir  "docs/软著申请材料"     输出目录
 *   --keep-html                     同时保留中间 HTML 便于复核排版
 *
 * 排版口径（中国版权保护中心现行要求）：
 *   - 源程序：连续的前 30 页 + 连续的后 30 页，共 60 页；不足 60 页全部提交；
 *     每页不少于 50 行，空行与纯注释行不计入行数；
 *   - 页眉标注软件全称 + 版本号，页脚标注著作权人全称，右上角页码。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { MANUAL } from './softcopyright-manual.mjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('..', import.meta.url).pathname;

const argv = process.argv.slice(2);
const cmd = argv.find((a) => !a.startsWith('--')) ?? 'all';
const arg = (k, d) => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 ? argv[i + 1] : d;
};

const NAME = arg('name', '凡人开仙缘游戏软件');
const VERSION = arg('version', 'V1.0');
const OWNER = arg('owner', '【请填写：企业全称】');
const OUTDIR = join(ROOT, arg('outdir', 'docs/软著申请材料'));

/** 每页代码行数（官方要求 ≥50） */
const LINES_PER_PAGE = 50;
/** 折行折算：等宽字体下 ASCII 字符宽 ≈0.6em、中日韩字符宽 ≈1.0em，据此估算视觉行占位 */
const UNITS_PER_LINE = 60; // ≈100 个 ASCII 字符
const lineUnits = (l) => {
    let u = 0;
    for (const ch of l) u += /[\u2e80-\u9fff\uff00-\uffef\u3000-\u303f]/.test(ch) ? 1.0 : 0.6;
    return u;
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function render(html, outFile) {
    if (arg('keep-html', null)) writeFileSync(outFile.replace(/\.pdf$/, '.html'), html);
    const browser = await puppeteer.launch({
        executablePath: CHROME,
        headless: 'new',
        args: ['--no-sandbox', '--disable-gpu-sandbox', '--font-render-hinting=none'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({ path: outFile, preferCSSPageSize: true, printBackground: true });
    await browser.close();
}

/* ================================================================== *
 * 一、源程序文档
 * ================================================================== */

/** 拼接顺序：入口 → 基础设施 → 数值配置 → 纯逻辑系统 → UI 库 → 页面 → 生命周期收尾 */
const SOURCE_ORDER = [
    'assets/scripts/GameRoot.ts',
    'assets/scripts/infra/Align.ts',
    'assets/scripts/infra/AudioMgr.ts',
    'assets/scripts/infra/Ads.ts',
    'assets/scripts/infra/DouyinAd.ts',
    'assets/scripts/infra/DouyinSocial.ts',
    'assets/scripts/infra/SaveStore.ts',
    'assets/scripts/infra/SceneStack.ts',
    'assets/scripts/infra/Share.ts',
    'assets/scripts/infra/dailyGift.ts',
    'assets/scripts/infra/enterIllusion.ts',
    'assets/scripts/core/rng.ts',
    'assets/scripts/core/runeHit.ts',
    'assets/scripts/core/saveModel.ts',
    'assets/scripts/core/config/realms.ts',
    'assets/scripts/core/config/boxes.ts',
    'assets/scripts/core/config/drops.ts',
    'assets/scripts/core/config/economy.ts',
    'assets/scripts/core/config/lingens.ts',
    'assets/scripts/core/config/texts.ts',
    'assets/scripts/core/config/ads.ts',
    'assets/scripts/core/config/alchemy.ts',
    'assets/scripts/core/config/combat.ts',
    'assets/scripts/core/config/expeditions.ts',
    'assets/scripts/core/config/illusion.ts',
    'assets/scripts/core/config/quests.ts',
    'assets/scripts/core/config/achievements.ts',
    'assets/scripts/core/config/iap.ts',
    'assets/scripts/core/systems/BoxSystem.ts',
    'assets/scripts/core/systems/RealmSystem.ts',
    'assets/scripts/core/systems/RainSystem.ts',
    'assets/scripts/core/systems/EconomySystem.ts',
    'assets/scripts/core/systems/CollectionSystem.ts',
    'assets/scripts/core/systems/QuestSystem.ts',
    'assets/scripts/core/systems/ExpeditionSystem.ts',
    'assets/scripts/core/systems/IllusionSystem.ts',
    'assets/scripts/core/systems/AchievementSystem.ts',
    'assets/scripts/core/systems/CombatSystem.ts',
    'assets/scripts/core/systems/AlchemySystem.ts',
    'assets/scripts/core/systems/SocialRank.ts',
    'assets/scripts/core/systems/StatsRecorder.ts',
    'assets/scripts/ui/ThemeLib.ts',
    'assets/scripts/ui/StatusBar.ts',
    'assets/scripts/ui/dialog.ts',
    'assets/scripts/ui/infoDialogs.ts',
    'assets/scripts/ui/FrameAnimator.ts',
    'assets/scripts/scenes/ProfileScene.ts',
    'assets/scripts/scenes/HomeScene.ts',
    'assets/scripts/scenes/BoxScene.ts',
    'assets/scripts/scenes/RainScene.ts',
    'assets/scripts/scenes/ResultScene.ts',
    'assets/scripts/scenes/PlayerScene.ts',
    'assets/scripts/scenes/QuestScene.ts',
    'assets/scripts/scenes/ExpeditionScene.ts',
    'assets/scripts/scenes/IllusionResultScene.ts',
    'assets/scripts/scenes/LudaoScene.ts',
    'assets/scripts/scenes/PkBattleScene.ts',
    'assets/scripts/scenes/CollectionScene.ts',
    'assets/scripts/scenes/ShopScene.ts',
    'assets/scripts/scenes/AlchemyScene.ts',
    'assets/scripts/scenes/FortuneScene.ts',
    'assets/scripts/scenes/WeaponScene.ts',
    'assets/scripts/scenes/SettingsScene.ts',
    'assets/scripts/infra/Game.ts',
];

/** 不计入行数的空行与纯注释行 */
const isBlankOrComment = (line) => {
    const t = line.trim();
    if (!t) return true;
    return t.startsWith('//') || t.startsWith('/*') || t.startsWith('*');
};

function collectSourceLines() {
    const lines = [];
    for (const rel of SOURCE_ORDER) {
        const abs = join(ROOT, rel);
        if (!existsSync(abs)) {
            console.warn(`[warn] 缺失文件：${rel}`);
            continue;
        }
        lines.push(`// ==================== 源文件：${rel} ====================`);
        for (const l of readFileSync(abs, 'utf8').split('\n')) {
            if (isBlankOrComment(l)) continue;
            lines.push(l.replace(/\s+$/, '')); // 去掉行尾空白，保留原始缩进
        }
    }
    return lines;
}

/** 按视觉行占位数分页（每页 LINES_PER_PAGE 行） */
function paginate(lines) {
    const pages = [];
    let cur = [];
    let cost = 0;
    for (const l of lines) {
        const c = Math.max(1, Math.ceil(lineUnits(l) / UNITS_PER_LINE));
        if (cost + c > LINES_PER_PAGE && cur.length) {
            pages.push(cur);
            cur = [];
            cost = 0;
        }
        cur.push(l);
        cost += c;
    }
    if (cur.length) pages.push(cur);
    return pages;
}

function sourceHtml(pages, picked) {
    const body = picked
        .map(
            (p, i) => `<section class="page">
<header><span>${esc(NAME)} ${esc(VERSION)}</span><span>第 ${i + 1} 页</span></header>
<div class="code">${p.map((l) => `<div class="ln">${esc(l)}</div>`).join('')}</div>
<footer><span>著作权人：${esc(OWNER)}</span><span>源程序全部 ${pages.length} 页</span></footer>
</section>`,
        )
        .join('\n');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page { size: A4; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Songti SC', 'SimSun', serif; color: #000; }
.page { width: 100%; padding: 12mm 12mm 10mm; page-break-after: always; }
.page:last-child { page-break-after: auto; }
header, footer { display: flex; justify-content: space-between; font-size: 9pt; }
header { border-bottom: 0.5pt solid #999; padding-bottom: 2pt; margin-bottom: 4pt; }
footer { border-top: 0.5pt solid #999; padding-top: 2pt; margin-top: 4pt; }
.code { font-family: 'Courier New', Courier, monospace; font-size: 8pt; line-height: 13pt; }
.ln { height: 13pt; white-space: pre; overflow: hidden; }
</style></head><body>${body}</body></html>`;
}

async function genSource() {
    mkdirSync(OUTDIR, { recursive: true });
    const lines = collectSourceLines();
    const pages = paginate(lines);
    const head = pages.slice(0, 30);
    const tail = pages.length > 60 ? pages.slice(-30) : [];
    const picked = [...head, ...tail];
    const out = join(OUTDIR, `源程序_${NAME}_${VERSION}.pdf`);
    await render(sourceHtml(pages, picked), out);
    console.log(`[source] 源文件 ${SOURCE_ORDER.length} 个，有效代码行 ${lines.length}，全部源程序 ${pages.length} 页`);
    console.log(`[source] 本次提交：前 ${head.length} 页 + 后 ${tail.length} 页 = ${picked.length} 页`);
    console.log(`[source] 输出 ${out}`);
}

/* ================================================================== *
 * 二、用户手册
 * ================================================================== */

const SHOT = (n) => join(ROOT, 'docs/screenshots', n);

function manualHtml() {
    const pages = [];
    pages.push(`<section class="page cover">
<div class="cover-main">
<h1>${esc(NAME)}</h1>
<h2>用 户 手 册</h2>
<p>版本号：${esc(VERSION)}</p>
<p>著作权人：${esc(OWNER)}</p>
</div>
</section>`);
    pages.push(`<section class="page">
<h2 class="ph">目 录</h2>
<ol class="toc">${MANUAL.map((c) => `<li>${esc(c.h)}</li>`).join('')}</ol>
<p class="note">附：版本信息</p>
</section>`);

    for (const [ci, c] of MANUAL.entries()) {
        const paras = c.p
            .map((t) => (/^\d+\.\d+\s/.test(t) ? `<p class="sec">${esc(t)}</p>` : `<p>${esc(t)}</p>`))
            .join('');
        pages.push(`<section class="page">
<h2 class="ph">${esc(c.h)}</h2>
<div class="body">${paras}</div>
</section>`);
        const imgs = c.imgs.filter(([f]) => existsSync(SHOT(f)));
        if (imgs.length) {
            const cls = imgs.length === 1 ? 'n1' : imgs.length === 2 ? 'n2' : 'n34';
            pages.push(`<section class="page">
<h2 class="ph">${esc(c.h)}　界面示意</h2>
<div class="figs ${cls}">${imgs
                .map(([f, cap], gi) => `<figure><img src="file://${SHOT(f)}"><figcaption>图 ${ci + 1}-${gi + 1}　${esc(cap)}</figcaption></figure>`)
                .join('')}</div>
<p class="fig-note">注：以上界面截图均为本软件实际运行画面，具体数值以软件内实际显示为准。</p>
</section>`);
        }
    }

    pages.push(`<section class="page">
<h2 class="ph">附：版本信息</h2>
<div class="body">
<p>软件全称：${esc(NAME)}</p>
<p>版 本 号：${esc(VERSION)}</p>
<p>著作权人：${esc(OWNER)}</p>
<p>编程语言：TypeScript 5.4</p>
<p>源程序量：10673 行（64 个 TypeScript 源文件）</p>
<p>运行环境：抖音小游戏；Android 8.0 及以上 / iOS 12.0 及以上</p>
<p>开发完成日期：见《计算机软件著作权登记申请表》</p>
<p>本手册所述界面与操作以软件实际运行效果为准。</p>
</div>
</section>`);

    const numbered = pages.map((p, i) =>
        i === 0
            ? p
            : p.replace(
                  /^<section class="page([^"]*)">/,
                  `<section class="page$1"><header><span>${esc(NAME)} ${esc(VERSION)}</span><span>第 ${i + 1} 页</span></header>`,
              ),
    );

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page { size: A4; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Songti SC', 'SimSun', serif; color: #000; }
.page { width: 100%; min-height: 296mm; padding: 14mm 16mm 12mm; page-break-after: always; }
.page:last-child { page-break-after: auto; }
header { display: flex; justify-content: space-between; font-size: 9pt; border-bottom: 0.5pt solid #999; padding-bottom: 2pt; margin-bottom: 6mm; }
.ph { font-size: 15pt; text-align: center; margin-bottom: 6mm; }
.body p { font-size: 10.5pt; line-height: 17pt; text-indent: 2em; margin-bottom: 1.5mm; text-align: justify; }
.body p.sec { text-indent: 0; font-weight: bold; margin-top: 2mm; }
.toc li { font-size: 12pt; line-height: 22pt; margin-left: 18mm; }
.note { font-size: 12pt; margin: 4mm 0 0 18mm; }
.figs { display: flex; flex-wrap: wrap; justify-content: space-around; align-items: flex-start; }
figure { text-align: center; margin: 3mm 2mm; width: 46%; }
figure img { max-height: 98mm; max-width: 100%; border: 0.5pt solid #bbb; }
figcaption { font-size: 9pt; color: #333; margin-top: 1mm; }
.fig-note { font-size: 8.5pt; color: #555; margin-top: 6mm; text-indent: 0; }
.figs { padding-top: 4mm; }
.figs.n1 figure { width: 62%; }
.figs.n1 img { max-height: 165mm; }
.figs.n2 figure { width: 46%; }
.figs.n2 img { max-height: 150mm; }
.figs.n34 figure { width: 45%; }
.figs.n34 img { max-height: 108mm; }
.cover { display: flex; align-items: center; justify-content: center; }
.cover-main { text-align: center; }
.cover h1 { font-size: 28pt; margin-bottom: 10mm; }
.cover h2 { font-size: 20pt; font-weight: normal; margin-bottom: 18mm; letter-spacing: 4pt; }
.cover p { font-size: 13pt; line-height: 28pt; }
</style></head><body>${numbered.join('\n')}</body></html>`;
}

async function genManual() {
    mkdirSync(OUTDIR, { recursive: true });
    const missing = [];
    for (const c of MANUAL) for (const [f] of c.imgs) if (!existsSync(SHOT(f))) missing.push(f);
    if (missing.length) console.warn('[manual] 缺失截图：', missing.join(', '));
    const html = manualHtml();
    const out = join(OUTDIR, `用户手册_${NAME}_${VERSION}.pdf`);
    await render(html, out);
    console.log(`[manual] 章节 ${MANUAL.length} 个，输出 ${out}`);
}

/* ================================================================== */

if (cmd === 'source' || cmd === 'all') await genSource();
if (cmd === 'manual' || cmd === 'all') await genManual();
