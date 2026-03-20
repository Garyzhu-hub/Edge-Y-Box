<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { formatDateTime } from '@/stores/app'
import { appendManualLog } from '@/utils/logsMock'
import ConfigEditDialog from '@/components/system/config/ConfigEditDialog.vue'
import { makeDefaultConfig, type ConfigItem, type ConfigValueType } from '@/utils/configMock'

type FilterModel = {
  keyword: string
  group: '' | string
  type: '' | ConfigValueType
}

const STORAGE_KEY = 'edge_config_v1'

const filter = reactive<FilterModel>({
  keyword: '',
  group: '',
  type: '',
})

const loading = ref(false)
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)

const fullData = ref<ConfigItem[]>([])
const rows = ref<ConfigItem[]>([])

function loadConfig() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as ConfigItem[]
    }
  } catch {
    return makeDefaultConfig()
  }
  return makeDefaultConfig()
}

function saveConfig(list: ConfigItem[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    return
  }
}

const groupOptions = computed(() => {
  const set = new Set(fullData.value.map((x) => x.group))
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-CN'))
})

function labelForType(t: ConfigValueType) {
  if (t === 'text') return '文本'
  if (t === 'number') return '数值'
  if (t === 'boolean') return '布尔'
  if (t === 'json') return 'JSON'
  return '密钥'
}

function applyFilter(list: ConfigItem[]) {
  const kw = filter.keyword.trim()
  return list
    .filter((x) => (filter.group ? x.group === filter.group : true))
    .filter((x) => (filter.type ? x.type === filter.type : true))
    .filter((x) => {
      if (!kw) return true
      return x.label.includes(kw) || x.key.includes(kw) || x.group.includes(kw)
    })
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
}

async function refresh() {
  loading.value = true
  try {
    await new Promise((r) => setTimeout(r, 160))
    const filtered = applyFilter(fullData.value)
    total.value = filtered.length
    const start = (page.value - 1) * pageSize.value
    rows.value = filtered.slice(start, start + pageSize.value)
  } finally {
    loading.value = false
  }
}

function onSearch() {
  page.value = 1
  refresh()
}

function onReset() {
  filter.keyword = ''
  filter.group = ''
  filter.type = ''
  page.value = 1
  refresh()
}

const dialogOpen = ref(false)
const editing = ref<ConfigItem | null>(null)

function openEdit(item: ConfigItem) {
  editing.value = item
  dialogOpen.value = true
}

function writeOp(action: string, summary: string, detail: Record<string, unknown>) {
  appendManualLog({
    kind: 'operation',
    tsMs: Date.now(),
    level: 'info',
    module: '配置管理',
    action,
    summary,
    operator: 'admin',
    ip: '127.0.0.1',
    requestId: `config_${Math.floor(Math.random() * 1e6)}`,
    detail,
  })
}

function onSave(payload: { id: string; value?: string; secretUpdated?: boolean }) {
  const idx = fullData.value.findIndex((x) => x.id === payload.id)
  if (idx < 0) return

  const now = Date.now()
  const cur = fullData.value[idx]

  if (cur.type === 'secret') {
    if (!payload.secretUpdated) {
      writeOp('保存', `编辑配置（未改密钥）：${cur.key}`, { id: cur.id, key: cur.key, secretUpdated: false })
      ElMessage.success('配置已保存')
      return
    }
    const next: ConfigItem = { ...cur, secretConfigured: true, updatedAtMs: now }
    const list = fullData.value.slice()
    list[idx] = next
    fullData.value = list
    saveConfig(list)
    writeOp('保存', `更新密钥配置：${cur.key}`, { id: cur.id, key: cur.key, secretUpdated: true })
    ElMessage.success('密钥已更新')
    refresh()
    return
  }

  const next: ConfigItem = { ...cur, value: payload.value ?? '', updatedAtMs: now }
  const list = fullData.value.slice()
  list[idx] = next
  fullData.value = list
  saveConfig(list)
  writeOp('保存', `更新配置：${cur.key}`, { id: cur.id, key: cur.key, type: cur.type })
  ElMessage.success('配置已保存')
  refresh()
}

function onExport() {
  const payload = {
    exportedAtMs: Date.now(),
    count: fullData.value.length,
    rows: fullData.value,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `config_${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
  writeOp('导出', '导出配置（演示数据）', { count: fullData.value.length })
  ElMessage.success('配置已导出（演示数据）')
}

function onImport() {
  writeOp('导入', '导入配置预检（演示）', {})
  ElMessage.info('导入入口已触发（演示预检），当前版本不覆盖现有配置')
}

function displayValue(item: ConfigItem) {
  if (item.type === 'secret') return item.secretConfigured ? '已设置（不回显）' : '未设置'
  if (item.type === 'boolean') return item.value === 'true' ? 'true' : 'false'
  if (item.type === 'json') {
    const v = item.value || ''
    return v.length > 48 ? `${v.slice(0, 48)}…` : v
  }
  return item.value || ''
}

onMounted(() => {
  fullData.value = loadConfig()
  refresh()
})

watch([page, pageSize], () => refresh())
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div class="text-base font-semibold">配置管理</div>
        <div class="mt-1 text-xs text-zinc-500">支持分组/搜索/编辑（演示）；密钥不回显且不改不提交。</div>
      </div>

      <div class="flex items-center gap-2">
        <el-button @click="onImport">导入</el-button>
        <el-button @click="onExport">导出</el-button>
      </div>
    </div>

    <el-card>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-7">
        <el-input v-model="filter.keyword" placeholder="搜索名称/Key/分组" clearable />
        <el-select v-model="filter.group" placeholder="分组" clearable>
          <el-option v-for="g in groupOptions" :key="g" :label="g" :value="g" />
        </el-select>
        <el-select v-model="filter.type" placeholder="类型" clearable>
          <el-option label="文本" value="text" />
          <el-option label="数值" value="number" />
          <el-option label="布尔" value="boolean" />
          <el-option label="JSON" value="json" />
          <el-option label="密钥" value="secret" />
        </el-select>

        <div class="md:col-span-4 flex items-center justify-end gap-2">
          <el-button @click="onReset">重置</el-button>
          <el-button type="primary" :loading="loading" @click="onSearch">搜索</el-button>
        </div>
      </div>
    </el-card>

    <el-card>
      <el-table :data="rows" size="small" v-loading="loading" height="560" class="table-standard">
        <el-table-column prop="group" label="分组" width="120" />
        <el-table-column label="配置项" min-width="220">
          <template #default="scope">
            <div class="min-w-0">
              <div class="truncate text-sm font-semibold">{{ scope.row.label }}</div>
              <div class="truncate font-mono text-xs text-zinc-500">{{ scope.row.key }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="90">
          <template #default="scope">
            <el-tag type="info" size="small">{{ labelForType(scope.row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="值" min-width="220">
          <template #default="scope">
            <span class="text-xs text-zinc-700">{{ displayValue(scope.row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="160">
          <template #default="scope">
            <span class="text-xs text-zinc-600">{{ formatDateTime(scope.row.updatedAtMs) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="scope">
            <el-button link type="primary" size="small" @click="openEdit(scope.row)">编辑</el-button>
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

    <ConfigEditDialog v-model="dialogOpen" :item="editing" @save="onSave" />
  </div>
</template>

