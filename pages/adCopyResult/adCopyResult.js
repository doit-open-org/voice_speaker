const { request, showToast } = require('../../utils/request')
const app = getApp()

Page({
  data: {
    content: '',
    actualWords: 0,
    generating: false,
    saving: false,
    fontSize: 'medium',
    fontSizes: [
      { value: 'small', name: '小' },
      { value: 'medium', name: '中' },
      { value: 'large', name: '大' },
      { value: 'extra', name: '特大' }
    ]
  },

  onLoad() {
    this.pageActive = true
    this.params = null
    this.eventChannel = this.getOpenerEventChannel()
    this.eventChannel.on('initAdCopyResult', ({ params } = {}) => {
      if (!params) return
      this.params = { ...params }
      this.generateCopy()
    })
  },

  onUnload() {
    this.pageActive = false
  },

  parseAdCopyResponse(response) {
    if (typeof response === 'string') {
      const text = response.trim()
      if (!text) throw new Error('广告词生成失败')
      try {
        return this.parseAdCopyResponse(JSON.parse(text))
      } catch (error) {
        if (/^[{\[]/.test(text)) throw error
      }
      return this.parseCompletedEventResponse(text)
    }
    if (!response || typeof response !== 'object') {
      throw new Error('广告词生成失败')
    }
    if (response.code !== undefined && Number(response.code) !== 200) {
      throw new Error(response.message || '广告词生成失败')
    }

    const data = response.data !== undefined ? response.data : response
    if (typeof data === 'string') return this.parseAdCopyResponse(data)
    const content = data.full_content || data.content || data.text || ''
    if (!content) throw new Error('广告词生成失败')
    return {
      content: String(content),
      actualWords: Number(data.actual_words) || Array.from(String(content)).length
    }
  },

  parseCompletedEventResponse(responseText) {
    const chunks = []
    let fullContent = ''
    let actualWords = 0
    const blocks = responseText.replace(/\r\n/g, '\n').split(/\n\n+/)

    blocks.forEach((block) => {
      if (!block.trim()) return
      let eventName = 'message'
      const dataLines = []
      block.split('\n').forEach((line) => {
        if (line.startsWith('event:')) eventName = line.slice(6).trim()
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
      })
      if (!dataLines.length) return

      let data
      try {
        data = JSON.parse(dataLines.join('\n'))
      } catch (error) {
        throw new Error('广告词响应格式错误')
      }
      if (eventName === 'error') {
        throw new Error(data.message || data.error || '广告词生成失败')
      }
      if (eventName === 'delta' && data.text) chunks.push(String(data.text))
      if (eventName === 'done') {
        if (data.full_content) fullContent = String(data.full_content)
        actualWords = Number(data.actual_words) || 0
      }
    })

    const content = fullContent || chunks.join('')
    if (!content) throw new Error('广告词生成失败')
    return {
      content,
      actualWords: actualWords || Array.from(content).length
    }
  },

  async generateCopy() {
    if (!this.params || this.data.generating) return
    this.setData({ generating: true, content: '', actualWords: 0 })
    try {
      const response = await request({
        url: '/user/ad-create',
        method: 'POST',
        data: this.params,
        needAuth: true
      })
      const result = this.parseAdCopyResponse(response)
      if (!this.pageActive) return
      this.setData(result)
    } catch (error) {
      if (!this.pageActive) return
      console.error('广告词生成失败:', error)
      showToast('none', error.message || '广告词生成失败')
    } finally {
      if (this.pageActive) this.setData({ generating: false })
    }
  },

  regenerate() {
    return this.generateCopy()
  },

  changeFontSize(e) {
    const fontSize = e.currentTarget.dataset.size
    if (this.data.fontSizes.some((item) => item.value === fontSize)) {
      this.setData({ fontSize })
    }
  },

  copyResult() {
    if (!this.data.content) {
      showToast('none', '暂无可复制内容')
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      wx.setClipboardData({
        data: this.data.content,
        success: () => {
          showToast('success', '复制成功')
          resolve()
        },
        fail: () => {
          showToast('none', '复制失败')
          resolve()
        }
      })
    })
  },

  copyToVoiceHome() {
    if (!this.data.content) {
      showToast('none', '暂无可用内容')
      return
    }
    app.globalData.pendingVoiceText = this.data.content
    wx.reLaunch({ url: '../index/index' })
  },

  async saveToTemplates() {
    if (!this.data.content || this.data.saving) return
    this.setData({ saving: true })
    try {
      const response = await request({
        url: '/user/my-templates',
        method: 'POST',
        data: { content: this.data.content },
        needAuth: true
      })
      if (Number(response.code) !== 200) throw new Error(response.message || '保存失败')
      if (!this.pageActive) return
      showToast('success', '保存成功')
      wx.redirectTo({ url: '../commonTemplate/commonTemplate?category=mine' })
    } catch (error) {
      if (!this.pageActive) return
      console.error('保存广告词模板失败:', error)
      showToast('none', error.message || '保存失败')
    } finally {
      if (this.pageActive) this.setData({ saving: false })
    }
  }
})
