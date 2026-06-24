<script lang="ts" setup>
const {
  products,
  loading,
  error,
  list,
  createProduct,
  updateStatus,
  deleteProduct
} = useProductsDemo()

const title = ref('')
const price = ref('')
const creating = ref(false)

const columns = [
  { key: 'title', label: 'Product' },
  { key: 'price', label: 'Price' },
  { key: 'status', label: 'Status' },
  { key: 'createdAt', label: 'Created' }
]

function formatPrice(value: unknown): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(Number(value))
}

function formatDate(value: unknown): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium'
  }).format(new Date(String(value)))
}

async function submitProduct(): Promise<void> {
  const numericPrice = Number(price.value)
  if (!title.value.trim() || !Number.isInteger(numericPrice) || numericPrice < 0) return
  creating.value = true
  try {
    await createProduct({
      title: title.value.trim(),
      price: numericPrice,
      description: null
    })
    title.value = ''
    price.value = ''
  } finally {
    creating.value = false
  }
}

onMounted(list)
</script>

<template>
  <div class="dashboard-page page-container">
    <header class="dashboard-header">
      <div>
        <h1>Product dashboard</h1>
        <p>Create products, update their status, and remove records through the generated Nitro API.</p>
      </div>
      <span class="dashboard-header__mode">No-auth demo</span>
    </header>

    <section class="product-create" aria-labelledby="create-product-title">
      <div class="product-create__heading">
        <h2 id="create-product-title">Add a product</h2>
        <p>Data is stored under the configured persistent edge-db path.</p>
      </div>

      <form class="product-create__form" @submit.prevent="submitProduct">
        <AppTextField
          v-model="title"
          label="Product name"
          placeholder="Service plan"
          required
        />
        <AppTextField
          v-model="price"
          label="Price in USD"
          type="number"
          placeholder="120"
          :min="0"
          required
        />
        <AppButton type="submit" :busy="creating">
          Add product
        </AppButton>
      </form>
    </section>

    <section class="product-list" aria-labelledby="product-list-title">
      <div class="product-list__header">
        <div>
          <h2 id="product-list-title">Products</h2>
          <p>{{ products.length }} record{{ products.length === 1 ? '' : 's' }}</p>
        </div>
        <AppButton variant="secondary" :busy="loading" @click="list">
          Refresh
        </AppButton>
      </div>

      <AppEntityTable
        :rows="products"
        :columns="columns"
        :loading="loading"
        :error="error"
        row-key="id"
      >
        <template #cell-price="{ row }">
          {{ formatPrice(row.price) }}
        </template>

        <template #cell-status="{ row }">
          <span
            class="status-swatch"
            :class="`status-swatch--${row.status}`"
          >
            {{ row.status }}
          </span>
        </template>

        <template #cell-createdAt="{ row }">
          {{ formatDate(row.createdAt) }}
        </template>

        <template #actions="{ row }">
          <div class="row-actions">
            <AppButton
              variant="secondary"
              size="small"
              @click="updateStatus(String(row.id), row.status === 'active' ? 'archived' : 'active')"
            >
              {{ row.status === 'active' ? 'Archive' : 'Activate' }}
            </AppButton>
            <AppButton
              variant="danger"
              size="small"
              @click="deleteProduct(String(row.id))"
            >
              Delete
            </AppButton>
          </div>
        </template>
      </AppEntityTable>
    </section>
  </div>
</template>

<style scoped>
.dashboard-page {
  padding-block: 48px 80px;
}

.dashboard-header,
.product-list__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}

.dashboard-header {
  padding-block-end: 28px;
  border-block-end: 1px solid var(--color-border);
}

.dashboard-header h1,
.product-create h2,
.product-list h2 {
  margin: 0;
  font-size: 18px;
}

.dashboard-header p,
.product-create p,
.product-list p {
  margin-block: 8px 0;
  color: var(--color-muted);
  font-size: 12px;
  line-height: 1.7;
}

.dashboard-header__mode {
  padding: 6px 9px;
  border: 1px solid var(--color-border-strong);
  border-radius: 5px;
  color: var(--color-muted);
  font-size: 11px;
  white-space: nowrap;
}

.product-create {
  padding-block: 32px;
  display: grid;
  grid-template-columns: minmax(220px, 0.6fr) minmax(0, 1.4fr);
  align-items: end;
  gap: 40px;
  border-block-end: 1px solid var(--color-border);
}

.product-create__form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(160px, 0.6fr) auto;
  align-items: end;
  gap: 12px;
}

.product-list {
  padding-block-start: 32px;
}

.product-list__header {
  margin-block-end: 18px;
  align-items: center;
}

.status-swatch {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--color-muted);
  font-size: 11px;
  text-transform: capitalize;
}

.status-swatch::before {
  inline-size: 7px;
  block-size: 7px;
  border-radius: 50%;
  background: var(--color-muted);
  content: "";
}

.status-swatch--active::before {
  background: var(--color-accent);
}

.status-swatch--archived::before {
  background: var(--color-warning);
}

.row-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 1024px) {
  .product-create {
    grid-template-columns: 1fr;
    gap: 20px;
  }
}

@media (max-width: 768px) {
  .dashboard-page {
    padding-block-start: 36px;
  }

  .product-create__form {
    grid-template-columns: 1fr 1fr;
  }

  .product-create__form :deep(.app-button) {
    grid-column: 1 / -1;
  }
}

@media (max-width: 560px) {
  .dashboard-header {
    flex-direction: column;
  }

  .product-create__form {
    grid-template-columns: 1fr;
  }

  .row-actions {
    justify-content: flex-start;
  }
}
</style>
