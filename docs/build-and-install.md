# 手动编译并安装本插件（.vsix 安装教程）

这份文档说明如何在本机把 `src/` 下的 TypeScript 源码编译、打包成一个 `.vsix` 文
件，并安装到你自己的 VS Code 里。整个过程不需要发布到插件市场。

> 只想边改边调试？跳到
> [不用打包的开发模式](#方式三不用打包的开发模式改代码时最方便)。

## 前置条件

| 工具        | 要求                          | 检查命令        |
| ----------- | ----------------------------- | --------------- |
| Node.js     | 18.x 或更高（推荐 LTS 20/22） | `node -v`       |
| npm         | 随 Node 一起安装              | `npm -v`        |
| Git（可选） | 用于 clone 你的 fork          | `git --version` |
| VS Code     | 1.52 以上                     | 帮助 -> 关于    |

本项目的依赖在 Node 22 + npm 10 下验证通过。

npm 下载慢可以换国内镜像（只影响下载速度，不影响打包结果）：

```bash
npm config set registry https://registry.npmmirror.com
```

## 方式一：打包成 `.vsix` 后安装（推荐，最接近真实使用）

### 1. 准备源码

```bash
# 如果是你的 fork
git clone <你的 fork 地址> cph
cd cph

# 或者直接用你已经改好的本地目录
cd F:/Desktop/Misc/cph
```

### 2. 安装依赖

```bash
npm install
```

首次执行需要几分钟。看到 `added xxx packages` 且没有 `npm ERR!` 即可。（如果你之
前安装过，改动依赖后重新执行这一步。）

### 3.（可选）做一遍质量检查

```bash
npm run test-compile   # TypeScript 编译检查
npm run lint           # ESLint
npm test               # Jest 单元测试
```

三者都通过再打包，能避免把明显的错误装进 VS Code。

### 4. 打包

推荐用 `npx` 临时调用打包工具，不必全局安装：

```bash
# Windows PowerShell / Git Bash 通用
npx --yes @vscode/vsce@latest package --allow-missing-repository --no-dependencies
```

参数说明：

-   `--allow-missing-repository`：本项目 fork 后通常没有 `repository` 字段，vsce
    会为此报错，加这个参数跳过。
-   `--no-dependencies`：不联网校验依赖，能明显加快打包。
-   想指定输出文件名：`--out cph-custom.vsix`。

成功后会输出类似：

```
DONE  Packaged: DivyanshuAgrawal.competitive-programming-helper-2077.0.0.vsix (50 files, 576 KB)
```

打包过程中 vsce 会自动执行 `npm run vscode:prepublish`，也就是用 webpack 以
production 模式把 `src/` 打包到 `dist/`，所以**不需要**你手动跑 webpack。

> 提示：`.gitignore` 里已经忽略了 `**/*.vsix`，打包产物不会被提交。

### 5. 安装到 VS Code

**图形界面（最直观）**

1.  打开 VS Code，切到「扩展」侧栏（Ctrl+Shift+X）。
2.  点右上角 `...` 菜单 -> **Install from VSIX...**。
3.  选择刚才生成的 `.vsix` 文件。
4.  右下角提示完成后，按提示 **Reload** / `Ctrl+Shift+P` -> `Reload Window`。

**命令行（更快）**

```bash
code --install-extension DivyanshuAgrawal.competitive-programming-helper-2077.0.0.vsix
```

如果提示 `code` 不是命令：在 VS Code 里 `Ctrl+Shift+P` ->
`Shell Command: Install 'code' command in PATH` 执行一次即可。

**拖拽**

直接把 `.vsix` 文件拖到 VS Code 的「扩展」面板空白处也可以安装。

### 6. 重要：处理与官方版插件的冲突

本 fork 的 `publisher.name`（`DivyanshuAgrawal.competitive-programming-helper`）
和官方插件完全一样。如果你之前装过官方版 Competitive Programming Helper：

1.  先在扩展面板里把官方版 **卸载（Uninstall）** 或 **禁用（Disable）**。
2.  再安装你的 `.vsix`。
3.  `Reload Window`。

否则两者会互相覆盖，或者 VS Code 会在启动时提示重复安装。

想长期区分，可以改 `package.json` 里的 `"publisher"` 和 `"name"`，例如：

```json
"publisher": "me",
"name": "cph-fork"
```

这样安装后扩展名为 `me.cph-fork`，可以和原版共存（但仍然建议只启用一个，因为两者
都监听同一个 27121 端口用于 Competitive Companion）。

### 7. 验证

-   扩展面板里能看到 Competitive Programming Helper，发布者/版本与你打包的一致。
-   `Ctrl+Shift+P` 能看到 `CPH: ...` 系列命令（例如
    `CPH: Link Problem from URL`）。
-   「输出」（Output）面板下拉里能看到 `Competitive Programming Helper` 频道。

## 方式二：每次改动后更新

改了源码想让 VS Code 里生效：

```bash
npx --yes @vscode/vsce@latest package --allow-missing-repository --no-dependencies
code --uninstall-extension DivyanshuAgrawal.competitive-programming-helper
code --install-extension DivyanshuAgrawal.competitive-programming-helper-2077.0.0.vsix
```

卸载旧版再装不是必须（装同一个 publisher.name 会自动覆盖），但覆盖后一定要
`Reload Window`，扩展宿主进程才会加载新代码。

## 方式三：不用打包的开发模式（改代码时最方便）

```bash
code .
```

然后按 `F5`（或运行调试配置 `Run Extension`）。VS Code 会新开一个「扩展开发宿
主」窗口，里面加载的就是你当前的源码，`.vscode/launch.json` 里已经配好了 webpack
前置构建。改完代码在这个窗口里 `Ctrl+R` 重新加载即可，适合频繁迭代；确认没问题后
再用方式一打包。

## 常见问题排查

**`npx @vscode/vsce` 报 `ERROR Missing publisher name` / `Missing repository`**

确认 `package.json` 顶层有 `"publisher"`，并加上 `--allow-missing-repository`。

**打包报错一堆 `Error: ... 'sponsor' / 'pricing' / 'badges'` 之类的字段问题**

通常是 vsce 版本与 `package.json` 字段不匹配，升级到最新版即可（脚本里已固定用
`@vscode/vsce@latest`）。

**安装时报「无法安装，因为清单文件损坏」或版本不兼容**

检查 VS Code 版本是否满足 `package.json` 里 `engines.vscode`（本项目是
`^1.52.0`）。另外确认 `.vsix` 是用 VS Code（而不是 VSCodium / Cursor）安装，某些
分支版本对 publisher 校验更严格。

**`npm install` 中途失败 / ELIFECYCLE**

删掉 `node_modules` 重装：

```bash
rm -rf node_modules package-lock.json
npm install
```

**装完没生效**

1.  `Reload Window`。
2.  确认没有同时启用同 publisher.name 的官方版。
3.  「输出」面板 -> `Competitive Programming Helper` 看启动日志。
4.  如果端口 27121 被占用（Companion 导入无反应），改配置前先关掉其它实例。

## 相关文档

-   用户使用说明：[user-guide.md](user-guide.md)
-   开发与新增语言/翻译：[dev-guide.md](dev-guide.md)
