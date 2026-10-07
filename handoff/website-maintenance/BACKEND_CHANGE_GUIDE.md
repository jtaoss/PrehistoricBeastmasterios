# Windows 后台具体修改指引

这是一项需要在 Windows 真实后端工作副本完成的实现任务，不是让用户配置接口。Mac 负责 iOS 客户端与真机联调；Windows Codex 负责服务端代码、数据库迁移、后台页面、测试和交付回执。

以下定位依据 Mac 可见的旧 `shiqixjp_go` 源码；文件、函数名仅作查找线索，以 Windows 当前版本为准。不要拷贝旧源码覆盖现有服务，也不要为了接口 401 让用户提供或在 App 内添加管理员凭证。

## 1. 在路由层新增两个明确入口

查找 `internal/httpapi/server.go` 中的 `Server`、`New`、`NewAdminPreview` 和 `routes()`：

- 新增独立的维护配置 store 依赖，正式启动注入持久化实现，预览/测试可注入内存实现。
- 注册客户端已经固定使用的公共路径 `GET /api/v1/ios/website-display`。只允许 GET，其他方法返回 405，不能写数据；保留安全响应头、日志、限流等通用保护。
- 注册受管理员登录、权限与 CSRF 保护的管理 GET/PUT。交接建议 `/admin/api/ios/website-display`；也可遵循当前 `/admin/api/v1/...` 命名规范，只要管理页面同步使用，并在回执写明。不要擅自改客户端公共路径。

**401 排查线索：**旧源码在 `routes()` 末尾有 `s.mux.Handle("/", s.requireAPIAuth(http.HandlerFunc(s.handleLegacy)))`。如果新路径尚未注册，请求可能落到这个需要 token 的兜底路由，从而返回 401。这是基于旧源码的可能原因，不是线上已确认根因。先检查当前精确路由、反向代理和访问日志；新增精确路由即可避免落到旧兜底时，不要修改旧支付鉴权或匿名开放整个 `/api/v1/`。

## 2. 增加独立 model 和严格校验

可新增 `internal/model/website_display.go`，不要把维护字段塞进会改写 Android 的旧内容模式记录。

响应结构见 `examples/default-off.json`，JSON 名称、大小写和类型必须完全匹配：

- 字符串：`appId`、`packageName`、`channel`、`websiteUrl`、`updatedAt`。
- 布尔：`websiteOnly`，不能返回 `"true"` 或 0/1。
- 数组：`supportUrls`，空值必须 `[]`，不能 null。Go 中显式初始化空切片。
- 整数：`revision`，非负、递增；为管理页 JavaScript 精确比较，建议上限不超过安全整数 9007199254740991，并在达到上限时拒绝写入而非回绕。
- 外层 `code` 成功必须是数字 0，不能是字符串。

只支持准确的 `1000151 / com.stone.primitive.saga / xmwtwh5sqxssgp1`，不允许通配键或 Android 回退。官网只允许固定 HTTPS 主机 `safthwyk.antieh.com`、443、无用户名密码；客服最多十个完整 HTTPS URL，参照客户端参考文件校验，禁止游戏/支付域名和通配符。

## 3. 独立持久化与并发控制

参考 `internal/store/content.go` 的事务结构，可新增 `internal/store/website_display.go` 和新的 `migrations/<下一个可用编号>_ios_website_display.sql`。使用独立表（如 `ios_website_display_configs`），准确作用域唯一键，保存整组状态、URL、客服、revision 和更新时间。不要改旧 content_configs / ios 内容表的 mode 或 revision。

建议管理 PUT 参数如下；它是新增管理接口设计，iOS 不调用此接口：

```json
{
  "appId": "1000151",
  "packageName": "com.stone.primitive.saga",
  "channel": "xmwtwh5sqxssgp1",
  "websiteOnly": true,
  "websiteUrl": "https://safthwyk.antieh.com/",
  "supportUrls": [],
  "expectedRevision": 0
}
```

请求解析时使用指针或显式存在性检查，区分 `websiteOnly=false` 和缺失字段、`expectedRevision=0` 和缺失字段；不要把非法或缺失输入自动当 OFF。

