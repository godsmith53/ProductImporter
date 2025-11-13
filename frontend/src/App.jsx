import { useMemo, useState } from 'react'
import UploadPage from './components/UploadPage.jsx'
import ProductsPage from './components/ProductsPage.jsx'
import WebhooksPage from './components/WebhooksPage.jsx'
import { CloudArrowUpIcon, CubeIcon, SignalIcon } from '@heroicons/react/24/outline'
import { clsx } from 'clsx'

const tabs = [
  {
    id: 'upload',
    label: 'Upload',
    description: 'Upload CSV files and monitor import progress',
    icon: CloudArrowUpIcon,
  },
  {
    id: 'products',
    label: 'Products',
    description: 'Manage your product catalog',
    icon: CubeIcon,
  },
  {
    id: 'webhooks',
    label: 'Webhooks',
    description: 'Configure event-driven integrations',
    icon: SignalIcon,
  },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('upload')

  const ActiveComponent = useMemo(() => {
    switch (activeTab) {
      case 'products':
        return ProductsPage
      case 'webhooks':
        return WebhooksPage
      case 'upload':
      default:
        return UploadPage
    }
  }, [activeTab])

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-white">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 sm:px-10">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Product Importer</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Upload CSV files, manage products, and configure webhooks with real-time visibility and seamless workflows.
            </p>
          </div>
          <nav className="flex flex-wrap gap-3">
            {tabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={clsx(
                    'relative flex items-center gap-3 rounded-full border px-5 py-3 text-left transition-all',
                    isActive
                      ? 'border-indigo-200 bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-600'
                  )}
                >
                  <span className={clsx('inline-flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold', isActive ? 'border-white/30 bg-white/10 text-white' : 'border-indigo-100 bg-indigo-50 text-indigo-600')}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold leading-5">
                      {tab.label}
                    </span>
                    <span className={clsx('block text-xs leading-4', isActive ? 'text-indigo-100' : 'text-slate-500')}>
                      {tab.description}
                    </span>
                  </span>
                </button>
              )
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12 sm:px-10">
        <ActiveComponent />
      </main>
    </div>
  )
}
