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
 * 3. `image` 留空 `''` 时，系统会自动绘制柔和的暖白插画示例图。
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
  recipientName: 'Steven',
  senderName: '一直陪伴你的朋友',
  age: 22,
  birthdayDate: '2026.11.26',
  coverSubtitle: '愿二十二岁的星光，照亮你的每一个日常',
  densityMode: 'auto',
  layoutSeed: 20261126,
  shareSettings: {
    hideCreateEntry: false,
    passcodeEnabled: false,
  },

  prologue: {
    title: 'Steven，生日快乐',
    lines: [
      '把这一年里最舍不得忘记的五个日常瞬间，画进了这张纯白贺卡。',
      '它们会在星夜里拼出你的二十二岁，点开任意一张，翻过背面看看写给你的悄悄话。',
    ],
    ctaLabel: '进入回忆相册',
  },

  memories: [
    {
      id: 'memory-01',
      image: './demo/01_seaside.jpg',
      date: '2026.03.22',
      title: '傍晚的海堤',
      template: 'polaroid',
      caption: '晚风把海面吹成碎金，沿着堤岸慢慢走就忘了时间。',
      message:
        'Steven，还记得那天沿着海堤走了好久，夕阳一点点沉进海里，风里都是咸咸的温柔。希望二十二岁的你，也能常常拥有这样不赶时间、吹着海风发呆的傍晚。',
      accentColor: '#D8A464',
    },
    {
      id: 'memory-02',
      image: './demo/02_cafe.jpg',
      date: '2026.05.09',
      title: '转角咖啡馆',
      template: 'warm-note',
      caption: '阳光斜斜落在木桌上，一杯拿铁聊掉一整个慵懒下午。',
      message:
        '和你待在街角小店里总觉得特别踏实，哪怕只是聊聊最近的小事、抢着分一块蛋糕，也能笑出声来。愿你往后的忙碌缝隙里，永远留着这样明媚松弛的午后。',
      accentColor: '#C59B5F',
    },
    {
      id: 'memory-03',
      image: './demo/03_sparkler.jpg',
      date: '2026.08.15',
      title: '夏夜仙女棒',
      template: 'editorial',
      caption: '把夏夜滚烫的星火攥在手心，亮得像迷你银河。',
      message:
        '夏末的河风吹着有点热，手里的仙女棒滋滋作响，映得你眼睛亮晶晶的。Steven，祝你二十二岁依然保有这份炽热与好奇，永远像那一晚的星火一样闪闪发光。',
      accentColor: '#D98C84',
    },
    {
      id: 'memory-04',
      image: './demo/04_stargazing.jpg',
      date: '2026.10.04',
      title: '山坡看星星',
      template: 'milestone',
      caption: '铺开格子野餐垫，等一颗慢悠悠划过的流星。',
      message:
        '秋夜的山坡有点凉，但捧着热饮看整片银河慢慢亮起来的时候，觉得世界一下子安静又辽阔。愿你新的一岁去往更远的远方时，抬头总能看见清朗璀璨的星光。',
      accentColor: '#7B9CC8',
    },
    {
      id: 'memory-05',
      image: './demo/05_birthday_cake.jpg',
      date: '2026.11.26',
      title: '二十二岁的烛光',
      template: 'polaroid',
      caption: '暖黄串灯亮起来，在摇曳烛光前许下二十二岁的心愿。',
      message:
        'Steven，二十二岁生日快乐！把这一年里一起吹过的海风、聊过的午后、看过的星星都收进这张贺卡里。愿你许下的每个愿望都稳稳发芽，平安喜乐，永远被温柔和偏爱围绕。',
      accentColor: '#D8A464',
    },
  ],

  presetFill: {
    // 为 true 时，自动使用内置暖白插画预设卡补齐年龄数字的其余点阵位置
    autoFill: true,
    // 留空数组 `[]` 表示使用全部 8 款内置预设；也可指定子集如 ['starlight-cake', 'aurora-balloon']
    selectedPresetIds: [],
  },

  finalBlessing: {
    headline: '致二十二岁的 Steven',
    paragraphs: [
      'Steven，二十二岁生日快乐。刚刚在星空里点亮的每一帧画面，都是这一年里因为有你而格外闪光的日常。',
      '新的一岁不必急着赶路，愿你三餐温暖、夜夜好眠，在热爱的事里尽情发光，疲惫时也总有随时可以停靠的港湾。',
      '合上这张贺卡后，今夜的烟花会为你绽放。愿你一直自由、真诚、明亮，二十二岁万事顺意。',
    ],
    signature: '一直陪伴你的朋友',
    closeCardLabel: '合上贺卡',
  },

  finaleWish: {
    title: 'Steven，22 岁生日快乐',
    subtitle: '愿二十二岁的每一天，都闪闪发光',
  },

  audio: {
    enabled: true,
    customBgmUrl: './audio/bgm.mp3',
    volume: 0.65,
  },
};
