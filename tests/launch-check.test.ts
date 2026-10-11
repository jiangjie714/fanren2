import { describe, expect, it } from 'vitest';
import { buildLaunchReport } from '../assets/scripts/core/launchCheck';

describe('buildLaunchReport — 上线前核查', () => {
  const base = {
    total: 11,
    configured: 11,
    missingNames: [] as string[],
    privacyPending: false,
    simAuto: false,
  };

  it('全部就绪：buildReady 为真且无警告', () => {
    const r = buildLaunchReport(base);
    expect(r.buildReady).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it('广告位未配：告警带数量与名称，buildReady 为假', () => {
    const r = buildLaunchReport({
      ...base,
      configured: 8,
      missingNames: ['论武蓄力', '剑冢回魂', '凝神一瞥'],
    });
    expect(r.buildReady).toBe(false);
    expect(r.warnings.some((w) => w.includes('论武蓄力') && w.includes('3/11'))).toBe(true);
  });

  it('隐私/协议仍占位：告警且 buildReady 为假', () => {
    const r = buildLaunchReport({ ...base, privacyPending: true });
    expect(r.buildReady).toBe(false);
    expect(r.warnings.some((w) => w.includes('用户协议') || w.includes('隐私政策'))).toBe(true);
  });

  it('模拟直通开启：告警存在，但不计入构建期关卡（buildReady 仅看广告位与隐私）', () => {
    const r = buildLaunchReport({ ...base, simAuto: true });
    expect(r.simAuto).toBe(true);
    expect(r.warnings.some((w) => w.includes('模拟直通'))).toBe(true);
    // 其余关卡全过，buildReady 仍为真（模拟直通是逐设备运行时状态，非构建期关卡）
    expect(r.buildReady).toBe(true);
  });

  it('复合场景：未配广告 + 隐私占位 + 模拟直通 → 三条告警且 buildReady 为假', () => {
    const r = buildLaunchReport({
      ...base,
      configured: 9,
      missingNames: ['剑冢回魂', '凝神一瞥'],
      privacyPending: true,
      simAuto: true,
    });
    expect(r.buildReady).toBe(false);
    expect(r.warnings.filter((w) => w.includes('广告位') || w.includes('隐私') || w.includes('模拟直通')).length).toBe(3);
  });
});
