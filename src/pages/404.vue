<script setup lang="ts">
definePage({
  meta: {
    title: '404',
  },
})
</script>

<template>
  <main class="h-full flex flex-col items-center justify-center gap-4 text-center">
    <div class="text-6xl font-bold text-gray-300">404</div>
    <div class="text-lg text-gray-500">页面不存在</div>
    <router-link to="/" class="text-blue-500 hover:underline">返回首页</router-link>
  </main>
</template>
