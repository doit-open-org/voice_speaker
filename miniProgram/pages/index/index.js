// pages/tts/tts.js
const app = getApp()
const { request, checkLogin, showToast } = require('../../utils/request')
const { buildBgmPayload, hasBgmSelection } = require('../../utils/bgm')
const share = require('../../utils/share')
const MAX_INPUT_LENGTH = 299
Page({
  data: {
    // bannerImages: ['/img/yinxiang.png', '/img/yinxiang1.png', '/img/yinxiang2.png'],
    // bannerImagesTxt:[
    //   "不想让孩子总盯着屏幕？我们做了这款音箱让孩子多听、少看",
    //   "古诗、单词、故事一键走进音箱上学路上放着听不用一键可屏蔽",
    //   "37万首诗词小学全科同步免费使用、无广告不套路，用起来更安心",
    // ],
    inputText: '',
    voiceIndex: 0,
    voiceList: [
      // { voice_name: '艾琳', voice_id: 'zh_female_shuangkuaisisi_moon_bigtts',headImg:'streamer1.jpg'},
      // { voice_name: '泽云', voice_id: 'zh_male_wenrouxiaoge_mars_bigtts' ,headImg:'streamer2.jpg'},
      // { voice_name: '瑶光', voice_id: 'zh_female_linzhiling_mars_bigtts' ,headImg:'streamer3.jpg'},
      // { voice_name: '凌声', voice_id: 'zh_male_hupunan_mars_bigtts' ,headImg:'streamer4.jpg'},
      // { voice_name: '希雅', voice_id: 'ICL_zh_female_wenrouwenya_tob' ,headImg:'streamer5.jpg'}
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
    //选中的音色信息
    voiceCheckInfo:{},
    voiceMoreList:{}, //拉取接口的音色
    speed: 1.0, //音效语速
    yxVoice: 2.0, //音效音量
    tabIndex: 1,
    musicSetShow: false,
    stopShow: false,
    stopVal: '1.0',
    deviceInfo: [],
    bgmSetPop: false, //背景音乐设置
    bgmList:{}, //背景音乐列表
    activeBgmInfo: {}, //选中的背景音乐
    bgmSetDetail: {}, //背景音乐设置明细
    dingdongFlag: false, //叮咚标志

    // 顶部绿条里轮播的四博学习宝功能点。
    // 一条一句、都能独立看懂——用户扫到哪条就是哪条，不能指望他看完四条。
    // 顺序有讲究：先说它是干什么的，再给量，最后放最有说服力的那句。
    // 「免费，无广告，不卖课」放在最后，是因为它最容易让人愿意点进去。
    xxbPoints: [
      '37 万首诗词、210 篇故事',
      '小学全科同步 2166 节课',
      '一键装进去，路上离线听',
      '免费，无广告，不卖课'
    ],
  },

 async onLoad () {
    this.applyPendingVoiceText()
    this.createVoicePreviewAudio()
    // 下面函数仅执行一次
    if(app.globalData.onlyOnce){ return }
    app.globalData.onlyOnce = true;
    //检查login
    await checkLogin();
    // 拉取音色列表
    this.getVoiceList()
    // 拉取bgm列表
    this.getBgmList()
    // 检查是否有缓存设备
    this.checkExistDev()
  },

  applyPendingVoiceText() {
    const pendingVoiceText = app.globalData.pendingVoiceText
    if (typeof pendingVoiceText !== 'string' || !pendingVoiceText) return
    this.setData({ inputText: pendingVoiceText })
    app.globalData.pendingVoiceText = ''
  },
 
  onShow(){
    this.createVoicePreviewAudio()
    this.refreshHomeData()
  },

  refreshHomeData(preferredVoice) {
    this.data.deviceInfo = app.globalData.deviceInfo
    wx.getStorage({
      key: 'voiceList',
      success: (res) => {
        this.handleVoiceList(res.data, preferredVoice)
      }
    })
    wx.getStorage({
      key: 'bgmList',
      success: (res) => {
        this.setData({ bgmList: res.data})
      }
    })
    
    console.log("1223....................")
  },

  onHide() {
    this.destroyVoicePreviewAudio()
  },

  onUnload() {
    this.destroyVoicePreviewAudio()
  },

  async getVoiceList(){
    try {
      const res = await request({
        url: '/user/voices/categories',
        method: 'GET',
        needAuth: true
      })
      if(res.code == 200){
        console.log('音色列表:', res.data)
        console.log('home...:', res.data.home)
        this.handleVoiceList(res.data)
        //把结果缓存起来
        wx.setStorageSync('voiceList', res.data)
      }else{
        showToast('error','音色列表拉取失败')
      }
    } catch (err) {
      console.error('获取失败:', err)
      showToast('error','音色列表拉取失败')
    } 
  },
  handleVoiceList(data, preferredVoice){
    const voiceCatalog = data || {}
    const homeVoices = Array.isArray(voiceCatalog.home)
      ? voiceCatalog.home
      : []
    const selectedMoreVoice = preferredVoice || (
      this.data.voiceIndex === -1 && this.data.voiceCheckInfo.voice_id
        ? this.data.voiceCheckInfo
        : null
    )
    this.setData({
      voiceMoreList: voiceCatalog,
      voiceList: homeVoices,
      voiceIndex: selectedMoreVoice ? -1 : 0,
      voiceCheckInfo: selectedMoreVoice || homeVoices[0],
    })
  },
  async getBgmList(){
    try {
      const res = await request({
        url: '/user/bgms/categories',
        method: 'GET',
        needAuth: true
      })
      if(res.code == 200){
        console.log('背景音乐列表:', res.data)
        this.setData({ bgmList: res.data })
        //把结果缓存起来
        wx.setStorageSync('bgmList', res.data)
      }else{
        showToast('error','背景音乐拉取失败')
      }
    } catch (err) {
      console.error('获取失败:', err)
      showToast('error','背景音乐拉取失败')
    }
  },

  /**
   * 检查是否连接过设备，如果连接了就重连
   */
  checkExistDev(){
    let dev = wx.getStorageSync('sbpyb2025')
    const cachedDevices = wx.getStorageSync('sbpyb2025_devices')
    if((!dev || !dev.deviceId) && Array.isArray(cachedDevices) && cachedDevices.length){
      dev = cachedDevices[0]
      wx.setStorageSync('sbpyb2025', dev)
    }
    console.log("d0.........",dev)
    // dev = {"deviceId":'123',"name":'配音宝'}
    app.globalData.reConDevInfo = dev
    if(dev && dev.deviceId){
      wx.redirectTo({  url: '../device/device?dev=1' })
    }
  },
  jumpAdCopy(){
    wx.navigateTo({
      url: '../adCopy/adCopy',
    })
  },
  onTextInput(e) {
    const inputText = String(e.detail.value || '').slice(0, MAX_INPUT_LENGTH)
    const cursorPosition = e.detail.cursor === undefined
      ? inputText.length
      : Math.min(Number(e.detail.cursor) || 0, inputText.length)
    this.setData({
      inputText,
      cursorPosition
    })
    console.log("122....................",this.data.inputText)
    
  },
  //获取光标位置
  cursorPosition(e) {
    console.log('光标位置1:', e.detail.cursor);
    if(e.detail.cursor != undefined){
      this.setData({  cursorPosition: e.detail.cursor  });
    }
  },

  clearText(){
    this.setData({
      inputText: '',
      cursorPosition: 0
    })
  },

  /**
   * 跳到四博学习宝（另一个小程序）。
   *
   * 两处以前是坏的：
   *   1. app.json 里没有 navigateToMiniProgramAppIdList，微信直接拒绝，
   *      报 "appId is not in navigateToMiniProgramAppIdList"。已补上白名单。
   *   2. fail 是个空函数——跳不过去时用户什么反馈都没有，
   *      只会觉得「这个按钮点了没反应」。现在失败要说话。
   *
   * 用户主动取消（cancel）不算失败，别去打扰他。
   */
  jumpXxmini(){
    wx.navigateToMiniProgram({
      appId: 'wx7fa7b99ba9bd3ba7',
      envVersion: 'release',
      fail: (res) => {
        const msg = String((res && res.errMsg) || '')
        if (/cancel/i.test(msg)) return          // 他自己取消的，不用提示
        console.warn('[index] 跳转四博学习宝失败', msg)
        wx.showToast({
          title: '打不开四博学习宝，可以在微信里搜一下',
          icon: 'none',
          duration: 2500
        })
      }
    })
  },

  musicSet(){
    this.setData({  musicSetShow: !this.data.musicSetShow   })
  },
  
  stopSet(){
    if (!this.data.stopShow) {
      const insertStr = this.buildStopText(this.data.stopVal)
      if (!this.canInsertText(insertStr)) return
    }
    this.setData({  stopShow: !this.data.stopShow   })
  },

  musicSliderChange(e){
    let v = Number((e.detail.value).toFixed(1));
    this.setData({speed: v})
  },
  voiceSliderChange(e){
    let v = Number((e.detail.value).toFixed(1));
    this.setData({yxVoice: v})
  },
  
  musicPopConfirm(){
    this.musicSet();
    console.log(this.data.speed)
  },
  musicPopReset(){
    this.setData({
      yxVoice: 2,
      speed: 1
    })
  },
  stopSliderChange(e){
    let v = Number((e.detail.value).toFixed(1));
    this.setData({stopVal: v})
  },

  stopPopConfirm(){
    let {cursorPosition,stopVal,inputText} = this.data
    console.log('p...',cursorPosition)
    console.log('i...',inputText)
    let insertStr = this.buildStopText(stopVal)
    if (!this.canInsertText(insertStr)) return
    let  inputNewText = inputText.substring(0, cursorPosition) + insertStr + inputText.substring(cursorPosition);
    this.setData({inputText: inputNewText, stopShow: false})
  },

  buildStopText(stopVal) {
    const stopMilliseconds = Math.round(Number(stopVal) * 1000)
    return `[停${stopMilliseconds}ms]`
  },

  canInsertText(insertStr) {
    const inputText = String(this.data.inputText || '')
    if (inputText.length + insertStr.length <= MAX_INPUT_LENGTH) return true
    showToast('none', `最多输入${MAX_INPUT_LENGTH}个字符`)
    return false
  },

  //插入叮咚
  insertDD(){
    const insertStr = `[叮咚]`
    if (!this.canInsertText(insertStr)) return
    this.setData({dingdongFlag: true})
    setTimeout(()=>{
      this.setData({dingdongFlag: false})
      let {cursorPosition,inputText} = this.data
      console.log('p...',cursorPosition)
      console.log('i...',inputText)
      let  inputNewText = inputText.substring(0, cursorPosition) + insertStr + inputText.substring(cursorPosition);
      this.setData({inputText: inputNewText})
    },20)
  },
  

  async convertToSpeech() {
    console.log('rres00000000....')
    // wx.navigateTo({
    //   url: '../generate/generate',
    // })
    // return
    const { inputText, speed, yxVoice } = this.data
    // if(!app.globalData.deviceInfo.connState){
    //       showToast('none','请先连接设备')
    //   return
    // }
    if (!inputText.trim()) {
      showToast('none','请输入文字')
      return
    }
    wx.showLoading({  title: '生成中....'})
    
    try {
      let newTxt = this.convertPauseToBreak(inputText)
      newTxt = this.convertDingDong(newTxt)
      console.log('ttt...',newTxt);
      let data = {
        //<speak>四博智联配音宝<break time=\"1.5s\"></break>就是好，</speak>
        "text": '<speak>'+newTxt+'</speak>',
        "voice_id": this.data.voiceCheckInfo['voice_id'],
        "speed_ratio": speed,
        // "volume_ratio": 1,
        "volume_ratio": yxVoice,
        "pitch_ratio": 1
      }
      const bgmPayload = buildBgmPayload(
        this.data.activeBgmInfo,
        this.data.bgmSetDetail
      )
      if (hasBgmSelection(bgmPayload)) {
        data = { ...data, ...bgmPayload }
      }
      console.log("d.......",data)
      const res = await request({
        url: '/user/tts/synthesize',
        method: 'POST',
        data,
        needAuth: true
      })
      
      let result = res.data
      app.globalData.generate = result
      console.log('res....',result)
      wx.hideLoading();
      wx.navigateTo({
        url: '../generate/generate',
      })
     
    } catch (error) {
      console.error('TTS转换失败2:', error)
      wx.hideLoading();
      showToast('none',error.message || '转换失败')
    } finally {

    }
  },
  convertPauseToBreak(text) {
    return text.replace(/\[停(\d+)ms\]/g, (match, ms) => {
      const seconds = (parseInt(ms) / 1000).toFixed(1);
      return `<break time="${seconds}s"></break>`;
    });
  },
  convertDingDong(text){
    return text.replace(
      /\[叮咚\]/g,
      '<soundEvent src="https://ai-speaker.tos-cn-beijing.volces.com/wav/ding_dong.wav"/>'
    );
  },
  moreVoice(){
    wx.navigateTo({
      url: '../voiceSelect/voiceSelect',
      events: {
        voiceSelected: (voice) => {
          console.log('vvv...',voice);
          this.setData({
            voiceIndex: -1,
            voiceCheckInfo: voice
          })
          this.refreshHomeData(voice)
        }
      },
      success: (res) => {
        res.eventChannel.emit('initVoiceSelect', {
          voiceList: this.data.voiceMoreList,
          activeVoiceId: this.data.voiceCheckInfo.id || 0
        })
      }
    })
  },
  changeStreamer(e){
    let index = e.currentTarget.id
    const voiceCheckInfo = this.data.voiceList[index]
    if (!voiceCheckInfo) return
    this.setData({
      voiceIndex: index,
      voiceCheckInfo
    })
    this.playVoicePreview(voiceCheckInfo)
  },
  createVoicePreviewAudio() {
    if (this.voicePreviewAudioContext) return this.voicePreviewAudioContext
    const audioContext = wx.createInnerAudioContext()
    this.voicePreviewAudioContext = audioContext
    audioContext.onError(() => {
      if (this.voicePreviewAudioContext !== audioContext) return
      this.stopVoicePreview()
      // showToast('none', '音色试听失败')
    })
    return audioContext
  },
  playVoicePreview(voice) {
    if (!voice || !voice.audio_path) {
      this.stopVoicePreview()
      return
    }
    const audioContext = this.createVoicePreviewAudio()
    audioContext.src = this.normalizeAudioUrl(voice.audio_path)
    audioContext.play()
  },
  stopVoicePreview() {
    if (this.voicePreviewAudioContext) this.voicePreviewAudioContext.stop()
  },
  destroyVoicePreviewAudio() {
    if (!this.voicePreviewAudioContext) return
    const audioContext = this.voicePreviewAudioContext
    this.voicePreviewAudioContext = null
    audioContext.stop()
    audioContext.destroy()
  },
  normalizeAudioUrl(audioUrl) {
    if (!audioUrl) return ''
    return /^https?:\/\//i.test(audioUrl) ? audioUrl : `https://${audioUrl}`
  },
  bgmPop(){
    this.setData({ bgmSetPop: !this.data.bgmSetPop })
  },
  showBgmList(){
    wx.navigateTo({
      url: '../bgmSelect/bgmSelect',
      events: {
        bgmSelected: (bgm) => {
          this.setData({ activeBgmInfo: bgm })
        }
      },
      success: (res) => {
        res.eventChannel.emit('initBgmSelect', {
          bgmList: this.data.bgmList,
          activeBgmId: this.data.activeBgmInfo.id || 0,
          activeBgmSource: this.data.activeBgmInfo.source || 'regular'
        })
      }
    })
  },
  resetBgm(){
    this.setData({
      activeBgmInfo: {},
      bgmSetDetail: {}
    })
  },
  bmgSetConfirm(e){
    console.log("b....",e.detail)
    this.setData({
      bgmSetDetail: { ...e.detail },
      bgmSetPop: false
    })
  },
  //我的作品
  myWorks(){
    wx.navigateTo({ url: '../myWorks/myWorks' })
  },
  openTemp(){
    wx.navigateTo({
      url: '../commonTemplate/commonTemplate',
      events: {
        templateSelected: ({ content = '' } = {}) => {
          this.setData({ inputText: content })
        }
      }
    })
  },
  // 录音功能
  showRecorderPop(){
    wx.navigateTo({
      url: '../recorder/recorder',
      success: (res) => {
        this.resetBgm()
        res.eventChannel.emit('initRecorder', {
          bgmList: this.data.bgmList
        })
      }
    })
  },

  onShareAppMessage() {
    return share.toPage('四博配音宝：文字转语音，还能自己录', '/pages/index/index')
  },

  onShareTimeline() {
    return share.timeline('四博配音宝：文字转语音，还能自己录')
  }
})
