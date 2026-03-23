<script setup lang="ts">
import { computed } from 'vue'
import { defaultTodayRangeDates, formatDateTime } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { ElMessage, ElMessageBox } from 'element-plus'
import SnapshotTaskFormDialog from '@/components/tasks/SnapshotTaskFormDialog.vue'
import TaskDetailDialog from '@/components/tasks/TaskDetailDialog.vue'
import DeviceExecDialog from '@/components/tasks/DeviceExecDialog.vue'
import { flattenGroupOptions, groupTree as initialGroupTree, type TreeNode } from '@/utils/devicesCamerasMock'
import {
  cloudStatus,
  loadDeviceRuns,
  loadTaskRuns,
  persistDeviceRuns,
  persistTaskRuns,
  reportResultsToCloud,
  syncImagesToCloud,
  syncTasksFromCloud,
} from '@/utils/taskCloudSync'
import {
  makeMockDeviceRuns,
  makeMockRuns,
  makeMockTasks,
  type DeviceRun,
  type RunStatus,
  type SnapshotTask,
  type SnapshotTaskStatus,
  type TaskRun,
} from '@/utils/tasksMock'

type FilterModel = {
  keyword: string
  status: '' | SnapshotTaskStatus
  lastRunStatus: '' | RunStatus
  range: [Date, Date] | null
}

const filter = reactive<FilterModel>({
  keyword: '',
  status: '',
  lastRunStatus: '',
  range: null,
})

const internalUpdatingRange = ref(false)

function setDefaultRange() {
  internalUpdatingRange.value = true
  filter.range = defaultTodayRangeDates()
  internalUpdatingRange.value = false
}

const loading = ref(false)
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)

const fullData = ref<SnapshotTask[]>([])
const mockWindowKey = ref('')

const TASKS_KEY = 'edge_tasks_v1'
const GROUPS_KEY = 'edge_camera_groups_v1'

function loadGroupTree(): TreeNode[] {
  try {
    const raw = window.localStorage.getItem(GROUPS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as TreeNode[]
    }
  } catch {
    return initialGroupTree
  }
  return initialGroupTree
}

const groupTree = ref<TreeNode[]>(loadGroupTree())
const groupOptions = computed(() => flattenGroupOptions(groupTree.value))

function loadTasks() {
  try {
    const raw = window.localStorage.getItem(TASKS_KEY)
    if (!raw) return [] as SnapshotTask[]
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as SnapshotTask[]) : ([] as SnapshotTask[])
  } catch {
    return [] as SnapshotTask[]
  }
}

function saveTasks(list: SnapshotTask[]) {
  try {
    window.localStorage.setItem(TASKS_KEY, JSON.stringify(list))
  } catch {
    return
  }
}

function normalizeTask(t: SnapshotTask): SnapshotTask {
  const groupLabel = groupOptions.value.find((g) => g.id === t.groupId)?.label || t.groupLabel || '—'
  const deviceIds = Array.isArray((t as any).deviceIds) ? (t as any).deviceIds : []
  const planType = (t as any).planType || '周计划'
  const syncMode = (t as any).syncMode || '自动同步'
  const weekPlan = (t as any).weekPlan || {
    mon: [],
    tue: [],
    wed: [],
    thu: [],
    fri: [],
    sat: [],
    sun: [],
  }
  const holidayPlan = Array.isArray((t as any).holidayPlan) ? (t as any).holidayPlan : []

  return {
    ...t,
    groupLabel,
    deviceIds,
    deviceCount: deviceIds.length ? deviceIds.length : t.deviceCount,
    planType,
    weekPlan,
    holidayPlan,
    syncMode,
  }
}

const auth = useAuthStore()
const canCreateLocal = computed(() => auth.hasPermission('tasks.create'))
const canEditTask = computed(() => auth.hasPermission('tasks.edit'))
const canDeleteTask = computed(() => auth.hasPermission('tasks.delete'))
const canCloudIntegrationsEdit = computed(() => auth.hasPermission('system.cloud.edit'))

