<script lang="ts" setup>
const props = withDefaults(
  defineProps<{
    enabled?: boolean
  }>(),
  {
    enabled: false
  }
)

const auth = useBackendAuth()
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit(): Promise<void> {
  if (!props.enabled) {
    error.value = 'Enable auth in nuxt.config.ts before using this form.'
    return
  }
  loading.value = true
  error.value = ''
  try {
    await auth.login({ email: email.value, password: password.value })
    await navigateTo('/dashboard')
  } catch {
    error.value = 'Login failed. Check the credentials and auth configuration.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="login-form" aria-labelledby="login-form-title">
    <div class="login-form__header">
      <h2 id="login-form-title">Sign in</h2>
      <p>
        {{ enabled ? 'Use an account created by your auth-enabled backend.' : 'Auth is disabled in this starter.' }}
      </p>
    </div>

    <form @submit.prevent="submit">
      <AppTextField
        v-model="email"
        label="Email"
        type="email"
        placeholder="admin@example.com"
        :disabled="!enabled"
        required
      />
      <AppTextField
        v-model="password"
        label="Password"
        type="password"
        placeholder="At least 10 characters"
        :disabled="!enabled"
        required
      />
      <p v-if="error" class="login-form__error" role="alert">{{ error }}</p>
      <p v-else-if="!enabled" class="login-form__notice">
        Enable auth in <code>nuxt.config.ts</code> to activate this form.
      </p>
      <AppButton type="submit" :busy="loading" :disabled="!enabled">
        Sign in
      </AppButton>
    </form>
  </section>
</template>

<style scoped>
.login-form {
  padding: 24px;
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  background: var(--color-page);
  box-shadow: var(--shadow-soft);
}

.login-form__header {
  margin-block-end: 22px;
}

.login-form h2 {
  margin: 0;
  font-size: 16px;
}

.login-form__header p,
.login-form__notice,
.login-form__error {
  margin-block: 8px 0;
  font-size: 11px;
  line-height: 1.65;
}

.login-form__header p,
.login-form__notice {
  color: var(--color-muted);
}

.login-form__error {
  color: var(--color-danger);
}

.login-form form {
  display: grid;
  gap: 16px;
}

.login-form code {
  color: var(--color-text);
  font-size: 10px;
}

.login-form :deep(.app-button) {
  inline-size: 100%;
}
</style>
