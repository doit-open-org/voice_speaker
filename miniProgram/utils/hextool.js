

let curPage = null

let hexDatas = ""
let bleDatasList = []
let bleDatasBackArr = []

let sendFun = null
let isSending = false
let writeDelay = null

const FILE_TRANSFER_QUEUE_KEY = "file-transfer"
const DEFAULT_WRITE_DELAY = 5
const UNKNOWN_ANDROID_WRITE_DELAY = 15
const HUAWEI_P70_WRITE_DELAY = 30
const MAX_WRITE_RETRIES = 3
const RETRYABLE_WRITE_ERRORS = [10008, 10012]

function getCurPage() {
  return curPage
}

function setCurPage(page) {
  curPage = page
}

//获取配网指令
function getNetSetDatas() {
  let data = [1, 153]
  for (let i = 0; i < 102; i++) {
    data.push(0)
  }
  let key = getBleDeviceKey()
  data = data.concat(key)
  for (let j = 0; j < 41; j++) {
    data.push(0)
  }
  let ne = []
  for (let k = 0; k < 10; k++) {
    ne.push(0)
  }
  ne = data.concat(ne)
  ne[1] = 163
  return [data, ne]
}

//获取配网指令--新版
function getNetSetDatasNew() {
  // 0,153表示len长度，新版长度占两个字节
  let data = [1, 0, 153]
  for (let i = 0; i < 102; i++) {
    data.push(0)
  }
  let key = getBleDeviceKey()
  data = data.concat(key)
  for (let j = 0; j < 41; j++) {
    data.push(0)
  }
  let ne = []
  for (let k = 0; k < 10; k++) {
    ne.push(0)
  }
  ne = data.concat(ne)
  ne[2] = 163
  return [data, ne]
}

//发送蓝牙指令
function sendDatas(datas, options = {}) {
  // 根据协商后的mtu处理
  // if(getApp().globalData.mtu == 20){
  //   bleDatasFix(datas)
  // }else{
  //   bleDatasFixLarge(datas)
  // }
  bleDatasFixLarge(datas, options.queueKey || null)
  
  if (!sendFun) toDispatch()
}

//蓝牙指令分包---20
function bleDatasFix(datas, queueKey = null) {
  let hex = []
  let count = 0
  for (let i = 0; i < datas.length; i += 17) {
    hex = datas.slice(i, i + 17)
    hex.unshift(count)

    hex.unshift(1)
    if (hex.length != 19) {
      let cha = 19 - hex.length
      for (let j = 0; j < cha; j++) {
        hex.push(0)
      }
    }
    if (count == parseInt(datas.length / 17)) {
      hex[1] = hex[1] + 128
    }
    count += 1
    hex.push(crc8(hex))
    bleDatasList.push({
      data: hex,
      queueKey,
      retryCount: 0
    })
  }
}

//蓝牙指令分包---512
function bleDatasFixLarge(buf, queueKey = null) {
  const protocol_ver = 0x04;
  const header_size = 1 + 2 + 2; // ver + pkg_sn + data_len
  const crc_size = 1;
  let mtu = getApp().globalData.mtu
  console.log("sm.........",mtu)
  const max_payload = mtu - header_size - crc_size;
  let offset = 0;
  let pkg_sn = 0;

  while (offset < buf.length) {
      let chunk_len = buf.length - offset;
      if (chunk_len > max_payload)
          chunk_len = max_payload;

      let packet = [];
      // 协议头1字节
      packet.push(protocol_ver);

      let sn_field = pkg_sn;
      if (offset + chunk_len >= buf.length) {
          sn_field |= 0x8000;     // 最后一包
      }
      // SEQ 2字节高低字节 大端序 (小端序则交换位置)
      packet.push((sn_field >> 8) & 0xFF);
      packet.push(sn_field & 0xFF);

      // LEN 2字节数据长度
      packet.push((chunk_len >> 8) & 0xFF);
      packet.push(chunk_len & 0xFF);

      // 数据区
      for (let i = 0; i < chunk_len; i++) {
          packet.push(buf[offset + i]);
      }

      // CRC
      let crc = crc8(packet);
      packet.push(crc);

      // -------------------------
      // 这里替换成你的 BLE 发送函数
      // sendBLE(Uint8Array.from(packet));
      // -------------------------
      bleDatasList.push({
        data: packet,
        queueKey,
        retryCount: 0
      })

      // console.log("HEX:", Buffer.from(packet).toString("hex"));

      offset += chunk_len;
      pkg_sn++;
  }
}

