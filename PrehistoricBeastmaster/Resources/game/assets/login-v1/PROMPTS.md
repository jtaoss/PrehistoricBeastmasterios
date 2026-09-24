# 登录 UI 素材 · v1

生成日期：2026-09-19。所有图片均使用用户指定的 `D:\Desktop\Image generation tool` 本地 Go 网关生成，未调用内置生图服务。

- 服务：`http://127.0.0.1:8080/v1/images/generations`；实际 `/healthz` 返回 `20260916-imagegen-studio-v5 / ok`，模型列表包含 `gpt-image-2`。
- 模型：`gpt-image-2`，`quality=high`，每种素材独立请求一次，无自动重试；三次真实请求均返回 PNG。
- 提示词全文和画布尺寸：[generation.json](generation.json)。调用脚本：[generate-login-ui.mjs](../../generate-login-ui.mjs)，从环境变量读取本地网关令牌，不读取或记录上游密钥，不覆盖已有文件。
- 本轮参照了项目现有 `assets/expedition-cover.png` 的视觉风格；没有向模型上传该图，因此不是原封面的图生图修改。

| 文件 | 画布 | 用途 |
| --- | --- | --- |
| `login-sanctuary-v1.png` | 1536 × 1024 | 蕨林营地、骨木入口、幼兽与圣兽卵；右侧低对比留白承接表单 |
| `login-crest-v1.png` | 1024 × 1024 | 骨木、蕨叶和琥珀圣兽卵徽记；PNG 左上角 Alpha=0 |
| `login-panel-v1.png` | 1024 × 1536 | 留白的深青绿皮革面板、骨木边框；PNG 左上角 Alpha=0 |

成图已逐张查看；文字、按钮、输入框均使用真实 HTML 控件，不烘焙在图片上。原有封面、伙伴、商店素材均保留。

用图位置：[login-preview.html](../../login-preview.html) 与 [login-preview.css](../../login-preview.css)。只做 UI 阶段，不接登录服务，不改游戏入口。交互与安全边界见 [LOGIN_UI.md](../../LOGIN_UI.md)。
