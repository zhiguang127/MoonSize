# MoonSize

**MoonBit 原生 WebAssembly 体积分析与构建回归工具。**

分析 `.wasm` 的区段与函数体字节数，按包和唯一原始符号比较两次构建，追踪直接调用、函数引用和已知包含路径，并用体积预算检查增长。解析、比较、引用图与预算判断均由 MoonBit 实现；Node CLI 负责文件读取、固定参数压缩测量和报告；浏览器界面提供本地 raw 分析与展示。

当前开发 **v0.3（未发布，分析 JSON schema 3）**，包含 L2 / L3、CI Job Summary、构建条件记录及独立 gzip / Brotli 预算，尚未发布到 Mooncakes 或 npm。新增 MoonBit 符号反修饰、可取消 Worker、统一资源限制，以及 CommonMark / TOML 两个外部项目案例。当前核心已在 JS、Wasm、Wasm-GC、Native 四个后端通过本地测试；远端成功记录属于此前 v0.2，v0.3 尚未远端运行。见 [验证记录](docs/validation.md)。

CommonMark 的一次源码改动，在相同编译参数下将产物从 **679,991 B 降至 617,546 B（−9.18%）**；两边都 strip 后仍减少 22,983 B。2,887 组输入在前后版本、Wasm-GC 与 JS 上输出一致。见 [案例与复现说明](docs/cases.zh.md)。

## 在当前 Windows 项目中运行

交付到 `D:\MoonSize` 的副本带有 `.tools/moonbit` 便携工具链。`dev.ps1` 只在命令执行期间设置环境变量，不修改系统 PATH。

```powershell
cd D:\MoonSize
.\dev.ps1 check
.\dev.ps1 test
.\dev.ps1 demo
.\dev.ps1 cases
.\dev.ps1 serve
```

浏览器访问 <http://127.0.0.1:4173/ui/>，点击「载入 CommonMark 优化案例」，或选择自己的文件。右上角可切换中文 / English，选择会保存在当前浏览器；分析结果和导出的离线 HTML 会同步切换，独立 HTML 报告也自带语言按钮。报告位于 `reports/cases/cmark-report.html` 和 `reports/cases/toml-report.html`，可直接打开。默认服务仅监听本机，文件选择不会上传内容。`cases` 首次运行需要网络和 Python 3.10+，会校验两个上游源码压缩包的 SHA-256。

本机 `test` 包含四个核心后端。Windows Native 使用检测到的 MinGW，并通过临时编译器包装补充 `_CRT_RAND_S` 宏；不会修改官方运行时或系统 PATH。也可单独运行 `.\dev.ps1 native`。

## 标准开发环境