const syncingTasks = ref(false)
const syncingImages = ref(false)
const syncStage = ref<'idle' | 'pulling' | 'writing' | 'done' | 'failed'>('idle')
const syncSummary = ref('')
const syncError = ref('')

function setSyncStage(stage: 'idle' | 'pulling' | 'writing' | 'done' | 'failed', message = '', error = '') {
  syncStage.value = stage
  syncSummary.value = message
  syncError.value = error
}

async function syncTasks() {
  const { mqttReady } = cloudStatus()
  if (!mqttReady) {
    ElMessage.warning('请先在「系统管理-云平台对接」完成 MQTT 配置并启用')
    return
  }
  syncingTasks.value = true
  setSyncStage('pulling', '正在从 MQTT 入站队列拉取任务...')
  try {
    await new Promise((r) => setTimeout(r, 420))
    const r = await syncTasksFromCloud({ count: 6 })
    if (!r.ok) {
      setSyncStage('failed', '', r.message)
      ElMessage.error(r.message)
      return
    }
    setSyncStage('writing', '已拉取任务，正在写入本地任务列表...')
    fullData.value = loadTasks().map((t) => normalizeTask(t))
    setSyncStage('done', `同步完成：新增/更新 ${r.count} 条任务`)
    ElMessage.success(`已通过 MQTT 入站同步任务 ${r.count} 条`)
    refresh()
  } finally {
    syncingTasks.value = false
  }
}

async function syncImages() {
  const { mqttReady, ossReady } = cloudStatus()
  if (!mqttReady || !ossReady) {
    ElMessage.warning('请先在「系统管理-云平台对接」启用并配置 MQTT + OSS')
    return
  }
  syncingImages.value = true
  setSyncStage('pulling', '开始执行 OSS 上传与 MQTT 结果上报...')
  try {
    await new Promise((r) => setTimeout(r, 520))
    const upload = await syncImagesToCloud({ maxCount: 80 })
    if (!upload.ok) {
      setSyncStage('failed', '', upload.message)
      ElMessage.error(upload.message)
      return
    }
    setSyncStage('writing', `上传阶段完成：成功${upload.uploaded}，失败${upload.failed}；准备上报结果...`)
    const report = await reportResultsToCloud({ maxCount: 120 })
    if (!report.ok) {
      setSyncStage('failed', '', report.message)
      ElMessage.error(report.message)
      return
    }
    const summary = `上传成功${upload.uploaded}，上传失败${upload.failed}；上报成功${report.reported}，上报失败${report.failed}`
    setSyncStage('done', summary)
    ElMessage.success(`云端同步完成：${summary}`)
  } finally {
    syncingImages.value = false
  }
}

function ensureMockDataInRange() {
  if (!filter.range) return

  // If MQTT is configured, we should avoid generating mock tasks
  // because it would overwrite the real data pulled from cloud.
  const { mqttReady } = cloudStatus()
  if (mqttReady) return

  if (!fullData.value.length) {
    const stored = loadTasks().map((t) => normalizeTask(t))
    if (stored.length) {
      fullData.value = stored
      return
    }
  }
  const [from, to] = filter.range
  const key = `${from.getTime()}-${to.getTime()}`
  if (mockWindowKey.value === key && fullData.value.length) return

  mockWindowKey.value = key
  fullData.value = makeMockTasks({
    fromMs: from.getTime(),
    toMs: to.getTime(),
    groups: groupOptions.value,
    count: 12,
  }).map((t) => normalizeTask(t))
  saveTasks(fullData.value)
}

function applyFilter(data: SnapshotTask[]) {
  const kw = filter.keyword.trim()
  return data
    .filter((t) => (kw ? t.id.includes(kw) || t.name.includes(kw) : true))
    .filter((t) => (filter.status ? t.status === filter.status : true))
    .filter((t) => (filter.lastRunStatus ? t.lastRunStatus === filter.lastRunStatus : true))
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
}

const rows = ref<SnapshotTask[]>([])

