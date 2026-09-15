import { usePlatform } from '@/lib/platform'
import { isTrial } from '@/lib/subscription'

/**
 * Filigrane « Version d'essai » des documents imprimables : rapport d'AG et
 * relevés individuels.
 *
 * Le rapport d'AG est ce que l'association présente à ses membres. Filigrané, il
 * ne peut pas servir d'état financier officiel — ce qui ôte l'intérêt de vivre
 * d'essai en essai, sans gêner celui qui découvre l'application.
 *
 * À l'écran, il couvre son parent, qui doit être `relative`. À l'impression, il
 * passe en `position: fixed` et le navigateur le répète sur chaque page A4
 * (voir `.trial-watermark` dans index.css).
 */
export function TrialWatermark() {
  const { account } = usePlatform()
  if (!isTrial(account)) return null

  return (
    <div className="trial-watermark" aria-hidden>
      <span>
        Version d'essai
        <small>AssoCaisse</small>
      </span>
    </div>
  )
}
