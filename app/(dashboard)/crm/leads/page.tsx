import { Suspense } from 'react'
import ClickUpCrmRecordsPage from '@/components/ClickUpCrmRecordsPage'

export default function CrmLeadsPage() {
  return (
    <Suspense>
      <ClickUpCrmRecordsPage entity="lead" />
    </Suspense>
  )
}
