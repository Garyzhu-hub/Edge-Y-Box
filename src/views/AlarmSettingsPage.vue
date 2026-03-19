<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, reactive, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { appendManualLog } from '@/utils/logsMock'
import { clearAlarmPushJobs, loadAlarmPushJobs, retryAlarmPushJob, type AlarmPushJob } from '@/utils/alarmPushCenter'
import { formatDateTime } from '@/stores/app'

type AlarmLevel = '一般' | '警告' | '严重' | '紧急'

type Person = {
  id: string
  name: string
  phone: string
  dept: string
}

type Persisted = {
  popupDurationSec: number
  cloudPushWorkOrdersOnly: boolean
  imagePushEnabled: boolean
  notify: Record<AlarmLevel, string[]>
  policy: Record<
    AlarmLevel,
    {
      cloudPush: boolean
      popup: boolean
      sound: boolean
      sms: boolean
      phone: boolean
    }
  >
}

const STORAGE_KEY = 'edge_alarm_settings_v1'
const PEOPLE_KEY = 'edge_people_v1'

const auth = useAuthStore()
auth.loadFromStorage()

const canEdit = computed(() => auth.role === 'super_admin')

function loadPeopleFromStorage(): Person[] {
  try {
    const raw = window.localStorage.getItem(PEOPLE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return (parsed as any[])
      .filter((x) => x && typeof x.id === 'string' && typeof x.name === 'string')
      .map((x) => ({
        id: String(x.id),
        name: String(x.name),
        phone: typeof x.phone === 'string' ? x.phone : '',
        dept: typeof x.dept === 'string' ? x.dept : '未分组',
      }))
  } catch {
    return []
  }
}

const people = ref<Person[]>(
  loadPeopleFromStorage().length
    ? loadPeopleFromStorage()
    : [
        { id: 'u_admin', name: 'admin', phone: '13800000000', dept: '平台' },
        { id: 'u_ops1', name: '值班A', phone: '13800000001', dept: '运维' },
        { id: 'u_ops2', name: '值班B', phone: '13800000002', dept: '运维' },
        { id: 'u_sec', name: '安保队长', phone: '13800000003', dept: '安保' },
        { id: 'u_mgr', name: '项目经理', phone: '13800000004', dept: '项目' },
      ]
)

const form = reactive<Persisted>({
  popupDurationSec: 10,
  cloudPushWorkOrdersOnly: false,
  imagePushEnabled: true,
  notify: {
    一般: [],
    警告: ['u_ops1'],
    严重: ['u_admin', 'u_ops1'],
    紧急: ['u_admin', 'u_ops1'],
  },
  policy: {
    一般: { cloudPush: true, popup: false, sound: false, sms: false, phone: false },
    警告: { cloudPush: true, popup: false, sound: false, sms: false, phone: false },
    严重: { cloudPush: true, popup: true, sound: true, sms: false, phone: false },
    紧急: { cloudPush: true, popup: true, sound: true, sms: true, phone: true },
  },
})

function loadPersisted() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Partial<Persisted>
    if (typeof parsed.popupDurationSec === 'number') form.popupDurationSec = parsed.popupDurationSec
    if (typeof parsed.cloudPushWorkOrdersOnly === 'boolean') form.cloudPushWorkOrdersOnly = parsed.cloudPushWorkOrdersOnly
    if (typeof parsed.imagePushEnabled === 'boolean') form.imagePushEnabled = parsed.imagePushEnabled

    const pNotify: any = (parsed as any).notify
    if (pNotify) {
      const hasNew = ['一般', '警告', '严重', '紧急'].some((k) => Array.isArray(pNotify[k]))
      const hasOld = ['高', '中', '低'].some((k) => Array.isArray(pNotify[k]))
      if (hasNew) {
        form.notify.一般 = Array.isArray(pNotify.一般) ? (pNotify.一般 as string[]) : form.notify.一般
        form.notify.警告 = Array.isArray(pNotify.警告) ? (pNotify.警告 as string[]) : form.notify.警告
        form.notify.严重 = Array.isArray(pNotify.严重) ? (pNotify.严重 as string[]) : form.notify.严重
        form.notify.紧急 = Array.isArray(pNotify.紧急) ? (pNotify.紧急 as string[]) : form.notify.紧急
      } else if (hasOld) {
        const hi = Array.isArray(pNotify.高) ? (pNotify.高 as string[]) : []
        const mid = Array.isArray(pNotify.中) ? (pNotify.中 as string[]) : []
        const low = Array.isArray(pNotify.低) ? (pNotify.低 as string[]) : []
        if (hi.length) {
          form.notify.严重 = hi
          form.notify.紧急 = hi
        }
        if (mid.length) form.notify.警告 = mid
        if (low.length) form.notify.一般 = low
      }
    }

    const pPolicy: any = (parsed as any).policy
    if (pPolicy && typeof pPolicy === 'object') {
      const levels: AlarmLevel[] = ['一般', '警告', '严重', '紧急']
      for (const lv of levels) {
        const row = pPolicy[lv]
        if (!row || typeof row !== 'object') continue
        form.policy[lv] = {
          cloudPush: typeof row.cloudPush === 'boolean' ? row.cloudPush : form.policy[lv].cloudPush,
          popup: typeof row.popup === 'boolean' ? row.popup : form.policy[lv].popup,
          sound: typeof row.sound === 'boolean' ? row.sound : form.policy[lv].sound,
          sms: typeof row.sms === 'boolean' ? row.sms : form.policy[lv].sms,
          phone: typeof row.phone === 'boolean' ? row.phone : form.policy[lv].phone,
        }
      }
    }
  } catch {
    return
  }
}

