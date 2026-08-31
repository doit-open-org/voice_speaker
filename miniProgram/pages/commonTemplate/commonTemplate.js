const { request, showToast } = require('../../utils/request')
const app = getApp()

const EMPTY_CATEGORIES = [
  { key: 'add', name: '添加模板', synthetic: true },
  { key: 'mine', name: '我的模板', synthetic: true }
]

Page({
  data: {
    activeTab: 'templates',
    templateCategories: EMPTY_CATEGORIES,
    activeCategoryKey: 'add',
    currentTemplates: [],
    templateLoading: false,
    templateEmptyText: '暂无内容',
    templateDialogVisible: false,
    templateDialogMode: 'create',
    templateDraft: '',
    templateKeyboardHeight: 0,
    editingTemplateId: 0,
    templateSubmitting: false,
    deletingTemplateId: 0,
    genericVoices: [],
    genericLoading: false,
    genericEmptyText: '暂无内容',
    playingId: 0
  },

  async onLoad(options = {}) {
    this.pageActive = true
    this.expandedTemplateIds = {}
    this.adTemplates = []
    this.myTemplates = []
    this.myTemplatesLoaded = false
    this.genericLoaded = false
    this.eventChannel = this.getOpenerEventChannel()
    this.createAudio()
    await this.loadAdTemplates()
    if (options.category === 'mine' && this.pageActive) {
      this.setData({ activeCategoryKey: 'mine' })
      await this.loadMyTemplates()
    }
  },

  onHide() {
    this.pauseAudio()
  },

  onUnload() {
    this.pageActive = false
    if (this.innerAudioContext) {
      this.innerAudioContext.destroy()
      this.innerAudioContext = null
    }
  },

  createAudio() {
    this.innerAudioContext = wx.createInnerAudioContext()
    this.innerAudioContext.onPause(() => this.resetPlaying())
    this.innerAudioContext.onEnded(() => this.resetPlaying())
    this.innerAudioContext.onError(() => {
      this.innerAudioContext.stop()
      this.resetPlaying()
      showToast('none', '通用语音播放失败')
    })
  },

  async requestAllPages(url, needAuth = false) {
    const loadPage = (page) => request({
      url,
      method: 'GET',
      data: { page, page_size: 100 },
      needAuth
    })
    const firstResponse = await loadPage(1)
    if (Number(firstResponse.code) !== 200) {
      throw new Error(firstResponse.message || 'Request failed')
    }

    const items = Array.isArray(firstResponse.data) ? [...firstResponse.data] : []
    const totalPages = Math.max(1, Number(firstResponse.total_pages) || 1)
    for (let page = 2; page <= totalPages; page += 1) {
      const response = await loadPage(page)
      if (Number(response.code) !== 200) {
        throw new Error(response.message || 'Request failed')
      }
      if (Array.isArray(response.data)) items.push(...response.data)
    }
    return items
  },

  async loadAdTemplates() {
    this.setData({ templateLoading: true })
    try {
      const templates = await this.requestAllPages('/ad-templates/')
      if (!this.pageActive) return

      const categoryNames = []
      const seen = new Set()
      templates.forEach((item) => {
        if (item.category && !seen.has(item.category)) {
          seen.add(item.category)
          categoryNames.push(item.category)
        }
      })
      const apiCategories = categoryNames.map((name) => ({
        key: `category:${name}`,
        name,
        synthetic: false
      }))
      const activeCategoryKey = apiCategories[0] ? apiCategories[0].key : 'add'
      this.adTemplates = templates
      this.setData({
        templateCategories: [...EMPTY_CATEGORIES, ...apiCategories],
        activeCategoryKey,
        templateEmptyText: '暂无内容'
      })
      this.updateCurrentTemplates(activeCategoryKey)
    } catch (error) {
      if (!this.pageActive) return
      console.error('广告模板加载失败:', error)
      this.adTemplates = []
      this.setData({
        templateCategories: EMPTY_CATEGORIES,
        activeCategoryKey: 'add',
        currentTemplates: [],
        templateEmptyText: '模板加载失败'
      })
      showToast('error', '广告模板加载失败')
    } finally {
      if (this.pageActive) this.setData({ templateLoading: false })
    }
  },

  async selectCategory(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ activeCategoryKey: key, templateEmptyText: '暂无内容' })
    if (key === 'add') {
      this.updateCurrentTemplates(key)
      this.openCreateTemplate()
      return
    }
    this.closeTemplateDialog()
    if (key === 'mine') {
      await this.loadMyTemplates()
      return
    }
    this.updateCurrentTemplates(key)
  },

  updateCurrentTemplates(categoryKey = this.data.activeCategoryKey) {
    if (categoryKey === 'mine') {
      const currentTemplates = this.myTemplates.map((item) => ({
        ...item,
        source: 'mine',
        isMine: true,
        expanded: Boolean(this.expandedTemplateIds[`mine:${item.id}`])
      }))
      this.setData({ currentTemplates })
      return
    }
    if (!categoryKey.startsWith('category:')) {
      this.setData({ currentTemplates: [] })
      return
    }
    const category = categoryKey.slice('category:'.length)
    const currentTemplates = this.adTemplates
      .filter((item) => item.category === category)
      .map((item) => ({
        ...item,
        source: 'ad',
        isMine: false,
        expanded: Boolean(this.expandedTemplateIds[`ad:${item.id}`])
      }))
    this.setData({ currentTemplates })
  },

  toggleTemplate(e) {
    const source = e.currentTarget.dataset.source || 'ad'
    const idKey = `${source}:${e.currentTarget.dataset.id}`
    this.expandedTemplateIds[idKey] = !this.expandedTemplateIds[idKey]
    this.updateCurrentTemplates()
  },

  useTemplate(e) {
    const idKey = String(e.currentTarget.dataset.id)
    const source = e.currentTarget.dataset.source || 'ad'
    const templates = source === 'mine' ? this.myTemplates : this.adTemplates
    const template = templates.find((item) => String(item.id) === idKey)
    if (!template) return
    const content = String(template.content || '')
    if (this.eventChannel && typeof this.eventChannel.emit === 'function') {
      this.eventChannel.emit('templateSelected', { content })
      wx.navigateBack()
      return
    }
    app.globalData.pendingVoiceText = content
    wx.reLaunch({ url: '../index/index' })
  },

  async loadMyTemplates(force = false) {
    if (this.myTemplatesLoaded && !force) {
      this.updateCurrentTemplates('mine')
      return
    }
    this.setData({ templateLoading: true, templateEmptyText: '暂无内容' })
    try {
      const templates = await this.requestAllPages('/user/my-templates', true)
      if (!this.pageActive) return
      this.myTemplates = templates
      this.myTemplatesLoaded = true
      if (this.data.activeCategoryKey === 'mine') {
        this.updateCurrentTemplates('mine')
      }
    } catch (error) {
      if (!this.pageActive) return
      console.error('我的模板加载失败:', error)
      this.myTemplates = []
      this.myTemplatesLoaded = false
      if (this.data.activeCategoryKey === 'mine') {
        this.setData({ currentTemplates: [], templateEmptyText: '我的模板加载失败' })
      }
      showToast('none', '我的模板加载失败')
    } finally {
      if (this.pageActive) this.setData({ templateLoading: false })
    }
  },

  openCreateTemplate() {
    this.setData({
      templateDialogVisible: true,
      templateDialogMode: 'create',
      templateDraft: '',
      templateKeyboardHeight: 0,
      editingTemplateId: 0
    })
  },

  openEditTemplate(e) {
    const idKey = String(e.currentTarget.dataset.id)
    const template = this.myTemplates.find((item) => String(item.id) === idKey)
    if (!template) return
    this.setData({
      templateDialogVisible: true,
      templateDialogMode: 'edit',
      templateDraft: template.content,
      templateKeyboardHeight: 0,
      editingTemplateId: template.id
    })
  },

  closeTemplateDialog() {
    if (this.data.templateSubmitting) return
    this.setData({
      templateDialogVisible: false,
      templateDraft: '',
      templateKeyboardHeight: 0,
      editingTemplateId: 0
    })
  },

  onTemplateInput(e) {
    this.setData({ templateDraft: String(e.detail.value || '').slice(0, 2000) })
  },

  onTemplateKeyboardHeightChange(e) {
    const templateKeyboardHeight = Math.max(0, Number(e.detail.height) || 0)
    if (templateKeyboardHeight === this.data.templateKeyboardHeight) return
    this.setData({ templateKeyboardHeight })
  },

  async submitTemplate() {
    if (this.data.templateSubmitting) return
    const content = this.data.templateDraft.trim()
    if (!content) {
      showToast('none', '请输入模板内容')
      return
    }

    const isEdit = this.data.templateDialogMode === 'edit'
    const url = isEdit
      ? `/user/my-templates/${this.data.editingTemplateId}`
      : '/user/my-templates'
    this.setData({ templateSubmitting: true })
    try {
      const response = await request({
        url,
        method: isEdit ? 'PUT' : 'POST',
        data: { content },
        needAuth: true
      })
      if (Number(response.code) !== 200) {
        throw new Error(response.message || '保存失败')
      }
      if (!this.pageActive) return
      this.setData({
        templateDialogVisible: false,
        templateDraft: '',
        templateKeyboardHeight: 0,
        editingTemplateId: 0,
        activeCategoryKey: 'mine'
      })
      showToast('success', isEdit ? '修改成功' : '添加成功')
      await this.loadMyTemplates(true)
    } catch (error) {
      if (!this.pageActive) return
      console.error(isEdit ? '模板修改失败:' : '模板添加失败:', error)
      showToast('none', error.message || (isEdit ? '修改失败' : '添加失败'))
    } finally {
      if (this.pageActive) this.setData({ templateSubmitting: false })
    }
  },

  confirmDeleteTemplate() {
    return new Promise((resolve) => {
      wx.showModal({
        title: '删除模板',
        content: '确定删除该模板吗？',
        confirmText: '删除',
        confirmColor: '#C0392B',
        success: (result) => resolve(Boolean(result.confirm)),
        fail: () => resolve(false)
      })
    })
  },

  async deleteTemplate(e) {
    const id = e.currentTarget.dataset.id
    if (!id || this.data.deletingTemplateId) return
    const confirmed = await this.confirmDeleteTemplate()
    if (!confirmed) return

    this.setData({ deletingTemplateId: id })
    try {
      const response = await request({
        url: `/user/my-templates/${id}`,
        method: 'DELETE',
        needAuth: true
      })
      if (Number(response.code) !== 200) {
        throw new Error(response.message || '删除失败')
      }
      if (!this.pageActive) return
      showToast('success', '删除成功')
      await this.loadMyTemplates(true)
    } catch (error) {
      if (!this.pageActive) return
      console.error('模板删除失败:', error)
      showToast('none', error.message || '删除失败')
    } finally {
      if (this.pageActive) this.setData({ deletingTemplateId: 0 })
    }
  },

  async switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
    if (tab === 'generic' && !this.genericLoaded && !this.data.genericLoading) {
      await this.loadGenericVoices()
    }
  },

  async loadGenericVoices() {
    this.setData({ genericLoading: true, genericEmptyText: '暂无内容' })
    try {
      const genericVoices = await this.requestAllPages('/generic-voices')
      if (!this.pageActive) return
      this.genericLoaded = true
      this.setData({
        genericVoices,
        genericEmptyText: genericVoices.length > 0 ? '' : '暂无内容'
      })
    } catch (error) {
      if (!this.pageActive) return
      console.error('通用语音加载失败:', error)
      this.setData({ genericVoices: [], genericEmptyText: '通用语音加载失败' })
      showToast('error', '通用语音加载失败')
    } finally {
      if (this.pageActive) this.setData({ genericLoading: false })
    }
  },

  normalizeAudioUrl(audioUrl) {
    if (!audioUrl) return ''
    return /^https?:\/\//i.test(audioUrl) ? audioUrl : `https://${audioUrl}`
  },

  playGeneric(e) {
    const id = e.currentTarget.dataset.id
    const voice = this.data.genericVoices.find((item) => String(item.id) === String(id))
    if (!voice || !voice.music_file) {
      showToast('none', '通用语音播放失败')
      return
    }
    if (String(id) === String(this.data.playingId)) {
      this.pauseAudio()
      return
    }
    if (this.data.playingId) this.innerAudioContext.stop()
    this.setData({ playingId: voice.id })
    this.innerAudioContext.src = this.normalizeAudioUrl(voice.music_file)
    this.innerAudioContext.play()
  },

  pauseAudio() {
    if (this.innerAudioContext) {
      this.innerAudioContext.pause()
    } else {
      this.resetPlaying()
    }
  },

  resetPlaying() {
    if (this.pageActive) this.setData({ playingId: 0 })
  },

  deriveFileName(voice) {
    if (voice.file_name) return voice.file_name
    const cleanUrl = String(voice.music_file || '').split(/[?#]/)[0]
    const pathName = cleanUrl.split('/').pop()
    return pathName || `${voice.name || 'audio'}.mp3`
  },

  sendGeneric(e) {
    const id = e.currentTarget.dataset.id
    const voice = this.data.genericVoices.find((item) => String(item.id) === String(id))
    if (!voice || !voice.music_file) return
    app.globalData.generate = {
      ...voice,
      audio_url: voice.music_file,
      file_name: this.deriveFileName(voice)
    }
    wx.navigateTo({ url: '../generate/generate' })
  }
})
