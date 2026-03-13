<script setup lang="ts">
import { computed } from 'vue'
import { Camera, CheckCircle2, Cpu, Network, RadioTower, XCircle } from 'lucide-vue-next'

type Status = 'ok' | 'warn' | 'bad'

const data = computed(() => {
  return {
    heartbeat: { label: '边缘盒子心跳', status: 'ok' as Status, value: '在线（1m内）' },
    cameras: { label: '摄像头在线/离线', status: 'warn' as Status, value: '92 / 8' },
    tasks: { label: '任务运行/暂停/异常', status: 'ok' as Status, value: '28 / 3 / 0' },
    mqtt: { label: 'MQTT连接状态', status: 'ok' as Status, value: '已连接' },
    failures: { label: '近24h任务失败', status: 'warn' as Status, value: '5 次' },
  }
})

const cards = computed(() => [
  { ...data.value.heartbeat, icon: RadioTower },
  { ...data.value.cameras, icon: Camera },
  { ...data.value.tasks, icon: Cpu },
  { ...data.value.mqtt, icon: Network },
  { ...data.value.failures, icon: data.value.failures.status === 'bad' ? XCircle : CheckCircle2 },
])

function statusTone(s: Status) {
  if (s === 'ok') return { dot: 'bg-emerald-500', text: 'text-emerald-700', tag: 'success' }
  if (s === 'warn') return { dot: 'bg-amber-500', text: 'text-amber-700', tag: 'warning' }
  return { dot: 'bg-rose-500', text: 'text-rose-700', tag: 'danger' }
}
</script>

<template>
  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
    <el-card v-for="c in cards" :key="c.label" class="!rounded-xl">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="text-xs text-zinc-500">{{ c.label }}</div>
          <div class="mt-1 truncate text-base font-semibold">{{ c.value }}</div>
        </div>
        <div class="flex items-center gap-2">
          <div class="h-2 w-2 rounded-full" :class="statusTone(c.status).dot" />
          <component :is="c.icon" class="h-4 w-4 text-zinc-600" />
        </div>
      </div>
    </el-card>
  </div>
</template>
