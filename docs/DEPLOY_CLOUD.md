# 5 分钟免费部署指南：Cloudflare Pages（KV / R2）+ 腾讯云 EdgeOne Pages 国内直连

本项目内置了完整的 **方案 A（边缘静态站点 + Cloudflare Pages Functions + KV/R2 短链存储 + 腾讯云 EdgeOne Pages 国内加速代理）**。
部署完成后，创作者只需打开 `/create` 在线上传照片、编辑祝福并点击「生成专属分享链接」，即可产出全球秒开的短链接 `/c/xxxx` 与可扫码白色海报，支持 4 位生日口令解锁与 180 天自动过期，且**完全落入免费额度内，无需任何服务器费用**。

> 本地运行 `npm run dev` 或纯静态托管（如 GitHub Pages）时，若未绑定 Cloudflare KV，系统会自动启用「本地浏览器分享模式（`local-*` 短链）」，无需任何后端配置即可完整体验制作、口令解锁与分享全流程。

---

## 一、架构一览（支持零信用卡 KV-Only 与 R2+KV 自动升级）

- **前端静态资源（`dist/`）**：由 Cloudflare Pages 或腾讯云 EdgeOne Pages 托管，支持 SPA 路由（`/`、`/create`、`/c/:shortId`）。
- **无服务器 API（`functions/api/cards/[[path]].ts`）**：
  - `GET /api/cards/health`：探测云端存储状态，只要绑定了 `CARD_META`（KV）即返回 `{"ok":true,"storage":"kv"}` 或 `{"ok":true,"storage":"r2+kv"}`；
  - `POST /api/cards`：校验最多 30 张照片与 6MB 体积上限，自动把前端压缩好的 WebP 照片拆分存储——**已绑定 `CARD_ASSETS`（R2）时写入 R2，未绑定 R2 时无缝写入 `CARD_META`（KV，零信用卡可用）**，并对可选 4 位生日口令与 `editToken` 做加盐 SHA-256 哈希，有效期 180 天；
  - `GET /api/cards/:shortId`：读取贺卡配置，若开启口令保护则通过 `X-Card-Passcode` 校验后才返回照片与文字；
  - `GET /api/cards/:shortId/assets/:key`：从 R2 或 KV 流式返回二进制照片并附带一年强缓存头（`immutable`）；
  - `PUT / DELETE /api/cards/:shortId`：凭 `X-Edit-Token` 更新或彻底清除元数据与所有关联照片。
- **隐私保护**：`public/robots.txt` 已禁止搜索引擎抓取 `/c/` 路径，API 响应同时附带 `X-Robots-Tag: noindex, nofollow`。

---

## 二、5 分钟部署 Cloudflare Pages 后端（零信用卡 KV-Only 即开即用）

### 第 1 步：Fork 或推送代码到 GitHub

Fork [https://github.com/St3venZ/starlight-birthday-card](https://github.com/St3venZ/starlight-birthday-card) 或将本项目推送到你的 GitHub 仓库（公开或私有均可）。

### 第 2 步：在 Cloudflare 创建 KV 命名空间（可选再建 R2）

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)；
2. 左侧进入 **Workers & Pages -> KV -> Create a namespace**，名称填 `CARD_META`，点击创建（**完全免费且无需绑定信用卡**）；
3. *（可选大容量进阶）* 如果你已开通 Cloudflare R2，可在 **R2 Object Storage -> Create bucket** 创建 `starlight-card-assets`，后端会自动优先使用 R2 存图。

### 第 3 步：连接仓库创建 Cloudflare Pages 项目

1. 进入 **Workers & Pages -> Create -> Pages -> Connect to Git**，选择你的仓库；
2. 构建设置如下：
   - **Framework preset**：`Vite`
   - **Build command**：`npm run build`
   - **Build output directory**：`dist`
   - **Environment variables**：新增 `NODE_VERSION` = `22`
3. 点击 **Save and Deploy** 完成首次构建。

### 第 4 步：绑定 `CARD_META`（KV）

1. 打开刚刚创建的 Pages 项目 -> **Settings -> Bindings**（旧版在 **Functions** 选项卡）；
2. 添加 **KV namespace binding**：
   - Variable name：`CARD_META`
   - KV namespace：`CARD_META`
3. *（若第 2 步开通了 R2，可选添加）* **R2 bucket binding**：Variable name 填 `CARD_ASSETS`，R2 bucket 选 `starlight-card-assets`；
4. 回到 **Deployments** 页面点击 **Retry deployment** 让绑定生效。

### 第 5 步：验证上线

访问 `https://你的域名.pages.dev/api/cards/health`，看到 `{"ok":true,"service":"starlight-cards","mode":"cloud","storage":"kv"}`（或 `"r2+kv"`）即表示云端短链存储已就绪！

---

## 三、国内免 VPN 秒连：腾讯云 EdgeOne Pages 一键关联 + Cloudflare KV/R2 零成本组合

如果你希望国内微信 / 手机浏览器秒开贺卡、完全无需 VPN，可直接将同一个 GitHub 仓库同步关联到 **腾讯云 EdgeOne Pages**！项目已内置边缘代理函数 [edge-functions/api/cards/[[default]].js](../edge-functions/api/cards/%5B%5Bdefault%5D%5D.js)，部署即自动激活：

1. **导入仓库**：登录腾讯云 **EdgeOne Pages** 控制台，选择导入 GitHub 仓库 `https://github.com/St3venZ/starlight-birthday-card`（或你的 Fork），构建命令填 `npm run build`、输出目录填 `dist`；EdgeOne 会自动识别 `edge-functions/api/cards/[[default]].js` 边缘函数；
2. **配置上游环境变量（已预设默认值，开箱免填）**：项目已默认将上游指向预部署好的云端接口 `https://starlight-cards-api.st3venz-cards.workers.dev`；如果你自行部署了新的 Cloudflare Pages / Worker 地址，可在 EdgeOne Pages 项目设置 -> **环境变量** 中新增：
   - `UPSTREAM_API_ORIGIN` = `https://你的云端接口域名`（不要带末尾 `/`）
3. **保存部署并直接使用 EdgeOne 域名分享**：
   - EdgeOne 节点会把 `/api/cards/*` 请求在服务端直接透传至 Cloudflare KV/R2，并自动把生成的分享短链域名替换为你的 EdgeOne 域名；
   - 国内微信扫码或点击短链全程仅访问 EdgeOne 国内加速节点，**零 VPN、零浏览器跨域报错、照片与 3D 场景秒开**！

---

## 四、命令行 Wrangler 本地联调（可选）

```bash
# 1. 登录 Cloudflare（仅需一次）
npx wrangler login

# 2. 创建 KV 命名空间并把返回 id 填入 wrangler.toml
npx wrangler kv namespace create CARD_META

# 3. 构建并用 Wrangler Pages 本地模拟 Functions + KV
npm run build
npx wrangler pages dev dist
```

---

## 五、自建后端或 S3 / 阿里云 OSS 对接说明

如果希望对接自己的对象存储（AWS S3、阿里云 OSS、腾讯云 COS 或自建 Node/Go 服务）：

1. 在构建环境中设置 `VITE_API_BASE=https://api.your-domain.com/api/cards`；
2. 服务端只需实现与 [functions/api/cards/[[path]].ts](../functions/api/cards/%5B%5Bpath%5D%5D.ts) 相同的 JSON 接口契约（`GET /health`、`POST /`、`GET /:shortId`、`PUT /:shortId`、`DELETE /:shortId`），前端 `CardShareClient` 无需任何改动。