const CHECKSUM_TABLE = [
  0x00, 0x07, 0x0e, 0x09, 0x1c, 0x1b,
  0x12, 0x15, 0x38, 0x3f, 0x36, 0x31, 0x24, 0x23, 0x2a,
  0x2d, 0x70, 0x77, 0x7e, 0x79, 0x6c, 0x6b, 0x62, 0x65,
  0x48, 0x4f, 0x46, 0x41, 0x54, 0x53, 0x5a, 0x5d, 0xe0,
  0xe7, 0xee, 0xe9, 0xfc, 0xfb, 0xf2, 0xf5, 0xd8, 0xdf,
  0xd6, 0xd1, 0xc4, 0xc3, 0xca, 0xcd, 0x90, 0x97, 0x9e,
  0x99, 0x8c, 0x8b, 0x82, 0x85, 0xa8, 0xaf, 0xa6, 0xa1,
  0xb4, 0xb3, 0xba, 0xbd, 0xc7, 0xc0, 0xc9, 0xce, 0xdb,
  0xdc, 0xd5, 0xd2, 0xff, 0xf8, 0xf1, 0xf6, 0xe3, 0xe4,
  0xed, 0xea, 0xb7, 0xb0, 0xb9, 0xbe, 0xab, 0xac, 0xa5,
  0xa2, 0x8f, 0x88, 0x81, 0x86, 0x93, 0x94, 0x9d, 0x9a,
  0x27, 0x20, 0x29, 0x2e, 0x3b, 0x3c, 0x35, 0x32, 0x1f,
  0x18, 0x11, 0x16, 0x03, 0x04, 0x0d, 0x0a, 0x57, 0x50,
  0x59, 0x5e, 0x4b, 0x4c, 0x45, 0x42, 0x6f, 0x68, 0x61,
  0x66, 0x73, 0x74, 0x7d, 0x7a, 0x89, 0x8e, 0x87, 0x80,
  0x95, 0x92, 0x9b, 0x9c, 0xb1, 0xb6, 0xbf, 0xb8, 0xad,
  0xaa, 0xa3, 0xa4, 0xf9, 0xfe, 0xf7, 0xf0, 0xe5, 0xe2,
  0xeb, 0xec, 0xc1, 0xc6, 0xcf, 0xc8, 0xdd, 0xda, 0xd3,
  0xd4, 0x69, 0x6e, 0x67, 0x60, 0x75, 0x72, 0x7b, 0x7c,
  0x51, 0x56, 0x5f, 0x58, 0x4d, 0x4a, 0x43, 0x44, 0x19,
  0x1e, 0x17, 0x10, 0x05, 0x02, 0x0b, 0x0c, 0x21, 0x26,
  0x2f, 0x28, 0x3d, 0x3a, 0x33, 0x34, 0x4e, 0x49, 0x40,
  0x47, 0x52, 0x55, 0x5c, 0x5b, 0x76, 0x71, 0x78, 0x7f,
  0x6a, 0x6d, 0x64, 0x63, 0x3e, 0x39, 0x30, 0x37, 0x22,
  0x25, 0x2c, 0x2b, 0x06, 0x01, 0x08, 0x0f, 0x1a, 0x1d,
  0x14, 0x13, 0xae, 0xa9, 0xa0, 0xa7, 0xb2, 0xb5, 0xbc,
  0xbb, 0x96, 0x91, 0x98, 0x9f, 0x8a, 0x8d, 0x84, 0x83,
  0xde, 0xd9, 0xd0, 0xd7, 0xc2, 0xc5, 0xcc, 0xcb, 0xe6,
  0xe1, 0xe8, 0xef, 0xfa, 0xfd, 0xf4, 0xf3
];

function crc8(buffer) {
  let crc = new Uint8Array(1);
  crc = 0;
  for (let i = 0; i < buffer.length; i++) {
    crc = CHECKSUM_TABLE[(crc ^ (buffer[i] & 0xFF)) & 0xFF];
  }
  return (crc & 0xff);
}

