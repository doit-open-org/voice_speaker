const { request, showToast } = require('../../utils/request')

const API_ORIGIN = 'http://192.168.5.245:9000'

Page({
  data: {
    nickname: '微信用户',
    avatarUrl: '',
    loadingProfile: false
  },

  onShow() {
    return this.loadProfile()
  },

  normalizeAvatarUrl(url) {
    if (!url) return ''
    if (/^https?:\/\//i.test(url)) return url
    return `${API_ORIGIN}/${String(url).replace(/^\/+/, '')}`
  },

  applyProfile(profile = {}) {
    this.setData({
      nickname: profile.nickname || '微信用户',
      avatarUrl: this.normalizeAvatarUrl(profile.avatar_url)
    })
  },

  async loadProfile() {
    if (this.data.loadingProfile) return
    this.setData({ loadingProfile: true })
    try {
      const response = await request({
        url: '/user/profile',
        method: 'GET',
        needAuth: true
      })
      if (Number(response.code) !== 200) throw new Error(response.message || '个人资料加载失败')
      this.applyProfile(response.data)
    } catch (error) {
      showToast('none', error.message || '个人资料加载失败')
    } finally {
      this.setData({ loadingProfile: false })
    }
  },

  openProfile() {
    wx.navigateTo({ url: '../profile/profile' })
  },

  openContact() {
    wx.navigateTo({ url: '../contact/contact' })
  },

  openAbout() {
    console.log('111');
    wx.navigateTo({ url: '../about/about' })
  },

  changeTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === 'voice') {
      wx.redirectTo({ url: '../index/index' })
      return
    }
    if (tab === 'device') {
      wx.navigateTo({ url: '../device/device' })
      return
    }
    if (tab === 'advanced') {
      wx.navigateTo({ url: '../advanced/advanced' })
    }
  }
})
