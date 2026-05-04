# Obsidian Weread Shelf

> 🍴 **这是 [zhaohongxuan/obsidian-weread-plugin](https://github.com/zhaohongxuan/obsidian-weread-plugin) 的 fork。**
> 在原插件基础上，重点增强了「整书架同步」「书架分组归类」「手写笔记（pencilNote）同步」和稳定性。
> 原插件的所有功能保留可用，下方会先列 fork 新增内容，再附原 README 的主体说明。

[![GitHub license](https://badgen.net/github/license/Naereen/Strapdown.js)](https://github.com/m1uan/obsidian-weread-shelf/blob/main/LICENSE)
[![GitHub release](https://badgen.net/github/release/m1uan/obsidian-weread-shelf/)](https://github.com/m1uan/obsidian-weread-shelf/releases)

Obsidian 微信读书插件，用来同步微信读书的书籍`元信息`、`高亮标注`、`划线感想`、`书评`、`手写笔记`等，并转换为 markdown 保存到 Obsidian。初次同步如果笔记多会较慢，之后增量同步只会更新有变化的书籍。

---

## 🆕 Fork 新增功能（v1.6.0 → v1.9.0）

### 📚 整书架同步与分组归类（v1.6.0）

原插件只同步「有划线的书」，本 fork 通过抓取 `/web/shelf` 拉取完整书架：

- **完整书架元数据同步**：连一条划线都没有的书也会同步元数据（封面、作者、ISBN、阅读状态等），方便在 Obsidian 里管理整个微信读书书架
- **按书架分组归类**：自动按你在微信读书 App 里设定的「书架分组」生成对应的子文件夹，例如「想读 / 在读 / 已读」或自定义分组
- **分组变更自动移动文件**：在微信读书 App 里把书移到另一个分组后，下次同步时插件会自动把对应的 .md 文件搬到新分组的文件夹里，不会留下重复

### 🖋️ 手写笔记 pencilNote 同步（v1.8.0 / v1.8.1）

微信读书「手写笔记」通常只有图片 URL，原插件不会同步。本 fork 提供两种模式：

- **本地下载模式**（默认）：把手写笔记图片以 PNG 下载到 vault，模板里用 `![[...]]` 引用本地路径
- **外链模式**：保留远端 URL，配合 [Local Images Plus](https://github.com/aleksey-rezvov/local-images-plus) 等图片本地化插件使用
- 内置模板自动按 `imageUrl` 去重，避免同一张手写笔记在「划线挂的笔记」和「孤立 review」里重复出现

### 🛡️ 稳定性增强（v1.6.1）

- 给 Obsidian 的 `requestUrl` 加了 20 秒超时（原生没有），解决全量同步偶尔在某本书 `getBook` 卡死、卡在 `796/918` 这类情况

### 📑 阅读状态筛选（v1.7.0）

- 书架视图新增「**未读**」筛选项（原本只有「在读 / 已读」）
- 修正了 `readingStatus` enum 的值映射

### ⚡ 同步性能优化（v1.9.0）

- 已缓存的书架书跳过 `getBook` 调用，全量同步速度大幅提升
- 内置笔记模板新增 URL 去重逻辑，pencilNote 不再重复渲染

### 📦 安装

1. 通过 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 安装：在 BRAT 设置里添加仓库 `m1uan/obsidian-weread-shelf`
2. 或在 [Releases](https://github.com/m1uan/obsidian-weread-shelf/releases) 页面下载 `main.js` / `manifest.json` / `styles.css`，放到 `<vault>/.obsidian/plugins/obsidian-weread-shelf/`，启用即可

---

## 原插件功能（继承自上游）

- 同步书籍元数据：封面、作者、出版社、ISBN、出版时间等
- 同步微信读书的高亮划线
- 读书笔记分为`划线笔记`、`页面笔记`、`章节笔记`、`书籍书评`
- 支持微信扫码登录，理论上可以和浏览器一样保持长时间不掉线
- 校验 Cookie 有效期，自动刷新 Cookie
- 自定义笔记生成模板（Nunjucks template）
- 文件名支持多种格式设置
- 自定义 FrontMatter，可在头部 yaml 中增加自己需要的字段（标签、阅读状态等）
- 公众号划线和笔记归类同步
- 支持移动端同步（手机和平板）
- 支持 Daily Notes，将当日读书笔记同步至 Daily Notes
- 微信读书书架功能，展示本地同步的书籍汇总数据
- 主题管理：内置三种主题模板，支持导入导出和自定义主题

<img width="1512" height="893" alt="image" src="https://github.com/user-attachments/assets/fe967324-789b-447a-95a2-3cd477720756" />


## 安装方法

> ⚠️ **本 fork 未提交到 Obsidian 插件市场**，请用上面的 BRAT 安装方式或在 [Releases](https://github.com/m1uan/obsidian-weread-shelf/releases) 页面手动下载。
>
> 如果你只想要原版功能，可以在 Obsidian 插件市场搜 `weread` 安装上游版本。
## 设置
1. 打开Obsidian点击`设置`进入设置界面，找到`Obsidian Weread Plugin`进入到插件设置页面
2. 点击右侧`登录`按钮，在弹出的登录页面扫码登录，登录完成后，会显示个人昵称
3. 点击`注销`按钮即可注销登录，系统会自动清除Obsidian插件的Cookie信息
4. 设置笔记保存位置，笔记最小划线数量，笔记文件夹分类
<img width="2068" height="1554" alt="image" src="https://github.com/user-attachments/assets/dfcbdce1-b63d-4156-b18e-4aeef9e57c4f" />



## 使用

⚠️ 本插件是覆盖式更新，请不要在同步的文件里修改内容，写`永久笔记`（为什么写永久笔记参考[《卡片笔记写作法》](https://book.douban.com/subject/35503571/)）的时候可以使用[Block引用](https://help.obsidian.md/How+to/Link+to+blocks) 的方式，在外部引用进行批注。

<details>
	
<summary>基础使用</summary>

1. 点击左侧Ribbon上的微信读书按钮，或者command+P(windows ctrl+P)调出Command Pattle 输入Weread 找到`Sync Weread command`即可同步。
![sync|50](https://cdn.jsdelivr.net/gh/zhaohongxuan/picgo@master/20220522222015.png)
2. 默认模板效果(theme:minimal) ![](https://cdn.jsdelivr.net/gh/zhaohongxuan/picgo@master/20220522221449.png)
使用dataview+minimal cards的显示效果，[参考这里](https://github.com/zhaohongxuan/obsidian-weread-plugin/wiki/%E4%BD%BF%E7%94%A8Dataview%E8%BF%9B%E8%A1%8C%E4%B9%A6%E7%B1%8D%E7%AE%A1%E7%90%86)：
![](https://cdn.jsdelivr.net/gh/zhaohongxuan/picgo@master/20220529135016.png)
</details>

<details>
<summary>同步笔记到Daily Notes</summary>
	
1. 在设置中打开同步到Daily Notes的开关，然后分别设置Daily Notes的目录以及文件格式
2. 如果Daily Note是Periodic Notes管理的，可以改成Periodic Notes的格式，比如我使用的格式`YYYY/[W]ww/YYYY-MM-DD`，就会按照 年/周/日的维度在文件夹中寻找Daily Notes.
3. 设置在Daily Notes的特定的区间插入，可以修改默认值为你想要的markdown格式的内容，比如在`某两个标题`之间插入，注意📢，区间内的内容是会被覆盖的，不要在区间内修改文本。	
![](https://user-images.githubusercontent.com/8613196/179385400-d556527f-8d73-4ca7-b348-62810df96fe2.png)
</details>

## 主题管理

插件内置三种主题模板，支持导入导出和自定义主题。

### 内置主题

| 主题 | 说明 |
|------|------|
| 合并式模板 | 划线和想法 inline 展示，适合快速回顾 |
| 分离式模板 | 先展示纯划线，笔记统一在底部，适合整理归纳 |
| 微信官方笔记主题 | 详细的元数据信息，适合生成书籍笔记 |

### 主题类型

| 类型 | 说明 |
|------|------|
| 内置 | 插件自带，不可删除，不可编辑 |
| 自定义 | 用户创建，可编辑、复制、导出 |
| 旧模板 | 从旧版本迁移的模板，不可编辑，只能复制后自定义 |

### 使用主题

1. 在插件设置中打开**主题管理**
2. 选择想要使用的主题，点击「使用此主题」
3. 当前使用中的主题会显示「✓ 使用中」标签

### 创建自定义主题

1. 选择任意内置主题，点击「复制并自定义」
2. 系统会创建该主题的副本并自动设为使用中
3. 点击「编辑」修改模板内容或设置项

### 导入导出

- **导出**：点击主题的「导出」按钮，下载 JSON 文件
- **导入**：支持从本地文件或 URL 导入主题

详细指南请查看[主题贡献指南](./docs/community-themes.md)。

## 已知问题
- 长期不使用本插件Cookie可能会失效，需要重新登录。
- 偶尔可能会有网络连接问题，重新点击同步即可，已同步的笔记不会再次更新。

## TODO
- [x] 解决Obsidian中CORS问题
- [x] 设置界面笔记保存路径
- [x] 优化文件同步逻辑，不需要每次都删除重建，可以根据Note的数量来判断
- [x] 被动刷新Cookie延长有效期
- [x] 多处登录导致Cookie失效Fix
- [x] 弹出扫码框登录自动获取Cookie
- [x] 书名重复导致同步失败
- [x] 设置页面支持设置Template格式
- [x] 文件名模板
- [x] 移动端适配
- [x] 阅读状态元数据，比如阅读中，阅读完成等等，以及阅读时间的分布等
- [x] 按照章节Index进行排序
- [x] 保留多个章节层级
- [x] 同步微信公众号文章
- [x] 模板预览功能
- [x] 设置页面，目录选择优化 https://github.com/zhaohongxuan/obsidian-weread-plugin/issues/39
- [ ] 导出热门划线 https://github.com/zhaohongxuan/obsidian-weread-plugin/issues/42


## Weread API
[Weread API](./docs/weread-api.md)

## 赞赏

<img src=https://github.com/zhaohongxuan/obsidian-weread-plugin/assets/8613196/661a1d1b-6f45-493b-adb5-6f53fbf2d499 width=30% />

## 免责声明
本程序没有爬取任何书籍内容，只提供登录用户的图书以及笔记信息，没有侵犯书籍作者版权和微信读书官方利益。
## 感谢
- 上游：[zhaohongxuan/obsidian-weread-plugin](https://github.com/zhaohongxuan/obsidian-weread-plugin)
- [wereader](https://github.com/arry-lee/wereader)
- [Kindle Plugin](https://github.com/hadynz/obsidian-kindle-plugin)
- [Hypothesis Plugin](https://github.com/weichenw/obsidian-hypothesis-plugin)
- [Obsidian Plugin Developer Docs](https://marcus.se.net/obsidian-plugin-docs/)
- [http proxy middleware](https://github.com/chimurai/http-proxy-middleware)
- [nunjucks](https://github.com/mozilla/nunjucks)

## Star History

[![Star History](https://api.star-history.com/svg?repos=zhaohongxuan/obsidian-weread-plugin&type=Timeline)](https://star-history.com/#zhaohongxuan/obsidian-weread-plugin&type=Timeline)
