# 三分钟演示：一次真实 Wasm 优化

演示前在固定工具链和 Node 24.19.0 下运行 `python3 scripts/build-cases.py`，确认 `reports/cases/manifest.json`中的行为对照和策略状态。首次下载依赖不计入演示时间。演示只展示已有的固定 CommonMark 案例，不把演示文件伪装成现场临时优化。

| 时间 | 操作 | 应展示的证据 |
| --- | --- | --- |
| 0:00–0:35 | 打开 `reports/cases/cmark-report.html`，说明基准和优化后产物、构建条件 | 两侧记录的 SHA-256 和条件 `matching`；raw 679,991 B → 617,546 B |
| 0:35–1:20 | 查看区段、包与函数变化，搜索 `__moonbit_init` 并进入引用路径 | raw 减少 62,445 B；该函数变化约 −21,229 B；引用证据只说明静态引用 |
| 1:20–2:00 | 展示 `cases/cmark/` 中表结构改动和 `reports/cases/cmark-optimization.patch` | 符号表/实体查找实现变化；strip 后也减少 22,983 B |
| 2:00–2:35 | 打开 `cmark-ci.json` 与 `cmark-summary.md` | gzip 减少 12,035 B，Brotli 减少 8,751 B；三项零增长预算通过 |
| 2:35–3:00 | 打开 `cmark-policy-fail.json` 与 `manifest.json` | 人为设置 0 B 总量上限会返回策略失败；2,887 组输入在前后 Wasm-GC/JS 输出一致 |

可从报告跳转函数并切换中英文，HTML 断网可打开。演示时说明固定语料上的输出一致性边界，以及 `call_indirect` 等动态目标仍是未知。完整复现的源码提交、补丁、命令和哈希在 `reports/cases/provenance.json` 与 `manifest.json` 中。
