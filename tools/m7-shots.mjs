#!/usr/bin/env node
/**
 * M7 全流程截图脚本：puppeteer-core 驱动本机 Chrome，720×1280 走完
 * 主页 → 宝盒(蓄力共鸣/三连) → 渡劫灵气雨 → 结算，输出 docs/screenshots/m7-*.png。
 * 用法: node tools/m7-shots.mjs [port]
 */
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const port = process.argv[2] ?? '8321';
const url = `http://127.0.0.1:${port}/`;
const out = (n) => `docs/screenshots/m7-${n}.png`;

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    defaultViewport: { width: 720, height: 1280 },
    args: ['--no-sandbox', '--disable-gpu-sandbox'],
});
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.removeItem('fanren_save_v1'));
await page.reload({ waitUntil: 'domcontentloaded' });

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
    const buf = await page.screenshot();
    writeFileSync(out(name), buf);
    console.log(`saved ${out(name)}`);
};
// 设计系坐标(720×1280, 中心原点) → 页面坐标
const pt = (dx, dy) => [360 + dx, 640 - dy];
async function tap(dx, dy) {
    const [x, y] = pt(dx, dy);
    await page.mouse.click(x, y);
}

await boot();
await shot('01-home');

// —— 宝盒页：蓄力共鸣（定时按住 275ms 后松手）→ 开启 → 圆满三连 ——
await tap(-166, -196);          // 仙缘宝盒按钮（主页菜单位 (-166,-196)）
await sleep(1000);
await shot('02-box');
await tap(-232, -10);           // 凡俗宝盒 · 开启 → 蓄力浮层
await sleep(700);
await shot('03-charge');
// 按住：按下后光标从 -215 出发，275ms 时恰过中心金区（周期 1.1s）
await page.mouse.move(360, 620);
await page.mouse.down();
await sleep(275);
await page.mouse.up();
await sleep(1200);              // 开启动画
// 圆满三连：三枚符文位于面板 (−170/0/170, 54)
await tap(-170, 54);
await sleep(300);
await shot('04-runes-lit');
await tap(0, 54);
await tap(170, 54);
await sleep(700);
await shot('05-result-dialog');
// 收下 → 回主页
await tap(0, -46);

// —— 造机缘触发渡劫：改存档 jiyuan=100 → 刷新 → 主页出现突破入口 ——
await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('fanren_save_v1'));
    // M11 捏人档：未设道号会进 ProfileScene 挡住巡检
    s.profile = { gender: 'm', name: '云隐', createdAt: Date.now() };
    s.jiyuan = 100;
    localStorage.setItem('fanren_save_v1', JSON.stringify(s));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await boot();
await tap(0, -82);              // 主页主按钮：冲击境界（机缘已满）→ 灵气雨
await sleep(1200);
await shot('06-rain-wave1');
await sleep(2500);              // 3s 进入灵雨潮
await shot('06-rain-wave2');
await tap(176, -390);           // 聚灵咒按钮
await sleep(600);
await shot('06-rain-magnet');
await sleep(5000);              // 渡劫结束自动进结算
await shot('07-result');

await browser.close();
console.log('done');