async function fetchData() {
  loading.value = true
  try {
    await new Promise((r) => setTimeout(r, 240))
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
  filter.status = ''
  filter.lastRunStatus = ''
  setDefaultRange()
  page.value = 1
  refresh()
}

watch([page, pageSize], () => refresh())

watch(
  () => filter.range,
  (v) => {
    if (internalUpdatingRange.value) return
    if (!v) setDefaultRange()
  }
)

onMounted(() => {
  setDefaultRange()
  ensureMockDataInRange()
  refresh()
})

function tagTypeForRun(status: RunStatus) {
  if (status === '成功') return 'success'
  if (status === '失败') return 'danger'
  return 'warning'
}

const formOpen = ref(false)
const editing = ref<SnapshotTask | null>(null)

function openCreate() {
  if (!canCreateLocal.value) {
    ElMessage.warning('当前角色无本地创建权限')
    return
  }
  editing.value = null
  formOpen.value = true
}

function openEdit(t: SnapshotTask) {
  editing.value = { ...t }
  formOpen.value = true
}

function upsertTask(t: SnapshotTask) {
  const idx = fullData.value.findIndex((x) => x.id === t.id)
  if (idx >= 0) fullData.value[idx] = t
  else fullData.value.unshift(t)
  saveTasks(fullData.value)
  refresh()
}

async function removeTask(t: SnapshotTask) {
  const confirmed = await ElMessageBox.confirm(`确认删除任务 ${t.name}？`, '删除确认', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消',
  })
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return
  fullData.value = fullData.value.filter((x) => x.id !== t.id)
  saveTasks(fullData.value)
  ElMessage.success('已删除')
  refresh()
}

const detailOpen = ref(false)
const selected = ref<SnapshotTask | null>(null)
const runs = ref<TaskRun[]>([])
const deviceOpen = ref(false)
const deviceRows = ref<DeviceRun[]>([])
const selectedRun = ref<TaskRun | null>(null)

async function openDetail(t: SnapshotTask) {
  selected.value = t
  detailOpen.value = true
  if (!filter.range) return
  const [from, to] = filter.range
  const stored = loadTaskRuns(t.id)
  if (stored.length) {
    runs.value = stored
    return
  }
  const gen = makeMockRuns({ taskId: t.id, fromMs: from.getTime(), toMs: to.getTime(), count: 14 })
  runs.value = gen
  persistTaskRuns(t.id, gen)
}

