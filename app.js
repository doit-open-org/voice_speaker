// app.js
App({
  onLaunch() { 
    // const info = wx.getSystemInfoSync();
    // const isIOS = info.system.toLowerCase().includes('ios'); 
    // this.isIOS =  isIOS
  },
  globalData: {
    onlyOnce: false,//进小程序仅执行一次
    userInfo: null,
    deviceInfo:{}, //已连接设备信息
    mtu: 512-3, //默认20
    reConDevInfo: {}, //重连设备信息
    //合成音频信息
    generate:{
      // audio_url: "ai-speaker.tos-cn-beijing.volces.com/tts_audio/2025/11/13/58a15c75d7fc4e7597ebc8c167f7f9c5.mp3",
      // duration: null,
      // file_name: "26a95e0b94a14baf9a591fc0b75dc05e.mp3",
      // file_size: 136800,
      // text: "您尚未绑定手机号和邮箱，可能会影响账号的正常使用，请立即进行绑定",
      // voice_id: "zh_female_shuangkuaisisi_moon_bigtts",

      // audio_url: "ai-speaker.tos-cn-beijing.volces.com/tts_audio/2025/11/20/5aa1412bd3e1443eae4ce8e0e24dfd93.mp3",
      // duration: null,
      // file_name: "四博配音宝.mp3",
      // file_size: 28080,
      // text: "智能音箱",
      // voice_id: "zh_female_shuangkuaisisi_moon_bigtts",
    },
    domain: 'https://ai-speaker.esp32.cn',
    sendFlag: true, //发送暂停标志位
  },
  bletool:require("utils/bletool.js"),
  hextool:require("utils/hextool.js"),
  util:require("utils/util.js"),
})
