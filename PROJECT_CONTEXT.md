# AIToolFame 本地复刻进度

更新：2026-09-30。参考站：https://aitoolfame.com/ 。用户已授权复制公开内容与图片。

## 当前交付与预览

- 分支：`replica/aitoolfame-local`，未提交、未推送、未部署、未替换线上域名。
- 原有未跟踪文件 `pnpm-workspace.yaml` 和 `scripts/count-sanity-docs.ts` 保留。
- 本轮本地生产预览已启动于 `http://localhost:3001`，公开 HTML 从 `shopapphub` 读取；Studio 位于 `/studio`。
- 本轮生产构建使用独立目录 `.next-validation`。PowerShell：

```powershell
$env:NEXT_BUILD_DIR='.next-validation'
pnpm exec next build --no-lint
pnpm start --port 3001
```

- 实现方式：已导入 Sanity 的清理后公开服务端 HTML + 本地 CSS、字体、图片 + 自行实现的渐进交互。Next.js 中间件将公开页面转到 `/replica` 渲染器；登录与受保护业务仍使用本项目代码。
- **公开页面 HTML 已接通 `shopapphub`；目录搜索/排序的索引及页面内静态图片路径仍依赖本地采集文件。** Studio 的 `replicaPage` 可编辑页面 HTML，未声称所有结构化业务数据都可通过 Studio 编辑。
- 快照禁止执行参考站脚本、跟踪器及外部表单。站外工具链接仍指向其公开官方网站。

## 页面与内容覆盖

已从 sitemap、站内链接和分页控件发现并保存 **590 个有效公开页面版本**；分页和 featured 筛选版本计入其中，并非 590 个不同工具。

| 类型 | 已保存版本数 | 覆盖 |
| --- | ---: | --- |
| 首页 | 1 | 品牌、导航、搜索、栏目、页脚 |
| 分类和目录 | 118 | 总目录、29 个分类、分页和发现的筛选版本 |
| 标签 | 145 | 标签目录、14 个标签、分页和发现的筛选版本 |
| 工具详情 | 316 | 文案、图片、分类、标签、相关工具、来源链接 |
| 博客 | 5 | 列表、SEO/Reviews 两个分类、两篇完整文章 |
| 合集 | 1 | 参考站为空列表，保留其空状态，没有编造详情 |
| 定价 | 1 | 参考站六种公开方案展示 |
| 关于、隐私、条款 | 3 | 完整公开正文 |

另外实现/调整了本项目登录、注册、重置密码界面；未登录 `/submit` 跳转本地登录。导航、页脚、浅/深/系统主题、移动菜单、搜索、筛选、排序、分页、博客分类切换、收藏登录入口及订阅交互均使用本地逻辑。

资源共 **455 个**：448 个图片/图标（含本轮补入的 2 张作者头像）、4 个字体、3 个 CSS。博客使用参考浏览器实际收到的 6 张 AVIF 图片；其余资源保持原采集结果。来源 URL、文件路径、SHA-256、采集时间和失败项见 `content/aitoolfame/manifest.json`；内容索引见 `items.json`、`cards.json` 和 `public/replica-index.json`。

2026-09-29 视觉复核：登录、注册、重置密码在 1440px、390px、768px 的 9 张截图与已保存的参考图逐像素比较均为 0 差异。博客列表、SEO/Reviews 分类和两篇文章补入了运行时作者头像；文章桌面侧栏补入真实正文标题生成的目录链接。博客截图的主要布局已对齐。

### 来源缺失及差异

- `https://aitoolfame.com/item/xing-du-miai` 返回包含 `NEXT_NOT_FOUND` 的页面，无工具正文。记录为 1 个采集失败；本地返回 404，不编造内容。
- 参考目录标题声称 317 个工具，保留原文；实际可获取完整详情为 316 个。
- 参考 `/search` 与 `/search?f=featured` 跳到登录，已单独记录；实际公开搜索使用 `/category?q=...`，本地另支持 `/search` 别名。
- 采集时间以 manifest 为准；访客图表等为快照统计，不连接对方实时统计服务。
- 登录后提交、支付及个人账户没有完成端到端验证。公开定价六种方案已复制，但本项目原有后台套餐/价格 ID 仍需按自己的 Stripe 产品配置映射。
- SEO 博客分类在 390px 下还有约 2.0% 的阈值像素差异，集中在图片区域。已核实参考和本地的 AVIF 文件 SHA-256 相同，图片框位置、尺寸和 `object-fit` 相同；没有证据表明是内容或布局缺失。其他少量文字渲染和弹出菜单样式差异仍待人工确认。移动定价页特意修复了参考站自身的轻微横向溢出。未声称逐页 100% 一致。
- 通过增加 Chrome 控制台 error 采集，发现旧生产构建的三个认证页面都把 `site.webmanifest` 指向开发端口 `localhost:3000`，在 `localhost:3001` 触发 CORS 与资源加载错误。已改为同源 `/site.webmanifest`，三页桌面、手机、平板复测 0 warning / 0 error。用户右下角 “3 warnings” 的原文尚未取得，不能证明它们逐项等同于此问题；已请求原文。参考站博客自身有一条 Sentry 初始化 warning，本地没有运行其脚本。构建日志仍提示 `caniuse-lite` / Browserslist 数据过旧；关闭旧生产服务器时 Node 输出 `util._extend` 弃用提示，这些工具提示不在网页右下角。

