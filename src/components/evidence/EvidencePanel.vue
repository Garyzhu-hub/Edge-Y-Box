<script setup lang="ts">
import type { PropType } from 'vue'

export type BBox = { x: number; y: number; w: number; h: number }

export type StructuredDetection = {
  id: string
  label: string
  confidence: number
  bbox: BBox
  roiName?: string
  roiSegment?: string
  counted?: boolean
}

export type EvidenceRuleHit = {
  label: string
  tsMs: number
  counted: boolean
}

const props = defineProps({
  cameraLabel: { type: String, required: true },
  alarmType: { type: String, required: true },
  level: { type: String, required: true },
  status: { type: String, required: true },
  alarmTimeMs: { type: Number, required: true },
  detectionId: { type: String, required: true },
  workOrderId: { type: String, default: '' },
  sourceUrl: { type: String, required: true },
  analyzedUrl: { type: String, required: true },
  structured: {
    type: Array as PropType<StructuredDetection[]>,
    required: true,
  },
  hits: {
    type: Array as PropType<EvidenceRuleHit[]>,
    required: true,
  },
  initialTab: {
    type: String as PropType<'structured' | 'hits'>,
    default: 'structured',
  },
})

const emit = defineEmits<{ (e: 'go-work-order', id: string): void }>()

const activeTab = ref(props.initialTab)
const highlightedId = ref('')

function fmtTime(ms: number) {
  const d = new Date(ms)
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const y = d.getFullYear()
  const m = pad2(d.getMonth() + 1)
  const day = pad2(d.getDate())
  const hh = pad2(d.getHours())
  const mm = pad2(d.getMinutes())
  const ss = pad2(d.getSeconds())
  return `${y}-${m}-${day} ${hh}:${mm}:${ss}`
}

function pct(v: number) {
  return `${Math.round(v * 100)}%`
}

function copyDetectionId() {
  window.navigator?.clipboard?.writeText(props.detectionId)
}

function onRowEnter(row: StructuredDetection) {
  highlightedId.value = row.id
}

function onRowLeave() {
  highlightedId.value = ''
}

const labeledHits = computed(() => {
  return props.hits.map((h, idx) => {
    const t = idx === 0 ? 't0' : `t${idx * 10}`
    return {
      ...h,
      t,
    }
  })
})
</script>

<template>
  <div class="space-y-3">
    <el-descriptions :column="2" border size="small">
      <el-descriptions-item label="摄像头">
        {{ cameraLabel }}
      </el-descriptions-item>
      <el-descriptions-item label="报警类型">
        {{ alarmType }}
      </el-descriptions-item>
      <el-descriptions-item label="等级">
        {{ level }}
      </el-descriptions-item>
      <el-descriptions-item label="状态">
        {{ status }}
      </el-descriptions-item>
      <el-descriptions-item label="异常检测ID">
        <div class="flex items-center justify-between gap-2">
          <span class="font-mono text-xs">{{ detectionId }}</span>
          <el-button
            size="small"
            type="primary"
            link
            @click="copyDetectionId"
          >
            复制
          </el-button>
        </div>
      </el-descriptions-item>
      <el-descriptions-item label="工单号">
        <el-button
          v-if="workOrderId"
          link
          type="primary"
          size="small"
          @click="emit('go-work-order', workOrderId)"
        >
          <span class="font-mono text-xs">{{ workOrderId }}</span>
        </el-button>
        <span v-else class="text-zinc-400">—</span>
      </el-descriptions-item>
      <el-descriptions-item label="报警时间" :span="2">
        {{ fmtTime(alarmTimeMs) }}
      </el-descriptions-item>
    </el-descriptions>

    <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-2">
        <div class="mb-2 flex items-center justify-between">
          <div class="text-xs font-medium text-zinc-600">源图</div>
        </div>
        <el-image
          :src="sourceUrl"
          :preview-src-list="[sourceUrl]"
          fit="contain"
          class="h-[260px] w-full rounded-lg bg-white"
          :alt="`${cameraLabel} 源图 ${fmtTime(alarmTimeMs)}`"
        />
      </div>

      <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-2">
        <div class="mb-2 flex items-center justify-between">
          <div class="text-xs font-medium text-zinc-600">分析图（含检测框）</div>
          <div v-if="highlightedId" class="text-xs text-zinc-500">高亮：{{ highlightedId }}</div>
        </div>
        <el-image
          :src="analyzedUrl"
          :preview-src-list="[analyzedUrl]"
          fit="contain"
          class="h-[260px] w-full rounded-lg bg-white"
          :alt="`${cameraLabel} 分析图 ${fmtTime(alarmTimeMs)}`"
        />
      </div>
    </div>

    <el-tabs v-model="activeTab" class="mt-1">
      <el-tab-pane label="结构化结果" name="structured">
        <el-table
          :data="structured"
          size="small"
          height="220"
          @row-mouseenter="onRowEnter"
          @row-mouseleave="onRowLeave"
        >
          <el-table-column prop="label" label="label" width="120" />
          <el-table-column label="confidence" width="110">
            <template #default="scope">
              <span class="font-mono text-xs">{{ pct(scope.row.confidence) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="bbox" min-width="160">
            <template #default="scope">
              <span class="font-mono text-xs">
                {{ scope.row.bbox.x }},{{ scope.row.bbox.y }},{{ scope.row.bbox.w }},{{ scope.row.bbox.h }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="ROI" width="140">
            <template #default="scope">
              <div class="text-xs">
                <div class="truncate">{{ scope.row.roiName || '—' }}</div>
                <div class="text-zinc-500">{{ scope.row.roiSegment || '—' }}</div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="计入" width="70">
            <template #default="scope">
              <el-tag :type="scope.row.counted ? 'success' : 'info'" size="small">
                {{ scope.row.counted ? '是' : '否' }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="触发证据链" name="hits">
        <div class="rounded-xl border border-zinc-200 bg-white p-3">
          <div class="text-xs text-zinc-600">
            规则摘要：30分钟窗口内连续4次异常（t0/t10/t20/t30）才生成工单；恢复需连续正常3次。
          </div>
          <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div
              v-for="h in labeledHits"
              :key="h.t"
              class="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2"
            >
              <div class="text-xs font-semibold">{{ h.t }}</div>
              <div class="mt-1 truncate text-xs text-zinc-600">{{ h.label }}</div>
              <div class="mt-1 text-xs text-zinc-500">{{ fmtTime(h.tsMs) }}</div>
              <div class="mt-2">
                <el-tag :type="h.counted ? 'warning' : 'info'" size="small">
                  {{ h.counted ? '命中' : '不计入' }}
                </el-tag>
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>
