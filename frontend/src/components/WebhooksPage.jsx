import { useEffect, useMemo, useState } from 'react'
import { PlusIcon, PencilSquareIcon, TrashIcon, CheckCircleIcon, BoltIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'
import Modal from './Modal.jsx'
import { api } from '../services/api.js'

const defaultWebhook = {
  url: '',
  event_types: '',
  is_enabled: true,
}

const EVENT_OPTIONS = ['ProductCreated', 'ProductUpdated', 'ProductDeleted', 'ImportStarted', 'ImportCompleted']

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingWebhook, setEditingWebhook] = useState(null)
  const [formData, setFormData] = useState(defaultWebhook)
  const [testingWebhook, setTestingWebhook] = useState(null)

  const selectedEvents = useMemo(() => {
    return new Set(
      formData.event_types
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  }, [formData.event_types])

  const loadWebhooks = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.listWebhooks()
      setWebhooks(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadWebhooks()
  }, [])

  const openCreate = () => {
    setEditingWebhook(null)
    setFormData(defaultWebhook)
    setModalOpen(true)
  }

  const openEdit = (webhook) => {
    setEditingWebhook(webhook)
    setFormData({
      url: webhook.url,
      event_types: webhook.event_types?.join(', ') ?? '',
      is_enabled: webhook.is_enabled,
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingWebhook(null)
    setFormData(defaultWebhook)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const payload = {
      url: formData.url.trim(),
      event_types: Array.from(selectedEvents),
      is_enabled: Boolean(formData.is_enabled),
    }

    try {
      if (editingWebhook) {
        await api.updateWebhook(editingWebhook.id, payload)
      } else {
        await api.createWebhook(payload)
      }
      closeModal()
      loadWebhooks()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleDelete = async (webhook) => {
    if (!window.confirm('Delete this webhook?')) return
    try {
      await api.deleteWebhook(webhook.id)
      loadWebhooks()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleTest = async (webhook) => {
    setTestingWebhook(webhook.id)
    try {
      const result = await api.testWebhook(webhook.id)
      alert(`Webhook test response: ${result.response_code} (took ${result.response_time_ms?.toFixed?.(2) ?? 0}ms)`) // eslint-disable-line no-alert
    } catch (err) {
      alert(`Webhook test failed: ${err.message}`)
    } finally {
      setTestingWebhook(null)
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-card shadow-slate-200/40">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Webhook Configuration</h2>
            <p className="mt-1 text-sm text-slate-600">
              Manage event-driven integrations by connecting external systems.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-300/40 transition hover:bg-indigo-700"
          >
            <PlusIcon className="h-4 w-4" /> Add Webhook
          </button>
        </div>

        <div className="mt-6 space-y-4">
          {loading ? (
            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-8 text-center text-sm text-slate-600">
              Loading webhooks…
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-8 text-center text-sm text-rose-600">
              {error}
            </div>
          ) : webhooks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center text-sm text-slate-500">
              No webhooks configured. Click &ldquo;Add Webhook&rdquo; to get started.
            </div>
          ) : (
            webhooks.map((webhook) => (
              <div
                key={webhook.id}
                className={clsx(
                  'flex flex-col gap-4 rounded-2xl border px-6 py-5 shadow-card transition sm:flex-row sm:items-start sm:justify-between',
                  webhook.is_enabled
                    ? 'border-indigo-100 bg-white shadow-indigo-100/30'
                    : 'border-slate-200 bg-slate-50/70 shadow-slate-200/40 opacity-80'
                )}
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <BoltIcon className="h-4 w-4 text-indigo-500" />
                      {webhook.url}
                    </span>
                    <span
                      className={clsx(
                        'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold uppercase',
                        webhook.is_enabled ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100' : 'bg-slate-200 text-slate-600'
                      )}
                    >
                      {webhook.is_enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Events:
                    {webhook.event_types?.length ? (
                      webhook.event_types.map((event) => (
                        <span key={event} className="rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-600">
                          {event}
                        </span>
                      ))
                    ) : (
                      <span className="rounded-full bg-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600">All Events</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleTest(webhook)}
                    disabled={testingWebhook === webhook.id}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-wait disabled:opacity-70"
                  >
                    <CheckCircleIcon className="h-4 w-4" /> Test
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(webhook)}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600"
                  >
                    <PencilSquareIcon className="h-4 w-4" /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(webhook)}
                    className="inline-flex items-center gap-2 rounded-full border border-rose-200 px-4 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
                  >
                    <TrashIcon className="h-4 w-4" /> Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingWebhook ? 'Edit Webhook' : 'Add Webhook'}
        description="Configure the webhook endpoint and select the events to subscribe to."
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
            form="webhook-form"
            type="submit"
            className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-300/40 hover:bg-indigo-700"
          >
            {editingWebhook ? 'Save Changes' : 'Create Webhook'}
          </button>,
        ]}
      >
        <form id="webhook-form" onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <label className="text-sm font-semibold text-slate-700">Webhook URL *</label>
            <input
              type="url"
              required
              value={formData.url}
              onChange={(event) => setFormData((current) => ({ ...current, url: event.target.value }))}
              placeholder="https://example.com/webhooks/product"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-semibold text-slate-700">Event Types</label>
            <div className="flex flex-wrap gap-2">
              {EVENT_OPTIONS.map((event) => {
                const isSelected = selectedEvents.has(event)
                return (
                  <button
                    key={event}
                    type="button"
                    onClick={() =>
                      setFormData((current) => {
                        const set = new Set(selectedEvents)
                        if (set.has(event)) {
                          set.delete(event)
                        } else {
                          set.add(event)
                        }
                        return { ...current, event_types: Array.from(set).join(', ') }
                      })
                    }
                    className={clsx(
                      'rounded-full border px-3 py-1 text-xs font-semibold transition',
                      isSelected ? 'border-indigo-200 bg-indigo-50 text-indigo-600' : 'border-slate-200 bg-white text-slate-600'
                    )}
                  >
                    {event}
                  </button>
                )
              })}
            </div>
            <input
              type="text"
              value={formData.event_types}
              onChange={(event) => setFormData((current) => ({ ...current, event_types: event.target.value }))}
              placeholder="Custom events (comma separated). Leave empty for all events."
              className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-3">
            <input
              id="webhook-enabled"
              type="checkbox"
              checked={formData.is_enabled}
              onChange={(event) => setFormData((current) => ({ ...current, is_enabled: event.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600"
            />
            <label htmlFor="webhook-enabled" className="text-sm font-semibold text-slate-700">
              Webhook is enabled
            </label>
          </div>
        </form>
      </Modal>
    </div>
  )
}
