<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { formatDateTime } from '@/stores/app'
import AlarmDetailDialog, { type AlarmRecord } from '@/components/alarms/AlarmDetailDialog.vue'
import { loadAlarmRecords } from '@/utils/alarmRecordsStore'
import type { Deployment } from '@/utils/deploymentsMock'

const props = defineProps<{
  modelValue: boolean
  deployment: Deployment | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const keyword = ref('')
const status = ref<'' | '异常' | '恢复'>('')
const alarmType = ref('')
const range = ref<[Date, Date] | null>(null)
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const loading = ref(false)
const rows = ref<AlarmRecord[]>([])

const detailOpen = ref(false)
const detailRecord = ref<AlarmRecord | null>(null)

function alarmTypeOfAlgorithm(name: string) {
  if (name.includes('安全帽')) return '安全帽'
  if (name.includes('离岗')) return '离岗'
  if (name.includes('违停')) return '违停占道'
  if (name.includes('火焰')) return '火焰'
  if (name.includes('卫生')) return '公共区域卫生'
  return name
}

const deploymentAlarmTypes = computed(() => {
  if (!props.deployment) return []
  const set = new Set(props.deployment.instances.map((x) => alarmTypeOfAlgorithm(x.algorithmName)).filter(Boolean))
  return Array.from(set)
})

const dialogTitle = computed(() => {
  if (!props.deployment) return '查看结果'
  return `查看结果｜${props.deployment.name}`
})

function levelTagType(level: AlarmRecord['level']) {
  if (level === '紧急') return 'danger'
  if (level === '严重') return 'warning'
  if (level === '警告') return 'warning'
  return 'info'
}

function statusTagType(v: AlarmRecord['status']) {
  return v === '异常' ? 'danger' : 'success'
}

function buildData() {
  if (!props.deployment) return []
  const cameraLabel = props.deployment.cameraLabel
  const allowTypes = new Set(deploymentAlarmTypes.value)
  return loadAlarmRecords()
    .filter((x) => x.cameraLabel === cameraLabel)
    .filter((x) => (allowTypes.size ? allowTypes.has(x.alarmType) : true))
}

function applyFilter(data: AlarmRecord[]) {
  const kw = keyword.value.trim()
  return data
    .filter((x) => (kw ? x.detectionId.includes(kw) || (x.workOrderId || '').includes(kw) || x.alarmType.includes(kw) : true))
    .filter((x) => (status.value ? x.status === status.value : true))
    .filter((x) => (alarmType.value ? x.alarmType === alarmType.value : true))
    .filter((x) => {
      if (!range.value) return true
      const [from, to] = range.value
      const fromMs = from.getTime()
      const toMs = to.getTime()
      return x.alarmTimeMs >= fromMs && x.alarmTimeMs <= toMs
    })
    .sort((a, b) => b.alarmTimeMs - a.alarmTimeMs)
}

async function refresh() {
  loading.value = true
  try {
    await new Promise((r) => setTimeout(r, 180))
    const filtered = applyFilter(buildData())
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
  keyword.value = ''
  status.value = ''
  alarmType.value = ''
  range.value = null
  page.value = 1
  refresh()
}

function openDetail(rec: AlarmRecord) {
  detailRecord.value = rec
  detailOpen.value = true
}

watch([page, pageSize], () => {
  if (!open.value) return
  refresh()
})

watch(
  () => [open.value, props.deployment?.id] as const,
  ([v]) => {
    if (!v) return
    keyword.value = ''
    status.value = ''
    alarmType.value = ''
    range.value = null
    page.value = 1
    refresh()
  }
)

watch(open, (v) => {
  if (!v) {
    detailOpen.value = false
    detailRecord.value = null
  }
})

function guardOpenDetail(rec: AlarmRecord) {
  if (!rec) {
    ElMessage.warning('结果不存在')
    return
  }
  openDetail(rec)
}
</script>

<template>
  <el-dialog v-model="open" :title="dialogTitle" width="1180" destroy-on-close>
    <div class="space-y-3">
      <el-card>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-12">
          <el-input v-model="keyword" class="md:col-span-3" placeholder="检测ID/工单号/类型" clearable />
          <el-select v-model="alarmType" class="md:col-span-2" placeholder="告警类型" clearable>
            <el-option v-for="t in deploymentAlarmTypes" :key="t" :label="t" :value="t" />
          </el-select>
          <el-select v-model="status" class="md:col-span-2" placeholder="状态" clearable>
            <el-option label="异常" value="异常" />
            <el-option label="恢复" value="恢复" />
          </el-select>
          <el-date-picker
            v-model="range"
            class="md:col-span-3"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            unlink-panels
          />
          <div class="md:col-span-2 flex items-center justify-end gap-2">
            <el-button @click="onReset">重置</el-button>
            <el-button type="primary" :loading="loading" @click="onSearch">查询</el-button>
          </div>
        </div>
      </el-card>

      <el-table :data="rows" v-loading="loading" size="small" height="480" class="table-standard">
        <el-table-column label="时间" min-width="170">
          <template #default="scope">
            <span class="text-xs text-zinc-600">{{ formatDateTime(scope.row.alarmTimeMs) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="cameraLabel" label="摄像头" min-width="150" />
        <el-table-column prop="alarmType" label="告警类型" width="120" />
        <el-table-column label="等级" width="88">
          <template #default="scope">
            <el-tag :type="levelTagType(scope.row.level)" size="small">{{ scope.row.level }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="88">
          <template #default="scope">
            <el-tag :type="statusTagType(scope.row.status)" size="small">{{ scope.row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="检测ID" min-width="200">
          <template #default="scope">
            <span class="font-mono text-xs">{{ scope.row.detectionId }}</span>
          </template>
        </el-table-column>
        <el-table-column label="工单号" min-width="120">
          <template #default="scope">
            <span class="font-mono text-xs">{{ scope.row.workOrderId || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="96" fixed="right">
          <template #default="scope">
            <el-button link type="primary" size="small" @click="guardOpenDetail(scope.row)">查看详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="flex items-center justify-between">
        <div class="text-xs text-zinc-500">
          <span v-if="total">共 {{ total }} 条结果</span>
          <span v-else>暂无结果，可先在布点“更多”中触发“模拟告警”生成演示数据</span>
        </div>
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next, sizes"
          :page-sizes="[10, 20, 50]"
          small
        />
      </div>
    </div>

    <template #footer>
      <el-button @click="open = false">关闭</el-button>
    </template>
  </el-dialog>

  <AlarmDetailDialog v-model="detailOpen" :record="detailRecord" />
</template>
