<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { formatDateTime } from '@/stores/app'
import AlgorithmFormDialog from '@/components/algorithms/AlgorithmFormDialog.vue'
import VersionManagerDialog from '@/components/algorithms/VersionManagerDialog.vue'
import AlgorithmDownloadDialog, { type DownloadRecord } from '@/components/algorithms/AlgorithmDownloadDialog.vue'
import AlgorithmImportExportDialog from '@/components/algorithms/AlgorithmImportExportDialog.vue'
import {
  makeMockAlgorithms,
  makeMockVersions,
  type Algorithm,
  type AlgorithmStatus,
  type AlgorithmVersion,
} from '@/utils/algorithmsMock'

const STORAGE_KEY = 'edge_algorithms_v1'
const DOWNLOAD_KEY = 'edge_algorithm_downloads_v1'
const DEPLOYMENTS_KEY = 'edge_deployments_v1'

const loading = ref(false)

const keyword = ref('')
const status = ref<'' | AlgorithmStatus>('')
const category = ref<string | ''>('')

const page = ref(1)
const pageSize = ref(10)
const total = ref(0)

function loadAlgorithms() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as Algorithm[]
    }
  } catch {
    return makeMockAlgorithms()
  }
  return makeMockAlgorithms()
}

function saveAlgorithms(list: Algorithm[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    return
  }
}

function loadDownloadHistory(): DownloadRecord[] {
  try {
    const raw = window.localStorage.getItem(DOWNLOAD_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as DownloadRecord[]) : []
  } catch {
    return []
  }
}

function saveDownloadHistory(list: DownloadRecord[]) {
  try {
    window.localStorage.setItem(DOWNLOAD_KEY, JSON.stringify(list.slice(0, 20)))
  } catch {
    return
  }
}

const fullData = ref<Algorithm[]>(loadAlgorithms())
const rows = ref<Algorithm[]>([])

const allCategories = computed(() => Array.from(new Set(fullData.value.map((x) => x.category))).sort())

function applyFilter(data: Algorithm[]) {
  const kw = keyword.value.trim()
  return data
    .filter((a) => (kw ? a.id.includes(kw) || a.name.includes(kw) || a.vendor.includes(kw) : true))
    .filter((a) => (status.value ? a.status === status.value : true))
    .filter((a) => (category.value ? a.category === category.value : true))
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
}