function crc8maxin(datas) {
  let a = 0;
  for (let i = 0; i < datas.length; i++) {
    a = a ^ datas[i];
    for (var j = 0; j < 8; j++) {
      if (a & 1) {
        a = (a >> 1) ^ 140;
      } else {
        a = (a >>= 1)
      }
    }
  }
  return a;
}


function clearDatas() {
  hexDatas = ""
}

function getDeviceInfo() {
  try {
    if (typeof wx.getDeviceInfo === "function") return wx.getDeviceInfo() || {}
    if (typeof wx.getSystemInfoSync === "function") return wx.getSystemInfoSync() || {}
  } catch (error) {
    console.warn("get BLE device profile failed", error)
  }
  return {}
}

function getInitialWriteDelay() {
  const info = getDeviceInfo()
  const brand = String(info.brand || "").toLowerCase()
  const model = String(info.model || "").toLowerCase()
  const platform = String(info.platform || "").toLowerCase()
  const isHuawei = brand.includes("huawei") || model.includes("huawei")
  const isHuaweiP70 = isHuawei && (
    model.includes("pura 70") || model.includes("pura70") || model.includes("p70")
  )

  if (isHuaweiP70) return HUAWEI_P70_WRITE_DELAY
  if (model && model !== "unknown") return DEFAULT_WRITE_DELAY
  if (platform === "android" || platform === "ohos") return UNKNOWN_ANDROID_WRITE_DELAY
  return DEFAULT_WRITE_DELAY
}

function getWriteDelay() {
  if (writeDelay === null) {
    writeDelay = getInitialWriteDelay()
    console.log("BLE write delay:", writeDelay, "ms")
  }
  return writeDelay
}

function increaseWriteDelay() {
  const current = getWriteDelay()
  if (current < 10) writeDelay = 10
  else if (current < 20) writeDelay = 20
  else writeDelay = 30
  return writeDelay
}

function slowDownWrites(reason = "transfer feedback") {
  const nextDelay = increaseWriteDelay()
  console.warn("BLE write delay increased:", nextDelay, "ms", reason)
  return nextDelay
}

function getErrorCode(error) {
  const code = Number(error && error.errCode)
  return Number.isFinite(code) ? code : null
}

function isRetryableWriteError(error) {
  return RETRYABLE_WRITE_ERRORS.includes(getErrorCode(error))
}

function scheduleDispatch(delay = getWriteDelay()) {
  if (sendFun || isSending || bleDatasList.length === 0) return
  sendFun = setTimeout(dispatchNext, delay)
}

async function dispatchNext() {
  sendFun = null
  if (isSending || bleDatasList.length === 0) return

  const app = getApp()
  const item = bleDatasList[0]
  isSending = true

  try {
    await app.bletool.sendMsg(item.data)
    if (bleDatasList[0] === item) bleDatasList.shift()
  } catch (error) {
    if (bleDatasList[0] === item) {
      item.retryCount += 1
      const canRetry = isRetryableWriteError(error) && item.retryCount <= MAX_WRITE_RETRIES

      if (canRetry) {
        const nextDelay = increaseWriteDelay()
        console.warn("BLE write retry:", item.retryCount, "delay:", nextDelay, "ms", error)
      } else {
        bleDatasList = []
        if (app.bletool && typeof app.bletool.handleWriteFailure === "function") {
          app.bletool.handleWriteFailure(error)
        } else {
          console.error("BLE write failed", error)
        }
      }
    }
  } finally {
    isSending = false
  }

  scheduleDispatch()
}

function toDispatch() {
  scheduleDispatch()
}

function cancelQueuedDatas(queueKey) {
  if (queueKey) {
    bleDatasList = bleDatasList.filter(item => item.queueKey !== queueKey)
  } else {
    bleDatasList = []
  }

  if (bleDatasList.length === 0 && sendFun) {
    clearTimeout(sendFun)
    sendFun = null
  }
}


//获取发送到蓝牙端的devicekey
function getBleDeviceKey() {
  let b = [56, 57, 49, 48, 49, 57, 57, 57, 52, 56]
  return b
}

