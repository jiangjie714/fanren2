#!/usr/bin/env node
/**
 * M11 六项功能端到端核验（对运行中的预览服真实点按）：
 *   1 捏人（选女修+随机道号→主页立绘/道号）  2 历练斩妖  3 攻防属性
 *   4 法器购入  5 随机/约人 PK  6 蓄力看广告（+10%/支）
 * 证据 = 截图（docs/screenshots/verify-*.png）+ 存档转储 + 4xx/pageerror 监控。
 * 用法：node tools/verify-m11.mjs [port]
 */
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const port = process.argv[2] ?? '8322';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const out = (n) => `docs/screenshots/verify-${n}.png`;
const summary = [];
const note = (ok, label, detail = '') => {
    summary.push(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
    console.log(summary[summary.length - 1]);
};

/** 设计系 (dx,dy) → 屏幕坐标（设计原点居中、y 向上）。 */
const P = (dx, dy) => ({ x: 360 + dx, y: 640 - dy });
const tap = async (page, dx, dy) => page.mouse.click(P(dx, dy).x, P(dx, dy).y);

const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    defaultViewport: { width: 720, height: 1280 },
    args: ['--no-sandbox', '--disable-gpu-sandbox'],
});
const page = await browser.newPage();
const bad = [];
page.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) bad.push(`${r.status()} ${r.url().split('/').slice(-2).join('/')}`); });
page.on('pageerror', (e) => bad.push('pageerror: ' + e.message.slice(0, 140)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** 等真实渲染帧推进（headless rAF 节流坑）。 */
const frames = (n) => page.evaluate((k) => new Promise((res) => { let i = 0; const t = () => (++i >= k) ? res() : requestAnimationFrame(t); t(); }), n);
/** 墙钟等待期间持续泵帧，保证补间/广告倒计时按游戏时间推进。 */
const waitGame = async (ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) await frames(30);
};
const shot = async (name) => { writeFileSync(out(name), await page.screenshot()); console.log(`shot ${name}`); };
const boot = async () => {
    await page.waitForFunction(() => window.__fanren && window.__fanren.save, { timeout: 60000 });
    await waitGame(1200);
};
const evalGame = (fn) => page.evaluate(fn);
const topScene = () => evalGame(() => window.__fanren.stack.top.node.name);

await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.removeItem('fanren_save_v1'));
await page.reload({ waitUntil: 'domcontentloaded' });
await boot();

/* ───────────────────────── 1. 捏人流 ───────────────────────── */
{
    const scene = await topScene();
    note(scene === 'ProfileScene', '1a 清档首启进捏人页', `栈顶=${scene}`);
    await shot('01-profile');
    // 选女修卡（右卡 x=160,y=60）→ 金环亮起
    await tap(page, 160, 60); await waitGame(300);
    const ringOnFemale = await evalGame(() => {
        const s = window.__fanren.stack.top;
        const cards = s.node.children.filter((n) => n.name === 'panel_dark_9s' || n.getComponent('cc.Sprite'));
        return cards.some((c) => c.getChildByName('ring') && c.position.x > 0);
    });
    await shot('02-profile-female');
    // 随机道号 → 踏入仙途
    await tap(page, -130, -330); await waitGame(400);
    await tap(page, 130, -330); await waitGame(1500);
    const prof = await evalGame(() => ({ ...window.__fanren.save.profile }));
    note(prof.gender === 'f' && prof.name.length >= 2, '1b 选女修+道号落盘', JSON.stringify(prof));
    note(await topScene() === 'HomeScene', '1c 确认后进主页', `栈顶=${await topScene()}`);
    await shot('03-home-female');
}

/* ───────────────────────── 3. 攻防属性（主页展示） ───────────────────────── */
{
    const stats = await evalGame(() => window.__fanren.combat.deriveStats(window.__fanren.save));
    note(stats.atk === 10 && stats.def === 6 && stats.power === 16, '3a 凡人裸装攻防=10/6 战力=16', JSON.stringify(stats));
    const statText = await evalGame(() => {
        const walk = (n) => {
            const lb = n.getComponent && n.getComponent('cc.Label');
            if (lb && lb.string.includes('战力')) return lb.string;
            for (const c of n.children) { const r = walk(c); if (r) return r; }
            return null;
        };
        return walk(window.__fanren.stack.top.node);
    });
    note(!!statText && statText.includes('攻击') && statText.includes('防御'), '3b 主页战力行渲染', statText ?? '未找到');
}

