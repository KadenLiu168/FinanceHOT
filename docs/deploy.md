# 部署

## 用 Docker（推荐）

需要一台装了 Docker（带 Compose）的机器。云服务器建议至少 2 核、4 GB 内存，构建镜像时要用到。

```bash
git clone https://github.com/KKKKhazix/AIHOT.git myhot
cd myhot
node scripts/init-env.ts --llm-key <你的模型 API Key>
```

`init-env.ts` 会生成 `.env`，填好随机密钥和管理员密码，并把密码打印一次。机器上没有 Node 的话，把 `.env.example` 复制成 `.env`，自己填 `ADMIN_PASSWORD`（至少 12 位）、`SESSION_SECRET`、`IMG_PROXY_SIGN_SECRET`、`POSTGRES_PASSWORD`（各用 `openssl rand -hex 32` 生成）和 `LLM_API_KEY`。

启动前检查 `.env` 的 `SITE_URL`：本机试用保留 `http://localhost:3000`；部署到服务器时改成读者实际访问的地址。例如通过服务器 IP 访问时（把示例 IP 换成自己的）：

```dotenv
SITE_URL=http://192.0.2.10:3000
```

RSS、分享链接、站点地图和 Agent Markdown 中的绝对链接都使用这个值，不会随浏览器访问的地址自动改变。使用域名和 HTTPS 时按下方「配域名和 HTTPS」设置。

配置完成后启动：

```bash
docker compose up -d --build
```

启动后打开 `http://服务器地址:3000`，后台在 `/admin`，用管理员密码登录。第一次启动会导入示范信源，一两分钟后开始出现内容；第一次导入的一百多条资料大约半小时处理完（每条都要预筛、评分、结构化、写标题摘要，再归组）。

`docker compose` 会起五个容器：`db`（PostgreSQL 17）、`setup`（每次启动先跑数据库迁移和种子数据，然后退出）、`api`、`worker`（抓取、模型处理、定时任务）、`web`（网页）。

### OpenCode Go：DeepSeek V4.1 Flash

当前支持 Go 套餐的文本模型 `deepseek-v4.1-flash`，通过现有 Chat Completions 流程调用：

```dotenv
LLM_PROVIDER=opencode-go
LLM_BASE_URL=https://opencode.ai/zen/go/v1
LLM_API_KEY=<OpenCode Go API Key>
LLM_MODEL=deepseek-v4.1-flash
LLM_EXTRA_JSON={"thinking":{"type":"disabled"}}
LLM_JSON_MODE=false
LLM_VISION=false
```

模型 ID 使用 `deepseek-v4.1-flash`，不要加 `opencode-go/` 前缀。JSON mode 关闭时，输出仍经过 JSON 提取及 schema 校验；标题摘要的文本解析保持原有流程。`thinking` 参数采用 DeepSeek 官方的关闭思考写法，是否被 Go 网关接受，以实际验证为准，不会自动去掉参数重试。额外参数必须是 JSON 对象，不能覆盖 `model`、`messages`、`max_tokens`、`max_completion_tokens`、`response_format` 或 `stream`。不支持图片输入，`LLM_VISION` 必须关闭。

只替换默认模型时，已有后台或环境变量的模型选择仍然优先。如需所有步骤使用 Go，清除 `PREFILTER_MODEL`、`SCORE_MODEL`、`UNDERSTAND_MODEL`、`SUMMARIZE_MODEL`、`STRUCTURE_MODEL`、`GROUP_MODEL`、`GROUP_REVIEW_MODEL`、`DIGEST_MODEL`、`REPORT_MODEL`、`TRANSLATE_MODEL`、`MONITOR_MODEL` 的环境变量覆盖；在后台“模型与评测”将对应能力选择为 `default`。保留切换审计和既有内容，不直接删除 settings。

请求发送真实的 `FinanceHOT/1.0` 客户端标识和任务级 `x-opencode-session`。同一文章 revision 的分析与翻译分段共用会话；归组初判和复核也共用任务会话。重启不会随机改变 ID，不同站点与任务隔离。Go 调用继续使用后台的 `llm` 预算熔断；这里的预算是请求次数限制，不代表套餐剩余 token 或余额。模型阀门关闭时不发送请求。

