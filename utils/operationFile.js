async function downloadAudio(url) {
	return new Promise((resolve, reject) => {
		const downloadTask = wx.downloadFile({
			url: url,
			success: (res) => {
				if (res.statusCode === 200) {
					console.log('✓ 音频下载成功:', res.tempFilePath);
					resolve(res.tempFilePath);
				} else {
					reject(new Error(`下载失败: ${res.statusCode}`));
				}
			},
			fail: (err) => {
        wx.hideLoading();
        wx.showToast({
          icon: 'error',
          title: '下载失败',
        })
				reject(err);
			}
		});

		// 下载进度
		downloadTask.onProgressUpdate((res) => {
			console.log(`下载进度: ${res.progress}%`);
		});
	});
}

// 10. 读取音频文件为ArrayBuffer
async function readAudioFile(filePath) {
	return new Promise((resolve, reject) => {
		const fs = wx.getFileSystemManager();
		fs.readFile({
			filePath: filePath,
			success: (res) => {
				const size = res.data.byteLength;
				console.log(`✓ 读取文件成功: ${(size / 1024).toFixed(2)} KB`);
				resolve(res.data);
			},
			fail: reject
		});
	});
}


/**
 * 字符串转Uint8Array ()
 */
function stringToUint8Array(str) {
  // 方法1: 使用encodeURIComponent + 手动转换
  const utf8 = unescape(encodeURIComponent(str));
  const arr = new Uint8Array(utf8.length);
  for (let i = 0; i < utf8.length; i++) {
    arr[i] = utf8.charCodeAt(i);
  }
  return arr;
}
// 字符串转unicode
function textToUnicode(str) {
  let hex = str.split('').map(char => {
    // return '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0')
    let code = char.charCodeAt(0).toString(16).padStart(4, '0')
     // 大端转小端
     return code.slice(2, 4) + code.slice(0, 2)
  }).join('')
  // 按两个字符分割为数组
  const hexArr = hex.match(/.{2}/g)
  // 转成 Uint8Array
  // return new Uint8Array(hexArr.map(byte => parseInt(byte, 16)))
  // 转成 Uint8Array
  const dataArr = hexArr.map(byte => parseInt(byte, 16))
  // 在开头加上 '\' 和 'U' 的 ASCII 码
  dataArr.unshift('U'.charCodeAt(0))   // 85
  dataArr.unshift('\\'.charCodeAt(0))  // 92
  
  return new Uint8Array(dataArr)
}
  
  function calculateCRC16(buffer) {
    const CRC16_TABLE = [
      0x0000, 0xC0C1, 0xC181, 0x0140, 0xC301, 0x03C0, 0x0280, 0xC241,
      0xC601, 0x06C0, 0x0780, 0xC741, 0x0500, 0xC5C1, 0xC481, 0x0440,
      0xCC01, 0x0CC0, 0x0D80, 0xCD41, 0x0F00, 0xCFC1, 0xCE81, 0x0E40,
      0x0A00, 0xCAC1, 0xCB81, 0x0B40, 0xC901, 0x09C0, 0x0880, 0xC841,
      0xD801, 0x18C0, 0x1980, 0xD941, 0x1B00, 0xDBC1, 0xDA81, 0x1A40,
      0x1E00, 0xDEC1, 0xDF81, 0x1F40, 0xDD01, 0x1DC0, 0x1C80, 0xDC41,
      0x1400, 0xD4C1, 0xD581, 0x1540, 0xD701, 0x17C0, 0x1680, 0xD641,
      0xD201, 0x12C0, 0x1380, 0xD341, 0x1100, 0xD1C1, 0xD081, 0x1040,
      0xF001, 0x30C0, 0x3180, 0xF141, 0x3300, 0xF3C1, 0xF281, 0x3240,
      0x3600, 0xF6C1, 0xF781, 0x3740, 0xF501, 0x35C0, 0x3480, 0xF441,
      0x3C00, 0xFCC1, 0xFD81, 0x3D40, 0xFF01, 0x3FC0, 0x3E80, 0xFE41,
      0xFA01, 0x3AC0, 0x3B80, 0xFB41, 0x3900, 0xF9C1, 0xF881, 0x3840,
      0x2800, 0xE8C1, 0xE981, 0x2940, 0xEB01, 0x2BC0, 0x2A80, 0xEA41,
      0xEE01, 0x2EC0, 0x2F80, 0xEF41, 0x2D00, 0xEDC1, 0xEC81, 0x2C40,
      0xE401, 0x24C0, 0x2580, 0xE541, 0x2700, 0xE7C1, 0xE681, 0x2640,
      0x2200, 0xE2C1, 0xE381, 0x2340, 0xE101, 0x21C0, 0x2080, 0xE041,
      0xA001, 0x60C0, 0x6180, 0xA141, 0x6300, 0xA3C1, 0xA281, 0x6240,
      0x6600, 0xA6C1, 0xA781, 0x6740, 0xA501, 0x65C0, 0x6480, 0xA441,
      0x6C00, 0xACC1, 0xAD81, 0x6D40, 0xAF01, 0x6FC0, 0x6E80, 0xAE41,
      0xAA01, 0x6AC0, 0x6B80, 0xAB41, 0x6900, 0xA9C1, 0xA881, 0x6840,
      0x7800, 0xB8C1, 0xB981, 0x7940, 0xBB01, 0x7BC0, 0x7A80, 0xBA41,
      0xBE01, 0x7EC0, 0x7F80, 0xBF41, 0x7D00, 0xBDC1, 0xBC81, 0x7C40,
      0xB401, 0x74C0, 0x7580, 0xB541, 0x7700, 0xB7C1, 0xB681, 0x7640,
      0x7200, 0xB2C1, 0xB381, 0x7340, 0xB101, 0x71C0, 0x7080, 0xB041,
      0x5000, 0x90C1, 0x9181, 0x5140, 0x9301, 0x53C0, 0x5280, 0x9241,
      0x9601, 0x56C0, 0x5780, 0x9741, 0x5500, 0x95C1, 0x9481, 0x5440,
      0x9C01, 0x5CC0, 0x5D80, 0x9D41, 0x5F00, 0x9FC1, 0x9E81, 0x5E40,
      0x5A00, 0x9AC1, 0x9B81, 0x5B40, 0x9901, 0x59C0, 0x5880, 0x9841,
      0x8801, 0x48C0, 0x4980, 0x8941, 0x4B00, 0x8BC1, 0x8A81, 0x4A40,
      0x4E00, 0x8EC1, 0x8F81, 0x4F40, 0x8D01, 0x4DC0, 0x4C80, 0x8C41,
      0x4400, 0x84C1, 0x8581, 0x4540, 0x8701, 0x47C0, 0x4680, 0x8641,
      0x8201, 0x42C0, 0x4380, 0x8341, 0x4100, 0x81C1, 0x8081, 0x4040
    ];
    
    let crc = 0x0000; // 初始值为数字 0
    const data = new Uint8Array(buffer);
    
    for (let i = 0; i < data.length; i++) {
      const index = (crc ^ data[i]) & 0xFF;
      crc = ((crc >> 8) ^ CRC16_TABLE[index]) & 0xFFFF;
    }
    
    return crc;
  }
	
	function buildCMD10Data(audioBuffer,audioBufferSize,fileName){
    // let arr = []
    // const fileNameBytes = stringToUint8Array(fileName);
    // const fileNameLen = fileNameBytes.length;
    // fileName 用unicode发
    const fileNameBytes = textToUnicode(fileName)
    const fileNameLen = fileNameBytes.length;
    console.log("fileNameBytes...",fileNameBytes)
    console.log("fileNameLen...",fileNameLen)
		//cmd
		// arr[0] = 10
    // len (file_size:4字节 + file_crc:2字节 + file_name:N字节)
    const len = 4 + 2 + fileNameLen;
    // arr[1] = len
    //文件总大小
    // arr[2] = audioBufferSize
    // 文件总CRC
    const fileCRC = calculateCRC16(audioBuffer);
    console.log('cc......',fileCRC)
    // arr[3] = fileCRC
    // 文件名字
    // arr[4] = fileName
    const totalLen = 1 + 2 + len;
    const packet = new ArrayBuffer(totalLen);
    const view = new DataView(packet);
    let offset = 0;
    // 1. 写入cmd (1字节)
    view.setUint8(offset, 10);
    offset += 1;
    // 2. 写入len (2字节, 大端序false---小端序true)
    view.setUint16(offset, len, false);
    offset += 2;
    // 3. 写入file_size (4字节, 大端序false---小端序true)
    view.setUint32(offset, audioBufferSize, false);
    offset += 4;
    // 4. 写入file_crc (2字节, 大端序false---小端序true)
    view.setUint16(offset, fileCRC, false);
    offset += 2;
    // 5. 写入file_name (N字节)
    const uint8View = new Uint8Array(packet);
    uint8View.set(fileNameBytes, offset);
    // 返回ArrayBuffer
    // return packet;
    //返回 Array 数组
    return Array.from(uint8View);
  }

  /**
 * 发送文件块
 * @param {number} offset - 偏移量
 * @param {number} chunkSize - 块大小
 * @param {ArrayBuffer} audioBuffer - 完整音频数据
 */
  async function sendFileToDevice(offset,chunkSize,audioBuffer){
    try {
      getApp().globalData.sendFlag = true
      //读取音频数据
      // let audioBuffer = this.data.audioBuffer
      // 6. 分片发送音频数据 (CMD11)
      let mtuSize = getApp().globalData.mtu; //MTU协商后的大小
      const totalSize = audioBuffer.byteLength;
      //获取能切的块实际大小(最后一块可能小于chunkSize)
      const actualChunkSize = Math.min(chunkSize, totalSize - offset);
      let file_seq = 0 //序号从0开始
      mtuSize = mtuSize - 6 //gatt 外层的6个字节ver1、seq2、len2、crc1
      console.log('00000.....',offset,chunkSize)
      let packets = buildCMD11Data(audioBuffer,offset,actualChunkSize,file_seq,mtuSize)
      // 逐个发送小包
      for (let packet of packets) {
        //检查全局停止标志
        if(!getApp().globalData.sendFlag){ break }
        console.log('ppp.....',packet.length)
        getApp().hextool.sendDatas(packet)
      }
    } catch (err) {
      console.error('传输失败:', err);
      throw err;
    }
  }

  /**
 * 从AudioBuffer中切出一块数据
 * @param {ArrayBuffer} audioBuffer - 完整音频数据
 * @param {number} offset - 偏移量
 * @param {number} chunkSize - 块大小
 * @returns {Uint8Array} 切出的数据块
 */
