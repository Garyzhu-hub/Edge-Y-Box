<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useAppStore, type TimeRangePreset } from '@/stores/app'

const app = useAppStore()

const options = [
  { label: '今日', value: 'today' as TimeRangePreset },
  { label: '近24h', value: 'last24h' as TimeRangePreset },
  { label: '近7天', value: 'last7d' as TimeRangePreset },
  { label: '自定义', value: 'custom' as TimeRangePreset },
]

const dateRange = ref<[Date, Date] | null>(null)

const presetModel = computed({
  get: () => app.timePreset,
  set: (v) => app.setPreset(v),
})

watchEffect(() => {
  if (app.timePreset !== 'custom') return
  const from = app.customFromMs ?? app.timeRange.fromMs
  const to = app.customToMs ?? app.timeRange.toMs
  dateRange.value = [new Date(from), new Date(to)]
})

function onCustomChange(v: [Date, Date] | null) {
  if (!v) return
  app.setCustomRange(v[0], v[1])
}
</script>

<template>
  <div class="flex min-w-0 items-center gap-2">
    <!-- min-w + shrink-0：避免在 flex 父级中被压成极窄条，选中项文案要能完整展示 -->
    <el-select
      v-model="presetModel"
      size="small"
      class="!w-[148px] shrink-0 !min-w-[148px]"
    >
      <el-option
        v-for="opt in options"
        :key="opt.value"
        :label="opt.label"
        :value="opt.value"
      />
    </el-select>

    <el-date-picker
      v-if="app.timePreset === 'custom'"
      v-model="dateRange"
      type="daterange"
      unlink-panels
      size="small"
      range-separator="~"
      start-placeholder="开始"
      end-placeholder="结束"
      @change="onCustomChange"
    />
  </div>
</template>

