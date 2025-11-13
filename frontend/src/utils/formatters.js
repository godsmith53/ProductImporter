import { format } from 'date-fns'

export const formatCurrency = (value) => {
  if (value === null || value === undefined) return '$0.00'
  const amount = Number(value)
  if (Number.isNaN(amount)) return '$0.00'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}

export const formatDate = (value) => {
  if (!value) return '—'
  try {
    return format(new Date(value), 'MMM d, yyyy, h:mm:ss a')
  } catch (error) {
    return value
  }
}
