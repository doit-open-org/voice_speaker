import {downloadAudio , readAudioFile, buildCMD10Data,buildCMD11Data,textToUnicode,sendFileToDevice} from '../../utils/operationFile'
let app = getApp()
Page({

  /**
   * 页面的初始数据
   */
  data: {
    generate: {} ,//合成的音频信息
    innerAudioContext: null,
    waveData: [],
    isPlaying: false,
    tempPath:'',  // 只存路径
    flag: true,
    sendTimer:null,
    importMask: false, //发送蒙层
    importPro: 0,  //发送进度
    exportFlag: false,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    app.bletool.setCurPage(this)
    app.hextool.setCurPage(this)
    const generateObj = { ...app.globalData.generate }
    generateObj.audio_url = this.normalizeAudioUrl(generateObj.audio_url)
    this.setData({ generate: generateObj })
    this.innerAudioContext = wx.createInnerAudioContext()
    this.innerAudioContext.onPlay(() => {
      this.setData({ isPlaying: true })
    })
    this.innerAudioContext.onPause(() => {
      this.setData({ isPlaying: false })
    })
    this.innerAudioContext.onEnded(() => {
      this.setData({ isPlaying: false })
    })
    this.innerAudioContext.onError(() => {
      this.setData({ isPlaying: false })
    })
    // 生成波形数据
    this.generateWaveform()
    //测试unicode
    // let test = textToUnicode("四博配音宝.mp3")
    // console.log("uni.....",test)
  },
  onUnload() {
    if (this.innerAudioContext) {
      this.innerAudioContext.destroy()
    }
  },

  normalizeAudioUrl(audioUrl) {
    if (!audioUrl) return ''
    return /^https?:\/\//i.test(audioUrl) ? audioUrl : `https://${audioUrl}`
  },

  // 生成波形数据
  generateWaveform() {
    const waveData = []
    for (let i = 0; i < 60; i++) {
      waveData.push({
        height: Math.round(20 + Math.random() * 80),
        animationDelay: i === 0 ? 0 : -((i * 47) % 760),
        animationDuration: 520 + (i % 7) * 70
      })
    }
    this.setData({ waveData })
  },

  // 返回
  goBack() {
    wx.navigateBack()
  },

  // 播放音频
  playAudio() {
    if (!this.data.generate.audio_url) {
      wx.showToast({
        title: '暂无音频',
        icon: 'none'
      })
      return
    }

    if (this.data.isPlaying) {
      this.innerAudioContext.pause()
    } else {
      this.innerAudioContext.src = this.data.generate.audio_url
      this.innerAudioContext.play()
    }
  },

  // 发送到设备
  async sendToDevice() {
    //判断是否连接设备
    if(!app.globalData.deviceInfo.connState){
      wx.showToast({
        title: '请先连接设备',
        icon: 'none'
      })
      return
    }
    // wx.showLoading({ title: '发送中...',mask: true})
    this.setData({importMask: true})
    this.data.sendTimer && clearTimeout(this.data.sendTimer)
    this.data.sendTimer = setTimeout(() => {
      this.setData({importMask: false})
      wx.showToast({
        icon: 'error',
        title: '发送失败',
      })
    }, 10000);
     //下载音频
    let tempPath = await downloadAudio(this.data.generate.audio_url)
    console.log("tempPath....",tempPath)
    this.data.tempPath = tempPath
    //读取音频数据
    let audioBuffer = await readAudioFile(tempPath)
    //方便下面发送文件，不用每次都读取文件
    this.data.audioBuffer = audioBuffer
    // 音频字节数
    let audioBufferSize = audioBuffer.byteLength
    
    console.log("audioBuffer....",audioBuffer)
    console.log("audioBufferSize....",audioBufferSize)
    // 发送
    // 文件名不能太长，先自己生成一个名称不用this.data.generate.file_name
    // let fileName = (Math.ceil(Date.now()/1000)).toString(16)+'.mp3'
    console.log('fileName....',this.data.generate.file_name)
    let data = buildCMD10Data(audioBuffer,audioBufferSize,this.data.generate.file_name)
    console.log("cmd10....",data)
    app.hextool.sendDatas(data)

    // 测试
    // setTimeout(() => {
    //   let index = 0;
    //   const total = 13;
    //   const sendNext = () => {
    //     console.log("index....",index)
    //     if (index >= total) return; // 发送完毕
    //     this.sendFileToDevice(10240 * index, 10240);
    //     index++;
    //     setTimeout(sendNext, 2000); // 每 2 秒调用一次
    //   };
    //   sendNext();
    // }, 3000);
  },

  // async sendFileToDevice(offset,chunkSize){
  //   try {
  //     // let tempPath = this.data.tempPath
  //     //读取音频数据
  //     // let audioBuffer = await readAudioFile(tempPath)
  //     let audioBuffer = this.data.audioBuffer
  //     // 6. 分片发送音频数据 (CMD11)
  //     let mtuSize = app.globalData.mtu; //MTU协商后的大小
  //     const totalSize = audioBuffer.byteLength;
  //     //获取能切的块实际大小(最后一块可能小于chunkSize)
  //     const actualChunkSize = Math.min(chunkSize, totalSize - offset);
  //     let file_seq = 0 //序号从0开始
  //     mtuSize = mtuSize - 6 //gatt 外层的6个字节ver1、seq2、len2、crc1
  //     console.log('00000.....',offset,chunkSize)
  //     let packets = buildCMD11Data(audioBuffer,offset,actualChunkSize,file_seq,mtuSize)
  //     // 逐个发送小包
  //     for (let packet of packets) {
  //       console.log('ppp.....',packet.length)
  //       app.hextool.sendDatas(packet)
  //       //await this.sleep(15); // 每个小包间隔ms
  //     }
  //   } catch (err) {
  //     console.error('传输失败:', err);
  //     throw err;
  //   }
  // },

  // 辅助函数
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  //设备返回信息(tcpcallback)
  onBLEdatas(deviceData){
    console.log("backData.....",deviceData)
    //发送文件信息失败
    if(deviceData[0] == 10 && deviceData[3] != 0){
      clearTimeout(this.data.sendTimer)
      this.setData({importMask: false, importPro: 0})
      wx.showToast({
        icon: 'error',
        title: '发送文件信息失败',
      })
    }
    //设备要拉取的块
    if(deviceData[0] == 11){
      clearTimeout(this.data.sendTimer)
      // if(this.data.flag){
      //   this.data.flag = false;
      //   return
      // }
      //终止上一次的for循环发送
      getApp().globalData.sendFlag = false
      let deviceDataHex = deviceData.map(v => v.toString(16).padStart(2, '0'));
      console.log("11111.....",deviceDataHex)
      // 获取offset,chunkSize
      let res = this.getOffsetChunk(deviceDataHex)
      console.log("res.....",res)
      let importPro = Math.ceil(Number(res[0]) / Number(this.data.generate.file_size) * 100)
      this.setData({ importPro })
      // this.sendFileToDevice(res[0],res[1])
      sendFileToDevice(res[0],res[1], this.data.audioBuffer)
    }
    //文件传输结束
    if(deviceData[0] == 12){
      this.setData({importMask: false})
      this.setData({importPro: 0})
      if(deviceData[3] == 0){
        wx.showToast({
          icon:'success',
          title:'发送完成'
        })
      }else{
        wx.showToast({
          icon: 'error',
          title: '发送失败',
        })
      }
    }
  },
  getOffsetChunk(deviceData){
    const result = [];
    for (let i = 3; i < deviceData.length; i += 4) {
      const group = deviceData.slice(i, i + 4).join(""); 
      const decimal = parseInt(group, 16);
      result.push(decimal);
    }
    return result  //[0, 10240]
  },

  // 保存到作品
  saveToWorks() {
    wx.showLoading({ title: '保存中...' })
    setTimeout(() => {
      wx.hideLoading()
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })
    }, 1000)
  },

  // 导出到微信
  async exportToWechat() {
    if (!this.data.generate.audio_url) {
      wx.showToast({
        title: '暂无音频',
        icon: 'none'
      })
      return
    }
    this.setData({exportFlag: true})
    let that = this
    
    try {
      let tempPath = await downloadAudio(this.data.generate.audio_url)
      let fileName = (Math.ceil(Date.now()/1000)).toString(16)+'.mp3'
      console.log("tempPath....",tempPath)
      this.data.tempPath = tempPath
      wx.shareFileMessage({
        filePath: this.data.tempPath,
        fileName: fileName,
        success() {
          console.log('分享成功');
        },
        fail(err) {
          console.error('分享失败', err);
        },
        complete(){
          that.setData({exportFlag: false})
        }
      });
    } catch (error) {
      that.setData({exportFlag: false})
    }
    
   
    
  },

  // 复制链接
  copyLink() {
    if (!this.data.generate.audio_url) {
      wx.showToast({
        title: '暂无音频链接',
        icon: 'none'
      })
      return
    }

    wx.setClipboardData({
      data: this.data.generate.audio_url,
      success: () => {
        wx.showToast({
          title: '链接已复制',
          icon: 'success'
        })
      }
    })
  }
})
