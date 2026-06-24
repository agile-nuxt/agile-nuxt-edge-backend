<script lang="ts" setup>
const navigation = [
  { label: 'Home', to: '/' },
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'Login', to: '/login' }
]

useHead({
  htmlAttrs: {
    dir: 'ltr',
    lang: 'en'
  },
  titleTemplate: (title) => (title ? `${title} · Agile Nuxt` : 'Agile Nuxt')
})
</script>

<template>
  <div class="app-shell" dir="ltr">
    <header class="app-header">
      <div class="app-header__inner">
        <NuxtLink class="app-brand" to="/" aria-label="Agile Nuxt home">
          <span class="app-brand__mark" aria-hidden="true">AN</span>
          <span>Agile Nuxt</span>
        </NuxtLink>

        <nav class="app-nav" aria-label="Main navigation">
          <NuxtLink
            v-for="item in navigation"
            :key="item.to"
            class="app-nav__link"
            :to="item.to"
          >
            {{ item.label }}
          </NuxtLink>
        </nav>
      </div>
    </header>

    <main class="app-main">
      <NuxtPage />
    </main>

    <footer class="app-footer">
      <div class="app-footer__inner">
        <span>Agile Nuxt Fullstack Quickstart</span>
        <span>Single-server Node deployment with persistent storage</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.app-shell {
  min-block-size: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  position: sticky;
  z-index: 20;
  inset-block-start: 0;
  border-block-end: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-page) 94%, transparent);
  backdrop-filter: blur(12px);
}

.app-header__inner,
.app-footer__inner {
  inline-size: min(100% - 40px, var(--container-width));
  min-block-size: 58px;
  margin-inline: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.app-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--color-text);
  font-size: 15px;
  font-weight: 750;
  text-decoration: none;
}

.app-brand__mark {
  inline-size: 30px;
  block-size: 30px;
  display: inline-grid;
  place-items: center;
  border-radius: 6px;
  color: #ffffff;
  font-size: 11px;
  background: var(--color-accent);
}

.app-nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.app-nav__link {
  padding: 8px 10px;
  border-radius: 5px;
  color: var(--color-muted);
  font-size: 13px;
  text-decoration: none;
}

.app-nav__link:hover,
.app-nav__link.router-link-active {
  color: var(--color-text);
  background: var(--color-subtle);
}

.app-main {
  flex: 1;
}

.app-footer {
  border-block-start: 1px solid var(--color-border);
}

.app-footer__inner {
  min-block-size: 64px;
  color: var(--color-muted);
  font-size: 11px;
}

@media (max-width: 1024px) {
  .app-header__inner,
  .app-footer__inner {
    inline-size: min(100% - 32px, var(--container-width));
  }
}

@media (max-width: 768px) {
  .app-header__inner {
    min-block-size: auto;
    padding-block: 12px;
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }

  .app-nav {
    inline-size: 100%;
  }

  .app-nav__link {
    flex: 1;
    text-align: center;
  }

  .app-footer__inner {
    padding-block: 18px;
    align-items: flex-start;
    flex-direction: column;
    justify-content: center;
    gap: 6px;
  }
}

@media (max-width: 560px) {
  .app-header__inner,
  .app-footer__inner {
    inline-size: min(100% - 24px, var(--container-width));
  }
}
</style>
