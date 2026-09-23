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

## 2026-09-18：L2 / L3 本地验证

环境为 Linux x86_64，继续使用上文固定的 MoonBit 编译器，Node.js 24.19.0。工具链由 `scripts/setup-ci.sh` 下载并通过仓库记录的 SHA-256 校验。

| 检查 | 结果 |
| --- | --- |
| `moon check --target all --deny-warn` | 通过 |
| JS / Wasm / Wasm-GC / Native 核心测试 | 每个后端 53 / 53 通过 |
| `npm test` 中 Node 集成 / 归因 / Worker 测试 | 26 / 26 通过 |
| `npm run demo` | 8 个真实产物通过引擎校验，全部函数体引用解码成功 |
| `python3 scripts/build-cases.py` | CommonMark / TOML 构建、上游测试、引用解码及 2,887 组行为对照通过 |
| 本地 Chrome 在线页面 | Worker 加载、函数搜索、变化筛选、分页、前后构建选择、引用跳转和语言切换通过 |
| 下载后的离线 HTML | 通过真实浏览器下载并重新打开，搜索 / 分页 / 引用跳转 / 语言切换通过 |
| 移动端 390 px 视口 | 页面无横向溢出，引用路径与列表可读 |

核心与集成新增检查包括：重排函数索引、唯一原始符号匹配、缺名称和双侧重名、单侧符号、未知包核算、显式 null、code 区段开销、导入偏移、递归与无根环、export / start 路径、8 种 element 编码、global / table 初始化、Wasm-GC、SIMD、内存立即数、尾调用及动态调用。有效合成样例通过 Node `WebAssembly.validate` 独立核对；某些核心解码边界样例有意不满足完整 Wasm 类型规则。

未知指令或不完整元数据区域不会泄漏部分引用；引用条数和控制嵌套超限返回资源错误。2,000 函数链验证前驱森林的线性存储与路径重建；真实 Worker 验证 schema 3 比较结果与直接核心调用一致。在线与离线报告均检查了模块名称的 HTML / script 转义。浏览器验证期间未发现页面脚本错误。

CommonMark 浏览器复验能搜索 `__moonbit_init`，看到 **−21,229 B** 的函数级变化并跳转到其引用路径。完整匹配和引用统计见 [案例说明](cases.zh.md)。这些是本地验证结果，尚未运行新代码的远端 Actions；没有据此承诺任意 64 MiB 输入在 30 秒内完成。

## 2026-09-21：v0.3 本地验证

Linux x86_64，固定 MoonBit 工具链和 core 的下载文件通过仓库 SHA-256 校验。Node 24.19.0，zlib `1.3.2.1-motley-3246f1b`，Brotli `1.2.0`。

| 检查 | 结果 |
| --- | --- |
| `moon check --target all --deny-warn` | 通过 |
| JS / Wasm / Wasm-GC / Native 核心测试 | 每个后端 55 / 55 通过 |
| Node 集成 / 归因 / Worker / 工程决策测试 | 36 / 36 通过 |
| `npm run demo` | 8 个真实产物通过，生成 SHA-256 绑定记录 |
| CI 摘要命令本地执行 | 输出 JSON、离线 HTML 和追加式 Markdown，示例综合策略通过 |
| Chrome 在线 Worker / 离线 HTML | raw 未测量压缩提示、三指标展示、构建条件与中英文切换通过，无页面脚本错误 |
| 390 px 视口 | 页面无横向溢出；宽表在独立容器横向滚动，指标名不拆成竖排 |

新增检查覆盖共享预算边界、负增长、无效配置、记录哈希与长度绑定、源码版本和有序构建参数、缺失条件、压缩与原始增长方向不同、raw 通过而压缩失败、严格条件检查、失败时报告仍生成、摘要追加及转义、配置长度限制、输出硬链接 / 符号链接别名保护。Windows 测试入口已纳入新测试文件，本轮没有重新运行 Windows 环境。

对已有 CommonMark 案例文件重新测量，使用 gzip level 9 / Brotli quality 6：

| 指标 | Before | After | 变化 |
| --- | ---: | ---: | ---: |
| raw | 679,991 B | 617,546 B | −62,445 B |
| gzip | 186,566 B | 174,531 B | −12,035 B |
| Brotli | 157,694 B | 148,943 B | −8,751 B |

本轮复用已有案例产物，没有重新运行全部外部上游测试或 2,887 组行为对照；相关证据属于前一轮。旧案例没有本轮格式的构建记录，比较器正确返回条件 `unknown`，不根据历史叙述补造记录。demo 新记录则为 `matching`。压缩测量不是实际网络流量或运行速度 benchmark。

新工作流尚未推送到远端执行，包尚未发布，也尚无独立使用者反馈。工程接口与复现命令见 [CI 决策说明](engineering-ci.zh.md)。

## 2026-09-23：CI JSON 输出迭代

本地环境为 Linux x86_64、Node v22.22.1。复用此前生成的 MoonBit JS 核心与 demo Wasm；当前环境未安装 `moon`，因此本轮没有重建核心或运行四后端测试，`npm test` 所需的 Node 24 参数也不可用。

- `node --test tests/integration.test.mjs tests/attribution.test.mjs tests/worker.test.mjs tests/engineering.test.mjs`：37 / 37 通过。新增检查覆盖 `--json-file` 的通过、预算失败、核心解析错误，以及输入文件 / 硬链接 / 其他输出路径冲突。
- 现有 demo 产物按示例 CI 策略执行 `diff --json-file`：退出 0、策略 `pass`、构建条件 `matching`，JSON 记录 3,442 B → 31,519 B。
- `git diff --check`：通过。

本轮没有运行远端 Actions，也没有重新构建外部项目案例；这些仍是发布前的验证项。

## 2026-09-23：候选包与真实案例交付验证

固定工具链由 `scripts/setup-ci.sh` 下载并通过仓库 SHA-256 校验；本地 Linux 使用 MoonBit `0.1.20260904` / moonc `v0.10.12+1634b282e` 与 Node `24.19.0`。

- `moon check --target all --deny-warn` 通过；JS、Wasm、Wasm-GC、Native 核心测试各 55 / 55 通过。`npm test` 的 Node 集成测试 37 / 37 通过。
- `npm run demo` 生成 8 个通过引擎验证的产物。`npm run package:check` 从 tarball 在仓库外安装，验证帮助、版本、分析、比较、记录与退出 0/1/2。
- `npm run pr:check` 使用两个隔离的真实 MoonBit 项目构建，验证条件匹配、超预算、条件差异、缺少基准与损坏产物。
- `python3 scripts/build-cases.py` 重新构建固定 CommonMark/TOML 案例及上游测试；CommonMark 2,887 组行为对照通过。实际构建时生成的记录具有相同依赖指纹；CLI 策略 `pass`、故意超限 `fail`。raw −62,445 B、gzip −12,035 B、Brotli −8,751 B。
- 本地候选包 `dist/moonsize-local-0.3.0.tgz` 的 SHA-256 为 `710101c05dae6a11de64e361df8ce48d406aab27b4332f4ef866c16d2fb37cc4`。产物为本机打包候选，尚未发布。

远端 Actions 和独立项目试用仍需当前代码的证据；正式发布状态见 [验收清单](release-checklist.zh.md)。
