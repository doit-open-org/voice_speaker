/**
 * 「我的」。
 *
 * ## 为什么这一页没有头像和昵称
 *
 * 2026-08 微信审核打回：「存在信息安全风险，请尽快完善内容机制：
 * 确保已接入内容安全API并要求所调用API可在小程序内任意发布的场景生效」。
 *
 * 被点到的就是这里原本的头像上传 + 昵称编辑：那是用户自己填的内容，
 * 平台要求接 imgSecCheck / msgSecCheck 并覆盖所有发布场景。
 *
 * 但这个小程序从来不靠用户身份做任何事——作品列表、模板、设备
 * 全部按 token 走，昵称和头像哪儿都没读过。为一个没人用的摆设
 * 扛一条要长期维护的审核链路不划算，所以连同 pages/profile 一起删了。
 *
 * **别顺手加回来**：任何让用户填字、传图的入口，都会把这条审核意见带回来。
 */
Page({
  openBluetoothPermission() {
    wx.navigateTo({ url: '../bluetoothPermission/bluetoothPermission' })
  },

  openVoiceAuth() {
    wx.navigateTo({ url: '../voiceAuth/voiceAuth' })
  },

  openContact() {
    wx.navigateTo({ url: '../contact/contact' })
  },

  openFaq() {
    wx.navigateTo({ url: '../faq/faq' })
  },

  openFeedback() {
    wx.navigateTo({ url: '../feedback/feedback' })
  },

  openAbout() {
    wx.navigateTo({ url: '../about/about' })
  }
})
