# 游戏名称与图标统一 · 2026-09-21

## 范围

正式游戏名以现有 Info.plist / Config/Shared.xcconfig 为准：**原始文明：聖獸覺醒**。

- 首页、登录页、桌面战斗侧栏、账号页辅助文字和商店品牌行统一名称。
- 新图标接入 iOS AppIcon、网页 favicon/Apple touch icon 和首页/登录页品牌角标。
- 「荒境營地」等场景名及「琥珀」等资源名保留，不把它们误当作旧产品名批量替换。
- Bundle ID、账号服务路由、支付商品标识、存档键、埋点及 Keychain 标识不变。
- 旧图标移到 output/imagegen/brand-20260921/AmberDinoIcon-before.png，未丢弃，可恢复；该目录不参与打包。
- 未修改 App Store Connect 名称或商店素材，未上传审核。

## 生成来源

使用内置 image_gen（非 CLI、非外部模板）。现有焰脊迅龙素材仅由开发时人工查看，用文字描述配色与造型；本次未上传参考图。

生成原图：/Users/yukang/.codex/generated_images/01a0476a-fb35-7272-ab9d-cccae7188522/exec-08360c26-5435-45ca-912c-6ec330cae825.png

项目最终图标（1024 × 1024、不透明 PNG）：
- PrehistoricBeastmaster/Assets.xcassets/AppIcon.appiconset/SacredBeastIcon.png
- prototypes/emberwild/assets/brand-v1/sacred-beast-icon.png

原图仅用 sips 等比缩为 1024 × 1024 以适配资源目录，无重绘、抠图、文字合成。

## 验证结果

- `branding-browser.test.cjs`：320×568、375×812、844×390、768×1024、1440×900，新玩家/老玩家共 10 个场景通过；名称对齐 Info.plist，无按钮覆盖或标题溢出。
- 首页和登录页 375px 截图已人工查看；新图标加载正常。
- 登录隔离回归全部通过，未向线上发送账号密码或发起购买。
- Debug 构建与签名检查通过；137 个游戏文件、90 个美术/音频文件与源码一致。
- 原生和网页图标字节一致，1024×1024、无 alpha；Xcode 图标编译无报错。
- 本次只构建并检查，尚未覆盖安装到手机，也未生成或上传新的正式 IPA。

## 实际提示词全文

```text
Use case: stylized-concept.
Asset type: final production iOS app icon, one square 1024 by 1024 full-bleed opaque image, not an icon sheet and not a phone mockup.
Primary request: redesign the icon for the prehistoric action and card-building game 原始文明：聖獸覺醒 (the name is context only, DO NOT put any text in the image). Represent its actual sacred dinosaur companion: a young teal feathered raptor with an amber-gold feather crest, cream muzzle and throat, luminous amber eyes, subtle glowing ember cracks along its neck, a small primitive tooth-and-cord collar.
Composition: a powerful, appealing three-quarter close-up of this ONE creature's head and upper chest filling about 80 percent of the square, eye and muzzle easy to read at 60 pixels, head wholly within the safe central area. Alert, brave and intelligent, not babyish, not snarling, mouth nearly closed, no human. Large graphic amber feather shapes form a distinctive upward silhouette, softly lit teal scales, a small amber pendant at the lower chest.
Backdrop: deep forest-jade into midnight-teal, very restrained out-of-focus prehistoric fern silhouettes and a warm amber backlight behind the crest. Face much brighter than background, controlled high contrast, strong clean edge.
Style: polished premium fantasy mobile-game painted illustration with sculpted 3D volume; medium-large planes, elegant controlled detail, rich teal and amber, matching a prehistoric beast-raising adventure. Not flat cartoon, not photorealistic wildlife, not an existing franchise mascot.
Constraints: all four corners fully filled with opaque background; no baked rounded corners, no border, no lettering, no title, no numerals, no watermark, no badges, no UI, no collage, no extra characters, no tiny buildings, no busy particles, no weapons. Export exactly square with crisp silhouette.
```
