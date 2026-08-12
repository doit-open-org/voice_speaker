const { request, showToast } = require('../../utils/request')
const app = getApp()
const MAX_INPUT_LENGTH = 299

const DEFAULT_VOICES = [
  { voice_name: '艾琳', voice_id: 'zh_female_shuangkuaisisi_moon_bigtts', headImg: 'streamer1.jpg' },
  { voice_name: '泽云', voice_id: 'zh_male_wenrouxiaoge_mars_bigtts', headImg: 'streamer2.jpg' },
  { voice_name: '瑶光', voice_id: 'zh_female_linzhiling_mars_bigtts', headImg: 'streamer3.jpg' },
  { voice_name: '凌声', voice_id: 'zh_male_hupunan_mars_bigtts', headImg: 'streamer4.jpg' }
]

Page({
  data: {
    dialogueList: [],
    playingDialogueId: '',
    inputText: '',
    textDraft: '',
    textEditorVisible: false,
    editorKeyboardHeight: 0,
    cursorPosition: 0,
    voiceList: [
      // {
      //   "id": 10,
      //   "voice_id": "en_male_alex_uranus_bigtts",
      //   "voice_name": "Alex",
      //   "icon": "https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_hz_ihsph/ljhwZthlaukjlkulzlp/portal/bigtts/avatar/Alex_en_male_alex_uranus_bigtts.png",
      //   "audio_path": null,
      //   "language": "en-US",
      //   "level": "normal",
      //   "description": "American English male",
      //   "is_favorite": false
      // }
    ],
    voiceIndex: 0,
    voiceCheckInfo: {},
    voiceMoreList: {},
    speed: 1,
    yxVoice: 2,
    musicSetShow: false,
    stopShow: false,
    stopVal: '1.0',
    bgmSetPop: false,
    bgmList: {},
    activeBgmInfo: {},
    bgmSetDetail: {},
    generating: false,
    merging: false
  },

  onLoad() {
    this.pageActive = true
    this.downloadTasks = []
    this.createAudio()
    this.createVoicePreviewAudio()
    const requests = []
    const voiceCatalog = wx.getStorageSync('voiceList')
    const bgmCatalog = wx.getStorageSync('bgmList')

    if (voiceCatalog && typeof voiceCatalog === 'object') {
      this.handleVoiceList(voiceCatalog)
    } else {
      requests.push(this.getVoiceList())
    }
    if (bgmCatalog && typeof bgmCatalog === 'object') {
      this.handleBgmList(bgmCatalog)
    } else {
      requests.push(this.getBgmList())
    }
    return Promise.all(requests)
  },

  onHide() {
    this.pauseDialogue()
    this.stopVoicePreview()
  },

  onUnload() {
    this.pageActive = false
    if (this.data.generating || this.data.merging) wx.hideLoading()
    ;(this.downloadTasks || []).forEach((task) => {
      if (task && task.abort) task.abort()
    })
    this.downloadTasks = []
    if (this.innerAudioContext) {
      this.innerAudioContext.destroy()
      this.innerAudioContext = null
    }
    this.destroyVoicePreviewAudio()
  },

  createAudio() {
    this.innerAudioContext = wx.createInnerAudioContext()
    this.innerAudioContext.onPause(() => this.resetPlaying())
    this.innerAudioContext.onEnded(() => this.resetPlaying())
    this.innerAudioContext.onError(() => {
      if (!this.pageActive || !this.data.playingDialogueId) return
      const audio = this.innerAudioContext
      if (audio) audio.stop()
      this.resetPlaying()
      showToast('none', '对话音频播放失败')
    })
  },

  resetPlaying() {
    if (this.pageActive) this.setData({ playingDialogueId: '' })
  },

  pauseDialogue() {
    if (!this.data.playingDialogueId) return
    if (this.innerAudioContext) this.innerAudioContext.pause()
  },

  async getVoiceList() {
    try {
      const res = await request({
        url: '/user/voices/categories',
        method: 'GET',
        needAuth: true
      })
      if (Number(res.code) === 200 && this.pageActive) {
        this.handleVoiceList(res.data)
        wx.setStorageSync('voiceList', res.data)
      }
    } catch (error) {
      if (!this.pageActive) return
      console.error('获取主播列表失败:', error)
      showToast('none', '主播列表加载失败')
    }
  },

  async getBgmList() {
    try {
      const res = await request({
        url: '/user/bgms/categories',
        method: 'GET',
        needAuth: true
      })
      if (Number(res.code) === 200 && this.pageActive) {
        this.handleBgmList(res.data)
        wx.setStorageSync('bgmList', res.data)
      }
    } catch (error) {
      if (!this.pageActive) return
      console.error('获取背景音乐列表失败:', error)
      showToast('none', '背景音乐加载失败')
    }
  },

  handleVoiceList(data) {
    const voiceCatalog = data || {}
    const homeVoices = Array.isArray(voiceCatalog.home) ? voiceCatalog.home : []
    this.setData({
      voiceMoreList: voiceCatalog,
      voiceList: homeVoices,
      voiceCheckInfo: homeVoices[0]
    })
  },

  handleBgmList(data) {
    this.setData({ bgmList: data || {} })
  },

  openTextEditor() {
    const textDraft = String(this.data.inputText || '').slice(0, MAX_INPUT_LENGTH)
    this.setData({
      textDraft,
      cursorPosition: textDraft.length,
      textEditorVisible: true,
      editorKeyboardHeight: 0
    })
  },

  onTextDraftInput(e) {
    const textDraft = String(e.detail.value || '').slice(0, MAX_INPUT_LENGTH)
    const cursorPosition = e.detail.cursor === undefined
      ? textDraft.length
      : Math.min(Number(e.detail.cursor) || 0, textDraft.length)
    this.setData({
      textDraft,
      cursorPosition
    })
  },

  onEditorKeyboardHeightChange(e) {
    const editorKeyboardHeight = Math.max(0, Number(e.detail.height) || 0)
    if (editorKeyboardHeight === this.data.editorKeyboardHeight) return
    this.setData({ editorKeyboardHeight })
  },

  //获取光标位置
  cursorPosition(e) {
    console.log('光标位置1:', e.detail.cursor);
    if(e.detail.cursor != undefined){
      this.setData({  cursorPosition: e.detail.cursor  });
    }
  },

  closeTextEditor() {
    this.setData({
      inputText: this.data.textDraft,
      textEditorVisible: false,
      editorKeyboardHeight: 0
    })
  },

  clearTextDraft() {
    this.setData({ textDraft: '', cursorPosition: 0 })
  },

  noop() {},

  openTemplate() {
    wx.navigateTo({
      url: '../commonTemplate/commonTemplate',
      events: {
        templateSelected: ({ content = '' } = {}) => {
          const inputText = String(content).slice(0, MAX_INPUT_LENGTH)
          this.setData({
            inputText,
            textDraft: inputText,
            cursorPosition: inputText.length
          })
        }
      }
    })
  },

  stopSet() {
    this.setData({ stopShow: !this.data.stopShow })
  },

  stopSliderChange(e) {
    this.setData({ stopVal: Number(e.detail.value).toFixed(1) })
  },

  stopPopConfirm() {
    const inputText = this.data.inputText || ''
    const cursor = Math.max(0, Math.min(Number(this.data.cursorPosition) || 0, inputText.length))
    const pauseMs = Math.round(Number(this.data.stopVal) * 1000)
    const nextText = `${inputText.slice(0, cursor)}[停顿${pauseMs}ms]${inputText.slice(cursor)}`
    this.setData({
      inputText: nextText,
      textDraft: nextText,
      cursorPosition: cursor + `[停顿${pauseMs}ms]`.length,
      stopShow: false
    })
  },

  convertPauseToBreak(text) {
    return String(text || '').replace(/\[停顿(\d+)ms\]/g, (match, ms) => {
      return `<break time="${(Number(ms) / 1000).toFixed(1)}s"></break>`
    })
  },

  musicSet() {
    this.setData({ musicSetShow: !this.data.musicSetShow })
  },

  musicSliderChange(e) {
    this.setData({ speed: Number(Number(e.detail.value).toFixed(1)) })
  },

  voiceSliderChange(e) {
    this.setData({ yxVoice: Number(Number(e.detail.value).toFixed(1)) })
  },

  musicPopConfirm() {
    this.setData({ musicSetShow: false })
  },
  musicPopReset(){
    this.setData({
      yxVoice: 2,
      speed: 1
    })
  },

  changeStreamer(e) {
    const voiceIndex = Number(e.currentTarget.id)
    const voiceCheckInfo = this.data.voiceList[voiceIndex]
    if (!voiceCheckInfo) return
    this.setData({ voiceIndex, voiceCheckInfo })
    this.playVoicePreview(voiceCheckInfo)
  },

  createVoicePreviewAudio() {
    this.voicePreviewAudioContext = wx.createInnerAudioContext()
    this.voicePreviewAudioContext.onError(() => {
      this.stopVoicePreview()
      if (this.pageActive){
        // showToast('none', '音色试听失败')
      }
    })
  },

  playVoicePreview(voice) {
    this.stopVoicePreview()
    if (!voice || !voice.audio_path || !this.voicePreviewAudioContext) return
    this.voicePreviewAudioContext.src = this.normalizeAudioUrl(voice.audio_path)
    this.voicePreviewAudioContext.play()
  },

  stopVoicePreview() {
    if (this.voicePreviewAudioContext) this.voicePreviewAudioContext.stop()
  },

  destroyVoicePreviewAudio() {
    if (!this.voicePreviewAudioContext) return
    this.voicePreviewAudioContext.stop()
    this.voicePreviewAudioContext.destroy()
    this.voicePreviewAudioContext = null
  },

  moreVoice() {
    wx.navigateTo({
      url: '../voiceSelect/voiceSelect',
      events: {
        voiceSelected: (voice) => this.setData({ voiceIndex: -1, voiceCheckInfo: voice })
      },
      success: (res) => {
        res.eventChannel.emit('initVoiceSelect', {
          voiceList: this.data.voiceMoreList,
          activeVoiceId: this.data.voiceCheckInfo.id || 0
        })
      }
    })
  },

  bgmPop() {
    this.setData({ bgmSetPop: !this.data.bgmSetPop })
  },

  showBgmList() {
    wx.navigateTo({
      url: '../bgmSelect/bgmSelect',
      events: {
        bgmSelected: (bgm) => this.setData({ activeBgmInfo: bgm || {} })
      },
      success: (res) => {
        res.eventChannel.emit('initBgmSelect', {
          bgmList: this.data.bgmList,
          activeBgmId: this.data.activeBgmInfo.id || 0
        })
      }
    })
  },

  resetBgm() {
    this.setData({ activeBgmInfo: {}, bgmSetDetail: {} })
  },

  bmgSetConfirm(e) {
    this.setData({ bgmSetDetail: { ...e.detail }, bgmSetPop: false })
  },

  resolveVoiceAvatar(voice = {}) {
    const avatar = voice.avatar_url || voice.avatar || voice.headImg || ''
    if (!avatar) return '/img/streamer1.jpg'
    if (/^https?:\/\//i.test(avatar) || avatar.startsWith('/')) return avatar
    return `/img/${avatar}`
  },

  normalizeAudioUrl(audioUrl) {
    if (!audioUrl) return ''
    return /^https?:\/\//i.test(audioUrl) ? audioUrl : `https://${audioUrl}`
  },

  async generateDialogue() {
    if (this.data.generating || this.data.merging) return
    const sourceText = String(this.data.inputText || '').trim()
    if (!sourceText) {
      showToast('none', '请输入对话文字')
      return
    }
    const voice = this.data.voiceCheckInfo || {}
    if (!voice.voice_id) {
      showToast('none', '请选择主播')
      return
    }
    console.log('vvv...',voice.voice_id);
    this.setData({ generating: true })
    wx.showLoading({ title: '生成中...', mask: true })
    try {
      let data = {
        text: `<speak>${this.convertPauseToBreak(sourceText)}</speak>`,
        voice_id: voice.voice_id,
        speed_ratio: this.data.speed,
        volume_ratio: this.data.yxVoice,
        pitch_ratio: 1
      }
      const bgmSetDetail = this.data.bgmSetDetail || {}
      if (bgmSetDetail.bgm_id !== undefined && Number(bgmSetDetail.bgm_id) !== 0) {
        data = { ...data, ...bgmSetDetail }
      }
      const res = await request({
        url: '/user/tts/synthesize',
        method: 'POST',
        data,
        needAuth: true
      })
      if (Number(res.code) !== 200 || !res.data || !res.data.audio_url) {
        throw new Error(res.message || '对话生成失败')
      }
      if (!this.pageActive) return

      this.dialogueSequence = (this.dialogueSequence || 0) + 1
      const dialogue = {
        ...res.data,
        localId: `${Date.now()}-${this.dialogueSequence}`,
        text: sourceText,
        audio_url: this.normalizeAudioUrl(res.data.audio_url),
        voiceName: voice.voice_name || voice.name || '主播',
        avatar: this.resolveVoiceAvatar(voice)
      }
      this.setData({ dialogueList: [...this.data.dialogueList, dialogue] })
    } catch (error) {
      if (!this.pageActive) return
      console.error('生成对话失败:', error)
      showToast('none', error.message || '对话生成失败')
    } finally {
      if (this.pageActive) {
        this.setData({ generating: false })
        wx.hideLoading()
      }
    }
  },

  playDialogue(e) {
    const localId = String(e.currentTarget.dataset.id)
    const dialogue = this.data.dialogueList.find((item) => String(item.localId) === localId)
    if (!dialogue || !dialogue.audio_url) {
      showToast('none', '对话音频播放失败')
      return
    }
    if (String(this.data.playingDialogueId) === localId) {
      this.pauseDialogue()
      return
    }
    if (this.data.playingDialogueId) this.innerAudioContext.stop()
    this.setData({ playingDialogueId: dialogue.localId })
    this.innerAudioContext.src = this.normalizeAudioUrl(dialogue.audio_url)
    this.innerAudioContext.play()
  },

  deleteDialogue(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (index < 0 || index >= this.data.dialogueList.length) return
    const dialogue = this.data.dialogueList[index]
    if (dialogue && String(dialogue.localId) === String(this.data.playingDialogueId)) {
      this.innerAudioContext.stop()
      this.resetPlaying()
    }
    const dialogueList = this.data.dialogueList.filter((item, itemIndex) => itemIndex !== index)
    this.setData({ dialogueList })
  },

  moveDialogue(e) {
    const index = Number(e.currentTarget.dataset.index)
    const direction = Number(e.currentTarget.dataset.direction)
    const targetIndex = index + direction
    if (index < 0 || index >= this.data.dialogueList.length) return
    if (targetIndex < 0 || targetIndex >= this.data.dialogueList.length) return

    const dialogueList = [...this.data.dialogueList]
    const current = dialogueList[index]
    dialogueList[index] = dialogueList[targetIndex]
    dialogueList[targetIndex] = current
    this.setData({ dialogueList })
  },

  downloadDialogueAudio(audioUrl) {
    return new Promise((resolve, reject) => {
      const task = wx.downloadFile({
        url: this.normalizeAudioUrl(audioUrl),
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath) {
            resolve(res.tempFilePath)
          } else {
            reject(new Error('音频下载失败'))
          }
        },
        fail: () => reject(new Error('音频下载失败'))
      })
      if (task) this.downloadTasks.push(task)
    })
  },

  readAudioFile(filePath) {
    return new Promise((resolve, reject) => {
      wx.getFileSystemManager().readFile({
        filePath,
        success: (res) => resolve(res.data),
        fail: () => reject(new Error('音频读取失败'))
      })
    })
  },

  asciiBytes(text) {
    const value = String(text)
    const bytes = new Uint8Array(value.length)
    for (let index = 0; index < value.length; index += 1) {
      bytes[index] = value.charCodeAt(index)
    }
    return bytes
  },

  concatBytes(chunks) {
    const totalLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    chunks.forEach((chunk) => {
      result.set(chunk, offset)
      offset += chunk.byteLength
    })
    return result.buffer
  },

  buildMergeMultipart(audioFiles, fields) {
    const boundary = `----WechatDialogue${Date.now()}`
    const chunks = []
    Object.keys(fields).forEach((name) => {
      const value = fields[name]
      if (value === undefined || value === null || value === '') return
      chunks.push(this.asciiBytes(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
        `${value}\r\n`
      ))
    })
    audioFiles.forEach((audioData, index) => {
      chunks.push(this.asciiBytes(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="audio_files"; filename="dialogue-${index + 1}.mp3"\r\n` +
        'Content-Type: audio/mpeg\r\n\r\n'
      ))
      chunks.push(new Uint8Array(audioData))
      chunks.push(this.asciiBytes('\r\n'))
    })
    chunks.push(this.asciiBytes(`--${boundary}--\r\n`))
    return { boundary, data: this.concatBytes(chunks) }
  },

  async mergeDialogues() {
    if (this.data.merging || this.data.generating) return
    const dialogueList = [...this.data.dialogueList]
    if (!dialogueList.length) {
      showToast('none', '请先生成对话')
      return
    }

    this.setData({ merging: true })
    wx.showLoading({ title: '合成中...', mask: true })
    try {
      const audioFiles = []
      for (const dialogue of dialogueList) {
        const filePath = await this.downloadDialogueAudio(dialogue.audio_url)
        audioFiles.push(await this.readAudioFile(filePath))
      }

      const fields = {
        speed_ratio: 1,
        volume_ratio: 1
      }
      const bgmSetDetail = this.data.bgmSetDetail || {}
      if (bgmSetDetail.bgm_id !== undefined && Number(bgmSetDetail.bgm_id) !== 0) {
        Object.assign(fields, bgmSetDetail)
      }
      const multipart = this.buildMergeMultipart(audioFiles, fields)
      const res = await request({
        url: '/user/tts/merge-audio',
        method: 'POST',
        data: multipart.data,
        header: {
          'Content-Type': `multipart/form-data; boundary=${multipart.boundary}`
        },
        needAuth: true
      })
      if (Number(res.code) !== 200 || !res.data || !res.data.audio_url) {
        throw new Error(res.message || '对话合成失败')
      }
      if (!this.pageActive) return

      app.globalData.generate = {
        ...res.data,
        audio_url: this.normalizeAudioUrl(res.data.audio_url)
      }
      wx.navigateTo({ url: '../generate/generate' })
    } catch (error) {
      if (!this.pageActive) return
      console.error('合并对话音频失败:', error)
      showToast('none', error.message || '对话合成失败')
    } finally {
      this.downloadTasks = []
      if (this.pageActive) {
        this.setData({ merging: false })
        wx.hideLoading()
      }
    }
  }
})
