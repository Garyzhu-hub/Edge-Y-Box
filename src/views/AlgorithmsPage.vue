<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { formatDateTime } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { appendManualLog } from '@/utils/logsMock'
import AlgorithmFormDialog from '@/components/algorithms/AlgorithmFormDialog.vue'
import VersionManagerDialog from '@/components/algorithms/VersionManagerDialog.vue'
import AlgorithmDownloadDialog, { type DownloadRecord } from '@/components/algorithms/AlgorithmDownloadDialog.vue'
import AlgorithmImportExportDialog from '@/components/algorithms/AlgorithmImportExportDialog.vue'
import {
  makeMockAlgorithms,
  makeMockVersions,
  type Algorithm,
  type AlgorithmRollbackRecord,
  type AlgorithmStatus,
  type AlgorithmVersion,
} from '@/utils/algorithmsMock'

const auth = useAuthStore()
const canCreateAlgorithm = computed(() => auth.hasPermission('algorithms.create'))
const canEditAlgorithm = computed(() => auth.hasPermission('algorithms.edit'))
const canDeleteAlgorithm = computed(() => auth.hasPermission('algorithms.delete'))

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
      if (Array.isArray(parsed)) return parsed.map((a) => normalizeAlgorithm(a))
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

function normalizeVersion(v: any): AlgorithmVersion | null {
  if (!v || typeof v !== 'object') return null
  const version = String(v.version || '').trim()
  const releasedAtMs = Number(v.releasedAtMs)
  if (!version || !Number.isFinite(releasedAtMs)) return null
  return {
    version,
    releasedAtMs,
    notes: String(v.notes || '历史版本'),
    isCurrent: Boolean(v.isCurrent),
  }
}

function normalizeRollback(r: any): AlgorithmRollbackRecord | null {
  if (!r || typeof r !== 'object') return null
  const tsMs = Number(r.tsMs)
  const fromVersion = String(r.fromVersion || '').trim()
  const toVersion = String(r.toVersion || '').trim()
  if (!Number.isFinite(tsMs) || !fromVersion || !toVersion) return null
  return {
    id: String(r.id || `rb_${tsMs}_${Math.floor(Math.random() * 1e5)}`),
    tsMs,
    fromVersion,
    toVersion,
    reason: String(r.reason || '手动回滚'),
    operator: String(r.operator || 'admin'),
  }
}

