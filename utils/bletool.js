let state=false
let page;

//自动重连标志位
let autoNeed=false
let autoFn=false
//连接状态监听标志位
let connectListen=false
//重连定时
let reConTimer = null

//BLE_event  0断开  1就绪


let connectInfo = {
  deviceId: "",
  // serviceId: "0000AE00-0000-1000-8000-00805F9B34FB",
  serviceId: "00001910-0000-1000-8000-00805F9B34FB",
  // writeCharacteristicsId: "00002B11-0000-1000-8000-00805F9B34FB",
  writeCharacteristicsId: "00002B12-0000-1000-8000-00805F9B34FB",
  notifyCharacteristicsId: "00002B10-0000-1000-8000-00805F9B34FB",
  indicateCharacteristicsId: "00002B10-0000-1000-8000-00805F9B34FB",
  // writeCharacteristicsId: "0000AE01-0000-1000-8000-00805F9B34FB",
  // notifyCharacteristicsId: "0000AE02-0000-1000-8000-00805F9B34FB",
  // indicateCharacteristicsId: "0000AE02-0000-1000-8000-00805F9B34FB",
}

function setCurPage(t) {
  page = t
}

//BLE
function BLE_open(fn) {
  // state=false
  // connectInfo.deviceId=""
  wx.closeBluetoothAdapter()
  setTimeout(function(){
    wx.openBluetoothAdapter({
      success: function (res) {
        // BLE_find();
        console.log("openSuc....")
        fn()
      },
      fail: function (err) {
        wx.showToast({
          // title: page.data.lang['bletips1'],
          title: '请先打开手机蓝牙和位置信息',
          icon: "none",
          duration: 3000
        })
      }
    })
  },500)
}

function BLE_connectLast(e) {
  // state=false
  // connectInfo.deviceId=""
  wx.closeBluetoothAdapter()
  setTimeout(function(){
    wx.openBluetoothAdapter({
      success: function (res) {
        BLE_connect(e)
      },
      fail: function (err) {
        wx.showToast({
          // title: page.data.lang['bletips1'],
          title: '请先打开手机蓝牙和位置信息',
          icon: "none",
          duration: 3000
        })
      }
    })
  },500)
}


function BLE_start(ff=false) {
  console.log("BLE_start...")
  state=false
  connectInfo.deviceId=""
  wx.closeBluetoothAdapter()
  setTimeout(function(){
    wx.openBluetoothAdapter({
      success: function (res) {
        if(ff){
          searchCondDev();
        }else{
          BLE_find();
        }
      },
      fail: function (err) {
        wx.showToast({
          // title: page.data.lang['bletips1'],
          title: '请先打开手机蓝牙和位置信息',
          icon: "none",
          duration: 3000
        })
      }
    })
  },500)
}

function searchCondDev() {
  let app = getApp()
  reConTimer = setTimeout(() => {
    wx.stopBluetoothDevicesDiscovery();
    wx.offBluetoothDeviceFound();
    wx.hideLoading()
    wx.showToast({ title: '没有发现设备',icon:'error' })
    page.setData({deviceInfo:[]})
  }, 60000);
  wx.startBluetoothDevicesDiscovery({
    allowDuplicatesKey: false,
    powerLevel: 'high',
    success: function (res) {
      wx.onBluetoothDeviceFound((rest) => {
        console.log(rest);
        rest.devices.forEach(function(device){
          if(device['deviceId'] == app.globalData.reConDevInfo.deviceId){
            wx.offBluetoothDeviceFound();
            clearTimeout(reConTimer)
            // device['name'] = '智能音箱';
            device['name'] = '配音宝';
            device['connState'] = false
            // let deviceInfo = [];
            // deviceInfo.push(device);
            // page.setData({ deviceInfo })
            app.globalData.deviceInfo = device
            //连接设备
            BLE_connect(device['deviceId'])
          }
        })
       
      })
    },
    fail: function (e) {
      wx.stopBluetoothDevicesDiscovery();
      BLE_erro(res)
    }
  })
}
//离开设备页面就不在搜索重连
function BLE_stopReconnectSearch(){
  console.log('000....');
  if(reConTimer){
    clearTimeout(reConTimer)
    reConTimer = null
    wx.stopBluetoothDevicesDiscovery();
    wx.offBluetoothDeviceFound();
  }
}

