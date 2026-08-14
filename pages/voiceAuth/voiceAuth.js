/**
 * 《声纹授权协议》完整版。
 *
 * 审核要求的「**独立的**《声纹授权协议》」就是这一页——
 * 不能塞进隐私政策里当一节，也不能只在弹窗里露个摘要。
 *
 * 正文不写在这儿，从 utils/voiceConsent 取：那是唯一出处。
 * 弹窗摘要和这一页抄成两份，迟早会对不上，而两处说法不一致
 * 本身就是个合规问题。
 */
const voiceConsent = require('../../utils/voiceConsent')
const share = require('../../utils/share')

Page({
  data: {
    title: voiceConsent.AGREEMENT.title,
    updatedAt: voiceConsent.AGREEMENT.updatedAt,
    sections: voiceConsent.AGREEMENT.sections,
    granted: false,
    grantedAt: ''
  },

  onShow() {
    // 每次进来都重读：用户可能刚在别处授权或撤回
    this.setData({
      granted: voiceConsent.granted(),
      grantedAt: voiceConsent.grantedAt()
    })
  },

  revoke() {
    wx.showModal({
      title: '撤回声纹授权',
      content: '撤回后将不再录制新的语音。已经生成的作品不受影响，你可以在「我的作品」里自行删除。',
      confirmText: '确认撤回',
      cancelText: '再想想',
      success: (res) => {
        if (!res.confirm) return
        voiceConsent.revoke()
        this.setData({ granted: false, grantedAt: '' })
        wx.showToast({ icon: 'none', title: '已撤回声纹授权' })
      }
    })
  },

  // 这一页不依赖 globalData，接收方点开能正常读，所以分享到自己
  onShareAppMessage() {
    return share.toPage('四博配音宝声纹授权协议', voiceConsent.PAGE_PATH)
  }
})
