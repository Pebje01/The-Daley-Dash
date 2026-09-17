import { Suspense } from 'react'
import CrmRecordsPage from '@/components/CrmRecordsPage'

export default function CrmFacturatiePage() {
  return (
    <Suspense>
      <CrmRecordsPage entity="clickup_invoice" />
    </Suspense>
  )
}
