# 单产物 PR 体积检查模板

[工作流模板](../examples/pr-ci.yml)面向已有 MoonBit 构建的项目。复制到项目的 `.github/workflows/moonsize.yml`；v0.3 发布前，将工具 checkout 的 `ref` 改成已审阅的 MoonSize 提交 SHA，发布后固定到版本 tag。模板以目标分支的 `base.sha` 和 PR 的 `head.sha` 分别构建，两侧在隔离的 checkout 中运行，避免当前 PR 产物覆盖基准。策略文件从基准 checkout 读取，PR 不能仅通过修改预算使本次检查通过。

项目需提供 `scripts/moonsize-build.sh`。它在项目根目录运行，读取 `MOONSIZE_OUTPUT_DIR`，把**唯一要检查的** Wasm 产物写到 `$MOONSIZE_OUTPUT_DIR/app.wasm`。模板的构建条件声明为 `wasm-gc`、`release`、`strip=false`、`--no-strip`；如实际构建命令不同，要同步修改模板中两个 `write-build-info.mjs` 调用。下面只是示意，必须换成项目自身可确定的模块路径和产物路径：

```sh
#!/usr/bin/env bash
set -euo pipefail
moon build path/to/package --target wasm-gc --release --no-strip
cp _build/wasm-gc/release/build/path/to/app.wasm "$MOONSIZE_OUTPUT_DIR/app.wasm"
```

基准分支需有 `moonsize-policy.json`。例如：

```json
{"schema_version":1,"require_comparable":true,"budgets":{"raw":{"max_growth_bytes":0},"gzip":{"max_growth_bytes":0},"brotli":{"max_growth_bytes":0}}}
```

此零增长策略适合把任何增长交给评审，不应直接解释为业务必须零增长。首次接入可以先使用可接受的阈值；CI 失败会保留摘要、JSON、HTML 和两侧产物。缺少基准或产物时，构建步骤失败，不会变成“预算通过”。产物大小、gzip/Brotli 设置、构建条件、函数匹配覆盖率与解析未知项都在报告里。

模板固定 Node 24.19.0，并安装仓库 SHA 校验过的 MoonBit 工具链。`write-build-info.mjs` 读取实际 `moon version --all`，对已安装的 core、项目配置、构建脚本及已安装 `.mooncakes` 源文件计算 SHA-256；`record` 再绑定最终 Wasm 字节。源码提交仅用于追溯，不参与条件相等判断。构建命令的环境变量或依赖若超出这些文件，应在两侧 `--flag` 里明确记录，或扩展项目自己的构建记录生成方式。

不要将 `pull_request_target` 与执行 PR 代码的构建步骤结合。模板使用 `pull_request` 和只读 `contents` 权限；它不发布包、部署网站或发送评论。外部项目接入后，至少检查一次正常 PR、一次超预算、一次条件差异和一次缺少产物的失败，再把报告作为团队评审依据。
