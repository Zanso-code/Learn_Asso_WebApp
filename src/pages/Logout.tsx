import { useEffect, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import { usePlatform } from '@/lib/platform'
import { useToast } from '@/components/Toast'

/**
 * Dedicated route for signing out.
 *
 * Clearing the session from inside /app re-renders the Layout while the route
 * is still /app, and its "no session" guard redirects to /connexion before an
 * imperative navigate('/') can land — React Router v7 runs navigation in a
 * transition, so flushSync does not win that race either. Routing *here* first
 * unmounts the Layout, so there is no guard left to fight: the session is
 * cleared and the user continues to the landing page.
 */
export function Logout() {
  const { session, logout } = usePlatform()
  const toast = useToast()
  const announced = useRef(false)

  useEffect(() => {
    // `logout` change d'identité à chaque rendu du provider et fait désormais
    // un aller-retour réseau : sans ce garde, l'effet le rejouerait.
    if (announced.current) return
    announced.current = true
    void logout()
    toast.toast('Vous êtes déconnecté', 'info')
  }, [logout, toast])

  if (!session) return <Navigate to="/" replace />
  return null // single frame while the effect clears the session
}
