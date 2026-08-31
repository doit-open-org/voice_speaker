const share = require('../../utils/share')
const { request } = require('../../utils/request')
import {downloadAudio , readAudioFile, buildCMD10Data,buildCMD11Data,textToUnicode,sendFileToDevice} from '../../utils/operationFile'
let app = getApp()

const FILE_TRANSFER_TIMEOUT = 10000
const MAX_FILE_BLOCK_ATTEMPTS = 3
const FILE_TRANSFER_RETRY_MESSAGE = '发送失败，请过一分钟再试'

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
    connState: false, //连接状态
    savingWork: false,
    workSaved: false,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    app.bletool.setCurPage(this)
    app.hextool.setCurPage(this)
    let connState = !!(app.globalData.deviceInfo && app.globalData.deviceInfo.connState) //设备连接状态
    const generateObj = { ...(app.globalData.generate || {}) }
    console.log('generateObj...',generateObj);
    generateObj.audio_url = this.normalizeAudioUrl(generateObj.audio_url)
    this.setData({ generate: generateObj,connState: connState })
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
    this._pageUnloaded = true
    this._fileTransferActive = false
    this.cancelFileTransferQueue()
    if (this._cancelDeviceScan) {
      this._cancelDeviceScan()
    }
    this.finishDeviceBinding(new Error('页面已关闭'))
    if (this.data.sendTimer) {
      clearTimeout(this.data.sendTimer)
      this.data.sendTimer = null
    }
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
      this.setData({ isPlaying: false })
    } else {
      this.innerAudioContext.src = this.data.generate.audio_url
      this.innerAudioContext.play()
      this.setData({ isPlaying: true })
    }
  },

  // 发送到设备
  async sendToDevice() {
    if (this._sendInProgress || this.data.importMask) return
    this._sendInProgress = true

    try {
      await this.ensureDeviceConnected()
      await this.sendAudioToDevice()
    } catch (error) {
      console.error('发送前连接设备失败', error)
      this.resetSendState()
      if (!this._pageUnloaded && !(error && error.downloadFailureNotified)) {
        wx.showToast({
          title: error && error.message ? error.message : '设备连接失败',
          icon: 'none'
        })
      }
    }
  },

  async ensureDeviceConnected() {
    const deviceInfo = app.globalData.deviceInfo || {}
    if (deviceInfo.connState) {
      this.setData({connState: true})
      return deviceInfo
    }

    wx.showLoading({title: '搜索设备中...', mask: true})
    try {
      const device = await this.searchStrongestDevice(this.deviceScanDuration || 3000)
      wx.showLoading({title: '连接设备中...', mask: true})
      return await this.connectAndBindDevice(device, this.deviceConnectTimeout || 25000)
    } finally {
      wx.hideLoading()
    }
  },

  searchStrongestDevice(scanDuration) {
    return new Promise((resolve, reject) => {
      const devices = {}
      let scanTimer = null
      let settled = false

      const cleanup = () => {
        if (scanTimer) clearTimeout(scanTimer)
        wx.offBluetoothDeviceFound(onDeviceFound)
        wx.stopBluetoothDevicesDiscovery()
        this._cancelDeviceScan = null
      }
      const complete = (callback, value) => {
        if (settled) return
        settled = true
        cleanup()
        callback(value)
      }
      const fail = (message, error) => {
        console.error(message, error)
        complete(reject, new Error(message))
      }
      const finishSearch = () => {
        const strongestDevice = Object.keys(devices).reduce((strongest, deviceId) => {
          const device = devices[deviceId]
          if (!strongest) return device
          return this.getDeviceRSSI(device) > this.getDeviceRSSI(strongest) ? device : strongest
        }, null)
        if (!strongestDevice) {
          fail('没有发现可连接设备')
          return
        }
        complete(resolve, strongestDevice)
      }
      const onDeviceFound = (result) => {
        const foundDevices = result && Array.isArray(result.devices) ? result.devices : []
        foundDevices.forEach((device) => {
          if (!this.isTargetDevice(device)) return
          const oldDevice = devices[device.deviceId]
          if (!oldDevice || this.getDeviceRSSI(device) > this.getDeviceRSSI(oldDevice)) {
            devices[device.deviceId] = device
          }
        })
      }
      const startDiscovery = () => {
        wx.startBluetoothDevicesDiscovery({
          allowDuplicatesKey: true,
          powerLevel: 'high',
          success: () => {
            wx.onBluetoothDeviceFound(onDeviceFound)
            scanTimer = setTimeout(finishSearch, scanDuration)
          },
          fail: (error) => fail('搜索设备失败', error)
        })
      }

      this._cancelDeviceScan = () => complete(reject, new Error('设备搜索已取消'))
      wx.openBluetoothAdapter({
        success: startDiscovery,
        fail: (error) => fail('请先打开手机蓝牙和位置信息', error)
      })
    })
  },

  isTargetDevice(device) {
    if (!device || !device.deviceId || !device.name || !device.localName) return false
    if (device.localName.toLowerCase().indexOf('tt') === -1) return false
    if (!device.advertisData || device.advertisData.byteLength < 17) return false

    const serviceUUID = Array.isArray(device.advertisServiceUUIDs) && device.advertisServiceUUIDs[0]
    if (!serviceUUID || !app.util || !app.util.uuidCheck(serviceUUID)) return false

    const advertisData = new Uint8Array(device.advertisData)
    let pid = ''
    for (let i = 11; i <= 16; i++) {
      pid += String.fromCharCode(advertisData[i])
    }
    return pid === 'p49857'
  },

  getDeviceRSSI(device) {
    const rssi = Number(device && device.RSSI)
    return Number.isFinite(rssi) ? rssi : Number.NEGATIVE_INFINITY
  },

  connectAndBindDevice(device, timeout) {
    const selectedDevice = Object.assign({}, device, {
      name: '配音宝',
      connState: false
    })
    app.globalData.deviceInfo = selectedDevice

    return new Promise((resolve, reject) => {
      this._deviceBindingResolve = resolve
      this._deviceBindingReject = reject
      this._deviceBindingTimer = setTimeout(() => {
        this.finishDeviceBinding(new Error('设备连接超时'))
      }, timeout)

      try {
        app.bletool.BLE_connect(selectedDevice.deviceId)
      } catch (error) {
        this.finishDeviceBinding(new Error('设备连接失败'))
      }
    })
  },

  finishDeviceBinding(error) {
    if (this._deviceBindingTimer) {
      clearTimeout(this._deviceBindingTimer)
      this._deviceBindingTimer = null
    }
    const resolve = this._deviceBindingResolve
    const reject = this._deviceBindingReject
    this._deviceBindingResolve = null
    this._deviceBindingReject = null
    if (error) {
      if (reject) reject(error)
    } else if (resolve) {
      resolve(app.globalData.deviceInfo)
    }
  },

  // BLE连接就绪后，沿用设备页的 CMD0 -> CMD1 绑定流程
  BLE_event(event) {
    if (event === 0) {
      this.finishDeviceBinding(new Error('设备连接失败'))
      return true
    } else if (event === 1) {
      app.hextool.sendDatas(app.hextool.getCmd0New())
      return true
    }
    return false
  },

  onBLEnet(datas) {
    if (!datas || !datas.length) return

    if (datas[0] === 0) {
      const mtuBytes = datas.slice(-2)
      if (mtuBytes.length === 2) {
        const mtuHex = Number(mtuBytes[0]).toString(16).padStart(2, '0') +
          Number(mtuBytes[1]).toString(16).padStart(2, '0')
        const mtu = parseInt(mtuHex, 16) - 3
        if (Number.isFinite(mtu) && mtu > 0) app.globalData.mtu = mtu
      }
      const bindDatas = app.hextool.getNetSetDatasNew()
      app.hextool.sendDatas(bindDatas[0])
      return
    }

    if (datas[0] === 1) {
      app.globalData.deviceInfo.connState = true
      this.setData({connState: true})
      wx.setStorageSync('sbpyb2025', app.globalData.deviceInfo)
      this.finishDeviceBinding()
    }
  },

  async sendAudioToDevice() {
    // wx.showLoading({ title: '发送中...',mask: true})
    this.setData({importMask: true})
    this._fileTransferActive = false
    this._lastFileRequestKey = null
    this._sameFileRequestCount = 0
    this._lastFileRequestOffset = null
    if (this.data.sendTimer) {
      clearTimeout(this.data.sendTimer)
      this.data.sendTimer = null
    }
    //下载音频
    let tempPath
    try {
      tempPath = await downloadAudio(this.data.generate.audio_url)
    } catch (error) {
      console.error('音频下载失败', error)
      this.data.sendTimer && clearTimeout(this.data.sendTimer)
      this.data.sendTimer = null
      this._sendInProgress = false
      this.setData({importMask: false, importPro: 0})
      throw error
    }
    console.log("tempPath1....",tempPath)
    this.data.tempPath = tempPath
    //读取音频数据
    let audioBuffer = await readAudioFile(tempPath)
    //方便下面发送文件，不用每次都读取文件
    this.data.audioBuffer = audioBuffer
    // 音频字节数
    let audioBufferSize = audioBuffer.byteLength
    this.data.audioBufferSize = audioBufferSize
    
    console.log("audioBuffer....",audioBuffer)
    console.log("audioBufferSize....",audioBufferSize)
    // 发送
    // 文件名不能太长，先自己生成一个名称不用this.data.generate.file_name
    // let fileName = (Math.ceil(Date.now()/1000)).toString(16)+'.mp3'
    console.log('fileName....',this.data.generate.file_name)
    let data = buildCMD10Data(audioBuffer,audioBufferSize,this.data.generate.file_name)
    console.log("cmd10....",data)
    this._fileTransferActive = true
    app.hextool.sendDatas(data)
    this.armFileTransferTimeout()

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

  resetSendState() {
    this.cancelFileTransferQueue()
    this._fileTransferActive = false
    this._lastFileRequestKey = null
    this._sameFileRequestCount = 0
    this._lastFileRequestOffset = null
    if (this.data.sendTimer) {
      clearTimeout(this.data.sendTimer)
      this.data.sendTimer = null
    }
    this._sendInProgress = false
    this.setData({importMask: false, importPro: 0})
  },

  armFileTransferTimeout() {
    if (this.data.sendTimer) clearTimeout(this.data.sendTimer)
    this.data.sendTimer = setTimeout(() => {
      this.data.sendTimer = null
      this.abortFileTransfer('file transfer timeout')
    }, FILE_TRANSFER_TIMEOUT)
  },

  abortFileTransfer(reason) {
    if (!this._fileTransferActive) return
    console.warn('file transfer aborted:', reason)
    this.resetSendState()
    if (!this._pageUnloaded) {
      wx.showToast({
        icon: 'none',
        title: FILE_TRANSFER_RETRY_MESSAGE,
        duration: 3000
      })
    }
  },

  cancelFileTransferQueue() {
    const hextool = app.hextool
    if (hextool && typeof hextool.cancelQueuedDatas === 'function') {
      hextool.cancelQueuedDatas(hextool.FILE_TRANSFER_QUEUE_KEY)
    }
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
      this.resetSendState()
      let errorIndex = Number(deviceData[3]);
      let errorInfoArr = ['发送成功','文件名长度超过本地缓存','已有一个文件正在传输','设备空间不足','存储设备异常','文件过多请先删除设备文件']
      let errorInfo = errorInfoArr[errorIndex] ? errorInfoArr[errorIndex]:'发送文件信息失败'
      wx.showToast({
        icon: 'error',
        // title: '发送文件信息失败',
        title: errorInfo,
      })
    }
    //设备要拉取的块
    if(deviceData[0] == 11){
      if (!this._fileTransferActive) {
        console.warn('ignore file block request after transfer stopped')
        return
      }
      let deviceDataHex = deviceData.map(v => v.toString(16).padStart(2, '0'));
      console.log("11111.....",deviceDataHex)
      // 获取offset,chunkSize
      let res = this.getOffsetChunk(deviceDataHex)
      console.log("res.....",res)
      const requestedOffset = Number(res[0])
      const requestedChunkSize = Number(res[1])
      const audioBufferSize = Number(this.data.audioBuffer && this.data.audioBuffer.byteLength)
      const requestIsValid = Number.isInteger(requestedOffset) && requestedOffset >= 0 &&
        Number.isInteger(requestedChunkSize) && requestedChunkSize > 0 &&
        Number.isFinite(audioBufferSize) && requestedOffset < audioBufferSize
      if (!requestIsValid) {
        this.abortFileTransfer(`invalid file block request ${requestedOffset}:${requestedChunkSize}`)
        return
      }

      const requestKey = `${requestedOffset}:${requestedChunkSize}`
      if (this._lastFileRequestKey === requestKey) {
        this._sameFileRequestCount += 1
      } else {
        this._lastFileRequestKey = requestKey
        this._sameFileRequestCount = 1
      }

      if (this._sameFileRequestCount > MAX_FILE_BLOCK_ATTEMPTS) {
        this.abortFileTransfer(`device repeated file block ${requestKey}`)
        return
      }

      if (this._sameFileRequestCount > 1 && typeof app.hextool.slowDownWrites === 'function') {
        app.hextool.slowDownWrites(`device repeated offset ${requestedOffset}`)
      }
      this._lastFileRequestOffset = requestedOffset
      let importPro = 0
      if(this.data.generate.file_size){
        importPro = Math.ceil(Number(res[0]) / Number(this.data.generate.file_size) * 100)
      }else{
        importPro = Math.ceil(Number(res[0]) / Number(this.data.audioBufferSize) * 100)
      }
      if(Number.isFinite(importPro)){
        importPro = importPro > 100 ? 100 : importPro;
        this.setData({ importPro })
      }
      const sendTask = sendFileToDevice(requestedOffset, requestedChunkSize, this.data.audioBuffer)
      if (sendTask && typeof sendTask.catch === 'function') {
        sendTask.catch(error => {
          this.abortFileTransfer(error && error.message ? error.message : 'file block send failed')
        })
      }
      this.armFileTransferTimeout()
    }
    //文件传输结束
    if(deviceData[0] == 12){
      if (!this._fileTransferActive) {
        console.warn('ignore file transfer result after transfer stopped')
        return
      }
      this.resetSendState()
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

  // 保存长文本合成结果到作品
  async saveToWorks() {
    if (this.data.savingWork || this.data.workSaved) return

    const taskId = this.data.generate && this.data.generate.task_id
    if (!taskId) {
      wx.showToast({
        title: '缺少长文本任务信息',
        icon: 'none'
      })
      return
    }

    this.setData({ savingWork: true })
    try {
      const response = await request({
        url: '/user/tts/long-text/save',
        method: 'POST',
        data: { task_id: taskId },
        needAuth: true
      })
      if (Number(response.code) !== 200) {
        throw new Error(response.message || '保存失败')
      }
      this.setData({ workSaved: true })
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })
    } catch (error) {
      console.error('保存长文本作品失败:', error)
      wx.showToast({
        title: error && error.message ? error.message : '保存失败',
        icon: 'none'
      })
    } finally {
      this.setData({ savingWork: false })
    }
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
  },

  // 本页数据经 app.globalData 交接，接收方点开是空壳，
  // 所以转发落回首页；同理不挂 onShareTimeline
  onShareAppMessage() {
    return share.toHome('这段配音是用四博配音宝做的')
  }
})
