import { useEffect, useMemo, useState } from 'react'
import { PlusIcon, PencilSquareIcon, TrashIcon, FunnelIcon } from '@heroicons/react/24/outline'
import Modal from './Modal.jsx'
import { api } from '../services/api.js'
import { formatCurrency, formatDate } from '../utils/formatters.js'
import clsx from 'clsx'

const pageSizeOptions = [20, 30, 40, 50]
const statusOptions = [
  { value: '', label: 'All status' },
  { value: 'true', label: 'Active' },
  { value: 'false', label: 'Inactive' },
]

const emptyProduct = {
  sku: '',
  name: '',
  description: '',
  price: 0,
  is_active: true,
}

export default function ProductsPage() {
  const [products, setProducts] = useState([])
  const [pagination, setPagination] = useState({ total: 0, page: 1, page_size: 20, total_pages: 1 })
  const [filters, setFilters] = useState({ sku: '', name: '', description: '', is_active: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [formData, setFormData] = useState(emptyProduct)
  const [deleteAllBusy, setDeleteAllBusy] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [detailProduct, setDetailProduct] = useState(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [sort, setSort] = useState({ key: 'created_at', dir: 'desc' })

  const fetchProducts = async (overrides = {}) => {
    setLoading(true)
    setError(null)
    try {
      const params = {
        page: overrides.page ?? pagination.page,
        page_size: overrides.page_size ?? pagination.page_size,
        ...(filters.sku && { sku: filters.sku }),
        ...(filters.name && { name: filters.name }),
        ...(filters.description && { description: filters.description }),
        ...(filters.is_active && { is_active: filters.is_active }),
      }
      const data = await api.listProducts(params)
      setProducts(data.items)
      setPagination({
        total: data.total,
        page: data.page,
        page_size: data.page_size,
        total_pages: data.total_pages,
      })
    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProducts({ page: 1 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  const openCreateModal = () => {
    setEditingProduct(null)
    setFormData(emptyProduct)
    setShowModal(true)
  }

  const openEditModal = (product) => {
    setEditingProduct(product)
    setFormData({
      sku: product.sku,
      name: product.name,
      description: product.description ?? '',
      price: product.price ?? 0,
      is_active: product.is_active,
    })
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingProduct(null)
    setFormData(emptyProduct)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    try {
      const payload = {
        sku: formData.sku.trim(),
        name: formData.name.trim(),
        description: formData.description?.trim() || null,
        price: Number(formData.price) || 0,
        is_active: Boolean(formData.is_active),
      }
      if (editingProduct) {
        await api.updateProduct(editingProduct.id, payload)
      } else {
        await api.createProduct(payload)
      }
      closeModal()
      fetchProducts()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleDelete = async (product) => {
    if (!window.confirm(`Delete product ${product.name}?`)) return
    try {
      await api.deleteProduct(product.id)
      fetchProducts()
      setSelectedIds((curr) => curr.filter((id) => id !== product.id))
    } catch (err) {
      alert(err.message)
    }
  }

  const handleDeleteAll = async () => {
    if (!window.confirm('Are you sure you want to permanently delete ALL products?')) return
    setDeleteAllBusy(true)
    try {
      await api.deleteAllProducts()
      fetchProducts({ page: 1 })
    } catch (err) {
      alert(err.message)
    } finally {
      setDeleteAllBusy(false)
    }
  }

  const onFilterChange = (field, value) => {
    setFilters((current) => ({ ...current, [field]: value }))
  }

  const toggleSelect = (id) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))
  }

  const allVisibleSelected = products.length > 0 && products.every((p) => selectedIds.includes(p.id))

  const toggleSelectAll = () => {
    setSelectedIds((current) =>
      allVisibleSelected ? current.filter((id) => !products.some((p) => p.id === id)) : [...new Set([...current, ...products.map((p) => p.id)])]
    )
  }

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return
    if (!window.confirm(`Delete ${selectedIds.length} selected product(s)?`)) return
    try {
      await Promise.all(selectedIds.map((id) => api.deleteProduct(id)))
      setSelectedIds([])
      fetchProducts()
    } catch (err) {
      alert(err.message)
    }
  }

  const openDetails = (product) => {
    setDetailProduct(product)
    setShowDetailModal(true)
  }

  const closeDetails = () => {
    setShowDetailModal(false)
    setDetailProduct(null)
  }

  const paginationSummary = useMemo(() => {
    const first = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.page_size + 1
    const last = Math.min(pagination.page * pagination.page_size, pagination.total)
    return `${first.toLocaleString()}-${last.toLocaleString()} of ${pagination.total.toLocaleString()} products`
  }, [pagination])

  const sortedProducts = useMemo(() => {
    const data = [...products]
    const mul = sort.dir === 'asc' ? 1 : -1
    data.sort((a, b) => {
      const va = a?.[sort.key]
      const vb = b?.[sort.key]

      let primary = 0
      if (sort.key === 'sku' || sort.key === 'name') {
        primary = String(va ?? '').localeCompare(String(vb ?? ''))
      } else if (sort.key === 'price') {
        primary = (Number(va) || 0) - (Number(vb) || 0)
      } else if (sort.key === 'created_at' || sort.key === 'updated_at') {
        const da = va ? new Date(va).getTime() : 0
        const db = vb ? new Date(vb).getTime() : 0
        primary = da - db
      } else {
        primary = String(va ?? '').localeCompare(String(vb ?? ''))
      }

      if (primary === 0) {
        // Secondary: sku asc
        const s1 = String(a?.sku ?? '')
        const s2 = String(b?.sku ?? '')
        const sec = s1.localeCompare(s2)
        if (sec !== 0) return sec * mul
        // Tertiary: id asc
        const i1 = (typeof a?.id === 'number' ? a.id : Number(a?.id)) || 0
        const i2 = (typeof b?.id === 'number' ? b.id : Number(b?.id)) || 0
        return (i1 - i2) * mul
      }

      return primary * mul
    })
    return data
  }, [products, sort])

  const toggleSort = (key) => {
    setSort((curr) => (curr.key === key ? { key, dir: curr.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  return (
    <div className="flex flex-col gap-10">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-card shadow-slate-200/40">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Product Management</h2>
            <p className="mt-1 text-sm text-slate-600">View, create, update, and delete products.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={handleBulkDelete}
                className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
              >
                <TrashIcon className="h-4 w-4" /> Delete Selected ({selectedIds.length})
              </button>
            )}
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-300/40 transition hover:bg-indigo-700"
            >
              <PlusIcon className="h-4 w-4" /> Add Product
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-4 rounded-2xl border border-slate-100 bg-slate-50/60 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <FunnelIcon className="h-3.5 w-3.5" /> Filter by SKU
            </span>
            <input
              type="text"
              value={filters.sku}
              onChange={(event) => onFilterChange('sku', event.target.value)}
              placeholder="e.g. abc-123"
              className="mt-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none"
            />
          </label>
          <label className="flex flex-col">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <FunnelIcon className="h-3.5 w-3.5" /> Filter by Name
            </span>
            <input
              type="text"
              value={filters.name}
              onChange={(event) => onFilterChange('name', event.target.value)}
              placeholder="Search by name"
              className="mt-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none"
            />
          </label>
          <label className="flex flex-col">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <FunnelIcon className="h-3.5 w-3.5" /> Description Contains
            </span>
            <input
              type="text"
              value={filters.description}
              onChange={(event) => onFilterChange('description', event.target.value)}
              placeholder="Keyword"
              className="mt-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none"
            />
          </label>
          <label className="flex flex-col">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
            <select
              value={filters.is_active}
              onChange={(event) => onFilterChange('is_active', event.target.value)}
              className="mt-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-100">
          <table className="min-w-[900px] divide-y divide-slate-100 text-sm text-slate-600">
            <thead className="bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} />
                </th>
                <th className="px-4 py-3 text-left font-semibold">#</th>
                <th className="px-6 py-3 text-left font-semibold"><button type="button" onClick={() => toggleSort('sku')}>SKU{sort.key==='sku' ? (sort.dir==='asc'?' ▲':' ▼') : ''}</button></th>
                <th className="px-6 py-3 text-left font-semibold"><button type="button" onClick={() => toggleSort('name')}>Name{sort.key==='name' ? (sort.dir==='asc'?' ▲':' ▼') : ''}</button></th>
                <th className="px-6 py-3 text-right font-semibold"><button type="button" onClick={() => toggleSort('price')}>Price{sort.key==='price' ? (sort.dir==='asc'?' ▲':' ▼') : ''}</button></th>
                <th className="px-6 py-3 text-left font-semibold">Status</th>
                <th className="px-6 py-3 text-left font-semibold"><button type="button" onClick={() => toggleSort('created_at')}>Created{sort.key==='created_at' ? (sort.dir==='asc'?' ▲':' ▼') : ''}</button></th>
                <th className="px-6 py-3 text-left font-semibold"><button type="button" onClick={() => toggleSort('updated_at')}>Updated{sort.key==='updated_at' ? (sort.dir==='asc'?' ▲':' ▼') : ''}</button></th>
                <th className="px-6 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-sm text-slate-500">
                    Loading products…
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-sm text-rose-500">
                    {error}
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-sm text-slate-500">
                    No products found.
                  </td>
                </tr>
              ) : (
                sortedProducts.map((product, idx) => (
                  <tr
                    key={product.id}
                    className="cursor-pointer transition hover:bg-indigo-50/40"
                    onClick={() => openDetails(product)}
                  >
                    <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(product.id)}
                        onChange={() => toggleSelect(product.id)}
                      />
                    </td>
                    <td className="px-4 py-4 text-slate-500">{(pagination.page - 1) * pagination.page_size + idx + 1}</td>
                    <td className="px-6 py-4 font-medium text-slate-800">{product.sku}</td>
                    <td className="px-6 py-4 text-slate-700">{product.name}</td>
                    <td className="px-6 py-4 text-right font-semibold text-slate-800">{formatCurrency(product.price)}</td>
                    <td className="px-6 py-4">
                      <span
                        className={clsx(
                          'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
                          product.is_active
                            ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100'
                            : 'bg-amber-50 text-amber-600 ring-1 ring-amber-100'
                        )}
                      >
                        {product.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500">{formatDate(product.created_at)}</td>
                    <td className="px-6 py-4 text-slate-500">{formatDate(product.updated_at)}</td>
                    <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(product)}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600"
                        >
                          <PencilSquareIcon className="h-4 w-4" /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(product)}
                          className="inline-flex items-center gap-1 rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
                        >
                          <TrashIcon className="h-4 w-4" /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">{paginationSummary}</p>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={pagination.page_size}
              onChange={(event) => fetchProducts({ page_size: Number(event.target.value), page: 1 })}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 focus:border-indigo-300"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size} per page
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fetchProducts({ page: Math.max(1, pagination.page - 1) })}
                disabled={pagination.page <= 1}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-600 transition enabled:hover:border-indigo-200 enabled:hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm font-semibold text-slate-600">
                Page {pagination.page} / {Math.max(1, pagination.total_pages)}
              </span>
              <button
                type="button"
                onClick={() => fetchProducts({ page: Math.min(pagination.total_pages, pagination.page + 1) })}
                disabled={pagination.page >= pagination.total_pages}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-600 transition enabled:hover:border-indigo-200 enabled:hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-rose-200/70 bg-rose-50/70 p-8 shadow-card shadow-rose-200/50">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-rose-700">Danger Zone</h3>
            <p className="mt-1 text-sm text-rose-600">
              Delete all products from the database. This action is irreversible.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDeleteAll}
            disabled={deleteAllBusy}
            className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-300/40 transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <TrashIcon className="h-4 w-4" /> Delete All Products
          </button>
        </div>
      </section>

      <Modal
        open={showModal}
        onClose={closeModal}
        title={editingProduct ? 'Edit Product' : 'Add Product'}
        description="Provide the product details below. SKU must be unique across products."
        maxWidth="max-w-2xl"
        footer={[
          <button
            key="cancel"
            type="button"
            onClick={closeModal}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-indigo-200 hover:text-indigo-600"
          >
            Cancel
          </button>,
          <button
            key="save"
            type="submit"
            form="product-form"
            className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-300/40 hover:bg-indigo-700"
          >
            {editingProduct ? 'Save Changes' : 'Create Product'}
          </button>,
        ]}
      >
        <form id="product-form" onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <label className="text-sm font-semibold text-slate-700">SKU *</label>
            <input
              type="text"
              value={formData.sku}
              onChange={(event) => setFormData((current) => ({ ...current, sku: event.target.value }))}
              required
              disabled={Boolean(editingProduct)}
              placeholder="Unique SKU"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none disabled:bg-slate-100/80"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-semibold text-slate-700">Product Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value }))}
              required
              placeholder="Product name"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-semibold text-slate-700">Description</label>
            <textarea
              value={formData.description}
              onChange={(event) => setFormData((current) => ({ ...current, description: event.target.value }))}
              rows={4}
              placeholder="Product description"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <label className="text-sm font-semibold text-slate-700">Price</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.price}
                onChange={(event) => setFormData((current) => ({ ...current, price: event.target.value }))}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-semibold text-slate-700">Status</label>
              <select
                value={formData.is_active ? 'true' : 'false'}
                onChange={(event) => setFormData((current) => ({ ...current, is_active: event.target.value === 'true' }))}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none"
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={showDetailModal}
        onClose={closeDetails}
        title={detailProduct ? detailProduct.name : 'Product'}
        description={detailProduct ? `SKU: ${detailProduct.sku}` : ''}
        maxWidth="max-w-xl"
        footer={[
          <button
            key="edit"
            type="button"
            onClick={() => {
              closeDetails()
              if (detailProduct) openEditModal(detailProduct)
            }}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-indigo-200 hover:text-indigo-600"
          >
            Edit
          </button>,
          <button
            key="delete"
            type="button"
            onClick={() => detailProduct && handleDelete(detailProduct)}
            className="rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
          >
            Delete
          </button>,
          <button
            key="close"
            type="button"
            onClick={closeDetails}
            className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-300/40 hover:bg-indigo-700"
          >
            Close
          </button>,
        ]}
      >
        {detailProduct && (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-slate-700">Description</h4>
              <p className="mt-1 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-sm text-slate-700">{detailProduct.description || 'No description'}</p>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm text-slate-600">
              <div><span className="font-semibold text-slate-700">Price:</span> {formatCurrency(detailProduct.price)}</div>
              <div><span className="font-semibold text-slate-700">Status:</span> {detailProduct.is_active ? 'Active' : 'Inactive'}</div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
