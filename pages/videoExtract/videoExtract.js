const app = getApp()
const API_ORIGIN = 'http://192.168.5.245:9000'
const API_BASE_URL = `${API_ORIGIN}/api/v1`
const MAX_VIDEO_DURATION = 360

Page({
  data: {
    processing: false,
    progress: 0
  },

  onLoad() {
    this.pageActive = true
  },

  onUnload() {
    this.pageActive = false
    if (this.uploadTask && this.uploadTask.abort) this.uploadTask.abort()
    this.uploadTask = null
  },

  chooseChatVideo() {
    return new Promise((resolve, reject) => {
      wx.chooseMessageFile({
        count: 1,
        type: 'video',
        success: (result) => resolve(result.tempFiles && result.tempFiles[0]),
        fail: reject
      })
    })
  },

  isCancelled(error) {
    return /cancel/i.test(String((error && (error.errMsg || error.message)) || ''))
  },

  parseUploadResponse(response) {
    let result
    try {
      result = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
    } catch (error) {
      throw new Error('视频转换失败')
    }
    const downloadPath = result && result.data && result.data.download_path
    if (
      response.statusCode < 200 || response.statusCode >= 300 ||
      Number(result && result.code) !== 200 || !downloadPath
    ) {
      throw new Error((result && result.message) || '视频转换失败')
    }
    return String(downloadPath)
  },

  normalizeAudioUrl(downloadPath) {
    if (/^https?:\/\//i.test(downloadPath)) return downloadPath
    if (downloadPath.startsWith('/')) return `${API_ORIGIN}${downloadPath}`
    return `${API_BASE_URL}/${downloadPath}`
  },

  getAudioFileName(downloadPath) {
    const fileName = String(downloadPath).split('?')[0].split('/').pop()
    return fileName || 'video-audio.mp3'
  },

  getVideoDurationSeconds(filePath) {
    return new Promise((resolve) => {
      if (!wx.getVideoInfo) {
        resolve(0)
        return
      }
      wx.getVideoInfo({
        src: filePath,
        success: (result) => {
          const duration = Number(result.duration)
          resolve(Number.isFinite(duration) && duration > 0 ? duration : 0)
        },
        fail: () => resolve(0)
      })
    })
  },

  uploadVideo(filePath) {
    return new Promise((resolve, reject) => {
      const task = wx.uploadFile({
        url: `${API_BASE_URL}/video2mp3`,
        filePath,
        name: 'file',
        success: (response) => {
          try {
            resolve(this.parseUploadResponse(response))
          } catch (error) {
            reject(error)
          }
        },
        fail: () => reject(new Error('视频转换失败'))
      })
      this.uploadTask = task
      if (task && task.onProgressUpdate) {
        task.onProgressUpdate((result) => {
          if (!this.pageActive || !this.data.processing) return
          const progress = Math.max(0, Math.min(99, Math.round(Number(result.progress) || 0)))
          this.setData({ progress })
        })
      }
    })
  },

  async extractVideo() {
    if (this.data.processing) return
    let file
    try {
      file = await this.chooseChatVideo()
    } catch (error) {
      if (!this.isCancelled(error)) {
        wx.showToast({ title: '选择视频失败', icon: 'none' })
      }
      return
    }
    const filePath = file && (file.path || file.tempFilePath)
    if (!filePath) return
    const duration = await this.getVideoDurationSeconds(filePath)
    if (!this.pageActive) return
    if (duration > MAX_VIDEO_DURATION) {
      wx.showToast({ title: '视频时长不能超过6分钟', icon: 'none' })
      return
    }

    this.setData({ processing: true, progress: 0 })
    try {
      const downloadPath = await this.uploadVideo(filePath)
      if (!this.pageActive) return
      const audioUrl = this.normalizeAudioUrl(downloadPath)
      app.globalData.generate = {
        ...(app.globalData.generate || {}),
        audio_url: audioUrl,
        file_name: this.getAudioFileName(downloadPath)
      }
      this.setData({ progress: 100 })
      wx.redirectTo({ url: '../generate/generate' })
    } catch (error) {
      if (!this.pageActive) return
      console.error('视频提取失败:', error)
      wx.showToast({ title: error.message || '视频提取失败', icon: 'none' })
    } finally {
      this.uploadTask = null
      if (this.pageActive) this.setData({ processing: false })
    }
  }
})
