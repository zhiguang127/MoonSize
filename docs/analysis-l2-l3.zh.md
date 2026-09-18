# L2 变更归因与 L3 引用分析

这些功能在 v0.2 基础上开发，尚未发布。核心和桥接输出使用 JSON schema 3。MoonSize 不执行输入 Wasm，也不提供完整语义验证。

## 使用

```sh
npm run build
node bin/moonsize.mjs diff before.wasm after.wasm --html report.html
node bin/moonsize.mjs diff before.wasm after.wasm --max-growth 20000 --json
node bin/moonsize.mjs analyze after.wasm --why 42
node bin/moonsize.mjs diff before.wasm after.wasm --why 42 --json
```

`--why` 使用当前构建的全局函数索引（包含导入偏移），不是跨构建身份。JSON 模式新增顶层 `explanation`，包含指定索引、路径状态、根和路径边；完整引用图始终在 `analysis.references` 或 `before/after.references` 中。索引不可用 / 越界返回退出码 2；预算超限仍返回 1。

浏览器报告提供包级分页、函数搜索 / 分类 / 分页，以及基准和当前构建的引用浏览器。点击函数行的“查看引用”或路径中的函数可以继续追踪。导出的 HTML 自包含，离线仍可搜索、翻页和切换语言。概览、路径和引用列表有展示上限，完整结果保留在 JSON 中。

## L2：可核对的归因

`comparison.packages` 汇总函数体及其长度前缀，字段为 `package_name`、`before_bytes`、`after_bytes`、`delta_bytes`、`before_functions`、`after_functions`。`package_name: null` 是归属未知，永远不丢弃这部分字节。

包归属来自符号中的明确编码，不是源码映射，不包含 data / name / type 等区段；内联、共享函数和编译器生成的初始化可能影响归属。它不能直接解释成依赖全部成本或删除该依赖的收益。

`comparison.functions` 每行包含可空的 `before` / `after` 函数记录，以及：

| 字段 | 值与语义 |
| --- | --- |
| `match_kind` | `matched_exact` 或 `unmatched` |
| `confidence` | `exact` 表示唯一原始符号一致；未匹配为 `unavailable` |
| `change` | `grown`、`shrunk`、`same_size`、`added_symbol`、`removed_symbol`、`unmatched_before`、`unmatched_after` |
| `reason` | `unique_raw_symbol`、`missing_name`、`ambiguous_name`、`symbol_only_here` |
| `delta_bytes` | 匹配对的大小差；单侧唯一符号的带符号大小；缺名称 / 歧义项为 `null` |

只有两侧非空、唯一的原始名称完全一致才匹配。即使符号解码不支持，也可以按原始名称匹配；显示名、包名、function index 和相同体积均不是匹配身份。目前不进行推断匹配，`inferred_matches` 固定为 0。`same_size` 不表示函数体内容或行为相同。

单侧唯一符号表示只在该侧观察到名称，可能由新增 / 删除、重命名、内联、合并或 strip 导致。另一侧有重名时仍是歧义，不判为新增 / 消失。无名或歧义行的 `delta_bytes: null` 不等于零，也不把它们加入可信函数增长排行。

`matching.before` / `matching.after` 各自给出函数总数、已匹配数、函数体总字节、已匹配字节，以及缺名称、歧义名称和单侧符号数量。覆盖率分母包含该侧所有已定义函数；分母为零时显示无适用值。

核算关系：

```text
sum(packages.before_bytes) == matching.before.total_bytes
sum(packages.after_bytes)  == matching.after.total_bytes
sum(packages.delta_bytes) + code_overhead_delta_bytes == code 区段差值
sum(sections.delta_bytes) == 文件总差值
```

`code_overhead_delta_bytes` 包括 code 区段头和函数数量编码的变化。包、函数都是 code 内部细分，不能再次加到文件大小上。因未匹配行可能没有差值，不能要求函数差值列表直接加总为文件差值。

## L3：已知引用证据

`references` 包含 `status`、`decoded_functions`、`total_functions`、`nodes`、`edges`、`roots`、`dynamic_references` 和 `issues`。

- 节点数组按单个构建的全局函数索引排列，包含导入函数。`scan_status` 为 `imported`、`decoded` 或 `incomplete`。名称可为 `null`。
- 边记录来源种类 / 索引、目标函数索引、引用种类、原始文件字节偏移及可空的表索引。`call` / `return_call` 是直接调用；`ref_func` 是函数值引用，不等于调用。每个调用点独立记录。
- 节点的 `incoming` / `outgoing` 是边数组索引。直接调用者 / 被调用者通过过滤 `call` / `return_call` 得到，其他传入引用另列。
- `roots` 包含函数 export、start，以及 global / table 初始化和 element 引用的声明根。声明根证明产物中存在引用，不证明运行时执行。
- `root_index` / `parent_edge` 是核心通过迭代广度优先遍历计算的前驱森林；先遍历 export / start 可达的已知边，再处理其他声明根。存储复杂度为 O(节点 + 引用)，不为每个函数复制整条路径。

MoonBit API：

```moonbit
let analysis = @moonsize.analyze(bytes)
let path = @moonsize.inclusion_path(analysis.references, 42)
```

路径状态为 `known_reference_path`、`no_known_path` 或 `unavailable`。它描述二进制中的静态引用关系，不证明源代码因果、运行时可达性或删除收益。没有已知路径不能判为死代码。

`call_indirect` / `return_call_indirect` 保留 type / table 索引；`call_ref` / `return_call_ref` 保留 type 索引。目标始终未解析，不能用这些 type index 跨构建匹配。报告可以列出同表的已观察成员作为可能目标，但没有做类型筛选、数据流分析或表写入模拟，也不把候选连接成确定调用边。动态调用、未知指令或未知区段会使图状态变为 `partial`。

## 解码范围与降级

参考 [WebAssembly 二进制指令规范](https://webassembly.github.io/spec/core/binary/instructions.html) 实现立即数边界解码，覆盖标准数值、内存、多内存 memarg、bulk memory、SIMD / relaxed SIMD、Wasm-GC、尾调用、类型化函数引用和 `try_table` 编码，以及 8 种 element 段形式。原子指令、旧异常处理编码及其他未实现提案遇到时明确降级。

解析器不会靠扫描 `0x10` 字节寻找调用：会跳过整条指令的立即数、局部声明和嵌套结构。未知 opcode、损坏立即数、错误函数索引或不完整表达式产生 `issues`，该函数或对应元数据区段的引用结果整体丢弃，其他区域继续分析。导入元数据失败使整个函数索引空间不可用，此时引用图为 `unavailable`。

`decoded` 仅表示支持的区域成功完成引用解码，没有发现未解析动态调用；它不表示模块通过 Wasm 验证，也不表示所有宿主行为可知。初始化里的源码变量名未必存在于二进制，工具不虚构变量或源码行。

继续使用统一的文件 / 区段 / 函数 / 名称 / 元数据限制。新增最多 200,000 条引用边、根及动态调用记录，失败区域已经扫描的记录也计入预算；控制栈最多 4,096 层，含隐式函数或表达式根。资源超限返回 `resource_limit`，不会降级成普通引用问题。

本轮不实现 retained size、自动优化、源码映射或压缩体积。预算始终基于原始文件字节，不依赖匹配覆盖率或引用分析是否完整。
