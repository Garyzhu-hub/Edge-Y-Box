<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { defaultTodayRangeDates, formatDateTime } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import WorkOrderStatusTag, { type WorkOrderStatus } from '@/components/workOrders/WorkOrderStatusTag.vue'
import { ElMessage } from 'element-plus'
import {
  abnormalDurationMs,
  loadWorkOrders,
  saveWorkOrders,
  simulatePatrolAutoRecover,
  updateWorkOrderStatus,
  type WorkOrder,
} from '@/utils/workOrdersStore'

type AlarmLevel = '一般' | '警告' | '严重' | '紧急'

function mockImage(prompt: string) {
  const encoded = encodeURIComponent(
    `SDXL, professional surveillance snapshot, ${prompt}, realistic CCTV, high detail, sharp, documentary, neutral colors`
  )
  return `https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=${encoded}&image_size=landscape_4_3`
}

function fmtDuration(ms: number) {
  const totalMin = Math.floor(ms / 60000)
  const d = Math.floor(totalMin / (24 * 60))
  const h = Math.floor((totalMin % (24 * 60)) / 60)
  const m = totalMin % 60
  const dd = d ? `${d}天` : ''
  const hh = `${String(h).padStart(2, '0')}小时`
  const mm = `${String(m).padStart(2, '0')}分钟`
  return `${dd}${hh}${mm}`
}

type FilterModel = {
  workOrderId: string
  camera: string
  alarmType: string
  level: '' | AlarmLevel
  status: '' | WorkOrderStatus
  range: [Date, Date] | null
}

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const canEditWorkOrder = computed(() => auth.hasPermission('workOrders.edit'))
const filter = reactive<FilterModel>({
  workOrderId: '',
  camera: '',
  alarmType: '',
  level: '',
  status: '',
  range: null,
})

const internalUpdatingRange = ref(false)

function setDefaultRange() {
  internalUpdatingRange.value = true
  filter.range = defaultTodayRangeDates()
  internalUpdatingRange.value = false
}

const allTypes = ['离岗', '公共区域卫生', '违停占道', '安全帽', '火焰']
const allLevels: AlarmLevel[] = ['一般', '警告', '严重', '紧急']
const allStatuses: WorkOrderStatus[] = ['异常', '已恢复', '已关闭', '误报关闭']

const loading = ref(false)
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)

const fullData = ref<WorkOrder[]>([])

