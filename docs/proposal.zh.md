# MoonSize — MoonBit 原生 WebAssembly 体积分析与构建回归工具

## 问题与用户

MoonBit 开发者需要了解 Wasm 构建产物的体积构成，以及一次代码或工具链变更带来了哪些字节变化。仅比较文件总大小，不能区分代码、数据和名称/调试信息的增长。

## 项目目标

用 MoonBit 实现可复用的二进制分析、构建比较和预算判断核心，提供命令行入口和可读 HTML 报告。将真实 MoonBit `wasm`、`wasm-gc` 产物纳入回归样例。

## v0.2 实现范围

- 检查核心 Wasm 文件头、section 边界、长度编码和函数体边界。
- 统计 section、函数体的文件字节占用，单独展示自定义段。
- 读取并反修饰 MoonBit v0 函数名称，保留原符号并明确标记不支持的语法。
- 比较前后构建的总字节数和 section 分类增减。
- 根据总大小或增长预算产生机器可读结果及非零退出码。
- CLI、HTML 报告、可取消 Worker、统一资源限制和可复现外部案例。

## 边界

首版不是完整 Wasm 指令验证器，不执行被分析的 Wasm，不自动优化代码，不计算 retained size，不把函数索引当作跨构建稳定身份。不宣称全生态首创、没有竞品或保证获奖。

## 差异化与依据

Twiggy 和 WABT 是真实替代工具。项目将重点验证 MoonBit 产物适配、构建比较、浏览器可读报告和 CI 预算检查的使用体验。独立 MoonBit 原生竞品尚未在本轮公开检索中发现，该结论不涵盖未发布或未索引项目。

- https://github.com/AlexEne/twiggy
- https://github.com/WebAssembly/wabt
- https://webassembly.github.io/spec/core/binary/modules.html
- https://moonbitlang.github.io/Hackathon2026/

## 验收证据

核心在 Wasm、Wasm-GC、JS、Native 四个后端通过本地测试，CLI / Worker 提供 14 项集成测试。固定两个外部项目提交：CommonMark 与 TOML；提供命令、哈希、构建日志和离线报告。

CommonMark 案例根据初始化函数占用进一步检查静态实体表，将通用 Json 表改为有序数组与二分查找。在相同 release / no-strip 参数下，679,991 B → 617,546 B（−9.18%）；两边都 strip 后仍减少 22,983 B。2,887 组输入在前后版本的 Wasm-GC 与 JS 上输出一致，相关上游测试通过。收益包括名称元数据，代码区段减少 22,853 B。

实际证据见 README、docs/cases.zh.md 和 docs/validation.md。远端 CI 已配置但尚未运行；项目未发布，也没有把本地案例表述为上游采用。
