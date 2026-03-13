<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <el-result
      icon="warning"
      title="无权限访问"
      sub-title="当前账号缺少访问该页面的权限（权限逻辑为占位，后续接入真实鉴权）。"
    >
      <template #extra>
        <el-button type="primary" @click="router.push('/dashboard')">返回运行看板</el-button>
      </template>
    </el-result>
  </div>
</template>