function mulberry32(seed: number) {
  let s = seed | 0
  return () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeMockWorkOrders(fromMs: number, toMs: number) {
  const seed = 20260311
  const rand = mulberry32(seed ^ ((fromMs + toMs) & 0xffffffff))
  const cameras = ['东门岗亭-1', '地库B2-5', '1号楼大堂-2', '北门出入口-3', '景观广场-1']

  const span = Math.max(1, toMs - fromMs)
  return Array.from({ length: 16 }).map((_, i): WorkOrder => {
    const id = `WO-${String(10001 + i).padStart(5, '0')}`
    const cameraLabel = cameras[Math.floor(rand() * cameras.length)]
    const alarmType = allTypes[Math.floor(rand() * allTypes.length)]
    const level = allLevels[Math.floor(rand() * allLevels.length)]
    const u = rand()
    const bias = u * u
    const createdAtMs = toMs - Math.floor(bias * span)
    const updatedAtMs = createdAtMs + Math.floor(rand() * 6 * 60 * 60 * 1000)
    const statusRoll = rand()
    const status: WorkOrderStatus = statusRoll < 0.5 ? '异常' : statusRoll < 0.72 ? '已恢复' : statusRoll < 0.88 ? '已关闭' : '误报关闭'

    const detectionId = `patrol-20260305-02-${String(20000 + Math.floor(rand() * 9000)).padStart(7, '0')}`
    const sourceUrl = mockImage(`raw source image, work order ${id}, scene ${alarmType}, camera ${cameraLabel}`)
    const analyzedUrl = mockImage(`analysis overlay bounding boxes, work order ${id}, scene ${alarmType}, camera ${cameraLabel}`)

    return {
      id,
      cameraLabel,
      alarmType,
      level,
      status,
      createdAtMs,
      updatedAtMs,
      detectionId,
      sourceUrl,
      analyzedUrl,
      structured: [
        {
          id: `${id}-d-1`,
          label: alarmType === '离岗' ? 'person' : alarmType === '违停占道' ? 'car' : 'trash',
          confidence: 0.65 + rand() * 0.32,
          bbox: {
            x: Math.round(rand() * 600),
            y: Math.round(rand() * 360),
            w: 120 + Math.round(rand() * 180),
            h: 90 + Math.round(rand() * 160),
          },
          roiName: 'ROI-1',
          roiSegment: alarmType === '违停占道' ? ['左', '中', '右'][Math.floor(rand() * 3)] : '—',
          counted: true,
        },
      ],
      hits: [
        { label: `${alarmType} 命中`, tsMs: createdAtMs - 30 * 60 * 1000, counted: true },
        { label: `${alarmType} 命中`, tsMs: createdAtMs - 20 * 60 * 1000, counted: true },
        { label: `${alarmType} 命中`, tsMs: createdAtMs - 10 * 60 * 1000, counted: true },
        { label: `${alarmType} 命中`, tsMs: createdAtMs, counted: rand() > 0.2 },
      ],
      logs: [],
    }
  })
}

function ensureSeeded() {
  const existing = loadWorkOrders()
  const r = filter.range ?? defaultTodayRangeDates()
  const from = r[0].getTime()
  const to = r[1].getTime()
  const toDayEnd = to + 24 * 60 * 60 * 1000 - 1

  if (existing.length) {
    const hasInRange = existing.some((x) => x.createdAtMs >= from && x.createdAtMs <= toDayEnd)
    if (hasInRange) {
      fullData.value = existing
      return
    }
    const seeded = makeMockWorkOrders(from, toDayEnd)
    const byId = new Map(existing.map((x) => [x.id, x]))
    for (const x of seeded) byId.set(x.id, x)
    const merged = Array.from(byId.values()).sort((a, b) => b.updatedAtMs - a.updatedAtMs)
    fullData.value = merged
    saveWorkOrders(merged)
    return
  }

  const seeded = makeMockWorkOrders(from, toDayEnd)
  fullData.value = seeded
  saveWorkOrders(seeded)
}

function applyFilter(data: WorkOrder[]) {
  const trimmedId = filter.workOrderId.trim()
  const trimmedCamera = filter.camera.trim()

  return data
    .filter((r) => (trimmedId ? r.id.includes(trimmedId) : true))
    .filter((r) => (trimmedCamera ? r.cameraLabel.includes(trimmedCamera) : true))
    .filter((r) => (filter.alarmType ? r.alarmType === filter.alarmType : true))
    .filter((r) => (filter.level ? r.level === filter.level : true))
    .filter((r) => (filter.status ? r.status === filter.status : true))
    .filter((r) => {
      if (!filter.range) return true
      const [from, to] = filter.range
      const fromMs = from.getTime()
      const toMs = to.getTime() + 24 * 60 * 60 * 1000 - 1
      return r.createdAtMs >= fromMs && r.createdAtMs <= toMs
    })
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
}

async function fetchData() {
  loading.value = true
  try {
    await new Promise((r) => setTimeout(r, 250))

    fullData.value = loadWorkOrders()
    const filtered = applyFilter(fullData.value)
    total.value = filtered.length
    const start = (page.value - 1) * pageSize.value
    return filtered.slice(start, start + pageSize.value)
  } finally {
    loading.value = false
  }
}

function runPatrol() {
  const r = simulatePatrolAutoRecover({ actor: '系统', maxCount: 5 })
  ElMessage.success(r.changed ? `巡检恢复 ${r.changed} 条工单（演示）` : '巡检完成：无恢复（演示）')
  refresh()
}

const rows = ref<WorkOrder[]>([])

async function refresh() {
  rows.value = await fetchData()
}

function onSearch() {
  page.value = 1
  refresh()
}

function onReset() {
  filter.workOrderId = ''
  filter.camera = ''
  filter.alarmType = ''
  filter.level = ''
  filter.status = ''
  setDefaultRange()
  page.value = 1
  refresh()
}

function openDetail(id: string) {
  router.push({
    path: `/work-orders/${encodeURIComponent(id)}`,
    query: { ...route.query },
  })
}

function closeAs(id: string, status: WorkOrderStatus) {
  updateWorkOrderStatus({ workOrderId: id, nextStatus: status, actor: 'admin', note: '列表快捷操作（演示）' })
  refresh()
}

function abnormalCount(wo: WorkOrder) {
  return (wo.hits || []).filter((h) => h.counted).length
}

function restoreCount(wo: WorkOrder) {
  return (wo.hits || []).filter((h) => !h.counted).length
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
  ensureSeeded()
  refresh()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div class="text-base font-semibold">告警工单</div>
        <div class="mt-1 text-xs text-zinc-500">工单由规则触发生成，支持处置与关闭（演示）。</div>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <el-button v-if="canEditWorkOrder" @click="runPatrol">模拟巡检</el-button>
      </div>
    </div>

    <el-card>
      <div class="space-y-3">
        <div
          class="grid w-full min-w-0 gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr))]"
        >
          <el-input v-model="filter.workOrderId" placeholder="工单号" clearable />
          <el-input v-model="filter.camera" placeholder="摄像头名称" clearable />

          <el-select v-model="filter.alarmType" placeholder="报警类型" clearable>
            <el-option v-for="t in allTypes" :key="t" :label="t" :value="t" />
          </el-select>

          <el-select v-model="filter.level" placeholder="报警等级" clearable>
            <el-option v-for="lv in allLevels" :key="lv" :label="lv" :value="lv" />
          </el-select>

          <el-select v-model="filter.status" placeholder="工单状态" clearable>
            <el-option v-for="s in allStatuses" :key="s" :label="s" :value="s" />
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
      <el-table :data="rows" size="small" v-loading="loading" height="560" class="table-standard">
        <el-table-column prop="id" label="工单编号" width="120">
          <template #default="scope">
            <el-button link type="primary" size="small" @click="openDetail(scope.row.id)">
              {{ scope.row.id }}
            </el-button>
          </template>
        </el-table-column>
        <el-table-column prop="cameraLabel" label="摄像头" min-width="140" />
        <el-table-column prop="alarmType" label="类型" width="120" />
        <el-table-column prop="level" label="等级" width="86">
          <template #default="scope">
            <el-tag
              :type="scope.row.level === '紧急' || scope.row.level === '严重' ? 'danger' : scope.row.level === '警告' ? 'warning' : 'info'"
              size="small"
            >
              {{ scope.row.level }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="scope">
            <WorkOrderStatusTag :status="scope.row.status" />
          </template>
        </el-table-column>
        <el-table-column label="异常/恢复" width="100">
          <template #default="scope">
            <span class="font-mono text-xs">{{ abnormalCount(scope.row) }}/{{ restoreCount(scope.row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="累计时长" width="140">
          <template #default="scope">
            <span class="text-xs text-zinc-600">{{ fmtDuration(abnormalDurationMs(scope.row)) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="关闭时间" width="160">
          <template #default="scope">
            <span class="text-xs text-zinc-600">{{ scope.row.closedAtMs ? formatDateTime(scope.row.closedAtMs) : '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="误告原因" width="140">
          <template #default="scope">
            <span class="text-xs text-zinc-600">{{ scope.row.falseAlarmReason || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="恢复图" width="110">
          <template #default="scope">
            <el-image
              v-if="scope.row.restoredUrl"
              :src="scope.row.restoredUrl"
              fit="cover"
              class="h-[44px] w-[76px] rounded-md"
              :preview-src-list="[scope.row.restoredUrl]"
            />
            <span v-else class="text-xs text-zinc-400">—</span>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="160">
          <template #default="scope">
            <span class="text-xs text-zinc-600">{{ formatDateTime(scope.row.updatedAtMs) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="190" fixed="right">
          <template #default="scope">
            <div class="flex items-center gap-2">
              <el-button link type="primary" size="small" @click="openDetail(scope.row.id)">
                详情
              </el-button>

              <el-dropdown v-if="canEditWorkOrder" trigger="click">
                <el-button link type="primary" size="small">更多</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item @click="closeAs(scope.row.id, '已关闭')">关闭工单</el-dropdown-item>
                    <el-dropdown-item @click="closeAs(scope.row.id, '已恢复')">标记恢复</el-dropdown-item>
                    <el-dropdown-item @click="openDetail(scope.row.id)">误告（选择原因）</el-dropdown-item>
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
  </div>
</template>
