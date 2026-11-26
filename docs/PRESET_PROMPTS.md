# 星海金箔预设卡 AI 提示词库与素材指南

本指南为 **星海来信 (Starlight 3D Birthday Card)** 的 8 款系统内置预设装饰卡提供风格高度统一的 AI 绘画提示词、模型参数建议与免费摄影素材参考。

即使不替换图片，项目默认已通过程序实时绘制高精细度的鎏金星图蚀刻牌面；若你想为贺卡赋予更具电影质感或手工插画温度的视觉风貌，可以按本指南生成图片并放入 `public/presets/` 目录。

---

## 一、全局统一画风锚点 (Universal Style Anchor)

为了确保 8 张卡片在 3D 深夜星空中拼合成年龄数字时色彩克制、边界自然融合、不抢占真实回忆照片的主角地位，请将以下**画风锚点**固定附加到每一条主题提示词末尾：

### 通用正向锚点 (Append to every prompt)

```text
celestial atelier luxury collectible plate, deep midnight abyss navy velvet background (#050712 to #0B1026), delicate champagne gold leaf filigree (#F3D38C) and warm candlelight amber inner glow (#FFB85C), subtle astronomical astrolabe rings and tiny starlight constellations etched in fine gold hairline, soft radial dark vignette around all four outer edges so borders melt seamlessly into dark night sky, museum-grade fine engraving meets soft volumetric twilight lighting, serene poetic stillness, ultra-crisp micro-detail, vertical 3:4 composition, no text, no watermark, no frame border cutoff
```

### 通用反向提示词 (Negative Prompt)

```text
neon colors, cyberpunk purple magenta, blinding white background, harsh bright edges, cartoon clip-art, plastic 3D toy render, cluttered busy background, readable letters, typography, logos, watermarks, low resolution, jpeg artifacts, oversaturated rainbow glow
```

---

## 二、8 款主题专属提示词

以下 8 个编号与 [src/config/presets.ts](../src/config/presets.ts) 中的 `SYSTEM_PRESETS` 一一对应。使用时只需将对应主题的英文提示词与上方的**通用正向锚点**拼接即可。

### 1. `starlight-cake` — 星辉烛愿 (Starlight Cake)

- **建议保存路径**：`public/presets/starlight-cake.jpg`
- **主题提示词**：

```text
An exquisite miniature two-tier celestial birthday cake sculpted in pearlescent ivory porcelain and hammered champagne-gold leaf, resting on a slender gilded crescent pedestal, topped with a single slender golden taper candle emitting a warm quiet candlelight amber flame and delicate floating stardust motes, centered symmetrical botanical-astronomical composition,
```

### 2. `wishing-bottle` — 浮光愿瓶 (Wishing Bottle)

- **建议保存路径**：`public/presets/wishing-bottle.jpg`
- **主题提示词**：

```text
A delicate hand-blown antique apothecary glass wishing bottle sealed with a waxed champagne-gold star cork, cradling a glowing miniature swirl of golden firefly stardust and a tiny folded parchment scroll suspended inside dark indigo liquid, subtle specular glass reflections against velvet midnight space, centered still-life composition,
```

### 3. `crescent-lantern` — 新月灯影 (Crescent Lantern)

- **建议保存路径**：`public/presets/crescent-lantern.jpg`
- **主题提示词**：

```text
An ornate brass-and-gold filigree astronomical lantern shaped like a slender waxing crescent moon cradling a warm amber glass orb within, suspended by a whisper-thin golden chain amid floating starlight dust, casting soft warm honey-gold light rays into deep midnight navy air, centered poetic composition,
```

### 4. `gilded-giftbox` — 鎏金礼匣 (Gilded Giftbox)

- **建议保存路径**：`public/presets/gilded-giftbox.jpg`
- **主题提示词**：

```text
A keepsake midnight-velvet square gift box slightly ajar at the lid, tied with a silk champagne-gold ribbon and embossed celestial compass seal, soft warm golden starlight spilling gently from the narrow opening into the dark starry void, luxurious tactile fabric and brushed brass highlights, centered isometric-front view,
```

### 5. `aurora-balloon` — 极光星球 (Aurora Balloon)

- **建议保存路径**：`public/presets/aurora-balloon.jpg`
- **主题提示词**：

```text
A translucent blown-glass hot-air balloon orb filled with faint swirling champagne-gold and muted teal-indigo nebula mist, wrapped in ultra-fine gilded latitude and longitude wire rings, carrying a tiny ornate brass gondola beneath, floating serenely in deep quiet starlight, centered vertical composition,
```

### 6. `stardust-hourglass` — 星尘沙漏 (Stardust Hourglass)

- **建议保存路径**：`public/presets/stardust-hourglass.jpg`
- **主题提示词**：

```text
An antique astronomer's hourglass framed in slender engraved champagne-gold pillars and crescent finials, delicate luminous golden stardust trickling softly through the narrow glass waist like liquid starlight, faint constellation arcs behind the glass bulbs, serene timeless elegance, centered symmetrical composition,
```

### 7. `celestial-firework` — 星穹花火 (Celestial Firework)

