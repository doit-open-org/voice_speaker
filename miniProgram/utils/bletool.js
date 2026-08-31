let state=false
let page;
let writeType = null

const BLE_WRITE_TIMEOUT = 2000

//自动重连标志位
let autoNeed=false
let autoFn=false
//连接状态监听标志位
let connectListen=false
//重连定时
let reConTimer = null
let knownDeviceScanCancel = null
let connectionStateHandler = null
let characteristicValueHandler = null

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

function updateWriteType(characteristics) {
  const characteristic = (characteristics || []).find(item =>
    item && String(item.uuid || "").toLowerCase() === connectInfo.writeCharacteristicsId.toLowerCase()
  )
  const properties = characteristic && characteristic.properties
  if (!properties) return

  // 该设备的数据通道使用无响应写；iOS 强制 write 会返回 10007。
  if (properties.writeNoResponse) writeType = "writeNoResponse"
  else if (properties.write) writeType = "write"

  if (writeType) console.log("BLE write type:", writeType, properties)
}

function clearPendingWrites() {
  const app = getApp()
  if (app.hextool && typeof app.hextool.cancelQueuedDatas === "function") {
    app.hextool.cancelQueuedDatas()
  }
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

function BLE_prepareAdapter() {
  return new Promise((resolve, reject) => {
    wx.openBluetoothAdapter({
      success: resolve,
      fail: reject
    })
  })
}

async function BLE_scanAvailableDevices() {
  await BLE_prepareAdapter()
  BLE_find()
}

function BLE_findKnownDevices(devices, timeout = 12000) {
  const candidates = Array.isArray(devices) ? devices.filter(item => item && item.deviceId) : []
  if (!candidates.length) return Promise.resolve([])

  if (knownDeviceScanCancel) knownDeviceScanCancel()
  const deviceIds = new Set(candidates.map(item => item.deviceId))

  return new Promise((resolve, reject) => {
    const foundDevices = new Map()
    let scanTimer = null
    let settled = false

    const cleanup = () => {
      if (scanTimer) clearTimeout(scanTimer)
      wx.offBluetoothDeviceFound(onDeviceFound)
      wx.stopBluetoothDevicesDiscovery()
      if (knownDeviceScanCancel === cancel) knownDeviceScanCancel = null
    }
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      cleanup()
      callback(value)
    }
    const complete = () => {
      const orderedDevices = candidates
        .map(item => foundDevices.get(item.deviceId))
        .filter(Boolean)
      finish(resolve, orderedDevices)
    }
    const cancel = () => finish(resolve, [])
    const onDeviceFound = (result) => {
      const devicesFound = result && Array.isArray(result.devices) ? result.devices : []
      devicesFound.forEach((device) => {
        if (device && deviceIds.has(device.deviceId)) {
          foundDevices.set(device.deviceId, device)
        }
      })
      if (foundDevices.size === deviceIds.size) complete()
    }

    knownDeviceScanCancel = cancel
    wx.startBluetoothDevicesDiscovery({
      allowDuplicatesKey: true,
      powerLevel: 'high',
      success: () => {
        wx.onBluetoothDeviceFound(onDeviceFound)
        scanTimer = setTimeout(complete, timeout)
      },
      fail: error => finish(reject, error)
    })
  })
}