## Sanity 隔离与备份

- 原项目：`vnn8nbql`；原 dataset：`production`。没有写入或删除原 dataset。
- 新目标固定为 Public dataset `shopapphub`。2026-09-29 只读核实项目 `vnn8nbql` 中存在 `production` 和 `shopapphub`；迁移脚本不再创建 dataset，全部写入端点固定指向 `shopapphub`。
- `.env.local`（不进 Git）设置 `AITOOLFAME_REPLICA=true`、`NEXT_PUBLIC_SANITY_DATASET=shopapphub`、`REPLICA_CONTENT_SOURCE=sanity`、`REPLICA_LOCAL_BROWSER_BRIDGE=true`、`REPLICA_CMS_READY=false`，本地 APP/AUTH URL 指向 `localhost:3001`。最后一项继续阻止未配置的认证业务写入。
- 原先对创建 `aitoolfame-replica` 的 401 已不适用；用户已自行创建 `shopapphub`。现有 token 对新 dataset 的资源上传与文档写入已经由实际迁移验证，无需再申请 dataset 创建权限。
- 已备份 316 份原文档（包含 100 份资源文档），以及全部 100 个资源二进制文件。位置：`backups/vnn8nbql-production/`，已忽略 Git；`manifest.json` 保存文档导出和每个资源 SHA-256，`assetBackupComplete=true`。
- 本轮再次验证 316 份文档导出和全部 100 个资源文件的 SHA-256，一致且可读取；未执行恢复演练。
- 备份内容可能含原站私有业务信息，不应公开。没有执行恢复演练，也没有删除任何旧内容。
- 恢复材料是 `documents.ndjson` + `assets/` + 校验清单。恢复时先在独立恢复 dataset 上传二进制资源、保留/映射资源引用，再导入文档并核对数量；不要直接覆盖原 production。

### 可重复执行命令

```powershell
node scripts/replica-sanity-inspect.cjs
pnpm replica:prepare
pnpm replica:import
```

- `replica:crawl` 使用 GET 采集、缓存和确定性 URL 哈希文件名，随后规范化、补齐本地头像和文章目录；重跑不会重复资源文件。原始缓存位于被 Git 忽略的 `.replica-cache`。默认复用缓存，刷新某页需先移走对应缓存文件。
- `replica:prepare` 只读检查目标 dataset 与完整生产备份，不创建或写入任何 dataset。
- `replica:import` 先验证生产备份 SHA-256，再按 SHA-1 查询目标已有资源，跳过同内容图片；页面采用确定性 ID 与 `createOrReplace`。首轮上传 448 个资源（428 图片、20 图标/文件）并导入 590 个页面；第二轮新增上传 0、复用 448，页面仍为 590。两轮导入失败项均为 0；源站 `/item/xing-du-miai` 为 `NEXT_NOT_FOUND`，没有可迁入内容。
- 预览的公开 HTML 现从 `shopapphub` 的 `replicaPage.html` 读取，Studio 同样配置为 `shopapphub`，并有 “AIToolFame pages” 入口。本机 Node 直连 Sanity 超时，所以本地预览使用现有 Chrome 无头调试协议读取；部署环境不启用此桥接时使用常规 Sanity 客户端。本地 CSS/字体/图片路径仍由 `public/replica-assets/` 提供，Sanity 文档保留图片资产引用。
- 后续仍需配置自己的 Google/GitHub OAuth、Resend、Stripe 服务；未配置时不向参考站提交。

## 验证记录

