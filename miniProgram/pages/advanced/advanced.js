Page({
  data: {
    featureItems: [
      // {
      //   key: 'influencer',
      //   title: '网红主播',
      //   description: '网红主播语音合成',
      //   icon: 'manager-o',
      //   route: '../voiceSelect/voiceSelect'
      // },
      {
        key: 'ad-copy',
        title: '广告词制作',
        description: '自动生成广告词模板',
        icon: 'description-o',
        route: '../adCopy/adCopy'
      },
      {
        key: 'voice-convert',
        title: '音色转化',
        description: '个性化录音',
        icon: 'audio',
        route: '../voiceConvert/voiceConvert'
      },
      {
        key: 'dialogue',
        title: '对话配音',
        description: '多人对话语音合成',
        icon: 'chat-o',
        route: '../dialogueDubbing/dialogueDubbing'
      },
      {
        key: 'long-text',
        title: '长文本配音',
        description: '299字以上配音',
        icon: 'font-o',
        route: '../longTextDubbing/longTextDubbing'
      },
      {
        key: 'video-extract',
        title: '视频提取',
        description: '提取视频声音并进入音频页面',
        icon: 'video-o',
        route: '../videoExtract/videoExtract'
      }
    ]
  },

  openFeature(e) {
    const key = e.currentTarget.dataset.key
    const feature = this.data.featureItems.find((item) => item.key === key)
    if (!feature) return
    if (feature.route) {
      wx.navigateTo({ url: feature.route })
      return
    }
    wx.showToast({
      title: '该高级功能正在开发中',
      icon: 'none'
    })
  }
})
