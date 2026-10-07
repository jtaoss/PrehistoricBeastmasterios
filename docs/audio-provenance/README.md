# 小游戏音频来源与核验清单

整理日期：2026-09-24。范围仅为 `prototypes/emberwild` 小游戏；本目录是留档材料，不会随 App / IPA 打包。

## 当前结论

- **两首背景音乐**：用户提供的 Gemini 对话截图分别显示《Warmth of a Primeval Dawn》和《Hold the Ridge》的生成回复，并确认当前项目里的 MP3 就是此前提供的原始文件。项目中的源文件与 iOS 资源副本逐字节一致。Codex 没有生成这两首音乐。
- **补充链接**：用户提供了 [Gemini 对话分享链接](https://share.gemini.google/fJt6AcURyNAY)。已确认短链接会跳转到 `gemini.google.com/share/…`，但当前工具无法读取分享页内容，因此未核实该页对应哪首或是否包含两首音乐。
- **独立核验边界**：用户的文件来源确认已记录，不再要求重新下载；截图和分享链接仍未提供可与项目 MP3 对照的原始附件校验值，生成时适用的条款版本也未知。不能把这些材料写成无条件商业授权证明。
- **音效**：15 个 M4A 文件的[项目来源记录](../../prototypes/emberwild/assets/audio/sfx/CREDITS.md)称其选自 Kenney 的 RPG Audio、Impact Sounds、Interface Sounds 并转码。它们不是 Gemini 或 Codex 生成的音频。原始 Ogg/下载包未在此留档，若要逐条追溯仍需补齐。

## 音乐证据对应

| 场景 | 项目文件 | 用户提供的截图 | 当前文件 SHA-256 | 核验状态 |
| --- | --- | --- | --- | --- |
| 首页、营地等 | `prototypes/emberwild/assets/audio/warmth-of-a-primeval-dawn.mp3` | [Gemini 对话截图](gemini-warmth-of-a-primeval-dawn.png) | `1c4ffc1c33b9d7ec50964a85eab1221d37257e64a70b6654a9903dd123ced0c0` | 用户确认是提供的原始文件；未独立核对分享页附件 |
| 战斗 | `prototypes/emberwild/assets/audio/hold-the-ridge.mp3` | [Gemini 对话截图](gemini-hold-the-ridge.png) | `2eef1a667185fbc5284bbe445bdc4a92eb3d1b166c59a674b1478358dd601135` | 用户确认是提供的原始文件；未独立核对分享页附件 |

以上两个 SHA-256 是**当前项目文件**的版本指纹，不是来源或授权证明。`PrehistoricBeastmaster/Resources/game/assets/audio/` 中对应文件的哈希与上表相同。两首文件均为 44.1 kHz、双声道、192 kbps MP3，时长分别约 177.7 秒和 182.5 秒。

截图原件已从用户在当前任务上传的图片复制到本目录，未重新编码。截图 SHA-256：

```text
gemini-warmth-of-a-primeval-dawn.png  0998500991f46ef07ef7027165cefccece3df1fce4e0bc009688f05b17579d6e
gemini-hold-the-ridge.png            ccb7c7512a5f0d3417091405dd2453cfc8cef2d7dfaeb796cd92d701444edac7
```

## 官方资料（核对日期：2026-09-24）

- [Gemini Apps 音乐生成帮助](https://support.google.com/gemini/answer/16901237?hl=en)：说明用户可下载生成音乐的 MP3。
- [Google 服务条款](https://policies.google.com/terms?hl=en)：说明 Google 不主张用户生成内容的所有权，同时要求尊重第三方知识产权。页面显示的国家版本及现行条款未必等于生成当时该账号适用的版本。
- [Google 的 Lyria / SynthID 说明](https://blog.google/innovation-and-ai/products/gemini-app/lyria-3/)：说明 Gemini 生成音乐带有 SynthID，可作为来源辅助核验；它不单独证明文件与截图对应，也不等于授权意见。
- 音效包官方页面：[RPG Audio](https://kenney.nl/assets/rpg-audio)、[Impact Sounds](https://kenney.nl/assets/impact-sounds)、[Interface Sounds](https://kenney.nl/assets/interface-sounds)。页面标注 CC0；具体项目文件与原包的逐文件对应仍依据项目来源记录，未独立比对原包。

## 下一步需要补齐

1. 已记录用户确认：当前 MP3 即此前提供的原始文件；不再要求用户重复下载。若日后需要更强的独立核验，可在可访问的 Gemini 页面比对音频附件或使用 SynthID 作补充，但不以 SynthID 代替文件同一性比对。
2. 发布前保留截图、分享链接、当前 MP3 及其校验值，并由负责发行/法务的人确认生成时适用的条款和第三方权利风险。

这份清单只整理现有证据；没有修改音频、游戏代码、支付或存档。