- **建议保存路径**：`public/presets/celestial-firework.jpg`
- **主题提示词**：

```text
A single graceful willow-bloom celestial firework frozen mid-bloom in deep midnight space, slender cascading arcs of champagne-gold, warm candlelight amber, and pale rose-gold stardust sparks trailing delicately downward like weeping golden filaments, quiet atmospheric depth and subtle lens bokeh, centered balanced composition,
```

### 8. `constellation-musicbox` — 星盘八音盒 (Constellation Musicbox)

- **建议保存路径**：`public/presets/constellation-musicbox.jpg`
- **主题提示词**：

```text
An open miniature midnight-lacquer antique music box seen from a graceful elevated front angle, revealing gleaming brass clockwork gears, tiny pinned gold cylinder, and a hovering miniature gilded armillary sphere rising gently above the open lid in warm amber starlight, delicate engraving, centered composition,
```

---

## 三、主流生图模型参数建议

| 模型 / 工具 | 推荐参数与技巧 |
| :--- | :--- |
| **Midjourney v6 / v6.1** | 在完整提示词末尾添加 `--ar 3:4 --stylize 240 --v 6.1 --no text letters neon white-background`。如需 8 张色调完全锁死，可将第一张满意出图作为 `--sref <图片链接> --sw 180` 风格参考。 |
| **Flux.1 [dev / pro]** | 分辨率设为 `896 × 1152` 或 `768 × 1024`，Guidance (CFG) 建议 `3.2 ~ 4.0`。Flux 对自然语言细节响应极佳，可直接保留括号中的色号描述（如 `#050712`、`#F3D38C`）。 |
| **即梦 / Seedream** | 比例选择 `3:4`，画面描述可直接使用上方英文提示词，或追加中文质感词「深夜丝绒蓝底色、香槟金箔细线蚀刻、四角柔和暗角、克制高级博物馆藏品光影」。 |
| **Nano Banana / Imagen 3** | 比例指定 `3:4`，在指令开头加上 `Generate a 3:4 vertical luxury celestial gold-foil illustration on a deep #050712 midnight background with soft dark vignetted edges:`，并保持 8 张同会话连续生成以获得最佳一致性。 |

---

## 四、画幅比例、暗角融合与替换步骤

### 为什么推荐 3:4 与深蓝暗角边缘

1. **完美匹配卡片纵横比**：3D 照片墙中的卡片默认接近 `3:4` 竖版画幅。使用 `768 × 1024`（或 `600 × 800`）导出可避免任何裁切损失，同时保持高清锐利。
2. **与选择性 HDR 辉光 (`UnrealBloomPass`) 和谐共处**：引擎会对高亮度金色粒子与点亮边框施加轻盈辉光。预设图主体采用香槟金与柔和暖光、**四周保留深午夜蓝 (`#050712` ~ `#0B1026`) 暗角**，既能让金色纹样在星空中呼吸发光，又不会出现刺眼的白边方块感。
3. **体积控制**：建议导出为 `.webp` 或高质量 `.jpg`（品质 82%~88%），单张体积控制在 **120KB ~ 260KB**，确保移动端秒开。

### 启用自定义预设图只需两步

1. 将 8 张图片放入 `public/presets/`，例如 `public/presets/starlight-cake.jpg`。
2. 打开 [src/config/presets.ts](../src/config/presets.ts)，取消对应条目的 `image` 注释：

```ts
{
  id: 'starlight-cake',
  name: '星辉烛愿',
  subtitle: 'Starlight Cake',
  motif: 'starlight-cake',
  image: './presets/starlight-cake.jpg',
}
```

如果只想在 3D 年龄数字中启用其中几款预设（例如只用蛋糕、愿瓶与沙漏），还可以在 `src/config/card.config.ts` 中配置：

```ts
presetFill: {
  autoFill: true,
  selectedPresetIds: ['starlight-cake', 'wishing-bottle', 'stardust-hourglass'],
}
```

---

## 五、免费可商用真实摄影素材参考 (Unsplash / Pexels)

如果你暂时手头缺少真实合影，或想为演示回忆卡片搭配真实电影感摄影图，可在 [Unsplash](https://unsplash.com/) 或 [Pexels](https://www.pexels.com/)（均遵循免费可商用授权）搜索以下关键词，下载后放入 `public/photos/`：

- **黄昏海边**：`golden hour ocean coastline twilight`、`warm sunset beach waves`
- **山顶星空**：`milky way mountain night sky`、`stargazing silhouette ridge`
- **雨夜暖灯**：`rainy night warm street lantern`、`cozy twilight alley reflections`
- **冬夜极光**：`northern lights winter lake subtle`、`aurora borealis snow reflection`
- **清晨云海**：`sunrise sea of clouds mountain`、`pastel dawn mist valley`
- **湖畔灯火**：`floating sky lanterns night lake`、`warm paper lantern twilight`

> 提示：程序会对 `public/photos/` 中的图片自动执行居中裁切 (`cover`) 与柔和边缘暗角润色，无论原图是横构图还是竖构图都能优雅呈现在 3D 卡片上。
