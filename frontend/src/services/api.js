const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

const defaultHeaders = {
  'Content-Type': 'application/json',
}

async function handleResponse(response) {
  if (!response.ok) {
    let detail
    try {
      const data = await response.json()
      detail = data?.detail || JSON.stringify(data)
    } catch (error) {
      detail = response.statusText
    }
    throw new Error(detail || 'Request failed')
  }
  if (response.status === 204) {
    return null
  }
  const contentType = response.headers.get('content-type')
  if (contentType?.includes('application/json')) {
    return response.json()
  }
  return response.text()
}

export const api = {
  async uploadFile(file) {
    const formData = new FormData()
    formData.append('file', file)
    const response = await fetch(`${API_BASE}/imports/upload`, {
      method: 'POST',
      body: formData,
    })
    return handleResponse(response)
  },

  async getImportJob(importId) {
    const response = await fetch(`${API_BASE}/imports/${importId}/status`)
    return handleResponse(response)
  },

  async listImports(limit = 10) {
    const params = new URLSearchParams({ limit })
    const response = await fetch(`${API_BASE}/imports?${params.toString()}`)
    return handleResponse(response)
  },

  async listProducts(filters = {}) {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, value)
      }
    })
    const response = await fetch(`${API_BASE}/products?${params.toString()}`)
    return handleResponse(response)
  },

  async createProduct(payload) {
    const response = await fetch(`${API_BASE}/products`, {
      method: 'POST',
      headers: defaultHeaders,
      body: JSON.stringify(payload),
    })
    return handleResponse(response)
  },

  async updateProduct(id, payload) {
    const response = await fetch(`${API_BASE}/products/${id}`, {
      method: 'PUT',
      headers: defaultHeaders,
      body: JSON.stringify(payload),
    })
    return handleResponse(response)
  },

  async getProduct(id) {
    const response = await fetch(`${API_BASE}/products/${id}`)
    return handleResponse(response)
  },

  async deleteProduct(id) {
    const response = await fetch(`${API_BASE}/products/${id}`, {
      method: 'DELETE',
    })
    return handleResponse(response)
  },

  async deleteAllProducts() {
    const response = await fetch(`${API_BASE}/products`, {
      method: 'DELETE',
    })
    return handleResponse(response)
  },

  async listWebhooks() {
    const response = await fetch(`${API_BASE}/webhooks`)
    return handleResponse(response)
  },

  async createWebhook(payload) {
    const response = await fetch(`${API_BASE}/webhooks`, {
      method: 'POST',
      headers: defaultHeaders,
      body: JSON.stringify(payload),
    })
    return handleResponse(response)
  },

  async updateWebhook(id, payload) {
    const response = await fetch(`${API_BASE}/webhooks/${id}`, {
      method: 'PUT',
      headers: defaultHeaders,
      body: JSON.stringify(payload),
    })
    return handleResponse(response)
  },

  async deleteWebhook(id) {
    const response = await fetch(`${API_BASE}/webhooks/${id}`, {
      method: 'DELETE',
    })
    return handleResponse(response)
  },

  async testWebhook(id) {
    const response = await fetch(`${API_BASE}/webhooks/${id}/test`, {
      method: 'POST',
    })
    return handleResponse(response)
  },
}
