<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { formatDateTime } from '@/stores/app'
import DeploymentDialog from '@/components/deployments/DeploymentDialog.vue'
import DeploymentResultsDialog from '@/components/deployments/DeploymentResultsDialog.vue'
import {
  defaultDeploymentParams,
  defaultInstanceParams,
  makeMockDeployments,
  type Deployment,
  type DeploymentRunStatus,
  type DeploymentStatus,
} from '@/utils/deploymentsMock'
import type { AlarmRecord } from '@/components/alarms/AlarmDetailDialog.vue'
import { useAlarmCenterStore } from '@/stores/alarmCenter'
import { loadAlarmSettings } from '@/utils/alarmSettingsStore'
import { nextDetectionId } from '@/utils/detectionId'
import { createWorkOrderFromAlarm, recoverWorkOrdersByCamera } from '@/utils/workOrdersStore'
import type { Algorithm } from '@/utils/algorithmsMock'

const STORAGE_KEY = 'edge_deployments_v1'
const ALGORITHMS_KEY = 'edge_algorithms_v1'

const loading = ref(false)
const keyword = ref('')
const status = ref<'' | DeploymentStatus>('')

const page = ref(1)
const pageSize = ref(10)
const total = ref(0)

function loadPersisted() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return normalizeList(parsed as Deployment[])
    }
  } catch {
    return makeMockDeployments()
  }
  return normalizeList(makeMockDeployments())
}

function normalizeList(list: Deployment[]) {
  return list.map((d) => normalizeDeployment(d))
}

function normalizeDeployment(d: Deployment): Deployment {
  const params = d.params || defaultDeploymentParams()
  const timeSlots = Array.isArray((params as any).timeSlots) ? (params as any).timeSlots : defaultDeploymentParams().timeSlots
  const repeat = (params as any).repeat || defaultDeploymentParams().repeat
  const runStatus: DeploymentRunStatus = (d as any).runStatus || (d.status === '已停用' ? '已暂停' : '运行中')
  const instances = (d.instances || []).map((ins: any) => ({
    ...ins,
    params: ins.params ? { ...defaultInstanceParams(), ...ins.params } : defaultInstanceParams(),
    rois: (ins.rois || []).map((r: any) => {
      const vertices = Array.isArray(r.vertices) ? r.vertices : undefined
      const enabled = typeof r.enabled === 'boolean' ? r.enabled : true
      const points = vertices ? vertices.length : typeof r.points === 'number' ? r.points : 0
      return {
        ...r,
        enabled,
        vertices,
        points,
        paramsOverride: r.paramsOverride && typeof r.paramsOverride === 'object' ? r.paramsOverride : undefined,
      }
    }),
  }))
  return {
    ...d,
    runStatus,
    instances,
    params: { repeat, timeSlots },
  }
}

function savePersisted(list: Deployment[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    return
  }
}

const fullData = ref<Deployment[]>(loadPersisted())
const rows = ref<Deployment[]>([])
const alarmCenter = useAlarmCenterStore()

function loadAlgorithmMap(): Map<string, Algorithm> {
  try {
    const raw = window.localStorage.getItem(ALGORITHMS_KEY)
    if (!raw) return new Map()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Map()
    const list = parsed as Algorithm[]
    return new Map(list.filter((x) => x && typeof x.id === 'string').map((x) => [x.id, x]))
  } catch {
    return new Map()
  }
}

function effectiveAlgorithmVersion(ins: { algorithmId: string; version: string }) {
  const pinned = String(ins.version || '').trim()
  if (pinned) return pinned
  const alg = loadAlgorithmMap().get(ins.algorithmId)
  return String(alg?.currentVersion || '—')
}

function applyFilter(data: Deployment[]) {
  const kw = keyword.value.trim()
  return data
    .filter((d) => (kw ? d.name.includes(kw) || d.cameraLabel.includes(kw) || d.id.includes(kw) : true))
    .filter((d) => (status.value ? d.status === status.value : true))
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
  page.value = 1
  refresh()
}

watch([page, pageSize], () => refresh())

onMounted(() => {
  refresh()
})

function statusTagType(s: DeploymentStatus) {
  return s === '已启用' ? 'success' : 'info'
}

