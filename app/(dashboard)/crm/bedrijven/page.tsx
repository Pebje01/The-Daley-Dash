import { Suspense } from 'react'
import ClickUpCrmRecordsPage from '@/components/ClickUpCrmRecordsPage'

export default function CrmBedrijvenPage() {
  return (
    <Suspense>
      <ClickUpCrmRecordsPage entity="company" />
    </Suspense>
  )
}
