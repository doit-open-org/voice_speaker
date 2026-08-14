/**
 * 蓝牙权限检查。
 *
 * 移植自 E:\mini\福宝拼豆图纸制作-refactor-aidoucang-20260618-182426
 * 的 pages/bluetooth-permission，界面与交互照搬，检测逻辑做了三处修正——
 * 那三处都是四博学习宝那边踩过一遍才发现的，不重复踩。
 *
 * ## 为什么要有这一页
 *
 * 蓝牙连不上有六种完全不同的原因，报错却长得一模一样（「搜索不到设备」）。
 * 这一页把六层逐个点亮，用户一眼看出卡在哪一层：
 *
 *     系统蓝牙开关   ← 手机「设置」里的总开关
 *     系统定位开关   ← 同上（安卓扫蓝牙要它，iOS 不要）
 *     微信附近设备   ← 手机「设置」→ 微信 → 附近的设备
 *     微信定位       ← 手机「设置」→ 微信 → 位置
 *     小程序蓝牙     ← 微信内、本小程序的授权
 *     小程序位置     ← 同上
 *
 * ## 三处跟原版不一样的地方
 *
 * 1. **开发者工具里不检测，直接说不能测。**
 *    工具里蓝牙是停用的，原版会老老实实报出六个「未知/未打开」，
 *    看着像一堆真问题，其实一个都不是。
 *
 * 2. **定位在 iOS 上算可选项，不进「待处理」计数。**
 *    iOS 搜蓝牙不需要定位，安卓多数机型需要。原版一视同仁，
 *    结果 iPhone 上永远显示「有问题」，用户照着修还修不好。
 *    拿不到平台时按「需要」处理——多报一项待办，好过漏掉安卓上真正的拦路虎。
 *
 * 3. **openBluetoothAdapter 成功不等于蓝牙可用。**
 *    适配器打开过一次之后再调会走缓存直接 success，用户中途把系统蓝牙关了
 *    它照样成功——「重新检查权限」对这一项就成了假绿灯。所以再查一次
 *    getBluetoothAdapterState 拿实时状态。
 *
 * 另外原版把「适配器打不开」一律算成小程序没授权，其实 errCode 10001
 * 是系统蓝牙没开，那是上面第一项的事。这里按 errCode 分开归因。
 */
'use strict'

// 只主动申请「必需」的那些。iOS 上位置是可选项，别为了凑齐绿灯
// 平白弹一个位置授权框——用户拒了反而更难看。
const BLUETOOTH_SCOPE = 'scope.bluetooth'
const LOCATION_SCOPE = 'scope.userLocation'

// 适配器不可用。这是系统蓝牙没开，不是本小程序没授权。
const ADAPTER_UNAVAILABLE = 10001

function messageOf(error) {
  return String((error && (error.errMsg || error.message)) || error || '')
}

function looksDenied(message) {
  return /auth|authorize|permission|deny|denied|scope|privacy/i.test(message)
}