- 2026-09-30 内容迁移复核：两次导入后 `shopapphub` 保持 590 个 `replicaPage`、428 个 `sanity.imageAsset`、20 个 `sanity.fileAsset`；第二次上传 0、复用 448、导入失败 0。备份 316 个原文档及 100 个原资源 SHA-256 均通过。唯一源站失败项 `/item/xing-du-miai` 返回 `NEXT_NOT_FOUND`。
- 新预览的首页、分类、标签、合集、Cursor 详情、博客、定价 7 条路径均为 200，响应 HTML 与 `shopapphub` 对应文档逐字相同；`/studio` 返回 200，Studio 配置及内容入口指向 `shopapphub`。迁移后只读核对原 `production` 仍为 316 份文档。尚未在已登录的 Studio 会话中人工打开文档列表。
- 新预览首页 1440px 与 390px 实际 Chrome 截图完成，0 破图、0 横向溢出、0 控制台错误；截图在系统临时目录 `aitoolfame-verification`。中间件 3001→3000 错误已修正为使用当前请求 Host。
- 本轮 `pnpm exec biome check .` 检查 370 个文件通过；`pnpm exec tsc --noEmit` 通过；`NEXT_BUILD_DIR=.next-validation` 的 `pnpm exec next build --no-lint` 通过、生成 32 个静态页面。完整 `pnpm build` 曾遇到本机 Node 24/V8 原生崩溃；Biome 已独立运行，因此跳过 Next 内置 lint worker。`pnpm typegen` 在 Sanity CLI 直连时超时，新增 `imageAssets` 字段尚未重新生成 `sanity.types.ts`，但 TypeScript 检查通过。
- `REPLICA_LOCAL_BROWSER_BRIDGE=true` 仅用于本机 Node 直连 Sanity 超时的预览环境；非本地部署应关闭它并使用常规 Sanity 客户端。Studio 真实交互仍需已登录的 Sanity 会话验证。
- Chrome 156 无头模式 + CDP pipe 实际访问参考站和本地站；没有安装 Playwright 或其他依赖。
- 590 个已保存页面版本本轮重新通过 HTTP、标题、图片文件存在性、无参考站脚本检查。结果：`content/aitoolfame/validation.json`。
- 19 个代表页面/流程，在 1440px、390px、768px 下各截图，共 57 组参考/本地视口对照；桌面和手机另保存全页图。没有将抽样视觉验证描述为对所有 590 页的逐像素验证。
- 最后一轮 57 个视口：0 横向溢出、0 破图、0 浏览器 warning、0 浏览器 error；认证页 9 个视口在 manifest 修复后重新截图，其余公开快照在该仅影响共享 `<head>` 的改动前复核。记录见 `content/aitoolfame/browser-validation.json`。
- 最终内容清单与生产构建更新后，又在 `localhost:3001` 对博客和登录页的 1440px / 390px 视口补拍；0 破图、0 控制台错误。博客文档的 `imagePaths` 已补齐封面、正文插图和头像。
- 图像比较结果：`content/aitoolfame/visual-comparison.json`。截图目录：`C:/Users/CHENFULAI/AppData/Local/Temp/aitoolfame-verification/`；包含 `reference-*.png`、`local-*.png`、报告和对照图。
- 已实测本地搜索、排序、标签过滤、深色主题、移动菜单、Escape 关闭、无效订阅返回 400；未向参考站发送表单，也未用真实邮箱测试发信。
- `pnpm exec biome check --write .` 通过。为满足全项目检查，整理了既有代码的格式和 import 顺序，因此 Git diff 包含较多格式改动；保留用户原有文件。后续只读检查使用 `pnpm exec biome check .`。
- `pnpm exec tsc --noEmit` 通过。
- 前一轮 `pnpm typegen` 曾通过（30 个 schema 类型、33 个查询类型）；本轮新增 `imageAssets` 后 CLI 直连超时，类型尚待重新生成，见上方本轮记录。
- `$env:NEXT_BUILD_DIR='.next-production'; pnpm build` 在本轮最终改动后通过，32 个静态页面生成完成；Windows 构建采用 2 个 worker 且关闭 webpackBuildWorker。仍有 Browserslist 数据过旧提示，没有为此安装依赖。

## 下一阶段

1. 人工预览和确认剩余视觉细节，按具体页面继续修正。
2. 在已登录的 Sanity Studio 检查页面编辑及发布后的前台刷新；按需把本地搜索索引和图片 URL 进一步结构化为 CMS 数据。`pnpm typegen` 需在 CLI 可联网时重新运行。
3. 配置自己的认证、邮件、套餐及支付测试环境，验证提交、收藏和支付完整业务。
4. 再逐步替换为自己的品牌与内容；线上发布须另行安排，本次未部署。

