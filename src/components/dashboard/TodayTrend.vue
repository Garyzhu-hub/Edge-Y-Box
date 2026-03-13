<script setup lang="ts">
import { computed } from 'vue'
import TrendChart from '@/components/dashboard/TrendChart.vue'
import type { PropType } from 'vue'

type TrendPoint = { tsMs: number; alarms: number; workOrders: number }

const props = defineProps({
  points: {
    type: Array as PropType<TrendPoint[]>,
    required: true,
  },
})

const series = computed(() => {
  return {
    labels: props.points.map((p) => p.tsMs),
    alarms: props.points.map((p) => p.alarms),
    workOrders: props.points.map((p) => p.workOrders),
  }
})
</script>

<template>
  <el-card>
    <div class="flex items-center justify-between">
      <div class="text-sm font-semibold">今日趋势</div>
      <div class="text-xs text-zinc-500">指标：新增预警数 / 新增工单数</div>
    </div>
    <div class="mt-3 h-[280px]">
      <TrendChart
        :labels="series.labels"
        :series-a="series.alarms"
        :series-b="series.workOrders"
        name-a="新增预警"
        name-b="新增工单"
      />
    </div>
  </el-card>
</template>

