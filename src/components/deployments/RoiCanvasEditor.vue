<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import type { RoiShape } from '@/utils/deploymentsMock'

type Mode = 'select' | 'draw_rect' | 'draw_polygon'

const props = defineProps<{
  rois: RoiShape[]
  activeId: string
  mode: Mode
  backgroundUrl?: string
}>()

const emit = defineEmits<{
  (e: 'update:rois', v: RoiShape[]): void
  (e: 'update:activeId', v: string): void
  (e: 'complete-draw'): void
  (e: 'cancel-draw'): void
}>()

const rootRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

const view = reactive({
  zoom: 1,
  panX: 0,
  panY: 0,
  showGrid: false,
})

const state = reactive({
  pointerDown: false,
  draggingPoint: null as null | { roiId: string; pointIndex: number },
  draggingRoiId: '' as string,
  dragStart: { x: 0, y: 0 },
  dragStartPan: { x: 0, y: 0 },
  drawing: false,
  rectStart: { x: 0, y: 0 },
  polygonDraft: [] as { x: number; y: number }[],
  spaceDown: false,
})

const dpr = window.devicePixelRatio || 1

const image = ref<HTMLImageElement | null>(null)
const imageReady = ref(false)

function loadImage(url?: string) {
  imageReady.value = false
  if (!url) {
    image.value = null
    draw()
    return
  }
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    image.value = img
    imageReady.value = true
    fitToView()
    draw()
  }
  img.onerror = () => {
    image.value = null
    imageReady.value = false
    draw()
  }
  img.src = url
}

function clamp01(n: number) {
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

function getCanvasSize() {
  const el = canvasRef.value
  if (!el) return { w: 1, h: 1 }
  const rect = el.getBoundingClientRect()
  return { w: rect.width, h: rect.height }
}

function worldToScreen(p: { x: number; y: number }) {
  const { w, h } = getCanvasSize()
  return {
    x: (p.x * w) * view.zoom + view.panX,
    y: (p.y * h) * view.zoom + view.panY,
  }
}

function screenToWorld(p: { x: number; y: number }) {
  const { w, h } = getCanvasSize()
  return {
    x: clamp01((p.x - view.panX) / Math.max(1, w * view.zoom)),
    y: clamp01((p.y - view.panY) / Math.max(1, h * view.zoom)),
  }
}

function fitToView() {
  view.zoom = 1
  view.panX = 0
  view.panY = 0
}

function setRois(next: RoiShape[]) {
  emit('update:rois', next)
}

function setActive(id: string) {
  emit('update:activeId', id)
}

function normalizeVertices(r: RoiShape) {
  const vertices = Array.isArray(r.vertices) ? r.vertices : []
  return vertices.map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }))
}

function hitTestPoint(mouse: { x: number; y: number }) {
  const hitRadius = 7
  for (const roi of props.rois) {
    const vertices = normalizeVertices(roi)
    for (let i = 0; i < vertices.length; i++) {
      const sp = worldToScreen(vertices[i])
      const dx = sp.x - mouse.x
      const dy = sp.y - mouse.y
      if (dx * dx + dy * dy <= hitRadius * hitRadius) return { roiId: roi.id, pointIndex: i }
    }
  }
  return null
}

function hitTestRoi(mouse: { x: number; y: number }) {
  const world = screenToWorld(mouse)
  const x = world.x
  const y = world.y
  for (let i = props.rois.length - 1; i >= 0; i--) {
    const roi = props.rois[i]
    const vertices = normalizeVertices(roi)
    if (!vertices.length) continue

    if (roi.type === 'rect' && vertices.length >= 4) {
      const xs = vertices.map((p) => p.x)
      const ys = vertices.map((p) => p.y)
      const minX = Math.min(...xs)
      const maxX = Math.max(...xs)
      const minY = Math.min(...ys)
      const maxY = Math.max(...ys)
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) return roi.id
    } else if (roi.type === 'polygon') {
      let inside = false
      for (let j = 0, k = vertices.length - 1; j < vertices.length; k = j++) {
        const pj = vertices[j]
        const pk = vertices[k]
        const intersect = pj.y > y !== pk.y > y && x < ((pk.x - pj.x) * (y - pj.y)) / (pk.y - pj.y + 1e-9) + pj.x
        if (intersect) inside = !inside
      }
      if (inside) return roi.id
    }
  }
  return ''
}