/* ───────────────────────── 4. 法器阁购入 ───────────────────────── */
{
    await evalGame(() => { window.__fanren.save.lingshi = 500; window.__fanren.persist(); });
    await tap(page, 286, -20); await waitGame(900); await frames(40);
    note(await topScene() === 'WeaponScene', '4a 进法器阁', `栈顶=${await topScene()}`);
    await shot('04-weapon');
    const rows = await evalGame(() => window.__fanren.stack.top.node.children.flatMap((c) => c.children).length);
    void rows;
    // 第一行「购入 桃木剑 300 灵石」按钮（row0 y=70，钮 x=244）
    await tap(page, 244, 70); await waitGame(900);
    const after = await evalGame(() => ({
        weapons: [...window.__fanren.save.combat.weapons],
        lingshi: window.__fanren.save.lingshi,
        stats: window.__fanren.combat.deriveStats(window.__fanren.save),
    }));
    note(after.weapons.includes(0) && after.lingshi === 200, '4b 购入桃木剑扣 300 灵石',
        `weapons=${after.weapons} 灵石=${after.lingshi}`);
    note(after.stats.atk === 22 && after.stats.def === 12 && after.stats.power === 34, '4c 攻防生效 +12/+6', JSON.stringify(after.stats));
    await shot('05-weapon-owned');
    await tap(page, -280, 548); await waitGame(900);
}

/* ───────────────────────── 2. 历练斩妖 ───────────────────────── */
{
    await evalGame(() => {
        const g = window.__fanren;
        g.save.expedition.dest = 'qianshan';
        g.save.expedition.startedAt = Date.now() - 20.5 * 60_000;
        g.save.daily.expeditionUsed = 1;
        g.persist();
    });
    await tap(page, 286, 240); await waitGame(900); await frames(40);
    note(await topScene() === 'ExpeditionScene', '2a 归来先进斩妖', `栈顶=${await topScene()}`);
    await shot('06-slay');
    const hp0 = await evalGame(() => {
        const s = window.__fanren;
        return { mon: s.combat.slayMonsterMaxHp(s.save), me: s.combat.slayPlayerMaxHp(s.save) };
    });
    const before = await evalGame(() => ({ lingshi: window.__fanren.save.lingshi, xiuwei: window.__fanren.save.xiuwei }));
    // 连点「斩！」（panel y=-60 + 按钮 y=-276 → 设计 y=-336）
    for (let i = 0; i < 26; i++) { await tap(page, 0, -336); await sleep(70); }
    await waitGame(800);
    await shot('07-slay-win');
    const mid = await evalGame(() => ({ lingshi: window.__fanren.save.lingshi, xiuwei: window.__fanren.save.xiuwei }));
    note(mid.lingshi > before.lingshi && mid.xiuwei >= before.xiuwei + 25, '2b 斩妖胜利入账（灵石+修为）',
        `灵石 ${before.lingshi}→${mid.lingshi} 修为 ${before.xiuwei}→${mid.xiuwei}（妖血${hp0.mon}/我血${hp0.me}）`);
    await tap(page, 0, -140); await waitGame(900); // 继 续 → 事件三选一
    await shot('08-event');
    const evTitle = await evalGame(() => window.__fanren.expedition.previewEvent(window.__fanren.save).title);
    await tap(page, 0, -70); await waitGame(900); // 选项 0
    await shot('09-event-resolve');
    const after = await evalGame(() => ({ lingshi: window.__fanren.save.lingshi, dest: window.__fanren.save.expedition.dest }));
    note(after.dest === null && after.lingshi > mid.lingshi, '2c 事件结算（带战意加成）', `事件=${evTitle} 灵石 ${mid.lingshi}→${after.lingshi}`);
    await tap(page, 0, -140); await waitGame(600); // 收 下
    await tap(page, -280, 548); await waitGame(900); // 回主页
}

