<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { formatDateTime } from '@/stores/app'
import type { GbCascadePlatform } from '@/utils/gbCascadeMock'
import type { LocalGbChannel } from '@/utils/gbLocalChannels'
import { ElMessage } from 'element-plus'
import { appendManualLog } from '@/utils/logsMock'

const props = defineProps<{
  modelValue: boolean
  platform: GbCascadePlatform | null
  channels: LocalGbChannel[]
  initialTab?: 'list' | 'share'
  totalCount?: number
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

function tagType(status: LocalGbChannel['status']) {
  if (status === '在线') return 'success'
  if (status === '离线') return 'info'
  return 'warning'
}

const tab = ref<'list' | 'share'>('list')
const keyword = ref('')
const selectedIds = ref<string[]>([])
const applyingSelection = ref(false)
const tableRef = ref()
const SHARE_KEY = 'edge_gb_shared_channels_v1'

function loadShareMap() {
  try {
    const raw = window.localStorage.getItem(SHARE_KEY)
    if (!raw) return {} as Record<string, string[]>
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string[]>) : ({} as Record<string, string[]>)
  } catch {
    return {} as Record<string, string[]>
  }
}

function saveShareMap(next: Record<string, string[]>) {
  try {
    window.localStorage.setItem(SHARE_KEY, JSON.stringify(next))
  } catch {
    return
  }
}

const filtered = computed(() => {
  const kw = keyword.value.trim()
  if (!kw) return props.channels
  return props.channels.filter((c) => c.gbId.includes(kw) || c.name.includes(kw) || c.cameraId.includes(kw) || c.cameraIp.includes(kw) || c.groupPath.includes(kw))
})

const isShare = computed(() => tab.value === 'share')

function reloadShareSelection() {
  const pid = props.platform?.id
  if (!pid) {
    selectedIds.value = []
    return
  }
  const map = loadShareMap()
  const ids = Array.isArray(map[pid]) ? map[pid] : []
  selectedIds.value = ids
}

function selectAllFiltered() {
  selectedIds.value = Array.from(new Set([...selectedIds.value, ...filtered.value.map((c) => c.gbId)]))
  applySelectionToTable()
}

function clearAll() {
  selectedIds.value = []
  applySelectionToTable()
}

function onSelectionChange(rows: LocalGbChannel[]) {
  if (!isShare.value) return
  if (applyingSelection.value) return
  const set = new Set(selectedIds.value)
  const visibleIds = new Set(filtered.value.map((c) => c.gbId))
  for (const id of visibleIds) set.delete(id)
  for (const r of rows) set.add(r.gbId)
  selectedIds.value = Array.from(set)
}

async function applySelectionToTable() {
  if (!isShare.value) return
  if (!tableRef.value) return
  applyingSelection.value = true
  await nextTick()
  tableRef.value.clearSelection()
  const set = new Set(selectedIds.value)
  for (const r of filtered.value) {
    if (set.has(r.gbId)) tableRef.value.toggleRowSelection(r, true)
  }
  applyingSelection.value = false
}

function onSaveShare() {
  const pid = props.platform?.id
  if (!pid || !props.platform) return
  const map = loadShareMap()
  map[pid] = selectedIds.value.slice()
  saveShareMap(map)
  appendManualLog({
    kind: 'operation',
    tsMs: Date.now(),
    level: 'info',
    module: 'GB28181',
    action: '通道共享',
    summary: `通道共享已提交：${props.platform.name}`,
    operator: 'admin',
    ip: '127.0.0.1',
    requestId: `gb_share_${Math.floor(Math.random() * 1e6)}`,
    detail: { platformId: pid, count: selectedIds.value.length },
  })
  ElMessage.success('已保存共享通道（演示）')
}

watch(
  () => open.value,
  (v) => {
    if (!v) return
    tab.value = props.initialTab || 'list'
    keyword.value = ''
    reloadShareSelection()
    nextTick(() => applySelectionToTable())
  }
)

watch(
  () => props.platform?.id,
  () => {
    if (!open.value) return
    reloadShareSelection()
    nextTick(() => applySelectionToTable())
  }
)

watch(
  () => tab.value,
  () => {
    nextTick(() => applySelectionToTable())
  }
)

watch(
  () => keyword.value,
  () => {
    nextTick(() => applySelectionToTable())
  }
)
</script>

<template>
  <el-drawer v-model="open" size="720" direction="rtl" append-to-body>
    <template #header>
      <div>
        <div class="text-sm font-semibold">本机通道池 / 通道共享</div>
        <div class="mt-1 text-xs text-zinc-500">{{ platform?.name || '—' }}（共享清单按平台保存）</div>
      </div>
    </template>

    <div class="mb-3 flex items-center justify-between gap-2">
      <el-input v-model="keyword" placeholder="搜索通道ID/名称/摄像头ID/IP/分组" clearable class="w-[360px]" />
      <el-segmented
        v-model="tab"
        size="small"
        :options="[
          { label: '列表', value: 'list' },
          { label: '通道共享', value: 'share' },
        ]"
      />
    </div>

    <div v-if="tab === 'share'" class="mb-3 flex items-center justify-between gap-2">
      <div class="text-xs text-zinc-500">已选择 {{ selectedIds.length }} / {{ totalCount ?? channels.length }}</div>
      <div class="flex items-center gap-2">
        <el-button size="small" @click="selectAllFiltered">全选当前筛选</el-button>
        <el-button size="small" @click="clearAll">清空</el-button>
        <el-button type="primary" size="small" @click="onSaveShare">保存共享</el-button>
      </div>
    </div>

    <el-table
      ref="tableRef"
      :data="filtered"
      size="small"
      height="600"
      class="table-standard"
      :row-key="(row: LocalGbChannel) => row.gbId"
      @selection-change="onSelectionChange"
    >
      <el-table-column v-if="isShare" type="selection" width="48" :reserve-selection="true" />
      <el-table-column prop="gbId" label="通道ID" min-width="210" />
      <el-table-column prop="name" label="名称" min-width="160" />
      <el-table-column label="共享" width="90">
        <template #default="scope">
          <el-tag :type="selectedIds.includes(scope.row.gbId) ? 'success' : 'info'" size="small">
            {{ selectedIds.includes(scope.row.gbId) ? '已共享' : '未共享' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="groupPath" label="分组" width="180" />
      <el-table-column prop="protocol" label="协议" width="100" />
      <el-table-column label="IP" width="140">
        <template #default="scope">
          <span class="font-mono text-xs text-zinc-600">{{ scope.row.cameraIp }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="scope">
          <el-tag :type="tagType(scope.row.status)" size="small">{{ scope.row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="更新时间" width="160">
        <template #default="scope">
          <span class="text-xs text-zinc-600">{{ formatDateTime(scope.row.updatedAtMs) }}</span>
        </template>
      </el-table-column>
    </el-table>
  </el-drawer>
</template>