//面板sendCmd处理 datas={1:1,2:0,6:'ac0a0f0a....'}
function sendCmd(datas) {
  console.log(datas);
  if (Object.keys(datas).length == 0) return
  let app = getApp()
  //判断当前面板设备是用哪种通信方式
  // if (app.globalData.openDeviceInfo.network == "01") {
    if (true) {
    //数据重组发到蓝牙分包
    //1、获取所有key  value  2、拼接数组
    let str = []
    for (let key in datas) {
      str.push(3)
      let len = 1
      let ha = null
      if (isNaN(datas[key])) {
        ha=hexStr2intArr(datas[key])
      } else {
        ha=intTo255Arr(datas[key])
      }
      len+=ha.length
      str.push(len)
      str.push(parseInt(key))
      str=str.concat(ha)
    }
    console.log('str....',str)
    sendDatas(str)
  } else {
    //无需重组直接socket通信
    app.dispatch.type.socket.sendMsg(datas)
  }

}



//面板queryDevice处理 attr=[0,14]
function queryDevice(datas) {
  if (datas.length == 0) return
  let app = getApp()
  //判断当前面板设备是用哪种通信方式
  // if (app.globalData.openDeviceInfo.network == "01") {
    if (true) {
    //数据重组发到蓝牙分包
    //1、获取所有key  value  2、拼接数组
    let str = []
    str.push(2)
    str.push(datas.length)
    for (let index in datas) {
      str.push(parseInt(datas[index]))
    }
    console.log("queryDevice",str)
    sendDatas(str)
  } else {
    //无需重组直接socket通信
    app.dispatch.type.socket.queryDevice(datas)
  }

}


//16进制字符串转为int数组
function hexStr2intArr(hex) {
  let b = []
  if (hex.length % 2 != 0) {
    return b
  }
  for (let i = 0; i < hex.length; i += 2) {
    b.push(parseInt(hex.substring(i, i + 2), 16))
  }
  return b
}

//获取当前时间戳的16进制数
function timestampToHexIntArray() {
  let b = parseInt(new Date().getTime() / 1000).toString(16)
  let c = [1, 1, 1, 1]
  c[3] = parseInt(b.substring(0, 2), 16)
  c[2] = parseInt(b.substring(2, 4), 16)
  c[1] = parseInt(b.substring(4, 6), 16)
  c[0] = parseInt(b.substring(6, 8), 16)
  return c;
}

//获取CMD0
function getCmd0() {
  let c = timestampToHexIntArray()
  c.unshift(4)
  c.unshift(0)
  return c
}

//获取CMD0 -- 新版查0
function getCmd0New() {
  let c = timestampToHexIntArray()
  c.unshift(4)
  c.unshift(0) //多占一个字节
  c.unshift(0)
  return c
}


//蓝牙数据返回组包
function bleDatasBack(res) {
  let datas = Array.from(new Uint8Array(res));
  console.log('deviceBackDatas::', datas);
  //mut512处理
  // if(getApp().globalData.mtu >20){
  //   bleLargeDatasBack(datas)
  //   return
  // }
  bleLargeDatasBack(datas)
  return
  //先校验CRC8
  if (crc8(datas.slice(0, datas.length-1)) != datas[datas.length-1]) {
    console.log("CRC8校验异常：", crc8(datas.slice(0, datas.length-1)))
    return
  }
  //蓝牙数据包组包
  bleDatasBackArr = bleDatasBackArr.concat(datas.slice(2, datas.length-1))
  //如果是最后一包那就清空并返回给页面处理方法
  if (datas[1] >= 128) {
    console.log("bleDatasBackArr：",bleDatasBackArr)
    let deepDatas=[]
    deepDatas=bleDatasBackArr
    bleDatasBackArr = []
    // console.log("bleDatasBackArr-[]：",bleDatasBackArr)
    datasBackToPage(deepDatas)
  }
}

function bleLargeDatasBack(datas){
  //先校验CRC8
  if (crc8(datas.slice(0, datas.length-1)) != datas[datas.length-1]) {
    console.log("CRC8校验异常：", crc8(datas.slice(0, datas.length-1)))
    return
  }
  //蓝牙数据包组包
  // bleDatasBackArr = bleDatasBackArr.concat(datas.slice(2, datas.length-1))
  bleDatasBackArr = bleDatasBackArr.concat(datas.slice(5, datas.length-1))
  //如果是最后一包那就清空并返回给页面处理方法
  if (datas[1] >= 128) {
    console.log("bleDatasBackArr：",bleDatasBackArr)
    let deepDatas=[]
    deepDatas=bleDatasBackArr
    bleDatasBackArr = []
    // console.log("bleDatasBackArr-[]：",bleDatasBackArr)
    datasBackToPage(deepDatas,true)
  }
}