Page({
  data: {
    checking: false,

    // 开发者工具里测不了，如实说明，不报一堆假问题
    runtimeSupported: true,
    runtimeReason: '',

    items: [],
    okCount: 0,
    problemCount: 0,
    hasProblem: false,
    showSettingButton: false,
    summaryText: '检查中',
    summaryLevel: 'unknown',
    platformNote: ''
  },

  onShow() {
    this.runCheck()
  },

  // ------------------------------------------------------------ 采集

  platform() {
    try {
      return String((wx.getSystemInfoSync() || {}).platform || '').toLowerCase()
    } catch (error) {
      return ''
    }
  },

  /** 系统级开关。getSystemSetting 是取 bluetoothEnabled/locationEnabled 的正主，
   *  旧基础库没有它才退回 getSystemInfoSync（那边这两个字段已废弃，可能是 undefined）。 */
  systemSetting() {
    try {
      if (wx.getSystemSetting) return wx.getSystemSetting() || {}
      return wx.getSystemInfoSync ? wx.getSystemInfoSync() || {} : {}
    } catch (error) {
      return {}
    }
  },

  /** 微信这个 App 在手机系统里拿到的权限 */
  appAuthorizeSetting() {
    try {
      return wx.getAppAuthorizeSetting ? wx.getAppAuthorizeSetting() || {} : {}
    } catch (error) {
      return {}
    }
  },

  /** 本小程序在微信里拿到的授权 */
  authSetting() {
    return new Promise((resolve) => {
      if (!wx.getSetting) {
        resolve({})
        return
      }
      wx.getSetting({
        success: (res) => resolve((res && res.authSetting) || {}),
        fail: () => resolve({})
      })
    })
  },

  /**
   * 适配器实况。返回 { available, denied }：
   *   available  蓝牙这条链路现在能不能用
   *   denied     打不开是不是因为**本小程序**被拒（而不是系统蓝牙没开）
   */
  adapterState() {
    return new Promise((resolve) => {
      if (!wx.openBluetoothAdapter) {
        resolve({ available: null, denied: false })
        return
      }
      wx.openBluetoothAdapter({
        success: () => {
          // 打开过一次后这里会走缓存直接成功，所以必须再查实时状态，
          // 否则用户中途关掉系统蓝牙，这一项还是绿的。
          if (!wx.getBluetoothAdapterState) {
            resolve({ available: true, denied: false })
            return
          }
          wx.getBluetoothAdapterState({
            success: (res) => resolve({ available: res && res.available !== false, denied: false }),
            // 拿不到实时状态就按打开成功算，不倒扣
            fail: () => resolve({ available: true, denied: false })
          })
        },
        fail: (error) => {
          const code = error && error.errCode
          const message = messageOf(error)
          // 10001 = 适配器不可用 = 系统蓝牙没开。这不是小程序授权的锅，
          // 归到「系统蓝牙开关」那一项去，别在这儿重复报一次。
          const systemOff = code === ADAPTER_UNAVAILABLE || /not available|unavailable|10001/i.test(message)
          resolve({ available: false, denied: !systemOff && looksDenied(message) })
        }
      })
    })
  },

  // ------------------------------------------------------------ 检查

  async runCheck() {
    if (this.data.checking) return
    this.setData({ checking: true })

    if (this.platform() === 'devtools') {
      // 工具里蓝牙是停用的，测出来的六项没有任何参考价值
      this.setData({
        checking: false,
        runtimeSupported: false,
        runtimeReason: '开发者工具里蓝牙是停用的，检测结果不作数。请用手机真机打开这一页。',
        items: [],
        okCount: 0,
        problemCount: 0,
        hasProblem: false,
        showSettingButton: false,
        summaryText: '无法检测',
        summaryLevel: 'unknown',
        platformNote: ''
      })
      return
    }

    const system = this.systemSetting()
    const appAuthorize = this.appAuthorizeSetting()
    const authSetting = await this.authSetting()
    const adapter = await this.adapterState()

    // iOS 搜蓝牙不需要定位；安卓多数机型需要。拿不到平台按「需要」处理。
    const locationRequired = this.platform() !== 'ios'
    const items = this.buildItems(system, appAuthorize, authSetting, adapter, locationRequired)

    const okCount = items.filter((item) => item.ok).length
    // 可选项没开不算拦路虎，不进「待处理」，否则 iPhone 上永远显示有问题
    const problemCount = items.filter((item) => !item.ok && !item.optional).length
    const hasProblem = problemCount > 0

    this.setData({
      checking: false,
      runtimeSupported: true,
      runtimeReason: '',
      items,
      okCount,
      problemCount,
      hasProblem,
      showSettingButton: hasProblem,
      summaryText: hasProblem ? '待处理 ' + problemCount + ' 项' : '全部就绪',
      summaryLevel: hasProblem ? 'warn' : 'ok',
      platformNote: locationRequired
        ? '安卓系统搜索蓝牙设备需要定位权限，没开可能搜不到音箱。'
        : '当前系统搜索蓝牙设备不需要定位，定位相关项没开也不影响连接。'
    })
  },

  buildItems(system, appAuthorize, authSetting, adapter, locationRequired) {
    const authorized = (value) => value === 'authorized' || value === true
    // 旧基础库拿不到的字段是 undefined。**按就绪处理**——
    // 拿不到不等于没开，误报一次用户就不信这一页了。
    const unknownIsFine = (value) => (typeof value === 'boolean' ? value : true)

    // 小程序这一层的蓝牙只有两种情况算没授权：scope 明确是 false，
    // 或者适配器打不开且原因确实是被拒。系统蓝牙没开导致的打不开不算在这儿——
    // 那是上面第一项的事，adapter.denied 已经把两种原因分开了。
    const miniBluetoothOk = !(authSetting[BLUETOOTH_SCOPE] === false || adapter.denied)

    // 系统蓝牙：能拿到 bluetoothEnabled 就信它；拿不到（旧基础库）就看适配器——
    // 打不开又不是被拒，那就是系统蓝牙没开。两个都拿不到才按就绪算。
    const systemBluetoothOk = typeof system.bluetoothEnabled === 'boolean'
      ? system.bluetoothEnabled
      : !(adapter.available === false && !adapter.denied)

    const items = [
      {
        key: 'systemBluetooth',
        label: '系统蓝牙开关',
        detail: '需要在手机系统中打开蓝牙',
        kind: 'system',
        optional: false,
        ok: systemBluetoothOk,
        tip: '请在手机「设置」里打开蓝牙，再回来重新检查。'
      },
      {
        key: 'systemLocation',
        label: '系统定位开关',
        detail: locationRequired
          ? '安卓搜索蓝牙设备需要系统定位'
          : '当前系统搜索蓝牙设备无需定位服务（可选）',
        kind: 'system',
        optional: !locationRequired,
        ok: unknownIsFine(system.locationEnabled),
        tip: '请在手机「设置」里打开定位服务，再回来重新检查。'
      },
      {
        key: 'wechatBluetooth',
        label: '微信附近设备权限(蓝牙权限)',
        detail: '在系统应用设置中允许微信使用附近的设备权限(蓝牙)',
        kind: 'app',
        optional: false,
        ok: appAuthorize.bluetoothAuthorized === undefined
          ? true
          : authorized(appAuthorize.bluetoothAuthorized),
        tip: '在手机「设置」→ 微信 →「附近的设备」或「蓝牙」，允许访问。'
      },
      {
        key: 'wechatLocation',
        label: '微信定位权限',
        detail: locationRequired
          ? '在系统应用设置中允许微信使用定位（GPS）'
          : '在系统应用设置中允许微信使用定位（GPS）（可选）',
        kind: 'app',
        optional: !locationRequired,
        ok: appAuthorize.locationAuthorized === undefined
          ? true
          : authorized(appAuthorize.locationAuthorized),
        tip: '在手机「设置」→ 微信 →「位置」，允许访问。'
      },
      {
        key: 'miniBluetooth',
        label: '小程序蓝牙权限',
        detail: '允许本小程序使用蓝牙',
        kind: 'setting',
        optional: false,
        ok: miniBluetoothOk,
        tip: '在小程序「设置」里允许「蓝牙」，再回来重新检查。'
      },
      {
        key: 'miniLocation',
        label: '小程序位置权限',
        detail: locationRequired ? '允许本小程序使用位置信息' : '允许本小程序使用位置信息（可选）',
        kind: 'setting',
        optional: !locationRequired,
        // 从没问过是 undefined，那不是拒绝
        ok: authSetting[LOCATION_SCOPE] !== false,
        tip: '在小程序「设置」里允许「位置信息」。'
      }
    ]

    items.forEach((item) => {
      item.status = item.ok
        ? (item.kind === 'system' ? '已打开' : '已授权')
        : (item.kind === 'system' ? '去打开' : '去授权')
      // 绿灯 / 橙灯（可选项没开）/ 红灯（必需项没开）
      item.level = item.ok ? 'ok' : (item.optional ? 'warn' : 'bad')
    })

    return items
  },

  // ------------------------------------------------------------ 处理

  /** 「重新检查权限」：先把没问过的必需 scope 问一遍，再重新检查。 */
  requestAndCheck() {
    if (this.data.checking) return
    const locationRequired = this.platform() !== 'ios'
    this.authSetting()
      .then((authSetting) => {
        const wanted = [BLUETOOTH_SCOPE]
        if (locationRequired) wanted.push(LOCATION_SCOPE)
        // 只申请「从没问过」的（undefined）。已经拒过的再 authorize 不会弹框，
        // 只会静默失败，那条路得走 openSetting。
        const pending = wanted.filter((scope) => authSetting[scope] == null)
        return Promise.all(pending.map((scope) => this.requestScope(scope)))
      })
      .catch(() => null)
      .then(() => this.runCheck())
  },

  requestScope(scope) {
    return new Promise((resolve) => {
      if (!wx.authorize) {
        resolve(false)
        return
      }
      wx.authorize({ scope, success: () => resolve(true), fail: () => resolve(false) })
    })
  },

  /** 点某一行：直接送到能解决它的那个设置页，而不是让用户自己猜。 */
  fixItem(event) {
    const key = event.currentTarget.dataset.key
    const item = (this.data.items || []).find((entry) => entry.key === key)
    if (!item || item.ok) return

    if (item.kind === 'setting') {
      this.openSettingPage()
      return
    }
    if (item.kind === 'app' && wx.openAppAuthorizeSetting) {
      wx.openAppAuthorizeSetting({ complete: () => this.runCheck() })
      return
    }
    // 系统开关小程序打不开，只能告诉他去哪儿点
    wx.showModal({ title: item.label, content: item.tip, showCancel: false, confirmText: '知道了' })
  },

  openSettingPage() {
    const done = () => this.runCheck()
    if (wx.openSetting) {
      wx.openSetting({ complete: done })
      return
    }
    if (wx.openAppAuthorizeSetting) {
      wx.openAppAuthorizeSetting({ complete: done })
      return
    }
    wx.showToast({ title: '当前微信版本不支持打开设置', icon: 'none' })
    done()
  }
})
