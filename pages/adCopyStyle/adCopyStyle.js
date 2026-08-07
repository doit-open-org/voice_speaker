const { request, showToast } = require('../../utils/request')

Page({
  data: {
    options: [],
    loading: true,
    emptyText: '暂无广告风格'
  },

  onLoad() {
    this.pageActive = true
    this.eventChannel = this.getOpenerEventChannel()
    return this.loadOptions()
  },

  onUnload() {
    this.pageActive = false
  },

  async loadOptions() {
    this.setData({ loading: true })
    try {
      const options = await this.requestAllPages()
      if (this.pageActive) this.setData({ options })
    } catch (error) {
      if (!this.pageActive) return
      console.error('广告风格加载失败:', error)
      this.setData({ options: [], emptyText: '广告风格加载失败' })
      showToast('none', '广告风格加载失败')
    } finally {
      if (this.pageActive) this.setData({ loading: false })
    }
  },

  async requestAllPages() {
    const options = []
    let page = 1
    let totalPages = 1
    do {
      const response = await request({
        url: '/ad-styles',
        method: 'GET',
        data: { page, page_size: 100 },
        needAuth: false
      })
      if (Number(response.code) !== 200) throw new Error(response.message || 'Request failed')
      if (Array.isArray(response.data)) options.push(...response.data)
      totalPages = Math.max(1, Number(response.total_pages) || 1)
      page += 1
    } while (page <= totalPages)
    return options
  },

  selectOption(e) {
    const option = this.data.options.find((item) => String(item.id) === String(e.currentTarget.dataset.id))
    if (!option) return
    this.eventChannel.emit('adStyleSelected', option)
    wx.navigateBack()
  }
})