async function fetchData() {
  loading.value = true
  try {
    await new Promise((r) => setTimeout(r, 220))
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
  keyword.value = ''
  status.value = ''
  category.value = ''
  page.value = 1
  refresh()
}

watch([page, pageSize], () => refresh())

onMounted(() => {
  if (!window.localStorage.getItem(STORAGE_KEY)) saveAlgorithms(fullData.value)
  refresh()
})

function statusTagType(s: AlgorithmStatus) {
  return s === '已启用' ? 'success' : 'info'
}

async function toggleEnable(a: Algorithm) {
  const next: AlgorithmStatus = a.status === '已启用' ? '已停用' : '已启用'
  const confirmed = await ElMessageBox.confirm(`确认将算法「${a.name}」${next}？`, '状态变更', {
    type: 'warning',
    confirmButtonText: '确认',
    cancelButtonText: '取消',
  })
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return

  const idx = fullData.value.findIndex((x) => x.id === a.id)
  if (idx < 0) return
  await new Promise((r) => setTimeout(r, 260))
  fullData.value[idx] = { ...fullData.value[idx], status: next, updatedAtMs: Date.now() }
  saveAlgorithms(fullData.value)
  ElMessage.success('状态已更新（占位）')
  refresh()
}

const formOpen = ref(false)
const editing = ref<Algorithm | null>(null)

function openCreate() {
  editing.value = null
  formOpen.value = true
}

function openEdit(a: Algorithm) {
  editing.value = { ...a }
  formOpen.value = true
}

function upsertAlgorithm(a: Algorithm) {
  const idx = fullData.value.findIndex((x) => x.id === a.id)
  if (idx >= 0) fullData.value[idx] = a
  else fullData.value.unshift(a)
  saveAlgorithms(fullData.value)
  refresh()
}

const versionOpen = ref(false)
const selected = ref<Algorithm | null>(null)
const versions = ref<AlgorithmVersion[]>([])

function openVersions(a: Algorithm) {
  selected.value = a
  versions.value = makeMockVersions(a.id, a.currentVersion)
  versionOpen.value = true
}

function rollback(payload: { version: string }) {
  if (!selected.value) return
  const id = selected.value.id
  const idx = fullData.value.findIndex((x) => x.id === id)
  if (idx < 0) return
  fullData.value[idx] = { ...fullData.value[idx], currentVersion: payload.version, updatedAtMs: Date.now() }
  saveAlgorithms(fullData.value)
  selected.value = fullData.value[idx]
  versions.value = makeMockVersions(id, payload.version)
  refresh()
}

async function removeAlgorithm(a: Algorithm) {
  let deployments: any[] = []
  try {
    const raw = window.localStorage.getItem(DEPLOYMENTS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) deployments = parsed
    }
  } catch {
    deployments = []
  }

  const used = deployments.filter((d) => Array.isArray(d.instances) && d.instances.some((ins: any) => ins?.algorithmId === a.id))
  const hint = used.length ? `\n\n检测到 ${used.length} 个布点正在使用该算法：\n${used.map((x) => `- ${x.name || x.id}`).slice(0, 6).join('\n')}${used.length > 6 ? '\n- ...' : ''}` : ''
  const confirmed = await ElMessageBox.confirm(`确认删除算法「${a.name}」？${hint}`, '删除确认', {
    type: used.length ? 'warning' : 'warning',
    confirmButtonText: used.length ? '仍要删除' : '删除',
    cancelButtonText: '取消',
  })
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return

  fullData.value = fullData.value.filter((x) => x.id !== a.id)
  saveAlgorithms(fullData.value)
  ElMessage.success('已删除（演示）')
  refresh()
}

const downloadOpen = ref(false)
const downloadHistory = ref<DownloadRecord[]>(loadDownloadHistory())

function openDownload() {
  downloadHistory.value = loadDownloadHistory()
  downloadOpen.value = true
}

function clearDownloadHistory() {
  downloadHistory.value = []
  saveDownloadHistory([])
}

function makeAlgId() {
  const n = Math.floor(10000 + Math.random() * 90000)
  return `ALG-${String(n).padStart(5, '0')}`
}

async function onDownload(payload: { server: { name: string }; url: string; name: string; modelFormat: string }) {
  const now = Date.now()
  const record: DownloadRecord = {
    id: `dl_${now}_${Math.floor(Math.random() * 1e5)}`,
    tsMs: now,
    serverName: payload.server.name,
    url: payload.url,
    progress: 0,
    status: '失败',
    message: '初始化',
  }
  downloadHistory.value = [record, ...downloadHistory.value].slice(0, 20)
  saveDownloadHistory(downloadHistory.value)

  await new Promise((r) => setTimeout(r, 220))
  record.progress = 35
  record.message = '下载中'
  saveDownloadHistory(downloadHistory.value)

  await new Promise((r) => setTimeout(r, 300))
  record.progress = 78
  record.message = '解压与校验'
  saveDownloadHistory(downloadHistory.value)

  await new Promise((r) => setTimeout(r, 240))
  const ok = Math.random() > 0.15
  record.progress = 100
  record.status = ok ? '成功' : '失败'
  record.message = ok ? '下载完成' : '网络异常'
  saveDownloadHistory(downloadHistory.value)

  if (!ok) {
    ElMessage.error('下载失败（演示）')
    return
  }

  const newAlg: Algorithm = {
    id: makeAlgId(),
    name: payload.name,
    category: '安防',
    scene: '公共区域',
    vendor: 'ThirdParty',
    currentVersion: 'v1.0.0',
    modelFormat: payload.modelFormat,
    packageName: payload.name,
    packageSource: 'remote_download',
    status: '已停用',
    updatedAtMs: Date.now(),
    lastSyncAtMs: Date.now(),
  }
  fullData.value.unshift(newAlg)
  saveAlgorithms(fullData.value)
  ElMessage.success('算法已导入（远程下载占位）')
  refresh()
}