const dialogOpen = ref(false)
const editing = ref<Deployment | null>(null)
const resultsOpen = ref(false)
const viewing = ref<Deployment | null>(null)

function openCreate() {
  editing.value = null
  dialogOpen.value = true
}

function openEdit(d: Deployment) {
  editing.value = {
    ...d,
    instances: d.instances.map((x) => ({ ...x, rois: x.rois.map((r) => ({ ...r })), params: { ...x.params } })),
    params: { ...d.params, timeSlots: (d.params.timeSlots || []).map((s) => ({ ...s })) },
  }
  dialogOpen.value = true
}

function openResults(d: Deployment) {
  viewing.value = d
  resultsOpen.value = true
}

function upsert(d: Deployment) {
  const idx = fullData.value.findIndex((x) => x.id === d.id)
  const next = normalizeDeployment(d)
  if (idx >= 0) fullData.value[idx] = next
  else fullData.value.unshift(next)
  savePersisted(fullData.value)
  refresh()
}

async function removeDeployment(d: Deployment) {
  const confirmed = await ElMessageBox.confirm(`确认删除布点「${d.name}」？`, '删除确认', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消',
  })
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return
  fullData.value = fullData.value.filter((x) => x.id !== d.id)
  savePersisted(fullData.value)
  ElMessage.success('已删除')
  refresh()
}

async function toggleEnable(d: Deployment) {
  const next: DeploymentStatus = d.status === '已启用' ? '已停用' : '已启用'
  const confirmed = await ElMessageBox.confirm(`确认将布点「${d.name}」${next}？`, '状态变更', {
    type: 'warning',
    confirmButtonText: '确认',
    cancelButtonText: '取消',
  })
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return

  const idx = fullData.value.findIndex((x) => x.id === d.id)
  if (idx < 0) return
  await new Promise((r) => setTimeout(r, 240))
  const runStatus: DeploymentRunStatus = next === '已启用' ? (fullData.value[idx].runStatus === '异常' ? '异常' : '运行中') : '已暂停'
  fullData.value[idx] = { ...fullData.value[idx], status: next, runStatus, updatedAtMs: Date.now() }
  savePersisted(fullData.value)
  ElMessage.success('状态已更新（占位）')
  refresh()
}

async function toggleRun(d: Deployment) {
  if (d.status !== '已启用') {
    ElMessage.warning('请先启用布点后再操作')
    return
  }
  const next: DeploymentRunStatus = d.runStatus === '运行中' ? '已暂停' : '运行中'
  const confirmed = await ElMessageBox.confirm(`确认将布点「${d.name}」${next === '运行中' ? '恢复运行' : '暂停'}？`, '运行状态变更', {
    type: 'warning',
    confirmButtonText: '确认',
    cancelButtonText: '取消',
  })
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return
  const idx = fullData.value.findIndex((x) => x.id === d.id)
  if (idx < 0) return
  await new Promise((r) => setTimeout(r, 220))
  fullData.value[idx] = { ...fullData.value[idx], runStatus: next, updatedAtMs: Date.now() }
  savePersisted(fullData.value)
  ElMessage.success('运行状态已更新（演示）')
  refresh()
}

async function resetParams(d: Deployment) {
  const confirmed = await ElMessageBox.confirm(`确认将布点「${d.name}」所有实例参数重置为默认值？`, '参数重置', {
    type: 'warning',
    confirmButtonText: '重置',
    cancelButtonText: '取消',
  })
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return
  const idx = fullData.value.findIndex((x) => x.id === d.id)
  if (idx < 0) return
  const nextInstances = fullData.value[idx].instances.map((ins) => ({ ...ins, params: defaultInstanceParams() }))
  fullData.value[idx] = { ...fullData.value[idx], instances: nextInstances, updatedAtMs: Date.now() }
  savePersisted(fullData.value)
  ElMessage.success('已重置（演示）')
  refresh()
}

function mockImage(prompt: string) {
  const encoded = encodeURIComponent(
    `SDXL, professional surveillance snapshot, ${prompt}, realistic CCTV, high detail, sharp, documentary, neutral colors`
  )
  return `https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=${encoded}&image_size=landscape_4_3`
}

