<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import { formatDateTime } from '@/stores/app'

const props = defineProps<{
  labels: number[]
  seriesA: number[]
  seriesB: number[]
  nameA: string
  nameB: string
}>()

const elRef = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null
let ro: ResizeObserver | null = null

function render() {
  if (!chart) return

  const x = props.labels.map((ms) => formatDateTime(ms))

  chart.setOption({
    grid: { left: 36, right: 16, top: 24, bottom: 36 },
    tooltip: { trigger: 'axis' },
    legend: { top: 0, left: 0, textStyle: { color: '#52525b', fontSize: 12 } },
    xAxis: {
      type: 'category',
      data: x,
      axisLabel: { color: '#71717a', fontSize: 11, hideOverlap: true },
      axisLine: { lineStyle: { color: '#e4e4e7' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#71717a', fontSize: 11 },
      splitLine: { lineStyle: { color: '#f4f4f5' } },
    },
    series: [
      {
        name: props.nameA,
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: props.seriesA,
        lineStyle: { width: 2, color: '#2563eb' },
        areaStyle: { color: 'rgba(37, 99, 235, 0.12)' },
      },
      {
        name: props.nameB,
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: props.seriesB,
        lineStyle: { width: 2, color: '#16a34a' },
        areaStyle: { color: 'rgba(22, 163, 74, 0.10)' },
      },
    ],
  })
}

onMounted(() => {
  if (!elRef.value) return
  chart = echarts.init(elRef.value)
  render()

  ro = new ResizeObserver(() => {
    chart?.resize()
  })
  ro.observe(elRef.value)
})

onBeforeUnmount(() => {
  ro?.disconnect()
  ro = null
  chart?.dispose()
  chart = null
})

watch(
  () => [props.labels, props.seriesA, props.seriesB],
  () => render(),
  { deep: true }
)
</script>

<template>
  <div ref="elRef" class="h-full w-full" />
</template>

