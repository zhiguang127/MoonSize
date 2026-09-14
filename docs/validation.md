# 验证记录

本地验证日期：2026-09-13，系统为 Windows x86_64；远端 Linux 验证日期：2026-09-14，运行于 GitHub Actions 的 Ubuntu 24.04。核心使用官方 MoonBit core，不含第三方解析依赖。

## 工具链

- `moon 0.1.20260904 (94521db 2026-09-04)`
- `moonc v0.10.12+1634b282e (2026-09-07)`
- `moonrun 0.1.20260904`
- Node.js `v24.19.0`
- Windows 官方工具链 zip SHA-256：`3e5449e862d4979b2fc64e6a248ec5babbd110440c8f2a7bf813c6fa01d8581f`
- core zip SHA-256：`f770d1f314f4aa88389e854c7e76814a534a2d84e93fe33e1737a516614d327f`

## 自动化验证

| 检查 | 结果 |
| --- | --- |
| `moon check --target all --deny-warn` | 全目标类型检查通过 |
| `moon test --target js --deny-warn` | 35 / 35 通过 |
| `moon test --target wasm --deny-warn` | 35 / 35 通过 |
| `moon test --target wasm-gc --deny-warn` | 35 / 35 通过 |
| Windows `.\dev.ps1 native` | 35 / 35 通过，使用 MinGW 编译宏包装 |
| Node 集成 / Worker 测试 | 15 / 15 通过 |
| `npm run demo` | 8 个真实 MoonBit 编译产物解析成功、无元数据警告；Node `WebAssembly.validate` 全部通过 |
| 远端 GitHub Actions | 提交 `4e10ce1` 的运行 #3 成功，上传 1 个 `moonsize-evidence` artifact |
| CommonMark 相关上游测试 | 优化前后各 261 / 261 通过 |
| TOML 上游包测试 | 255 / 255 通过 |
| CommonMark 输出对照 | 2,887 组输入在前后版本的 Wasm-GC / JS 上一致 |

35 是核心测试块数量，并非完整规范覆盖率。检查包含 LEB 长度边界、区段内各截断点、v0 符号语法和安全回退、资源预算、固定种子的 500 次单字节变异、JSON 可选值形状、CLI 退出码/覆盖保护/HTML 转义、中英文报告渲染，以及真实 Worker 的输入转移、结果一致性、取消终止、超时与错误清理。

远端首次运行暴露了两个 CI 可移植性问题：job 级 `env` 不能引用 `runner.temp`，且固定的官方 Linux 工具链压缩包未给 `bin/` 下的原生工具保留执行位。工作流改为在 runner 步骤中使用 `RUNNER_TEMP`，安装脚本在哈希校验和解压后恢复原生工具执行权限。修复后的运行 #3 总耗时约 59 秒并成功上传证据；见 [Actions 页面](https://github.com/zhiguang127/MoonSize/actions)。

v0.1 的 Native 失败发生在官方运行时 C 文件：MinGW 的 `rand_s` 声明需要在引入 stdlib.h 前定义 `_CRT_RAND_S`，而该版运行时的定义在引入之后。v0.2 的 `scripts/test-native.ps1` 生成本地编译器包装，在命令行补充该宏，并转发到现有 GCC / ar；官方运行时源码未修改。可单独运行 `.\dev.ps1 native`，或通过 `.\dev.ps1 test` 验证四个后端。本地 Native 通过不等于 Linux Actions 已通过。

## 浏览器验证

v0.2 页面通过 Worker 分析 CommonMark 案例，显示当前 617,546 B、变化 −62,445 B、可读符号和原始名称入口。总预算 620,000 B / 增长 0 B 时 PASS，改为 600,000 B 时 FAIL。文件选择器加载 65 MiB 文件时提示上限 64 MiB；另一个 2,533,534 B、50,000 函数的本地压力输入正常完成并显示正确计数。浏览器控制台未发现错误。

取消及过期结果处理有自动化测试，包括终止已接收请求的真实 Node Worker；本轮浏览器自动点击取消时分析已结束，没有据此宣称浏览器取消流程已经完整实测。HTML 的生成与转义已自动化验证，浏览器下载文件保存与重新打开尚未自动化覆盖。

## 可复现证据

运行 `npm run demo` 或 Windows `.\dev.ps1 demo`，生成：

- `reports/demo/manifest.json`：版本、大小、SHA-256、名称数量、引擎校验结果。
- `reports/demo/*-names.wasm` / `*-stripped.wasm`：相同源码下 `--no-strip` / `--strip` 的产物。
- `reports/demo/report.html`：可离线打开的比较报告。

外部项目证据通过 `.\dev.ps1 cases` / `python3 scripts/build-cases.py` 生成。`reports/cases/` 含源码提交、下载校验、构建命令、解析报告、实际优化补丁、二进制 SHA-256 和输出一致性哈希。结果与口径见 [案例说明](cases.zh.md)。

报告只证明固定样例与语料上的结果，不代表所有 Wasm 提案、全部 MoonBit 应用或所有输入性能。尚无上游采用、压缩体积或运行速度 benchmark 的证明。