## 2026-09-30 蓝屏后复核与部署准备（以本节为最新状态）

- 原项目位于 `C:\Users\CHENFULAI\mkdirs`，分支仍为 `replica/aitoolfame-local`，保留全部未提交改动；当前聊天默认目录的 `ShopAppHub` 是另一空项目，本次没有改动它。未提交、推送或部署。
- `production` 保持原样。先前核验的备份为 316 份文档和 100 个资源，SHA-256 全部通过；`shopapphub` 已有 590 份 `replicaPage` 和 448 个 Sanity 资源，第二次导入新增 0 个资源、失败 0。
- 已通过 Sanity API 对 `shopapphub` 中 `/about` 文档的 `title` 执行临时编辑、读回、恢复原值、再读回（带修订号条件），证明现有凭据具有该 dataset 的保存权限。没有更改 `production`。当前会话没有可用的已登录 Studio 浏览器标签，因此 Studio 列表和编辑器的 UI 操作仍未人工验证；不能把 API 验证当成 Studio UI 验证。
- 本机 `.env.local` 当前为 `NEXT_PUBLIC_SANITY_DATASET=shopapphub`、`REPLICA_CONTENT_SOURCE=bundled`、`REPLICA_CMS_READY=false`，已移除 `REPLICA_LOCAL_BROWSER_BRIDGE`。部署时必须显式配置目标 dataset；若采用快照模式，设置 `REPLICA_CONTENT_SOURCE=bundled`。尚未配置发布环境变量。
- 运行时数据来源：页面 HTML 与路由清单来自随应用部署的 `content/aitoolfame/pages/` 和 `manifest.json`（Sanity 模式下 HTML 改从 `shopapphub` 的 `replicaPage.html` 读取）；搜索、分类、筛选和排序依赖随应用部署的 `manifest.json`、`cards.json`、`public/replica-index.json`；CSS、字体、图片来自 `public/replica-assets/`，交互脚本来自 `public/replica-client.js` 和 `public/replica-theme.js`。不再需要本机 Chrome 会话或调试端口。Sanity 模式下搜索索引与图片仍是部署快照，Studio 改动不会自动同步它们，需要重采集、重建索引及发布流程。
- `.next-validation/server/app/replica/route.js.nft.json` 已确认追踪到 1202 个 `content/aitoolfame` 文件；`public` 资源随 Next 应用提供。`pnpm replica:deployment-check` 在 `NEXT_BUILD_DIR=.next-validation` 的生产预览 `localhost:3001` 上通过：590 页面文件、455 资源及 SHA-256、316 排序卡片齐全；首页、分类、标签、合集、Cursor 详情、博客、定价 7 条路由均 200 且 HTML 与打包文件逐字一致；搜索返回 2 张含 Cursor 的卡片，升降序首卡不同，首页图片和客户端索引 HTTP 正常。此检查仅为普通 HTTP/文件校验，不替代逐页浏览器视觉与交互测试。
- `pnpm typegen` 改用本地 schema 离线提取后调用 `sanity typegen generate`，实跑成功：30 个 schema 类型、33 个 GROQ 查询类型；`sanity.types.ts` 已包含当前 `replicaPage.imageAssets` 字段。修复了 CLI 提取阶段的直连超时，无需联网提取。
- 蓝屏恢复后 Node `v24.21.0` 下 `pnpm exec biome check .`（373 文件）、`pnpm exec tsc --noEmit` 和完整 `pnpm build` 均通过，构建生成 32 个静态页面。此前 Node/V8 原生崩溃未能在本次复现，根因仍未知；当前已验证命令为 PowerShell 中 `$env:NEXT_BUILD_DIR='.next-validation'; pnpm build`，本次不再需要 `--no-lint`。构建保留 `cpus:2`、`webpackBuildWorker:false` 配置。部署 Node 建议先固定已实测的 `24.21.0`，其他版本尚未验证。
- 本地 `.env.local` 中未见 `AUTH_SECRET`、Google/GitHub OAuth、Resend、Stripe 的密钥和价格 ID（也可能由其他环境来源注入，不能仅据此判断最终部署环境）。`REPLICA_CMS_READY=false` 仍阻止未准备好的认证业务写入。注册、找回密码、邮件列表发送、提交、支付与 webhook 的真实服务端到端流程均未验证。需配置自己的 OAuth 回调、发信域名与密钥、Stripe 测试产品/价格/Webhook 及站点 URL 后，在独立测试环境完成验证。
- 当前已具备部署条件的是公开内容的静态快照读取、页面路由、资源、搜索和排序的代码与本地生产预览；真实 CMS 即时更新、Studio UI、认证、邮件和支付仍需上述配置和验证。保留旧线上站，未部署。
- 最终复核：第二次完整 `pnpm build` 在 Node `v24.21.0` 下再次成功（32 个静态页面），随后 `pnpm exec biome check .` 检查 373 文件无修复、`pnpm exec tsc --noEmit` 通过；重新启动 `localhost:3001` 后 `pnpm replica:deployment-check` 再次 0 问题。预览保持运行。
- 合并读取 `.env` 与 `.env.local` 的变量存在性（未输出密钥）：Sanity project ID、dataset、API token、`AUTH_SECRET`、本地 URL 均已设置；Google/GitHub OAuth、Resend、Stripe 密钥与价格 ID 当前为空。`/api/replica-services` 实测 HTTP 200，返回 `google:false`、`github:false`。上方关于 `.env.local` 的叙述仅指该文件单独的键，不代表合并环境缺少 `AUTH_SECRET`。

