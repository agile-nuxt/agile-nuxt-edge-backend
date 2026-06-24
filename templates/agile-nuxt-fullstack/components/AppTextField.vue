<script lang="ts" setup>
const props = withDefaults(
  defineProps<{
    modelValue: string | number
    label: string
    type?: 'text' | 'email' | 'password' | 'number'
    placeholder?: string
    min?: number
    required?: boolean
    disabled?: boolean
    error?: string
  }>(),
  {
    type: 'text',
    placeholder: '',
    required: false,
    disabled: false,
    error: ''
  }
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: string | number): void
}>()

const inputId = useId()

function update(event: Event): void {
  const value = (event.target as HTMLInputElement).value
  emit('update:modelValue', props.type === 'number' ? Number(value) : value)
}
</script>

<template>
  <label class="text-field" :for="inputId">
    <span class="text-field__label">{{ label }}</span>
    <input
      :id="inputId"
      class="text-field__input"
      :value="props.modelValue"
      :type="type"
      :placeholder="placeholder"
      :min="min"
      :required="required"
      :disabled="disabled"
      :aria-invalid="Boolean(error)"
      :aria-describedby="error ? `${inputId}-error` : undefined"
      @input="update"
    />
    <span v-if="error" :id="`${inputId}-error`" class="text-field__error">
      {{ error }}
    </span>
  </label>
</template>

<style scoped>
.text-field {
  display: grid;
  gap: 7px;
}

.text-field__label {
  color: var(--color-text);
  font-size: 11px;
  font-weight: 700;
}

.text-field__input {
  inline-size: 100%;
  min-block-size: 38px;
  padding-inline: 11px;
  border: 1px solid var(--color-border-strong);
  border-radius: 5px;
  color: var(--color-text);
  font: inherit;
  font-size: 13px;
  background: var(--color-page);
}

.text-field__input::placeholder {
  color: var(--color-placeholder);
}

.text-field__input:focus {
  border-color: var(--color-accent);
  outline: 3px solid var(--color-focus);
}

.text-field__input:disabled {
  cursor: not-allowed;
  background: var(--color-subtle);
}

.text-field__error {
  color: var(--color-danger);
  font-size: 10px;
}
</style>