上线前先部署代码并保持 `MODEL_CALLS_ENABLED=false`。真实验证需独立的空白测试库（名字以 `_test` 或 `_ci` 结尾，账号有建库权限），不要使用生产数据库。下面命令使用 `.env` 中的 Go 凭据，环境变量显式覆盖数据库及安全阀；验证会产生两次付费请求并保存测试回执，不启动 worker、采集或内容发布：

```bash
createdb financehot_opencode_test
DATABASE_URL=postgres://127.0.0.1:5432/financehot_opencode_test \
  node --env-file=.env scripts/migrate.ts
DATABASE_URL=postgres://127.0.0.1:5432/financehot_opencode_test \
  COLLECT_ENABLED=false MODEL_CALLS_ENABLED=true \
  FEISHU_CONTENT_PUSH_ENABLED=false FEISHU_INTERNAL_ENABLED=false INDEXNOW_SUBMIT_ENABLED=false \
  node --env-file=.env scripts/verify-opencode-go.ts
```

验证要求结构化 JSON、标题摘要文本、token usage、原始回执和会话标识均有效，成功输出 `status: PASS`，失败返回非零退出码。只有真实验证通过后才启用生产模型调用，重新创建 API 和 worker 加载配置：

```bash
docker compose up -d --build api worker
```

切换不会自动重判旧内容。Go 回执绑定网关、实际请求配置及任务会话；与旧模型回执隔离。回滚时恢复原有 `LLM_*` 配置，移除 `LLM_PROVIDER` 或设为 `openai-compatible`，并重新创建 API 和 worker；不删除回执、内容或预算记录，无需数据库迁移。

