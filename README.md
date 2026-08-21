# md2html

把 Markdown 文件转换成带简洁样式的 HTML 文件。用 TypeScript 编写，零运行时依赖。

## 功能

- 支持标题、段落、有序 / 无序列表（含嵌套）、围栏 / 缩进代码块、引用、分割线、链接、图片、加粗、斜体、行内代码
- 内置简洁默认样式，自动适配浅色 / 深色系统主题
- `--watch`：监听 Markdown 文件变化，自动重新生成 HTML
- `--css`：用自定义 CSS 替换默认样式
- `--serve`：启动本地 HTTP 服务器预览，同时监听文件变化
- `--pdf`：把 Markdown 转换成 PDF（通过本机的 Chrome / Edge 无头模式）
- `--ui`：启动本地网页，拖拽上传 Markdown 即可一键下载 PDF
- 未指定输出文件时自动推导输出文件名

## 安装

要求 Node.js 18 及以上。

```bash
cd md2html
npm install
npm run build

# 可选：链接为全局命令，之后可直接使用 md2html
npm link
```

## 使用

```bash
md2html input.md                  # 输出 input.html
md2html input.md -o output.html   # 指定输出文件
md2html input.md --watch          # 监听变化，自动重新生成
md2html input.md --css style.css  # 使用自定义样式
md2html input.md --pdf            # 输出 input.pdf
md2html input.md --serve          # 启动预览服务器（默认端口 8080）
md2html input.md --serve --port 3000
md2html --ui                      # 启动网页版转换器
```

### 选项

| 选项 | 说明 |
| --- | --- |
| `-o, --output <file>` | 输出 HTML 文件。默认把输入文件名的 `.md` / `.markdown` 换成 `.html`（无扩展名则直接追加 `.html`），输出目录不存在时自动创建 |
| `-c, --css <file>` | 使用指定 CSS 文件替换内置样式，CSS 内容会被内联进生成的 HTML |
| `--pdf` | 同时输出 PDF（通过无头 Chrome / Edge 打印）。默认输出 `input.pdf`，也可用 `-o` 指定 |
| `--ui` | 启动本地网页版转换器：上传 Markdown 文件，一键下载 PDF。不需要输入文件 |
| `-w, --watch` | 监听输入文件，改动后自动重新生成。文件被删除时会等待恢复，恢复后继续监听 |
| `-s, --serve` | 在本地 HTTP 服务器上预览生成的 HTML，隐含 `--watch` |
| `-p, --port <n>` | `--serve` 的端口，默认 8080；端口被占用时自动尝试后续端口 |
| `-h, --help` | 显示帮助信息 |
| `-v, --version` | 显示版本号 |

### 预览服务器

```bash
md2html README.md --serve
```

启动后终端会打印预览地址（如 `http://localhost:8080/`），用浏览器打开即可查看。`--serve` 同时开启文件监听：修改 Markdown 并保存后 HTML 会自动重新生成，刷新浏览器即可看到更新。生成的 HTML 所在的目录就是静态资源根目录，Markdown 里相对路径引用的本地图片等资源也能正常加载。

### 转换为 PDF

```bash
md2html input.md --pdf
md2html input.md --pdf -o docs/input.pdf
md2html input.md --pdf --watch   # 监听变化，自动重新生成 PDF
```

PDF 由无头 Chrome / Edge 把生成的 HTML 打印而来，代码块、语法高亮背景、链接样式都会保留，页面为 A4 并自动断页。需要本机安装以下任一浏览器（Chrome、Chromium 或 Edge）；如果安装位置不常见，可以用环境变量 `CHROME_PATH` 指定浏览器可执行文件的路径。

### 网页版转换

```bash
md2html --ui
md2html --ui --port 3000
```

启动后在浏览器打开终端打印的地址（如 `http://localhost:3000/`），页面支持三种转换：

- **Markdown → PDF**：上传 `.md` 文件，点击后直接下载 PDF
- **Markdown → HTML**：上传 `.md` 文件，在页面内预览生成的 HTML，也可下载
- **HTML → PDF**：上传 `.html` 文件，点击后直接下载 PDF

转换由本机的 md2html 引擎完成（同一个解析器和 Chrome 打印链路），文件只在本机处理，不会上传到任何第三方。

## 支持的语法

- 标题（ATX `#` 与 Setext `===` / `---`）、段落
- 表格（GFM 风格，支持列对齐）
- 有序 / 无序列表（含嵌套、懒续行与空行分隔）
- 围栏代码块（可带语言标注）与缩进代码块
- 引用、分割线
- 链接、图片（含标题文字）
- 加粗、斜体、行内代码、转义

## 开发

```bash
npm run build   # 编译 TypeScript 到 dist/
npm test        # 编译并运行解析器与服务器测试
```
