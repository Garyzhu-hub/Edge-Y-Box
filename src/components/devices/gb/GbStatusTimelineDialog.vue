<script setup lang="ts">
import { computed } from 'vue'
import { formatDateTime } from '@/stores/app'
import type { GbCascadePlatform, GbStatus } from '@/utils/gbCascadeMock'

export type GbStatusEvent = { tsMs: number; status: GbStatus }

const props = defineProps<{ modelValue: boolean; platform: GbCascadePlatform | null; events: GbStatusEvent[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

function tagType(s: GbStatus) {
  if (s === '在线') return 'success'
  if (s === '离线') return 'info'
  return 'warning'
}

const sorted = computed(() => props.events.slice().sort((a, b) => b.tsMs - a.tsMs))
</script>

<template>
  <el-dialog v-model="open" width="720" align-center destroy-on-close>
    <template #header>
      <div>
        <div class="text-sm font-semibold">状态详情</div>
        <div class="mt-1 text-xs text-zinc-500">{{ platform?.name || '—' }}</div>
      </div>
    </template>

    <div v-if="platform" class="space-y-3">
      <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
        <div class="grid grid-cols-1 gap-2 md:grid-cols-3">
          <div>
            <div class="text-xs text-zinc-500">当前状态</div>
            <div class="mt-1">
              <el-tag :type="tagType(platform.status)" size="small">{{ platform.status }}</el-tag>
            </div>
          </div>
          <div>
            <div class="text-xs text-zinc-500">注册状态</div>
            <div class="mt-1">
              <el-tag :type="platform.registered ? 'success' : 'info'" size="small">{{ platform.registered ? '已注册' : '未注册' }}</el-tag>
            </div>
          </div>
          <div>
            <div class="text-xs text-zinc-500">最近注册时间</div>
            <div class="mt-1 text-xs text-zinc-600">{{ formatDateTime(platform.lastRegisterAtMs) }}</div>
          </div>
        </div>
      </div>

      <div v-if="!sorted.length" class="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">暂无状态变更记录</div>
      <el-timeline v-else>
        <el-timeline-item
          v-for="e in sorted"
          :key="`${e.tsMs}-${e.status}`"
          :timestamp="formatDateTime(e.tsMs)"
          placement="top"
        >
          <el-tag :type="tagType(e.status)" size="small">{{ e.status }}</el-tag>
        </el-timeline-item>
      </el-timeline>
    </div>

    <template #footer>
      <el-button @click="open = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

