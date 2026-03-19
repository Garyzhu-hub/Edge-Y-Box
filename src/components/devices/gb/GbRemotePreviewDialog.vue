<script setup lang="ts">
import { ElMessage } from 'element-plus'
import FlvJs from 'flv.js'
import Hls from 'hls.js'
import type { GbCascadePlatform } from '@/utils/gbCascadeMock'
import type { LocalGbChannel } from '@/utils/gbLocalChannels'

const props = defineProps<{
  modelValue: boolean
  platform: GbCascadePlatform | null
  channel: LocalGbChannel | null
}>()

const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

type PlayerKind = 'hls' | 'flv' | 'native' | 'unknown'

const videoRef = ref<HTMLVideoElement | null>(null)
const playing = ref(false)
const loading = ref(false)
const errorText = ref('')
const playUrl = ref('')

let hls: Hls | null = null
let flv: any = null

function normalizeUrl(raw: string) {
  return raw.trim()
}

function defaultUrlFromChannel(channel: LocalGbChannel | null) {
  if (!channel) return ''
  return `http://${channel.cameraIp}/live/index.m3u8`
}

function guessPlayerKind(url: string): PlayerKind {
  const u = url.toLowerCase()
  if (u.endsWith('.m3u8')) return 'hls'
  if (u.includes('.m3u8?')) return 'hls'
  if (u.endsWith('.flv')) return 'flv'
  if (u.includes('.flv?')) return 'flv'
  if (u.startsWith('http://') || u.startsWith('https://')) {
    if (videoRef.value?.canPlayType('application/vnd.apple.mpegurl')) return 'native'
  }
  return 'unknown'
}

function clearVideoSrc() {
  if (!videoRef.value) return
  try {
    videoRef.value.pause()
  } catch {
    return
  }
  videoRef.value.removeAttribute('src')
  try {
    videoRef.value.load()
  } catch {
    return
  }
}

function destroyPlayer() {
  playing.value = false
  loading.value = false
  errorText.value = ''
  if (hls) {
    try {
      hls.destroy()
    } finally {
      hls = null
    }
  }
  if (flv) {
    try {
      flv.destroy()
    } finally {
      flv = null
    }
  }
  clearVideoSrc()
}

async function play() {
  if (!videoRef.value) return
  const url = normalizeUrl(playUrl.value)
  if (!url) {
    ElMessage.warning('请先填写可播放地址')
    return
  }

  destroyPlayer()
  loading.value = true
  errorText.value = ''

  const kind = guessPlayerKind(url)
  try {
    if (kind === 'hls') {
      if (videoRef.value.canPlayType('application/vnd.apple.mpegurl')) {
        videoRef.value.src = url
      } else if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
        })
        const ready = new Promise<void>((resolve) => {
          hls?.once(Hls.Events.MANIFEST_PARSED, () => resolve())
        })
        hls.on(Hls.Events.ERROR, (_evt, data) => {
          const msg = data?.details ? String(data.details) : '播放错误'
          errorText.value = msg
          if (data?.fatal) {
            loading.value = false
            playing.value = false
          }
        })
        hls.loadSource(url)
        hls.attachMedia(videoRef.value)
        await ready
      } else {
        throw new Error('当前浏览器不支持 HLS 播放')
      }
    } else if (kind === 'flv') {
      const flvjs: any = FlvJs as any
      if (!flvjs?.isSupported?.()) throw new Error('当前浏览器不支持 FLV.js 播放')
      flv = flvjs.createPlayer(
        {
          type: 'flv',
          url,
          isLive: true,
        },
        {
          enableStashBuffer: false,
          stashInitialSize: 128,
        }
      )
      flv.on(flvjs.Events.ERROR, (_type: any, detail: any) => {
        errorText.value = detail ? String(detail) : '播放错误'
        loading.value = false
        playing.value = false
      })
      flv.attachMediaElement(videoRef.value)
      flv.load()
    } else if (kind === 'native') {
      videoRef.value.src = url
    } else {
      throw new Error('无法识别播放类型：仅支持 HLS(.m3u8) 或 FLV(.flv)')
    }

    await videoRef.value.play()
    playing.value = true
    loading.value = false
  } catch (e: any) {
    loading.value = false
    playing.value = false
    errorText.value = e?.message ? String(e.message) : '播放失败'
  }
}

