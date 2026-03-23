<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore, formatDateTime } from '@/stores/app'
import TimeRangeControl from '@/components/layout/TimeRangeControl.vue'
import OnlineOverview from '@/components/dashboard/OnlineOverview.vue'
import QuickActions from '@/components/dashboard/QuickActions.vue'
import TodayTrend from '@/components/dashboard/TodayTrend.vue'
import RecentAnomalies from '@/components/dashboard/RecentAnomalies.vue'

type TrendPoint = { tsMs: number; alarms: number; workOrders: number }

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeTrend(fromMs: number, toMs: number, buckets: number, seed: number): TrendPoint[] {
  const rand = mulberry32(seed)
  const span = Math.max(1, toMs - fromMs)
  return Array.from({ length: buckets }).map((_, i) => {
    const tsMs = fromMs + Math.floor((span * i) / Math.max(1, buckets - 1))
    const baseA = 8 + Math.floor(rand() * 10)
    const baseW = 3 + Math.floor(rand() * 6)
    const wave = Math.sin((i / Math.max(1, buckets - 1)) * Math.PI) * 6
    const alarms = Math.max(0, Math.round(baseA + wave + rand() * 4))
    const workOrders = Math.max(0, Math.round(baseW + wave * 0.45 + rand() * 2))
    return { tsMs, alarms, workOrders }
  })
}

const app = useAppStore()
const route = useRoute()
const router = useRouter()

watch(
  () => [app.timePreset, app.customFromMs, app.customToMs],
  () => {
    const next = { ...route.query, ...app.buildRangeQuery() }
    const a = JSON.stringify(route.query)
    const b = JSON.stringify(next)
    if (a !== b) router.replace({ query: next })
  },
  { deep: true }
)

const headline = computed(() => {
  const tr = app.timeRange
  return {
    rangeLabel: tr.label,
    from: formatDateTime(tr.fromMs),
    to: formatDateTime(tr.toMs),
  }
})

const trend = computed(() => {
  const tr = app.timeRange
  const seed = (tr.fromMs ^ tr.toMs) & 0xffffffff

  if (app.timePreset === 'today') return makeTrend(tr.fromMs, tr.toMs, 24, seed)
  if (app.timePreset === 'last24h') return makeTrend(tr.fromMs, tr.toMs, 24, seed)
  if (app.timePreset === 'last7d') return makeTrend(tr.fromMs, tr.toMs, 7, seed)
  return makeTrend(tr.fromMs, tr.toMs, 14, seed)
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div class="min-w-0">
        <div class="text-base font-semibold">运行看板</div>
        <div class="mt-1 text-xs text-zinc-500">
          时间范围：{{ headline.rangeLabel }}（{{ headline.from }} ~ {{ headline.to }}）
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <span class="hidden text-xs text-zinc-500 dark:text-zinc-400 sm:inline">看板时间</span>
        <TimeRangeControl />
      </div>
    </div>

    <QuickActions />
    <OnlineOverview />

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div class="lg:col-span-2">
        <TodayTrend :points="trend" />
      </div>
      <div class="lg:col-span-1">
        <RecentAnomalies />
      </div>
    </div>
  </div>
</template>

