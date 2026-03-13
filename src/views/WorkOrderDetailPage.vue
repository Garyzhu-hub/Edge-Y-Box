<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import EvidencePanel from '@/components/evidence/EvidencePanel.vue'
import WorkOrderStatusTag, { type WorkOrderStatus } from '@/components/workOrders/WorkOrderStatusTag.vue'
import FalseAlarmDialog from '@/components/workOrders/FalseAlarmDialog.vue'
import { useRoute, useRouter } from 'vue-router'
import { formatDateTime } from '@/stores/app'
import {
  abnormalDurationMs,
  type FalseAlarmReason,
  getWorkOrderById,
  loadWorkOrders,
  markFalseAlarm,
  recheckWorkOrder,
  saveWorkOrders,
  updateWorkOrderStatus,
  type WorkOrder,
} from '@/utils/workOrdersStore'

type AlarmLevel = '一般' | '警告' | '严重' | '紧急'

const route = useRoute()
const router = useRouter()

function mockImage(prompt: string) {
  const encoded = encodeURIComponent(
    `SDXL, professional surveillance snapshot, ${prompt}, realistic CCTV, high detail, sharp, documentary, neutral colors`
  )
  return `https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=${encoded}&image_size=landscape_4_3`
}

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

function seedFromId(id: string) {
  const m = id.match(/\d+/g)
  const n = m ? Number(m.join('').slice(-9)) : 0
  return (n ^ 0x9e3779b9) >>> 0
}

const allTypes = ['离岗', '公共区域卫生', '违停占道', '安全帽', '火焰']
const allLevels: AlarmLevel[] = ['一般', '警告', '严重', '紧急']
const cameras = ['东门岗亭-1', '地库B2-5', '1号楼大堂-2', '北门出入口-3', '景观广场-1']

