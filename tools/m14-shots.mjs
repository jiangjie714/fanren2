#!/usr/bin/env node
/**
 * M14 秘境试炼冒烟截图：体力入口 → 秘境进行（主题背景）→ 体力扣减 → 结算页再战按钮。
 * 用法: node tools/m14-shots.mjs [port]
 */
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const port = process.argv[2] ?? '8321';
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

// 1. 注入已捏人存档（体力满）
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

const staminaBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('fanren_save_v1')).trial.stamina);
console.log('stamina before =', staminaBefore);

// 2. 主页 → 修行任务页 → 秘境入口
await tap(286, 396);
await sleep(900);
await shot('01-quest-entry');

// 3. 进入秘境：今日主题背景 + 体力扣 1
await tap(214, 306);
await sleep(2200);
const staminaAfterEnter = await page.evaluate(() => JSON.parse(localStorage.getItem('fanren_save_v1')).trial.stamina);
console.log('stamina after enter =', staminaAfterEnter, '(expect before-1)');
await shot('02-trial-running-theme-bg');

// 4. 等 15 秒局结束 → 结算页（再战按钮应为体力文案）
await sleep(14000);
await shot('03-trial-result');

// 5. 再战一局（消耗体力）→ 回到秘境（againBtn 位于设计系 (-108,-470)）
await tap(-108, -470);
await sleep(2000);
const staminaAfterAgain = await page.evaluate(() => JSON.parse(localStorage.getItem('fanren_save_v1')).trial.stamina);
console.log('stamina after again =', staminaAfterAgain, '(expect afterEnter-1)');
await shot('04-trial-again-running');

// 6. 注入连胜 3 → 再打一局，验证连胜倍率行（≥60）或道心护持面板（<60）二选一生效
await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('fanren_save_v1'));
    s.trial.streak = 3;
    s.trial.bestStreak = 3;
    localStorage.setItem('fanren_save_v1', JSON.stringify(s));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await boot();
await tap(286, 396);
await sleep(900);
await tap(214, 306);
await sleep(2200);
await sleep(18000);
const streakAfter = await page.evaluate(() => {
    const t = JSON.parse(localStorage.getItem('fanren_save_v1')).trial;
    return { streak: t.streak, best: t.bestStreak };
});
console.log('streak after 3rd run =', JSON.stringify(streakAfter), '(≥60 → 4 连；<60 → 0 + 护持面板)');
await shot('05-trial-streak-or-revive');

// 7. M14-5 trialStamina：注入体力 0 → 点秘境入口 → 广告自动成功补 5 点 → 扣 1 进局
await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('fanren_save_v1'));
    s.trial.stamina = 0;
    s.trial.staminaAt = Date.now();
    s.trial.adRefillToday = 0;
    localStorage.setItem('fanren_save_v1', JSON.stringify(s));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await boot();
await tap(286, 396); // 任务页
await sleep(900);
await tap(214, 306); // 秘境入口（体力不足 → trialStamina 广告 3s 倒计时 → 补 5 → 进局扣 1）
await sleep(6500);
const staminaAfterRefill = await page.evaluate(() => JSON.parse(localStorage.getItem('fanren_save_v1')).trial.stamina);
console.log('stamina after refill-enter =', staminaAfterRefill, '(expect 4 = 0 +5 -1)');
await shot('06-trial-stamina-refill');

// 8. M14-5 doubleReward：等本局结束，若有档位奖励 → 点「奖励翻倍」→ doubleRewardUsed=1
await sleep(16000);
const tiered = await page.evaluate(() => JSON.parse(localStorage.getItem('fanren_save_v1')).daily.illusionRewardedTier);
if (tiered > 0) {
    await tap(0, -198); // rewardPanel 内翻倍按钮（设计系）
    await sleep(1200);
    const used = await page.evaluate(() => JSON.parse(localStorage.getItem('fanren_save_v1')).daily.doubleRewardUsed);
    console.log('doubleRewardUsed =', used, '(expect 1)');
    await shot('07-trial-double-reward');
} else {
    console.log('本局未入档，跳过 doubleReward 实机断言（单测已覆盖）');
}

console.log(bad.length ? `异常:\n${bad.join('\n')}` : 'no page errors');
await browser.close();
