# 给 Windows Codex：iOS 官网维护开关接入

日期：2026-09-22。请依次阅读本文件、`BACKEND_CHANGE_GUIDE.md` 和 `WEBSITE_MAINTENANCE_2026-09-22.md`。后台所有修改由 Windows Codex 在现有后端完成，Mac 不替换后端源码，也不要求用户手动编写接口。

## 用户确认的需求

在现有 iOS 管理页增加两个清楚的状态：「只显示网站」「不显示网站，恢复游戏」。开启后，游戏暂停并隐藏，官网直接在 App 内显示，不跳系统浏览器；关闭后恢复原游戏。官网的客服按钮由网站端添加，站内客服可留在 App 内，已登记的外站客服链接仅由用户点击后打开系统浏览器。

用户最新确认：App 必须原样展示官网，不添加任何原生提示、标题、按钮、加载动画、错误页或弹窗。公告/客服/错误处理由官网决定；不要因 App 的内嵌展示需求给站点注入额外工具栏。详见 `MAC_WEBSITE_PRESENTATION_UPDATE.md`。这只调整客户端展示，不修改现有配置字段、接口路径或后台开关；Windows 不必重做已实现的后台功能。

客户端已完成并安装到 iPhone X。当前需要 Windows 端实现管理页和配置接口，不能把收到了交接包写成「已接入」。这是公开、明确的维护功能，不增加混淆、审核身份识别、隐藏替代游戏或审核前后差异行为。

## 交付内容与边界

- `WEBSITE_MAINTENANCE_2026-09-22.md`：客户端已经使用的准确字段、路由和状态约定。
- `BACKEND_CHANGE_GUIDE.md`：按路由、model、store/迁移、handler、管理页和测试分解的具体修改指引，含 401 可能原因和管理 PUT 设计。
- `client-reference/`：两个客户端实现文件，只供核对解析和导航策略，不是完整 iOS 工程，不必在 Windows 编译。
- `examples/`：默认 OFF、ON、恢复 OFF 的完整 JSON 样例，只供离线测试，不能直接导入生产。
- `verify-public-config.mjs`、`verify-public-config.test.mjs`：Node 18+ 只读公共接口检查器及离线测试，不提供管理写入、不打开维护状态。
- `WINDOWS_RECEIPT_TEMPLATE.md`：回执模板，不代表已完成。

包内没有现成后端补丁、数据库迁移或 paymentd。请在 Windows 当前真实 `shiqixjp_go` 工作副本实现；Mac 相邻目录是旧后端快照，不应覆盖已有支付、账号或官网工作。共享目录官网任务回执记录了 SVN r269505，仅为历史参考，当前基线需实际检查。

## 实现顺序

