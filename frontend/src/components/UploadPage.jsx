import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CloudArrowUpIcon } from '@heroicons/react/24/outline'
import { api } from '../services/api.js'
import { formatDate } from '../utils/formatters.js'
import clsx from 'clsx'

const STATUS_COPY = {
  pending: 'Pending',
  parsing: 'Parsing CSV',
  validating: 'Validating data',
  importing: 'Importing products',
  completed: 'Import complete',
  failed: 'Import failed',
}

const DEFAULT_PROGRESS = {
  visible: false,
  percent: 0,
  label: 'Waiting for upload…',
  status: 'idle',
  detail: null,
}

export default function UploadPage() {
  const [isDragging, setIsDragging] = useState(false)
  const [progress, setProgress] = useState(DEFAULT_PROGRESS)
  const [importHistory, setImportHistory] = useState([])
  const pollingRef = useRef(null)
  const [sort, setSort] = useState({ key: 'started_at', dir: 'desc' })

  const refreshHistory = useCallback(async () => {
    try {
      const items = await api.listImports(25)
      setImportHistory(items)
    } catch (error) {
      console.error('Failed to load import history', error)
    }
  }, [])

  useEffect(() => {
    refreshHistory()
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [refreshHistory])

  const clearPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }

  const handleJobPolling = (jobId) => {
    pollingRef.current = setInterval(async () => {
      try {
        const job = await api.getImportJob(jobId)
        const percent = job.total_records > 0 ? Math.round((job.processed_records / job.total_records) * 100) : 0
        setProgress((current) => ({
          ...current,
          percent,
          status: job.status,
          label: STATUS_COPY[job.status] ?? job.status,
          detail:
            job.status === 'completed'
              ? `Imported ${job.processed_records} of ${job.total_records} products`
              : job.status === 'failed'
              ? job.error_message || 'Import failed'
              : `Processed ${job.processed_records.toLocaleString()} of ${job.total_records.toLocaleString()} records`,
        }))

        if (['completed', 'failed'].includes(job.status)) {
          clearPolling()
          refreshHistory()
        }
      } catch (error) {
        console.error('Polling error', error)
        clearPolling()
      }
    }, 1000)
  }

  const handleUpload = async (file) => {
    if (!file) return
    if (!file.name.endsWith('.csv')) {
      setProgress({
        visible: true,
        percent: 0,
        label: 'Invalid file type',
        status: 'failed',
        detail: 'Please upload a CSV file',
      })
      return
    }

    setProgress({
      visible: true,
      percent: 0,
      label: 'Uploading file…',
      status: 'pending',
      detail: file.name,
    })

    try {
      const job = await api.uploadFile(file)
      setProgress((current) => ({
        ...current,
        label: 'Upload complete, processing started…',
        status: 'parsing',
        detail: `Tracking import for ${file.name}`,
      }))
      handleJobPolling(job.id)
      refreshHistory()
    } catch (error) {
      setProgress({
        visible: true,
        percent: 0,
        label: 'Upload failed',
        status: 'failed',
        detail: error.message,
      })
    }
  }

  const onDrop = (event) => {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer?.files?.[0]
    handleUpload(file)
  }

  const onInputChange = (event) => {
    const file = event.target.files?.[0]
    handleUpload(file)
    event.target.value = ''
  }

  const sortedHistory = useMemo(() => {
    const data = [...importHistory]
    const { key, dir } = sort
    const mul = dir === 'asc' ? 1 : -1
    data.sort((a, b) => {
      const va = a?.[key]
      const vb = b?.[key]
      if (key === 'file_name') return String(va || '').localeCompare(String(vb || '')) * mul
      if (key === 'status') return String(va || '').localeCompare(String(vb || '')) * mul
      if (key === 'total_records' || key === 'processed_records') return ((va ?? 0) - (vb ?? 0)) * mul
      // dates or fallback
      const da = va ? new Date(va).getTime() : 0
      const db = vb ? new Date(vb).getTime() : 0
      return (da - db) * mul
    })
    return data
  }, [importHistory, sort])

  const toggleSort = (key) => {
    setSort((curr) => (curr.key === key ? { key, dir: curr.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  return (
    <div className="flex flex-col gap-12">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="rounded-3xl border border-indigo-100 bg-white p-8 shadow-card shadow-indigo-100/50">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">CSV File Upload</h2>
              <p className="mt-2 text-sm text-slate-600">
                Upload a CSV file with columns: <strong className="font-semibold">SKU, Name, Description, Price</strong>. Max size 500MB, up to 500K rows per upload.
              </p>
            </div>
          </div>

          <div
            onDragOver={(event) => {
              event.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={clsx(
              'relative mt-8 flex h-64 flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all',
              isDragging
                ? 'border-indigo-400 bg-indigo-50/70'
                : 'border-indigo-200 bg-indigo-50/40 hover:border-indigo-300'
            )}
          >
            <CloudArrowUpIcon className="h-12 w-12 text-indigo-400" aria-hidden="true" />
            <div className="mt-4 text-center text-sm text-slate-600">
              <p className="font-semibold text-slate-700">Drag & drop your CSV here, or click to browse</p>
              <p className="mt-1 text-xs text-slate-500">Accepted format: .csv · Limit: 500MB · Up to 500,000 records</p>
            </div>
            <input
              type="file"
              accept=".csv"
              onChange={onInputChange}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>

          {progress.visible && (
            <div className="mt-8 rounded-2xl bg-slate-50/80 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">{progress.label}</p>
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{progress.percent}%</span>
              </div>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
                <div
                  className={clsx(
                    'h-full rounded-full transition-all',
                    progress.status === 'completed' ? 'bg-emerald-500' : progress.status === 'failed' ? 'bg-rose-500' : 'bg-indigo-500'
                  )}
                  style={{ width: `${Math.min(progress.percent, 100)}%` }}
                />
              </div>
              {progress.detail && (
                <p className="mt-3 text-xs text-slate-500">{progress.detail}</p>
              )}
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card shadow-slate-200/40">
            <h3 className="text-sm font-semibold text-slate-800">CSV Format Requirements</h3>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li><span className="font-semibold text-slate-700">sku</span> – Unique product identifier (required)</li>
              <li><span className="font-semibold text-slate-700">name</span> – Product name (required)</li>
              <li><span className="font-semibold text-slate-700">description</span> – Product description (optional)</li>
              <li><span className="font-semibold text-slate-700">price</span> – Product price (optional, defaults to $0.00)</li>
            </ul>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card shadow-slate-200/40">
            <h3 className="text-sm font-semibold text-slate-800">Import Tips</h3>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li>Ensure SKUs are unique across rows (case-insensitive)</li>
              <li>Large imports run asynchronously—keep this page open to monitor progress</li>
              <li>Duplicate SKUs automatically overwrite existing products</li>
              <li>Webhook notifications fire for ImportStarted and ImportCompleted events</li>
            </ul>
          </div>
        </aside>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-card shadow-slate-200/40">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Import History</h2>
            <p className="mt-1 text-sm text-slate-600">Track recent import jobs and monitor progress in real time.</p>
          </div>
          <button
            type="button"
            onClick={refreshHistory}
            className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600"
          >
            Refresh
          </button>
        </div>
        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-100">
          <table className="min-w-[800px] divide-y divide-slate-100 text-sm text-slate-600">
            <thead className="bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-semibold">#</th>
                <th scope="col" className="px-6 py-3 text-left font-semibold">
                  <button type="button" onClick={() => toggleSort('file_name')}>File Name{sort.key==='file_name' ? (sort.dir==='asc'?' ▲':' ▼') : ''}</button>
                </th>
                <th scope="col" className="px-6 py-3 text-right font-semibold">
                  <button type="button" onClick={() => toggleSort('total_records')}>Total Records{sort.key==='total_records' ? (sort.dir==='asc'?' ▲':' ▼') : ''}</button>
                </th>
                <th scope="col" className="px-6 py-3 text-right font-semibold">
                  <button type="button" onClick={() => toggleSort('processed_records')}>Processed{sort.key==='processed_records' ? (sort.dir==='asc'?' ▲':' ▼') : ''}</button>
                </th>
                <th scope="col" className="px-6 py-3 text-left font-semibold">
                  <button type="button" onClick={() => toggleSort('status')}>Status{sort.key==='status' ? (sort.dir==='asc'?' ▲':' ▼') : ''}</button>
                </th>
                <th scope="col" className="px-6 py-3 text-left font-semibold">
                  <button type="button" onClick={() => toggleSort('started_at')}>Started At{sort.key==='started_at' ? (sort.dir==='asc'?' ▲':' ▼') : ''}</button>
                </th>
                <th scope="col" className="px-6 py-3 text-left font-semibold">
                  <button type="button" onClick={() => toggleSort('completed_at')}>Completed At{sort.key==='completed_at' ? (sort.dir==='asc'?' ▲':' ▼') : ''}</button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-sm">
              {sortedHistory.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-sm text-slate-500">
                    No import jobs yet. Upload a CSV file to get started.
                  </td>
                </tr>
              ) : (
                sortedHistory.map((job, idx) => (
                  <tr key={job.id} className="transition hover:bg-indigo-50/40">
                    <td className="px-4 py-4 text-slate-500">{idx + 1}</td>
                    <td className="px-6 py-4 font-medium text-slate-800">{job.file_name ?? '—'}</td>
                    <td className="px-6 py-4 text-right tabular-nums">{job.total_records?.toLocaleString?.() ?? '0'}</td>
                    <td className="px-6 py-4 text-right tabular-nums">{job.processed_records?.toLocaleString?.() ?? '0'}</td>
                    <td className="px-6 py-4">
                      <span
                        className={clsx(
                          'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize',
                          {
                            completed: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100',
                            failed: 'bg-rose-50 text-rose-600 ring-1 ring-rose-100',
                          }[job.status] || 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100'
                        )}
                      >
                        {STATUS_COPY[job.status] ?? job.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{formatDate(job.started_at)}</td>
                    <td className="px-6 py-4 text-slate-600">{formatDate(job.completed_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
