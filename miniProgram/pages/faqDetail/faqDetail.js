const { request, showToast } = require('../../utils/request')

const CATEGORY_LABELS = {
  usage: '使用帮助',
  troubleshooting: '故障排查',
  other: '其他'
}

Page({
  data: {
    faqId: 0,
    title: '',
    categoryLabel: '',
    detail: '',
    loading: false,
    loadError: ''
  },

  onLoad(options = {}) {
    this._pageActive = true
    const faqId = Number(options.id)
    if (!Number.isInteger(faqId) || faqId < 1) {
      this.setData({ loadError: '问题参数无效' })
      return
    }
    this.setData({ faqId })
    return this.loadDetail()
  },

  onUnload() {
    this._pageActive = false
  },

  async loadDetail() {
    if (this.data.loading || !this.data.faqId) return
    this.setData({ loading: true, loadError: '' })
    try {
      const response = await request({
        url: `/faqs/${this.data.faqId}`,
        method: 'GET',
        needAuth: false
      })
      if (Number(response.code) !== 200 || !response.data) {
        throw new Error(response.message || '问题详情加载失败')
      }
      if (!this._pageActive) return
      const detail = response.data
      this.setData({
        title: detail.title || '',
        categoryLabel: CATEGORY_LABELS[detail.category] || '其他',
        detail: detail.detail || '',
        loadError: ''
      })
    } catch (error) {
      if (!this._pageActive) return
      const message = error.message || '问题详情加载失败'
      this.setData({ loadError: message })
      showToast('none', message)
    } finally {
      if (this._pageActive) this.setData({ loading: false })
    }
  },

  retryLoad() {
    return this.loadDetail()
  }
})