事务内读取并锁定准确记录、比较 expectedRevision，成功后同时更新全部字段和 revision。不存在记录时视为固定初始 revision 0，第一次插入 revision 1；并发首次创建靠唯一键保护，输的一方返回 409，不能静默覆盖。已有记录 revision 不匹配同样返回 409。成功回读事务内最终值；持久化失败返回错误，不返回成功。

无记录时返回固定 `default-off.json` 内容，updatedAt 为空字符串；**数据库不可用不等于无记录**，必须返回 5xx，不能伪造 OFF。相同 revision 的返回内容必须稳定。恢复、重置和客服修改都递增 revision；不要提供物理删除配置的管理按钮，否则设备可能一直保留之前缓存的 ON。

## 4. 增加 handler，保持公共读取与管理写入分离

参考 `internal/httpapi/content.go` 的 JSON 输出和错误处理，可新增 `internal/httpapi/website_display.go`。

- 公共 GET：严格校验 query 身份；忽略版本对维护状态的影响；从独立 store 读取，返回完整配置。HTTP 200 + `Content-Type: application/json` + `Cache-Control: no-store`；禁止 302、登录页 HTML 或旧内容模式响应。
- 管理 GET/PUT：参考当前 `requireAdminSession`，核实当前 CSRF 防护是否实际存在，若缺失，为本次写入口补齐并测试，不能仅有 Cookie 登录就宣称已经防 CSRF。
- 管理 PUT：限制请求大小，拒绝错误类型、非法 URL、错误身份和旧 revision；写入真实配置后返回保存结果，记录操作人和变更审计，不能把敏感凭证写日志。
- 未知作用域返回明确 4xx，不返回目标 iOS 的 ON。不依赖 `versionCode`、IP、地区或审核身份决定结果。

## 5. 修改现有 iOS 管理页面

旧源码页面在 `internal/httpapi/admin_page.go`，静态路由映射在 `content.go`。Windows 如果已拆成模板/前端文件，直接在当前页面实现。

- 仅在 iOS 页面显示独立「维护期间显示内容」面板，不改变 Android 页和原内容模式表单。
- 两个状态清楚标识为「只显示网站」「不显示网站，恢复游戏」，默认从服务器读取，不用前端默认值覆盖服务器。
- 展示固定官网、客服链接列表、当前 revision 和更新时间。提交前保留旧显示状态；保存成功并回读后才更新成功提示。
- 提交当前 expectedRevision；409 提示「配置已被其他人修改，请刷新后重试」，保留用户输入，不自动重复提交覆盖新状态。
- 关闭开关仅恢复原有游戏路由，不能同时提交 BOTH / ONLINE_ONLY 或修改旧版本阈值。
- 开启说明写清楚「游戏暂停并隐藏，官网在 App 内显示；付款/账号操作与存档完成后生效，前台通常 30 秒内获取最新状态」。不要宣称所有设备瞬间切换。

## 6. 服务端验证与回传

新增 handler、store、管理页测试，使用当前项目真实测试数据库或隔离测试环境，不对生产执行 ON/OFF：

- 默认 OFF；完整 JSON 类型；无 token 公共 GET；公共写方法 405；未登录管理写入拒绝；CSRF 拒绝；URL/身份校验。
- OFF → ON → OFF、重启持久化、无记录与数据库故障区别、同 revision 响应稳定、并发第一次创建、并发更新和回滚。
- iOS 与 Android 隔离，原内容 mode/revision 不变，版本 query 不影响维护结果，支付和账号回归。
- 运行 `go test ./...`、`go vet ./...`，以及交接包内 Node 离线测试和公共接口检查。记下实际结果，不把样例测试当作后端完成证明。

完成后用模板生成 `Windows回执_iOS官网维护开关_20260922.md` 写回本共享包目录，提供测试环境 URL、最终管理路径、文件清单、迁移编号、测试结果、SVN 状态及部署状态。提交与生产部署仍遵循已有确认流程；没有部署就明确写未部署。Mac 收到可用环境后负责真机 ON/OFF 联调。
