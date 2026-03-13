<script setup lang="ts">
import IntegrationCard from '@/components/system/IntegrationCard.vue'
import SecretInput from '@/components/system/SecretInput.vue'

type StatusType = 'success' | 'warning' | 'danger' | 'info'

export type SipConfig = {
  enabled: boolean
  server: string
  port: number
  domain: string
  username: string
  secretConfigured: boolean
}

const props = defineProps<{
  model: SipConfig
  statusText: string
  statusType: StatusType
  testing: boolean
  secretValue: string
}>()

const emit = defineEmits<{
  (e: 'update:model', v: SipConfig): void
  (e: 'update:secretValue', v: string): void
  (e: 'test'): void
}>()

const local = reactive<SipConfig>({ ...props.model })

watch(
  () => props.model,
  (v) => {
    Object.assign(local, v)
  },
  { deep: true }
)

watch(
  () => local,
  () => emit('update:model', { ...local }),
  { deep: true }
)

const secret = computed({
  get: () => props.secretValue,
  set: (v: string) => emit('update:secretValue', v),
})
</script>

<template>
  <IntegrationCard
    title="SIP"
    :enabled="local.enabled"
    :status-text="statusText"
    :status-type="statusType"
    :testing="testing"
    @update:enabled="(v) => (local.enabled = v)"
    @test="emit('test')"
  >
    <el-form label-width="92">
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <el-form-item label="Server">
          <el-input v-model="local.server" placeholder="sip.example.com" />
        </el-form-item>
        <el-form-item label="Port">
          <el-input-number v-model="local.port" :min="1" :max="65535" class="w-full" />
        </el-form-item>
        <el-form-item label="Domain">
          <el-input v-model="local.domain" placeholder="example.com" />
        </el-form-item>
        <el-form-item label="用户名">
          <el-input v-model="local.username" placeholder="3402..." />
        </el-form-item>
        <el-form-item label="密码" class="md:col-span-2">
          <SecretInput v-model="secret" :configured="local.secretConfigured" />
        </el-form-item>
      </div>
      <div class="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
        SIP 密钥不回显；仅在你重新输入时更新；为空表示不修改。
      </div>
    </el-form>
  </IntegrationCard>
</template>
