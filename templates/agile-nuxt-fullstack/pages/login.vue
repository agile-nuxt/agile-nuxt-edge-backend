<script lang="ts" setup>
const authEnabled = false
</script>

<template>
  <div class="login-page page-container">
    <section class="login-layout">
      <div class="login-copy">
        <h1>Optional authentication</h1>
        <p>
          Authentication is disabled by default so the starter runs immediately.
          Enable JWT auth in <code>nuxt.config.ts</code> when your application needs accounts.
        </p>
        <ol>
          <li>Add a schema-defined users entity.</li>
          <li>Set strong access and refresh token secrets.</li>
          <li>Replace <code>auth: false</code> with the documented auth config.</li>
          <li>Set <code>authEnabled</code> on this page to <code>true</code>.</li>
        </ol>

        <pre><code>auth: {
  enabled: true,
  accessTokenSecret: process.env.ACCESS_TOKEN_SECRET!,
  refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET!
}</code></pre>
      </div>

      <AppLoginForm :enabled="authEnabled" />
    </section>
  </div>
</template>

<style scoped>
.login-page {
  padding-block: 72px 88px;
}

.login-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(340px, 0.7fr);
  align-items: start;
  gap: 80px;
}

.login-copy {
  max-inline-size: 620px;
}

.login-copy h1 {
  margin: 0;
  font-size: 18px;
}

.login-copy p,
.login-copy li {
  color: var(--color-muted);
  font-size: 13px;
  line-height: 1.8;
}

.login-copy p {
  margin-block: 16px 0;
}

.login-copy ol {
  margin-block: 24px;
  padding-inline-start: 20px;
}

.login-copy pre {
  overflow: auto;
  margin: 0;
  padding: 18px;
  border: 1px solid #26363c;
  border-radius: 6px;
  color: #dce7e9;
  font-size: 12px;
  line-height: 1.7;
  background: #152126;
}

.login-copy code:not(pre code) {
  color: var(--color-text);
  font-size: 12px;
}

@media (max-width: 1024px) {
  .login-layout {
    gap: 44px;
  }
}

@media (max-width: 768px) {
  .login-page {
    padding-block-start: 44px;
  }

  .login-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .login-page {
    padding-block-start: 32px;
  }
}
</style>
