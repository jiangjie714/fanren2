#!/usr/bin/env node
/**
 * M30 剧情文本（#56）三态验收截图：
 *   1. opening 打字机进行中（首行部分显现）
 *   2. opening 首行补完 + 「点按继续」提示
 *   3. dim 点击推进到第二行（说话者 chip / 正文切换）
 *   4. 修仙之路页：底部仙闻录入口卡（已听闻计数）
 *   5. 仙闻录页：听过行真实标题 + 未听行「？？？」不剧透
 *
 * 用法: node tools/m30-shots.mjs [port]   （需先起 tools/preview-server.mjs）
 * 产物: docs/screenshots/m30-*.png
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
    // 性能面板是引擎调试构件，晚于首次 evaluate 才创建——再关一次确保截屏干净
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
/** 等栈顶场景切到目标名（导航接线生效的判据） */
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

// ── 捏人流：随机道号 → 踏入仙途（进首页即触发 opening） ──
await tap(-148, -330);
await sleep(300);
await tap(148, -330);
if (!(await waitScene('HomeScene'))) process.exit(1);
// 等演出层开演（Game.tick 每帧 sync，进首页第一帧即开场）
await sleep(250);
await waitFrames(10);
await shot('m30-1-opening-typing');   // 打字机进行中（首行部分显现）
await sleep(900);
await waitFrames(10);
await shot('m30-2-opening-full');     // 首行补完 + 「点按继续 ▸」
// dim 点击推进（点面板上方空白处，避开面板与跳过钮）
await tap(0, 300);
await sleep(1050);
await waitFrames(10);
await shot('m30-3-opening-line2');    // 第二行
// 跳过钮：面板内右上角（面板 @(0,-462)，钮在面板局部 (250,106)）
await tap(250, -356);
await sleep(600);
await waitFrames(10);

// 结束新手引导：引导层遮罩会吞掉首页上的点击（M27 既有行为，全屏 mask + Button 吸点击），
// 先按玩家「跳过引导」的等效效果落档，再点仙路圆钮
await page.evaluate(() => {
    const g = window.__fanren;
    if (g && g.save && g.save.tutorial) { g.save.tutorial.done = true; g.persist(); }
});
await sleep(400);
await waitFrames(10);

// 补一条「听过」记录，让仙闻录截图同时呈现「真实标题」与「？？？」两种行态
await page.evaluate(() => {
    const g = window.__fanren;
    if (g && g.save && g.save.story && g.save.story.seen.indexOf('realm_1') < 0) {
        g.save.story.seen.push('realm_1');
        g.persist();
    }
});

// ── 仙路圆钮 → 修仙之路页（底部仙闻录入口卡） ──
await tap(286, -46);
if (!(await waitScene('PathScene'))) process.exit(1);
await sleep(700);
await waitFrames(20);
await shot('m30-4-path-entry');

// ── 入口卡 → 仙闻录 ──
await tap(0, -410);
if (!(await waitScene('StoryArchiveScene'))) process.exit(1);
await sleep(700);
await waitFrames(20);
await shot('m30-5-archive');

await browser.close();
if (bad.length) {
    console.error('页面异常:\n' + bad.join('\n'));
    process.exit(1);
}
console.log('M30 三态截图完成');
