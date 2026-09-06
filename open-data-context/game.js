/**
 * 开放数据域（子域）好友排行榜 —— M9b。
 * 独立 JS 环境：不可 import 主域代码；只有 tt 开放数据 API 与本画布。
 * 职责：tt.getFriendCloudStorage 拉好友三键 → 渲染榜单到共享画布 / 计算好友对比 → postMessage 回主域。
 * 语义必须与主域 core/systems/SocialRank.ts 保持同步（解码/对比/排序）。
 * 消息协议（docs/项目现状与后续规划.md 3.2）：
 *   主域 → 子域：{ type:'renderRank', key } / { type:'compare', key, myValue }
 *   子域 → 主域：{ type:'rankReady' } / { type:'compareResult', beat, total, top }
 */
/* global tt */

var KEYS = ['realm_value', 'illusion_week', 'tribulation_best'];
var REALM_NAMES = ['凡人', '练气', '筑基', '金丹', '元婴', '化神'];

var sharedCanvas = tt.getSharedCanvas();
var ctx = sharedCanvas.getContext('2d');
// 模拟器共享画布是 proxy，禁止赋值 width/height；真机可赋值——try 包裹，失败则用系统给的尺寸
try {
    sharedCanvas.width = 660;
    sharedCanvas.height = 640;
} catch (e) { /* 模拟器：使用默认尺寸 */ }

var currentKey = 'realm_value';
var friendsCache = null; // 最近一次好友数据，切键时免重拉

// ---------- 与 SocialRank.ts 同步的纯逻辑 ----------

function valueOf(user, key) {
    var list = user.KVDataList || [];
    for (var i = 0; i < list.length; i++) {
        if (list[i].key === key) {
            var v = Number(list[i].value);
            return Number.isFinite(v) ? v : 0;
        }
    }
    return 0;
}

function decodeRealm(v) {
    var idx = Math.floor(Math.max(0, v) / 1000000);
    return { realmIndex: idx, xiuwei: Math.max(0, v - idx * 1000000) };
}

function computeCompare(myValue, values) {
    var vals = [];
    for (var i = 0; i < values.length; i++) {
        if (Number.isFinite(values[i]) && values[i] > 0) vals.push(values[i]);
    }
    var beat = 0;
    for (var j = 0; j < vals.length; j++) {
        if (myValue > vals[j]) beat++;
    }
    var top = 0;
    for (var k = 0; k < vals.length; k++) {
        if (vals[k] > top) top = vals[k];
    }
    return { beat: beat, total: vals.length, top: top };
}

function sortEntries(entries) {
    return entries.slice().sort(function (a, b) {
        return (b.value - a.value) || String(a.nickname).localeCompare(String(b.nickname), 'zh');
    });
}

function formatValue(key, v) {
    if (key === 'realm_value') {
        var d = decodeRealm(v);
        return '境界' + d.realmIndex + ' · 修为' + d.xiuwei;
    }
    if (key === 'illusion_week') return (v % 1000) + ' 分';
    return Math.max(0, v) + ' 分';
}

// ---------- 数据 ----------

function fetchFriends(cb) {
    if (friendsCache) {
        cb(friendsCache);
        return;
    }
    tt.getFriendCloudStorage({
        keyList: KEYS,
        success: function (res) {
            friendsCache = (res && res.users) || [];
            console.log('[fanren][odc] friends loaded:', friendsCache.length);
            cb(friendsCache);
        },
        fail: function (err) {
            console.log('[fanren][odc] friends load fail:', String(err && err.errMsg || err).slice(0, 120));
            cb([]);
        },
    });
}

// ---------- 渲染 ----------

var COLOR_BG = '#14142e';
var COLOR_TITLE = '#e8c56a';
var COLOR_ROW = '#e8ecf4';
var COLOR_SUB = '#8a93b8';
var COLOR_ME = '#f0b14a';

