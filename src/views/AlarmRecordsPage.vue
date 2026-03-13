<script setup lang="ts">
import type { AlarmRecord } from '@/components/alarms/AlarmDetailDialog.vue'
import AlarmDetailDialog from '@/components/alarms/AlarmDetailDialog.vue'
import { useRouter, useRoute } from 'vue-router'
import { formatDateTime } from '@/stores/app'
import { useAppStore } from '@/stores/app'
import { ElMessage } from 'element-plus'
import { createWorkOrderFromAlarm } from '@/utils/workOrdersStore'
import { loadAlarmRecords, appendAlarmRecord } from '@/utils/alarmRecordsStore'
import { useAlarmCenterStore } from '@/stores/alarmCenter'

type ViewMode = 'list' | 'grid'

type AlarmLevel = '一般' | '警告' | '严重' | '紧急'

type FilterModel = {
  camera: string
  alarmType: string
  level: '' | AlarmLevel
  workOrderId: string
  status: '' | '异常' | '恢复'
  range: [Date, Date] | null
}

const router = useRouter()
const route = useRoute()
const app = useAppStore()
const alarmCenter = useAlarmCenterStore()

const viewMode = ref<ViewMode>('list')

const filter = reactive<FilterModel>({
  camera: '',
  alarmType: '',
  level: '',
  workOrderId: '',
  status: '',
  range: null,
})

const loading = ref(false)
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)

const followGlobalRange = ref(true)
const internalUpdatingRange = ref(false)

function setRangeFromGlobal() {
  internalUpdatingRange.value = true
  filter.range = [new Date(app.timeRange.fromMs), new Date(app.timeRange.toMs)]
  internalUpdatingRange.value = false
}

function mockImage(prompt: string) {
  const encoded = encodeURIComponent(
    `SDXL, professional surveillance snapshot, ${prompt}, realistic CCTV, high detail, sharp, documentary, neutral colors`
  )
  return `https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=${encoded}&image_size=landscape_4_3`
}

const allTypes = ['离岗', '公共区域卫生', '违停占道', '安全帽', '火焰']
const allLevels: AlarmLevel[] = ['一般', '警告', '严重', '紧急']

const records = ref<AlarmRecord[]>([])

const localRecords = ref<AlarmRecord[]>(loadAlarmRecords())

function mergeRecords(local: AlarmRecord[], mock: AlarmRecord[]) {
  const byId = new Map<string, AlarmRecord>()
  for (const r of mock) byId.set(r.id, r)
  for (const r of local) byId.set(r.id, r)
  return Array.from(byId.values())
}

type MockWindow = {
  fromMs: number
  toMs: number
  seed?: number
}

