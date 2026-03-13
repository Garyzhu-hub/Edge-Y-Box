<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <el-result icon="info" title="页面不存在" sub-title="请检查地址或从左侧导航进入。">
      <template #extra>
        <el-button type="primary" @click="router.push('/dashboard')">返回运行看板</el-button>
      </template>
    </el-result>
  </div>
</template>

