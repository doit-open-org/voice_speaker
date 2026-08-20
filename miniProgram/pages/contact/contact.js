const WECHAT_ID = '13430722360'
const SERVICE_PHONE = '13430722360'

Page({
  copyWechat() {
    wx.setClipboardData({ data: WECHAT_ID })
  },

  callService() {
    wx.makePhoneCall({ phoneNumber: SERVICE_PHONE })
  }
})