function makeDetail(id: string): WorkOrder {
  const seed = seedFromId(id)
  const rand = mulberry32(seed)
  const now = Date.now()
  const createdAtMs = now - Math.floor((2 + rand() * 36) * 60 * 60 * 1000)
  const updatedAtMs = createdAtMs + Math.floor((1 + rand() * 10) * 60 * 60 * 1000)
  const alarmType = allTypes[Math.floor(rand() * allTypes.length)]
  const level = allLevels[Math.floor(rand() * allLevels.length)]
  const cameraLabel = cameras[Math.floor(rand() * cameras.length)]
  const statusRoll = rand()
  const status: WorkOrderStatus = statusRoll < 0.5 ? '异常' : statusRoll < 0.72 ? '已恢复' : statusRoll < 0.88 ? '已关闭' : '误报关闭'

  const detectionId = `patrol-20260305-02-${String(20000 + Math.floor(rand() * 9000)).padStart(7, '0')}`

  return {
    id,
    status,
    level,
    alarmType,
    cameraLabel,
    createdAtMs,
    updatedAtMs,
    detectionId,
    sourceUrl: mockImage(`raw source image, work order ${id}, scene ${alarmType}, camera ${cameraLabel}`),
    analyzedUrl: mockImage(`analysis overlay bounding boxes, work order ${id}, scene ${alarmType}, camera ${cameraLabel}`),
    structured: [
      {
        id: `${id}-d-1`,
        label: alarmType === '离岗' ? 'person' : alarmType === '违停占道' ? 'car' : 'trash',
        confidence: 0.68 + rand() * 0.3,
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
      { label: `${alarmType} 命中`, tsMs: createdAtMs, counted: true },
    ],
    logs: [
      {
        tsMs: createdAtMs,
        actor: '系统',
        action: '生成工单',
        note: '演示数据自动生成。',
      },
    ],
  }
}

const workOrderId = computed(() => String(route.params.workOrderId || ''))
const detail = ref<WorkOrder | null>(null)

function loadDetail() {
  const id = workOrderId.value
  if (!id) {
    detail.value = null
    return
  }
  const existed = getWorkOrderById(id)
  if (existed) {
    detail.value = existed
    return
  }
  const seeded = makeDetail(id)
  const list = loadWorkOrders()
  list.unshift(seeded)
  saveWorkOrders(list)
  detail.value = seeded
}

const logs = computed(() => (detail.value?.logs || []).slice().sort((a, b) => a.tsMs - b.tsMs))

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

const falseAlarmOpen = ref(false)

function openFalseAlarm() {
  if (!detail.value) return
  if (detail.value.status !== '异常') {
    ElMessage.warning('仅异常工单可进行误告关闭')
    return
  }
  falseAlarmOpen.value = true
}

function onFalseAlarm(payload: { reason: FalseAlarmReason; note: string }) {
  if (!detail.value) return
  markFalseAlarm({ workOrderId: detail.value.id, reason: payload.reason, actor: 'admin', note: payload.note })
  loadDetail()
  ElMessage.success('已误告关闭（演示）')
}

function forceClose() {
  if (!detail.value) return
  updateWorkOrderStatus({ workOrderId: detail.value.id, nextStatus: '已关闭', actor: 'admin', note: '强制关单（演示）' })
  loadDetail()
  ElMessage.success('已关闭（演示）')
}

function markRecovered() {
  if (!detail.value) return
  updateWorkOrderStatus({ workOrderId: detail.value.id, nextStatus: '已恢复', actor: 'admin', note: '人工标记恢复（演示）' })
  loadDetail()
  ElMessage.success('已恢复（演示）')
}

function reopenAbnormal() {
  if (!detail.value) return
  updateWorkOrderStatus({ workOrderId: detail.value.id, nextStatus: '异常', actor: 'admin', note: '恢复为异常（演示）' })
  loadDetail()
  ElMessage.success('已恢复为异常（演示）')
}

function recheck() {
  if (!detail.value) return
  const r = recheckWorkOrder({ workOrderId: detail.value.id, actor: 'admin' })
  if (!r.ok) {
    ElMessage.error('再次检测失败')
    return
  }
  loadDetail()
  ElMessage.success(r.recovered ? '检测正常，已恢复（演示）' : '仍为异常（演示）')
}

function backToList() {
  router.push({ path: '/work-orders', query: { ...route.query } })
}

function goFromAlarmHint() {
  if (route.query.from === 'alarms') return '来自报警记录跳转'
  return ''
}

onMounted(loadDetail)
watch(workOrderId, loadDetail)
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-start justify-between gap-3">
      <div>
        <div class="flex items-center gap-2">
          <div class="text-base font-semibold">工单详情</div>
          <el-tag v-if="goFromAlarmHint()" type="info" size="small">{{ goFromAlarmHint() }}</el-tag>
        </div>
        <div v-if="detail" class="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
          <span class="font-mono">{{ detail.id }}</span>
          <WorkOrderStatusTag :status="detail.status" />
          <el-tag
            :type="detail.level === '紧急' || detail.level === '严重' ? 'danger' : detail.level === '警告' ? 'warning' : 'info'"
            size="small"
          >
            {{ detail.level }}
          </el-tag>
          <span>｜</span>
          <span>{{ detail.cameraLabel }}</span>
          <span>｜</span>
          <span>{{ detail.alarmType }}</span>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <template v-if="detail">
          <el-button v-if="detail.status === '异常'" @click="recheck">再次检测</el-button>
          <el-button v-if="detail.status === '异常'" type="success" @click="markRecovered">标记恢复</el-button>
          <el-button v-if="detail.status === '异常'" type="warning" @click="forceClose">强制关单</el-button>
          <el-button v-if="detail.status === '异常'" type="danger" @click="openFalseAlarm">误告</el-button>
          <el-button v-if="detail.status !== '异常'" @click="reopenAbnormal">恢复为异常</el-button>
        </template>
        <el-button @click="backToList">返回列表</el-button>
      </div>
    </div>

    <el-card v-if="detail">
      <div class="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <div class="text-xs text-zinc-500">创建时间</div>
          <div class="mt-1 text-sm font-semibold">{{ formatDateTime(detail.createdAtMs) }}</div>
        </div>
        <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <div class="text-xs text-zinc-500">更新时间</div>
          <div class="mt-1 text-sm font-semibold">{{ formatDateTime(detail.updatedAtMs) }}</div>
        </div>
        <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <div class="text-xs text-zinc-500">异常检测ID</div>
          <div class="mt-1 truncate font-mono text-xs">{{ detail.detectionId }}</div>
        </div>
        <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <div class="text-xs text-zinc-500">处置建议</div>
          <div class="mt-1 text-sm font-semibold">先核查现场，再决定关闭/误报</div>
        </div>

        <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <div class="text-xs text-zinc-500">异常累计时长</div>
          <div class="mt-1 text-sm font-semibold">{{ fmtDuration(abnormalDurationMs(detail)) }}</div>
        </div>

        <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <div class="text-xs text-zinc-500">误告原因</div>
          <div class="mt-1 text-sm font-semibold">{{ detail.falseAlarmReason || '—' }}</div>
        </div>

        <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <div class="text-xs text-zinc-500">关闭时间</div>
          <div class="mt-1 text-sm font-semibold">{{ detail.closedAtMs ? formatDateTime(detail.closedAtMs) : '—' }}</div>
        </div>
      </div>
    </el-card>

    <el-card v-if="detail">
      <el-tabs>
        <el-tab-pane label="证据与结构化结果">
          <EvidencePanel
            :camera-label="detail.cameraLabel"
            :alarm-type="detail.alarmType"
            :level="detail.level"
            :status="detail.status === '异常' ? '异常' : '恢复'"
            :alarm-time-ms="detail.createdAtMs"
            :detection-id="detail.detectionId"
            :work-order-id="detail.id"
            :source-url="detail.sourceUrl"
            :analyzed-url="detail.analyzedUrl"
            :structured="detail.structured"
            :hits="detail.hits"
            @go-work-order="() => {}"
          />

          <div v-if="detail.restoredUrl" class="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <div class="text-xs font-medium text-zinc-600">恢复图片</div>
            <el-image
              :src="detail.restoredUrl"
              :preview-src-list="[detail.restoredUrl]"
              fit="contain"
              class="mt-2 h-[220px] w-full rounded-lg bg-white"
              :alt="`${detail.cameraLabel} 恢复图`"
            />
          </div>
        </el-tab-pane>

        <el-tab-pane label="处置记录">
          <div v-if="!logs.length" class="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">暂无记录</div>
          <el-timeline>
            <el-timeline-item
              v-for="l in logs"
              :key="l.tsMs"
              :timestamp="formatDateTime(l.tsMs)"
              placement="top"
            >
              <div class="text-sm font-semibold">{{ l.action }}</div>
              <div class="mt-1 text-xs text-zinc-600">{{ l.actor }}：{{ l.note }}</div>
            </el-timeline-item>
          </el-timeline>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <el-empty v-else description="未找到工单" />

    <FalseAlarmDialog v-model="falseAlarmOpen" @confirm="onFalseAlarm" />
  </div>
</template>
