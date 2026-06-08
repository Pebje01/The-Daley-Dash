import { Suspense } from 'react'
import ClickUpCrmRecordsPage from '@/components/ClickUpCrmRecordsPage'

export default function CrmDaleyListPage() {
  return (
    <Suspense>
      <ClickUpCrmRecordsPage entity="daley_list" />
    </Suspense>
  )
}
