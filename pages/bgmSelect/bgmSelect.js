const { request, showToast } = require('../../utils/request')

const API_ORIGIN = getApp().globalData.domain
const API_BASE_URL = `${API_ORIGIN}/api/v1`
const FAVORITES_KEY = 'favorites'
const UPLOADS_KEY = 'uploads'
const MAX_CUSTOM_FILE_SIZE = 20 * 1024 * 1024
const PROGRESS_TICK_MS = 30
const PROGRESS_STEP = 2
const PROGRESS_COMPLETE_HOLD_MS = 120

Page({
  data: {
    bgmList: {},
    activeBgmId: 0,
    hasBgmList: false,
    emptyText: '背景音乐加载中...',
    playingId: 0,
    importing: false,
    importLabel: '',
    uploadProgress: 0,
    deletingBgmId: 0
  },

  onLoad() {
    this.pageActive = true
    this.baseBgmList = { categories: [], bgms: {} }
    this.favoriteBgms = []
    this.customBgms = []
    this.favoritePendingIds = {}
    this.favoriteListLoading = true
    this.fileTasks = []
    this.uploadProgressTarget = 0
    this.uploadProgressTimer = null
    this.uploadProgressResolvers = []
    this.eventChannel = this.getOpenerEventChannel()
    this.eventChannel.on('initBgmSelect', ({ bgmList = {}, activeBgmId = 0 } = {}) => {
      this.applyBgmList(bgmList, activeBgmId)
    })
    this.createAudio()
    this.updateBgmListView()
  },

  onReady() {
    if (!this.baseBgmList.categories.length) {
      this.getBgmList()
    }
    this.getFavoriteList()
    this.getCustomBgmList()
  },

  onHide() {
    this.pauseMusic()
  },

  onUnload() {
    this.pageActive = false
    this.stopUploadProgressAnimation()
    this.fileTasks.forEach((task) => {
      if (task && task.abort) task.abort()
    })
    this.fileTasks = []
    if (this.innerAudioContext) {
      this.innerAudioContext.destroy()
      this.innerAudioContext = null
    }
  },

  createAudio() {
    this.innerAudioContext = wx.createInnerAudioContext()
    this.innerAudioContext.onPlay(() => this.syncPlaying())
    this.innerAudioContext.onPause(() => {
      if (!this.requestedPlayingId) this.resetPlaying()
    })
    this.innerAudioContext.onEnded(() => this.resetPlaying())
    this.innerAudioContext.onError(() => {
      const wasPreviewing = Boolean(this.data.playingId)
      this.innerAudioContext.stop()
      this.resetPlaying()
      if (wasPreviewing) showToast('none', '背景音乐试听失败')
    })
  },

  applyBgmList(bgmList, activeBgmId = 0) {
    const categories = Array.isArray(bgmList.categories) ? bgmList.categories : []
    const bgms = bgmList.bgms && typeof bgmList.bgms === 'object'
      ? bgmList.bgms
      : {}
    this.baseBgmList = { ...bgmList, categories, bgms }
    this.updateBgmListView(activeBgmId)
  },

  updateBgmListView(activeBgmId = this.data.activeBgmId) {
    const baseBgmList = this.baseBgmList || { categories: [], bgms: {} }
    const baseCategories = Array.isArray(baseBgmList.categories)
      ? baseBgmList.categories.filter((category) => (
        category.key !== FAVORITES_KEY && category.key !== UPLOADS_KEY
      ))
      : []
    const baseBgms = baseBgmList.bgms && typeof baseBgmList.bgms === 'object'
      ? baseBgmList.bgms
      : {}
    const favoriteBgms = Array.isArray(this.favoriteBgms) ? this.favoriteBgms : []
    const customBgms = Array.isArray(this.customBgms) ? this.customBgms : []
    const favoriteIds = new Set(favoriteBgms.map((item) => String(item.id)))
    const pendingIds = this.favoritePendingIds || {}
    const decorateRegular = (item) => ({
      ...item,
      source: 'regular',
      isFavorite: favoriteIds.has(String(item.id)),
      favoritePending: this.favoriteListLoading || Boolean(pendingIds[String(item.id)]),
      showFavorite: true,
      showDelete: false
    })
    const bgms = {}

    Object.keys(baseBgms).forEach((key) => {
      if (key !== FAVORITES_KEY && key !== UPLOADS_KEY && Array.isArray(baseBgms[key])) {
        bgms[key] = baseBgms[key].map(decorateRegular)
      }
    })
    bgms[FAVORITES_KEY] = favoriteBgms.map(decorateRegular)
    bgms[UPLOADS_KEY] = customBgms.map((item) => ({
      ...item,
      source: 'upload',
      showFavorite: false,
      showDelete: true,
      deletePending: String(this.data.deletingBgmId) === String(item.id)
    }))

    const categories = [
      { key: FAVORITES_KEY, name: '我的收藏' },
      { key: UPLOADS_KEY, name: '我的上传' },
      ...baseCategories
    ]
    this.setData({
      bgmList: { ...baseBgmList, categories, bgms },
      activeBgmId,
      hasBgmList: true,
      emptyText: ''
    })
  },

  async getBgmList() {
    try {
      const res = await request({
        url: '/user/bgms/categories',
        method: 'GET',
        needAuth: true
      })
      if (Number(res.code) === 200) {
        this.applyBgmList(res.data, this.data.activeBgmId)
      } else {
        this.setData({ emptyText: '暂无背景音乐' })
        showToast('error', '背景音乐拉取失败')
      }
    } catch (error) {
      console.error('获取背景音乐列表失败:', error)
      this.setData({ emptyText: '暂无背景音乐' })
      showToast('error', '背景音乐拉取失败')
    }
  },

  async getFavoriteList() {
    this.favoriteListLoading = true
    this.updateBgmListView()
    try {
      const res = await request({
        url: '/user/bgms/favorites/list',
        method: 'GET',
        needAuth: true
      })
      if (Number(res.code) !== 200) {
        throw new Error(res.message || 'Favorite list request failed')
      }
      if (!this.pageActive) return
      this.favoriteBgms = Array.isArray(res.data) ? res.data : []
    } catch (error) {
      if (!this.pageActive) return
      console.error('背景音乐收藏列表加载失败:', error)
      this.favoriteBgms = []
      showToast('none', '收藏列表加载失败')
    } finally {
      this.favoriteListLoading = false
      if (this.pageActive) this.updateBgmListView()
    }
  },

  async getCustomBgmList() {
    try {
      const res = await request({
        url: '/user/bgms/custom/list',
        method: 'GET',
        needAuth: true
      })
      if (Number(res.code) !== 200) {
        throw new Error(res.message || 'Custom BGM list request failed')
      }
      if (!this.pageActive) return
      this.customBgms = Array.isArray(res.data) ? res.data : []
      this.updateBgmListView()
    } catch (error) {
      if (!this.pageActive) return
      console.error('上传音乐列表加载失败:', error)
      this.customBgms = []
      this.updateBgmListView()
      showToast('none', '上传列表加载失败')
    }
  },

  findBgmById(id, source = 'regular') {
    if (source === 'upload') {
      return this.customBgms.find((item) => String(item.id) === String(id)) || null
    }
    const bgms = (this.baseBgmList && this.baseBgmList.bgms) || {}
    for (const key in bgms) {
      const bgm = Array.isArray(bgms[key])
        ? bgms[key].find((item) => item.id == id)
        : null
      if (bgm) return bgm
    }
    return null
  },

  normalizeAudioUrl(audioPath) {
    if (!audioPath) return ''
    return /^https?:\/\//i.test(audioPath) ? audioPath : `https://${audioPath}`
  },

  playBgm(e) {
    const id = e.detail.id
    const source = e.detail.source || 'regular'
    const bgm = this.findBgmById(id, source)
    if (!bgm || !bgm.audio_path) {
      showToast('none', '背景音乐试听失败')
      return
    }
    this.requestedPlayingId = id
    this.playingSource = source
    this.setData({ playingId: id })
    this.innerAudioContext.src = this.normalizeAudioUrl(bgm.audio_path)
    this.innerAudioContext.play()
  },

  pauseMusic() {
    this.requestedPlayingId = 0
    this.playingSource = ''
    if (this.innerAudioContext) {
      this.innerAudioContext.pause()
    }
    this.resetPlaying()
  },

  syncPlaying() {
    if (!this.requestedPlayingId) return
    this.setData({ playingId: this.requestedPlayingId })
    const bgmList = this.selectComponent('#bgmlistCom')
    if (bgmList) {
      bgmList.setData({
        palyId: this.requestedPlayingId,
        palySource: this.playingSource
      })
    }
  },

  resetPlaying() {
    this.requestedPlayingId = 0
    this.playingSource = ''
    this.setData({ playingId: 0 })
    const bgmList = this.selectComponent('#bgmlistCom')
    if (bgmList) bgmList.setData({ palyId: 0, palySource: '' })
  },

  chooseBgm(e) {
    const bgm = this.findBgmById(e.detail.id, e.detail.source || 'regular')
    if (!bgm) return
    this.eventChannel.emit('bgmSelected', bgm)
    wx.navigateBack()
  },

  async toggleFavorite(e) {
    const id = e.detail.id
    const idKey = String(id)
    if (this.favoriteListLoading || this.favoritePendingIds[idKey]) return

    const bgm = this.findBgmById(id, 'regular')
    if (!bgm) return
    const wasFavorite = this.favoriteBgms.some((item) => String(item.id) === idKey)
    this.favoritePendingIds[idKey] = true
    this.updateBgmListView()

    try {
      const res = await request({
        url: '/user/bgms/favorite',
        method: wasFavorite ? 'DELETE' : 'POST',
        data: { id: Number(id) },
        needAuth: true
      })
      if (!this.pageActive) return
      if (Number(res.code) !== 200) {
        showToast('none', wasFavorite ? '取消收藏失败' : '收藏失败')
        return
      }
      if (wasFavorite) {
        this.favoriteBgms = this.favoriteBgms.filter((item) => String(item.id) !== idKey)
      } else {
        this.favoriteBgms = [...this.favoriteBgms, bgm]
      }
    } catch (error) {
      if (!this.pageActive) return
      console.error(wasFavorite ? '取消收藏失败:' : '收藏失败:', error)
      showToast('none', wasFavorite ? '取消收藏失败' : '收藏失败')
    } finally {
      delete this.favoritePendingIds[idKey]
      if (this.pageActive) this.updateBgmListView()
    }
  },

  chooseChatFile(options) {
    return new Promise((resolve, reject) => {
      wx.chooseMessageFile({
        count: 1,
        ...options,
        success: (result) => resolve(result.tempFiles && result.tempFiles[0]),
        fail: reject
      })
    })
  },

  isCancelled(error) {
    return /cancel/i.test(String((error && (error.errMsg || error.message)) || ''))
  },

  isMp3File(file) {
    return Boolean(file && /\.mp3$/i.test(file.name || file.path || ''))
  },

  getFileBaseName(fileName, fallback = '我的音乐') {
    const name = String(fileName || '').split(/[\\/]/).pop().replace(/\.[^.]+$/, '').trim()
    return name || fallback
  },

  async importMusic() {
    if (this.data.importing) {
      showToast('none', '音乐处理中')
      return
    }
    let file
    try {
      file = await this.chooseChatFile({
        type: 'file',
        extension: ['mp3', 'MP3']
      })
    } catch (error) {
      if (!this.isCancelled(error)) showToast('none', '选择文件失败')
      return
    }
    if (!this.isMp3File(file)) {
      showToast('none', '请选择 MP3 格式文件')
      return
    }
    if (Number(file.size) > MAX_CUSTOM_FILE_SIZE) {
      showToast('none', 'MP3 文件不能超过20MB')
      return
    }
    await this.runImportTask(
      () => this.uploadCustomBgm(file.path, this.getFileBaseName(file.name)),
      '音乐上传中...',
      '导入成功',
      '导入失败'
    )
  },

  async extractVideoMusic() {
    if (this.data.importing) {
      showToast('none', '音乐处理中')
      return
    }
    let file
    try {
      file = await this.chooseChatFile({ type: 'video' })
    } catch (error) {
      if (!this.isCancelled(error)) showToast('none', '选择视频失败')
      return
    }
    if (!file || !file.path) return
    const name = this.getFileBaseName(file.name, '视频提取音乐')
    await this.runImportTask(async () => {
      const converted = await this.convertVideoToMp3(file.path)
      const tempFilePath = await this.downloadConvertedAudio(converted.download_path)
      return this.uploadCustomBgm(tempFilePath, name, { start: 65, end: 100 })
    }, '视频提取中...', '提取成功', '提取失败')
  },

  async runImportTask(task, loadingTitle, successTitle, failureTitle) {
    this.stopUploadProgressAnimation()
    this.uploadProgressTarget = 0
    this.setData({ importing: true, importLabel: loadingTitle, uploadProgress: 0 })
    try {
      const uploadedBgm = await task()
      if (!this.pageActive) return
      await this.completeUploadProgress()
      if (!this.pageActive) return
      if (uploadedBgm && uploadedBgm.id) {
        this.customBgms = [
          uploadedBgm,
          ...this.customBgms.filter((item) => String(item.id) !== String(uploadedBgm.id))
        ]
        this.updateBgmListView()
      }
      this.showUploadedCategory()
      showToast('success', successTitle)
    } catch (error) {
      if (!this.pageActive) return
      console.error(`${failureTitle}:`, error)
      showToast('none', error.message || failureTitle)
    } finally {
      if (this.pageActive) {
        this.stopUploadProgressAnimation()
        this.setData({ importing: false, importLabel: '' })
      }
    }
  },

  parseFileResponse(response, failureMessage) {
    let result
    try {
      result = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
    } catch (error) {
      throw new Error(failureMessage)
    }
    if (response.statusCode < 200 || response.statusCode >= 300 || Number(result.code) !== 200) {
      throw new Error((result && result.message) || failureMessage)
    }
    return result.data
  },

  runFileTask(factory) {
    return new Promise((resolve, reject) => {
      let task
      let settled = false
      const finish = (callback, value) => {
        settled = true
        const index = this.fileTasks.indexOf(task)
        if (index >= 0) this.fileTasks.splice(index, 1)
        callback(value)
      }
      task = factory(
        (value) => finish(resolve, value),
        (error) => finish(reject, error)
      )
      if (task && !settled) this.fileTasks.push(task)
    })
  },

  setUploadProgress(progress) {
    if (!this.pageActive || !this.data.importing) return
    const uploadProgress = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)))
    this.uploadProgressTarget = Math.max(this.uploadProgressTarget || 0, uploadProgress)
    this.scheduleUploadProgressTick()
  },

  scheduleUploadProgressTick() {
    if (this.uploadProgressTimer || !this.pageActive || !this.data.importing) return
    if (this.data.uploadProgress >= this.uploadProgressTarget) {
      this.resolveUploadProgressWaiters()
      return
    }
    this.uploadProgressTimer = setTimeout(() => {
      this.uploadProgressTimer = null
      if (!this.pageActive || !this.data.importing) return
      const nextProgress = Math.min(
        this.uploadProgressTarget,
        this.data.uploadProgress + PROGRESS_STEP
      )
      this.setData({ uploadProgress: nextProgress })
      if (nextProgress >= this.uploadProgressTarget) {
        this.resolveUploadProgressWaiters()
      } else {
        this.scheduleUploadProgressTick()
      }
    }, PROGRESS_TICK_MS)
  },

  resolveUploadProgressWaiters() {
    if (this.data.uploadProgress < 100) return
    const resolvers = this.uploadProgressResolvers.splice(0)
    resolvers.forEach((resolve) => resolve())
  },

  stopUploadProgressAnimation() {
    if (this.uploadProgressTimer) {
      clearTimeout(this.uploadProgressTimer)
      this.uploadProgressTimer = null
    }
    const resolvers = this.uploadProgressResolvers || []
    this.uploadProgressResolvers = []
    resolvers.forEach((resolve) => resolve())
  },

  async completeUploadProgress() {
    this.setUploadProgress(100)
    if (this.data.uploadProgress < 100) {
      await new Promise((resolve) => this.uploadProgressResolvers.push(resolve))
    }
    if (!this.pageActive) return
    await new Promise((resolve) => setTimeout(resolve, PROGRESS_COMPLETE_HOLD_MS))
  },

  bindTaskProgress(task, range = { start: 0, end: 100 }) {
    if (!task || !task.onProgressUpdate) return
    const start = Number(range.start) || 0
    const end = Number(range.end) || 100
    task.onProgressUpdate((result) => {
      const stageProgress = Math.max(0, Math.min(100, Number(result.progress) || 0))
      const mappedProgress = start + ((end - start) * stageProgress / 100)
      const visibleStageEnd = end === 100 ? 99 : end
      this.setUploadProgress(Math.min(mappedProgress, visibleStageEnd))
    })
  },

  uploadFile(options, failureMessage, progressRange = { start: 0, end: 100 }) {
    return this.runFileTask((resolve, reject) => {
      const task = wx.uploadFile({
        ...options,
        success: (response) => {
          try {
            const data = this.parseFileResponse(response, failureMessage)
            this.setUploadProgress(progressRange.end)
            resolve(data)
          } catch (error) {
            reject(error)
          }
        },
        fail: () => reject(new Error(failureMessage))
      })
      this.bindTaskProgress(task, progressRange)
      return task
    })
  },

  convertVideoToMp3(filePath) {
    return this.uploadFile({
      url: `${API_BASE_URL}/video2mp3`,
      filePath,
      name: 'file'
    }, '视频转换失败', { start: 0, end: 45 })
  },

  normalizeDownloadUrl(downloadPath) {
    if (/^https?:\/\//i.test(downloadPath || '')) return downloadPath
    if (String(downloadPath || '').startsWith('/')) return `${API_ORIGIN}${downloadPath}`
    return `${API_BASE_URL}/${downloadPath}`
  },

  downloadConvertedAudio(downloadPath) {
    if (!downloadPath) return Promise.reject(new Error('视频转换失败'))
    return this.runFileTask((resolve, reject) => {
      const task = wx.downloadFile({
        url: this.normalizeDownloadUrl(downloadPath),
        success: (response) => {
          if (response.statusCode === 200 && response.tempFilePath) {
            this.setUploadProgress(65)
            resolve(response.tempFilePath)
          } else {
            reject(new Error('转换文件下载失败'))
          }
        },
        fail: () => reject(new Error('转换文件下载失败'))
      })
      this.bindTaskProgress(task, { start: 45, end: 65 })
      return task
    })
  },

  uploadCustomBgm(filePath, name, progressRange = { start: 0, end: 100 }) {
    const token = wx.getStorageSync('auth_token')
    return this.uploadFile({
      url: `${API_BASE_URL}/user/bgms/custom/upload`,
      filePath,
      name: 'audio',
      formData: { name },
      header: { Authorization: `Bearer ${token}` }
    }, '音乐上传失败', progressRange)
  },

  showUploadedCategory() {
    const list = this.selectComponent('#bgmlistCom')
    if (list && list.showCategory) list.showCategory(UPLOADS_KEY)
  },

  confirmDeleteCustomBgm() {
    return new Promise((resolve) => {
      wx.showModal({
        title: '删除音乐',
        content: '确定删除该上传音乐吗？',
        confirmText: '删除',
        confirmColor: '#E20E0E',
        success: (result) => resolve(Boolean(result.confirm)),
        fail: () => resolve(false)
      })
    })
  },

  async deleteCustomBgm(e) {
    const id = e.detail.id
    if (!id || this.data.deletingBgmId) return
    const confirmed = await this.confirmDeleteCustomBgm()
    if (!confirmed) return

    this.setData({ deletingBgmId: id })
    this.updateBgmListView()
    try {
      const res = await request({
        url: '/user/bgms/custom',
        method: 'DELETE',
        data: { id: Number(id) },
        needAuth: true
      })
      if (Number(res.code) !== 200) {
        throw new Error(res.message || '删除失败')
      }
      if (!this.pageActive) return
      this.customBgms = this.customBgms.filter((item) => String(item.id) !== String(id))
      showToast('success', '删除成功')
    } catch (error) {
      if (!this.pageActive) return
      console.error('上传音乐删除失败:', error)
      showToast('none', error.message || '删除失败')
    } finally {
      if (this.pageActive) {
        this.setData({ deletingBgmId: 0 })
        this.updateBgmListView()
      }
    }
  },

  goBack() {
    wx.navigateBack()
  }
})
