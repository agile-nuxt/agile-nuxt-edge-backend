<script lang="ts" setup>
const products = useBackendEntity('products')
const { data } = await useAsyncData('products', () => products.list({ limit: 20 }))
</script>

<template>
  <main class="playground" dir="rtl">
    <section class="playground__content">
      <h1>محصولات</h1>
      <p>تعداد رکوردها: {{ data?.data.length ?? 0 }}</p>
    </section>
  </main>
</template>

<style scoped>
.playground {
  --page-background: #f5f7f8;
  --text-color: #182225;

  min-block-size: 100vh;
  padding: 48px 24px;
  color: var(--text-color);
  font-family: "Peyda", "Yekan Bakh", "IRANSansX", "Vazirmatn", sans-serif;
  background: var(--page-background);
}

.playground__content {
  inline-size: min(100%, 960px);
  margin-inline: auto;
}

.playground h1 {
  margin-block: 0 12px;
  font-size: 18px;
}

.playground p {
  margin: 0;
  font-size: 14px;
}

@media (max-width: 1024px) {
  .playground {
    padding-inline: 20px;
  }
}

@media (max-width: 768px) {
  .playground {
    padding-block: 32px;
  }
}

@media (max-width: 560px) {
  .playground {
    padding-inline: 16px;
  }
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition: none !important;
    scroll-behavior: auto !important;
  }
}
</style>
