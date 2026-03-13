<script setup lang="ts">
import { useCounterStore } from '@/stores/counter'
import { storeToRefs } from 'pinia'

const counterStore = useCounterStore()
const { count, doubleCount } = storeToRefs(counterStore)
const { increment } = counterStore
</script>

<template>
  <div class="container mx-auto p-4">
    <el-card class="max-w-md mx-auto mt-10">
      <template #header>
        <div class="card-header flex justify-between items-center">
          <span class="font-bold text-lg">Vue 3 + Element Plus Demo</span>
        </div>
      </template>
      <div class="text-center">
        <p class="mb-4">Count: {{ count }}</p>
        <p class="mb-4">Double Count: {{ doubleCount }}</p>
        <el-button type="primary" @click="increment">Increment</el-button>
        <el-button type="success" plain>Success Button</el-button>
      </div>
    </el-card>
  </div>
</template>
