你现在负责把《原始文明：聖獸覺醒》的 iOS 渠道接入现有 `shiqixjp_go` 后端并交付 SVN。先完整阅读随附 `ios-channel/README_DEPLOY.md` 和 `ios-channel/game/`，再检查真实 SVN 工作副本、当前未提交改动和线上版本。不要从压缩包目录直接提交；应把经过审核的文件合并到真实 SVN 工作副本。

核心要求：

1. 现有 Android 配置绝对不能改：`1000150 / com.studio.dino.stone.saga / xmwtwh5sqxssgp1 / MINI_ONLY`。不得改变其模式、修订号或默认页面行为。
2. 新增独立、明确标识为 iOS 的管理入口（建议 `/admin/ios`），不要把 iOS 继续放在写着 APK 的 Android 表单里。iOS 默认值：`1000151 / com.stone.primitive.saga / xmwtwh5sqxssgp1`，默认模式 `BOTH`。
3. 优先复用现有 `(app_id, package_name, channel)` 唯一键和内容解析 API，保持 Android 客户端向后兼容；不要为了“平台字段”做无必要的破坏性数据库迁移。
4. iOS App 请求内容配置的接口是：`GET /api/v1/content-config?appId=1000151&packageName=com.stone.primitive.saga&channel=xmwtwh5sqxssgp1&versionCode=<build>&versionName=<version>`。
5. 小游戏文件在 `ios-channel/game/`，入口为 `game/index.html`。iOS 仍保留 App 内置副本；如果后端增加静态托管，必须使用 HTTPS、正确 MIME 和原相对目录结构。
6. 当前线上曾误写入 iOS 精确规则 `MINI_ONLY`。新入口部署成功后，只把 iOS 规则更新为 `BOTH`；不得删除或更新 Android 规则。
7. 增加测试证明：Android 规则保持 `MINI_ONLY`；iOS 精确规则为 `BOTH`；两条规则互不覆盖；管理页面文案和默认参数分别正确。
8. 执行 `go test ./...`、`go vet ./...`，构建 Linux `deploy/paymentd`，更新构建信息和 SHA256。检查包中不含 `.env`、令牌、Apple 账号、证书、描述文件或沙盒账号。
9. 提交前先输出 `svn status`、改动文件清单、测试结果、二进制 SHA256 和拟用提交说明，等待我确认；确认后再 `svn commit`。不要自动部署生产。

部署后验收：

- Android 查询必须继续返回 `source=EXACT, mode=MINI_ONLY`。
- iOS 查询必须返回 `source=EXACT, mode=BOTH`。
- 后台能清楚区分 Android 与 iOS，且 Android 修订号没有因本次接入而变化。

不要要求或打印 `CLIENT_API_TOKEN`。真实密钥只由运维从服务器环境变量/外部配置注入。
