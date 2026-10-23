#!/usr/bin/env node
/**
 * M36 每日天劫三态截图：入口页 → 对局（8 秒中段）→ 结算页 ▸ 战绩卡。
 *
 * 用法: node tools/tianjie-shots.mjs [port]   （先起 tools/preview-server.mjs）
 * 产物: docs/screenshots/m36-1-entry.png / m36-2-rain.png / m36-3-result.png / m36-4-card.png
 *
 * 关键点（沿用 tools/m9-shots.mjs 的踩坑经验）：
 * - 注入存档前必须等 Game.init 落盘（waitForSaveKey），否则读到 null；
 * - headless rAF 被节流，动画要按帧等（waitFrames），别用墙钟 sleep；
 * - 天劫对局用日期种子 → 同一天可复现，截图稳定。
 */
import puppeteer from 'puppeteer-core';

const port = process.argv[2] ?? '8322';
const url = `http://127.0.0.1:${port}/`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VIEW = { width: 720, height: 1280 };
const OUT = 'docs/screenshots';

const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    defaultViewport: VIEW,
    args: ['--no-sandbox', '--disable-gpu-sandbox'],
});
const page = await browser.newPage();
await page.setViewport(VIEW);
page.on('pageerror', (e) => console.error('[pageerror]', e.message));

/** 等引擎起场（同 tools/m9-shots.mjs boot()）：先等 main 场景，再等存档落盘 */
async function waitBoot() {
    for (let i = 0; i < 60; i += 1) {
        const ok = await page.evaluate(() => !!(window.cc && cc.director && cc.director.getScene()
            && cc.director.getScene().name === 'main'));
        if (ok) break;
        await new Promise((r) => setTimeout(r, 500));
    }
    await page.evaluate(() => { try { cc.debug.setDisplayStats(false); } catch { /* 旧版无此 API */ } });
    await page.waitForFunction(() => !!localStorage.getItem('fanren_save_v1'), { timeout: 20000 });
}

/** 按帧等待：headless 下 rAF 被节流，墙钟 sleep 不等于动画推进 */
async function waitFrames(n) {
    await page.evaluate(async (count) => {
        await new Promise((resolve) => {
            let i = 0;
            const step = () => {
                i += 1;
                if (i >= count) resolve();
                else requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        });
    }, n);
}

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await waitBoot();

// 预置存档：练气 + 新手流走完（主页常规布局），避免首日流程干扰
await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('fanren_save_v1'));
    raw.realmIndex = 1;
    raw.lingshi = 5000;
    raw.profile = { gender: 'm', name: '云归', createdAt: Date.now() };
    raw.starter = { done: true, jiyuanGranted: true };
    raw.story = { seen: ['opening', 'realm_1'] };
    raw.tutorial = { done: true };
    localStorage.setItem('fanren_save_v1', JSON.stringify(raw));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await waitBoot();
await waitFrames(30);

/** 点设计系坐标（720×1280 中心原点，y 向上） */
async function tapDesign(x, y) {
    await page.mouse.click(360 + x, 640 - y);
}

const { writeFileSync } = await import('node:fs');

async function shot(name) {
    await waitFrames(6);
    const buf = await page.screenshot({ type: 'png' });
    writeFileSync(`${OUT}/${name}`, buf);
    console.log(`[m36] ${name}`);
}

// ① 入口页：直接经调试句柄构造（截图脚本不依赖具体点击路径）
await page.evaluate(() => {
    const S = window.__fanrenScenes;
    const G = window.__fanren;
    G.stack.push(new S.TianjieScene());
});
await waitFrames(20);
await shot('m36-1-entry.png');

// ② 对局：等约 3.5 秒截「灵雨潮」段（8 秒局）
await page.evaluate(() => {
    const S = window.__fanrenScenes;
    const G = window.__fanren;
    G.stack.push(new S.RainScene('tianjie'));
});
await waitFrames(110);
await shot('m36-2-rain.png');

// ③ 让对局自然跑完（8 秒局 + 余量），结算页
await waitFrames(340);
await shot('m36-3-result.png');

// ④ 战绩卡：拿结算页的 run/view 直接构造（Web 端 Share.available() 为 false，故不走「晒战报」按钮）
await page.evaluate(() => {
    const S = window.__fanrenScenes;
    const G = window.__fanren;
    const p = G.stack.top;
    const params = p && p.p ? p.p : null;
    if (params && params.run) G.stack.push(new S.TianjieShareScene({ run: params.run, view: params.view }));
});
await waitFrames(20);
await shot('m36-4-card.png');

await browser.close();
console.log('[m36] done');
