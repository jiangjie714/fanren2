#!/usr/bin/env node
/**
 * M31 宗门社交（#57）验收截图：
 *   1. 论道页宗门 tab · 未加入态（三宗候选卡）
 *   2. 加入青云剑宗 · 主态（信息卡 + 日常三件事 + 宝库 + 邀请钮）
 *   3. 领俸禄后 · 已领禁用态
 *   4. 捐献 1000 · 返贡献点 + exp 进度变化
 *   5. 宝库兑换 · 灵石行已兑置灰
 *
 * 用法: node tools/m31-shots.mjs [port]   （需先起 tools/preview-server.mjs）
 * 产物: docs/screenshots/m31-*.png
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

// 预置灵石：捐献档位的可点态在**视图构建时**判定（初始 200 灵石三档全禁用），
// 必须在进宗门页之前注资——进去后再改存档不会触发重建，钮会保持禁用。
await page.evaluate(() => {
    const g = window.__fanren;
    if (g && g.save) { g.save.lingshi = 30000; g.persist(); }
});
await sleep(300);
await waitFrames(10);

// ── 论道 rail 钮 @(286,162) → 论道页 ──
await tap(286, 162);
if (!(await waitScene('LudaoScene'))) process.exit(1);
await sleep(700);
await waitFrames(20);

// ── 宗门 tab（5 钮 pitch 136：宗门是第 4 个 @ x=+136, y=480） ──
await tap(136, 480);
await sleep(700);
await waitFrames(20);
await shot('m31-1-join');              // 未加入态：三宗候选卡

// ── 加入青云剑宗（候选卡 cy=200，卡内加入钮 @(232,4)） ──
await tap(232, 204);
await sleep(700);
await waitFrames(20);
await shot('m31-2-main');              // 主态

// ── 领俸禄（日常卡 cy=12，俸禄钮局部 @(-205,66)） ──
await tap(-205, 78);
await sleep(600);
await waitFrames(20);
await shot('m31-3-salary-claimed');    // 已领禁用态

// ── 捐献 1000（捐献钮局部 @(-70,-110)，注资已在进页前完成） ──
await tap(-70, -98);
await sleep(600);
await waitFrames(20);
await shot('m31-4-donated');           // 捐献后：exp 进度 + 贡献点

// ── 宝库兑换灵石行（商店卡 cy=-312，首行局部 y=74 → 全局 y=-238，整行可点） ──
await tap(0, -238);
await sleep(600);
await waitFrames(20);
await shot('m31-5-shop-bought');       // 已兑置灰 + 贡献点扣减

await browser.close();
if (bad.length) {
    console.error('页面异常:\n' + bad.join('\n'));
    process.exit(1);
}
console.log('M31 五态截图完成');
