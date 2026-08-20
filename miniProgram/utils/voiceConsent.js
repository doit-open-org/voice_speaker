/**
 * 声纹授权状态。
 *
 * ## 为什么有这个东西
 *
 * 2026-08 微信审核第三次打回：「你的小程序涉及收集、使用和存储用户声纹录取，
 * 需增加独立的《声纹授权协议》，明确告知收集用户个人信息的使用目的、方式和用途，
 * 并取得用户授权同意后，才能获取用户个人声纹信息。」
 *
 * 三个要求，一个都不能少：
 *   1. **独立的**协议——不能塞进隐私政策里当一节，要单独一页（pages/voiceAuth）
 *   2. 写清**目的、方式、用途**——AGREEMENT 里逐条写了
 *   3. **先授权，后录音**——这条是代码要保证的
 *
 * ## 一条硬时序
 *
 * `granted()` 必须在 `wx.authorize({scope:'scope.record'})` **之前**问。
 * 顺序反了就等于「先开麦再补协议」，正是审核打回的那件事。
 * 麦克风权限是系统层面的，声纹授权是我们自己的，两件事，不能互相代替：
 * 用户可能早就给过微信麦克风权限（别的小程序给的），那不等于同意我们收集声纹。
 *
 * ## 撤回
 *
 * 《个人信息保护法》要求同意可撤回，所以 revoke() 不是可选项。
 * 撤回后 granted() 立刻返回 false，下次录音会重新弹协议。
 */

var STORAGE_KEY = 'voice_consent'

// 协议实质内容改了就把这个数字 +1，老用户会被重新问一遍。
// 只改错别字不要动它——那会把所有人的授权白白清掉。
var VERSION = 1

/**
 * 协议正文。**这里是唯一出处**：
 * 授权弹窗的摘要和完整协议页都从这儿取，抄成两份迟早会对不上，
 * 而「弹窗上写的」和「协议页写的」不一致，本身就是个合规问题。
 */
var AGREEMENT = {
  title: '声纹授权协议',
  updatedAt: '2026-08-14',
  // 弹窗里露出来的摘要。每条都能在下面 sections 里找到对应的完整表述。
  summary: [
    '我们通过手机麦克风录制你的语音，用于音色转换和配音合成。',
    '录音会上传到我们的服务器，保存在你的作品里，你可以随时删除。',
    '我们不会用它做身份识别或声纹比对，也不会用于任何身份验证。',
    '你可以随时在「我的 - 声纹授权协议」里撤回这份授权。'
  ],
  sections: [
    {
      heading: '一、我们收集什么',
      items: [
        '你通过本小程序录制的语音（含其中的声纹特征）。',
        '录音的时长、文件大小等技术信息，用于判断上传是否成功。',
        '除此之外，录音过程中我们不收集任何其它个人信息。'
      ]
    },
    {
      heading: '二、我们怎么收集（方式）',
      items: [
        '只在你主动点击「开始录音」后，才调用手机麦克风。',
        '首次录音前会先取得你对本协议的授权，再申请微信麦克风权限；两者缺一，麦克风都不会开启。',
        '不存在后台录音、静默录音，也不存在未经你点击的自动录制。'
      ]
    },
    {
      heading: '三、我们用来做什么（目的和用途）',
      items: [
        '音色转换：把你的录音转换成你所选主播的音色。',
        '配音合成：把你的录音与背景音乐、语速音量设置合成为配音作品。',
        '发送播放：在你选择时，把生成的音频传输到你已连接的智能音箱播放。',
        '除上述用途外，我们不会将你的录音用于其它任何目的。'
      ]
    },
    {
      heading: '四、我们如何存储和对外提供',
      items: [
        '录音及生成的作品存储在我们的服务器上，与你的微信账号（openid）关联。',
        '为实现音色转换与语音合成，你的录音会提供给第三方语音技术服务商（火山引擎）处理；我们要求其仅按本协议约定的用途处理，不得另作他用。',
        '除法律法规要求或你另行同意外，我们不会向其它任何第三方提供你的录音。'
      ]
    },
    {
      heading: '五、我们不会做什么',
      items: [
        '不将你的声纹用于身份识别、身份验证或声纹比对。',
        '不将你的声纹用于训练与本小程序功能无关的模型。',
        '不出售、不出租你的录音和声纹信息。'
      ]
    },
    {
      heading: '六、保存多久，怎么删除',
      items: [
        '录音在你删除对应作品前一直保存；你可以在「我的作品」中随时删除，删除后我们会同步删除服务器上的文件。',
        '你注销或长期不再使用本小程序时，可通过「我的 - 联系方式」联系我们删除全部录音。'
      ]
    },
    {
      heading: '七、你可以随时撤回',
      items: [
        '在「我的 - 声纹授权协议」页面底部点击「撤回授权」即可撤回。',
        '撤回后我们将不再录制新的语音；已经生成的作品不受影响，你可以自行删除。',
        '撤回不影响撤回前基于你的授权已经进行的处理。'
      ]
    },
    {
      heading: '八、联系我们',
      items: [
        '对本协议或你的录音有任何疑问，可通过「我的 - 意见反馈」或「我的 - 联系方式」联系我们。'
      ]
    }
  ]
}

function readRecord() {
  try {
    var raw = wx.getStorageSync(STORAGE_KEY)
    return (raw && typeof raw === 'object') ? raw : null
  } catch (error) {
    // 存储读不出来时按「没授权」处理。宁可多问一次，也不能默认放行。
    return null
  }
}

/** 是否已经授权过，且授权的是当前这一版协议。 */
function granted() {
  var record = readRecord()
  return !!(record && record.granted === true && Number(record.version) === VERSION)
}

/**
 * 记下授权。
 * @param {string} at 授权时间（'YYYY-MM-DD HH:mm:ss'）。传进来而不是在这儿取，
 *                    是为了让用例能断言写进去的到底是什么。
 */
function grant(at) {
  try {
    wx.setStorageSync(STORAGE_KEY, {
      granted: true,
      version: VERSION,
      at: at || ''
    })
    return true
  } catch (error) {
    return false
  }
}

/** 撤回。整条删掉而不是写 granted:false，省得以后判断时少写一个条件。 */
function revoke() {
  try {
    wx.removeStorageSync(STORAGE_KEY)
    return true
  } catch (error) {
    return false
  }
}

/** 授权时间，没授权过就是空串。用来在协议页上显示「你已于 X 授权」。 */
function grantedAt() {
  var record = readRecord()
  return (record && record.at) ? String(record.at) : ''
}

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  VERSION: VERSION,
  AGREEMENT: AGREEMENT,
  PAGE_PATH: '/pages/voiceAuth/voiceAuth',
  granted: granted,
  grant: grant,
  revoke: revoke,
  grantedAt: grantedAt
}
