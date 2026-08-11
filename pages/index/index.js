// pages/tts/tts.js
const app = getApp()
const { request, checkLogin, showToast } = require('../../utils/request')
Page({
  data: {
    bannerImages: ['/img/yinxiang.png', '/img/yinxiang1.png', '/img/yinxiang2.png'],
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
  },

  onLoad() {
    this.applyPendingVoiceText()
    // 下面函数仅执行一次
    if(app.globalData.onlyOnce){ return }
    app.globalData.onlyOnce = true;
    //检查login
    checkLogin();
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
    this.data.deviceInfo = app.globalData.deviceInfo
    wx.getStorage({
      key: 'voiceList',
      success: (res) => {
        this.handleVoiceList(res.data)
      }
    })
    wx.getStorage({
      key: 'bgmList',
      success: (res) => {
        this.setData({ bgmList: res.data})
      }
    })
    
    console.log("122....................")
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
  handleVoiceList(data){
    const voiceCatalog = data || {}
    const homeVoices = Array.isArray(voiceCatalog.home)
      ? voiceCatalog.home
      : []
    this.setData({
      voiceMoreList: voiceCatalog,
      voiceList: homeVoices,
      voiceCheckInfo: homeVoices[0],
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
    console.log("d0.........",dev)
    // dev = {"deviceId":'123',"name":'配音宝'}
    app.globalData.reConDevInfo = dev
    if(dev){
      wx.redirectTo({  url: '../device/device?dev=1' })
    }
  },
  jumpAdCopy(){
    wx.navigateTo({
      url: '../adCopy/adCopy',
    })
  },
  onTextInput(e) {
    this.setData({  
      inputText: e.detail.value,
      cursorPosition: e.detail.cursor
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

  jumpXxmini(){
    wx.navigateToMiniProgram({
      appId: 'wx7fa7b99ba9bd3ba7',
      envVersion: 'release',
      success: (res) => {},
      fail: (res) => {},
      complete: (res) => {},
    })
  },

  musicSet(){
    this.setData({  musicSetShow: !this.data.musicSetShow   })
  },
  
  stopSet(){
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
    this.setData({  stopShow: false  })
    let {cursorPosition,stopVal,inputText} = this.data
    console.log('p...',cursorPosition)
    console.log('i...',inputText)
    let stopValNew = Number(stopVal) * 1000
    let insertStr = `[停${stopValNew}ms]`;
    let  inputNewText = inputText.substring(0, cursorPosition) + insertStr + inputText.substring(cursorPosition);
    this.setData({inputText: inputNewText})
  },

  //插入叮咚
  insertDD(){
    this.setData({dingdongFlag: true})
    setTimeout(()=>{
      this.setData({dingdongFlag: false})
      let {cursorPosition,inputText} = this.data
      console.log('p...',cursorPosition)
      console.log('i...',inputText)
      let insertStr = `[叮咚]`;
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
      let bgmSetDetail = this.data.bgmSetDetail
      if(bgmSetDetail.bgm_id != undefined && bgmSetDetail.bgm_id != 0){
        data = {...data,...bgmSetDetail}
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
    this.setData({
      voiceIndex: index,
      voiceCheckInfo: this.data.voiceList[index]
    })
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
          activeBgmId: this.data.activeBgmInfo.id || 0
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
      events: {
        bgmStateChanged: ({ activeBgmInfo = {}, bgmSetDetail = {} } = {}) => {
          this.setData({ activeBgmInfo, bgmSetDetail })
        }
      },
      success: (res) => {
        res.eventChannel.emit('initRecorder', {
          bgmList: this.data.bgmList,
          activeBgmInfo: this.data.activeBgmInfo,
          bgmSetDetail: this.data.bgmSetDetail
        })
      }
    })
  }

})
