<script setup lang="ts">
import { formatDateTime } from '@/stores/app'
import type { LogRecord } from '@/utils/logsMock'

const props = defineProps<{ modelValue: boolean; record: LogRecord | null }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

function levelTagType(level: LogRecord['level']) {
  if (level === 'info') return 'info'
  if (level === 'warn') return 'warning'
  return 'danger'
}

const prettyDetail = computed(() => {
  if (!props.record) return ''
  try {
    return JSON.stringify(props.record.detail, null, 2)
  } catch {
    return String(props.record.detail)
  }
})
</script>

<template>
  <el-drawer v-model="open" title="日志详情" size="520" destroy-on-close>
    <div v-if="record" class="space-y-3">
      <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
        <div class="flex flex-wrap items-center gap-2">
          <el-tag :type="levelTagType(record.level)" size="small">{{ record.level.toUpperCase() }}</el-tag>
          <span class="text-sm font-semibold">{{ record.summary }}</span>
        </div>
        <div class="mt-2 grid grid-cols-1 gap-2 text-xs text-zinc-600">
          <div class="flex items-center justify-between gap-2"><span class="text-zinc-500">时间</span><span>{{ formatDateTime(record.tsMs) }}</span></div>
          <div class="flex items-center justify-between gap-2"><span class="text-zinc-500">模块</span><span>{{ record.module }}</span></div>
          <div class="flex items-center justify-between gap-2"><span class="text-zinc-500">动作</span><span>{{ record.action }}</span></div>
          <div class="flex items-center justify-between gap-2"><span class="text-zinc-500">操作者</span><span>{{ record.operator }}</span></div>
          <div class="flex items-center justify-between gap-2"><span class="text-zinc-500">IP</span><span class="font-mono">{{ record.ip }}</span></div>
          <div class="flex items-center justify-between gap-2"><span class="text-zinc-500">RequestId</span><span class="font-mono">{{ record.requestId }}</span></div>
          <div class="flex items-center justify-between gap-2"><span class="text-zinc-500">ID</span><span class="font-mono">{{ record.id }}</span></div>
        </div>
      </div>

      <div class="rounded-xl border border-zinc-200 bg-white p-3">
        <div class="text-xs text-zinc-500">详情</div>
        <pre class="mt-2 max-h-[420px] overflow-auto rounded-lg bg-zinc-50 p-3 text-xs leading-5 text-zinc-800">{{ prettyDetail }}</pre>
      </div>
    </div>
    <div v-else class="text-sm text-zinc-600">未选择日志</div>
  </el-drawer>
</template>

