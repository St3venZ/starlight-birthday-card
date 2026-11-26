# Starlight 3D Birthday Card — 开源 3D 交互式生日贺卡与在线制作工坊

一份开源、纯白棉纸质感、开箱即用的沉浸式 **3D 交互式生日贺卡**，现已内置 **可视化实时制作工坊（`/create`）** 与 **一键短链 / 白色二维码海报分享架构（`/c/:shortId`）**。
基于 **Three.js + TypeScript + Vite + Web Audio API + Cloudflare Pages Functions** 打造，无需写代码也能在浏览器里直接上传照片、拖动排序、随机微调年龄点阵排布、设置 4 位生日口令并分享给寿星。

- 开源仓库：[https://github.com/St3venZ/starlight-birthday-card](https://github.com/St3venZ/starlight-birthday-card)
- 作者主页：[https://github.com/St3venZ](https://github.com/St3venZ)

---

## 核心体验一览

### 一、五幕 3D 沉浸式收信体验

1. **第一幕：星尘汇聚与半开纯白贺卡**
   轻盈星尘缓缓凝聚，纯白棉纸对折贺卡以微开悬念姿态浮现，暖光从书缝柔和溢出。采用着色器预编译与空闲分帧纹理水合，入场丝滑 60FPS 零掉帧。
2. **第二幕：展开贺卡与开场寄语**
   轻触金色圆贴拆封，纯白贺卡舒展打开，折痕中央升起极简白金小蛋糕与摇曳烛火，同时浮现开场序言。
3. **第三幕：任意数量照片的 3D 年龄点阵与模板说明**
   支持上传 **1 ~ 30 张任意数量照片**，自动切换紧凑 / 标准 / 丰盈 3 档清晰数字点阵并采用受控随机防聚集排布（绝不丢弃任何照片）。放大照片时按所选**创作者模板**直接呈现正面文字说明（`caption`），翻面 180° 阅读纯白卡纸背面的手写留言（`message`）。
4. **第四幕：纯白信纸最终祝福**
   浏览完回忆后呈现温润白纸祝福长信，与背景中打开的 3D 白卡自然呼应。
5. **第五幕：丝滑合上贺卡与全屏 3D 烟花**
   点击「合上贺卡」，蛋糕先优雅收起再平滑折合白卡（零穿模），随后夜空自动绽放多层 3D 烟花，轻触夜空任意处皆可点亮专属烟花。

### 二、内置在线制作工坊（`/create`）

点击首页左上角「制作我的贺卡」或直接访问 `/create`，进入**实时分屏工作台**（桌面左编辑右 3D 实时预览，手机上预览下编辑）：

- **第 1 步 封面与开场**：填写寿星昵称、年龄（`10~100` 岁实时预览点位数）、日期与序言（按回车即自动分段，并同步印在展开白卡的右侧内页上），内置 3 套自然人情味模板（给挚友 / 给恋人 / 给家人）。
- **第 2 步 照片墙与说明**：支持拖拽批量上传照片（前端自动按 EXIF 旋转并压缩为轻巧 WebP）、**直接拖拽调整照片顺序**、**交互式年龄点阵小地图**、密度切换（`自动 / 紧凑 / 标准 / 丰盈`）、**「随机换排布」**、**锁定心仪照片位置**、4 套照片说明模板与**批量导入文字**（支持 JSON / 竖线分隔 / 空行分段）。
- **第 3 步 最终祝福与音乐**：自由编辑祝福长信（按回车即自动分段）与署名，支持内置 Web Audio 星空八音盒或上传自定义背景音乐。
- **第 4 步 全屏试演与生成分享链接**：顶部栏四步皆可一键「全屏试看」当前阶段，第 4 步支持「从头完整试演」、设置可选 **4 位生日口令**（留空则收信人免口令直达贺卡）、勾选隐藏收信页制作入口、生成短链接与**可扫码纯白分享海报 PNG**（以及 JSON 配置导出/导入）。

---

## 两种使用方式

### 方式 A：在线制作工坊（推荐，零代码）

1. 启动项目或部署到云端后，访问 `/create`；
2. 拖入照片、写下说明与祝福，点击「随机换排布」调到最顺眼的构图；
3. 点击「生成专属分享链接」：
   - **已绑定 Cloudflare R2 + KV**：自动生成全球可访问短链 `/c/xxxxxxxxxx` 与 180 天云端存储；
   - **本地开发或纯静态预览**：自动启用本地浏览器分享模式（`/c/local-xxxx`），支持口令解锁与删除全流程试演。

### 方式 B：直接编辑配置文件（开源自托管）

打开 [src/config/card.config.ts](src/config/card.config.ts) 即可 3 分钟静态定制：

```ts
export const cardConfig: BirthdayCardConfig = {
  recipientName: '你',
  senderName: '你的朋友',
  age: 24,
  birthdayDate: '2026.11.26',
  coverSubtitle: 'Happy Birthday',
  densityMode: 'auto', // 'auto' | 'compact' | 'standard' | 'deluxe'
  layoutSeed: 20261126, // 改变随机种子即可换一种星图排布
  memories: [
    {
      id: 'memory-01',
      image: './photos/01.jpg', // 放入 public/photos/，留空 '' 使用内置演示图
      date: '2025.07.19',
      title: '夏末的海边日落',
      template: 'polaroid', // 'polaroid' | 'editorial' | 'milestone' | 'warm-note'
      caption: '那天风很轻，我们沿着海岸走了很久，晚霞把整个傍晚都染暖了。',
      message: '写给卡片背面的悄悄话，翻转 180° 即可看到。',
    },
  ],
};
```

### 照片说明模板一览（[src/config/templates.ts](src/config/templates.ts)）

| 模板 ID | 名称 | 视觉风格与适用场景 |
| :--- | :--- | :--- |
| `polaroid` | 拍立得寄语 | 纯白棉纸卡片质感，适合日常合影与旅行随拍（默认） |
| `editorial` | 极简旁白 | 深色半透画廊标牌配细金竖线，适合氛围感风景与简短旁白 |
| `milestone` | 纪念刻度 | 白底金线顶部点缀与突出日期刻度，适合重要纪念节点 |
| `warm-note` | 温柔便签 | 淡暖米白手写便签风格，适合轻松温暖的日常记录 |

> 预设纪念卡默认由 Canvas 实时绘制，如需自定义 3:4 艺术图可放入 `public/presets/` 并在 [src/config/presets.ts](src/config/presets.ts) 中启用（提示词参考见 [docs/PRESET_PROMPTS.md](docs/PRESET_PROMPTS.md)）。

---

## 本地开发与构建

需要 **Node.js 20+**（推荐 Node 22）：

```bash
# 1. 克隆仓库并安装依赖
git clone https://github.com/St3venZ/starlight-birthday-card.git
cd starlight-birthday-card
npm install

# 2. 启动本地开发服务器（同时支持 /、/create、/c/:shortId）
npm run dev

# 3. 运行单元测试（年龄三档点阵、受控随机、模板解析与配置校验）
npm run test

# 4. 类型检查并构建静态产物到 dist/
npm run build

# 5. 本地预览生产构建
npm run preview
```

---

## 部署指南

### 方案一：Cloudflare Pages + R2 + KV（推荐，5 分钟免费开启在线分享短链）

项目已内置无服务器 API [functions/api/cards/[[path]].ts](functions/api/cards/%5B%5Bpath%5D%5D.ts) 与 [wrangler.toml](wrangler.toml)，绑定免费额度的 R2 与 KV 即可让任何人在 `/create` 上传照片并生成跨设备短链与扫码海报。

详细图文步骤请参阅：**[docs/DEPLOY_CLOUD.md](docs/DEPLOY_CLOUD.md)**（含 S3 / 阿里云 OSS 自建对接说明）。

### 方案二：GitHub Pages / Vercel（纯静态托管）

- **GitHub Pages**：Fork [St3venZ/starlight-birthday-card](https://github.com/St3venZ/starlight-birthday-card)（仓库已内置 [.github/workflows/deploy.yml](.github/workflows/deploy.yml)），在仓库 **Settings -> Pages** 中将 Source 设为 **GitHub Actions**，推送到 `main` 即自动发布。
- **Vercel**：导入 [St3venZ/starlight-birthday-card](https://github.com/St3venZ/starlight-birthday-card) 或你的 Fork，框架选择 **Vite**（Build Command: `npm run build`，Output Directory: `dist`），一键部署。

> 提示：如需修改页面左下角署名，请编辑 [src/config/site.config.ts](src/config/site.config.ts) 中的 `SITE_BRAND`。

---

## 目录结构

```text
├── .github/workflows/deploy.yml     # GitHub Pages 自动部署工作流
├── functions/api/cards/[[path]].ts  # Cloudflare Pages Functions 短链与 R2/KV 存储 API
├── wrangler.toml                    # Cloudflare Pages + R2 + KV 绑定配置
├── docs/
│   ├── DEPLOY_CLOUD.md              # 5 分钟免费云端短链部署指南
│   └── PRESET_PROMPTS.md            # 8 款预设纪念卡 AI 提示词与素材参考
├── public/
│   ├── robots.txt                   # 禁止搜索引擎收录 /c/ 私人贺卡链接
│   ├── photos/                      # 静态自定义回忆照片目录
│   ├── presets/                     # （可选）静态自定义预设卡图目录
│   └── audio/                       # （可选）静态自定义背景音乐目录
├── src/
│   ├── config/                      # 主配置、照片说明模板、预设卡与校验
│   ├── engine/                      # Three.js 场景、纯白立体贺卡、三档年龄点阵、烟花与着色器
│   ├── studio/                      # 在线制作工坊、图片压缩、草稿箱、批量导入与二维码海报
│   ├── share/                       # 云端 / 本地 IndexedDB 双模短链存储适配器
│   ├── audio/                       # Web Audio 星空八音盒与交互音效引擎
│   ├── ui/                          # 五幕极简浮层与照片模板说明条
│   ├── styles/                      # 贺卡、工坊与口令门统一样式表
│   └── main.ts                      # 客户端路由（/、/create、/c/:shortId）与状态编排
└── tests/                           # Vitest 单元测试
```

---

## 开源协议

本项目基于 [MIT License](LICENSE) 开源，欢迎自由定制、部署与分享。
