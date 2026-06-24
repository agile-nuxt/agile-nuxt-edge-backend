interface ProductRecord extends Record<string, unknown> {
  id: string
  title: string
  price: number
  status: 'active' | 'archived'
  description: string | null
  createdAt: string
  updatedAt: string
}

interface NewProduct {
  title: string
  price: number
  description: string | null
}

export function useProductsDemo() {
  const api = useBackendEntity<ProductRecord>('products')
  const products = ref<ProductRecord[]>([])
  const loading = ref(false)
  const error = ref('')

  async function run<T>(operation: () => Promise<T>): Promise<T | undefined> {
    loading.value = true
    error.value = ''
    try {
      return await operation()
    } catch (cause) {
      error.value =
        cause instanceof Error ? cause.message : 'The products request failed.'
      return undefined
    } finally {
      loading.value = false
    }
  }

  async function list(): Promise<void> {
    const result = await run(() =>
      api.list({
        orderBy: { createdAt: 'desc' },
        limit: 100
      })
    )
    if (result) products.value = result.data
  }

  async function createProduct(input: NewProduct): Promise<void> {
    const created = await run(() =>
      api.create({
        ...input,
        status: 'active'
      })
    )
    if (created) await list()
  }

  async function updateStatus(
    id: string,
    status: ProductRecord['status']
  ): Promise<void> {
    const updated = await run(() => api.update(id, { status }))
    if (updated) {
      products.value = products.value.map((product) =>
        product.id === id ? updated : product
      )
    }
  }

  async function deleteProduct(id: string): Promise<void> {
    const removed = await run(() => api.remove(id))
    if (removed) {
      products.value = products.value.filter((product) => product.id !== id)
    }
  }

  return {
    products,
    loading,
    error,
    list,
    createProduct,
    updateStatus,
    deleteProduct
  }
}
