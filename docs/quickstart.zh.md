# MoonSize v0.3 候选版快速开始

当前 CLI 候选包名为 `moonsize-local`，命令名为 `moonsize`。使用 CLI 只需要 Node.js 24.19.0；从源码重新构建核心需要仓库固定的 MoonBit 工具链。包尚未发布到 npm。先在仓库中运行 `npm run build && npm run demo && npm run package:check`，再运行 `mkdir -p dist && npm pack --pack-destination dist` 得到候选 tarball。下面示例把包安装到独立目录，不修改全局环境：

```sh
npm install --prefix ./trial ./dist/moonsize-local-0.3.0.tgz
./trial/node_modules/.bin/moonsize --version
./trial/node_modules/.bin/moonsize analyze reports/demo/after.wasm --json-file trial/analysis.json
```

Windows 上命令入口位于 `trial\\node_modules\\.bin\\moonsize.cmd`。打包验收脚本会在仓库外重新安装 tarball，并检查没有 MoonBit 编译器及仓库 `_build` 时的帮助、版本、分析、比较、记录和退出码。

比较自己的构建时，先保存基准与当前 Wasm。构建记录必须在实际构建后创建；`build-info.json` 的编译器、目标、profile、strip、flags、依赖指纹和源码提交由你的构建流程如实提供。`record` 把声明与产物 SHA-256 绑定：

```sh
moonsize record baseline/app.wasm --build-info baseline/build-info.json --output baseline/app.build.json
moonsize record current/app.wasm --build-info current/build-info.json --output current/app.build.json
moonsize diff baseline/app.wasm current/app.wasm \\
  --before-build baseline/app.build.json --after-build current/app.build.json \\
  --policy moonsize-policy.json \\
  --json-file result.json --html report.html --summary summary.md
```

CLI 退出 0 表示设置的策略通过，1 表示分析完成但预算或严格构建条件失败，2 表示输入、解析或输出错误。`result.json`、`report.html` 和 `summary.md` 分别供自动化、离线审阅和 CI 摘要使用。JSON 文件会先写到同目录临时文件，再替换目标；通过路径检查后的运行出错会写出本次错误结果。路径检查之前的错误无法安全修改冲突路径，CI 应为每次运行使用独立目录并始终检查退出码。

报告先看总体变化和策略，再看构建条件、区段、包/函数以及引用证据。包字节只覆盖按符号归属的函数体，函数匹配只使用两侧唯一原始名称。未知路径不等于未使用。浏览器入口在仓库中运行 `npm run serve`，默认仅监听本机；选择文件不会上传或执行 Wasm。CLI 生成的 HTML 可以直接离线打开，包含 Node 端压缩测量；浏览器自行分析时只提供 raw 指标。

真实项目接入可参考 [PR 工作流模板](pr-ci.zh.md) 和 [工程接口说明](engineering-ci.zh.md)。
