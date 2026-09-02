import { Settings2, TriangleAlert } from 'lucide-react'
import { missingSupabaseEnv } from '@/lib/supabase'

/**
 * Écran affiché quand l'application a été construite sans configuration
 * Supabase.
 *
 * Il ne s'adresse pas au trésorier mais à qui a déployé l'application : sans
 * `.env.local`, aucun écran ne peut fonctionner, et l'application se contentait
 * jusqu'ici d'échouer en silence — une erreur dans la console du navigateur, et
 * des pages qui tournent dans le vide. `isSupabaseConfigured` existait déjà pour
 * détecter le cas, mais n'était consommé nulle part.
 *
 * Le premier paragraphe reste lisible par un utilisateur ordinaire, qui n'y
 * peut rien et doit surtout savoir qui prévenir ; le détail technique vient
 * après, pour celui qui peut corriger.
 */
export function ConfigError() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-navy-50 px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-navy-200 bg-white p-6 shadow-sm shadow-navy-900/5 sm:p-8">
        <span className="flex size-12 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
          <Settings2 className="size-6" />
        </span>

        <h1 className="mt-5 text-xl font-extrabold tracking-tight text-navy-900">
          Application non configurée
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-navy-600">
          AssoCaisse n'a pas été relié à sa base de données au moment de son
          installation. Aucune donnée n'est perdue&nbsp;: rien n'a encore été
          enregistré depuis cet écran. Prévenez la personne qui a installé
          l'application.
        </p>

        <div className="mt-5 rounded-xl border border-navy-200 bg-navy-50 p-4">
          <p className="flex items-center gap-2 text-xs font-bold tracking-wide text-navy-500 uppercase">
            <TriangleAlert className="size-3.5 shrink-0" />
            Pour l'administrateur
          </p>

          <p className="mt-2 text-sm leading-relaxed text-navy-700">
            {missingSupabaseEnv.length > 1
              ? 'Ces variables manquent au moment de la construction :'
              : 'Cette variable manque au moment de la construction :'}
          </p>

          <ul className="mt-2 grid gap-1">
            {missingSupabaseEnv.map((name) => (
              <li
                key={name}
                className="rounded-lg bg-white px-3 py-1.5 font-mono text-xs font-semibold text-navy-900"
              >
                {name}
              </li>
            ))}
          </ul>

          <p className="mt-3 text-sm leading-relaxed text-navy-700">
            Copiez <code className="font-mono text-xs">.env.example</code> vers{' '}
            <code className="font-mono text-xs">.env.local</code>, renseignez l'URL du projet
            Supabase et sa <strong>Publishable key</strong>, puis reconstruisez l'application
            (<code className="font-mono text-xs">npm run build</code>). Ces valeurs sont figées
            à la compilation&nbsp;: les modifier sans reconstruire ne change rien.
          </p>

          <p className="mt-3 text-xs leading-relaxed text-navy-500">
            Voir la section « Configuration Supabase » du README. Pensez aussi à reporter l'URL
            du projet dans la <code className="font-mono">Content-Security-Policy</code> de{' '}
            <code className="font-mono">index.html</code>, qui la cite en dur.
          </p>
        </div>
      </div>

      <p className="flex items-center justify-center gap-2 text-[11px] text-navy-400">
        <img
          src="/brand/zansotech-mark.png"
          alt=""
          width={360}
          height={162}
          className="h-4 w-auto"
          aria-hidden
        />
        AssoCaisse — propulsé par ZansoTech
      </p>
    </div>
  )
}
