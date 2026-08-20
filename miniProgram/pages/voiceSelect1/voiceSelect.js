const { request, showToast } = require('../../utils/request')

const FAVORITES_KEY = 'favorites'
const VOICE_LEVEL_MAP = {
  1: { levelLabel: '金牌', levelClass: 'voiceLevel--gold' },
  2: { levelLabel: '银牌', levelClass: 'voiceLevel--silver' },
  3: { levelLabel: '铜牌', levelClass: 'voiceLevel--bronze' },
  gold: { levelLabel: '金牌', levelClass: 'voiceLevel--gold' },
  silver: { levelLabel: '银牌', levelClass: 'voiceLevel--silver' },
  bronze: { levelLabel: '铜牌', levelClass: 'voiceLevel--bronze' },
  normal: { levelLabel: '普通', levelClass: 'voiceLevel--normal' },
  金牌: { levelLabel: '金牌', levelClass: 'voiceLevel--gold' },
  银牌: { levelLabel: '银牌', levelClass: 'voiceLevel--silver' },
  铜牌: { levelLabel: '铜牌', levelClass: 'voiceLevel--bronze' }
}

function mapVoiceLevel(level) {
  const levelKey = String(level === undefined || level === null ? '' : level)
    .trim()
    .toLowerCase()
  return VOICE_LEVEL_MAP[levelKey] || { levelLabel: '', levelClass: '' }
}

