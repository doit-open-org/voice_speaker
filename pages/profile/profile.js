const { request, showToast } = require('../../utils/request')

const API_ORIGIN = 'http://192.168.5.245:9000'
const AVATAR_UPLOAD_URL = `${API_ORIGIN}/api/v1/user/profile/avatar`

Page({
  data: {
    nickname: '微信用户',
    avatarUrl: '',
    nicknameDraft: '',
    editingNickname: false,
    loadingProfile: false,
    savingNickname: false,
    uploadingAvatar: false
  },

  onLoad() {
    return this.loadProfile()
  },

  normalizeAvatarUrl(url) {
    if (!url) return ''
    if (/^https?:\/\//i.test(url)) return url
    return `${API_ORIGIN}/${String(url).replace(/^\/+/, '')}`
  },

  applyProfile(profile = {}) {
    const nickname = profile.nickname || '微信用户'
    this.setData({
      nickname,
      nicknameDraft: nickname,
      avatarUrl: this.normalizeAvatarUrl(profile.avatar_url)
    })
  },

  async loadProfile() {
    if (this.data.loadingProfile) return
    this.setData({ loadingProfile: true })
    try {
      const response = await request({
        url: '/user/profile',
        method: 'GET',
        needAuth: true
      })
      if (Number(response.code) !== 200) throw new Error(response.message || '个人资料加载失败')
      this.applyProfile(response.data)
    } catch (error) {
      showToast('none', error.message || '个人资料加载失败')
    } finally {
      this.setData({ loadingProfile: false })
    }
  },

  openNicknameEditor() {
    this.setData({
      editingNickname: true,
      nicknameDraft: this.data.nickname
    })
  },

  cancelNicknameEdit() {
    this.setData({
      editingNickname: false,
      nicknameDraft: this.data.nickname
    })
  },

  onNicknameInput(e) {
    this.setData({ nicknameDraft: e.detail.value })
  },

  async saveNickname() {
    if (this.data.savingNickname) return
    const nickname = String(this.data.nicknameDraft || '').trim()
    if (!nickname) {
      showToast('none', '昵称不能为空')
      return
    }
    if (nickname.length > 255) {
      showToast('none', '昵称不能超过255个字符')
      return
    }

    this.setData({ savingNickname: true })
    try {
      const response = await request({
        url: '/user/profile/nickname',
        method: 'PUT',
        data: { nickname },
        needAuth: true
      })
      if (Number(response.code) !== 200) throw new Error(response.message || '昵称更新失败')
      this.applyProfile(response.data)
      this.setData({ editingNickname: false })
      showToast('success', '昵称已更新')
    } catch (error) {
      showToast('none', error.message || '昵称更新失败')
    } finally {
      this.setData({ savingNickname: false })
    }
  },

  chooseAvatar() {
    if (this.data.uploadingAvatar) return Promise.resolve(false)
    return new Promise((resolve) => {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed'],
        success: async (result) => {
          const filePath = result.tempFiles && result.tempFiles[0] && result.tempFiles[0].tempFilePath
          if (!filePath) {
            showToast('none', '未选择头像')
            resolve(false)
            return
          }

          this.setData({ uploadingAvatar: true })
          wx.showLoading({ title: '上传中...', mask: true })
          try {
            const response = await this.uploadAvatar(filePath)
            if (Number(response.code) !== 200) throw new Error(response.message || '头像更新失败')
            this.applyProfile(response.data)
            showToast('success', '头像已更新')
            resolve(true)
          } catch (error) {
            showToast('none', error.message || '头像更新失败')
            resolve(false)
          } finally {
            this.setData({ uploadingAvatar: false })
            wx.hideLoading()
          }
        },
        fail: (error) => {
          if (!String(error.errMsg || '').includes('cancel')) {
            showToast('none', '头像选择失败')
          }
          resolve(false)
        }
      })
    })
  },

  readAvatarFile(filePath) {
    return new Promise((resolve, reject) => {
      wx.getFileSystemManager().readFile({
        filePath,
        success: (result) => resolve(result.data),
        fail: () => reject(new Error('头像读取失败'))
      })
    })
  },

  encodeUtf8(text) {
    const bytes = []
    for (const character of String(text)) {
      const codePoint = character.codePointAt(0)
      if (codePoint <= 0x7f) {
        bytes.push(codePoint)
      } else if (codePoint <= 0x7ff) {
        bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f))
      } else if (codePoint <= 0xffff) {
        bytes.push(
          0xe0 | (codePoint >> 12),
          0x80 | ((codePoint >> 6) & 0x3f),
          0x80 | (codePoint & 0x3f)
        )
      } else {
        bytes.push(
          0xf0 | (codePoint >> 18),
          0x80 | ((codePoint >> 12) & 0x3f),
          0x80 | ((codePoint >> 6) & 0x3f),
          0x80 | (codePoint & 0x3f)
        )
      }
    }
    return Uint8Array.from(bytes)
  },

  concatBytes(parts) {
    const arrays = parts.map((part) => part instanceof Uint8Array ? part : new Uint8Array(part))
    const length = arrays.reduce((total, item) => total + item.byteLength, 0)
    const combined = new Uint8Array(length)
    let offset = 0
    arrays.forEach((item) => {
      combined.set(item, offset)
      offset += item.byteLength
    })
    return combined.buffer
  },

  avatarFileInfo(filePath) {
    const extensionMatch = String(filePath).split('?')[0].match(/\.([a-zA-Z0-9]+)$/)
    const extension = extensionMatch ? extensionMatch[1].toLowerCase() : 'jpg'
    const allowed = ['jpg', 'jpeg', 'png', 'gif', 'webp']
    const safeExtension = allowed.includes(extension) ? extension : 'jpg'
    const mimeExtension = safeExtension === 'jpg' ? 'jpeg' : safeExtension
    return {
      filename: `avatar.${safeExtension}`,
      mimeType: `image/${mimeExtension}`
    }
  },

  createAvatarMultipart(fileData, filePath) {
    const boundary = `----VoiceSpeakerAvatar${Date.now().toString(16)}`
    const fileInfo = this.avatarFileInfo(filePath)
    const header = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="avatar"; filename="${fileInfo.filename}"`,
      `Content-Type: ${fileInfo.mimeType}`,
      '',
      ''
    ].join('\r\n')
    const footer = `\r\n--${boundary}--\r\n`
    return {
      boundary,
      body: this.concatBytes([
        this.encodeUtf8(header),
        fileData,
        this.encodeUtf8(footer)
      ])
    }
  },

  sendAvatarRequest(body, boundary, token) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: AVATAR_UPLOAD_URL,
        method: 'PUT',
        data: body,
        header: {
          accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        },
        success: (result) => {
          if (result.statusCode < 200 || result.statusCode >= 300) {
            reject(new Error((result.data && result.data.message) || '头像更新失败'))
            return
          }
          try {
            resolve(typeof result.data === 'string' ? JSON.parse(result.data) : result.data)
          } catch (error) {
            reject(new Error('头像更新响应解析失败'))
          }
        },
        fail: () => reject(new Error('头像上传失败'))
      })
    })
  },

  async uploadAvatar(filePath) {
    const token = wx.getStorageSync('auth_token')
    if (!token) throw new Error('请先登录')
    const fileData = await this.readAvatarFile(filePath)
    const multipart = this.createAvatarMultipart(fileData, filePath)
    return this.sendAvatarRequest(multipart.body, multipart.boundary, token)
  }
})
