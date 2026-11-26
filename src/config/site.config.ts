/**
 * 站点角标与品牌署名配置（显示在贺卡页面角落的轻盈归属印记）。
 *
 * 【如何自定义为你的个人主页 / 站点名】
 * - `name`: 填写你的品牌名或个人主页名（如 `'St3venZ'`）；
 * - `url`: 可选，填写你的个人主页链接（如 `'https://github.com/St3venZ'`），留空 `''` 则仅显示纯文字署名；
 * - `labelPrefix` / `labelSuffix`: 前后缀连接文案，默认拼接为 `由 St3venZ 制作`。
 */
export const SITE_BRAND = {
  name: 'St3venZ',
  url: 'https://github.com/St3venZ',
  labelPrefix: '由 ',
  labelSuffix: ' 制作',
} as const;
