/**
 * 上线前核查（M10 代码侧收尾）：纯函数，零 `cc` 依赖，可被 vitest 单测，
 * 也可被场景/工具复用，避免「广告位漏配 / 隐私占位 / 模拟直通误开」在提审前才被发现。
 *
 * 三类关卡：
 *  1. 广告位配置（构建期，必填）：DOUYIN_AD_UNIT_IDS 全部非空；
 *  2. 用户协议 / 隐私政策文本（构建期，必填）：占位文案须由运营替换为正式文本 / URL；
 *  3. 广告模拟直通开关（逐设备运行时态，非构建期）：提审/上线前必须关闭。
 *
 * `buildReady` 只覆盖构建期关卡（1+2）；模拟直通是运行时状态，单独在 warnings 提示，
 * 不阻塞「构建产物」判定（同一份构建在清空存档/新设备上默认即为关）。
 */
export interface LaunchReport {
    total: number;
    configured: number;
    /** 尚未填入 adUnitId 的广告位中文名 */
    missingNames: string[];
    /** 用户协议/隐私政策仍为占位文本 */
    privacyPending: boolean;
    /** 广告模拟直通是否处于开启状态（逐设备运行时态） */
    simAuto: boolean;
    /** 面向真机/提审的告警清单（含构建期与运行时） */
    warnings: string[];
    /** 构建期关卡是否全部通过（广告位全配齐 && 隐私文本已替换） */
    buildReady: boolean;
}

export function buildLaunchReport(args: {
    total: number;
    configured: number;
    missingNames: string[];
    privacyPending: boolean;
    simAuto: boolean;
}): LaunchReport {
    const warnings: string[] = [];

    if (args.missingNames.length > 0) {
        warnings.push(
            `广告位未配 ${args.missingNames.length}/${args.total} 个：${args.missingNames.join(
                '、',
            )}（字节后台申请后填入 DOUYIN_AD_UNIT_IDS）`,
        );
    }

    if (args.privacyPending) {
        warnings.push('用户协议/隐私政策仍为占位文本，上线前由运营补充（抖音审核必需）');
    }

    if (args.simAuto) {
        warnings.push('⚠ 广告模拟直通开启中——提审/上线前必须关闭（设置页长按面板·模拟直通按钮）');
    }

    const buildReady = args.missingNames.length === 0 && !args.privacyPending;

    return { ...args, warnings, buildReady };
}
