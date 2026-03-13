<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import AlarmDetailDialog from '@/components/alarms/AlarmDetailDialog.vue'
import { useAlarmCenterStore } from '@/stores/alarmCenter'

const alarmCenter = useAlarmCenterStore()

const open = ref(false)
const activeRecord = computed(() => alarmCenter.active?.record || null)

let timer: number | null = null

function clearTimer() {
  if (timer) {
    window.clearTimeout(timer)
    timer = null
  }
}

function scheduleAutoClose() {
  clearTimer()
  const evt = alarmCenter.active
  if (!evt) return
  if (!evt.popup) return
  const sec = Math.max(3, Math.min(120, alarmCenter.popupDurationSec))
  timer = window.setTimeout(() => {
    open.value = false
  }, sec * 1000)
}

watch(
  () => alarmCenter.active,
  (evt) => {
    if (!evt) {
      open.value = false
      clearTimer()
      return
    }
    if (!evt.popup) {
      alarmCenter.closeActive()
      return
    }
    open.value = true
    scheduleAutoClose()
  },
  { deep: true }
)

watch(
  () => open.value,
  (v) => {
    if (!v) {
      clearTimer()
      alarmCenter.closeActive()
    } else {
      scheduleAutoClose()
    }
  }
)

onMounted(() => {
  if (alarmCenter.active?.popup) {
    open.value = true
    scheduleAutoClose()
  }
})

onUnmounted(() => {
  clearTimer()
})
</script>

<template>
  <AlarmDetailDialog v-model="open" :record="activeRecord" />
</template>

