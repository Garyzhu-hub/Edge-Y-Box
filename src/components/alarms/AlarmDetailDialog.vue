<script setup lang="ts">
import EvidencePanel, {
  type EvidenceRuleHit,
  type StructuredDetection,
} from '@/components/evidence/EvidencePanel.vue'
import { useRoute, useRouter } from 'vue-router'

export type AlarmRecord = {
  id: string
  cameraLabel: string
  alarmType: string
  level: '一般' | '警告' | '严重' | '紧急'
  status: '异常' | '恢复'
  alarmTimeMs: number
  detectionId: string
  workOrderId?: string
  sourceUrl: string
  analyzedUrl: string
  structured: StructuredDetection[]
  hits: EvidenceRuleHit[]
}

const props = defineProps<{ modelValue: boolean; record: AlarmRecord | null }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const router = useRouter()
const route = useRoute()

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const title = computed(() => {
  if (!props.record) return '报警详情'
  return `${props.record.cameraLabel}｜${props.record.alarmType}`
})

function goWorkOrder(id: string) {
  router.push({
    path: `/work-orders/${encodeURIComponent(id)}`,
    query: {
      ...route.query,
      from: 'alarms',
    },
  })
  open.value = false
}
</script>

<template>
  <el-dialog v-model="open" :title="title" width="980px" align-center>
    <EvidencePanel
      v-if="record"
      :camera-label="record.cameraLabel"
      :alarm-type="record.alarmType"
      :level="record.level"
      :status="record.status"
      :alarm-time-ms="record.alarmTimeMs"
      :detection-id="record.detectionId"
      :work-order-id="record.workOrderId || ''"
      :source-url="record.sourceUrl"
      :analyzed-url="record.analyzedUrl"
      :structured="record.structured"
      :hits="record.hits"
      @go-work-order="goWorkOrder"
    />
  </el-dialog>
</template>
