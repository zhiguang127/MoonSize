# v0.3：CI 决策、构建条件与压缩体积

本轮在 L2 / L3 之上增加工程决策。核心分析 / 比较仍为 schema 3；Node CLI 在成功结果顶层追加独立版本的 `engineering` 对象（schema 1），浏览器 Worker 和纯 MoonBit 分析接口不生成这个宿主扩展。包、函数、引用图的既有口径不变。

| `engineering` 字段 | 内容 |
| --- | --- |
| `policy` | 合并 CLI 参数后的实际生效配置 |
| `delivery.metrics` | raw / gzip / Brotli 的 before / after / delta；未测量为 `null` |
| `delivery.compression` | 固定参数与运行库版本；未压缩为 `null` |
| `provenance` | 两侧可空构建记录及 `comparability` 状态、已知差异、缺失字段 |
| `decision` | 综合状态、各指标的核心预算结果、带 scope 的失败原因 |

## 一次比较，三种指标

```sh
npm run build
node bin/moonsize.mjs diff before.wasm after.wasm \
  --compress --html report.html --summary summary.md --json > result.json
```

`--compress` 同时测量完整产物的 gzip 和 Brotli；`analyze` 也支持，此时 baseline 与 delta 为 `null`。两份文件在同一 Node 进程中重新压缩，不使用历史压缩大小。

| 指标 | 固定参数 |
| --- | --- |
| raw | 输入文件长度 |
| gzip | level 9、windowBits 15、memLevel 8、strategy 0 |
| Brotli | quality 6、lgwin 22、generic mode |

JSON 记录参数与 Node、zlib、Brotli 运行库版本。这些是指定条件下的可复现整文件测量，不代表 CDN 实际编码、HTTP 开销或缓存后的网络流量。跨运行的压缩实现版本可能改变结果，应固定 CI 的 Node 版本并保留运行库信息。raw 增大时压缩体积也可能缩小，各项独立判断；不把包或函数单独压缩后相加，也不把压缩节省量解释成内存或可删除体积。

未启用压缩时，`delivery.metrics.gzip` / `brotli` 为 `null`，报告显示“未测量”，不是零。浏览器仍只分析 raw，CLI 生成的离线 HTML 包含三种指标和完整策略结果。

## 预算配置

```json
{
  "schema_version": 1,
  "require_comparable": false,
  "budgets": {
    "raw": {"max_bytes": 650000, "max_growth_bytes": 20000},
    "gzip": {"max_growth_bytes": 8000},
    "brotli": {"max_bytes": 200000}
  }
}
```

```sh
node bin/moonsize.mjs diff before.wasm after.wasm \
  --policy policy.json --summary summary.md --html report.html --json > result.json
```

配置压缩预算自动启用两种压缩测量，无需重复传 `--compress`。预算是 0–2,147,483,647 的整数字节，边界包含、增长带符号；缩小可通过零增长预算。缺省字段表示不限制，显式 `null`、负数、空预算、未知键或版本都会报错。预算配置仅用于 `diff`。

旧参数 `--max-bytes` / `--max-growth` 仍只作用于 raw。可以和策略文件中未重复的 raw 限制合并；同一限制同时出现时返回参数错误，不静默覆盖。

所有指标共用 MoonBit `check_size_budget(before_bytes, after_bytes, ...)` 的判断，JS bridge 为 `size_budget_json`，`-1` 代表未配置限制。宿主先校验整数范围。原有 `check_budget(comparison, ...)` 委托给同一个函数。

| 退出码 | 含义 |
| --- | --- |
| 0 | 分析成功；未配置策略，或全部检查通过 |
| 1 | 分析成功；至少一项体积预算或构建条件检查失败 |
| 2 | 参数、文件、记录绑定、核心解析、压缩或报告输出错误 |

退出 1 仍生成 JSON、HTML 和摘要。`result.budget` 保留 raw 预算的兼容字段；自动化应使用退出码或 `engineering.decision.status` 判断综合结果，不能只检查 raw 是否通过。状态为 `pass`、`fail`、`not_configured`；没有策略不显示为通过。

## 记录实际构建条件

构建完成后，提供自己的构建声明 `build-info.json`：

