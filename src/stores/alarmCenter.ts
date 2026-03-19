import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { AlarmRecord } from '@/components/alarms/AlarmDetailDialog.vue'
import { appendAlarmRecord } from '@/utils/alarmRecordsStore'
import { loadAlarmSettings, type AlarmChannelPolicy } from '@/utils/alarmSettingsStore'
import { playAlarmSound } from '@/utils/alarmSound'
import { enqueueAlarmNotifications } from '@/utils/alarmPushCenter'

export type AlarmCenterEvent = {
  record: AlarmRecord
  popup: boolean
  sound: boolean
}

export type AlarmEffectPolicy = Pick<AlarmChannelPolicy, 'popup' | 'sound'>

export const useAlarmCenterStore = defineStore('alarmCenter', () => {
  const queue = ref<AlarmCenterEvent[]>([])
  const active = ref<AlarmCenterEvent | null>(null)
  const lastPushedAtMs = ref(0)

  const popupDurationSec = computed(() => loadAlarmSettings().popupDurationSec)

  function effectPolicyOf(level: AlarmRecord['level']): AlarmEffectPolicy {
    const settings = loadAlarmSettings()
    const row = settings.policy[level]
    return { popup: !!row?.popup, sound: !!row?.sound }
  }

  function pushRecord(record: AlarmRecord) {
    const p = effectPolicyOf(record.level)
    push({ record, popup: p.popup, sound: p.sound })
  }

  function push(evt: AlarmCenterEvent) {
    lastPushedAtMs.value = Date.now()
    appendAlarmRecord(evt.record)
    enqueueAlarmNotifications(evt.record)
    queue.value.push(evt)
    if (!active.value) {
      active.value = queue.value.shift() || null
      if (active.value) handleSideEffects(active.value)
    }
  }

  async function handleSideEffects(evt: AlarmCenterEvent) {
    if (evt.sound) {
      await playAlarmSound('beep')
    }
  }

  function next() {
    active.value = queue.value.shift() || null
    if (active.value) void handleSideEffects(active.value)
  }

  function clear() {
    queue.value = []
    active.value = null
  }

  function closeActive() {
    active.value = null
    if (queue.value.length) next()
  }

  return {
    queue,
    active,
    popupDurationSec,
    lastPushedAtMs,
    push,
    pushRecord,
    next,
    clear,
    closeActive,
  }
})
