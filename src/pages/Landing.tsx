import { useState, type ButtonHTMLAttributes } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  Camera,
  CheckCircle2,
  FileText,
  HandCoins,
  LogIn,
  Mail,
  Signal,
  Users,
  Wallet,
} from 'lucide-react'
import { usePlatform } from '@/lib/platform'
import { useToast } from '@/components/Toast'
import { passwordProblem } from '@/lib/auth'
import { Button, Field, Input, Modal, PasswordInput, Select, cx } from '@/components/ui'
import { LogoPicker } from '@/components/LogoPicker'

const BENEFITS = [
  {
    icon: Users,
    title: 'Registre des membres',
    text: "Fiches complètes, catégories de cotisation, statut actif/inactif et rappel WhatsApp en un geste.",
  },
  {
    icon: Wallet,
    title: 'Matrice des cotisations',
    text: 'Une grille Janvier → Décembre. Un clic sur une case enregistre le paiement du mois.',
  },
  {
    icon: HandCoins,
    title: 'Cotisations extraordinaires',
    text: "Gala, forage, obsèques : chaque campagne a son objectif et sa barre de progression.",
  },
  {
    icon: Camera,
    title: 'Dépenses avec justificatifs',
    text: 'Photographiez le reçu avec le téléphone. Il est compressé sous 150 Ko avant enregistrement.',
  },
  {
    icon: FileText,
    title: "Rapport d'AG en 1 clic",
    text: "Bilan financier prêt à imprimer en A4, avec blocs de signature Trésorier et Président.",
  },
  {
    icon: BarChart3,
    title: 'Les 4 chiffres du trésorier',
    text: 'Recettes, dépenses, trésorerie actuelle et impayés — visibles en permanence.',
  },
]

const COUNTRIES = [
  'Burkina Faso',
  "Côte d'Ivoire",
  'Mali',
  'Sénégal',
  'Niger',
  'Togo',
  'Bénin',
  'Guinée',
  'Autre',
]