loadPersisted()

function savePersisted() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(form))
}

const saving = ref(false)

const pushLoading = ref(false)
const pushJobs = ref<AlarmPushJob[]>([])
const pushDetailOpen = ref(false)
const pushDetail = ref<AlarmPushJob | null>(null)

async function refreshPushJobs() {
  pushLoading.value = true
  try {
    await new Promise((r) => setTimeout(r, 120))
    pushJobs.value = loadAlarmPushJobs().slice(0, 50)
  } finally {
    pushLoading.value = false
  }
}

function openPushDetail(job: AlarmPushJob) {
  pushDetail.value = job
  pushDetailOpen.value = true
}

function channelLabel(ch: AlarmPushJob['channel']) {
  if (ch === 'cloudPush') return '云端推送'
  if (ch === 'sms') return '短信'
  return '电话'
}

function statusTagType(s: AlarmPushJob['status']) {
  if (s === '成功') return 'success'
  if (s === '失败') return 'danger'
  if (s === '发送中') return 'warning'
  return 'info'
}

async function onRetry(job: AlarmPushJob) {
  pushLoading.value = true
  try {
    await new Promise((r) => setTimeout(r, 120))
    const r = retryAlarmPushJob(job.id)
    if (!r.ok) {
      ElMessage.error(r.message)
      return
    }
    ElMessage.success(`已重试：${r.status}`)
    refreshPushJobs()
  } finally {
    pushLoading.value = false
  }
}

async function onClearPushJobs() {
  const confirmed = await ElMessageBox.confirm('确认清空推送任务记录？（演示）', '清空确认', {
    type: 'warning',
    confirmButtonText: '清空',
    cancelButtonText: '取消',
  })
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return
  clearAlarmPushJobs()
  ElMessage.success('已清空推送任务（演示）')
  refreshPushJobs()
}

refreshPushJobs()

const levelRows = computed(() => {
  const rows: { level: AlarmLevel; tips: string }[] = [
    { level: '一般', tips: '默认：仅云端推送' },
    { level: '警告', tips: '默认：仅云端推送' },
    { level: '严重', tips: '默认：云端推送 + 弹屏 + 声音' },
    { level: '紧急', tips: '默认：云端推送 + 弹屏 + 声音 + 短信/电话' },
  ]
  return rows
})

const effectsSummary = computed(() => {
  const levels: AlarmLevel[] = ['一般', '警告', '严重', '紧急']
  return levels
    .map((lv) => {
      const p = form.policy[lv]
      const parts = [p.cloudPush ? '云端推送' : null, p.popup ? '弹屏' : null, p.sound ? '声音' : null, p.sms ? '短信' : null, p.phone ? '电话' : null]
        .filter(Boolean)
        .join('+')
      return `${lv}:${parts || '无'}`
    })
    .join('；')
})

