/**
 * 声纹授权弹窗。录音前的那道闸门。
 *
 * 审核要求「取得用户授权同意后，才能获取用户个人声纹信息」，
 * 所以这个弹窗必须挡在 wx.authorize({scope:'scope.record'}) **前面**，
 * 而不是跟它并列、更不是在它后面补。详见 utils/voiceConsent.js。
 *
 * 两个调用点共用这一个组件（components/recorder 和 pages/voiceConvert），
 * 不是因为省事，是因为**两处的授权文案必须一模一样**——
 * 同一件事在两个入口说法不同，本身就是个合规问题。
 */
var voiceConsent = require('../../utils/voiceConsent')

function pad(value) {
  return value < 10 ? '0' + value : String(value)
}

/** 'YYYY-MM-DD HH:mm:ss'。协议页要显示「你已于 X 授权」，得记下来。 */
function now() {
  var d = new Date()
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
}

Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    }
  },

  data: {
    title: voiceConsent.AGREEMENT.title,
    summary: voiceConsent.AGREEMENT.summary
  },

  methods: {
    // 遮罩上的滑动不该带动底下的页面
    preventTouchMove() {},

    agree() {
      voiceConsent.grant(now())
      this.triggerEvent('agree')
    },

    reject() {
      // 不同意就什么都不做——麦克风一次都没开过。
      this.triggerEvent('reject')
    },

    openAgreement() {
      wx.navigateTo({ url: voiceConsent.PAGE_PATH })
    }
  }
})
