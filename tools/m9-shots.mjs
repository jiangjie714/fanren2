#!/usr/bin/env node
/**
 * M9a 截图：论道页三 tab（排行降级版/幻境/成就）+ 成就领取 + 主页论道红点。
 * 用法: node tools/m9-shots.mjs [port]
 */
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const port = process.argv[2] ?? '8321';
const url = `http://127.0.0.1:${port}/`;
const out = (n) => `docs/screenshots/m9-${n}.png`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    defaultViewport: { width: 720, height: 1280 },
    args: ['--no-sandbox', '--disable-gpu-sandbox'],
});
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function boot() {
    for (let i = 0; i < 40; i++) {
        const ok = await page.evaluate(() => !!(window.cc && cc.director && cc.director.getScene() && cc.director.getScene().name === 'main'));
        if (ok) break;
        await sleep(500);
    }
    await page.evaluate(() => { try { cc.debug.setDisplayStats(false); } catch {} });
    await sleep(800);
}
const shot = async (name) => {
    writeFileSync(out(name), await page.screenshot());
    console.log(`saved ${out(name)}`);
};
const pt = (dx, dy) => [360 + dx, 640 - dy];
async function tap(dx, dy) {
    const [x, y] = pt(dx, dy);
    await page.mouse.click(x, y);
}
async function waitForSaveKey() {
    for (let i = 0; i < 30; i++) {
        const has = await page.evaluate(() => !!localStorage.getItem('fanren_save_v1'));
        if (has) return;
        await sleep(300);
    }
    throw new Error('save key never appeared');
}

// 造状态：10 项成就已达成未领取（红点+领取态），4 件图鉴，周最佳 66
await page.evaluate(() => localStorage.removeItem('fanren_save_v1'));
await page.reload({ waitUntil: 'domcontentloaded' });
await boot();
await waitForSaveKey();
await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('fanren_save_v1'));
    // M11 捏人档：未设道号会进 ProfileScene 挡住巡检
    s.profile = { gender: 'm', name: '云隐', createdAt: Date.now() };
    s.stats = { opens: 100, breakthroughWins: 1, breakthroughFails: 0, bestTribScore: 82, bestCombo: 15, perfectTribulations: 1, lingshiEarned: 100000 };
    s.unlocked = ['jinmu', 'shuituo', 'huoyan', 'fenglei'];
    s.illusionBestEver = 130;
    s.illusionWeekBest = 66;
    localStorage.setItem('fanren_save_v1', JSON.stringify(s));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await boot();
await shot('01-home-ludao');

// 论道页：排行 tab（降级版）
await tap(286, 110);
await sleep(900);
await shot('02-ludao-rank');

// 成就 tab + 领取一枚
await tap(216, 480);            // 第三枚 tab（成就）
await sleep(700);
await shot('03-ludao-achieve');
await tap(-262, 294);           // 第一张卡「领取」
await sleep(700);
await shot('04-achieve-claim');
await tap(0, -90);              // 收下（兜底关弹窗）
await sleep(400);
await tap(0, -140);

// 幻境 tab
await tap(0, 480);              // 第二枚 tab（幻境）
await sleep(700);
await shot('05-ludao-illusion');

await browser.close();
console.log('done');
