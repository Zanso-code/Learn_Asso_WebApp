import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { isSupabaseConfigured } from '@/lib/supabase'
import { PlatformProvider } from '@/lib/platform'
import { StoreProvider } from '@/lib/store'
import { ToastProvider } from '@/components/Toast'
import { ConfigError } from '@/components/ConfigError'
import { Layout } from '@/components/Layout'
import { Landing } from '@/pages/Landing'
import { Login } from '@/pages/Login'
import { AccessExpired } from '@/pages/AccessExpired'
import { Logout } from '@/pages/Logout'
import { Contact } from '@/pages/Contact'
import { AdminConsole } from '@/pages/AdminConsole'
import { Dashboard } from '@/pages/Dashboard'
import { Members } from '@/pages/Members'
import { Dues } from '@/pages/Dues'
import { Campaigns } from '@/pages/Campaigns'
import { Expenses } from '@/pages/Expenses'
import { Report } from '@/pages/Report'
import { SettingsPage } from '@/pages/SettingsPage'

export function App() {
  // Garde de configuration, avant les providers : l'effet de démarrage de
  // PlatformProvider partirait sinon chercher la session et les coordonnées de
  // contact sur un serveur inexistant, et l'utilisateur n'aurait qu'une page
  // qui tourne dans le vide pour tout diagnostic.
  //
  // Sans risque de faux positif : `isSupabaseConfigured` est calculé à partir
  // de constantes figées à la compilation, jamais d'un appel réseau — un
  // utilisateur hors ligne ne verra donc jamais cet écran.
  if (!isSupabaseConfigured) return <ConfigError />

  return (
    // PlatformProvider owns the tenant accounts and the session; StoreProvider
    // reads that session to decide *which* association's ledger to load, so it
    // must sit inside.
    <PlatformProvider>
      <StoreProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/connexion" element={<Login />} />
              <Route path="/acces-expire" element={<AccessExpired />} />
              <Route path="/deconnexion" element={<Logout />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/admin" element={<AdminConsole />} />
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
    </PlatformProvider>
  )
}