function peopleLabel(userId: string) {
  const u = people.value.find((x) => x.id === userId)
  return u ? `${u.name}（${u.dept}）` : userId
}

async function onSave() {
  if (!canEdit.value) {
    ElMessage.warning('仅超级管理员可编辑')
    return
  }
  saving.value = true
  try {
    await new Promise((r) => setTimeout(r, 260))
    savePersisted()
    appendManualLog({
      kind: 'operation',
      tsMs: Date.now(),
      level: 'info',
      module: '报警设置',
      action: '保存',
      summary: '报警设置已保存（占位）',
      operator: auth.username,
      ip: '127.0.0.1',
      requestId: `alarm_settings_save_${Date.now()}`,
      detail: {
        popupDurationSec: form.popupDurationSec,
        cloudPushWorkOrdersOnly: form.cloudPushWorkOrdersOnly,
        imagePushEnabled: form.imagePushEnabled,
        notify: form.notify,
      },
    })
    ElMessage.success('已保存（占位）')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div class="text-base font-semibold">报警设置</div>
        <div class="mt-1 text-xs text-zinc-500">通知人员、弹屏、云端推送策略配置（演示）。</div>
      </div>
      <div class="flex items-center gap-2">
        <el-button type="primary" :disabled="!canEdit" :loading="saving" @click="onSave">保存</el-button>
      </div>
    </div>

    <div v-if="!canEdit" class="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
      当前角色仅可查看，切换为 <span class="font-mono">super_admin</span> 后可编辑。
    </div>

    <el-card>
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm font-semibold">通知人员（按等级）</div>
          <div class="mt-1 text-xs text-zinc-500">为不同告警等级配置不同通知人员。</div>
        </div>
      </div>
      <div class="mt-3">
        <el-table :data="levelRows" size="small" class="table-standard" height="220">
          <el-table-column prop="level" label="告警等级" width="120" />
          <el-table-column label="通知人员" min-width="380">
            <template #default="scope">
              <el-select
                v-model="form.notify[scope.row.level]"
                multiple
                filterable
                collapse-tags
                collapse-tags-tooltip
                placeholder="选择人员"
                class="w-full"
                :disabled="!canEdit"
              >
                <el-option
                  v-for="p in people"
                  :key="p.id"
                  :label="`${p.name}（${p.dept}）`"
                  :value="p.id"
                >
                  <div class="flex items-center justify-between">
                    <span>{{ p.name }}（{{ p.dept }}）</span>
                    <span class="font-mono text-xs text-zinc-500">{{ p.phone }}</span>
                  </div>
                </el-option>
              </el-select>
            </template>
          </el-table-column>
          <el-table-column prop="tips" label="备注" min-width="180" />
        </el-table>
      </div>
      <div class="mt-2 text-xs text-zinc-500">
        当前配置：一般={{ form.notify.一般.map(peopleLabel).join('、') || '无' }}；警告={{
          form.notify.警告.map(peopleLabel).join('、') || '无'
        }}；严重={{ form.notify.严重.map(peopleLabel).join('、') || '无' }}；紧急={{
          form.notify.紧急.map(peopleLabel).join('、') || '无'
        }}
      </div>
    </el-card>

    <el-card>
      <div>
        <div class="text-sm font-semibold">等级联动配置</div>
        <div class="mt-1 text-xs text-zinc-500">配置不同告警等级的弹屏/声音/短信/电话等策略。</div>
      </div>
      <div class="mt-3">
        <el-table :data="levelRows" size="small" class="table-standard" height="260">
          <el-table-column prop="level" label="告警等级" width="120" />
          <el-table-column label="云端推送" width="110">
            <template #default="scope">
              <el-switch v-model="form.policy[scope.row.level].cloudPush" :disabled="!canEdit" />
            </template>
          </el-table-column>
          <el-table-column label="弹屏" width="90">
            <template #default="scope">
              <el-switch v-model="form.policy[scope.row.level].popup" :disabled="!canEdit" />
            </template>
          </el-table-column>
          <el-table-column label="声音" width="90">
            <template #default="scope">
              <el-switch v-model="form.policy[scope.row.level].sound" :disabled="!canEdit" />
            </template>
          </el-table-column>
          <el-table-column label="短信" width="90">
            <template #default="scope">
              <el-switch v-model="form.policy[scope.row.level].sms" :disabled="!canEdit" />
            </template>
          </el-table-column>
          <el-table-column label="电话" width="90">
            <template #default="scope">
              <el-switch v-model="form.policy[scope.row.level].phone" :disabled="!canEdit" />
            </template>
          </el-table-column>
          <el-table-column prop="tips" label="备注" min-width="220" />
        </el-table>
      </div>
      <div class="mt-2 text-xs text-zinc-500">当前策略：{{ effectsSummary }}</div>
    </el-card>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <el-card>
        <div>
          <div class="text-sm font-semibold">弹屏配置</div>
          <div class="mt-1 text-xs text-zinc-500">配置告警弹屏展示时长。</div>
        </div>
        <div class="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <div class="text-xs text-zinc-500">弹屏时长（秒）</div>
            <el-input-number
              v-model="form.popupDurationSec"
              :min="3"
              :max="120"
              :step="1"
              class="mt-1 w-full"
              :disabled="!canEdit"
            />
          </div>
          <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
            说明：弹屏时长仅影响前端展示（演示）。
          </div>
        </div>
      </el-card>

      <el-card>
        <div>
          <div class="text-sm font-semibold">云端推送策略</div>
          <div class="mt-1 text-xs text-zinc-500">控制是否推送到云端（仅推工单）。</div>
        </div>
        <div class="mt-3 space-y-3">
          <div class="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <div>
              <div class="text-sm font-semibold">云端推送（仅推工单）</div>
              <div class="mt-1 text-xs text-zinc-500">开启后仅把工单推送至云端，不推原始告警流。</div>
            </div>
            <el-switch v-model="form.cloudPushWorkOrdersOnly" :disabled="!canEdit" />
          </div>

          <div class="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <div>
              <div class="text-sm font-semibold">图片推送策略</div>
              <div class="mt-1 text-xs text-zinc-500">开启后推送工单时携带抓拍图片（演示）。</div>
            </div>
            <el-switch v-model="form.imagePushEnabled" :disabled="!canEdit" />
          </div>
        </div>
      </el-card>
    </div>

    <el-card>
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm font-semibold">推送任务（演示）</div>
          <div class="mt-1 text-xs text-zinc-500">展示云端推送/短信/电话推送的任务结果，可重试失败记录。</div>
        </div>
        <div class="flex items-center gap-2">
          <el-button :loading="pushLoading" @click="refreshPushJobs">刷新</el-button>
          <el-button :disabled="!pushJobs.length" :loading="pushLoading" @click="onClearPushJobs">清空</el-button>
        </div>
      </div>

      <div class="mt-3">
        <el-table :data="pushJobs" size="small" height="360" class="table-standard" v-loading="pushLoading">
          <el-table-column label="时间" width="170">
            <template #default="scope">
              <span class="text-xs text-zinc-600">{{ formatDateTime(scope.row.createdAtMs) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="通道" width="110">
            <template #default="scope">
              <span class="text-xs">{{ channelLabel(scope.row.channel) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="scope">
              <el-tag :type="statusTagType(scope.row.status)" size="small">{{ scope.row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="重试" width="70">
            <template #default="scope">
              <el-button link type="primary" size="small" :disabled="scope.row.status !== '失败'" @click="onRetry(scope.row)">
                重试
              </el-button>
            </template>
          </el-table-column>
          <el-table-column label="告警" min-width="210">
            <template #default="scope">
              <div class="truncate text-xs" :title="scope.row.alarmType">{{ scope.row.alarmType }}</div>
              <div class="font-mono text-xs text-zinc-500">{{ scope.row.detectionId }}</div>
            </template>
          </el-table-column>
          <el-table-column label="目标" min-width="180">
            <template #default="scope">
              <span class="font-mono text-xs">{{ (scope.row.targets || []).join(', ') || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="message" label="结果" min-width="160" />
          <el-table-column label="操作" width="90" fixed="right">
            <template #default="scope">
              <el-button link type="primary" size="small" @click="openPushDetail(scope.row)">详情</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div class="mt-2 text-xs text-zinc-500">
        提示：推送链路为演示，真实接入应由后端/网关负责发送、回执、重试与签名校验。
      </div>
    </el-card>

    <el-drawer v-model="pushDetailOpen" title="推送任务详情" size="520px">
      <div v-if="pushDetail" class="space-y-3 text-sm">
        <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <div class="text-xs text-zinc-500">基本信息</div>
          <div class="mt-1 space-y-1">
            <div>
              <span class="text-xs text-zinc-500">任务ID：</span>
              <span class="font-mono text-xs">{{ pushDetail.id }}</span>
            </div>
            <div>
              <span class="text-xs text-zinc-500">创建时间：</span>
              <span class="text-xs text-zinc-700">{{ formatDateTime(pushDetail.createdAtMs) }}</span>
            </div>
            <div>
              <span class="text-xs text-zinc-500">通道：</span>
              <span class="text-xs text-zinc-700">{{ channelLabel(pushDetail.channel) }}</span>
            </div>
            <div>
              <span class="text-xs text-zinc-500">状态：</span>
              <el-tag :type="statusTagType(pushDetail.status)" size="small">{{ pushDetail.status }}</el-tag>
            </div>
            <div>
              <span class="text-xs text-zinc-500">重试次数：</span>
              <span class="text-xs text-zinc-700">{{ pushDetail.attempt }}</span>
            </div>
            <div>
              <span class="text-xs text-zinc-500">最后尝试时间：</span>
              <span class="text-xs text-zinc-700">
                {{ pushDetail.lastAttemptAtMs ? formatDateTime(pushDetail.lastAttemptAtMs) : '—' }}
              </span>
            </div>
          </div>
        </div>

        <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <div class="text-xs text-zinc-500">告警信息</div>
          <div class="mt-1 space-y-1">
            <div>
              <span class="text-xs text-zinc-500">检测ID：</span>
              <span class="font-mono text-xs">{{ pushDetail.detectionId }}</span>
            </div>
            <div>
              <span class="text-xs text-zinc-500">告警ID：</span>
              <span class="font-mono text-xs">{{ pushDetail.alarmId }}</span>
            </div>
            <div>
              <span class="text-xs text-zinc-500">工单号：</span>
              <span class="font-mono text-xs">{{ pushDetail.workOrderId || '—' }}</span>
            </div>
            <div>
              <span class="text-xs text-zinc-500">告警类型：</span>
              <span class="text-xs text-zinc-700">{{ pushDetail.alarmType }}</span>
            </div>
            <div>
              <span class="text-xs text-zinc-500">告警等级：</span>
              <span class="text-xs text-zinc-700">{{ pushDetail.level }}</span>
            </div>
            <div>
              <span class="text-xs text-zinc-500">摄像头：</span>
              <span class="text-xs text-zinc-700">{{ pushDetail.cameraLabel }}</span>
            </div>
          </div>
        </div>

        <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <div class="text-xs text-zinc-500">目标与结果</div>
          <div class="mt-1 space-y-1">
            <div>
              <span class="text-xs text-zinc-500">目标：</span>
              <span class="font-mono text-xs">{{ pushDetail.targets.join(', ') || '—' }}</span>
            </div>
            <div>
              <span class="text-xs text-zinc-500">结果：</span>
              <span class="text-xs text-zinc-700">{{ pushDetail.message }}</span>
            </div>
          </div>
        </div>

        <div
          v-if="pushDetail.sourceUrl || pushDetail.analyzedUrl"
          class="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-500"
        >
          <div>图片链接（仅云端推送且开启图片推送时保存）：</div>
          <div class="mt-1 space-y-1">
            <div v-if="pushDetail.sourceUrl">
              <span class="text-zinc-500">原始图：</span>
              <span class="font-mono break-all">{{ pushDetail.sourceUrl }}</span>
            </div>
            <div v-if="pushDetail.analyzedUrl">
              <span class="text-zinc-500">分析图：</span>
              <span class="font-mono break-all">{{ pushDetail.analyzedUrl }}</span>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="text-xs text-zinc-500">暂无任务详情</div>
    </el-drawer>
  </div>
</template>
