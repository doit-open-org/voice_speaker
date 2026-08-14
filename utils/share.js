/**
 * 转发卡的唯一出处。
 *
 * ## 两条硬规矩
 *
 * 1. **`onShareAppMessage` 必须同步返回。** 里面不许 await、不许发请求。
 *    微信拿不到返回值时，转发卡会**静默退化成一张页面截图**——
 *    功能看着在，实际是废的，而且开发者工具里测不出来。
 *
 * 2. **path 必须指向接收方真的打得开的页面。**
 *    本程序里 generate（合成结果）、myWorks、adCopyResult 这几页的数据
 *    是经 `app.globalData` 交接的，接收方点开 globalData 是空的，
 *    看到的是一个空壳。所以这些页面的转发一律落回首页。
 *    能独立打开的功能页（长文本配音、声音转换、广告文案…）才分享到自己。
 *
 * ## 关于朋友圈
 *
 * `onShareTimeline` 只能带 query，落地页固定是**当前页**，改不了。
 * 而且只要页面上定义了这个方法，朋友圈按钮就一直亮着。
 * 所以靠 globalData 交接的页面**不许挂朋友圈**——点进去只会是空壳。
 */

var APP_NAME = '四博配音宝';
var HOME = '/pages/index/index';

/**
 * 分享到本程序首页。
 * 给「自己打不开」的页面用：合成结果、我的作品、广告文案结果等。
 */
function toHome(title) {
  return {
    title: title || (APP_NAME + '：文字转语音，还能自己录'),
    path: HOME
  };
}

/**
 * 分享到某个能独立打开的页面。
 * 只有确认 onLoad 不依赖 globalData / 上一页传值的页面才可以用这个。
 *
 * @param {string} title 卡片标题，说清这一页能干什么
 * @param {string} path  以 / 开头的页面路径，不带 query
 */
function toPage(title, path) {
  return {
    title: title || APP_NAME,
    path: path || HOME
  };
}

/**
 * 朋友圈。只能带 query，落地页固定是当前页——所以只给能独立打开的页面用。
 */
function timeline(title) {
  return { title: title || APP_NAME };
}

module.exports = {
  APP_NAME: APP_NAME,
  HOME: HOME,
  toHome: toHome,
  toPage: toPage,
  timeline: timeline
};
