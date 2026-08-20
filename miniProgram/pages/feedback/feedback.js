const { request, showToast } = require('../../utils/request')

const MAX_CONTENT_LENGTH = 200

Page({
  data: {
    categories: [
      { value: 'suggestion', label: '功能建议' },
      { value: 'bug', label: '功能异常' },
      { value: 'complaint', label: '投诉' }
    ],
    category: 'suggestion',
    content: '',
    submitting: false
  },

  selectCategory(e) {
    if (this.data.submitting) return
    const category = e.currentTarget.dataset.value
    if (!this.data.categories.some((item) => item.value === category)) return
    this.setData({ category })
  },

  onContentInput(e) {
    const content = String(e.detail.value || '').slice(0, MAX_CONTENT_LENGTH)
    this.setData({ content })
  },

  async submitFeedback() {
    if (this.data.submitting) return
    const content = this.data.content.trim()
    if (!content) {
      showToast('none', '请输入反馈内容')
      return
    }

    this.setData({ submitting: true })
    try {
      const response = await request({
        url: '/user/feedback',
        method: 'POST',
        data: {
          content,
          category: this.data.category
        },
        needAuth: true
      })
      if (Number(response.code) !== 200) {
        throw new Error(response.message || '反馈提交失败')
      }
      this.setData({ content: '' })
      showToast('success', '提交成功')
    } catch (error) {
      showToast('none', error.message || '反馈提交失败')
    } finally {
      this.setData({ submitting: false })
    }
  }
})