function alarmTypeOfAlgorithm(name: string) {
  if (name.includes('安全帽')) return '安全帽'
  if (name.includes('离岗')) return '离岗'
  if (name.includes('违停')) return '违停占道'
  if (name.includes('火焰')) return '火焰'
  if (name.includes('卫生')) return '公共区域卫生'
  return name
}

function defaultLevelOfType(type: string): AlarmRecord['level'] {
  if (type === '火焰') return Math.random() > 0.5 ? '紧急' : '严重'
  if (type === '安全帽') return Math.random() > 0.7 ? '严重' : '警告'
  if (type === '离岗') return Math.random() > 0.75 ? '严重' : '警告'
  if (type === '违停占道') return Math.random() > 0.8 ? '严重' : '警告'
  return Math.random() > 0.6 ? '警告' : '一般'
}

function labelOfType(type: string) {
  if (type === '安全帽') return 'helmet'
  if (type === '离岗') return 'person'
  if (type === '违停占道') return 'car'
  if (type === '火焰') return 'fire'
  return 'trash'
}

async function simulateAlarm(d: Deployment) {
  if (d.status !== '已启用') {
    ElMessage.warning('请先启用布点后再模拟告警')
    return
  }
  if (d.runStatus !== '运行中' && d.runStatus !== '异常') {
    ElMessage.warning('当前布点为暂停状态')
    return
  }
  const enabledInstances = d.instances.filter((x) => x.enabled)
  if (!enabledInstances.length) {
    ElMessage.warning('暂无启用的算法实例')
    return
  }
  const ins = enabledInstances[Math.floor(Math.random() * enabledInstances.length)]
  const type = alarmTypeOfAlgorithm(ins.algorithmName)
  const level = defaultLevelOfType(type)
  const nowMs = Date.now()
  const detectionId = nextDetectionId(new Date(nowMs))
  const usedVersion = effectiveAlgorithmVersion(ins)

  const enabledRois = (ins.rois || []).filter((r) => r.enabled && Array.isArray(r.vertices) && r.vertices.length >= 3)
  const roi = enabledRois.length ? enabledRois[Math.floor(Math.random() * enabledRois.length)] : null

  const record: AlarmRecord = {
    id: detectionId,
    cameraLabel: d.cameraLabel,
    alarmType: type,
    algorithmVersion: usedVersion,
    level,
    status: '异常',
    alarmTimeMs: nowMs,
    detectionId,
    sourceUrl: mockImage(`raw source image, scene ${type}, camera ${d.cameraLabel}`),
    analyzedUrl: mockImage(`analysis overlay bounding boxes, scene ${type}, camera ${d.cameraLabel}`),
    structured: [
      {
        id: `${detectionId}-d-1`,
        label: labelOfType(type),
        confidence: Math.max(0.5, Math.min(0.99, ins.params.confidence + (Math.random() * 0.18 - 0.06))),
        bbox: {
          x: 120 + Math.floor(Math.random() * 460),
          y: 80 + Math.floor(Math.random() * 260),
          w: 140 + Math.floor(Math.random() * 160),
          h: 110 + Math.floor(Math.random() * 160),
        },
        roiName: roi?.name,
        roiSegment: '—',
        counted: true,
      },
    ],
    hits: [{ label: `${type} 命中`, tsMs: nowMs, counted: true }],
  }

  const wo = createWorkOrderFromAlarm({ alarm: record, actor: '系统', note: `由布点 ${d.name} 触发（演示）` })
  record.workOrderId = wo.id

  const settings = loadAlarmSettings()
  const policy = settings.policy[record.level]
  const popup = Boolean(policy?.popup) && Boolean(ins.params.popup)
  const sound = Boolean(policy?.sound) && Boolean(ins.params.sound)
  alarmCenter.push({ record, popup, sound })

  if (record.level === '严重' || record.level === '紧急') {
    const idx = fullData.value.findIndex((x) => x.id === d.id)
    if (idx >= 0) {
      fullData.value[idx] = { ...fullData.value[idx], runStatus: '异常', updatedAtMs: Date.now() }
      savePersisted(fullData.value)
      refresh()
    }
  }

  ElMessage.success(`已触发告警并生成工单 ${wo.id}（演示）`)
}