1. 先检查 `svn status` 和真实项目指引，保留未提交改动。若工作树不干净或更新有冲突，先处理本任务重叠项，不覆盖别人的工作。不要重新执行共享根目录旧 `PROMPT_FOR_BACKEND_CODEX.md` 中的历史模式修改任务。
2. 找到现有 iOS 管理页（约定 `/admin/ios`）及登录/CSRF 中间件。在同一页新增「维护期间显示内容」，显示当前状态、revision、更新时间；只读/编辑权限沿用管理体系，保存失败明确报错。
3. 实现公共只读 `GET /api/v1/ios/website-display`，无需客户端密钥或玩家登录。严格限定 `1000151 / com.stone.primitive.saga / xmwtwh5sqxssgp1`；未知或 Android 作用域不得拿到此 iOS 的 ON，不能回退通配规则。正常完整响应 HTTP 200、JSON、`Cache-Control: no-store`，不重定向、不要求认证 Cookie。Mac 在 2026-09-22 15:39（UTC+8）只读探测得到 HTTP 401；这只说明公共 GET 尚不可用，不能据此判断路由是否已实现。请定位准确路由及中间件，只对这个非敏感只读 GET 设置合适的公开访问和限流，不要放开 `/api/v1/*`、支付、账号或管理写入鉴权。
4. 实现受保护的管理 GET/PUT（建议 `/admin/api/ios/website-display`）。持久化整组配置，新增迁移使用当前库下一个空闲编号，不覆盖已经提交/部署的迁移。默认 OFF。用事务及条件更新保证 revision 单调递增；管理 PUT 携带当前 revision，冲突返回 409 并让用户刷新。
5. 同一 revision 必须返回完全一致的数据，尤其未配置时 `updatedAt` 不能每次请求取当前时间。无记录建议固定 OFF、revision 0、updatedAt 空字符串。首次编辑生成 revision 1；关闭/重置也必须递增，不能删除记录退回 revision 0。故障不能伪造成更高 revision 的 OFF。
6. 官网固定为 `https://safthwyk.antieh.com/`。服务端 URL 校验与客户端一致；客服链接最多 10 条完整 HTTPS URL，精确匹配。不要开放任意官网域名、游戏/支付域名或通配客服规则。未配置客服时返回空数组 `[]`，不能是 null。
7. 新开关独立于现有 `MINI_ONLY / BOTH / ONLINE_ONLY`、内容修订号和版本阈值；不改 Android 1000150、不改主游戏/小游戏支付、不改登录。不按版本、IP、地区或审核状态差别返回维护开关。版本 query 仅作兼容诊断。
8. 增加服务端测试并执行项目回归（现有项目回执使用 `go test ./...`、`go vet ./...`）。测试列表见下方。前端保存成功后读回真实配置；记录操作者和变更审计，但不记录认证凭证。
9. 交付前列出改动、迁移、测试和拟提交说明。SVN 提交沿用团队确认流程；本次共享交接不额外授权自动提交或生产部署。不得覆盖现有支付二进制交付物。若需生成新候选包，应放独立版本目录，记录 SHA-256，不包含 `.env`、token、数据库、证书或私钥。
10. 完成后在本目录新增 `Windows回执_iOS官网维护开关_20260922.md`，区分「实现」「测试」「SVN 提交」「生产部署」四个状态，并提供可联调地址。不要只回复文字而不写回执。

## 验收要求

- 默认 OFF，ON → OFF 往返，各次有效修改 revision 递增；服务重启后配置不丢失。
- 同 revision 内容/时间不漂移；并发保存只有一个成功，旧页面冲突不会覆盖新操作。
- 修改 URL/客服也递增；删除/重置写入更高 revision 的 OFF；失败事务不得只更新部分字段。
- 无权限、无效 CSRF、公共写请求、非法布尔值/URL/客服数组均被拒绝。
- Android、旧内容模式、支付及账号回归不变；不同 versionCode/versionName 的相同 iOS 作用域维护状态一致。
- 网站实际部署和客服可用性单独验收。历史官网回执说当时线上仍为 phpinfo，不能据此断言现在已部署，也不能未经复核开启维护。检查 HTTP 状态、标题、资源和客服目标。
- 官网已有「进入游戏」链接时，维护 App 内会拦截离站游戏链接，不把它放进客服白名单，不允许维护页继续进入远程游戏或原生支付。
- 经授权在测试环境联调：App 内 ON 显示维护官网，无 Safari；OFF 恢复原页面；断网保持最后状态；官网错误仍停留维护；付款/账号操作或存档未完成时等待。
- 手机已装 1.0.12 (49)，目前仍用正式 SDK 基址。若只部署了测试环境，要先给 Mac 端测试地址，制作单独测试配置；不要为了看效果直接打开生产 ON。

## 检查命令

```sh
node --test verify-public-config.test.mjs
node verify-public-config.mjs --file examples/default-off.json --expect off
node verify-public-config.mjs --file examples/maintenance-on.json --expect on
node verify-public-config.mjs --file examples/restored-off.json --expect off
```

接口部署后再运行（只发送 GET；完整 URL 加引号）：

```sh
node verify-public-config.mjs --url "https://safthwysdk.antieh.com/api/v1/ios/website-display?appId=1000151&packageName=com.stone.primitive.saga&channel=xmwtwh5sqxssgp1&versionCode=49&versionName=1.0.12" --expect off
```

该脚本只检查一次公共响应和传输要求，不能替代管理页、鉴权、数据库持久化、并发或真机 ON/OFF 验收。