```json
{
  "schema_version": 1,
  "compiler": "moonc v0.10.12+1634b282e",
  "target": "wasm-gc",
  "profile": "release",
  "strip": false,
  "flags": ["--deny-warn"],
  "dependencies_hash": null,
  "source_revision": "your-source-commit"
}
```

```sh
node bin/moonsize.mjs record app.wasm \
  --build-info build-info.json --output app.build.json

node bin/moonsize.mjs diff before.wasm after.wasm \
  --before-build before.build.json --after-build after.build.json \
  --policy policy.json --summary summary.md --html report.html
```

`record` 先分析模块，再把声明与文件长度、SHA-256 绑定；不执行 Wasm，也不自动发现或猜测编译参数。保存构建产物时一起保存记录。比较时显式指定记录，哈希或长度不匹配是输入错误（退出 2），不能继续使用过期记录。

比较字段为 `compiler`、`target`、`profile`、`strip`、有序 `flags` 和 `dependencies_hash`。明确的目标、优化、strip 条件应放入对应字段；其他影响产物的参数与环境信息放入 `flags`，不要放输出路径或秘密。依赖指纹使用小写 SHA-256，建议对 lockfile 与固定标准库版本清单生成；它只是调用方声明，工具不替用户验证依赖目录。

| 条件状态 | 含义 |
| --- | --- |
| `matching` | 所有比较字段两侧均存在且相同 |
| `different` | 至少一个已知字段不同；同时仍列出其他缺失字段 |
| `unknown` | 没有已知差异，但存在缺失字段或缺少记录 |

`null` 或字段省略表示未知；`flags: []` 表示明确声明没有其他参数，`strip: false` 表示明确不 strip。源码提交只作为追溯信息展示，不参与条件比较，否则正常 PR 永远无法通过。依赖改变会标为不同，便于区分源码回归与依赖升级。

默认差异仅提示，仍可查看原始字节变化与 L2/L3 证据。`require_comparable: true` 将 `different` 和 `unknown` 都判为策略失败（退出 1），适合要求固定构建条件的 CI。上面的示例依赖指纹为未知，因此不能通过严格条件检查。

“声明一致”不证明过程真实，也不能证明观察到的变化全由源码引起。哈希只证明记录绑定的是本次输入字节。配置及记录最多 64 KiB，字段与数组长度另有限制。

## GitHub Actions

摘要路径显式传入，不依赖工具自动检测 CI；工具会**追加** Markdown，因此可直接使用 GitHub 的 `$GITHUB_STEP_SUMMARY`。每个排行最多 10 项，每个外来标签截断至 256 字符，并转义 Markdown / HTML。

```yaml
- name: Compare Wasm size
  run: |
    node bin/moonsize.mjs diff baseline/app.wasm current/app.wasm \
      --before-build baseline/app.build.json \
      --after-build current/app.build.json \
      --policy moonsize-policy.json \
      --summary "$GITHUB_STEP_SUMMARY" \
      --html moonsize-report.html --json > moonsize-result.json
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: moonsize-report
    path: |
      moonsize-report.html
      moonsize-result.json
```

基准应取目标分支已知提交的构建产物及配套记录，保留来源提交，不用当前 PR 产物覆盖它。摘要展示各指标及预算、构建条件差异、包增长、可信匹配函数增长、单侧符号、区段变化和双侧匹配覆盖率；保留动态引用及解析限制，不把单侧符号写成已证实的新增代码。

仓库的 [CI 工作流](../.github/workflows/ci.yml) 使用 [示例策略](../examples/ci-policy.json)。`npm run demo` 构建 8 个真实产物，同时生成记录；依赖指纹按安装的 core 源码及包配置计算，忽略生成目录，实际工具链版本来自 `moon version --all`。其报告可直接离线打开。CI 示例预算只适用于 demo，不能直接视为业务项目标准。

`--html` 覆盖报告文件，`--summary` 追加摘要，`record --output` 写入记录。所有输出先检查，不能覆盖输入模块、策略、构建记录或其他输出，包含已有符号链接和硬链接别名。shell 的 `> result.json` 重定向发生在 CLI 启动前，不受这层保护；务必选择独立路径。

参考：[Node zlib API](https://nodejs.org/api/zlib.html)、[GitHub Job Summary](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#adding-a-job-summary)。本轮不增加 retained size、推断函数匹配或 source map。
