<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { useAppStore, formatDateTime } from '@/stores/app'
import LogDetailDrawer from '@/components/logs/LogDetailDrawer.vue'
import {
  kindLabel,
  makeMockLogs,
  modulesByKind,
  type LogKind,
  type LogLevel,
  type LogRecord,
} from '@/utils/logsMock'

const props = defineProps<{ kind: LogKind; title?: string }>()

const app = useAppStore()

type FilterModel = {
  keyword: string
  level: '' | LogLevel
  module: string
  operator: string
  range: [Date, Date] | null
}

const filter = reactive<FilterModel>({
  keyword: '',
  level: '',
  module: '',
  operator: '',
  range: null,
})

const followGlobalRange = ref(true)
const internalUpdatingRange = ref(false)

function setRangeFromGlobal() {
  internalUpdatingRange.value = true
  filter.range = [new Date(app.timeRange.fromMs), new Date(app.timeRange.toMs)]
  internalUpdatingRange.value = false
}

const loading = ref(false)
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)

const fullData = ref<LogRecord[]>([])
const mockWindowKey = ref('')

function ensureMockDataInRange() {
  if (!filter.range) return
  const [from, to] = filter.range
  const key = `${props.kind}-${from.getTime()}-${to.getTime()}`
  if (mockWindowKey.value === key && fullData.value.length) return
  mockWindowKey.value = key
  fullData.value = makeMockLogs({ kind: props.kind, fromMs: from.getTime(), toMs: to.getTime(), count: 90 })
}

function applyFilter(data: LogRecord[]) {
  const kw = filter.keyword.trim()
  const trimmedOperator = filter.operator.trim()
  return data
    .filter((r) => {
      if (!kw) return true
      return (
        r.id.includes(kw) ||
        r.summary.includes(kw) ||
        r.module.includes(kw) ||
        r.action.includes(kw) ||
        r.requestId.includes(kw)
      )
    })
    .filter((r) => (filter.level ? r.level === filter.level : true))
    .filter((r) => (filter.module ? r.module === filter.module : true))
    .filter((r) => (trimmedOperator ? r.operator.includes(trimmedOperator) : true))
    .sort((a, b) => b.tsMs - a.tsMs)
}

const rows = ref<LogRecord[]>([])

async function fetchData() {
  loading.value = true
  try {
    await new Promise((r) => setTimeout(r, 180))
    ensureMockDataInRange()
    const filtered = applyFilter(fullData.value)
    total.value = filtered.length
    const start = (page.value - 1) * pageSize.value
    return filtered.slice(start, start + pageSize.value)
  } finally {
    loading.value = false
  }
}

async function refresh() {
  rows.value = await fetchData()
}

function onSearch() {
  page.value = 1
  refresh()
}

function onReset() {
  filter.keyword = ''
  filter.level = ''
  filter.module = ''
  filter.operator = ''
  followGlobalRange.value = true
  setRangeFromGlobal()
  page.value = 1
  refresh()
}

watch([page, pageSize], () => refresh())

watch(
  () => filter.range,
  (v) => {
    if (internalUpdatingRange.value) return
    if (!v) {
      followGlobalRange.value = true
      setRangeFromGlobal()
      return
    }
    followGlobalRange.value = false
  }
)

watch(
  () => app.timeRange,
  () => {
    if (!followGlobalRange.value) return
    setRangeFromGlobal()
    ensureMockDataInRange()
    page.value = 1
    refresh()
  },
  { deep: true }
)

onMounted(() => {
  setRangeFromGlobal()
  ensureMockDataInRange()
  refresh()
})

function levelTagType(level: LogLevel) {
  if (level === 'info') return 'info'
  if (level === 'warn') return 'warning'
  return 'danger'
}

const drawerOpen = ref(false)
const selected = ref<LogRecord | null>(null)

function openDetail(r: LogRecord) {
  selected.value = r
  drawerOpen.value = true
}

function onExport() {
  ElMessage.success('导出已提交（占位）')
}

const pageTitle = computed(() => props.title || kindLabel(props.kind))
const moduleOptions = computed(() => modulesByKind(props.kind))
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div class="text-base font-semibold">{{ pageTitle }}</div>
        <div class="mt-1 text-xs text-zinc-500">支持筛选、详情查看与导出（演示）。</div>
      </div>
      <div class="flex items-center gap-2">
        <el-button @click="onExport">导出</el-button>
      </div>
    </div>

    <el-card>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-7">
        <el-input v-model="filter.keyword" placeholder="关键词/ID/RequestId" clearable />
        <el-select v-model="filter.module" placeholder="模块" clearable>
          <el-option v-for="m in moduleOptions" :key="m" :label="m" :value="m" />
        </el-select>
        <el-select v-model="filter.level" placeholder="等级" clearable>
          <el-option label="INFO" value="info" />
          <el-option label="WARN" value="warn" />
          <el-option label="ERROR" value="error" />
        </el-select>
        <el-input v-model="filter.operator" placeholder="操作者" clearable />
        <el-date-picker
          v-model="filter.range"
          type="daterange"
          unlink-panels
          range-separator="~"
          start-placeholder="开始"
          end-placeholder="结束"
        />
        <div class="md:col-span-2 flex items-center justify-end gap-2">
          <el-button @click="onReset">重置</el-button>
          <el-button type="primary" :loading="loading" @click="onSearch">搜索</el-button>
        </div>
      </div>
    </el-card>

    <el-card>
      <el-table :data="rows" size="small" v-loading="loading" height="560" class="table-standard">
        <el-table-column label="时间" width="160">
          <template #default="scope">
            <span class="text-xs text-zinc-600">{{ formatDateTime(scope.row.tsMs) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="等级" width="90">
          <template #default="scope">
            <el-tag :type="levelTagType(scope.row.level)" size="small">{{ scope.row.level.toUpperCase() }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="module" label="模块" width="120" />
        <el-table-column prop="action" label="动作" width="120" />
        <el-table-column prop="operator" label="操作者" width="120" />
        <el-table-column prop="summary" label="摘要" min-width="260" />
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="scope">
            <el-button link type="primary" size="small" @click="openDetail(scope.row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="mt-3 flex justify-end">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next, sizes"
          :page-sizes="[10, 20, 50]"
          small
        />
      </div>
    </el-card>

    <LogDetailDrawer v-model="drawerOpen" :record="selected" />
  </div>
</template>

