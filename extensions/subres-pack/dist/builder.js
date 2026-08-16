'use strict';

exports.load = function () {};
exports.unload = function () {};

// 注册到所有平台的构建流程；平台过滤在 hooks 内部做
exports.configs = {
    '*': {
        hooks: './hooks',
    },
};