function openDeviceRun(payload: { run: TaskRun }) {
  if (!selected.value) return
  selectedRun.value = payload.run
  const stored = loadDeviceRuns(payload.run.id)
  if (stored.length) {
    deviceRows.value = stored
    deviceOpen.value = true
    return
  }

  // Use selected task's `deviceIds` to generate device runs with stable cameraId,
  // so MQTT result upload can include correct `cameraId`.
  let cameras: { id: string; name?: string; ip?: string }[] = []
  try {
    const raw = window.localStorage.getItem('edge_cameras_v1')
    const parsed = raw ? JSON.parse(raw) : []
    if (Array.isArray(parsed)) cameras = parsed
  } catch {
    // ignore; fall back to generated camera ids
  }

  const cameraRefs = (selected.value.deviceIds || [])
    .map((id) => {
      const c = cameras.find((x) => x.id === id)
      return { id, label: c?.name || id, ip: c?.ip || '-' }
    })
    .filter(Boolean)

  const gen = makeMockDeviceRuns({
    taskId: selected.value.id,
    runId: payload.run.id,
    startedAtMs: payload.run.startedAtMs,
    deviceCount: selected.value.deviceCount,
    cameraRefs,
  })
  deviceRows.value = gen
  persistDeviceRuns(payload.run.id, gen)
  deviceOpen.value = true
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div class="text-base font-semibold">任务管理（抓图任务）</div>
        <div class="mt-1 text-xs text-zinc-500">本机即边缘节点：任务在本地维护；支持筛选与执行记录（演示）。云端拉取与图片上报见顶部按钮。</div>
      </div>
      <div class="flex items-center gap-2">
        <el-button v-if="canCloudIntegrationsEdit" :loading="syncingTasks" @click="syncTasks">同步任务</el-button>
        <el-button v-if="canCloudIntegrationsEdit" :loading="syncingImages" @click="syncImages">图片同步</el-button>
        <el-button type="primary" :disabled="!canCreateLocal" @click="openCreate">新增任务</el-button>
      </div>
    </div>

    <el-card>
      <div class="space-y-3">
        <div
          class="grid w-full min-w-0 gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr))]"
        >
          <el-input v-model="filter.keyword" placeholder="任务名称/ID" clearable />
          <el-select v-model="filter.status" placeholder="任务状态" clearable>
            <el-option label="已启用" value="已启用" />
            <el-option label="已停用" value="已停用" />
          </el-select>
          <el-select v-model="filter.lastRunStatus" placeholder="最近结果" clearable>
            <el-option label="成功" value="成功" />
            <el-option label="失败" value="失败" />
            <el-option label="执行中" value="执行中" />
          </el-select>
          <el-date-picker
            v-model="filter.range"
            type="daterange"
            unlink-panels
            class="!w-full"
            range-separator="~"
            start-placeholder="开始"
            end-placeholder="结束"
          />
        </div>
        <div class="flex justify-end gap-2">
          <el-button @click="onReset">重置</el-button>
          <el-button type="primary" :loading="loading" @click="onSearch">搜索</el-button>
        </div>
      </div>
    </el-card>

    <el-card>
      <div class="mb-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs">
        <div class="font-medium text-zinc-700">
          同步阶段：{{
            syncStage === 'idle'
              ? '空闲'
              : syncStage === 'pulling'
                ? '拉取中'
                : syncStage === 'writing'
                  ? '处理写入中'
                  : syncStage === 'done'
                    ? '已完成'
                    : '失败'
          }}
        </div>
        <div v-if="syncSummary" class="mt-1 text-zinc-600">{{ syncSummary }}</div>
        <div v-if="syncError" class="mt-1 text-red-600">{{ syncError }}</div>
      </div>
      <el-table :data="rows" size="small" v-loading="loading" height="560" class="table-standard">
        <el-table-column prop="name" label="任务名称" min-width="240" />
        <el-table-column label="任务ID" min-width="170">
          <template #default="scope">
            <span class="font-mono text-xs">{{ scope.row.id }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="groupLabel" label="分组" width="110" />
        <el-table-column label="设备数" width="90">
          <template #default="scope">
            <span class="font-mono text-xs">{{ scope.row.deviceCount }}</span>
          </template>
        </el-table-column>
        <el-table-column label="周期" width="110">
          <template #default="scope">
            <span class="text-xs">每 {{ scope.row.intervalMin }} 分钟</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="scope">
            <el-tag :type="scope.row.status === '已启用' ? 'success' : 'info'" size="small">{{ scope.row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最近执行" width="160">
          <template #default="scope">
            <span class="text-xs text-zinc-600">{{ formatDateTime(scope.row.lastRunAtMs) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="最近结果" width="90">
          <template #default="scope">
            <el-tag :type="tagTypeForRun(scope.row.lastRunStatus)" size="small">{{ scope.row.lastRunStatus }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="210" fixed="right">
          <template #default="scope">
            <div class="flex flex-wrap items-center gap-2">
              <el-button link type="primary" size="small" @click="openDetail(scope.row)">详情</el-button>
              <el-button v-if="canEditTask" link type="primary" size="small" @click="openEdit(scope.row)">编辑</el-button>
              <el-button v-if="canDeleteTask" link type="danger" size="small" @click="removeTask(scope.row)">删除</el-button>
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

    <SnapshotTaskFormDialog v-model="formOpen" :initial="editing" :groups="groupOptions" @saved="upsertTask" />
    <TaskDetailDialog v-model="detailOpen" :task="selected" :runs="runs" @open-device-run="openDeviceRun" />
    <DeviceExecDialog v-model="deviceOpen" :task="selected" :run="selectedRun" :devices="deviceRows" />
  </div>
</template>
