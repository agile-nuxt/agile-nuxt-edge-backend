<script
  lang="ts"
  setup
  generic="TRow extends Record<string, unknown>"
>
export interface EntityColumn {
  key: string
  label: string
}

defineProps<{
  rows: TRow[]
  columns: EntityColumn[]
  rowKey: string
  loading?: boolean
  error?: string
}>()
</script>

<template>
  <div class="entity-table">
    <div v-if="loading" class="entity-table__state" role="status">
      Loading records…
    </div>

    <div v-else-if="error" class="entity-table__state entity-table__state--error" role="alert">
      {{ error }}
    </div>

    <div v-else-if="rows.length === 0" class="entity-table__state">
      No records yet. Add the first item using the form above.
    </div>

    <div v-else class="entity-table__scroll">
      <table>
        <thead>
          <tr>
            <th v-for="column in columns" :key="column.key" scope="col">
              {{ column.label }}
            </th>
            <th class="entity-table__actions-heading" scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="String(row[rowKey])">
            <td v-for="column in columns" :key="column.key">
              <slot
                :name="`cell-${column.key}`"
                :row="row"
                :value="row[column.key]"
              >
                {{ row[column.key] }}
              </slot>
            </td>
            <td class="entity-table__actions">
              <slot name="actions" :row="row"></slot>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.entity-table {
  border-block: 1px solid var(--color-border);
}

.entity-table__scroll {
  overflow-x: auto;
}

table {
  inline-size: 100%;
  min-inline-size: 720px;
  border-collapse: collapse;
}

th,
td {
  padding: 14px 12px;
  border-block-end: 1px solid var(--color-border);
  font-size: 12px;
  text-align: start;
  vertical-align: middle;
}

th {
  color: var(--color-muted);
  font-size: 10px;
  font-weight: 750;
  text-transform: uppercase;
}

tbody tr:last-child td {
  border-block-end: 0;
}

tbody tr:hover {
  background: var(--color-subtle);
}

.entity-table__actions-heading,
.entity-table__actions {
  text-align: end;
}

.entity-table__state {
  min-block-size: 150px;
  padding: 28px;
  display: grid;
  place-items: center;
  color: var(--color-muted);
  font-size: 12px;
  text-align: center;
}

.entity-table__state--error {
  color: var(--color-danger);
}

@media (max-width: 768px) {
  th,
  td {
    padding-block: 12px;
  }
}
</style>