export function Landing() {
  const { session, createAccount } = usePlatform()
  const navigate = useNavigate()
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div className="zt-landing min-h-dvh">
      {/* ------------------------------------------------------------ Header */}
      <header className="sticky top-0 z-30 border-b border-cyan-400/15 bg-[#070d18]/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
            <img
              src="/brand/zansotech-mark.png"
              alt=""
              width={360}
              height={162}
              className="zt-logo h-7 w-auto shrink-0 sm:h-8"
              aria-hidden
            />
            <span className="min-w-0 leading-none">
              <span className="zt-display block truncate text-base font-bold text-white sm:text-lg">
                AssoCaisse
              </span>
              <span className="zt-eyebrow mt-0.5 hidden text-[9px] font-medium text-slate-400 sm:block">
                par ZansoTech
              </span>
            </span>
          </div>

          {/* Labels collapse to icons below sm: at 390 px the full wording
              pushed the header past the viewport and gave the whole page a
              horizontal scroll — with three actions there is even less room. */}
          <div className="flex items-center gap-1 sm:gap-2">
            <Link
              to="/contact"
              aria-label="Nous contacter"
              className="zt-btn zt-btn-sm zt-btn-ghost"
            >
              <Mail className="size-4" />
              <span className="hidden sm:inline">Contact</span>
            </Link>

            {session ? (
              <ZButton size="sm" onClick={() => navigate('/app')}>
                Reprendre
              </ZButton>
            ) : (
              <>
                <ZButton
                  variant="glass"
                  size="sm"
                  aria-label="Se connecter"
                  onClick={() => navigate('/connexion')}
                >
                  <LogIn className="size-4" />
                  <span className="hidden sm:inline">Se connecter</span>
                </ZButton>
                <ZButton size="sm" onClick={() => setCreateOpen(true)}>
                  <span className="hidden sm:inline">Créer mon association</span>
                  <span className="sm:hidden">Créer</span>
                </ZButton>
              </>
            )}
          </div>
        </div>
      </header>

      {/* -------------------------------------------------------------- Hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(60rem 30rem at 15% -10%, rgba(0, 102, 255, 0.30) 0%, transparent 62%), radial-gradient(50rem 28rem at 100% 0%, rgba(0, 212, 255, 0.18) 0%, transparent 58%)',
          }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-6xl px-4 pt-12 pb-14 sm:px-6 sm:pt-20 sm:pb-20">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <span className="zt-eyebrow inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/8 px-3 py-1.5 text-[10px] font-semibold text-cyan-300">
                <Signal className="size-3.5" />
                Conçu pour les associations d'Afrique de l'Ouest
              </span>

              <h1 className="zt-display mt-5 text-3xl leading-[1.1] font-bold text-white sm:text-5xl">
                Arrêtez de gérer vos cotisations dans des fichiers Excel
                <span className="text-glow"> et des groupes WhatsApp.</span>
              </h1>

              <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
                Des finances transparentes et un rapport d'Assemblée Générale instantané. Membres,
                cotisations mensuelles, campagnes extraordinaires et dépenses justifiées — dans une
                seule application, pensée pour le téléphone.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ZButton size="lg" onClick={() => setCreateOpen(true)}>
                  Créer mon association
                  <ArrowRight className="size-5" />
                </ZButton>
                <ZButton size="lg" variant="glass" onClick={() => navigate('/connexion')}>
                  <LogIn className="size-5" />
                  Se connecter
                </ZButton>
              </div>

              <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-slate-300">
                {['30 jours d\'essai', 'Pensé pour le mobile', 'Montants en F CFA'].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <CheckCircle2 className="size-4 text-glow" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <HeroPreview />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- Benefits */}
      <section className="border-t border-cyan-400/10">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 className="zt-display text-center text-2xl font-bold text-white sm:text-3xl">
            Tout ce dont un bureau exécutif a besoin
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-400">
            Six outils qui remplacent le cahier de caisse, le tableur partagé et les rappels
            manuels.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.map(({ icon: Icon, title, text }) => (
              <div key={title} className="zt-glass zt-glass-hover rounded-2xl p-5">
                <span className="flex size-11 items-center justify-center rounded-xl bg-cyan-400/10 text-glow">
                  <Icon className="size-5.5" />
                </span>
                <h3 className="zt-display mt-4 font-bold text-white">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------- Roles */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="relative">
          <div
            className="pointer-events-none absolute inset-x-8 -inset-y-4 blur-3xl"
            style={{ background: 'radial-gradient(40rem 12rem at 50% 50%, rgba(0,102,255,0.22), transparent 70%)' }}
            aria-hidden
          />
          <div className="zt-glass relative overflow-hidden rounded-3xl px-6 py-12 text-center sm:px-12">
            <h2 className="zt-display text-2xl font-bold text-white sm:text-3xl">
              Deux rôles, deux mots de passe
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-300">
              Le bureau consulte les comptes en lecture seule avec le mot de passe du compte. Seul
              le Trésorier, avec son mot de passe dédié, peut enregistrer un paiement, une dépense
              ou modifier un membre.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <ZButton size="lg" onClick={() => setCreateOpen(true)}>
                Créer mon association
                <ArrowRight className="size-5" />
              </ZButton>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-cyan-400/10 py-10">
        <img
          src="/brand/zansotech-lockup.png"
          alt="ZansoTech"
          width={480}
          height={320}
          loading="lazy"
          className="zt-logo mx-auto h-20 w-auto"
        />
        <p className="mt-2 text-center text-xs text-slate-400">
          AssoCaisse — gestion d'associations, ONG, amicales et tontines. Montants en F CFA (XOF).
        </p>
        <p className="mt-3 text-center text-xs text-slate-500">
          <Link to="/connexion" className="transition hover:text-cyan-300">
            Espace association
          </Link>
          {' · '}
          <Link to="/contact" className="transition hover:text-cyan-300">
            Nous contacter
          </Link>
        </p>
      </footer>

      <CreateAssociationModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={async (input) => {
          // createAccount signs the founder in itself (read-only, as always).
          const created = await createAccount(input)
          navigate('/app')
          return created.nom
        }}
      />
    </div>
  )
}

/* --------------------------------------------------------- Creation modal */

interface CreateInput {
  nom: string
  sigle: string
  ville: string
  pays: string
  responsable: string
  dialCode: string
  telephone: string
  email: string
  motDePasseCompte: string
  motDePasseTresorier: string
  logo?: string
}

function CreateAssociationModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  onCreate: (input: CreateInput) => Promise<string>
}) {
  const toast = useToast()
  const [nom, setNom] = useState('')
  const [sigle, setSigle] = useState('')
  const [ville, setVille] = useState('')
  const [pays, setPays] = useState('Burkina Faso')
  const [responsable, setResponsable] = useState('')
  const [dialCode, setDialCode] = useState('226')
  const [telephone, setTelephone] = useState('')
  const [email, setEmail] = useState('')
  const [pwdCompte, setPwdCompte] = useState('')
  const [pwdCompte2, setPwdCompte2] = useState('')
  const [pwdTreso, setPwdTreso] = useState('')
  const [pwdTreso2, setPwdTreso2] = useState('')
  const [logo, setLogo] = useState<string | undefined>(undefined)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function validate(): string | null {
    if (!nom.trim()) return "Le nom de l'association est obligatoire."
    const problemA = passwordProblem(pwdCompte)
    if (problemA) return `Mot de passe du compte : ${problemA.toLowerCase()}`
    if (pwdCompte !== pwdCompte2) return 'Les mots de passe du compte ne correspondent pas.'
    const problemB = passwordProblem(pwdTreso)
    if (problemB) return `Mot de passe Trésorier : ${problemB.toLowerCase()}`
    if (pwdTreso !== pwdTreso2) return 'Les mots de passe Trésorier ne correspondent pas.'
    if (pwdCompte === pwdTreso) {
      return 'Le mot de passe Trésorier doit être différent de celui du compte.'
    }
    return null
  }

  async function submit() {
    const problem = validate()
    if (problem) return setError(problem)
    setBusy(true)
    const name = await onCreate({
      nom: nom.trim(),
      sigle: sigle.trim() || nom.trim().slice(0, 6).toUpperCase(),
      ville: ville.trim(),
      pays,
      responsable: responsable.trim(),
      dialCode,
      telephone: telephone.trim(),
      email: email.trim(),
      motDePasseCompte: pwdCompte,
      motDePasseTresorier: pwdTreso,
      logo,
    })
    setBusy(false)
    toast.success(`Association « ${name} » créée — essai de 30 jours`)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Créer mon association"
      subtitle="Essai gratuit de 30 jours. Tout est modifiable ensuite dans les paramètres."
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? 'Création…' : "Créer l'association"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom de l'association" required>
            <Input
              value={nom}
              onChange={(e) => {
                setNom(e.target.value)
                setError('')
              }}
              placeholder="Amicale des Anciens du Lycée 2012"
              autoFocus
            />
          </Field>
          <Field label="Sigle" hint="Affiché dans l'en-tête et sur le rapport d'AG.">
            <Input value={sigle} onChange={(e) => setSigle(e.target.value)} placeholder="AAL 2012" />
          </Field>
        </div>

        <Field label="Logo de l'association" hint="Apparaît dans l'en-tête et sur le rapport d'AG.">
          <LogoPicker value={logo} onChange={setLogo} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ville">
            <Input value={ville} onChange={(e) => setVille(e.target.value)} placeholder="Ouagadougou" />
          </Field>
          <Field label="Pays">
            <Select value={pays} onChange={(e) => setPays(e.target.value)}>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Responsable" hint="Personne à contacter pour l'abonnement.">
            <Input
              value={responsable}
              onChange={(e) => setResponsable(e.target.value)}
              placeholder="Salif Compaoré"
            />
          </Field>
          <Field label="Adresse e-mail">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tresorier@exemple.bf"
            />
          </Field>
        </div>

        <div className="grid grid-cols-[6rem_1fr] gap-3">
          <Field label="Indicatif">
            <Input
              value={dialCode}
              onChange={(e) => setDialCode(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
            />
          </Field>
          <Field label="Téléphone / WhatsApp">
            <Input
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              inputMode="tel"
              placeholder="70 12 45 89"
            />
          </Field>
        </div>

        <div className="rounded-2xl border border-navy-200 bg-navy-50/60 p-4">
          <p className="text-sm font-bold text-navy-900">Mot de passe du compte</p>
          <p className="mt-0.5 text-xs leading-relaxed text-navy-600">
            Partagé avec le bureau (Président, Secrétaire). Il ouvre l'application en lecture seule.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <PasswordInput
              value={pwdCompte}
              onChange={(e) => {
                setPwdCompte(e.target.value)
                setError('')
              }}
              placeholder="Mot de passe"
              autoComplete="new-password"
            />
            <PasswordInput
              value={pwdCompte2}
              onChange={(e) => {
                setPwdCompte2(e.target.value)
                setError('')
              }}
              placeholder="Confirmer"
              autoComplete="new-password"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-4">
          <p className="text-sm font-bold text-navy-900">Mot de passe Trésorier</p>
          <p className="mt-0.5 text-xs leading-relaxed text-navy-600">
            Connu du seul Trésorier. Il débloque l'enregistrement des paiements, des dépenses et la
            modification des membres. Il doit être différent du mot de passe du compte.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <PasswordInput
              value={pwdTreso}
              onChange={(e) => {
                setPwdTreso(e.target.value)
                setError('')
              }}
              placeholder="Mot de passe"
              autoComplete="new-password"
            />
            <PasswordInput
              value={pwdTreso2}
              onChange={(e) => {
                setPwdTreso2(e.target.value)
                setError('')
              }}
              placeholder="Confirmer"
              autoComplete="new-password"
            />
          </div>
        </div>

        {error && (
          <p className="rounded-xl bg-red-50 px-3.5 py-3 text-sm font-medium text-red-700">
            {error}
          </p>
        )}

        <p className="rounded-xl bg-navy-50 px-4 py-3 text-xs leading-relaxed text-navy-600">
          Quatre catégories de cotisation par défaut sont créées (Standard, Cadre / Soutien,
          Étudiant, Membre d'Honneur). Les données restent sur cet appareil : pensez à exporter une
          sauvegarde Excel régulièrement.
        </p>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------ Landing-only button

   The shared <Button> is built for the app's light surfaces. This page is the
   one dark canvas in the product, so it carries its own gradient/glass/ghost
   hierarchy (§5.2) rather than bending the shared component to two themes. */

function ZButton({
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'glass' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
}) {
  const sizes = { sm: 'zt-btn-sm', md: 'h-11 px-4 text-sm', lg: 'zt-btn-lg' }
  return (
    <button
      className={cx('zt-btn', `zt-btn-${variant}`, sizes[size], className)}
      {...rest}
    />
  )
}

/** Static mock of the dashboard — sells the product without loading the app. */
function HeroPreview() {
  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute -inset-6 blur-3xl"
        style={{ background: 'radial-gradient(24rem 16rem at 60% 40%, rgba(0,163,255,0.22), transparent 70%)' }}
        aria-hidden
      />
      <div className="zt-glass relative rounded-3xl p-4 shadow-2xl shadow-black/40 sm:p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400">Trésorerie actuelle</p>
            <p className="tnum zt-display mt-0.5 text-3xl font-bold text-white">
              1 284 500<span className="ml-1 text-base font-bold text-slate-400">F CFA</span>
            </p>
          </div>
          <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-xs font-bold text-cyan-300">
            À jour
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {[
            ['Recettes', '2 145 000', 'text-cyan-300'],
            ['Dépenses', '860 500', 'text-red-400'],
          ].map(([label, value, tone]) => (
            <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-[11px] font-semibold text-slate-400">{label}</p>
              <p className={`tnum mt-0.5 text-sm font-extrabold ${tone}`}>{value} F CFA</p>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-white/10 p-3">
          <p className="zt-eyebrow mb-2.5 text-[10px] font-semibold text-slate-400">
            Cotisations 2026
          </p>
          <div className="space-y-2">
            {[
              ['Amadou Diallo', [1, 1, 1, 1, 1, 1, 1, 2, 0]],
              ['Fatoumata Traoré', [1, 1, 1, 1, 2, 1, 1, 0, 0]],
              ['Aminata Ouédraogo', [1, 1, 1, 1, 1, 1, 0, 0, 0]],
              ['Cheikh Ndiaye', [1, 1, 0, 1, 1, 1, 1, 1, 0]],
            ].map(([name, cells]) => (
              <div key={name as string} className="flex items-center gap-2">
                <span className="w-24 shrink-0 truncate text-[11px] font-semibold text-slate-300 sm:w-28">
                  {name as string}
                </span>
                <div className="flex flex-1 gap-1">
                  {(cells as number[]).map((state, i) => (
                    <span
                      key={i}
                      className={`h-5 flex-1 rounded ${
                        state === 1
                          ? 'bg-gradient-to-br from-glow to-brand-600'
                          : state === 2
                            ? 'bg-amber-400'
                            : 'bg-white/10'
                      }`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-3 text-[10px] font-semibold text-slate-400">
            {[
              ['bg-gradient-to-br from-glow to-brand-600', 'Payé'],
              ['bg-amber-400', 'Partiel'],
              ['bg-white/10', 'Impayé'],
            ].map(([c, l]) => (
              <span key={l} className="flex items-center gap-1">
                <span className={`size-2.5 rounded-sm ${c}`} />
                {l}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