function searchCondDev() {
  let app = getApp()
  reConTimer = setTimeout(() => {
    reConTimer = null
    wx.stopBluetoothDevicesDiscovery();
    wx.offBluetoothDeviceFound();
    wx.hideLoading()
    wx.showToast({ title: '没有发现设备',icon:'error' })
    if(page && typeof page.handleReconnectSearchFailure === 'function'){
      page.handleReconnectSearchFailure()
    }
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
            reConTimer = null
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
      BLE_erro(e)
    }
  })
}
//离开设备页面就不在搜索重连
function BLE_stopReconnectSearch(){
  console.log('000....');
  if(knownDeviceScanCancel){
    knownDeviceScanCancel()
    knownDeviceScanCancel = null
  }
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
    allowDuplicatesKey: true,
    powerLevel: 'high',
    success: function (res) {
      wx.offBluetoothDeviceFound();
      wx.onBluetoothDeviceFound((rest) => {
        console.log(rest);
        rest.devices.forEach(function(device){
          if (!device || !device.deviceId || !device.name || !device.localName) return
          if (device.localName.toLowerCase().indexOf("tt") == -1) return
          if (!device.advertisData || device.advertisData.byteLength < 17) return

          const serviceUUID = Array.isArray(device.advertisServiceUUIDs) && device.advertisServiceUUIDs[0]
          if (!serviceUUID || !app.util.uuidCheck(serviceUUID)) return

          let datas= new Uint8Array(device.advertisData);
          let pid = Uint8ToStr([datas[11],datas[12],datas[13],datas[14],datas[15],datas[16]])
          console.log("pid...",pid);
          if(pid != 'p49857') return

          console.log('d...',device);
          wx.hideLoading()//对应index--refresh
          const displayDevice = Object.assign({}, device, {
            name: '配音宝',
            connState: false
          })
          let searchmask = page.selectComponent("#searchmask")
          if(searchmask && typeof searchmask.upsertSearchDevice === 'function'){
            searchmask.upsertSearchDevice(displayDevice)
          }
        })
        // page.setData({
        //   deviceInfo: page.data.deviceInfo
        // })

      })
    },
    fail: function (e) {
      wx.stopBluetoothDevicesDiscovery();
      BLE_erro(e)
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
  return new Promise((resolve, reject) => {
    wx.closeBLEConnection({
      deviceId: e?e:connectInfo.deviceId,
      success: resolve,
      fail: reject
    })
    wx.stopBluetoothDevicesDiscovery();
  })
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
  writeType = null
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
            updateWriteType(res.characteristics)
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
  if(connectionStateHandler && typeof wx.offBLEConnectionStateChange === 'function'){
    wx.offBLEConnectionStateChange(connectionStateHandler)
  }
  connectListen=true;
  console.log("state.............")
  connectionStateHandler = function(res) {
    // 该方法回调中可以用于处理连接意外断开等异常情况
    console.log(`device ${res.deviceId} state has changed, connected: ${res.connected}`)
    console.log("BLE_connectState...",res.connected)
    const currentDevice = getApp().globalData.deviceInfo || {}
    if(currentDevice.deviceId && res.deviceId !== currentDevice.deviceId){
      console.log("ignore stale BLE state event", res.deviceId)
      return
    }
    if(res.connected){
      autoFn = false;
      // page.setData({ connState: true })
      getApp().globalData.deviceInfo.connState = true
    }
    if(!res.connected){
      state=false
      clearPendingWrites()
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
  }
  wx.onBLEConnectionStateChange(connectionStateHandler)
}

function autoConnect(){
  if(!autoFn&&connectInfo.deviceId!=""){
    autoFn=true
    BLE_connect(connectInfo.deviceId) 
  }
  
}


function BLE_haveHex() {
  let app=getApp()
  if(characteristicValueHandler && typeof wx.offBLECharacteristicValueChange === 'function'){
    wx.offBLECharacteristicValueChange(characteristicValueHandler)
  }
  characteristicValueHandler = function (res) {
    console.log("接收：", res.value);
    // page.onBLEdatas(res.value);
    app.hextool.bleDatasBack(res.value)
  }
  wx.onBLECharacteristicValueChange(characteristicValueHandler);
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
  return new Promise((resolve, reject) => {
    if(!state){
      reject({ errCode: 10006, errMsg: "BLE connection is not ready" })
      return
    }

    let sendDatas = new Uint8Array(order.length);
    for (let i = 0; i < order.length; i++) {
      sendDatas[i] = order[i]
    }

    let settled = false
    let timeout = null
    const finish = (callback, result) => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      callback(result)
    }
    timeout = setTimeout(() => {
      finish(reject, { errCode: 10012, errMsg: "BLE write timeout" })
    }, BLE_WRITE_TIMEOUT)

    const firstWriteType = writeType
    const fallbackWriteType = firstWriteType === "write"
      ? "writeNoResponse"
      : (firstWriteType === "writeNoResponse" ? "write" : "writeNoResponse")
    let fallbackAttempted = false

    const write = (currentWriteType) => {
      const options = {
        characteristicId: connectInfo.writeCharacteristicsId,
        deviceId: connectInfo.deviceId,
        serviceId: connectInfo.serviceId,
        value: sendDatas.buffer,
        success: result => {
          if (currentWriteType) writeType = currentWriteType
          finish(resolve, result)
        },
        fail: error => {
          const errorCode = Number(error && error.errCode)
          const propertyNotSupported = errorCode === 10007 || errorCode === 1007
          if (propertyNotSupported && !fallbackAttempted) {
            fallbackAttempted = true
            console.warn("BLE write type fallback:", currentWriteType || "default", "->", fallbackWriteType)
            write(fallbackWriteType)
            return
          }
          finish(reject, error)
        }
      }
      if (currentWriteType) options.writeType = currentWriteType
      try {
        wx.writeBLECharacteristicValue(options)
      } catch (error) {
        finish(reject, error)
      }
    }
    write(firstWriteType)
  })
}

function handleWriteFailure(error) {
  console.error("BLE write failed", error)
  BLE_erro(error)
}

function BLE_erro(e){
  clearPendingWrites()
  const handled = page && typeof page.BLE_event === "function"
    ? page.BLE_event(0, connectInfo.deviceId, e) === true
    : false
  state=false
  // wx.closeBluetoothAdapter();
  if(!handled){
    wx.showToast({
      // title: page.data.lang['bletips3'],
      title: '设备连接失败',
      icon:'none',
      duration:3000
    })
  }
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
  BLE_prepareAdapter,
  BLE_scanAvailableDevices,
  BLE_findKnownDevices,
  BLE_open,
  BLE_connect,
  close_ble_connect,
  BLE_closeFind,
  BLE_connectLast,
  state,
  sendMsg,
  handleWriteFailure,
  negotiateMTU,
  BLE_stopReconnectSearch
}
