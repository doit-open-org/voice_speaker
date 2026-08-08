// pages/device/device.js
const app = getApp()
Page({

  /**
   * 页面的初始数据
   */
  data: {
    deviceInfo:[
      // {"name":'智能音箱',deviceId:'ac:11:dc:55:sd:00',connState:false}
    ],
    searchShow: false,
    voicePop: false,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    app.bletool.setCurPage(this)
    app.hextool.setCurPage(this)
    if(Object.keys(app.globalData.deviceInfo).length){
      this.setData({  deviceInfo: [app.globalData.deviceInfo]  })
    }
    //有设备时，不要重启蓝牙适配器，会导致设备断开连接
    console.log("2....................",this.data.deviceInfo.length)
    if(!this.data.deviceInfo.length){
      app.bletool.BLE_open(()=>{
          // 判断是否重连
          this.deReconnect(options)
      });
    }
  },
  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    //管理音频返回时需要设置一次
    app.bletool.setCurPage(this)
    app.hextool.setCurPage(this)
    this.setData({
      deviceInfo: [app.globalData.deviceInfo]
    })
    // setTimeout(() => {
    //   this.setData({
    //     deviceInfo: [{"name":'智能音箱',deviceId:'ac:11:dc:55:sd:00',connState:false}]
    //   })
    // }, 3000);
  },
  deReconnect(options){
    //重连
    if(options.dev){
      //先显示设备，不loading（如果设备关机或搜索不到会一直loading）
      let dev = app.globalData.reConDevInfo
      dev['reCon'] = 1 //添加重连标志
      dev['connState'] = false //显示断开     
      this.setData({deviceInfo: [dev]})
      // wx.showLoading({title: 'loading...',mask:true})
      app.bletool.BLE_start(true);
    }
  },
  searchShow(e){
    // 手动关闭searchmask组件 清空列表
    if(e?.target?.dataset?.flag && this.data.searchShow){
      this.setData({ deviceInfo: [] })
      app.globalData.deviceInfo = {}
    }
    this.setData({ searchShow: !this.data.searchShow })
    if(!this.data.searchShow){
      //停止搜索蓝牙设备
      wx.stopBluetoothDevicesDiscovery()
      wx.offBluetoothDeviceFound()
    }
    
  },
  // 连接中关闭pop
  ConClose(){
    wx.showLoading({ title: '连接中...' })
    console.log("c.................")
    this.searchShow()
  },
  reconnect(){
    app.globalData.reConDevInfo = this.data.deviceInfo[0]
    this.setData({ deviceInfo: [] })
    app.globalData.deviceInfo = {}
    // this.searchShow()
    // let searchmask = this.selectComponent("#searchmask")
    // searchmask.setData({ searchDev: [], devIndex: -1 })
    // searchmask.refresh()
    this.deReconnect({"dev":true})
  },

  showVoicePop(){
    // this.setData({
    //   voicePop: !this.data.voicePop
    // })
    wx.navigateTo({ url: '../devMusicList/devMusicList'  })
  },
  unBindDev(e){
    let deviceId = e.currentTarget.id
    wx.showModal({
      title: '提示',
      content: '确定解绑吗?',
      complete: (res) => {
        if (res.confirm) {
          this.unBindDevById(deviceId)
        }
      }
    })
  },
  unBindDevById(deviceId){
    //发送解绑命令
    let arr = app.hextool.unBindDev()
    console.log("unbind...",arr);
    app.hextool.sendDatas(arr);
    //清空
    this.setData({ deviceInfo: [] })
    app.globalData.deviceInfo = {}
    let searchmask = this.selectComponent("#searchmask")
    searchmask.setData({ searchDev: [], devIndex: -1 })
    // 缓存中移除
    wx.removeStorageSync('sbpyb2025')
  },
  handleDisCon(){
    let item = this.data.deviceInfo[0]
    if(item){
      item.connState = false
      this.setData({ deviceInfo: [item] })
    }    
  },
  //连接成功查cmd0
  BLE_event(e,deviceId='') {
    console.log("BLE_event....", e)
    if (e == 0) {
      wx.hideLoading(); //对应conClose
      wx.showToast({
        title: '连接失败',
        icon:'none'
      })
    } else if (e == 1) {
      // wx.showLoading({
      //   title: '同步数据',
      //   mask: true
      // })
      //查询cmd0 设备信息
      let cmd0 = app.hextool.getCmd0New()
      console.log("cmd0...",cmd0);
      app.hextool.sendDatas(cmd0)
    }
  },
  //查cmd0成功发送配网广播
  onBLEnet(datas) {
    console.log('onBLEnet111:', datas);
    // 设备回复 cmd 0
    if (datas[0] == 0) {
      let mutInt = datas.slice(-2);
      let mutHex = Number(mutInt[0]).toString(16).padStart(2,'0')+Number(mutInt[1]).toString(16).padStart(2,'0')
      //设备回复mtu 大小
      let mtu = parseInt(mutHex,16) - 3 // 减去3字节ATT协议头
      console.log('mmmmmmmmmmmmmmmmm...............',mtu)
      app.globalData.mtu = mtu
      //  发送设备配网信息
      let arr = app.hextool.getNetSetDatasNew()
      console.log("network...",arr[0]);
      app.hextool.sendDatas(arr[0]);
    }
    console.log('ffffffffffff1111...............')
    
    // 设备回复配网 cmd 1
    if(datas[0] == 1){
      wx.hideLoading()
      app.globalData.deviceInfo.connState = true
      this.setData({
        deviceInfo: [app.globalData.deviceInfo]
      })
      // 把连接的设备放入缓存(四博配音宝)
      wx.setStorageSync('sbpyb2025', app.globalData.deviceInfo)
    }

  },
  //设备返回信息(tcpcallback)
  onBLEdatas(deviceData) {
    console.log('onBLEdatas.....', deviceData);
  },
  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  changeTab(e){
    if(e.currentTarget.id == 1){
      // wx.switchTab({
      //   url: '../index/index',
      // })
      wx.navigateBack()
      // wx.navigateTo({
      //   url: '../index/index',
      // })
    }
    if(e.currentTarget.id == 3){
      wx.navigateTo({
        url: '../advanced/advanced'
      })
    }
    if(e.currentTarget.id == 4){
      wx.navigateTo({ url: '../mine/mine' })
    }
    
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

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {

  }
})
