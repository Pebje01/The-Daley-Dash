import Sidebar from '@/components/Sidebar'
import { CompanyProvider } from '@/components/CompanyContext'
import { DrawerProvider } from '@/components/DrawerContext'
import DrawerHost from '@/components/DrawerHost'
import MeldingProvider from '@/components/MeldingProvider'
import { TestmodusLabel, TestmodusStreep } from '@/components/TestmodusBalk'
import TestHartslag from '@/components/TestHartslag'
import TestmodusOvergang from '@/components/TestmodusOvergang'
import AssistentKnop from '@/components/assistent/AssistentKnop'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <CompanyProvider>
      <MeldingProvider>
        <DrawerProvider>
          <div className="flex min-h-screen bg-gradient-to-b from-brand-page-light to-brand-page-medium">
            <Sidebar />
            <div className="flex-1 ml-0 md:ml-sidebar-w min-w-0 flex flex-col">
              {/*
                Werkbalk van de Dash zelf. Alleen in de testversie staat er iets
                in (het testlabel). Hij houdt de ruimte
                vast zodat elke pagina op dezelfde hoogte begint als de
                bedrijfskiezer in de sidebar. De hoogte staat als
                --dash-topbar in globals.css, want de schermvullende pagina's
                rekenen ermee. Op telefoon blijft hij weg, daar zit de
                hamburgerbalk al bovenin.
              */}
              <div className="hidden md:flex items-center gap-2 h-[var(--dash-topbar)] shrink-0 px-6 border-b border-brand-card-border/60">
                <TestmodusLabel />
              </div>
              <main className="flex-1 min-w-0 overflow-x-hidden pt-12 md:pt-0">
                {children}
              </main>
            </div>
            <DrawerHost />
            <TestmodusStreep />
            {/* Testversie aan/uit: hartslag draait in test, overgang in live */}
            <TestHartslag />
            <TestmodusOvergang />
            <AssistentKnop />
          </div>
        </DrawerProvider>
      </MeldingProvider>
    </CompanyProvider>
  )
}