async function simulateRecover(d: Deployment) {
  const types = d.instances.map((x) => alarmTypeOfAlgorithm(x.algorithmName))
  const r = recoverWorkOrdersByCamera({ cameraLabel: d.cameraLabel, alarmTypes: types, actor: '系统', note: `布点巡检恢复：${d.name}（演示）` })
  if (!r.changed) {
    ElMessage.info('本摄像头暂无异常工单可恢复（演示）')
    return
  }
  const idx = fullData.value.findIndex((x) => x.id === d.id)
  if (idx >= 0) {
    fullData.value[idx] = { ...fullData.value[idx], runStatus: '运行中', updatedAtMs: Date.now() }
    savePersisted(fullData.value)
    refresh()
  }
  ElMessage.success(`已巡检恢复 ${r.changed} 条工单（演示）`)
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div class="text-base font-semibold">布点管理</div>
        <div class="mt-1 text-xs text-zinc-500">管理摄像头与算法实例的绑定关系（演示）。</div>
      </div>
      <div class="flex items-center gap-2">
        <el-button type="primary" @click="openCreate">新增布点</el-button>
      </div>
    </div>

    <el-card>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-6">
        <el-input v-model="keyword" placeholder="布点名称/摄像头/编号" clearable />
        <el-select v-model="status" placeholder="状态" clearable>
          <el-option label="已启用" value="已启用" />
          <el-option label="已停用" value="已停用" />
        </el-select>
        <div class="md:col-span-4 flex items-center justify-end gap-2">
          <el-button @click="onReset">重置</el-button>
          <el-button type="primary" :loading="loading" @click="onSearch">搜索</el-button>
        </div>
      </div>
    </el-card>

    <el-card>
      <el-table :data="rows" size="small" v-loading="loading" height="560" class="table-standard">
        <el-table-column prop="name" label="布点名称" min-width="240" />
        <el-table-column label="编号" min-width="120">
          <template #default="scope">
            <span class="font-mono text-xs">{{ scope.row.id }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="cameraLabel" label="摄像头" min-width="160" />
        <el-table-column label="布防时间" min-width="180">
          <template #default="scope">
            <div class="text-xs text-zinc-600">
              <div>{{ scope.row.params.repeat }}</div>
              <div class="mt-1 text-zinc-500">
                {{ (scope.row.params.timeSlots || []).map((s) => `${s.start}~${s.end}`).join('，') || '—' }}
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="算法实例" width="110">
          <template #default="scope">
            <span class="font-mono text-xs">{{ scope.row.instances.length }}</span>
          </template>
        </el-table-column>
        <el-table-column label="运行状态" width="100">
          <template #default="scope">
            <el-tag
              :type="scope.row.runStatus === '运行中' ? 'success' : scope.row.runStatus === '已暂停' ? 'info' : 'danger'"
              size="small"
            >
              {{ scope.row.runStatus }}
            </el-tag>
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
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="scope">
            <div class="flex items-center gap-2">
              <el-button link type="primary" size="small" @click="openEdit(scope.row)">编辑</el-button>
              <el-button link type="primary" size="small" @click="openResults(scope.row)">查看结果</el-button>
              <el-button link type="primary" size="small" @click="toggleEnable(scope.row)">
                {{ scope.row.status === '已启用' ? '停用' : '启用' }}
              </el-button>
              <el-button
                link
                type="primary"
                size="small"
                :disabled="scope.row.status !== '已启用'"
                @click="toggleRun(scope.row)"
              >
                {{ scope.row.runStatus === '运行中' ? '暂停' : '恢复' }}
              </el-button>
              <el-dropdown trigger="click">
                <el-button link type="primary" size="small">更多</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item @click="simulateAlarm(scope.row)">模拟告警</el-dropdown-item>
                    <el-dropdown-item @click="simulateRecover(scope.row)">巡检恢复</el-dropdown-item>
                    <el-dropdown-item @click="resetParams(scope.row)">参数重置</el-dropdown-item>
                    <el-dropdown-item @click="removeDeployment(scope.row)">删除</el-dropdown-item>
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

    <DeploymentDialog v-model="dialogOpen" :initial="editing" @saved="upsert" />
    <DeploymentResultsDialog v-model="resultsOpen" :deployment="viewing" />
  </div>
</template>