function BLE_find() {
  let app=getApp();
  wx.startBluetoothDevicesDiscovery({
    allowDuplicatesKey: false,
    success: function (res) {
      wx.onBluetoothDeviceFound((rest) => {
        console.log(rest);
        rest.devices.forEach(function(device){
          if (!device.name || !device.localName||device.localName.toLowerCase().indexOf("tt") == -1||device.advertisData.length==0) {

          }else{
            let datas= new Uint8Array(device.advertisData);
            let pid = Uint8ToStr([datas[11],datas[12],datas[13],datas[14],datas[15],datas[16]])
            console.log("pid...",pid);
            let pushFlag = true;
            if(app.util.uuidCheck(device.advertisServiceUUIDs[0]) && pid == 'p49857'){
              console.log('d...',device);
              wx.hideLoading()//对应index--refresh
              for (let i = 0; i < page.data.deviceInfo.length; i++) {
                if(device['deviceId'] == page.data.deviceInfo[i]['deviceId']){
                  pushFlag = false;
                }
              }
              if(pushFlag){
                //判断是否有缓存名称
                // device['name'] = '智能音箱';
                device['name'] = '配音宝';
                device['connState'] = false
                // page.data.deviceInfo.push(device);    
                let searchmask = page.selectComponent("#searchmask")
                searchmask.setData({searchDev: [device] })
                app.globalData.deviceInfo = device
              }
            }
            
          }
        })
        // page.setData({
        //   deviceInfo: page.data.deviceInfo
        // })

      })
    },
    fail: function (e) {
      wx.stopBluetoothDevicesDiscovery();
      BLE_erro(res)
    }
  })
}

//byte数组转字符
function Uint8ToStr(arr){
  for (var i = 0,str=''; i < arr.length; i++) 
    str+= String.fromCharCode(arr[i]);
  return str;
}

function BLE_closeFind(){
  // page.setData({
  //   deviceInfo: []
  // })
  
  page.BLE_event(0);
  wx.stopBluetoothDevicesDiscovery();
  wx.closeBluetoothAdapter();
  wx.openBluetoothAdapter()
}

function close_ble_connect(e){
  wx.closeBLEConnection({
    deviceId: e?e:connectInfo.deviceId,
  })
  wx.stopBluetoothDevicesDiscovery();
}

function BLE_connect(e) {
  //停止扫描后再连接
  wx.stopBluetoothDevicesDiscovery({
    complete:()=>{
      setTimeout(() => {
        creat_connect(e);
      }, 500);
    }
  });
}

function  creat_connect(e){
  wx.createBLEConnection({
    deviceId: e?e:connectInfo.deviceId,
    timeout: 15000,
    success: function (res) {
      console.log("con..su..")
      connectInfo.deviceId = e?e:connectInfo.deviceId
      getApp().globalData.deviceId = e ? e : connectInfo.deviceId
      BLE_aotuUUID();
      //设备已经set，小程序不需要set了
      //连接成功 协商mtu
      // if(!getApp().globalData.isIOS){
      //   negotiateMTU()
      // }
    },
    fail: function (res) {
      console.log("con..fail..",res)
      // if(res.errCode == -1){ // 设备已连接
      //   wx.closeBluetoothAdapter()
      //   setTimeout(()=>{
      //     wx.openBluetoothAdapter()
      //     BLE_connect(connectInfo.deviceId)
      //   },500)
      //   return;
      // }
      wx.hideLoading();
      BLE_erro(res)
      // if(autoFn&&connectInfo.deviceId!=""){
      //   wx.closeBluetoothAdapter({
      //     success: (res) => {},
      //   })
      //   wx.openBluetoothAdapter({
      //     success: function (res) {

      //     }
      //   })
      //   BLE_connect(connectInfo.deviceId)
      // }else{
      //   autoFn=false
      // }
    }
  })
}

function BLE_aotuUUID() {
  console.log("BLE_aotuUUID....")
  wx.getBLEDeviceServices({
    deviceId: connectInfo.deviceId,
    success: function (res) {
      console.log(res);
      // setTimeout(function () {
        wx.getBLEDeviceCharacteristics({
          deviceId: connectInfo.deviceId,
          serviceId: connectInfo.serviceId,
          success: function (res) {
            console.log(res);
            BLE_notifyAndlisten();
          },
          fail: function (res) {
            console.log("BLE_aotuUUIDfail1....")
            BLE_erro(res)
          }
        })
      // }, 500)
    },
    fail: function (res) {
      console.log("BLE_aotuUUIDfail2....")
      BLE_erro(res)
    }
  })
}

function BLE_notifyAndlisten() {
  wx.notifyBLECharacteristicValueChange({
    characteristicId: connectInfo.notifyCharacteristicsId,
    deviceId: connectInfo.deviceId,
    serviceId: connectInfo.serviceId,
    state: true,
    success: function (res) {
      console.log("notify启动成功\n", res);
      wx.showToast({
        // title: page.data.lang['bletips2'],
        title: '连接成功',
        icon:'success',
        duration:2000
      })
      page.BLE_event(1,connectInfo.deviceId);
      state=true
      BLE_haveHex(); 
      // if(autoNeed)BLE_connectState()
      BLE_connectState()
      //连接成功后同步数据
      // setTimeout(function(){
        // page.sendAutoHex();
      // },600)
    },
    fail: function (res) {
      console.log("BLE_notifyAndlistenFail....")
      BLE_erro(res)
    }
  })
}