function updateRoiVertices(roiId: string, vertices: { x: number; y: number }[]) {
  const next = props.rois.map((r) => {
    if (r.id !== roiId) return r
    const vv = vertices.map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }))
    return { ...r, vertices: vv, points: vv.length }
  })
  setRois(next)
}

function moveRoi(roiId: string, dxWorld: number, dyWorld: number) {
  const roi = props.rois.find((r) => r.id === roiId)
  if (!roi) return
  const vertices = normalizeVertices(roi)
  if (!vertices.length) return
  const moved = vertices.map((p) => ({ x: clamp01(p.x + dxWorld), y: clamp01(p.y + dyWorld) }))
  updateRoiVertices(roiId, moved)
}

function onPointerDown(e: PointerEvent) {
  const el = canvasRef.value
  if (!el) return
  el.setPointerCapture(e.pointerId)
  state.pointerDown = true
  const rect = el.getBoundingClientRect()
  const mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  state.dragStart = { ...mouse }
  state.dragStartPan = { x: view.panX, y: view.panY }

  if (state.spaceDown) {
    return
  }

  if (props.mode === 'draw_rect') {
    state.drawing = true
    state.rectStart = { ...mouse }
    return
  }

  if (props.mode === 'draw_polygon') {
    const w = screenToWorld(mouse)
    state.polygonDraft.push(w)
    updateRoiVertices(props.activeId, state.polygonDraft)
    return
  }

  const hitP = hitTestPoint(mouse)
  if (hitP) {
    state.draggingPoint = hitP
    setActive(hitP.roiId)
    return
  }
  const hitRoiId = hitTestRoi(mouse)
  if (hitRoiId) {
    state.draggingRoiId = hitRoiId
    setActive(hitRoiId)
  }
}

function onPointerMove(e: PointerEvent) {
  const el = canvasRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top }

  if (!state.pointerDown) return
  if (state.spaceDown) {
    view.panX = state.dragStartPan.x + (mouse.x - state.dragStart.x)
    view.panY = state.dragStartPan.y + (mouse.y - state.dragStart.y)
    draw()
    return
  }

  if (props.mode === 'draw_rect' && state.drawing) {
    const a = screenToWorld(state.rectStart)
    const b = screenToWorld(mouse)
    const minX = Math.min(a.x, b.x)
    const maxX = Math.max(a.x, b.x)
    const minY = Math.min(a.y, b.y)
    const maxY = Math.max(a.y, b.y)
    const vertices = [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ]
    updateRoiVertices(props.activeId, vertices)
    return
  }

  if (state.draggingPoint) {
    const w = screenToWorld(mouse)
    const roi = props.rois.find((r) => r.id === state.draggingPoint?.roiId)
    if (!roi) return
    const vertices = normalizeVertices(roi)
    if (!vertices[state.draggingPoint.pointIndex]) return
    vertices[state.draggingPoint.pointIndex] = w
    updateRoiVertices(roi.id, vertices)
    return
  }

  if (state.draggingRoiId) {
    const a = screenToWorld(state.dragStart)
    const b = screenToWorld(mouse)
    moveRoi(state.draggingRoiId, b.x - a.x, b.y - a.y)
    state.dragStart = { ...mouse }
  }
}

function onPointerUp(e: PointerEvent) {
  const el = canvasRef.value
  if (!el) return
  if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
  state.pointerDown = false
  state.draggingPoint = null
  state.draggingRoiId = ''
  if (props.mode === 'draw_rect' && state.drawing) {
    state.drawing = false
    emit('complete-draw')
  }
}

function onDblClick() {
  if (props.mode !== 'draw_polygon') return
  if (!state.polygonDraft.length) return
  emit('complete-draw')
}

function onWheel(e: WheelEvent) {
  if (!e.ctrlKey) return
  e.preventDefault()
  const delta = -e.deltaY
  const next = view.zoom * (delta > 0 ? 1.08 : 0.92)
  view.zoom = Math.min(3, Math.max(0.5, next))
  draw()
}

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const step = 40 * view.zoom
  ctx.save()
  ctx.strokeStyle = 'rgba(148,163,184,0.25)'
  ctx.lineWidth = 1
  for (let x = view.panX % step; x < w; x += step) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, h)
    ctx.stroke()
  }
  for (let y = view.panY % step; y < h; y += step) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }
  ctx.restore()
}