function chunkBufferData(audioBuffer, offset, chunkSize) {
  const audioView = new Uint8Array(audioBuffer);
  const actualSize = Math.min(chunkSize, audioBuffer.byteLength - offset);
  return audioView.slice(offset, offset + actualSize);
}

/**
 * 根据设备指定的offset和chunkSize，切出数据并分包发送
 * 
 * @param {ArrayBuffer} audioBuffer - 完整音频数据
 * @param {number} offset - 设备指定的偏移量
 * @param {number} chunkSize - 设备指定的块大小 (可能是10240)
 * @param {number} startSeq - 起始序号
 * @param {number} mtuSize - MTU大小
 * @returns {Array} 返回多个数据包的数组
 */
function buildCMD11Data(audioBuffer,offset,chunkSize,startSeq,mtuSize){
  const totalSize = audioBuffer.byteLength;
  //第一块
  // const isFirstChunk = (offset == 0);
  //文件最后一块
  const isLastChunk = ((offset+chunkSize) >= totalSize);
  // 把文件切一块出来
  const chunkData = chunkBufferData(audioBuffer, offset, chunkSize);
  const chunkDataLen = chunkData.length;

  // CMD11 headerSize
  const headerSize = 1 + 2 + 2; // cmd(1) + len(2) + file_seq(2)
  // 第一个小包需要额外2字节CRC
  const firstPacketDataSize = mtuSize - headerSize - (startSeq == 0 ? 2 : 0);
  const normalPacketDataSize = mtuSize - headerSize;

  const packets = [];
  let chunkOffset = 0;
  let seq = startSeq;

  // console.log(`分包: 第一包最大=${firstPacketDataSize}字节, 其他包最大=${normalPacketDataSize}字节`);

  while (chunkOffset < chunkDataLen) {
    // const isFirstPacket = (chunkOffset === 0) && isFirstChunk;
    const isFirstPacket = (seq == 0);
    // const maxDataSize = (chunkOffset === 0 && isFirstChunk) ? firstPacketDataSize : normalPacketDataSize;
    const maxDataSize = isFirstPacket ? firstPacketDataSize : normalPacketDataSize;
    //包实际大小(最后一包可能小于maxDataSize)
    const actualDataSize = Math.min(maxDataSize, chunkDataLen - chunkOffset);
    // 当前chunk切的这块结束
    const isLastPacket = (chunkOffset + actualDataSize >= chunkDataLen);
    // 当前chunk切的这块结束并且是文件的最后一块
    const isBlockEnd = (chunkOffset + actualDataSize >= chunkDataLen) && isLastChunk;
    
    // 计算file_seq标志位
    let file_seq = seq & 0x3FFF;
    if (isBlockEnd) {
      file_seq |= 0x8000; // bit15=1, 文件最后一个包
    }
    if (isLastPacket) {
      file_seq |= 0x4000; // bit14=1, Block结束
    }
    
    // 计算len sizeof(buff) 
    let len = actualDataSize;
    if (isFirstPacket) {
      len += 2; // 第一包需要CRC
    }
    
    // 创建数据包
    const packetSize = headerSize + len;
    const packet = new ArrayBuffer(packetSize);
    const view = new DataView(packet);
    const uint8View = new Uint8Array(packet);
    
    let pos = 0;
    
    // cmd
    view.setUint8(pos, 11);
    pos += 1;
    
    // len false大端序 加file_seq 2字节
    view.setUint16(pos, len + 2, false);
    pos += 2;
    
    // file_seq
    view.setUint16(pos, file_seq, false);
    pos += 2;
    
    // 第一包写入CRC
    if (isFirstPacket) {
      const fileCRC = calculateCRC16(chunkData);
      view.setUint16(pos, fileCRC, false);
      pos += 2;
      // console.log(`  包${packets.length + 1}: seq=${seq}, len=${len}, CRC=0x${fileCRC.toString(16).toUpperCase()}`);
    } else {
      // console.log(`  包${packets.length + 1}: seq=${seq}, len=${len}`);
    }
    
    // 写入数据
    const dataSlice = chunkData.slice(chunkOffset, chunkOffset + actualDataSize);
    uint8View.set(dataSlice, pos);
    
    // 转换为数组
    packets.push(Array.from(uint8View));
    
    chunkOffset += actualDataSize;
    seq++;
  }
  
  // console.log(`总共生成 ${packets.length} 个包\n`);
  return packets;

}
//查询音乐列表
function queryMusicList(){
  const len =  0
  // cmd+len
  const totalLen = 1  + 2;
  const packet = new ArrayBuffer(totalLen);
  const view = new DataView(packet);
  let offset = 0;
  // 1. 写入cmd (1字节)
  view.setUint8(offset, 13);
  offset += 1;
  // 2. 写入len (2字节, 大端序false---小端序true)
  view.setUint16(offset, len, false);
  //返回 Array 数组
  const uint8View = new Uint8Array(packet);
  return Array.from(uint8View);
}
function titleAscii(str) {
  let title = '';
  let arr = [];
  for (let i = 0; i < str.length / 2; i++) {
    let str16 = str.substr(i * 2, 2);
    arr.unshift(str16)
  }
  arr.forEach((item) => {
    let str10 = parseInt(item, 16);
    title += String.fromCharCode(str10);
  })
  return title;
}
function titleUnicode(str) {
  let title = '';
  let arr = [];
  for (let i = 0; i < str.length / 4; i++) {
    let str16 = str.substr(i * 4, 4);
    arr.unshift(str16)
  }
  console.log('arr...' + arr)
  arr.forEach((item) => {
    let newItem = "%u" + item;
    title += unescape(newItem);
  })
  return title;
}