/* ───────────────────────── 5+6. 论武 PK + 蓄力 ───────────────────────── */
{
    await tap(page, 286, 110); await waitGame(900);
    // 论武 tab（四 tab x=-258/-86/86/258，y=480）
    await tap(page, 86, 480); await waitGame(700); await frames(40);
    await shot('10-pk-tab');
    const pkInfo = await evalGame(() => ({
        can: window.__fanren.combat.canPk(window.__fanren.save),
        remain: 5 - window.__fanren.save.daily.pkUsed,
        stats: window.__fanren.combat.deriveStats(window.__fanren.save),
    }));
    note(pkInfo.can && pkInfo.remain === 5, '5a 论武 tab + 每日 5 场', `剩余${pkInfo.remain}场`);
    // 随机切磋（战力卡 y=236 + 钮 (-160,-66) → (-160,170)）
    await tap(page, -160, 170); await waitGame(900); await frames(40);
    note(await topScene() === 'PkBattleScene', '5b 进随机切磋', `栈顶=${await topScene()}`);
    await shot('11-pk-battle');
    const s0 = await evalGame(() => {
        const g = window.__fanren;
        const opp = null; void opp;
        return g.combat.chargedStats(g.save, 0);
    });
    /* 6. 蓄力两支广告：每支模拟 3s 倒计时 */
    for (let k = 1; k <= 2; k++) {
        await tap(page, 158, -166); // 蓄力·观广告
        await waitGame(5200); // 模拟激励视频 3-2-1 倒计时走完
        const st = await evalGame((n) => {
            const g = window.__fanren;
            const scene = g.stack.top;
            const labels = [];
            const walk = (nd) => {
                const lb = nd.getComponent && nd.getComponent('cc.Label');
                if (lb && lb.string.includes('蓄力')) labels.push(lb.string);
                nd.children.forEach(walk);
            };
            walk(scene.node);
            return { info: labels.join(' | '), stats: g.combat.chargedStats(g.save, n) };
        }, k);
        note(st.info.includes(`蓄力 ${k}/10`) && st.info.includes(`+${k * 10}%`), `6${k === 1 ? 'a' : 'b'} 第${k}支广告 +10% 攻防`,
            `${st.info}（攻 ${s0.atk}→${st.stats.atk}）`);
        await shot(`12-charge-${k}`);
    }
    const capCfg = await evalGame(() => {
        const g = window.__fanren;
        return { f10: g.combat.chargedStats(g.save, 10).atk, f11: g.combat.chargedStats(g.save, 11).atk };
    });
    note(capCfg.f10 === capCfg.f11, '6c 10 支封顶（pkChargeFactor(10)==(11)）', `攻@10=${capCfg.f10} 攻@11=${capCfg.f11}`);
    /* 开战 */
    const pk0 = await evalGame(() => ({ w: window.__fanren.save.pk.wins, l: window.__fanren.save.pk.losses, used: window.__fanren.save.daily.pkUsed, ls: window.__fanren.save.lingshi, xw: window.__fanren.save.xiuwei }));
    await tap(page, 0, -330); await waitGame(1000); await frames(40);
    await shot('13-pk-result');
    const pk1 = await evalGame(() => ({ w: window.__fanren.save.pk.wins, l: window.__fanren.save.pk.losses, used: window.__fanren.save.daily.pkUsed, ls: window.__fanren.save.lingshi, xw: window.__fanren.save.xiuwei }));
    const won = pk1.w > pk0.w;
    note(pk1.w + pk1.l === pk0.w + pk0.l + 1 && pk1.used === pk0.used + 1, '5c 一场论武消耗 1 次并计战绩', `战绩 ${pk1.w}胜${pk1.l}负 次数${pk1.used}/5`);
    if (won) {
        note(pk1.ls > pk0.ls && pk1.xw > pk0.xw, '5d 胜者得灵石+修为', `灵石 ${pk0.ls}→${pk1.ls} 修为 ${pk0.xw}→${pk1.xw}`);
        await tap(page, 90, -182); await waitGame(800); // 回论道
    } else {
        note(pk1.ls === pk0.ls, '5d 落败无所得（可蓄力再战）', `灵石不变=${pk1.ls}`);
        await shot('14-pk-lose-rematch');
        await tap(page, 90, -182); await waitGame(800); // 收手言和
    }
    /* 约人切磋 */
    await waitGame(600); await frames(30);
    await tap(page, 160, 170); await waitGame(1000); await frames(40);
    const friendScene = await topScene();
    note(friendScene === 'PkBattleScene', '5e 约人切磋入口可用（Web 端降级为影修切磋）', `栈顶=${friendScene}`);
    await shot('15-pk-friend');
    await tap(page, -280, 548); await waitGame(600);
}

await shot('16-final-home');
console.log('\n===== 核验汇总 =====');
summary.forEach((s) => console.log(s));
console.log(`\n4xx/页面异常: ${bad.length ? [...new Set(bad)].join(' ; ') : '(none)'}`);
await browser.close();
