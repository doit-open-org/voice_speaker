const USER_BGM_SOURCE = 'upload'
const SYSTEM_BGM_SOURCE = 'regular'
const BGM_SETTING_KEYS = [
  'bgm_volume',
  'bgm_ducking',
  'voice_delay',
  'bgm_tail'
]

function normalizeBgmId(value) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : 0
}

function resolveBgmSelection(activeBgmInfo = {}, bgmSetDetail = {}) {
  const activeId = normalizeBgmId(activeBgmInfo.id)
  if (activeId) {
    let source = activeBgmInfo.source
    if (source !== USER_BGM_SOURCE && source !== SYSTEM_BGM_SOURCE) {
      source = normalizeBgmId(bgmSetDetail.user_bgm_id) === activeId
        ? USER_BGM_SOURCE
        : SYSTEM_BGM_SOURCE
    }
    return { id: activeId, source }
  }

  const userBgmId = normalizeBgmId(bgmSetDetail.user_bgm_id)
  if (userBgmId) return { id: userBgmId, source: USER_BGM_SOURCE }

  const bgmId = normalizeBgmId(bgmSetDetail.bgm_id)
  if (bgmId) return { id: bgmId, source: SYSTEM_BGM_SOURCE }

  return null
}

function buildBgmPayload(activeBgmInfo = {}, bgmSetDetail = {}) {
  const selection = resolveBgmSelection(activeBgmInfo, bgmSetDetail)
  if (!selection) return {}

  const payload = {}
  BGM_SETTING_KEYS.forEach((key) => {
    const value = bgmSetDetail[key]
    if (value !== undefined && value !== null && value !== '') {
      payload[key] = value
    }
  })

  if (selection.source === USER_BGM_SOURCE) {
    payload.user_bgm_id = selection.id
  } else {
    payload.bgm_id = selection.id
  }
  return payload
}

function hasBgmSelection(payload = {}) {
  return Boolean(
    normalizeBgmId(payload.bgm_id) || normalizeBgmId(payload.user_bgm_id)
  )
}

module.exports = {
  USER_BGM_SOURCE,
  SYSTEM_BGM_SOURCE,
  buildBgmPayload,
  hasBgmSelection,
  resolveBgmSelection
}