function normalizeAlgorithm(a: any): Algorithm {
  const base = a as Algorithm
  const currentVersion = String(base.currentVersion || 'v1.0.0')
  let versionHistory = Array.isArray(base.versionHistory) ? base.versionHistory.map((x) => normalizeVersion(x)).filter(Boolean) as AlgorithmVersion[] : []
  if (!versionHistory.length) versionHistory = makeMockVersions(base.id || 'ALG-00000', currentVersion)
  if (!versionHistory.some((v) => v.version === currentVersion)) {
    versionHistory = [
      { version: currentVersion, releasedAtMs: Date.now(), notes: '当前版本补录', isCurrent: true },
      ...versionHistory.map((v) => ({ ...v, isCurrent: false })),
    ]
  } else {
    versionHistory = versionHistory.map((v) => ({ ...v, isCurrent: v.version === currentVersion }))
  }
  versionHistory = versionHistory
    .slice()
    .sort((x, y) => y.releasedAtMs - x.releasedAtMs)
    .slice(0, 30)

  const rollbackHistory = Array.isArray(base.rollbackHistory)
    ? (base.rollbackHistory.map((x) => normalizeRollback(x)).filter(Boolean) as AlgorithmRollbackRecord[]).slice(0, 30)
    : []

  return {
    ...base,
    currentVersion,
    versionHistory,
    rollbackHistory,
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
  ElMessage.success(`算法已${next === '已启用' ? '启用' : '停用'}`)
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

function openVersionsFromForm(a: Algorithm) {
  formOpen.value = false
  openVersions(a)
}

function upsertAlgorithm(a: Algorithm) {
  const duplicate = fullData.value.find((x) => x.id !== a.id && x.name.trim() === a.name.trim())
  if (duplicate) {
    ElMessage.warning(`算法名称已存在：${duplicate.name}`)
    return
  }
  const idx = fullData.value.findIndex((x) => x.id === a.id)
  if (idx >= 0) fullData.value[idx] = a
  else fullData.value.unshift(a)
  saveAlgorithms(fullData.value)
  ElMessage.success(idx >= 0 ? '算法已更新' : '算法已新增')
  refresh()
}

const versionOpen = ref(false)
const selected = ref<Algorithm | null>(null)
const versions = ref<AlgorithmVersion[]>([])
const rollbackRecords = ref<AlgorithmRollbackRecord[]>([])

function openVersions(a: Algorithm) {
  selected.value = a
  versions.value = (a.versionHistory || makeMockVersions(a.id, a.currentVersion))
    .slice()
    .sort((x, y) => y.releasedAtMs - x.releasedAtMs)
  rollbackRecords.value = (a.rollbackHistory || []).slice().sort((x, y) => y.tsMs - x.tsMs)
  versionOpen.value = true
}

function uploadVersion(payload: { version: string; notes: string; setAsCurrent: boolean; fileName: string; modelFormat: string }) {
  if (!selected.value) return
  const id = selected.value.id
  const idx = fullData.value.findIndex((x) => x.id === id)
  if (idx < 0) return
  const now = Date.now()
  const base = fullData.value[idx]
  const history = (base.versionHistory || makeMockVersions(id, base.currentVersion)).slice()
  if (history.some((v) => v.version === payload.version)) {
    ElMessage.error('该版本号已存在')
    return
  }
  const nextHistory = [
    {
      version: payload.version,
      releasedAtMs: now,
      notes: payload.notes || '上传新版本',
      isCurrent: Boolean(payload.setAsCurrent),
    },
    ...history.map((v) => ({ ...v, isCurrent: payload.setAsCurrent ? false : v.isCurrent })),
  ]
    .slice()
    .sort((a, b) => b.releasedAtMs - a.releasedAtMs)
    .slice(0, 30)
  const currentVersion = payload.setAsCurrent ? payload.version : base.currentVersion
  const normalizedHistory = nextHistory.map((v) => ({ ...v, isCurrent: v.version === currentVersion }))

  fullData.value[idx] = {
    ...base,
    currentVersion,
    modelFormat: payload.modelFormat || base.modelFormat,
    packageName: payload.fileName || base.packageName,
    packageSource: 'local_upload',
    versionHistory: normalizedHistory,
    updatedAtMs: now,
    lastSyncAtMs: now,
  }
  saveAlgorithms(fullData.value)
  selected.value = fullData.value[idx]
  versions.value = (fullData.value[idx].versionHistory || []).slice().sort((x, y) => y.releasedAtMs - x.releasedAtMs)

  appendManualLog({
    kind: 'operation',
    tsMs: now,
    level: 'info',
    module: '算法管理',
    action: '上传版本',
    summary: `上传新版本：${fullData.value[idx].name}`,
    operator: 'admin',
    ip: '127.0.0.1',
    requestId: `algo_upload_${Math.floor(Math.random() * 1e6)}`,
    detail: {
      algorithmId: id,
      version: payload.version,
      setAsCurrent: payload.setAsCurrent,
      fileName: payload.fileName,
      modelFormat: payload.modelFormat,
      notes: payload.notes,
    },
  })
  ElMessage.success(`已上传版本 ${payload.version}（演示）`)
  refresh()
}

function rollback(payload: { version: string; reason: string }) {
  if (!selected.value) return
  const id = selected.value.id
  const idx = fullData.value.findIndex((x) => x.id === id)
  if (idx < 0) return
  const now = Date.now()
  const prevVersion = fullData.value[idx].currentVersion
  const nextHistory = (fullData.value[idx].versionHistory || makeMockVersions(id, prevVersion)).map((v) => ({
    ...v,
    isCurrent: v.version === payload.version,
  }))
  const rollbackRecord: AlgorithmRollbackRecord = {
    id: `rb_${now}_${Math.floor(Math.random() * 1e5)}`,
    tsMs: now,
    fromVersion: prevVersion,
    toVersion: payload.version,
    reason: payload.reason,
    operator: 'admin',
  }
  fullData.value[idx] = {
    ...fullData.value[idx],
    currentVersion: payload.version,
    versionHistory: nextHistory,
    rollbackHistory: [rollbackRecord, ...(fullData.value[idx].rollbackHistory || [])].slice(0, 30),
    updatedAtMs: now,
  }
  saveAlgorithms(fullData.value)
  selected.value = fullData.value[idx]
  versions.value = (fullData.value[idx].versionHistory || []).slice().sort((x, y) => y.releasedAtMs - x.releasedAtMs)
  rollbackRecords.value = (fullData.value[idx].rollbackHistory || []).slice().sort((x, y) => y.tsMs - x.tsMs)
  appendManualLog({
    kind: 'operation',
    tsMs: now,
    level: 'info',
    module: '算法管理',
    action: '回滚',
    summary: `算法回滚：${fullData.value[idx].name}`,
    operator: 'admin',
    ip: '127.0.0.1',
    requestId: `algo_rb_${Math.floor(Math.random() * 1e6)}`,
    detail: {
      algorithmId: id,
      fromVersion: prevVersion,
      toVersion: payload.version,
      reason: payload.reason,
    },
  })
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
  ElMessage.success('算法已删除')
  refresh()
}

const downloadOpen = ref(false)
const downloadHistory = ref<DownloadRecord[]>(loadDownloadHistory())
const downloadTimers = new Map<string, number>()

function openDownload() {
  downloadHistory.value = loadDownloadHistory()
  downloadOpen.value = true
}

function clearDownloadHistory() {
  for (const t of downloadTimers.values()) window.clearInterval(t)
  downloadTimers.clear()
  downloadHistory.value = []
  saveDownloadHistory([])
}

function makeAlgId() {
  const n = Math.floor(10000 + Math.random() * 90000)
  return `ALG-${String(n).padStart(5, '0')}`
}

function hashText(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function persistHistory() {
  saveDownloadHistory(downloadHistory.value)
}

function upsertHistory(record: DownloadRecord) {
  const idx = downloadHistory.value.findIndex((x) => x.id === record.id)
  if (idx >= 0) downloadHistory.value[idx] = { ...record }
  else downloadHistory.value = [record, ...downloadHistory.value].slice(0, 20)
  persistHistory()
}

function finishDownload(record: DownloadRecord, ok: boolean, failReason: string) {
  if (downloadTimers.has(record.id)) {
    window.clearInterval(downloadTimers.get(record.id))
    downloadTimers.delete(record.id)
  }
  record.progress = 100
  record.status = ok ? '成功' : '失败'
  record.message = ok ? '下载完成' : failReason
  upsertHistory(record)

  if (!ok) {
    ElMessage.error('下载失败（演示）')
    return
  }

  const algId = makeAlgId()
  const newAlg: Algorithm = {
    id: algId,
    name: record.name,
    category: '安防',
    scene: '公共区域',
    vendor: 'ThirdParty',
    currentVersion: 'v1.0.0',
    modelFormat: record.modelFormat,
    packageName: record.name,
    packageSource: 'remote_download',
    status: '已停用',
    versionHistory: makeMockVersions(algId, 'v1.0.0'),
    rollbackHistory: [],
    updatedAtMs: Date.now(),
    lastSyncAtMs: Date.now(),
  }
  fullData.value.unshift(newAlg)
  saveAlgorithms(fullData.value)
  ElMessage.success('算法已导入（远程下载演示）')
  refresh()
}

function startDownloadTask(record: DownloadRecord) {
  const fingerprint = `${record.url}|${record.modelFormat}|${record.retryCount}`
  const seed = hashText(fingerprint)
  const failType = seed % 4
  const failAt = 55 + (seed % 30)
  const step = 6 + (seed % 8)
  const tick = 140 + (seed % 130)
  const ok = failType !== 0 || record.retryCount >= 1

  record.status = '下载中'
  record.progress = 0
  record.message = '创建下载任务'
  upsertHistory(record)

  const timer = window.setInterval(() => {
    const next = Math.min(99, record.progress + step)
    record.progress = next
    if (next < 35) record.message = '下载中'
    else if (next < 70) record.message = '校验签名'
    else record.message = '解压与导入'
    upsertHistory(record)

    if (!ok && next >= failAt) {
      const reason = failType === 0 ? '网络异常：连接超时' : '下载失败'
      finishDownload(record, false, reason)
      return
    }
    if (next >= 99) {
      finishDownload(record, true, '下载完成')
    }
  }, tick)

  downloadTimers.set(record.id, timer)
}

function onDownload(payload: { server: { name: string }; url: string; name: string; modelFormat: string }) {
  const now = Date.now()
  const record: DownloadRecord = {
    id: `dl_${now}_${Math.floor(Math.random() * 1e5)}`,
    taskId: `task_${now}_${Math.floor(Math.random() * 1e4)}`,
    tsMs: now,
    serverName: payload.server.name,
    url: payload.url,
    name: payload.name,
    modelFormat: payload.modelFormat,
    progress: 0,
    status: '下载中',
    message: '初始化',
    retryCount: 0,
  }
  upsertHistory(record)
  startDownloadTask(record)
}

function retryDownload(recordId: string) {
  const prev = downloadHistory.value.find((x) => x.id === recordId)
  if (!prev) {
    ElMessage.warning('未找到下载记录')
    return
  }
  if (prev.status === '下载中') {
    ElMessage.warning('下载进行中，请稍后')
    return
  }
  const now = Date.now()
  const retryRecord: DownloadRecord = {
    ...prev,
    id: `dl_${now}_${Math.floor(Math.random() * 1e5)}`,
    taskId: `task_${now}_${Math.floor(Math.random() * 1e4)}`,
    tsMs: now,
    progress: 0,
    status: '下载中',
    message: '重试中',
    retryCount: (prev.retryCount || 0) + 1,
  }
  upsertHistory(retryRecord)
  startDownloadTask(retryRecord)
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

function onImport(payload: { algorithms: Algorithm[]; merge: boolean; source: string; conflictStrategy: 'update' | 'appendVersion' }) {
  const existingIds = new Set(fullData.value.map((x) => x.id))
  const normalized = (Array.isArray(payload.algorithms) ? payload.algorithms : [])
    .map((a) => normalizeAlgorithm(a))
    .filter((a) => a && typeof a.id === 'string' && typeof a.name === 'string')

  if (!normalized.length) {
    ElMessage.warning('未检测到可导入的算法数据')
    return
  }

  if (!payload.merge) {
    fullData.value = normalized
  } else {
    const map = new Map(fullData.value.map((a) => [a.id, a]))
    for (const a of normalized) {
      if (!map.has(a.id)) {
        map.set(a.id, a)
        continue
      }
      const prev = map.get(a.id)!
      if (payload.conflictStrategy === 'appendVersion') {
        const now = Date.now()
        const incomingVersion = String(a.currentVersion || '').trim() || `v${new Date(now).toISOString().slice(0, 10)}`
        const prevHistory = (prev.versionHistory || makeMockVersions(prev.id, prev.currentVersion)).slice()
        const already = prevHistory.some((v) => v.version === incomingVersion)
        const nextHistory = already
          ? prevHistory
          : [
              {
                version: incomingVersion,
                releasedAtMs: now,
                notes: `导入升级（来源：${payload.source}）`,
                isCurrent: true,
              },
              ...prevHistory.map((v) => ({ ...v, isCurrent: false })),
            ]
        map.set(a.id, {
          ...prev,
          currentVersion: incomingVersion,
          versionHistory: nextHistory.map((v) => ({ ...v, isCurrent: v.version === incomingVersion })).slice(0, 30),
          modelFormat: a.modelFormat || prev.modelFormat,
          packageName: a.packageName || prev.packageName,
          packageSource: a.packageSource || prev.packageSource,
          updatedAtMs: now,
          lastSyncAtMs: now,
        })
      } else {
        map.set(a.id, a)
      }
    }
    fullData.value = Array.from(map.values())
  }
  const updatedCount = normalized.filter((x) => existingIds.has(x.id)).length
  const createdCount = Math.max(0, normalized.length - updatedCount)
  saveAlgorithms(fullData.value)
  refresh()
  ElMessage.success(`导入完成：新增${createdCount}，更新${updatedCount}（来源：${payload.source}）`)
}

onBeforeUnmount(() => {
  for (const t of downloadTimers.values()) window.clearInterval(t)
  downloadTimers.clear()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div class="text-base font-semibold">算法管理</div>
        <div class="mt-1 text-xs text-zinc-500">支持远程下载、导入导出、版本回滚与启停（演示）。</div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <el-button v-if="canEditAlgorithm" @click="openImport">导入</el-button>
        <el-button v-if="canEditAlgorithm" @click="openExport">导出</el-button>
        <el-button v-if="canEditAlgorithm" @click="openDownload">远程下载</el-button>
        <el-button v-if="canCreateAlgorithm" type="primary" @click="openCreate">新增算法</el-button>
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
            <div class="flex flex-wrap items-center gap-2">
              <el-button v-if="canEditAlgorithm" link type="primary" size="small" @click="toggleEnable(scope.row)">
                {{ scope.row.status === '已启用' ? '停用' : '启用' }}
              </el-button>
              <el-button v-if="canEditAlgorithm" link type="primary" size="small" @click="openVersions(scope.row)">
                版本管理
              </el-button>
              <el-dropdown v-if="canEditAlgorithm || canDeleteAlgorithm" trigger="click">
                <el-button link type="primary" size="small">更多</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-if="canEditAlgorithm" @click="openEdit(scope.row)">编辑</el-dropdown-item>
                    <el-dropdown-item v-if="canDeleteAlgorithm" @click="removeAlgorithm(scope.row)">删除</el-dropdown-item>
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

    <AlgorithmFormDialog v-model="formOpen" :initial="editing" @saved="upsertAlgorithm" @open-versions="openVersionsFromForm" />
    <VersionManagerDialog
      v-model="versionOpen"
      :algorithm="selected"
      :versions="versions"
      :rollback-records="rollbackRecords"
      @rollback="rollback"
      @upload-version="uploadVersion"
    />
    <AlgorithmDownloadDialog
      v-model="downloadOpen"
      :history="downloadHistory"
      @download="onDownload"
      @retry="retryDownload"
      @clear-history="clearDownloadHistory"
    />
    <AlgorithmImportExportDialog v-model="ieOpen" :mode="ieMode" :algorithms="fullData" @import="onImport" />
  </div>
</template>
