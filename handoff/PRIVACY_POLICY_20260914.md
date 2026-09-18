# 隐私政策更新：iOS 46 测试候选

## 本次实现

- 隐私政策正文唯一源文件：`PrehistoricBeastmaster/Resources/game/privacy-policy.html`。此自包含 HTML 可直接作为服务器上的同名页面，无外部 CSS、脚本、字体或图片依赖。
- 小游戏原“隐私政策”按钮及相同 URL 的原生跳转打开 App 内置阅读器。阅读器不加载游戏桥接、不共享游戏 cookies、不执行 JavaScript；点完成不会授予同意。
- 原生导航栏提供“完成”和“系统设置”，不恢复启动协议弹窗，不更改 ATT 授权或支付逻辑。
- 正文补充 Firebase、Meta、广告衡量、实际事件字段、IDFA 关闭和 ATT 开关范围、拒绝与撤回、在途请求边界。账号删除部分只说明现有说明入口，不再虚构已验证的“设置－账号注销”入口或确定的处理期限。

## 线上尚未发布

现有 URL：`https://d1udhm4c9vjzph.cloudfront.net/ios-legal/privacy-policy.html`。

本机没有发现该 CloudFront 站点的源站部署配置或已授权发布工具。因此 App 内置更新不代表此公网 URL 已更新，也不代表 App Store Connect 的隐私标签已修改。

请运维将附带的同名 HTML 替换到该 URL 对应的源站 `/ios-legal/privacy-policy.html`，仅更新 iOS 隐私页，不改安卓页面、支付接口或游戏渠道。发布后刷新该路径的 CDN 缓存，核对正文日期为 2026-09-14，并检查手机浏览器访问结果。

发布前需由服务负责人确认：

1. 开发者名称和既有客服邮箱仍有效，保留的资料、服务器保存期限和删除处理描述与实际一致。
2. 远端 H5 的完整数据流及动态第三方代码。2026-09-14 读取正式入口，TalkingData/Fundebug 的两行引用为注释，不据此认定它们正在采集。
3. 原生 SDK 合并隐私报告、广告用途及 App Store Connect 标签。标签应覆盖 H5 的数据处理，不是只填写 Firebase/Meta。
4. 真正的账号注销还需另行完成闭环；本次文案更新不解决假删除，也不能用客服邮箱作为本游戏唯一的合规注销方案。

## 验收范围

覆盖安装不卸载游戏，不清空旧订单，不自动发起购买。允许／拒绝／撤回 ATT 的原生逻辑沿用 45；本次重点验收小游戏“隐私政策”可打开、完成可返回、断网可阅读、系统设置入口可用，以及两处政策文本一致。

参考：

- https://developer.apple.com/app-store/user-privacy-and-data-use/
- https://developer.apple.com/app-store/app-privacy-details/
- https://firebase.google.com/support/privacy
