// Cocos Creator UUID 压缩算法（与引擎 encode-uuid.ts 一致）
// 用于手写 .scene / .meta 文件时预生成确定的 uuid 引用
const BASE64_KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function compressHex(hexString, reservedHeadLength) {
  const length = hexString.length;
  let i = reservedHeadLength;
  let res = hexString.slice(0, i);
  while (i < length) {
    const d1 = parseInt(hexString[i], 16);
    const d2 = parseInt(hexString[i + 1], 16);
    const d3 = parseInt(hexString[i + 2], 16);
    res += BASE64_KEYS[(d1 << 2) | (d2 >> 2)];
    res += BASE64_KEYS[((d2 & 3) << 4) | d3];
    i += 3;
  }
  return res;
}

/** 脚本组件 __type__ 用：保留 5 位，输出 23 字符 */
export function compressType(uuid) {
  return compressHex(uuid.replace(/-/g, ''), 5);
}

/** 节点 _id 用：保留 2 位，输出 22 字符 */
export function compressId(uuid) {
  return compressHex(uuid.replace(/-/g, ''), 2);
}

function randomUuid() {
  const b = new Uint8Array(16);
  for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ---------- 自检：与 taxi 模板真实数据比对 ----------
function selfTest() {
  const cases = [
    // main.ts uuid → login.scene 中 Canvas<main> 的 __type__
    ['c5aa722c-5abe-40e1-b94f-7853da9d733f', 'c5aa7IsWr5A4blPeFPanXM/'],
  ];
  for (const [uuid, expected] of cases) {
    const got = compressType(uuid);
    if (got !== expected) {
      console.error(`FAIL: compressType(${uuid}) = ${got}, expected ${expected}`);
      process.exit(1);
    }
  }
  console.log('uuid self-test passed');
}

const cmd = process.argv[2] ?? 'test';
if (cmd === 'test') {
  selfTest();
} else if (cmd === 'gen') {
  const n = parseInt(process.argv[3] ?? '1', 10);
  for (let i = 0; i < n; i++) {
    const u = randomUuid();
    console.log(`${u} type=${compressType(u)} id=${compressId(u)}`);
  }
}