const ieOpen = ref(false)
const ieMode = ref<'export' | 'import'>('export')

function openExport() {
  ieMode.value = 'export'
  ieOpen.value = true
}

function openImport() {
  ieMode.value = 'import'
  ieOpen.value = true
}

function onImport(payload: { algorithms: Algorithm[]; merge: boolean }) {
  if (!payload.merge) {
    fullData.value = payload.algorithms
  } else {
    const map = new Map(fullData.value.map((a) => [a.id, a]))
    for (const a of payload.algorithms) map.set(a.id, a)
    fullData.value = Array.from(map.values())
  }
  saveAlgorithms(fullData.value)
  refresh()
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div class="text-base font-semibold">算法管理</div>
        <div class="mt-1 text-xs text-zinc-500">支持远程下载、导入导出、版本回滚与启停（演示）。</div>
      </div>
      <div class="flex items-center gap-2">
        <el-button @click="openImport">导入</el-button>
        <el-button @click="openExport">导出</el-button>
        <el-button @click="openDownload">远程下载</el-button>
        <el-button type="primary" @click="openCreate">新增算法</el-button>
      </div>
    </div>

    <el-card>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-6">
        <el-input v-model="keyword" placeholder="名称/编号/供应商" clearable />
        <el-select v-model="category" placeholder="分类" clearable>
          <el-option v-for="c in allCategories" :key="c" :label="c" :value="c" />
        </el-select>
        <el-select v-model="status" placeholder="状态" clearable>
          <el-option label="已启用" value="已启用" />
          <el-option label="已停用" value="已停用" />
        </el-select>
        <div class="md:col-span-3 flex items-center justify-end gap-2">
          <el-button @click="onReset">重置</el-button>
          <el-button type="primary" :loading="loading" @click="onSearch">搜索</el-button>
        </div>
      </div>
    </el-card>

    <el-card>
      <el-table :data="rows" size="small" v-loading="loading" height="560" class="table-standard">
        <el-table-column prop="name" label="算法" min-width="220" />
        <el-table-column label="编号" min-width="120">
          <template #default="scope">
            <span class="font-mono text-xs">{{ scope.row.id }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="category" label="分类" width="90" />
        <el-table-column prop="scene" label="场景" min-width="120" />
        <el-table-column prop="vendor" label="供应商" width="120" />
        <el-table-column label="版本" width="120">
          <template #default="scope">
            <span class="font-mono text-xs">{{ scope.row.currentVersion }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="scope">
            <el-tag :type="statusTagType(scope.row.status)" size="small">{{ scope.row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="160">
          <template #default="scope">
            <span class="text-xs text-zinc-600">{{ formatDateTime(scope.row.updatedAtMs) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="scope">
            <div class="flex items-center gap-2">
              <el-button link type="primary" size="small" @click="toggleEnable(scope.row)">
                {{ scope.row.status === '已启用' ? '停用' : '启用' }}
              </el-button>
              <el-button link type="primary" size="small" @click="openVersions(scope.row)">版本管理</el-button>
              <el-dropdown trigger="click">
                <el-button link type="primary" size="small">更多</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item @click="openEdit(scope.row)">编辑</el-dropdown-item>
                    <el-dropdown-item @click="removeAlgorithm(scope.row)">删除</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
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

    <AlgorithmFormDialog v-model="formOpen" :initial="editing" @saved="upsertAlgorithm" />
    <VersionManagerDialog v-model="versionOpen" :algorithm="selected" :versions="versions" @rollback="rollback" />
    <AlgorithmDownloadDialog
      v-model="downloadOpen"
      :history="downloadHistory"
      @download="onDownload"
      @clear-history="clearDownloadHistory"
    />
    <AlgorithmImportExportDialog v-model="ieOpen" :mode="ieMode" :algorithms="fullData" @import="onImport" />
  </div>
</template>