//面板和主界面层数据返回处理
function datasBackToPage(msg,flag = false) {
  let data = {}
  let cmd = 0
  // let app=getApp()
  // console.log(app)
  // console.log(curPage)
  if(flag){
    // msg转为hex
    // msg = msg.map(v => v.toString(16).padStart(2, '0'));
  }
  console.log("msg:::",msg)
  let firstChat = Number(msg[0])
  // console.log(network)
  //根据网络方式对数据进行处理然后返回给页面或者面板
  // if (network == "01") {
    // console.log("curPage:",curPage)
    let cmdArr = [2, 3, 10, 11, 12, 13, 14, 15,16,17]
    //蓝牙数据
    if (firstChat == 0 || firstChat == 1 || firstChat == 4) {
      //cmd0 1 4  返回给主界面层  配网 启动信息 解绑
      if (curPage) {
        curPage.onBLEnet(msg);
      }
      return
    } else if (cmdArr.includes(firstChat)) {
      //cmd2、3、10、11.... 返回给面板层  通信控制数据
      if (curPage) {
        if(!flag){
          curPage.onBLEdatas(resolveBleCmd23Datas(msg));
        }else{
          //直接发
          curPage.onBLEdatas(msg);
        }
        
        return
      }

    }

  // } else {
  //   //socket数据


  // }


  //调用最后一个页面的TCPcallback函数
  // let p = getCurrentPages()
  // if (typeof (p[p.length - 1].TCPcallback) === 'function') {
  //   p[p.length - 1].TCPcallback(data, cmd);
  // } else {
  //   p[0].TCPcallback(data, cmd);
  // }
}


//cmd2 3查询蓝牙数据处理
//datas=[10, 2, 1, 1, 10, 2, 2, 0, 10, 3, 3, 232, 3, 10, 3, 4, 232, 3, 10, 3, 5, 255, 255, 10, 3, 6, 255, 255, 10, 7, 16, 255, 255, 255, 255, 255, 255]
//return {}
function resolveBleCmd23Datas(datas){
  let re={}
  for(let i=1;i<datas.length;){
    if(datas[i]==0){
      break;
    }
    //判断长度小于ff ff那就是数字，反之 字符串16进制
    if(datas[i]<5){
      let value=0
      if(datas[i]==2){
        value=datas[i+2]
      }else if(datas[i]==3){
        value=datas[i+2]+datas[i+3]*256
      }else if(datas[i]==4){
        value=datas[i+2]+datas[i+3]*256+datas[i+4]*256*256
      }
      re[datas[i+1]]=value
    
    }else{
      re[datas[i+1]]=""
      for(let k=0;k<datas[i]-1;k++){
        re[datas[i+1]]+= (datas[i+k+2]<10?'0'+datas[i+k+2].toString(16):datas[i+k+2].toString(16))
      }
      re[datas[i+1]]=re[datas[i+1]].toUpperCase()
    }

    i+=datas[i]+2
  }
  return re
}


//数字分割成255数组
function intTo255Arr(int) {
  let a = []
  if (int < 256) {
    a.push(int)
  } else {
    a.push(int % 256)
    a.push(parseInt(int / 256))
  }
  return a
}

function unBindDev(){
  return [4,0,1,1]
}

module.exports = {
  FILE_TRANSFER_QUEUE_KEY,
  setCurPage,
  getCurPage,
  sendDatas,
  cancelQueuedDatas,
  slowDownWrites,
  clearDatas,
  getNetSetDatas,
  getNetSetDatasNew,
  sendCmd,
  getBleDeviceKey,
  timestampToHexIntArray,
  getCmd0,
  getCmd0New,
  bleDatasBack,
  datasBackToPage,
  intTo255Arr,
  hexStr2intArr,
  queryDevice,
  resolveBleCmd23Datas,
  unBindDev
}
