const { request, showToast } = require('../../utils/request')

const DEFAULT_FORM = {
  categoryId: 0,
  categoryName: '请选择',
  styleId: 0,
  styleName: '请选择',
  maxWords: 100,
  language: 'zh',
  languageName: '中文'
}

Page({
  data: {
    keywords: '',
    ...DEFAULT_FORM,
    wordPopupVisible: false,
    languagePopupVisible: false,
    wordOptions: [50, 100, 200, 300, 500],
    languageOptions: [],
    languageLoading: true,
    languageEmptyText: '暂无语言选项'
  },

  onLoad() {
    this.pageActive = true
    return this.loadLanguages()
  },

  onUnload() {
    this.pageActive = false
  },

  async loadLanguages() {
    if (this.data.languageLoading && this.languageRequestStarted) return
    this.languageRequestStarted = true
    this.setData({ languageLoading: true, languageEmptyText: '暂无语言选项' })
    try {
      const response = await request({
        url: '/ad-languages',
        method: 'GET',
        needAuth: false
      })
      if (Number(response.code) !== 200) throw new Error(response.message || 'Request failed')
      if (!this.pageActive) return
      const languageOptions = Array.isArray(response.data)
        ? response.data.filter((item) => item && item.label && item.value)
        : []
      if (!languageOptions.length) throw new Error('No language options')
      const selected = languageOptions.find((item) => item.value === this.data.language) || languageOptions[0]
      this.setData({
        languageOptions,
        language: selected.value,
        languageName: selected.label
      })
    } catch (error) {
      if (!this.pageActive) return
      console.error('广告文案语言加载失败:', error)
      this.setData({ languageOptions: [], languageEmptyText: '语言列表加载失败' })
      showToast('none', '语言列表加载失败')
    } finally {
      this.languageRequestStarted = false
      if (this.pageActive) this.setData({ languageLoading: false })
    }
  },

  onKeywordInput(e) {
    this.setData({ keywords: e.detail.value })
  },

  pasteKeywords() {
    return new Promise((resolve) => {
      wx.getClipboardData({
        success: ({ data = '' } = {}) => {
          this.setData({ keywords: String(data).slice(0, 500) })
          resolve()
        },
        fail: () => {
          showToast('none', '读取剪贴板失败')
          resolve()
        }
      })
    })
  },

  clearKeywords() {
    this.setData({ keywords: '' })
  },

  resetOptions() {
    const defaultLanguage = this.data.languageOptions.find((item) => item.value === 'zh') || this.data.languageOptions[0]
    this.setData({
      ...DEFAULT_FORM,
      language: defaultLanguage ? defaultLanguage.value : DEFAULT_FORM.language,
      languageName: defaultLanguage ? defaultLanguage.label : DEFAULT_FORM.languageName
    })
  },

  openCategory() {
    wx.navigateTo({
      url: '../adCopyCategory/adCopyCategory',
      events: {
        adCategorySelected: (option) => {
          this.setData({ categoryId: option.id, categoryName: option.name })
        }
      }
    })
  },

  openStyle() {
    wx.navigateTo({
      url: '../adCopyStyle/adCopyStyle',
      events: {
        adStyleSelected: (option) => {
          this.setData({ styleId: option.id, styleName: option.name })
        }
      }
    })
  },

  openWordPopup() {
    this.setData({ wordPopupVisible: true })
  },

  closeWordPopup() {
    this.setData({ wordPopupVisible: false })
  },

  selectWordCount(e) {
    this.setData({
      maxWords: Number(e.currentTarget.dataset.value),
      wordPopupVisible: false
    })
  },

  openLanguagePopup() {
    this.setData({ languagePopupVisible: true })
    if (!this.data.languageOptions.length && !this.data.languageLoading) {
      this.loadLanguages()
    }
  },

  closeLanguagePopup() {
    this.setData({ languagePopupVisible: false })
  },

  selectLanguage(e) {
    const value = e.currentTarget.dataset.value
    const option = this.data.languageOptions.find((item) => item.value === value)
    if (!option) return
    this.setData({
      language: option.value,
      languageName: option.label,
      languagePopupVisible: false
    })
  },

  generateCopy() {
    const keywords = this.data.keywords.trim()
    if (!keywords) {
      showToast('none', '请输入关键词描述')
      return
    }
    if (!this.data.categoryId) {
      showToast('none', '请选择广告类型')
      return
    }
    if (!this.data.styleId) {
      showToast('none', '请选择广告风格')
      return
    }

    const params = {
      category_id: Number(this.data.categoryId),
      style_id: Number(this.data.styleId),
      keywords,
      language: this.data.language,
      max_words: Number(this.data.maxWords)
    }
    wx.navigateTo({
      url: '../adCopyResult/adCopyResult',
      success: (result) => {
        result.eventChannel.emit('initAdCopyResult', { params })
      }
    })
  }
})