function BLE_connectState(){
  // if(connectListen)return
  connectListen=true;
  console.log("state.............")
  wx.onBLEConnectionStateChange(function(res) {
    // 该方法回调中可以用于处理连接意外断开等异常情况
    console.log(`device ${res.deviceId} state has changed, connected: ${res.connected}`)
    console.log("BLE_connectState...",res.connected)
    if(res.connected){
      autoFn = false;
      // page.setData({ connState: true })
      getApp().globalData.deviceInfo.connState = true
    }
    if(!res.connected){
      // autoConnect();
      // page.setData({ connState: false })
      if(getApp().globalData.deviceInfo.connState){
        wx.showModal({
          title: '蓝牙已断开',
          content: '请重新连接设备',
          showCancel: false,
          complete: (res) => {}
        })
        // 如果处于发送状态则停止
        if(page && page.data.importMask){
          page.setData({importMask: false,importPro: 0})
        }
      }
      getApp().globalData.deviceInfo.connState = false
      //处理离线
      if(page && typeof(page.handleDisCon) == 'function'){
        page.handleDisCon()
      }
    }
  })
}

function autoConnect(){
  if(!autoFn&&connectInfo.deviceId!=""){
    autoFn=true
    BLE_connect(connectInfo.deviceId) 
  }
  
}


function BLE_haveHex() {
  let app=getApp()
  wx.onBLECharacteristicValueChange(function (res) {
    console.log("接收：", res.value);
    // page.onBLEdatas(res.value);
    app.hextool.bleDatasBack(res.value)
  });
}

function BLE_writeHex(order) {
  let sendDatas = new Uint8Array(order.length);
  for (let i = 0; i < order.length; i++) {
    sendDatas[i] = order[i]
  }
  wx.writeBLECharacteristicValue({
    characteristicId: connectInfo.writeCharacteristicsId,
    deviceId: connectInfo.deviceId,
    serviceId: connectInfo.serviceId,
    value: sendDatas.buffer,
    success: function (res) {
      // console.log("BLE_writeHex:",order);
      // console.log(res);
    },
    fail: function (res) {
      console.log("写入fail：", res);
      BLE_erro(res)
    }

  })
}
function sendMsg(order) {
  if(!state){
    console.log("ble-sendMsg-state: "+state)
    return
  }
  let sendDatas = new Uint8Array(order.length);
  for (let i = 0; i < order.length; i++) {
    sendDatas[i] = order[i]
  }
  console.log("sendDatas....",sendDatas)
  wx.writeBLECharacteristicValue({
    characteristicId: connectInfo.writeCharacteristicsId,
    deviceId: connectInfo.deviceId,
    serviceId: connectInfo.serviceId,
    value: sendDatas.buffer,
    success: function (res) {
      console.log("sendMsg...",order);
      // console.log(res);
    },
    fail: function (res) {
      console.log("sendMsgFail...",JSON.stringify(res));
      BLE_erro(res)
    }

  })
}

function BLE_erro(e){
  page.BLE_event(0);
  state=false
  // wx.closeBluetoothAdapter();
  wx.showToast({
    // title: page.data.lang['bletips3'],
    title: '设备连接失败',
    icon:'none',
    duration:3000
  })
  console.log(e);
}



function BLE_event(){

}
// 5. 协商MTU
async function negotiateMTU(mtu = 512) {
  return new Promise((resolve, reject) => {
    wx.setBLEMTU({
      deviceId: connectInfo.deviceId,
      mtu: mtu, // 请求最大MTU
      success: (res) => {
        // this.mtuSize = res.mtu - 3; // 减去3字节ATT协议头
        // console.log(`✓ MTU协商成功: ${res.mtu}字节 (可用${this.mtuSize}字节)`);
        getApp().globalData.mtu = res.mtu  - 3 // 减去3字节ATT协议头
        console.log("m....",getApp().globalData.mtu)
        resolve(res.mtu);
      },
      fail: (err) => {
        console.warn('⚠ MTU协商失败，使用默认20字节:', err);
        resolve(23); // 默认MTU
      }
    });
  });
}

module.exports = {
  setCurPage,
  BLE_writeHex,
  BLE_start,
  BLE_open,
  BLE_connect,
  close_ble_connect,
  BLE_closeFind,
  BLE_connectLast,
  state,
  sendMsg,
  negotiateMTU,
  BLE_stopReconnectSearch
}