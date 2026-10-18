#!/usr/bin/env node
/**
 * A20 补签 / 双倍签到（#58）验收截图：
 *   1. 常规态（从未领取）：无补签卡、无翻倍钮，布局与存量一致
 *   2. 补签态（gap=2）：补签卡 + 顺序警示 + 主按钮下移 -340
 *   3. 补领成功：补签入口消失，主按钮回 -245 显示第 7 天档 800
 *   4. 翻倍就绪：今日已领 → 主按钮置灰 + 翻倍钮 -345
 *   5. 已翻倍：翻倍钮转「今日已翻倍」置灰
 *
 * 广告走 Web MockAdProvider（3 秒倒计时模拟窗），故每次看广告后需等 ~5s。
 * 改存档后必须手动触发 onResume() 重建（可点态在视图构建时判定）。
 *
 * 用法: node tools/a20-shots.mjs [port]   （需先起 tools/preview-server.mjs）
 * 产物: docs/screenshots/a20-*.png
 */
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const port = process.argv[2] ?? '8323';
const url = `http://127.0.0.1:${port}/`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VIEW = { width: 720, height: 1280 };

const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    defaultViewport: VIEW,
    args: ['--no-sandbox', '--disable-gpu-sandbox'],
});
const page = await browser.newPage();
await page.setViewport(VIEW);

const bad = [];
page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) bad.push(`${r.status()} ${r.url()}`);
});
page.on('pageerror', (e) => bad.push('pageerror: ' + e.message.slice(0, 160)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFrames(n = 40) {
    await page.evaluate(
        (count) => new Promise((res) => {
            let i = 0;
            const tick = () => (++i >= count ? res(i) : requestAnimationFrame(tick));
            requestAnimationFrame(tick);
        }),
        n,
    );
}
async function boot() {
    for (let i = 0; i < 60; i++) {
        const ok = await page.evaluate(
            () => !!(window.cc && cc.director && cc.director.getScene() && cc.director.getScene().name === 'main'),
        );
        if (ok) break;
        await sleep(500);
    }
    await page.evaluate(() => { try { cc.debug.setDisplayStats(false); } catch { /* 无调试面板时忽略 */ } });
    await sleep(900);
    await waitFrames(30);
    await page.evaluate(() => { try { cc.debug.setDisplayStats(false); } catch { /* 已关闭 */ } });
}
/** 设计系坐标 → 屏幕像素（720×1280 视口，半高 640） */
const pt = (dx, dy) => [VIEW.width / 2 + dx, VIEW.height / 2 - dy];
async function tap(dx, dy) {
    const [x, y] = pt(dx, dy);
    await page.mouse.click(x, y);
}
async function shot(name) {
    const s = await page.screenshot({ type: 'png' });
    writeFileSync(`docs/screenshots/${name}.png`, s);
    console.log(`saved -> docs/screenshots/${name}.png`);
}
async function waitScene(name, ms = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
        const cur = await page.evaluate(() => (window.__fanren && window.__fanren.stack ? window.__fanren.stack.top.node.name : ''));
        if (cur === name) return true;
        await sleep(200);
    }
    console.error(`等待场景 ${name} 超时，当前 = ${await page.evaluate(() => (window.__fanren || {}).stack?.top?.node?.name)}`);
    return false;
}
/** 改存档 + 手动重建当前签到页（可点态在构建时判定，不重建不刷新） */
async function setCheckinAndRebuild(patch) {
    await page.evaluate((p) => {
        const g = window.__fanren;
        Object.assign(g.save.checkin, p);
        g.persist();
        g.stack.top.onResume();
    }, patch);
    await sleep(400);
    await waitFrames(15);
}
/** 昨天/前天的日期键（UTC 口径，与 shiftDay 一致） */
function dayKey(offset) {
    const d = new Date(Date.now() + offset * 86_400_000);
    const p = (x) => (x < 10 ? '0' + x : '' + x);
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

await page.goto(url, { waitUntil: 'domcontentloaded' });
await boot();

// ── 捏人流：随机道号 → 踏入仙途 ──
await tap(-148, -330);
await sleep(300);
await tap(148, -330);
if (!(await waitScene('HomeScene'))) process.exit(1);
await sleep(400);
await waitFrames(10);
// opening 演出开演：跳过（面板内右上角跳过钮）
await tap(250, -356);
await sleep(500);
await waitFrames(10);
// 结束新手引导（引导遮罩全屏吸点击，先落档再导航）
await page.evaluate(() => {
    const g = window.__fanren;
    if (g && g.save && g.save.tutorial) { g.save.tutorial.done = true; g.persist(); }
});
await sleep(400);
await waitFrames(10);

// ── 签到 rail 钮 @(-286,266) → 签到页 ──
await tap(-286, 266);
if (!(await waitScene('CheckinScene'))) process.exit(1);
await sleep(700);
await waitFrames(20);

// ── 1. 常规态（新档从未领取）：无补签卡、无翻倍钮 ──
await shot('a20-1-regular');

// ── 2. 补签态：恰好漏昨日（gap=2），streak=5 → 补第 6 天档 350 ──
await setCheckinAndRebuild({ lastDay: dayKey(-2), streak: 5, totalDays: 5, makeupDay: '', doubledDay: '' });
await shot('a20-2-makeup');

// ── 3. 看广告补领（补签卡内按钮全局 @(215,-235)）→ mock 3 秒倒计时 → 入账重建 ──
await tap(215, -235);
await sleep(5200);
await waitFrames(20);
await shot('a20-3-makeup-done');          // 补签入口消失，主按钮回 -245（第 7 天档 800）

// ── 4. 领取今日（主按钮 @(0,-245)）→ 今日已领 + 翻倍钮出现 ──
await tap(0, -245);
await sleep(600);
await waitFrames(20);
await shot('a20-4-double-ready');

// ── 5. 看广告翻倍（翻倍钮 @(0,-345)）→ mock 倒计时 → 「今日已翻倍」置灰 ──
await tap(0, -345);
await sleep(5200);
await waitFrames(20);
await shot('a20-5-double-done');

await browser.close();
if (bad.length) {
    console.error('页面异常:\n' + bad.join('\n'));
    process.exit(1);
}
console.log('A20 五态截图完成');