## 2026-09-30 上线准备与回滚候选（以本节为最新状态）

- 用户确认的唯一目标：Vercel 团队 `Andy Life Style`、项目 `mkdirs`，后台 `https://vercel.com/andy-life-style/mkdirs`；正式域名 `https://shopapphub.com` 和 `https://www.shopapphub.com`。用户提供的上一版部署详情 `https://vercel.com/andy-life-style/mkdirs/5ykA912B81ZUxQmPWQNS9ZemVFft`，访问地址 `https://mkdirs-a8a80gyo3-andy-life-style.vercel.app`。**这些是待平台确认的回滚候选，不等同于已核实的生产部署 ID。** 本地只读访问两个正式域名均返回 200、标题 `Directory`；部署独立地址要求 Vercel 登录。
- 本机 Git 远端为 `https://github.com/Andy-life-style/mkdirs.git`，只读 `ls-remote` 结果显示 `origin/main` 为 `f56e8842aa132be5acc908c32b915f313ba739b6`。用户提供的截图文字写 `156e884`，与远端不一致，可能是识别误差；需以 Vercel 后台实际生产部署的 Git SHA 为准。
- Vercel 连接器 `vercel_list_teams` 返回空列表，访问 `andy-life-style` 团队的项目和部署接口返回 403：`Not authorized: Trying to access resource under scope "andy-life-style". You must re-authenticate to this scope or use a token with access to this scope.` 因此尚未核实项目 Git 关联、生产分支、环境变量与线上部署 ID，也未发起预览或正式部署。需要将当前 Vercel 连接重新认证到有 `Andy Life Style` 团队 `mkdirs` 项目权限的账号/令牌。不可创建同名新项目或猜测目标。
- 上线范围为公开浏览。公开 HTML 运行时继续可从 `shopapphub` 的 `replicaPage` 读取，路径、搜索、筛选、排序用随应用发布的 manifest/cards/index，图片、CSS、字体在 `public/`；不依赖本机 Chrome 或临时目录。生产/预览环境必须配置 `NEXT_PUBLIC_SANITY_PROJECT_ID=vnn8nbql`、`NEXT_PUBLIC_SANITY_DATASET=shopapphub`、`REPLICA_CONTENT_SOURCE=sanity`、正确的 `NEXT_PUBLIC_APP_URL`，且不得配置成旧 `production` dataset。平台环境变量尚未获准读取，所以正式部署停在此检查前。
- 未验证的认证、提交、订阅和支付入口在复刻页面隐藏或标为暂不可用；相应直接页面、邮件/认证 API、newsletter API、Stripe checkout 和 webhook 在业务开关关闭时返回 503，不会出现假成功或发起收费。只有同时显式设置 `REPLICA_CMS_READY=true` 与 `REPLICA_BUSINESS_ENABLED=true` 才会开放；本次上线不得设置。预览页 robots/noindex，Vercel production 才允许索引。
- 最新本地 `pnpm exec biome check .`、`pnpm exec tsc --noEmit`、完整 `pnpm build` 均通过；生产预览 `pnpm replica:deployment-check` 0 问题，首页 1440px/390px Chrome 无头截图为 200、0 横向溢出、0 破图、0 console error。本地浏览器检查不是独立 Vercel 预览或正式域名验证。
