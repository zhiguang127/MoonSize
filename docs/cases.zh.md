# v0.2 外部项目案例

测量日期：2026-09-13，Windows x86_64，moonc `v0.10.12+1634b282e`。这是本地实验，尚未向上游提交或被上游采用。

## 固定输入

| 项目 | 固定提交 | 构建入口 |
| --- | --- | --- |
| [CommonMark](https://github.com/moonbit-community/cmark) | `ebf47ab9efcbd2ecff6f6ec8656c06a308395729` | 上游自带 `cmarkwrap/src/lib`，Wasm-GC |
| [TOML parser](https://github.com/moonbit-community/toml-parser) | `52fb664d435013b43897536e05adf5478cc26046` | 上游自带 `toml_cli`，Wasm |

下载脚本固定提交并校验压缩包 SHA-256，使用 workspace 将包装层与固定源码连接，避免悄悄分析注册表中的另一版主库。实际解析到的第三方依赖清单保存在 `reports/cases/dependencies.json`。不同编译器、平台和依赖可能产生不同字节结果，应在同一环境内重建前后版本。

## CommonMark：从报告到源码优化

保留名称的基准产物为 **679,991 B**。MoonSize 显示最大函数 `@__moonbit_init` 的函数体加长度前缀为 **69,946 B**。这提示需要进一步检查静态初始化源码，并不自动证明哪些源码对应这些字节。

源码中 HTML 命名实体表由生成器构造通用 `Json` 字典。实验将其改为两个并行、按词典序排序的 `FixedArray[String]`，通过二分查找返回实体值；保留所有实体，并修改生成器，避免下一次构建覆盖优化。MoonBit 的默认字符串比较按长度优先，查找显式使用 `lexical_compare` 与 Python 排序一致。

| 相同编译条件内的比较 | Before | After | 差值 |
| --- | ---: | ---: | ---: |
| Wasm-GC release `--no-strip` | 679,991 B | 617,546 B | −62,445 B（−9.18%） |
| Wasm-GC release `--strip` | 288,207 B | 265,224 B | −22,983 B（约 −7.97%） |
| `--no-strip` 的 code 区段 | 183,018 B | 160,165 B | −22,853 B |
| `--no-strip` 的 name 自定义区段 | 387,800 B | 348,433 B | −39,367 B |

优化后初始化函数为 **48,717 B**。总收益包含名称元数据变化；不能把 62,445 B 全部称为运行代码的减少。两边都 strip 后仍有体积收益。二分查找与哈希表有不同的时间复杂度，这里验证体积与输出一致性，尚未验证运行速度或延迟。

## 行为核对

- CommonMark `char`、`cmark`、`cmark_html` 三个相关包：优化前后各 **261 / 261** 项上游测试通过。
- **2,887** 组输入：完整 CommonMark 0.31.2 规范文本、652 个独立规范示例、实体源文件中的全部 2,231 种拼写，以及空输入、无效实体、链接实体等补充输入。
- 每组输入同时比较优化前后 **实际 Wasm-GC 产物**和 JS 产物，四个输出完全一致；没有仅用 JS 模拟 Wasm 结果。
- 前后两个 Wasm-GC 版本在 Node 24 中按上游的 JS string builtins 配置实例化。MoonSize 本身不会执行用户上传的 Wasm；执行发生在受控的案例验证脚本里。
- Wasm 产物全部通过 Node 的独立引擎校验，MoonSize 区段总和与原始文件长度一致且无元数据警告。

这是固定语料上的等价性证据，不是对所有可能输入的数学证明，也不等同于全部 CommonMark 合规性认证。规范例子用于前后回归比较，不把上游已有行为偏差改成快照通过。

## TOML：第二个独立产物

上游 `toml_cli` 在 Wasm release `--no-strip` 下为 **755,712 B**，包含 871 个已定义函数。MoonSize 解码其中 815 个 MoonBit v0 符号，54 个按原名展示，2 个明确标记 unsupported 并保留原文。上游 TOML 包 **255 / 255** 项测试通过。

此案例验证另一套实际依赖和 CLI 产物上的统计、名称回退与报告能力；没有声称对 TOML 做了体积优化。

## 一条命令复现

```powershell
cd D:\MoonSize
.\dev.ps1 cases
```

标准环境：将固定 MoonBit 工具链放入 PATH 后运行 `python3 scripts/build-cases.py`，需要 Python 3.10+、Node 24+ 和网络。Windows 的脚本只将上游 pre-build 中的 `python3` 改为 `python`，避免商店别名；这一调整同时应用于前后版本。

脚本写入独立的 `.local/real-cases`，不会改动其他用户项目。它先保存并分析 baseline，再应用 `cases/cmark/` 的实验实现；完成后恢复原始生成器和查找源码。上游依赖的已有弃用警告保留在日志中，MoonSize 自身仍按 `--deny-warn` 检查。

生成在 `reports/cases/` 的证据：

- `cmark-report.html` / `toml-report.html`：离线可读报告。
- `manifest.json`：体积、SHA-256、符号状态、行为语料与输出哈希。
- `provenance.json`：项目提交、压缩包哈希、执行命令和构建条件。
- `cmark-optimization.patch`：生成器及查找函数的实际补丁。
- `*.wasm` / `*.mjs`、分析 JSON、构建测试日志及上游许可证。

这些文件由本地构建生成，默认不提交到 Git；GitHub Actions 会重建并上传证据。2026-09-14，提交 `4e10ce1` 的远端运行 #3 成功并产生 `moonsize-evidence`；见 [Actions 页面](https://github.com/zhiguang127/MoonSize/actions)。
