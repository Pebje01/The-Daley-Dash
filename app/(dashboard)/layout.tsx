import Sidebar from '@/components/Sidebar'
import { CompanyProvider } from '@/components/CompanyContext'
import { DrawerProvider } from '@/components/DrawerContext'
import DrawerHost from '@/components/DrawerHost'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <CompanyProvider>
      <DrawerProvider>
        <div className="flex min-h-screen bg-gradient-to-b from-brand-page-light to-brand-page-medium">
          <Sidebar />
          <main className="flex-1 ml-0 md:ml-sidebar-w min-h-screen pt-12 md:pt-0 min-w-0 overflow-x-hidden">
            {children}
          </main>
          <DrawerHost />
        </div>
      </DrawerProvider>
    </CompanyProvider>
  )
}
