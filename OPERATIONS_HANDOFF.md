# iOS 运营交付说明

## 正式应用身份

- 应用名：原始文明：聖獸覺醒
- Bundle ID：`com.stone.primitive.saga`
- Apple ID：`6807295253`
- Team ID / App ID Prefix：`ADR4GMT9V3`
- SKU：`PRIMAL-SAGA-IOS-TW-001`
- 后台 App ID：`1000151`
- 渠道：`xmwtwh5sqxssgp1`
- 运营签名证书：`YU_KANG_Apple_Distribution_2026.p12`
- App Store 描述文件：`Primal_Legends_AppStore_YU_KANG_2026.mobileprovision`

Release 配置已经写入正式 Bundle ID 与 Team ID。上面的两个文件名来自更新后的参数表，仅作为运营核对清单；证书文件、描述文件、沙盒账号、钥匙串和密码均不写入源码或普通交付压缩包。

## 运营签名与上传

1. 使用有权访问 Team `ADR4GMT9V3` 的 Apple Developer 账号打开 `PrehistoricBeastmaster.xcodeproj`。
2. 在运营电脑的“钥匙串访问”中导入 `YU_KANG_Apple_Distribution_2026.p12`；导入密码通过独立安全渠道传递，不记录在项目、参数表副本或聊天交付说明中。
3. 安装 `Primal_Legends_AppStore_YU_KANG_2026.mobileprovision`，并确认其 App ID 为 `ADR4GMT9V3.com.stone.primitive.saga`。
4. 在 App Store Connect 确认 Bundle ID、Apple ID 和 19 个 `pbm_tier_*` 消耗型商品均属于同一应用。
5. 按需加入 `PrehistoricBeastmaster/GoogleService-Info.plist`，然后运行 `python3 tools/generate_xcodeproj.py`。
6. 如支付后台要求客户端令牌，复制 `Config/Secrets.xcconfig.example` 为 `Config/Secrets.xcconfig` 并只在运营安全环境填写。该文件已被忽略，不应提交或转发。
7. 使用 Release 配置执行 Archive，并由运营证书及描述文件完成签名、导出和上传。

App Store 手动签名导出配置已保存在 `ExportOptions-AppStore.plist`。现代 Xcode 机器完成 Archive 后可执行：

```bash
xcodebuild -exportArchive \
  -archivePath output/PrehistoricBeastmaster.xcarchive \
  -exportPath output/AppStore \
  -exportOptionsPlist ExportOptions-AppStore.plist
```

## App Store 支付链路

- H5 `dopay` 已接入 StoreKit 2，不再跳转官网储值页。
- 客户端先调用 `sdk.pay.fororder` 创建 SDK 订单，再使用后台返回的 `applesku` 打开 App Store 支付。
- App Store 返回的签名交易 JWS 会发送到 `sdk.pay.notification`；只有服务器验单并发货成功后，客户端才会结束交易并回调 H5 成功。
- App 重启、回到前台或网络恢复时会自动补验未完成交易。同一订单重试不会再次打开支付，连续点击也不会创建多笔订单。
- H5 回调包括 `onPayResult`、`onPayPending`、`onPayCancel` 和 `onPayFail`；成功结果包含 SDK `orderId` 与 App Store `transactionId`。
- Debug Scheme 已绑定 `Products.storekit`，用于 Xcode 本地支付场景测试；TestFlight/正式测试必须使用 App Store Connect 中同 Bundle ID 下的 19 个消耗型商品。

## 已配置的 iOS 法律页面

- 隐私政策：`https://d1udhm4c9vjzph.cloudfront.net/ios-legal/privacy-policy.html`
- 用户协议：`https://d1udhm4c9vjzph.cloudfront.net/ios-legal/terms-of-service.html`
- 账号删除：`https://d1udhm4c9vjzph.cloudfront.net/ios-legal/account-deletion.html`

## 不应进入客户端或交付包的内容

- 沙盒测试账号及密码
- SDK 登录秘钥、支付秘钥
- 个人 Apple Account、个人 Team、个人证书和钥匙串
- `史前新包双端参数.xlsx`

沙盒账号只在安装后的测试设备上用于 App Store 内购沙盒登录，不用于 Xcode 签名。
