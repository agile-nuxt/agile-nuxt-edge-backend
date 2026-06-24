<script lang="ts" setup>
const features = [
  {
    title: 'Pure TypeScript database',
    description: 'Append-only logs, snapshots, indexes, and recovery without native database modules.'
  },
  {
    title: 'Secure Nitro API',
    description: 'Schema-defined CRUD, permissions, field security, request limits, and optional auth.'
  },
  {
    title: 'Deployment ready',
    description: 'Built for one persistent Node server on Linux, macOS, VPS, or cPanel.'
  }
]

const bootEvents = [
  'storage permissions verified',
  'single-writer lock acquired',
  'snapshot loaded',
  'indexed CRUD ready'
]
</script>

<template>
  <div class="home-page page-container">
    <section class="home-hero">
      <div class="home-hero__content">
        <h1>Start a fullstack Nuxt app without external database setup</h1>
        <p>
          Nuxt 4, an embedded TypeScript database, and a secure Nitro backend in
          one copyable starter.
        </p>
        <p class="home-hero__requirement">
          Writable deployments require a persistent filesystem and one Node writer.
        </p>
        <div class="home-hero__actions">
          <NuxtLink class="button button--primary" to="/dashboard">
            Open dashboard
          </NuxtLink>
          <a
            class="text-link"
            href="https://github.com/agile-nuxt/agile-nuxt-edge-backend#readme"
          >
            Read documentation
          </a>
        </div>
      </div>

      <div class="boot-console" aria-label="Example database boot log">
        <div class="boot-console__header">
          <span>edge-db boot</span>
          <span>localhost:3000</span>
        </div>
        <pre><code>import { createDatabase } from '@agile-nuxt/edge-db'

const db = createDatabase({
  path: './storage/edge-db',
  schema
})</code></pre>
        <ul class="boot-console__events">
          <li v-for="event in bootEvents" :key="event">
            <span aria-hidden="true"></span>
            {{ event }}
          </li>
        </ul>
      </div>
    </section>

    <section class="feature-section" aria-labelledby="feature-title">
      <div class="section-heading">
        <h2 id="feature-title">A focused operational stack</h2>
        <p>Use the generated APIs immediately, then add custom Nitro routes for domain workflows.</p>
      </div>

      <div class="feature-grid">
        <article
          v-for="(feature, index) in features"
          :key="feature.title"
          class="feature-card"
        >
          <span class="feature-card__index">0{{ index + 1 }}</span>
          <h3>{{ feature.title }}</h3>
          <p>{{ feature.description }}</p>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home-page {
  padding-block: 64px 80px;
}

.home-hero {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(420px, 1.1fr);
  align-items: center;
  gap: 72px;
  min-block-size: 440px;
}

.home-hero__content {
  max-inline-size: 560px;
}

.home-hero h1 {
  max-inline-size: 520px;
  margin: 0;
  font-size: 18px;
  line-height: 1.45;
}

.home-hero p {
  margin-block: 18px 0;
  color: var(--color-muted);
  font-size: 15px;
  line-height: 1.8;
}

.home-hero .home-hero__requirement {
  margin-block-start: 12px;
  padding-inline-start: 12px;
  border-inline-start: 2px solid var(--color-accent);
  font-size: 12px;
}

.home-hero__actions {
  margin-block-start: 28px;
  display: flex;
  align-items: center;
  gap: 18px;
}

.boot-console {
  overflow: hidden;
  border: 1px solid #223138;
  border-radius: 6px;
  color: #d9e4e7;
  background: #142026;
  box-shadow: var(--shadow-medium);
}

.boot-console__header {
  min-block-size: 42px;
  padding-inline: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-block-end: 1px solid #2c3b42;
  color: #95a8ae;
  font-size: 11px;
}

.boot-console pre {
  overflow: auto;
  margin: 0;
  padding: 20px;
  border-block-end: 1px solid #2c3b42;
  font-size: 12px;
  line-height: 1.75;
}

.boot-console__events {
  margin: 0;
  padding: 16px 20px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 18px;
  list-style: none;
}

.boot-console__events li {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #b9c8cc;
  font-size: 11px;
}

.boot-console__events span {
  inline-size: 7px;
  block-size: 7px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #4ed39a;
}

.feature-section {
  padding-block-start: 72px;
}

.section-heading {
  max-inline-size: 680px;
  margin-block-end: 28px;
}

.section-heading h2 {
  margin: 0;
  font-size: 17px;
}

.section-heading p {
  margin-block: 10px 0;
  color: var(--color-muted);
  font-size: 13px;
  line-height: 1.7;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-block: 1px solid var(--color-border);
}

.feature-card {
  padding: 28px;
  border-inline-end: 1px solid var(--color-border);
}

.feature-card:last-child {
  border-inline-end: 0;
}

.feature-card__index {
  color: var(--color-accent);
  font-size: 11px;
  font-weight: 700;
}

.feature-card h3 {
  margin-block: 18px 8px;
  font-size: 14px;
}

.feature-card p {
  margin: 0;
  color: var(--color-muted);
  font-size: 12px;
  line-height: 1.75;
}

@media (max-width: 1024px) {
  .home-hero {
    grid-template-columns: 1fr 1fr;
    gap: 40px;
  }
}

@media (max-width: 768px) {
  .home-page {
    padding-block-start: 40px;
  }

  .home-hero {
    grid-template-columns: 1fr;
    min-block-size: 0;
  }

  .home-hero__content {
    max-inline-size: none;
  }

  .feature-grid {
    grid-template-columns: 1fr;
  }

  .feature-card {
    border-inline-end: 0;
    border-block-end: 1px solid var(--color-border);
  }

  .feature-card:last-child {
    border-block-end: 0;
  }
}

@media (max-width: 560px) {
  .home-hero__actions {
    align-items: stretch;
    flex-direction: column;
  }

  .home-hero__actions .button {
    inline-size: 100%;
  }

  .boot-console__events {
    grid-template-columns: 1fr;
  }
}
</style>