/**
 * 根据下标删除音乐
 * 
 * @param index - 下标
 */
function delMusicItem(index){
  const len =  2
  // cmd+len+file_index
  const totalLen = 1 + 2 + 2;
  const packet = new ArrayBuffer(totalLen);
  const view = new DataView(packet);
  let offset = 0;
  // 1. 写入cmd (1字节)
  view.setUint8(offset, 14);
  offset += 1;
  // 2. 写入len (2字节, 大端序false---小端序true)
  view.setUint16(offset, len, false);
  offset += 2;
  // 2. 写入len (2字节, 大端序false---小端序true)
  view.setUint16(offset, index, false);
  //返回 Array 数组
  const uint8View = new Uint8Array(packet);
  return Array.from(uint8View);
}
/**
 * 根据下标播放音乐
 * 
 * @param index - 下标
 */
function playMusicItem(index){
  const len =  2
  // cmd+len+file_index
  const totalLen = 1 + 2 + 2;
  const packet = new ArrayBuffer(totalLen);
  const view = new DataView(packet);
  let offset = 0;
  // 1. 写入cmd (1字节)
  view.setUint8(offset, 15);
  offset += 1;
  // 2. 写入len (2字节, 大端序false---小端序true)
  view.setUint16(offset, len, false);
  offset += 2;
  // 2. 写入len (2字节, 大端序false---小端序true)
  view.setUint16(offset, index, false);
  //返回 Array 数组
  const uint8View = new Uint8Array(packet);
  return Array.from(uint8View);
}
//查询容量
function queryCapacity(){
  const len =  0
  // cmd+len
  const totalLen = 1  + 2;
  const packet = new ArrayBuffer(totalLen);
  const view = new DataView(packet);
  let offset = 0;
  // 1. 写入cmd (1字节)
  view.setUint8(offset, 17);
  offset += 1;
  // 2. 写入len (2字节, 大端序false---小端序true)
  view.setUint16(offset, len, false);
  //返回 Array 数组
  const uint8View = new Uint8Array(packet);
  return Array.from(uint8View);
}
/**
 * 重命名
 * 
 * @param oldName - 老名称
 * @param newName - 新名称
 */
