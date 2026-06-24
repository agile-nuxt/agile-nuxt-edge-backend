<script lang="ts" setup>
withDefaults(
  defineProps<{
    type?: 'button' | 'submit'
    variant?: 'primary' | 'secondary' | 'danger'
    size?: 'default' | 'small'
    disabled?: boolean
    busy?: boolean
  }>(),
  {
    type: 'button',
    variant: 'primary',
    size: 'default',
    disabled: false,
    busy: false
  }
)

defineEmits<{
  (event: 'click', value: MouseEvent): void
}>()
</script>

<template>
  <button
    class="app-button"
    :class="[`app-button--${variant}`, `app-button--${size}`]"
    :type="type"
    :disabled="disabled || busy"
    @click="$emit('click', $event)"
  >
    <span v-if="busy" class="app-button__spinner" aria-hidden="true"></span>
    <slot />
  </button>
</template>

<style scoped>
.app-button {
  min-block-size: 38px;
  padding-inline: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid transparent;
  border-radius: 5px;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.app-button--primary {
  color: #ffffff;
  background: var(--color-accent);
}

.app-button--primary:hover:not(:disabled) {
  background: var(--color-accent-strong);
}

.app-button--secondary {
  border-color: var(--color-border-strong);
  color: var(--color-text);
  background: var(--color-page);
}

.app-button--secondary:hover:not(:disabled) {
  background: var(--color-subtle);
}

.app-button--danger {
  border-color: #f2c5bf;
  color: var(--color-danger);
  background: #fff8f7;
}

.app-button--danger:hover:not(:disabled) {
  background: #ffefed;
}

.app-button--small {
  min-block-size: 30px;
  padding-inline: 9px;
  font-size: 11px;
}

.app-button:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

.app-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.app-button__spinner {
  inline-size: 13px;
  block-size: 13px;
  border: 2px solid currentColor;
  border-block-start-color: transparent;
  border-radius: 50%;
  animation: spin 700ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