OpenCode Go 官方面向典型 coding-agent 流量，FinanceHOT 的评分、摘要、翻译等用途是否被服务方接受，尚未确认。协议适配及本地测试不等于生产用途获准；真实调用应在用途获准后进行。详见 [Go 使用范围与接口](https://opencode.ai/docs/go/) 和 [DeepSeek thinking 参数](https://api-docs.deepseek.com/guides/thinking_mode/)。

### 在中国大陆的服务器上

- 构建时 npm 走国内镜像：`docker compose build --build-arg NPM_REGISTRY=https://registry.npmmirror.com`，然后 `docker compose up -d`。
- 拉取 Docker 镜像慢，先给 Docker 配置镜像加速。
- 海外信源抓不到时，在 `.env` 里设置 `EGRESS_PROXY_URL`：抓信源、图片和模型榜数据时走这个代理，调用模型接口不走。
- 对外提供网站服务需要先完成 ICP 备案，备案号填在 `industry/site.ts` 的 `icp`。

### 配域名和 HTTPS

先把域名解析到服务器，然后在 `.env` 里设置：

```bash
SITE_URL=https://example.com
SITE_DOMAIN=example.com
PORT=127.0.0.1:3000        # 3000 端口只给本机的 Caddy 用，不直接对外
TRUST_PROXY=true           # 访客地址从 Caddy 转来的请求头里读
```

再用带 HTTPS 的方式启动，Caddy 会自动申请和续期证书：

```bash
docker compose --profile https up -d --build
```

已经有 Nginx 的话，不用 Caddy，把站点反向代理到 `http://127.0.0.1:3000`，带上 `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`，并在 `.env` 里设 `TRUST_PROXY=true`。`SITE_URL` 一定要写成读者实际访问的地址：生成的链接、RSS、分享图和 MCP 都用它。

MCP 默认接受 `SITE_URL` 的主机以及 `localhost`、`127.0.0.1`、`[::1]`。额外主机用 `MCP_ALLOWED_HOSTS` 配置，以逗号分隔，例如 `extra.example:8443,[2001:db8::1]`。主机名不区分大小写，IPv6 必须加方括号；可带 0–65535 的十进制端口，匹配时忽略端口。包含路径、用户信息或非法端口的配置不会生效。`127.1` 等别名需要明确列入；此配置只影响 Host 校验，不扩大浏览器 Origin 许可。

### 更新

先按下节备份数据库。构建完成后停止旧服务，再运行迁移和新版服务：

```bash
git pull
docker compose build
docker compose stop api worker web
docker compose run --rm setup && docker compose up -d
```

迁移成功后再启动服务；迁移失败时先查看错误，不要继续启动。使用 HTTPS 配置的站点继续保留 `--profile https`。旧的 API 和 worker 要在迁移前停下：迁移可能删表删列，旧代码还在跑会出错；正常关闭 worker 会等进行中的付费调用收尾（最长三分多钟）。非 Docker 部署也按“备份、构建、停止 API/worker/web、迁移（`scripts/migrate.ts`）、种子数据（`scripts/seed.ts`）、启动”的顺序更新。

#### 升级到公开接口 3.0.0

- **安全阀默认关**：`COLLECT_ENABLED`、`MODEL_CALLS_ENABLED` 只有写成 `true` 才打开，没写就是关。用 `scripts/init-env.ts` 生成的 `.env` 已经有这两行；自己写的 `.env` 没有的话要补上，否则升级后不再采集、不再调用模型。
- **周报月报接口换了形状**：`/api/v1/weeklies`、`/api/v1/monthlies` 的列表和每一期都带 `periodStart`、`periodEnd`，正文改成 `sections[]`（每栏 `label`、`summary`、`items`），不再有 `title`、`themes`，列表的 `limit` 最多 60。读这两个接口的程序要跟着改；MCP 和 `/openapi-v1.json` 的版本号随之升到 3.0.0。
- **精选的机器出口每条新闻一条**：API 的 `mode=selected`、同步接口和精选 RSS 里，同一条新闻只留代表报道，其他报道以 `remove` 出现在同步的变更里（`mode=all` 里还在）。升级前已经入选的旧报道不会被重新整理，等这条新闻再有报道发布时才归并。
- **精选要等去重确认**：分数够了的资料，要等归组确认它不是精选里已有新闻的重复、带来了新信息，才进精选；确认之前只在“全部动态”。归组用的模型回答不合格式时会停在那里，后台“运行”页能看到。
- **一手只看分级**：`T1` 就是一手，`first_party` 不再单独设置；以前单独标成一手的 `T1_5`、`T2` 信源不再算一手，要算就改成 `T1`。
- **行业包多了几项**：`taxonomy.ts` 新增 `RELEASE`、`PLAIN_TERMS`，评论类的类别标 `commentary: true`，`ENTITIES` 可以写 `otherNames`，`CATEGORY_BY_ITEM_TYPE` 不再使用；新增 `chronicle.ts`（主题页大事记的规则，默认按 AI 行业写），`topics.json` 也多了几个可选字段。已经换成别的行业的站，合并时对照 [把它改成你的行业](customize.md) 补上。
- **主题只读 `industry/topics.json`**：迁移会删掉数据库里的 `topics` 表。只改过数据库、没改文件的主题，升级前先写进文件。公司主题只看 `entityId`，`related` 不再使用。
- **日报不再调用模型**：日报按规则编排，周报月报从日报汇编，模型只写总述和栏目导读；已经出过的各期不重写。
- **提示词有改动**：`industry/prompts/` 里的 `structure.md`、`group-*.md`、`story-digest.md`、`report-period.md` 换成了新的写法，`report-daily-lead.md` 删掉了，新加了 `report-period-sections.md`。改过这些提示词的，对照着把自己的改动搬过去。
- **模型榜方法 v17**：每项评测的参照尺度第一次算出后就冻结，以后不再变。升级时 `setup` 先从模型名录导入冻结好的尺度（只补本站还没有的），所以要先跑 `scripts/seed.ts` 再启动 worker，Docker 的 `setup` 已经这样做。位次和分数与旧版不同；Artificial Analysis 只作交叉参考。
- **删掉的脚本**：`scripts/delete-sources.ts`、`scripts/regroup-events.ts`、`scripts/enqueue-analysis.ts`。不要的信源在后台暂停；单篇的重新评估、重新归组在后台内容页。
- **`/agent` 默认打开 Agent Markdown**，MCP 的接入说明在 `/agent?tab=mcp`。
- **飞书内容群只推 `T1`、`T1_5` 信源的精选。**

### 管理员会话与配置变更

会话绑定迁移排在 `0041`。此前已试用会话绑定迁移的数据库可直接升级，已有列和绑定会被保留，无需手动修改迁移记录。

会话绑定登录方式、登录时的管理员凭据或飞书身份。升级到会话绑定版本后，未绑定的旧会话需要重新登录。修改管理员密码、飞书管理员名单或会话密钥后，应重启所有 API 进程，使它们加载相同的新配置；只编辑配置文件不代表正在运行的进程已生效，混用旧代码或旧配置的进程不能提供统一撤权。

有效配置改变后，密码会话不再接受旧密码的授权，飞书会话按登录时实际取得的 union ID 或邮箱检查当前名单（两者任一仍获授权即可）。停用飞书登录应用或更换应用 ID 会使飞书会话失效；只轮换同一应用的 secret 不会使仍获授权的飞书会话退出。轮换或移除 SESSION_SECRET 会使两种会话都失效。

鉴权时确认失效的会话会被删除，恢复旧配置也不会让它复活。系统不记录全局凭据变更历史：某次配置变化若从未被进程加载，或在恢复前从未被会话检查观察到，不能据此追溯撤销会话。

### 备份

在 `.env` 里配置 `DB_BACKUP_STORE_*`（任何 S3 兼容的对象存储），每天 04:10 自动备份到那里。一次完整备份包含同一时间戳的数据库 `.dump` 和文件 `aihot-files-*.tar.gz`：文件包保留 `uploads/` 以及仍存本地的 `feedback-screenshots/`，不包含图片缓存或本地备份目录。已经转发到飞书的图片只保留数据库中的外部引用，文件包不保存飞书上的图片。

恢复时同时取回这一对文件：使用与数据库版本兼容的 `pg_restore` 将 `.dump` 恢复到空数据库，再把文件包解压到数据目录根目录（Docker 中为 `/data`，非 Docker 使用 `AIHOT_DATA_DIR`，默认 `.data`），保留包内的子目录结构，并确保运行进程可读取这些文件。只恢复数据库不能找回仍由 `local:` 引用的反馈截图；旧备份中没有包含的文件也无法凭数据库引用恢复。

下面的手动导出只包含数据库，不包含上述附件目录：

```bash
docker compose exec -T db pg_dump -U aihot aihot | gzip > myhot-$(date +%F).sql.gz
```

数据都在三个 Docker 卷里：`db`（数据库）、`data`（上传的图片、图片缓存、本地备份）、`caddy`（证书）。`docker compose down` 不会删除它们；`docker compose down -v` 会。

### 看日志

```bash
docker compose logs -f --tail 100 api worker web
```

后台的“运行”页能看到每个定时任务最近的结果，“信源”页能看到每个信源的抓取状况。

## 花多少钱

- **模型**：每条新资料先预筛一次；过了预筛的再评两次分、做一次结构化、写一次标题摘要，然后归组（有相近的报道时才调用），另外还有事件综述、周报月报的总述和精选的全文翻译。日报按规则编排，不调用模型。我们用示范信源在本地试跑，第一次导入的 152 条资料一共用了大约 930 次模型调用。之后每天用多少，取决于你的信源每天更新多少条。后台“模型与评测”页能看到每一步的调用次数和输入输出 token 数。
- **付费采集**（X、公众号、Jina）：按请求计费，默认不启用，填了 key 才会用。
- 所有付费服务都有每分钟、每小时、每天的调用上限（后台“设置 → 付费请求上限”），超过就暂停，不会一夜之间刷爆账单。填 0 表示立即停用这个服务。

## 不用 Docker

需要 Node.js 24.11 以上和 PostgreSQL 16 或 17。

```bash
npm ci
node scripts/init-env.ts --llm-key <你的模型 API Key>
createdb myhot
```

在 `.env` 里加上：

```bash
DATABASE_URL=postgres://你的用户名@127.0.0.1:5432/myhot
API_BASE_URL=http://127.0.0.1:3001
```

然后：

```bash
node --env-file=.env scripts/migrate.ts
node --env-file=.env scripts/seed.ts
npm run build -w @aihot/web

node --env-file=.env apps/api/src/main.ts          # 接口，3001 端口
node --env-file=.env apps/worker/src/main.ts       # 后台任务
cd apps/web && NODE_ENV=production node --env-file=../../.env server.ts   # 网页，3000 端口
```

三个进程要一直运行，生产环境用 systemd 或 pm2 守护。停止 worker 时至少给它 210 秒（systemd 的 `TimeoutStopSec`、pm2 的 `kill_timeout`），让进行中的付费调用收尾；被提前杀掉的调用结果不明，要等至少半小时自动放行后才会重试。

开发时用带热更新的方式：`npm run dev:api`、`npm run dev:worker`、`npm run dev:web`。开发时想免登录进后台，在 `.env` 里设 `DEV_AUTH_ROLE=admin`（生产环境会拒绝启动）。