需要 [MoonBit 工具链](https://www.moonbitlang.com/download/) 和 Node.js 24+。开发验证使用 `moonc v0.10.12+1634b282e`、`moon 0.1.20260904`、Node.js 24.19.0。无需安装 npm 依赖，MoonBit 核心仅依赖官方 core 的 UTF-8 模块；外部案例有自己的上游依赖。

```sh
npm run build
npm test
npm run demo
python3 scripts/build-cases.py
npm run serve
```

CI 使用同版本的官方 Linux 工具链与 core，并校验固定 SHA-256。2026-09-14，GitHub Actions 在 Ubuntu 24.04 上对提交 `4e10ce1` 成功运行并上传 `moonsize-evidence`；见 [Actions 页面](https://github.com/zhiguang127/MoonSize/actions)。

## 命令行

```sh
node bin/moonsize.mjs analyze app.wasm
node bin/moonsize.mjs analyze app.wasm --json
node bin/moonsize.mjs analyze app.wasm --why 42
node bin/moonsize.mjs diff before.wasm after.wasm --compress --html report.html --summary summary.md --json-file result.json
node bin/moonsize.mjs diff before.wasm after.wasm --max-bytes 32000 --max-growth 30000 --json
```

通过 `--policy policy.json` 配置 raw / gzip / Brotli 独立预算和严格构建条件检查；通过 `record` 保存与产物 SHA-256 绑定的构建声明。详见 [CI 决策、构建条件与压缩体积](docs/engineering-ci.zh.md)。

预算单位为整数字节，边界包含在允许范围内。例如上限 32000 时，32000 通过、32001 失败。增长为带符号差值，缩小的产物可通过零增长预算。

| 退出码 | 含义 |
| --- | --- |
| 0 | 分析成功，设置的预算通过 |
| 1 | 分析成功，但预算或构建条件策略失败 |
| 2 | 参数、文件读取、结构解析或输出错误 |

`--html` 可与 `--json` 同时使用，报告路径输出到 stderr，JSON 输出到 stdout。CI 可用 `--json-file` 直接写 JSON 文件；它与 HTML、摘要、构建记录一起检查输出路径，不能覆盖输入 Wasm、配置、记录或其他输出。`--summary` 追加 Markdown，可传入 GitHub 的 `$GITHUB_STEP_SUMMARY`。

## MoonBit API

将 `juvenile/moonsize` 作为本地模块依赖后，可使用以下接口。发布前不要直接执行 `moon add juvenile/moonsize`。

```moonbit
let before = @moonsize.analyze(before_bytes)
let after = @moonsize.analyze(after_bytes)
let delta = @moonsize.compare(before, after)
let budget = @moonsize.check_budget(
  delta,
  max_bytes=32000,
  max_growth_bytes=30000,
)
```

`analyze` 可能抛出 `ParseError::Invalid(offset, message)` 或 `ResourceLimit(offset, message)`；`check_budget` 会拒绝无效预算。公共类型与接口见 [pkg.generated.mbti](pkg.generated.mbti)。JS 导出 `analyze_json`、`compare_json`、`budget_json`、`size_budget_json` 和 `limits_json`，分析接口接收 `Uint8Array` 并返回 JSON 字符串。Bridge 中 `-1` 代表未设置预算，其他负数无效。

JSON schema 已升至 **3**：新增 `analysis.references`，以及 `comparison.packages`、`functions`、`matching` 和 `code_overhead_delta_bytes`。完整字段与语义见 [L2 / L3 接口说明](docs/analysis-l2-l3.zh.md)。此前 schema 2 的约定保持：可选字段为直接值或 `null`，修复 v0.1 中 `Some` 意外输出为单元素数组的问题。函数新增 `symbol: {raw, display, package_name, status, kind} | null`。`decode_symbol` 依据固定编译器的 v0 名称语法，保留原符号，并区分 `decoded`、`plain`、`unsupported`。包名只在符号明确编码时提供，不代表源码映射；未来版本或不支持的语法安全回退到原文。来源见 [NOTICE](NOTICE)。

## 测量口径

- `8 + sum(section.total_bytes) == file length`。区段大小包含 ID 与 LEB128 长度前缀。
- `function.total_bytes = body_bytes + prefix_bytes`。函数体是 code 区段内部的细分，**不能再加到文件总大小上**。
- 自定义区段按名称展示；比较时，同名的多个自定义区段聚合求和。标准区段与同名自定义区段不会混淆。
- 函数名称来自可选 `name` 区段，计入导入函数对全局索引的偏移。导入元数据无法解析时省略索引与名称并给出警告；仍保留精确的区段字节数。
- 跨构建比较总量、区段、按符号归属的函数体包汇总，以及两侧唯一且非空的原始函数名称。函数索引只用于单个构建内的引用图，不作为跨构建身份；重名和无名称项保留为未匹配。
- 函数变化分为增大、缩小、大小相同、新增符号、消失符号及双侧未匹配。大小相同不代表行为相同，新增 / 消失符号不证明源码新增 / 删除。包汇总包含未知归属，并不代表依赖全部成本。
- 匹配覆盖率分别统计前后构建的函数数量与函数体字节数。函数体汇总与 code 区段的差额是区段头和函数数量编码；完整区段总量仍严格核对文件长度。
- 核心分析的所有数值都是原始二进制字节。CLI 的 `engineering.delivery` 独立存放整文件 gzip / Brotli 测量、参数及运行库版本；未测量为 `null`，不代表内存占用、retained size 或可删除体积。

## 已完成与边界

已完成：核心文件头检查、区段和函数体边界检查、32-bit LEB 长度检查、UTF-8 自定义名称、可读函数符号、确定性比较、预算、CLI、JSON、中英双语 HTML 报告、Worker 演示、真实项目案例与 CI 配置。

当前仅分析 core Wasm version 1，包括已经实测的 MoonBit Wasm-GC 产物。它**不是完整 Wasm 验证器**：为引用分析解码支持的指令及立即数，但不验证所有区段内容、类型关系或规范顺序；能分析的文件不等于能执行的有效模块。未知区段保留并警告，可选名称/导入元数据损坏会降级为警告。Component Model 文件不支持。

核心、CLI、Worker 共用以下限制。CLI 在分配输入缓冲前检查文件大小，浏览器在读取所选文件前检查大小；核心在解析入口复核。资源超限返回 `resource_limit`，不会作为可选元数据警告吞掉。

| 资源 | 每个模块上限 |
| --- | ---: |
| 文件 | 64 MiB |
| 区段 | 4,096 |
| 已定义函数 | 50,000 |
| 解析的导入 / 名称元数据条目 | 100,000 |
| 单个解析名称 | 4,096 UTF-8 字节 |
| 累计解析名称 | 4 MiB |
| 引用边、根和动态调用记录（含失败区域已扫描记录） | 200,000 |
| 控制结构栈深度（含函数隐式根） | 4,096 |

浏览器每次分析创建独立 Worker，输入缓冲转移给 Worker；取消、错误或 30 秒超时会终止 Worker，过期结果不会覆盖新报告。区段概览展示前 100 行，最大函数概览展示前 15 个函数。包级 / 函数级 diff 可分页，函数可搜索和按变化类型筛选；引用浏览器可切换基准 / 当前构建，查看直接调用者、被调用者、其他引用及已知包含路径。路径和引用列表最多展示 50 项，JSON 保留完整证据；离线 HTML 同样支持交互。限制用于约束工作量，不构成峰值内存或全部恶意输入性能承诺。

引用分析支持标准数值、内存、bulk memory、SIMD、Wasm-GC、尾调用与类型化函数引用的指令编码，以及 export、start、global / table 初始化和 8 种 element 段编码。`call_indirect` / `call_ref` 的目标保留未知，观察到的表成员仅是可能目标。未知或损坏指令使对应区域降级，错误记录在 `references.issues`；精确字节核算仍保留。没有已知路径不等于未使用，不计算 retained / removable size。source map 与自动优化尚未实现。压缩指标仅由 Node CLI 计算，离线 HTML 可展示；浏览器中的未测量指标明确标记。

## 真实构建示例

`examples/before` 仅输出基准文本，`examples/after` 添加字符串拆分、循环与格式化输出。`npm run demo` 用相同编译器生成 8 个产物，并保存版本、SHA-256、函数数与独立引擎校验结果。

| 编译目标与参数 | Before | After | 增长 |
| --- | ---: | ---: | ---: |
| Wasm release `--no-strip` | 3,442 B | 31,519 B | +28,077 B |
| Wasm release `--strip` | 2,569 B | 12,036 B | +9,467 B |
| Wasm-GC release `--no-strip` | 733 B | 17,014 B | +16,281 B |
| Wasm-GC release `--strip` | 383 B | 6,585 B | +6,202 B |

微型示例保留名称的 release 产物中，`custom:name` 增长 18,057 B、code 区段增长 8,850 B。不要把名称增长全部归因于业务代码，也不要把改变编译参数的差异当成代码优化收益。

外部项目案例固定了 [CommonMark](https://github.com/moonbit-community/cmark) 和 [TOML parser](https://github.com/moonbit-community/toml-parser) 的源码提交。它们是本地构建与分析案例，尚未得到上游采用。具体版本、补丁、测试和测量限制见 [案例说明](docs/cases.zh.md)。

## 竞品与比赛定位

[Twiggy](https://github.com/AlexEne/twiggy) 和 [WABT](https://github.com/WebAssembly/wabt) 是实际替代工具。本轮公开检索尚未发现定位完全相同的 MoonBit 原生产品，这不等于整个生态没有竞品。

比赛演示可以完整展示「读入真实产物 → 定位初始化占用 → 修改静态表实现 → 验证行为 → 比较体积 → 预算检查」。远端 CI 已闭环；下一步是独立使用反馈、三分钟演示与发布准备。见 [项目申报草稿](docs/proposal.zh.md)、[后续安排](docs/roadmap.zh.md)。

License: [Apache-2.0](LICENSE).