function stop() {
  destroyPlayer()
}

async function retry() {
  await play()
}

async function copyUrl() {
  const url = normalizeUrl(playUrl.value)
  if (!url) {
    ElMessage.warning('没有可复制的地址')
    return
  }
  try {
    await navigator.clipboard.writeText(url)
    ElMessage.success('已复制')
  } catch {
    ElMessage.warning('复制失败，请手动复制')
  }
}

async function toggleFullscreen() {
  const el = videoRef.value
  if (!el) return
  const doc: any = document as any
  const fsEl = doc.fullscreenElement || doc.webkitFullscreenElement
  if (fsEl) {
    await (document.exitFullscreen?.() || doc.webkitExitFullscreen?.())
    return
  }
  await ((el as any).requestFullscreen?.() || (el as any).webkitRequestFullscreen?.())
}

watch(
  () => [open.value, props.channel?.gbId] as const,
  ([isOpen]) => {
    if (!isOpen) {
      destroyPlayer()
      return
    }
    playUrl.value = defaultUrlFromChannel(props.channel)
    errorText.value = ''
    playing.value = false
    loading.value = false
  }
)

onBeforeUnmount(() => {
  destroyPlayer()
})
</script>

<template>
  <el-dialog v-model="open" title="远程调阅" width="980" destroy-on-close>
    <div v-if="channel" class="space-y-3">
      <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
        <div class="text-xs text-zinc-500">上级平台 / 通道</div>
        <div class="mt-1 flex flex-wrap items-center gap-2 text-sm">
          <span class="font-semibold">{{ platform?.name || '—' }}</span>
          <span class="text-zinc-500">｜{{ channel.name }}</span>
          <span class="font-mono text-xs text-zinc-500">{{ channel.gbId }}</span>
          <el-tag :type="channel.status === '在线' ? 'success' : 'info'" size="small">{{ channel.status }}</el-tag>
        </div>
      </div>

      <div class="rounded-xl border border-zinc-200 bg-white p-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="text-xs text-zinc-500">播放控制</div>
          <div class="flex items-center gap-2">
            <el-button size="small" :loading="loading" :disabled="!playUrl" type="primary" @click="play">开始播放</el-button>
            <el-button size="small" :disabled="!playing && !loading" @click="stop">停止</el-button>
            <el-button size="small" :disabled="!playUrl" @click="retry">重试</el-button>
            <el-button size="small" :disabled="!playUrl" @click="copyUrl">复制地址</el-button>
            <el-button size="small" @click="toggleFullscreen">全屏</el-button>
          </div>
        </div>

        <div class="mt-2">
          <el-input v-model="playUrl" placeholder="粘贴可播放地址（HLS .m3u8 / FLV .flv）" />
          <div class="mt-1 text-xs text-zinc-500">默认地址按通道IP推断，可按实际转码地址覆盖。</div>
        </div>

        <div class="mt-3 overflow-hidden rounded-lg border border-zinc-200 bg-black">
          <video ref="videoRef" class="h-[420px] w-full" controls playsinline />
        </div>

        <div v-if="errorText" class="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {{ errorText }}
        </div>
        <div v-else class="mt-2 text-xs text-zinc-500">
          说明：远程调阅依赖后端将 GB28181/RTSP 转为浏览器可播放流。
        </div>
      </div>
    </div>
    <div v-else class="text-sm text-zinc-600">未选择通道</div>

    <template #footer>
      <el-button @click="open = false">关闭</el-button>
    </template>
  </el-dialog>
</template>
