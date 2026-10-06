#!/usr/bin/env node
/**
 * M14-3 段位轨冒烟截图：注入上赛季周奖待领存档 → 论道页秘境 tab（段位行 + 领奖按钮）
 * → 点领取 → toast。用法: node tools/m14b-shot.mjs [port]
 */
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const port = process.argv[2] ?? '8344';
const url = `http://127.0.0.1:${port}/`;
const out = (n) => `docs/screenshots/m14-${n}.png`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    defaultViewport: { width: 720, height: 1280 },
    args: ['--no-sandbox', '--disable-gpu-sandbox'],
});
const page = await browser.newPage();
const bad = [];
page.on('pageerror', (e) => bad.push('pageerror: ' + e.message.slice(0, 160)));
await page.goto(url, { waitUntil: 'domcontentloaded' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function boot() {
    for (let i = 0; i < 40; i++) {
        const ok = await page.evaluate(() => !!(window.cc && cc.director && cc.director.getScene() && cc.director.getScene().name === 'main'));
        if (ok) break;
        await sleep(500);
    }
    await page.evaluate(() => { try { cc.debug.setDisplayStats(false); } catch { } });
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

// 1. 注入已捏人 + 上赛季周奖待领（登堂）存档
await page.evaluate(() => localStorage.removeItem('fanren_save_v1'));
await page.reload({ waitUntil: 'domcontentloaded' });
await boot();
await waitForSaveKey();
await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('fanren_save_v1'));
    s.profile = { gender: 'm', name: '云隐', createdAt: Date.now() };
    localStorage.setItem('fanren_save_v1', JSON.stringify(s));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await boot();
await waitForSaveKey();
await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('fanren_save_v1'));
    s.trial.seasonRank = 'dengtang';
    s.trial.weekRewardClaimed = false;
    localStorage.setItem('fanren_save_v1', JSON.stringify(s));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await boot();

// 2. 主页 → 论道页 → 秘境 tab（四 tab x=-258/-86/86/258, y=480，秘境第 2 个）
await tap(286, 110);
await sleep(900);
await tap(-86, 480);
await sleep(900);
await shot('06-trial-rank-claim');

// 3. 从场景图定位「领上赛季周奖」按钮的世界坐标，换算屏幕点后精确点击
const btnPos = await page.evaluate(() => {
    let found = null;
    const walk = (n) => {
        if (found) return;
        const lbl = n.components?.find?.((c) => c.string && String(c.string).indexOf('领上赛季周奖') >= 0);
        if (lbl) { found = n; return; }
        n.children.forEach(walk);
    };
    walk(cc.director.getScene());
    if (!found) return null;
    const wp = found.worldPosition;
    return { x: wp.x, y: wp.y };
});
console.log('claim button world =', JSON.stringify(btnPos));
if (btnPos) {
    // 世界坐标为左下原点 → 设计系（中心原点）dx = x-360, dy = y-640
    await tap(Math.round(btnPos.x - 360), Math.round(btnPos.y - 640));
    await sleep(800);
}
const claimedFinal = await page.evaluate(() => JSON.parse(localStorage.getItem('fanren_save_v1')).trial.weekRewardClaimed);
console.log('weekRewardClaimed =', claimedFinal, '(expect true)');
await shot('07-trial-claim-toast');

console.log(bad.length ? `异常:\n${bad.join('\n')}` : 'no page errors');
await browser.close();
