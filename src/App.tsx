import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { StoreProvider } from '@/lib/store'
import { ToastProvider } from '@/components/Toast'
import { Layout } from '@/components/Layout'
import { Landing } from '@/pages/Landing'
import { Dashboard } from '@/pages/Dashboard'
import { Members } from '@/pages/Members'
import { Dues } from '@/pages/Dues'
import { Campaigns } from '@/pages/Campaigns'
import { Expenses } from '@/pages/Expenses'
import { Report } from '@/pages/Report'
import { SettingsPage } from '@/pages/SettingsPage'

export function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/app" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="membres" element={<Members />} />
              <Route path="cotisations" element={<Dues />} />
              <Route path="campagnes" element={<Campaigns />} />
              <Route path="depenses" element={<Expenses />} />
              <Route path="rapport" element={<Report />} />
              <Route path="parametres" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </StoreProvider>
  )
}