function makeMockRecords(window: MockWindow) {
  const { fromMs, toMs } = window
  const seed = window.seed ?? 20260311
  const rand = (() => {
    let s = seed | 0
    return () => {
      s |= 0
      s = (s + 0x6d2b79f5) | 0
      let t = Math.imul(s ^ (s >>> 15), 1 | s)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  })()

  const cameras = ['东门岗亭-1', '地库B2-5', '1号楼大堂-2', '北门出入口-3', '景观广场-1']

  const list: AlarmRecord[] = Array.from({ length: 12 }).map((_, i) => {
    const type = allTypes[Math.floor(rand() * allTypes.length)]
    const level = allLevels[Math.floor(rand() * allLevels.length)]
    const status = rand() > 0.55 ? '异常' : '恢复'
    const cameraLabel = cameras[Math.floor(rand() * cameras.length)]
    const alarmTimeMs = fromMs + Math.floor(rand() * Math.max(1, toMs - fromMs))
    const detectionId = `patrol-20260305-02-${String(10270 + i).padStart(7, '0')}`
    const hasWorkOrder = rand() > 0.4
    const workOrderId = hasWorkOrder ? `WO-${10000 + Math.floor(rand() * 80)}` : ''

    return {
      id: detectionId,
      cameraLabel,
      alarmType: type,
      level,
      status: status as '异常' | '恢复',
      alarmTimeMs,
      detectionId,
      workOrderId: workOrderId || undefined,
      sourceUrl: mockImage(`raw source image, scene ${type}, camera ${cameraLabel}`),
      analyzedUrl: mockImage(`analysis overlay bounding boxes, scene ${type}, camera ${cameraLabel}`),
      structured: [
        {
          id: `d-${i}-1`,
          label: type === '离岗' ? 'person' : type === '违停占道' ? 'car' : 'trash',
          confidence: 0.65 + rand() * 0.32,
          bbox: {
            x: Math.round(rand() * 600),
            y: Math.round(rand() * 360),
            w: 120 + Math.round(rand() * 180),
            h: 90 + Math.round(rand() * 160),
          },
          roiName: 'ROI-1',
          roiSegment: type === '违停占道' ? ['左', '中', '右'][Math.floor(rand() * 3)] : '—',
          counted: true,
        },
      ],
      hits: [
        { label: `${type} 命中`, tsMs: alarmTimeMs - 30 * 60 * 1000, counted: true },
        { label: `${type} 命中`, tsMs: alarmTimeMs - 20 * 60 * 1000, counted: true },
        { label: `${type} 命中`, tsMs: alarmTimeMs - 10 * 60 * 1000, counted: true },
        { label: `${type} 命中`, tsMs: alarmTimeMs, counted: true },
      ],
    }
  })

  return list
}

const fullData = ref<AlarmRecord[]>([])
const mockWindowKey = ref('')

function ensureMockDataInRange() {
  if (!filter.range) return

  const [from, to] = filter.range
  const key = `${from.getTime()}-${to.getTime()}`
  if (mockWindowKey.value === key && fullData.value.length === 12) return

  mockWindowKey.value = key
  fullData.value = makeMockRecords({
    fromMs: from.getTime(),
    toMs: to.getTime(),
  })
}

function applyFilter(data: AlarmRecord[]) {
  return data
    .filter((r) => (filter.camera ? r.cameraLabel.includes(filter.camera.trim()) : true))
    .filter((r) => (filter.alarmType ? r.alarmType === filter.alarmType : true))
    .filter((r) => (filter.level ? r.level === filter.level : true))
    .filter((r) => (filter.workOrderId ? (r.workOrderId || '').includes(filter.workOrderId.trim()) : true))
    .filter((r) => (filter.status ? r.status === filter.status : true))
    .filter((r) => {
      if (!filter.range) return true
      const [from, to] = filter.range
      const fromMs = from.getTime()
      const toMs = to.getTime() + 24 * 60 * 60 * 1000 - 1
      return r.alarmTimeMs >= fromMs && r.alarmTimeMs <= toMs
    })
    .sort((a, b) => b.alarmTimeMs - a.alarmTimeMs)
}

async function fetchData() {
  loading.value = true
  try {
    await new Promise((r) => setTimeout(r, 300))

    ensureMockDataInRange()

    localRecords.value = loadAlarmRecords()

    const merged = mergeRecords(localRecords.value, fullData.value)
    const filtered = applyFilter(merged)
    total.value = filtered.length
    const start = (page.value - 1) * pageSize.value
    records.value = filtered.slice(start, start + pageSize.value)
  } finally {
    loading.value = false
  }
}

function testTrigger() {
  const now = Date.now()
  const type = allTypes[Math.floor(Math.random() * allTypes.length)]
  const level = allLevels[Math.floor(Math.random() * allLevels.length)]
  const cameraLabel = ['东门岗亭-1', '地库B2-5', '1号楼大堂-2', '北门出入口-3'][Math.floor(Math.random() * 4)]
  const id = `rt-${now}-${Math.floor(Math.random() * 1000)}`
  const rec: AlarmRecord = {
    id,
    cameraLabel,
    alarmType: type,
    level,
    status: '异常',
    alarmTimeMs: now,
    detectionId: id,
    sourceUrl: mockImage(`raw source image, scene ${type}, camera ${cameraLabel}`),
    analyzedUrl: mockImage(`analysis overlay bounding boxes, scene ${type}, camera ${cameraLabel}`),
    structured: [],
    hits: [],
  }
  alarmCenter.pushRecord(rec)
  ElMessage.success('已触发测试告警（演示）')
  fetchData()
}

function onSearch() {
  page.value = 1
  fetchData()
}

function onReset() {
  filter.camera = ''
  filter.alarmType = ''
  filter.level = ''
  filter.workOrderId = ''
  filter.status = ''
  followGlobalRange.value = true
  setRangeFromGlobal()
  page.value = 1
  fetchData()
}

watch([page, pageSize], () => fetchData())

onMounted(() => {
  if (route.query.view === 'grid') viewMode.value = 'grid'
  setRangeFromGlobal()
  ensureMockDataInRange()
  fetchData()
})

watch(
  () => viewMode.value,
  (v) => {
    const next = { ...route.query }
    if (v === 'grid') next.view = 'grid'
    else delete next.view
    router.replace({ query: next })
  }
)

const detailOpen = ref(false)
const selected = ref<AlarmRecord | null>(null)

function openDetail(r: AlarmRecord) {
  selected.value = r
  detailOpen.value = true
}

function goWorkOrder(id: string) {
  router.push({
    path: `/work-orders/${encodeURIComponent(id)}`,
    query: {
      ...route.query,
      from: 'alarms',
    },
  })
}

function createWorkOrder(r: AlarmRecord) {
  if (r.workOrderId) {
    goWorkOrder(r.workOrderId)
    return
  }
  const wo = createWorkOrderFromAlarm({ alarm: r, actor: 'admin', note: '来自报警记录生成（演示）' })
  r.workOrderId = wo.id
  appendAlarmRecord(r)
  ElMessage.success('工单已生成（演示）')
  goWorkOrder(wo.id)
}

watch(
  () => app.timeRange,
  () => {
    if (!followGlobalRange.value) return
    setRangeFromGlobal()
    ensureMockDataInRange()
    page.value = 1
    fetchData()
  },
  { deep: true }
)

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

function tagType(level: AlarmLevel) {
  if (level === '紧急') return 'danger'
  if (level === '严重') return 'danger'
  if (level === '警告') return 'warning'
  return 'info'
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-end justify-between gap-3">
      <div>
        <div class="text-base font-semibold">报警记录</div>
        <div class="mt-1 text-xs text-zinc-500">默认缩略图为分析图；支持列表/宫格切换。</div>
      </div>

      <div class="flex items-center gap-2">
        <el-button @click="testTrigger">触发测试告警</el-button>
        <el-segmented
          class="alarm-view-segmented"
          v-model="viewMode"
          :options="[
            { label: '列表', value: 'list' },
            { label: '宫格', value: 'grid' },
          ]"
          size="small"
        />
      </div>
    </div>

    <el-card>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-6">
        <el-input v-model="filter.camera" placeholder="摄像头名称" clearable />

        <el-select v-model="filter.alarmType" placeholder="报警类型" clearable>
          <el-option v-for="t in allTypes" :key="t" :label="t" :value="t" />
        </el-select>

        <el-select v-model="filter.level" placeholder="报警等级" clearable>
          <el-option v-for="lv in allLevels" :key="lv" :label="lv" :value="lv" />
        </el-select>

        <el-input v-model="filter.workOrderId" placeholder="告警单号/工单号" clearable />

        <el-select v-model="filter.status" placeholder="告警状态" clearable>
          <el-option label="异常" value="异常" />
          <el-option label="恢复" value="恢复" />
        </el-select>

        <el-date-picker
          v-model="filter.range"
          type="daterange"
          unlink-panels
          range-separator="~"
          start-placeholder="开始"
          end-placeholder="结束"
        />
      </div>

      <div class="mt-3 flex items-center justify-end gap-2">
        <el-button @click="onReset">重置</el-button>
        <el-button type="primary" :loading="loading" @click="onSearch">搜索</el-button>
      </div>
    </el-card>

    <el-card v-if="viewMode === 'list'">
      <el-table :data="records" size="small" v-loading="loading" height="520" class="table-standard">
        <el-table-column label="分析图" width="120">
          <template #default="scope">
            <el-image
              :src="scope.row.analyzedUrl"
              fit="cover"
              class="h-[56px] w-[96px] rounded-md"
              :preview-src-list="[scope.row.analyzedUrl]"
            />
          </template>
        </el-table-column>
        <el-table-column prop="cameraLabel" label="摄像头" min-width="140" />
        <el-table-column prop="alarmType" label="报警类型" width="120" />
        <el-table-column label="等级" width="86">
          <template #default="scope">
            <el-tag :type="tagType(scope.row.level)" size="small">{{ scope.row.level }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="detectionId" label="异常检测ID" min-width="220">
          <template #default="scope">
            <span class="font-mono text-xs">{{ scope.row.detectionId }}</span>
          </template>
        </el-table-column>
        <el-table-column label="工单号" width="120">
          <template #default="scope">
            <el-button
              v-if="scope.row.workOrderId"
              link
              type="primary"
              size="small"
              @click="goWorkOrder(scope.row.workOrderId)"
            >
              {{ scope.row.workOrderId }}
            </el-button>
            <el-button v-else link type="primary" size="small" @click="createWorkOrder(scope.row)">生成工单</el-button>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="scope">
            <el-tag :type="scope.row.status === '异常' ? 'danger' : 'success'" size="small">
              {{ scope.row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="报警时间" width="160">
          <template #default="scope">
            <span class="text-xs text-zinc-600">{{ formatDateTime(scope.row.alarmTimeMs) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="scope">
            <el-button link type="primary" size="small" @click="openDetail(scope.row)">
              查看详情
            </el-button>
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

    <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <el-card
        v-for="r in records"
        :key="r.id"
        class="cursor-pointer transition hover:shadow-md"
        @click="openDetail(r)"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="truncate text-sm font-semibold">{{ r.cameraLabel }}</div>
            <div class="mt-1 flex items-center gap-2">
              <el-tag :type="tagType(r.level)" size="small">{{ r.level }}</el-tag>
              <span class="text-xs text-zinc-500">{{ r.alarmType }}</span>
            </div>
          </div>
          <el-tag :type="r.status === '异常' ? 'danger' : 'success'" size="small">{{ r.status }}</el-tag>
        </div>

        <el-image
          :src="r.analyzedUrl"
          fit="cover"
          class="mt-3 h-[160px] w-full rounded-lg bg-zinc-50"
        />

        <div class="mt-3 flex items-center justify-between">
          <span class="font-mono text-xs text-zinc-500">{{ r.detectionId }}</span>
          <el-button
            v-if="r.workOrderId"
            link
            type="primary"
            size="small"
            @click.stop="goWorkOrder(r.workOrderId)"
          >
            {{ r.workOrderId }}
          </el-button>
          <el-button v-else link type="primary" size="small" @click.stop="createWorkOrder(r)">生成工单</el-button>
        </div>

        <div class="mt-2 text-xs text-zinc-500">{{ formatDateTime(r.alarmTimeMs) }}</div>
      </el-card>
    </div>

    <div v-if="viewMode === 'grid'" class="flex justify-end">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next, sizes"
        :page-sizes="[10, 20, 50]"
        small
      />
    </div>

    <AlarmDetailDialog v-model="detailOpen" :record="selected" />
  </div>
</template>

<style scoped>
.alarm-view-segmented {
  --alarm-segmented-radius: var(--el-border-radius-base);
}

.alarm-view-segmented :deep(.el-segmented__group) {
  border-radius: var(--alarm-segmented-radius);
  overflow: hidden;
}

.alarm-view-segmented :deep(.el-segmented__item-selected) {
  border-radius: var(--alarm-segmented-radius);
}
</style>
