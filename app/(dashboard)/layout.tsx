import Sidebar from '@/components/Sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gradient-to-b from-brand-page-light to-brand-page-medium">
      <Sidebar />
      <main className="flex-1 ml-sidebar-w min-h-screen">
        {children}
      </main>
    </div>
  )
}
