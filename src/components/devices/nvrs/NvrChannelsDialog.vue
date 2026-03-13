<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { formatDateTime } from '@/stores/app'
import type { Nvr, NvrChannel } from '@/utils/nvrsMock'

const props = defineProps<{ modelValue: boolean; nvr: Nvr | null; channels: NvrChannel[] }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'sync', payload: { nvrId: string; channelIds: string[] }): void
}>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const state = reactive({
  keyword: '',
  selected: [] as string[],
})

watch(
  () => props.modelValue,
  (v) => {
    if (!v) return
    state.keyword = ''
    state.selected = []
  }
)

const filtered = computed(() => {
  const kw = state.keyword.trim()
  if (!kw) return props.channels
  return props.channels.filter((c) => c.name.includes(kw) || String(c.channelNo).includes(kw) || c.id.includes(kw))
})

const selectedCount = computed(() => state.selected.length)

function toggleSelectAll(v: boolean) {
  state.selected = v ? filtered.value.map((x) => x.id) : []
}

function onSync() {
  if (!props.nvr) return
  if (!selectedCount.value) {
    ElMessage.warning('请选择需要同步的通道')
    return
  }
  emit('sync', { nvrId: props.nvr.id, channelIds: [...state.selected] })
  open.value = false
}
</script>

<template>
  <el-dialog v-model="open" title="通道管理" width="860" append-to-body>
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div>
        <div class="text-sm font-semibold">{{ nvr?.name || '—' }}</div>
        <div class="mt-1 text-xs text-zinc-500">在此选择需要同步到摄像头列表的通道（演示）。</div>
      </div>
      <div class="flex items-center gap-2">
        <el-input v-model="state.keyword" placeholder="搜索通道" clearable class="w-56" />
        <el-button @click="toggleSelectAll(true)">全选</el-button>
        <el-button @click="toggleSelectAll(false)">清空</el-button>
        <el-button type="primary" @click="onSync">同步所选（{{ selectedCount }}）</el-button>
      </div>
    </div>

    <el-checkbox-group v-model="state.selected" class="block">
      <el-table :data="filtered" size="small" height="520" class="table-standard">
        <el-table-column width="48">
          <template #default="scope">
            <el-checkbox :label="scope.row.id" />
          </template>
        </el-table-column>
        <el-table-column label="通道号" width="90">
          <template #default="scope">
            <span class="font-mono text-xs">CH{{ String(scope.row.channelNo).padStart(2, '0') }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="通道名称" min-width="180" />
        <el-table-column label="已同步" width="90">
          <template #default="scope">
            <el-tag :type="scope.row.synced ? 'success' : 'info'" size="small">{{ scope.row.synced ? '是' : '否' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="160">
          <template #default="scope">
            <span class="text-xs text-zinc-600">{{ formatDateTime(scope.row.updatedAtMs) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="id" label="通道ID" min-width="240">
          <template #default="scope">
            <span class="font-mono text-xs">{{ scope.row.id }}</span>
          </template>
        </el-table-column>
      </el-table>
    </el-checkbox-group>

    <template #footer>
      <div class="flex items-center justify-end gap-2">
        <el-button @click="open = false">关闭</el-button>
      </div>
    </template>
  </el-dialog>
</template>