function draw() {
  const el = canvasRef.value
  if (!el) return
  const { w, h } = getCanvasSize()
  el.width = Math.max(1, Math.floor(w * dpr))
  el.height = Math.max(1, Math.floor(h * dpr))
  const ctx = el.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  ctx.fillStyle = '#f4f4f5'
  ctx.fillRect(0, 0, w, h)

  if (image.value && imageReady.value) {
    ctx.save()
    ctx.translate(view.panX, view.panY)
    ctx.scale(view.zoom, view.zoom)
    ctx.drawImage(image.value, 0, 0, w, h)
    ctx.restore()
  }

  if (view.showGrid) drawGrid(ctx, w, h)

  for (const roi of props.rois) {
    const vertices = normalizeVertices(roi)
    if (!vertices.length) continue
    const active = roi.id === props.activeId
    const stroke = active ? 'rgba(37,99,235,0.95)' : 'rgba(16,185,129,0.85)'
    const fill = roi.enabled ? (active ? 'rgba(37,99,235,0.15)' : 'rgba(16,185,129,0.12)') : 'rgba(148,163,184,0.12)'
    ctx.beginPath()
    const p0 = worldToScreen(vertices[0])
    ctx.moveTo(p0.x, p0.y)
    for (let i = 1; i < vertices.length; i++) {
      const p = worldToScreen(vertices[i])
      ctx.lineTo(p.x, p.y)
    }
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.fill()
    ctx.strokeStyle = stroke
    ctx.lineWidth = active ? 2 : 1.5
    ctx.stroke()

    for (let i = 0; i < vertices.length; i++) {
      const sp = worldToScreen(vertices[i])
      ctx.beginPath()
      ctx.arc(sp.x, sp.y, active ? 4 : 3, 0, Math.PI * 2)
      ctx.fillStyle = active ? '#2563eb' : '#10b981'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }

  if (props.mode === 'draw_polygon' && state.polygonDraft.length) {
    const vertices = state.polygonDraft
    ctx.beginPath()
    const p0 = worldToScreen(vertices[0])
    ctx.moveTo(p0.x, p0.y)
    for (let i = 1; i < vertices.length; i++) {
      const p = worldToScreen(vertices[i])
      ctx.lineTo(p.x, p.y)
    }
    ctx.strokeStyle = 'rgba(234,179,8,0.95)'
    ctx.setLineDash([6, 4])
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.setLineDash([])
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (e.code === 'Space') state.spaceDown = true
  if (e.code === 'Escape') {
    state.drawing = false
    state.polygonDraft = []
    emit('cancel-draw')
  }
}

function onKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space') state.spaceDown = false
}

let ro: ResizeObserver | null = null
onMounted(() => {
  loadImage(props.backgroundUrl)
  ro = new ResizeObserver(() => draw())
  if (rootRef.value) ro.observe(rootRef.value)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  draw()
})

onUnmounted(() => {
  ro?.disconnect()
  ro = null
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
})

watch(
  () => props.backgroundUrl,
  (u) => loadImage(u)
)

watch(
  () => props.rois,
  () => draw(),
  { deep: true }
)

watch(
  () => props.activeId,
  () => draw()
)

watch(
  () => props.mode,
  (m) => {
    if (m !== 'draw_polygon') state.polygonDraft = []
    if (m !== 'draw_rect') state.drawing = false
    draw()
  }
)

function resetView() {
  fitToView()
  draw()
}

function zoomIn() {
  view.zoom = Math.min(3, view.zoom * 1.1)
  draw()
}

function zoomOut() {
  view.zoom = Math.max(0.5, view.zoom / 1.1)
  draw()
}
</script>

<template>
  <div ref="rootRef" class="h-full">
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2 text-xs text-zinc-600">
        <span v-if="mode === 'draw_rect'">正在绘制：矩形（拖拽鼠标）</span>
        <span v-else-if="mode === 'draw_polygon'">正在绘制：多边形（单击加点，双击完成，Esc取消）</span>
        <span v-else>选择模式：拖拽点调整形状，拖拽区域移动，按住空格拖动画布</span>
      </div>
      <div class="flex items-center gap-2">
        <el-switch v-model="view.showGrid" active-text="网格" inactive-text="网格" @change="draw" />
        <el-button size="small" @click="zoomOut">-</el-button>
        <span class="w-12 text-center text-xs text-zinc-600">{{ Math.round(view.zoom * 100) }}%</span>
        <el-button size="small" @click="zoomIn">+</el-button>
        <el-button size="small" @click="resetView">重置视图</el-button>
      </div>
    </div>

    <canvas
      ref="canvasRef"
      class="h-[420px] w-full rounded-lg bg-zinc-50"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @dblclick="onDblClick"
      @wheel="onWheel"
    />
  </div>
</template>
