import {downloadAudio , readAudioFile, buildCMD10Data,buildCMD11Data,queryMusicList,titleAscii,titleUnicode,delMusicItem,playMusicItem,reNameData,queryCapacity,sendFileToDevice} from '../../utils/operationFile'
let app = getApp()
// pages/devMusicList/devMusicList.js
Page({

  /**
   * 页面的初始数据
   */
  data: {
    musicList:[
      // {'title': 'Lawrence - 月半小夜曲.mp3' , index: 0 },
      // {'title': 'SoulJa _ YUKIE - そばにいるね (留在我身边).mp3' , index: 1 },
      // {'title': '说法' , index: 2 },
      // {'title': 'fdf5b9689c3e4d55bcea347d37c0bf71.mp3' , index: 3 },
    ],
    progressVal: 0,
    importFile: {} , //导入文件信息
    delTimer: null,//删除定时器
    delIndex: -1, //删除下标
    editIndex: -1, //重命名下标
    editName:'' ,//重命名
    sendTimer: null,
    importMask: false, //导入蒙层
    importPro: 0, //导入进度
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    app.bletool.setCurPage(this)
    app.hextool.setCurPage(this)
    this.initInfo()
  },
  initInfo(){
    wx.showLoading({  title: '拉取中...' })
    // 查询容量
    this.getCapacity()
    //获取音乐列表
    setTimeout(() => {
      this.getMusicFromDev()
    }, 500);
  },
  getCapacity(){
    let data = queryCapacity()
    console.log("cmd17....",data)
    app.hextool.sendDatas(data)
  },
  getMusicFromDev(){
    let data = queryMusicList()
    console.log("cmd13....",data)
    app.hextool.sendDatas(data)
  },
  
  importFun(){
    wx.chooseMessageFile({
      count: 1,
      type: "file",
      // extension: ["mp3", "MP3", "mp4", "m4a", "wav", "ogg"],
      extension: ["mp3", "MP3"],
      success: (result) => {
        const importFile = result.tempFiles && result.tempFiles[0]
        if (!importFile) return
        if (!this.isImportFileNameValid(importFile.name)) {
          wx.showToast({
            icon: 'none',
            title: '中文名称至少3个字'
          })
          return
        }
        console.log("res...",importFile.path)
        this.data.importFile = importFile
        this.sendToDevice()
      },
      fail: (res) => {
        console.error("failRes...",res)
      },
    })
  },

  isImportFileNameValid(fileName) {
    const baseName = String(fileName || '').replace(/\.[^/.]+$/, '')
    const chineseCharacters = baseName.match(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g) || []
    return chineseCharacters.length === 0 || chineseCharacters.length >= 3
  },

  async sendToDevice(){
    // wx.showLoading({ title: '正在导入...',mask: true })
    this.setData({importMask: true})
    this._lastFileRequestOffset = null
    this.data.sendTimer && clearTimeout(this.data.sendTimer)
    this.data.sendTimer = setTimeout(() => {
      this.setData({importMask: false, importPro: 0})
      wx.showToast({
        icon: 'error',
        title: '导入失败',
      })
    }, 10000);
    console.log("res...",this.data.importFile)
    let importFile = this.data.importFile
    let tempPath = importFile.path
    //读取音频数据
    let audioBuffer = await readAudioFile(tempPath)
    //方便下面发送文件，不用每次都读取文件
    this.data.audioBuffer = audioBuffer
    // 音频字节数
    let audioBufferSize = audioBuffer.byteLength
    
    console.log("audioBuffer....",audioBuffer)
    console.log("audioBufferSize....",audioBufferSize)
    // 发送
    // 文件名不能太长，先自己成一个名称不用this.data.generate.file_name
    // let fileName = (Math.ceil(Date.now()/1000)).toString(16)+'.mp3'
    let fileName = importFile.name
    console.log("n00.........",fileName)
    let data = buildCMD10Data(audioBuffer,audioBufferSize,fileName)
    console.log("cmd10....",data)
    app.hextool.sendDatas(data)
  },

  cancelFileTransferQueue(){
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
  //       // await this.sleep(15); // 每个小包间隔ms
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
    // FILE_STATUS_SUCCESS = 0, 传输完成
    // FILE ENDREASON APP,APP主动取消文件传输
    // FILE END REASON DEVICES,设备主动取消文件传输
    // FILE_END_REASON_WRITE_ERR,写失败
    //FILE END REASON DATA OVER LIMIT,数据超范围
    //FILE END REASON FILE CRC ERR,文件校验最终失败
    //FILE_END_ REASON_BLOCK _CRC_ERR,件块校验失败错误
    //FILE END REASON SEQ ERR, seq
    if(deviceData[0] == 10 && deviceData[3] != 0){
      this.cancelFileTransferQueue()
      clearTimeout(this.data.sendTimer)
      this.setData({importMask: false, importPro: 0})
      let errorIndex = Number(deviceData[3]);
      let errorInfoArr = ['发送成功','文件名长度超过本地缓存','已有一个文件正在传输','设备空间不足','存储设备异常','文件过多请先删除设备文件']
      let errorInfo = errorInfoArr[errorIndex] ? errorInfoArr[errorIndex]:'发送文件信息失败'
      wx.showToast({
        icon: 'error',
        title: errorInfo,
      })
    }
    //设备要拉取的块
    if(deviceData[0] == 11){
      console.log("11111.....",deviceData)
      clearTimeout(this.data.sendTimer)
      // 获取offset,chunkSize
      let deviceDataHex = deviceData.map(v => v.toString(16).padStart(2, '0'));
      let res = this.getOffsetChunk(deviceDataHex)
      console.log("res.....",res)
      const requestedOffset = Number(res[0])
      if (Number.isFinite(requestedOffset) && this._lastFileRequestOffset === requestedOffset &&
          typeof app.hextool.slowDownWrites === 'function') {
        app.hextool.slowDownWrites(`device repeated offset ${requestedOffset}`)
      }
      this._lastFileRequestOffset = requestedOffset
      console.log("res111.....",res[0],this.data.importFile.size)
      let importPro = Math.ceil(Number(res[0]) / Number(this.data.importFile.size) * 100)
      if(typeof(importPro) === 'number'){
        importPro = importPro > 100 ? 100 : importPro;
        this.setData({ importPro })
      }
      // this.sendFileToDevice(res[0],res[1])
      sendFileToDevice(res[0],res[1], this.data.audioBuffer)
    }
    //文件传输结束
    if(deviceData[0] == 12){
      this.cancelFileTransferQueue()
      this._lastFileRequestOffset = null
      this.setData({importMask: false,importPro: 0})
      if(deviceData[3] == 0){
        wx.showToast({
          icon:'success',
          title:'导入完成'
        })
        //重新拉音乐列表
        setTimeout(() => {
          this.setData({musicList: []})
          this.initInfo()
        }, 500);
      }else{
        wx.showToast({
          icon: 'error',
          title: '导入失败',
        })
      }
    }
    //查询列表返回
    if(deviceData[0] == 13){
      wx.hideLoading();
      console.log("133333.....",deviceData)
      //没有歌曲len 为0
      if(deviceData[1] == 0 && deviceData[2] == 0 ){ return }
      // 转为hex
      let dataHex = deviceData.map(v => v.toString(16).padStart(2, '0'));
      // 去掉cmd 1字节 跟长度len2字节
      dataHex = dataHex.slice(3,dataHex.length)
      let data = dataHex.join('')
      this.handleBackMusic(data)
    }
    //删除回复
    if(deviceData[0] == 14){
      console.log("14444.....",deviceData)
      wx.hideLoading()
      clearTimeout(this.data.delTimer)
      // 0 删除成功
      if(deviceData[3] == 0){
        wx.showToast({
          icon: 'success',
          title: '删除成功',
        })
        this.handleDelItem()
        //重新拉音乐列表
        setTimeout(() => {
          this.setData({musicList: []})
          this.initInfo()
        }, 500);
      }else{
        wx.showToast({
          icon: 'error',
          title: '删除失败',
        })
      }
    }
    //播放
    if(deviceData[0] == 15 ){
      wx.hideLoading()
      if(deviceData[3] != 0){
        wx.showToast({
          icon: 'error',
          title: '播放失败',
        })
      }
    }
    //重命名
    if(deviceData[0] == 16){
      console.log("16666.....",deviceData)
      // 0 成功
      if(deviceData[3] == 0){
        wx.showToast({
          icon: 'success',
          title: '备注成功',
        })
        //成功后处理
        this.handleReName()
      }else{
        wx.showToast({
          icon: 'error',
          title: '备注失败',
        })
      }
    }
    //容量
    if(deviceData[0] == 17){
      console.log("17777.....",deviceData)
      let total = deviceData.slice(3,7)
      let totalNum = this.arrToHexToInt(total)      
      let sy = deviceData.slice(7,11)
      let syNum = this.arrToHexToInt(sy)
      let val = Math.round((totalNum - syNum) / totalNum * 100)
      this.setData({progressVal: val})
    }
  },
  arrToHexToInt(arr){
    // 转为hex
    let arrHex = arr.map(v => v.toString(16).padStart(2, '0'));
    let arrHexStr = arrHex.join('')
    return parseInt(arrHexStr,16)
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

  handleBackMusic(str){
    console.log('ssss......',str)
    let head = parseInt(str.substr(0, 2), 16);
    console.log('head......',head)
    let subNum = head * 2; //截取长度
    let item = str.substr(2, subNum - 2);//从第二个截取丢弃掉长度
    let parm = str.substr(subNum);

    let index = parseInt(item.substr(0, 4), 16)
    let size = parseInt(item.substr(4, 8), 16)
    let type = item.substr(12, 2); //02 纯英文，01 中文/中英文
    let titleUni = item.substr(14);
    let title = '';
    if (type == '01') {
      title = titleUnicode(titleUni);
    } else {
      title = titleAscii(titleUni);
    }
    let oldTitle = title.trim() //没去掉后缀的(去除空格)
    // 把文件名称后缀去掉
    title = title.replace(/\.[^/.]+$/, '');
    console.log("title..",title)
    console.log("oldTitle..",oldTitle)
    console.log("size..",size)
    console.log("index..",index)

    const itemObj = Object.assign({}, {
      index,size,title,oldTitle
    })
    console.log("itemObj...", itemObj)
    let musicList = this.data.musicList;
    console.log("musicList...", musicList)
    musicList.push(itemObj);
    this.setData({ musicList })
    if (parm.length) {
      this.handleBackMusic(parm);
    }
  },

  markMus(e){
    let id = e.currentTarget.id
    let title = this.data.musicList[id]["oldTitle"]
    console.log('title...',title)
    // let ext = title.substr(-4); //后缀 
    let ext = '.'+title.trim().split('.').pop(); //取后缀(去除空格)
    console.log('ext...',ext)
    wx.showModal({
      title: '修改备注',
      editable: true,
      complete: (res) => {
        if (res.confirm) {
          //判断名称是否与其他item 重复
          let name = this.data.musicList.find(item=>item.title == res.content)
          console.log("name....",name)
          if(name){
            wx.showToast({
              icon: 'error',
              title: '名称重复',
            })
            return
          }
          let newName = res.content + ext
          console.log('newName...',newName)
          this.data.editIndex = id
          this.data.editName = res.content
          this.reNameOfMus(title,newName)
        }
      }
    })
  },
  reNameOfMus(oldName,newName){
    let data = reNameData(oldName,newName)
    app.hextool.sendDatas(data)
  },
  handleReName(){
    let index = this.data.editIndex
    let editName = this.data.editName
    let musicList = this.data.musicList
    musicList[index]["title"] = editName
    musicList[index]["oldTitle"] = editName+'.mp3'
    this.setData({ musicList })
  },
  playMus(e){
    wx.showLoading({ title: '播放中...' })
    let id = e.currentTarget.id
    let index = this.data.musicList[id]["index"]
    let data = playMusicItem(index)
    app.hextool.sendDatas(data)
  },
  delMus(e){
    let id = e.currentTarget.id
    wx.showModal({
      title: '提示',
      content: '确定删除吗?',
      complete: (res) => {
        if (res.confirm) {
          this.delMusByIndex(id)
        }
      }
    })
  },
  delMusByIndex(id){
    this.data.delIndex = id
    wx.showLoading({ title: '删除中...'})
    this.data.delTimer && clearTimeout(this.data.delTimer)
    this.data.delTimer = setTimeout(() => {
      wx.hideLoading()
      wx.showToast({
        icon: 'error',
        title: '删除失败',
      })
    }, 6000);
    console.log(id)
    let index = this.data.musicList[id]["index"]
    let data = delMusicItem(index)
    console.log("cmd14....",data)
    app.hextool.sendDatas(data)
  },
  handleDelItem(){
    let index = this.data.delIndex
    let musicList = this.data.musicList
    musicList.splice(index,1)
    this.setData({ musicList })
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {

  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  onUnload() {
    this.cancelFileTransferQueue()
    if (this.data.sendTimer) clearTimeout(this.data.sendTimer)
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {

  }
})