Page({
  data: {
    voiceList: {},
    activeVoiceId: 0,
    hasVoiceList: false,
    emptyText: '主播加载中...',
    playingId: 0
  },

  onLoad() {
    this.pageActive = true
    this.baseVoiceList = { categories: [], voices: {} }
    this.favoriteVoices = []
    this.favoritePendingIds = {}
    this.favoriteListLoading = true
    this.eventChannel = this.getOpenerEventChannel()
    this.eventChannel.on('initVoiceSelect', ({ voiceList = {}, activeVoiceId = 0 } = {}) => {
      this.applyVoiceList(voiceList, activeVoiceId)
    })
    this.createAudio()
  },

  onReady() {
    if (!this.data.hasVoiceList) {
      this.getVoiceList()
    }
    this.getFavoriteList()
  },

  onHide() {
    this.pauseMusic()
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
      showToast('none', '主播试听失败')
    })
  },

  applyVoiceList(voiceList, activeVoiceId = 0) {
    const categories = Array.isArray(voiceList.categories) ? voiceList.categories : []
    const voices = voiceList.voices && typeof voiceList.voices === 'object'
      ? voiceList.voices
      : {}
    this.baseVoiceList = { ...voiceList, categories, voices }
    this.updateVoiceListView(activeVoiceId)
  },

  updateVoiceListView(activeVoiceId = this.data.activeVoiceId) {
    const baseVoiceList = this.baseVoiceList || { categories: [], voices: {} }
    const baseCategories = Array.isArray(baseVoiceList.categories)
      ? baseVoiceList.categories.filter((category) => category.key !== FAVORITES_KEY)
      : []
    const baseVoices = baseVoiceList.voices && typeof baseVoiceList.voices === 'object'
      ? baseVoiceList.voices
      : {}
    const favoriteVoices = Array.isArray(this.favoriteVoices) ? this.favoriteVoices : []
    const favoriteIds = new Set(favoriteVoices.map((voice) => String(voice.id)))
    const pendingIds = this.favoritePendingIds || {}
    const decorateVoice = (voice) => ({
      ...voice,
      ...mapVoiceLevel(voice.level),
      isFavorite: favoriteIds.has(String(voice.id)),
      favoritePending: this.favoriteListLoading || Boolean(pendingIds[String(voice.id)])
    })
    const voices = {}

    Object.keys(baseVoices).forEach((key) => {
      if (key !== FAVORITES_KEY && Array.isArray(baseVoices[key])) {
        voices[key] = baseVoices[key].map(decorateVoice)
      }
    })
    voices[FAVORITES_KEY] = favoriteVoices.map(decorateVoice)

    const categories = [
      { key: FAVORITES_KEY, name: '我的收藏' },
      ...baseCategories
    ]
    this.setData({
      voiceList: { ...baseVoiceList, categories, voices },
      activeVoiceId,
      hasVoiceList: baseCategories.length > 0 || favoriteVoices.length > 0,
      emptyText: baseCategories.length > 0 || favoriteVoices.length > 0 ? '' : '暂无主播'
    })
  },

  async getFavoriteList() {
    this.favoriteListLoading = true
    this.updateVoiceListView()
    try {
      const res = await request({
        url: '/user/voices/favorites/list',
        method: 'GET',
        needAuth: true
      })
      if (Number(res.code) !== 200) {
        throw new Error(res.message || 'Favorite list request failed')
      }
      if (!this.pageActive) return
      this.favoriteVoices = Array.isArray(res.data) ? res.data : []
    } catch (error) {
      if (!this.pageActive) return
      console.error('获取收藏列表失败:', error)
      this.favoriteVoices = []
      showToast('error', '收藏列表加载失败')
    } finally {
      this.favoriteListLoading = false
      if (this.pageActive) this.updateVoiceListView()
    }
  },

  async toggleFavorite(e) {
    const id = e.detail.id
    const idKey = String(id)
    if (this.favoriteListLoading || this.favoritePendingIds[idKey]) return

    const voice = this.findVoiceById(id)
    if (!voice) return

    const wasFavorite = this.favoriteVoices.some((item) => String(item.id) === idKey)
    this.favoritePendingIds[idKey] = true
    this.updateVoiceListView()

    try {
      const res = await request({
        url: '/user/voices/favorite',
        method: wasFavorite ? 'DELETE' : 'POST',
        data: { id: Number(id) },
        needAuth: true
      })
      if (!this.pageActive) return
      if (Number(res.code) !== 200) {
        showToast('error', wasFavorite ? '取消收藏失败' : '收藏失败')
        return
      }

      if (wasFavorite) {
        this.favoriteVoices = this.favoriteVoices.filter((item) => String(item.id) !== idKey)
      } else {
        const { isFavorite, favoritePending, ...favoriteVoice } = voice
        this.favoriteVoices = [...this.favoriteVoices, favoriteVoice]
      }
      this.updateVoiceListView()
    } catch (error) {
      if (!this.pageActive) return
      console.error(wasFavorite ? '取消收藏失败:' : '收藏失败:', error)
      showToast('error', wasFavorite ? '取消收藏失败' : '收藏失败')
    } finally {
      delete this.favoritePendingIds[idKey]
      if (this.pageActive) this.updateVoiceListView()
    }
  },

  async getVoiceList() {
    try {
      const res = await request({
        url: '/user/voices/categories',
        method: 'GET',
        needAuth: true
      })
      if (Number(res.code) === 200) {
        this.applyVoiceList(res.data, this.data.activeVoiceId)
      } else {
        this.setData({ emptyText: '暂无主播' })
        showToast('error', '音色列表拉取失败')
      }
    } catch (error) {
      console.error('获取主播列表失败:', error)
      this.setData({ emptyText: '暂无主播' })
      showToast('error', '音色列表拉取失败')
    }
  },

  findVoiceById(id) {
    const voices = this.data.voiceList.voices || {}
    for (const key in voices) {
      const voice = Array.isArray(voices[key])
        ? voices[key].find((item) => item.id == id)
        : null
      if (voice) return voice
    }
    return null
  },

  normalizeAudioUrl(audioPath) {
    if (!audioPath) return ''
    return /^https?:\/\//.test(audioPath) ? audioPath : `https://${audioPath}`
  },

  playVoice(e) {
    const id = e.detail.id
    const voice = this.findVoiceById(id)
    if (!voice || !voice.audio_path) {
      showToast('none', '主播试听失败')
      return
    }
    this.setData({ playingId: id })
    this.innerAudioContext.src = this.normalizeAudioUrl(voice.audio_path)
    this.innerAudioContext.play()
  },

  pauseMusic() {
    if (this.innerAudioContext) {
      this.innerAudioContext.pause()
    } else {
      this.resetPlaying()
    }
  },

  resetPlaying() {
    this.setData({ playingId: 0 })
    const voiceList = this.selectComponent('#voiceListCom')
    if (voiceList) voiceList.setData({ palyId: 0 })
  },

  chooseVoice(e) {
    const voice = this.findVoiceById(e.detail.id)
    if (!voice) return
    this.eventChannel.emit('voiceSelected', voice)
    wx.navigateBack()
  },

  goBack() {
    wx.navigateBack()
  }
})
