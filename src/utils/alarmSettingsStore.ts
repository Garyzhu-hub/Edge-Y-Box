export type AlarmSettingsLevel = '一般' | '警告' | '严重' | '紧急'

export type AlarmChannelPolicy = {
  cloudPush: boolean
  popup: boolean
  sound: boolean
  sms: boolean
  phone: boolean
}

export type AlarmSettings = {
  popupDurationSec: number
  cloudPushWorkOrdersOnly: boolean
  imagePushEnabled: boolean
  notify: Record<AlarmSettingsLevel, string[]>
  policy: Record<AlarmSettingsLevel, AlarmChannelPolicy>
}

const STORAGE_KEY = 'edge_alarm_settings_v1'

export function defaultAlarmSettings(): AlarmSettings {
  return {
    popupDurationSec: 10,
    cloudPushWorkOrdersOnly: false,
    imagePushEnabled: true,
    notify: {
      一般: [],
      警告: ['u_ops1'],
      严重: ['u_admin', 'u_ops1'],
      紧急: ['u_admin', 'u_ops1'],
    },
    policy: {
      一般: { cloudPush: true, popup: false, sound: false, sms: false, phone: false },
      警告: { cloudPush: true, popup: false, sound: false, sms: false, phone: false },
      严重: { cloudPush: true, popup: true, sound: true, sms: false, phone: false },
      紧急: { cloudPush: true, popup: true, sound: true, sms: true, phone: true },
    },
  }
}

export function loadAlarmSettings(): AlarmSettings {
  const base = defaultAlarmSettings()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw) as Partial<AlarmSettings>
    const next: AlarmSettings = { ...base, notify: { ...base.notify }, policy: { ...base.policy } }
    if (typeof parsed.popupDurationSec === 'number') next.popupDurationSec = parsed.popupDurationSec
    if (typeof parsed.cloudPushWorkOrdersOnly === 'boolean') next.cloudPushWorkOrdersOnly = parsed.cloudPushWorkOrdersOnly
    if (typeof parsed.imagePushEnabled === 'boolean') next.imagePushEnabled = parsed.imagePushEnabled

    const pNotify: any = (parsed as any).notify
    if (pNotify) {
      const hasNew = ['一般', '警告', '严重', '紧急'].some((k) => Array.isArray(pNotify[k]))
      const hasOld = ['高', '中', '低'].some((k) => Array.isArray(pNotify[k]))

      if (hasNew) {
        next.notify.一般 = Array.isArray(pNotify.一般) ? (pNotify.一般 as string[]) : next.notify.一般
        next.notify.警告 = Array.isArray(pNotify.警告) ? (pNotify.警告 as string[]) : next.notify.警告
        next.notify.严重 = Array.isArray(pNotify.严重) ? (pNotify.严重 as string[]) : next.notify.严重
        next.notify.紧急 = Array.isArray(pNotify.紧急) ? (pNotify.紧急 as string[]) : next.notify.紧急
      } else if (hasOld) {
        const hi = Array.isArray(pNotify.高) ? (pNotify.高 as string[]) : []
        const mid = Array.isArray(pNotify.中) ? (pNotify.中 as string[]) : []
        const low = Array.isArray(pNotify.低) ? (pNotify.低 as string[]) : []
        next.notify.严重 = hi.length ? hi : next.notify.严重
        next.notify.紧急 = hi.length ? hi : next.notify.紧急
        next.notify.警告 = mid.length ? mid : next.notify.警告
        next.notify.一般 = low.length ? low : next.notify.一般
      }
    }

    const pPolicy: any = (parsed as any).policy
    if (pPolicy && typeof pPolicy === 'object') {
      const levels: AlarmSettingsLevel[] = ['一般', '警告', '严重', '紧急']
      for (const lv of levels) {
        const row = pPolicy[lv]
        if (!row || typeof row !== 'object') continue
        next.policy[lv] = {
          cloudPush: typeof row.cloudPush === 'boolean' ? row.cloudPush : next.policy[lv].cloudPush,
          popup: typeof row.popup === 'boolean' ? row.popup : next.policy[lv].popup,
          sound: typeof row.sound === 'boolean' ? row.sound : next.policy[lv].sound,
          sms: typeof row.sms === 'boolean' ? row.sms : next.policy[lv].sms,
          phone: typeof row.phone === 'boolean' ? row.phone : next.policy[lv].phone,
        }
      }
    }
    return next
  } catch {
    return base
  }
}
