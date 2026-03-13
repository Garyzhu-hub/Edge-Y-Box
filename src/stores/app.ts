import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { RouteLocationNormalized } from 'vue-router'

export type TimeRangePreset = 'today' | 'last24h' | 'last7d' | 'custom'

function startOfDayMs(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function endOfDayMs(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime()
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

export function formatDateYMD(ms: number) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function formatDateTime(ms: number) {
  const d = new Date(ms)
  return `${formatDateYMD(ms)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function parseMs(v: unknown): number | null {
  if (typeof v !== 'string') return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return n
}

export const useAppStore = defineStore('app', () => {
  const timePreset = ref<TimeRangePreset>('today')
  const customFromMs = ref<number | null>(null)
  const customToMs = ref<number | null>(null)

  const timeRange = computed(() => {
    const now = new Date()

    if (timePreset.value === 'today') {
      const fromMs = startOfDayMs(now)
      const toMs = endOfDayMs(now)
      return { fromMs, toMs, label: '今日' }
    }

    if (timePreset.value === 'last24h') {
      const toMs = Date.now()
      const fromMs = toMs - 24 * 60 * 60 * 1000
      return { fromMs, toMs, label: '近24h' }
    }

    if (timePreset.value === 'last7d') {
      const toMs = endOfDayMs(now)
      const fromMs = startOfDayMs(new Date(toMs - 6 * 24 * 60 * 60 * 1000))
      return { fromMs, toMs, label: '近7天' }
    }

    const fallbackTo = endOfDayMs(now)
    const fallbackFrom = startOfDayMs(new Date(fallbackTo - 6 * 24 * 60 * 60 * 1000))
    const fromMs = customFromMs.value ?? fallbackFrom
    const toMs = customToMs.value ?? fallbackTo
    const label = `${formatDateYMD(fromMs)} ~ ${formatDateYMD(toMs)}`
    return { fromMs, toMs, label }
  })

  function setPreset(preset: TimeRangePreset) {
    timePreset.value = preset
    if (preset !== 'custom') {
      customFromMs.value = null
      customToMs.value = null
    }
  }

  function setCustomRange(from: Date, to: Date) {
    timePreset.value = 'custom'
    customFromMs.value = startOfDayMs(from)
    customToMs.value = endOfDayMs(to)
  }

  function syncFromRoute(route: RouteLocationNormalized) {
    const range = typeof route.query.range === 'string' ? route.query.range : null
    const from = parseMs(route.query.from)
    const to = parseMs(route.query.to)

    if (range === 'today') setPreset('today')
    else if (range === '24h') setPreset('last24h')
    else if (range === '7d') setPreset('last7d')
    else if (range === 'custom') {
      timePreset.value = 'custom'
      customFromMs.value = from
      customToMs.value = to
    }
  }

  function buildRangeQuery() {
    if (timePreset.value === 'today') return { range: 'today' }
    if (timePreset.value === 'last24h') return { range: '24h' }
    if (timePreset.value === 'last7d') return { range: '7d' }
    return {
      range: 'custom',
      from: String(customFromMs.value ?? timeRange.value.fromMs),
      to: String(customToMs.value ?? timeRange.value.toMs),
    }
  }

  return {
    timePreset,
    customFromMs,
    customToMs,
    timeRange,
    setPreset,
    setCustomRange,
    syncFromRoute,
    buildRangeQuery,
  }
})

