#!/usr/bin/env node
/**
 * M8 全流程截图：puppeteer-core 驱动本机 Chrome，720×1280。
 * 主页入口 → 修行任务页 → 心魔幻境（进行/结算）→ 历练事件卡 → 结算。
 * 用法: node tools/m8-shots.mjs [port]
 */
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const port = process.argv[2] ?? '8321';
const url = `http://127.0.0.1:${port}/`;
const out = (n) => `docs/screenshots/m8-${n}.png`;
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
/** 等待游戏完成首次持久化（清档/重载后存档键出现） */
async function waitForSaveKey() {
    for (let i = 0; i < 30; i++) {
        const has = await page.evaluate(() => !!localStorage.getItem('fanren_save_v1'));
        if (has) return;
        await sleep(300);
    }
    throw new Error('save key never appeared');
}

// 1. 全新档主页（修行/历练新入口）
await page.evaluate(() => localStorage.removeItem('fanren_save_v1'));
await page.reload({ waitUntil: 'domcontentloaded' });
await boot();
await waitForSaveKey();
await shot('01-home');

// 2. 造日常状态：2 任务完成（30 档可领）+ 历练已归来待抉择
await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('fanren_save_v1'));
    // M11 捏人档：未设道号会进 ProfileScene 挡住巡检
    s.profile = { gender: 'm', name: '云隐', createdAt: Date.now() };
    s.daily.questProgress = { openBoxes: 3, tribulation: 1 };
    s.expedition = { dest: 'gudong', startedAt: Date.now() - 21 * 60_000 };
    localStorage.setItem('fanren_save_v1', JSON.stringify(s));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await boot();
await waitForSaveKey();
await shot('05-home-dots');

// 3. 修行任务页（可领宝箱态）
await tap(286, 396);
await sleep(900);
await shot('02-quest');

// 4. 心魔幻境：进入 → 灵气雨进行 → 结算
await tap(214, 306);             // 进入幻境
await sleep(2200);
await shot('07-illusion');
await sleep(16000);              // 15s 局自动结算
await shot('08-illusion-result');

// 5. 返回仙府 → 历练事件卡 → 抉择 → 结算
await tap(166, -470);            // 幻境结算页「返回仙府」
await sleep(900);
await tap(286, 252);             // 历练
await sleep(900);
await shot('04-expedition-event');
await tap(0, -208);              // 第二个选项（稳妥）
await sleep(700);
await shot('06-expedition-result');
await tap(0, -46);               // 收下
await sleep(500);
await tap(0, -90);               // 兜底关闭弹窗
await sleep(400);
await tap(-285, 552);            // 返回主页
await sleep(500);
await shot('09-home-after');

await browser.close();
console.log('done');