function reNameData(oldName,newName){
  // const oldNameBytes = stringToUint8Array(oldName);
  // const oldNameLen = oldNameBytes.length;
  // fileName 用unicode发
  const oldNameBytes = textToUnicode(oldName)
  const oldNameLen = oldNameBytes.length;

  // const newNameBytes = stringToUint8Array(newName);
  // const newNameLen = newNameBytes.length;
  // fileName 用unicode发
  const newNameBytes = textToUnicode(newName)
  const newNameLen = newNameBytes.length;
  // old_name_len、new_name_len、old_name、new_name
  let dataLen = 1 + 1 + oldNameLen + newNameLen
  // cmd+len+dataLen
  const totalLen = 1 + 2 + dataLen;
  const packet = new ArrayBuffer(totalLen);
  const view = new DataView(packet);
  let offset = 0;
  // 1. 写入cmd (1字节)
  view.setUint8(offset, 16);
  offset += 1;
  // 2. 写入len (2字节, 大端序false---小端序true)
  view.setUint16(offset, dataLen, false);
  offset += 2;
  // 3. 写入old_name_len(1字节)
  view.setUint8(offset, oldNameLen);
  offset += 1;
  // 4. 写入new_name_len(1字节)
  view.setUint8(offset, newNameLen);
  offset += 1;
  // 5. 写入old_name (N字节)
  const uint8View = new Uint8Array(packet);
  uint8View.set(oldNameBytes, offset);
  offset += oldNameLen
  // 6. 写入new_name(N字节)
  uint8View.set(newNameBytes, offset);
  // 返回ArrayBuffer
  // return packet;
  //返回 Array 数组
  return Array.from(uint8View);
}

  


export {downloadAudio , readAudioFile, buildCMD10Data,buildCMD11Data,queryMusicList,titleAscii,titleUnicode,delMusicItem,playMusicItem,reNameData,queryCapacity,textToUnicode,sendFileToDevice}