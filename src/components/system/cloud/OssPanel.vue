<script setup lang="ts">
import IntegrationCard from '@/components/system/IntegrationCard.vue'
import SecretInput from '@/components/system/SecretInput.vue'

type StatusType = 'success' | 'warning' | 'danger' | 'info'

export type OssConfig = {
  enabled: boolean
  endpoint: string
  bucket: string
  region: string
  accessKeyId: string
  secretConfigured: boolean
}

const props = defineProps<{
  model: OssConfig
  statusText: string
  statusType: StatusType
  testing: boolean
  secretValue: string
}>()

const emit = defineEmits<{
  (e: 'update:model', v: OssConfig): void
  (e: 'update:secretValue', v: string): void
  (e: 'test'): void
}>()

const local = reactive<OssConfig>({ ...props.model })

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
    title="对象存储(OSS)"
    :enabled="local.enabled"
    :status-text="statusText"
    :status-type="statusType"
    :testing="testing"
    @update:enabled="(v) => (local.enabled = v)"
    @test="emit('test')"
  >
    <el-form label-width="92">
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <el-form-item label="Endpoint">
          <el-input v-model="local.endpoint" placeholder="https://oss.example.com" />
        </el-form-item>
        <el-form-item label="Region">
          <el-input v-model="local.region" placeholder="cn-demo-1" />
        </el-form-item>
        <el-form-item label="Bucket">
          <el-input v-model="local.bucket" placeholder="edge-ybox" />
        </el-form-item>
        <el-form-item label="AccessKeyId">
          <el-input v-model="local.accessKeyId" placeholder="AKIDxxxx" />
        </el-form-item>
        <el-form-item label="AccessKeySecret" class="md:col-span-2">
          <SecretInput v-model="secret" :configured="local.secretConfigured" />
        </el-form-item>
      </div>
      <div class="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
        AccessKeySecret 不回显；仅在你重新输入时更新；为空表示不修改。
      </div>
    </el-form>
  </IntegrationCard>
</template>
