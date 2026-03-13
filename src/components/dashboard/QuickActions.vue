<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Camera, PlaySquare, Bell, ListChecks } from 'lucide-vue-next'

const router = useRouter()

const actions = [
  {
    label: '进入预警列表',
    desc: '查看最新报警记录',
    icon: Bell,
    to: '/alarms',
  },
  {
    label: '进入工单列表',
    desc: '查看未恢复工单',
    icon: ListChecks,
    to: '/work-orders',
  },
  {
    label: '抓图测试',
    desc: '先选摄像头（占位）',
    icon: Camera,
    to: '/devices/cameras',
  },
  {
    label: '查看直播流',
    desc: '先选摄像头（占位）',
    icon: PlaySquare,
    to: '/devices/cameras',
  },
]

function go(to: string) {
  router.push(to)
}
</script>

<template>
  <el-card>
    <div class="flex items-center justify-between">
      <div class="text-sm font-semibold">快捷动作</div>
      <el-tag type="info">Top 4</el-tag>
    </div>

    <div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <button
        v-for="a in actions"
        :key="a.label"
        class="group rounded-xl border border-zinc-200 bg-white p-3 text-left transition hover:border-zinc-300 hover:bg-zinc-50"
        type="button"
        @click="go(a.to)"
      >
        <div class="flex items-start gap-3">
          <div
            class="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 group-hover:bg-zinc-200"
          >
            <component :is="a.icon" class="h-4 w-4" />
          </div>
          <div class="min-w-0">
            <div class="truncate text-sm font-medium">{{ a.label }}</div>
            <div class="mt-1 truncate text-xs text-zinc-500">{{ a.desc }}</div>
          </div>
        </div>
      </button>
    </div>
  </el-card>
</template>

