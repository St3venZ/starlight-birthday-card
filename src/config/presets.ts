import type { PresetCardMeta } from './types';

/**
 * 系统内置的 8 款「暖白简约插画」生日装饰卡片。
 *
 * 默认不填写 `image` 时，程序会在暖白棉纸卡面上实时绘制轻盈、清新的现代手账风
 * 生日元素插画（与纯白折叠贺卡统一审美，并在深夜星空中清晰透亮），开箱即用。
 *
 * 如需替换成自己的插画或照片：
 * 1. 将图片放入 `public/presets/` 目录（推荐竖版 3:4，浅白或浅暖底色最佳）；
 * 2. 在下方对应项添加 `image: './presets/starlight-cake.jpg'` 即可。
 */
export const SYSTEM_PRESETS: PresetCardMeta[] = [
  {
    id: 'starlight-cake',
    name: '生日蛋糕',
    subtitle: 'Birthday Cake',
    motif: 'starlight-cake',
    // image: './presets/starlight-cake.jpg',
  },
  {
    id: 'wishing-bottle',
    name: '心愿玻璃瓶',
    subtitle: 'Wishing Jar',
    motif: 'wishing-bottle',
    // image: './presets/wishing-bottle.jpg',
  },
  {
    id: 'crescent-lantern',
    name: '温暖烛光',
    subtitle: 'Warm Candle',
    motif: 'crescent-lantern',
    // image: './presets/crescent-lantern.jpg',
  },
  {
    id: 'gilded-giftbox',
    name: '丝带礼盒',
    subtitle: 'Ribbon Gift',
    motif: 'gilded-giftbox',
    // image: './presets/gilded-giftbox.jpg',
  },
  {
    id: 'aurora-balloon',
    name: '漂浮气球',
    subtitle: 'Floating Balloons',
    motif: 'aurora-balloon',
    // image: './presets/aurora-balloon.jpg',
  },
  {
    id: 'stardust-hourglass',
    name: '时光沙漏',
    subtitle: 'Little Hourglass',
    motif: 'stardust-hourglass',
    // image: './presets/stardust-hourglass.jpg',
  },
  {
    id: 'celestial-firework',
    name: '烟火彩屑',
    subtitle: 'Sparkler & Stars',
    motif: 'celestial-firework',
    // image: './presets/celestial-firework.jpg',
  },
  {
    id: 'constellation-musicbox',
    name: '生日旋律',
    subtitle: 'Melody Note',
    motif: 'constellation-musicbox',
    // image: './presets/constellation-musicbox.jpg',
  },
];