function clearBg() {
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, sharedCanvas.width, sharedCanvas.height);
}

function drawHeader(title, subtitle) {
    ctx.fillStyle = COLOR_TITLE;
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, sharedCanvas.width / 2, 52);
    ctx.fillStyle = COLOR_SUB;
    ctx.font = '20px sans-serif';
    ctx.fillText(subtitle, sharedCanvas.width / 2, 86);
}

function drawEmpty(text) {
    ctx.fillStyle = COLOR_SUB;
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, sharedCanvas.width / 2, sharedCanvas.height / 2);
}

function drawList(users, key, myValue) {
    var entries = [];
    for (var i = 0; i < users.length; i++) {
        var v = valueOf(users[i], key);
        if (v > 0) entries.push({ nickname: users[i].nickname || '道友', value: v });
    }
    if (!entries.length) {
        drawEmpty('好友们还没有成绩，去邀请他们吧');
        return;
    }
    var sorted = sortEntries(entries);
    var rowH = 64;
    var top = 120;
    var maxRows = Math.min(sorted.length, Math.floor((sharedCanvas.height - top - 20) / rowH));
    for (var r = 0; r < maxRows; r++) {
        var y = top + r * rowH;
        var e = sorted[r];
        var isMe = myValue > 0 && e.value === myValue;
        // 行底
        if (isMe) {
            ctx.fillStyle = 'rgba(240,177,74,0.14)';
            ctx.fillRect(20, y - 6, sharedCanvas.width - 40, rowH - 10);
        }
        // 名次
        ctx.textAlign = 'left';
        ctx.fillStyle = r < 3 ? COLOR_TITLE : COLOR_SUB;
        ctx.font = 'bold 26px sans-serif';
        ctx.fillText(String(r + 1), 36, y + 24);
        // 昵称（截断 8 字）
        var name = e.nickname.length > 8 ? e.nickname.slice(0, 8) + '…' : e.nickname;
        ctx.fillStyle = isMe ? COLOR_ME : COLOR_ROW;
        ctx.font = '24px sans-serif';
        ctx.fillText(name, 88, y + 24);
        // 值
        ctx.textAlign = 'right';
        ctx.fillStyle = isMe ? COLOR_ME : COLOR_SUB;
        ctx.font = '22px sans-serif';
        ctx.fillText(formatValue(key, e.value), sharedCanvas.width - 36, y + 24);
    }
}

function render(key, users, myValue) {
    clearBg();
    var titles = {
        realm_value: '境界榜 · 好友',
        illusion_week: '幻境周榜 · 好友',
        tribulation_best: '渡劫评分榜 · 好友',
    };
    drawHeader(titles[key] || '好友榜', '虚位以待，共赴大道');
    drawList(users, key, myValue);
}

// ---------- 消息处理 ----------

tt.onMessage(function (msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'renderRank' && KEYS.indexOf(msg.key) >= 0) {
        currentKey = msg.key;
        fetchFriends(function (users) {
            render(currentKey, users, 0);
            console.log('[fanren][odc] rank rendered, rankReady sent');
            tt.postMessage({ type: 'rankReady' });
        });
    } else if (msg.type === 'compare' && KEYS.indexOf(msg.key) >= 0) {
        var key = msg.key;
        var myValue = Math.max(0, Math.round(Number(msg.myValue) || 0));
        fetchFriends(function (users) {
            var values = [];
            for (var i = 0; i < users.length; i++) values.push(valueOf(users[i], key));
            var r = computeCompare(myValue, values);
            console.log('[fanren][odc] compare:', key, 'my=' + myValue, '-> beat ' + r.beat + '/' + r.total + ' top ' + r.top);
            tt.postMessage({ type: 'compareResult', beat: r.beat, total: r.total, top: r.top });
        });
    }
});

// 首屏默认渲染（主域可能延迟发消息，先给出占位）
clearBg();
drawHeader('好友榜', '等待主域指令…');
