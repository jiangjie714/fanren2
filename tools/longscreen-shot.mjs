#!/usr/bin/env node
/**
 * 长屏（FIXED_WIDTH）适配验证：720×1560 视口下的全屏模态遮罩必须铺满整屏。
 *
 * 背景：FIXED_WIDTH 下宽恒 720、高按机型比例延伸（全面屏 720 宽时可见高度 ≈1560），
 * 而设计高度只有 1280。遮罩若按 DESIGN_H 固定，上下各会露出约 140px —— 那段既不
 * 压暗也不拦截触摸（点上去穿透触发下层按钮）。本脚本给出视觉证据。
 *
 * 用法: node tools/longscreen-shot.mjs [port]   （需先起 tools/preview-server.mjs）
 * 产物: docs/screenshots/longscreen-*.png
 */
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const port = process.argv[2] ?? '8322';
const url = `http://127.0.0.1:${port}/`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/** 抖音全面屏常见形态：720 宽下可见高度 ≈1560（设计高 1280） */
const VIEW = { width: 720, height: 1560 };

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
}

/** 设计系坐标 → 屏幕像素。长屏纵向半高是 visibleHeight()/2 = 780，不是设计半高 640。 */
const pt = (dx, dy) => [VIEW.width / 2 + dx, VIEW.height / 2 - dy];
async function tap(dx, dy) {
    const [x, y] = pt(dx, dy);
    await page.mouse.click(x, y);
}

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.removeItem('fanren_save_v1'));
await page.reload({ waitUntil: 'domcontentloaded' });
await boot();
await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('fanren_save_v1'));
    // 补档案跳过捏人页，否则巡检会被 ProfileScene 挡住
    s.profile = { gender: 'm', name: '云隐', createdAt: Date.now() };
    s.jiyuan = 200;
    s.lingshi = 5000;
    localStorage.setItem('fanren_save_v1', JSON.stringify(s));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await boot();

// 前提校验：引擎必须真的按长屏可见尺寸布局，否则后面的结论无意义
const vs = await page.evaluate(() => {
    try { const v = cc.view.getVisibleSize(); return { w: v.width, h: v.height }; } catch { return null; }
});
console.log('visibleSize =', JSON.stringify(vs), '（期望宽 720 / 高 ≈1560）');
if (!vs || vs.h < 1500) console.log('⚠️ 可见高度未达长屏，遮罩测试意义有限');

writeFileSync('docs/screenshots/longscreen-home.png', await page.screenshot());
console.log('saved longscreen-home');

// 宝箱页（长屏下内容区布局对照，也是蓄力遮罩所在页）
await tap(-166, -200);
await sleep(1200);
await waitFrames(40);
writeFileSync('docs/screenshots/longscreen-box.png', await page.screenshot());
console.log('saved longscreen-box');

// 图鉴页 → 点第 1 个境界头像 → 境界预览弹窗（全屏模态遮罩，确定性可触发）
await tap(-280, 548); // 页头返回
await sleep(1000);
await waitFrames(30);
await tap(166, -200); // 灵根图鉴
await sleep(1200);
await waitFrames(40);
writeFileSync('docs/screenshots/longscreen-collection.png', await page.screenshot());
await tap(-250, -359); // 境界头像条第 1 个 chip
await sleep(600);
await waitFrames(40);
writeFileSync('docs/screenshots/longscreen-realm-dialog.png', await page.screenshot());
console.log('saved longscreen-realm-dialog');

console.log(bad.length ? 'BAD:\n' + [...new Set(bad)].join('\n') : '(no 4xx)');
await browser.close();
