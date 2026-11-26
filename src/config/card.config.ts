import type { BirthdayCardConfig } from './types';

/**
 * 生日贺卡主配置文件 — 3 分钟即可定制专属于 TA 的 3D 生日贺卡！
 * Birthday Card Main Configuration — Customize in 3 minutes.
 *
 * 你也可以直接访问 `/create` 在可视化贺卡工坊中上传照片、调整排布并一键生成分享链接。
 *
 * 【如何替换成真实照片 / How to add your real photos】
 * 1. 将回忆照片放入 `public/photos/` 目录（如 `01.jpg`, `02.png`）；
 * 2. 将下方对应回忆的 `image` 改为 `'./photos/01.jpg'`；
 * 3. `image` 留空 `''` 时，系统会自动绘制 6 幅柔和的拍立得风景示例图。
 *
 * 【如何填写照片说明与选择模板 / Photo captions & templates】
 * - `caption`: 点击查看照片时，直接显示在照片下方的简短说明（不填则自动使用 `message`）；
 * - `message`: 翻转照片 180° 后，印在白色卡纸背面的详细留言；
 * - `template`: 可选 `'polaroid'`（拍立得寄语）| `'editorial'`（极简旁白）| `'milestone'`（纪念刻度）| `'warm-note'`（温柔便签），
 *   模板定义与示例文案见 `src/config/templates.ts`。
 *
 * 【点阵密度与随机排布 / Density & seeded random layout】
 * - `densityMode`: `'auto'`（自动按照片数量与位数匹配）| `'compact'` | `'standard'` | `'deluxe'`；
 * - `layoutSeed`: 任意整数种子，控制用户照片在数字点阵中的自然散落位置与随机换排布。
 *
 * 【如何自定义背景音乐 / How to use custom BGM】
 * 1. 将 MP3 / OGG 音频放入 `public/audio/` 目录（如 `bgm.mp3`）；
 * 2. 将 `audio.customBgmUrl` 设为 `'./audio/bgm.mp3'`；
 * 3. 留空 `''` 时，会自动演奏内置的 Web Audio 轻柔八音盒旋律。
 */
export const cardConfig: BirthdayCardConfig = {
  recipientName: '你',
  senderName: '你的朋友',
  age: 24,
  birthdayDate: '2026.05.20',
  coverSubtitle: '愿新的一岁，平安喜乐，万事顺意',
  densityMode: 'auto',
  layoutSeed: 20261126,
  shareSettings: {
    hideCreateEntry: false,
    passcodeEnabled: false,
  },

  prologue: {
    title: '生日快乐',
    lines: [
      '把过去一年里值得记住的几个瞬间，收进了这张小小的贺卡。',
      '接下来它们会在夜空里拼出你的二十四岁，点击任意一张，可以看看当时的记录与背面留言。',
    ],
    ctaLabel: '进入回忆相册',
  },

  memories: [
    {
      id: 'memory-01',
      image: '', // 示例 Example: './photos/01.jpg'
      date: '2025.07.19',
      title: '傍晚的海边',
      template: 'polaroid',
      caption: '那天晚霞很柔和，沿着海边散步的时候什么烦心事都忘了。',
      message:
        '那天海风很舒服，太阳落下去前把天空染成了淡淡的橘色。我们顺着堤岸走了很长一段路，聊了不少日常小事，回头看这张照片依然觉得很轻松。',
      accentColor: '#D8A464',
    },
    {
      id: 'memory-02',
      image: '', // 示例 Example: './photos/02.jpg'
      date: '2025.09.04',
      title: '山顶的夜空',
      template: 'milestone',
      caption: '凌晨两点云散开了，第一次在山脊上看到这么清晰的星空。',
      message:
        '虽然夜里的山风有点凉，但等到云层散开的那一刻还是觉得非常值得。希望你往后的每一次出发，都能遇到这样清朗的好天气。',
      accentColor: '#7B9CC8',
    },
    {
      id: 'memory-03',
      image: '', // 示例 Example: './photos/03.jpg'
      date: '2025.11.12',
      title: '雨后的小巷',
      template: 'warm-note',
      caption: '刚下完雨的傍晚，街角小店亮着暖灯，一起喝了一碗热汤。',
      message:
        '秋雨刚停的时候路面还有点湿，路灯映在石板上暖暖的。那天在小馆里慢慢吃完晚饭，觉得这种普通又安稳的夜晚其实最难得。',
      accentColor: '#C59B5F',
    },
    {
      id: 'memory-04',
      image: '', // 示例 Example: './photos/04.jpg'
      date: '2026.01.28',
      title: '冬夜的湖面',
      template: 'editorial',
      caption: '很安静的一个冬夜，湖面像镜子一样映着远处的微光。',
      message:
        '那天晚上空气特别清冽，站在湖边没说太多话，只看着远处的天色一点点变亮。谢谢你总能注意到生活里这些安静又美好的瞬间。',
      accentColor: '#7DB8A8',
    },
    {
      id: 'memory-05',
      image: '', // 示例 Example: './photos/05.jpg'
      date: '2026.04.11',
      title: '清晨的云海',
      template: 'milestone',
      caption: '天刚亮的时候雾气散开，远山在晨光里慢慢露了出来。',
      message:
        '早起虽然有点困，但看到第一缕阳光照在云层上时整个人都清醒了。愿你新的一岁也像这个清晨一样，视野开阔，脚步轻快。',
      accentColor: '#D98C84',
    },
    {
      id: 'memory-06',
      image: '', // 示例 Example: './photos/06.jpg'
      date: '2026.05.10',
      title: '湖畔的灯影',
      template: 'polaroid',
      caption: '夏初的晚风很温柔，许下的小愿望希望都能慢慢实现。',
      message:
        '夜色落下来之后，湖面上浮着点点暖光。不管你当时许了什么心愿，都祝它在二十四岁这一年里稳稳落地，每天都过得舒心自在。',
      accentColor: '#C59B5F',
    },
  ],

  presetFill: {
    // 为 true 时，自动使用内置暖白插画预设卡补齐年龄数字的其余点阵位置
    autoFill: true,
    // 留空数组 `[]` 表示使用全部 8 款内置预设；也可指定子集如 ['starlight-cake', 'aurora-balloon']
    selectedPresetIds: [],
  },

  finalBlessing: {
    headline: '二十四岁生日快乐',
    paragraphs: [
      '祝你二十四岁生日快乐。刚刚点亮的那些照片，记录了过去一年里很多轻松、温暖、值得回味的时刻。',
      '新的一岁不需要给自己太大压力。愿你每天都能睡个好觉，吃上合胃口的饭，忙起来时有条不紊，闲下来时能去做真正喜欢的事。',
      '合上这张贺卡后，今夜的烟花会为你升空。愿你一直健康、开心、自在，新的一岁万事顺心。',
    ],
    signature: '你的朋友',
    closeCardLabel: '合上贺卡',
  },

  finaleWish: {
    title: '生日快乐',
    subtitle: '愿新的一岁，平安顺遂，烟火常新',
  },

  audio: {
    enabled: true,
    customBgmUrl: '', // 示例 Example: './audio/bgm.mp3'
    volume: 0.55,
  },
};
