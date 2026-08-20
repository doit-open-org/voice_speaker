const { request, showToast } = require('../../utils/request')

const PAGE_SIZE = 20
const CATEGORY_LABELS = {
  usage: '使用帮助',
  troubleshooting: '故障排查',
  other: '其他'
}

Page({
  data: {
    faqs: [],
    page: 0,
    totalPages: 1,
    loading: false,
    loadingMore: false,
    loadError: ''
  },

  onLoad() {
    this._pageActive = true
    return this.loadFaqs(true)
  },

  onUnload() {
    this._pageActive = false
  },

  async loadFaqs(reset = false) {
    if (this.data.loading || this.data.loadingMore) return
    const nextPage = reset ? 1 : this.data.page + 1
    if (!reset && nextPage > this.data.totalPages) return

    this.setData({
      loading: reset,
      loadingMore: !reset,
      loadError: reset ? '' : this.data.loadError
    })

    try {
      const response = await request({
        url: '/faqs',
        method: 'GET',
        data: { page: nextPage, page_size: PAGE_SIZE },
        needAuth: false
      })
      if (Number(response.code) !== 200) {
        throw new Error(response.message || '常见问题加载失败')
      }
      if (!this._pageActive) return

      const items = (Array.isArray(response.data) ? response.data : []).map((item) => ({
        ...item,
        categoryLabel: CATEGORY_LABELS[item.category] || '其他'
      }))
      this.setData({
        faqs: reset ? items : this.data.faqs.concat(items),
        page: Number(response.page) || nextPage,
        totalPages: Math.max(1, Number(response.total_pages) || 1),
        loadError: ''
      })
    } catch (error) {
      if (!this._pageActive) return
      const message = error.message || '常见问题加载失败'
      if (reset) this.setData({ faqs: [], loadError: message })
      showToast('none', message)
    } finally {
      if (this._pageActive) this.setData({ loading: false, loadingMore: false })
    }
  },

  retryLoad() {
    return this.loadFaqs(true)
  },

  loadMore() {
    return this.loadFaqs(false)
  },

  openDetail(e) {
    const faqId = Number(e.currentTarget.dataset.id)
    if (!Number.isInteger(faqId) || faqId < 1) return
    wx.navigateTo({ url: `../faqDetail/faqDetail?id=${faqId}` })
  }
})
