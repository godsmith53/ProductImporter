import { Dialog, Transition } from '@headlessui/react'
import { Fragment } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'

export default function Modal({ open, onClose, title, description, children, maxWidth = 'max-w-xl', footer }) {
  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center px-4 py-8 sm:px-6">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className={`relative w-full transform overflow-hidden rounded-3xl bg-white p-6 shadow-2xl transition-all ${maxWidth}`}>
                <button
                  type="button"
                  onClick={onClose}
                  className="absolute right-5 top-5 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-400 hover:text-slate-700"
                >
                  <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                </button>
                <Dialog.Title className="text-lg font-semibold text-slate-900">{title}</Dialog.Title>
                {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
                <div className="mt-6 space-y-4">{children}</div>
                {footer && <div className="mt-8 flex justify-end gap-3">{footer}</div>}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  )
}
