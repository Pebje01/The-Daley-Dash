import { Suspense } from 'react'
import ClickUpCrmRecordsPage from '@/components/ClickUpCrmRecordsPage'

export default function CrmFacturatiePage() {
  return (
    <Suspense>
      <ClickUpCrmRecordsPage entity="clickup_invoice" />
    </Suspense>
  )
}
