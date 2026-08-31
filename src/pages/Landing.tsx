import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  Camera,
  CheckCircle2,
  FileText,
  HandCoins,
  Play,
  Signal,
  Smartphone,
  Users,
  Wallet,
} from 'lucide-react'
import { useStore } from '@/lib/store'
import { useToast } from '@/components/Toast'
import { Button, Field, Input, Modal } from '@/components/ui'

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

export function Landing() {
  const { db, loadDemo, createAssociation } = useStore()
  const navigate = useNavigate()
  const toast = useToast()
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [acronym, setAcronym] = useState('')

  function handleDemo() {
    loadDemo()
    toast.success('Données de démonstration chargées — AAAS')
    navigate('/app')
  }

  function handleCreate() {
    if (!name.trim()) return
    createAssociation(name.trim(), acronym.trim() || name.trim().slice(0, 6).toUpperCase())
    toast.success(`Association « ${name.trim()} » créée`)
    navigate('/app')
  }

  return (
    <div className="min-h-dvh bg-white">
      {/* ------------------------------------------------------------ Header */}
      <header className="sticky top-0 z-30 border-b border-navy-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand-600 text-white">
              <BarChart3 className="size-5" />
            </span>
            <span className="text-lg font-extrabold tracking-tight text-navy-900">AssoCaisse</span>
          </div>
          <div className="flex items-center gap-2">
            {db && (
              <Button variant="ghost" size="sm" onClick={() => navigate('/app')}>
                Reprendre
              </Button>
            )}
            <Button size="sm" onClick={handleDemo}>
              <Play className="size-4" />
              Explorer la démo
            </Button>
          </div>
        </div>
      </header>

      {/* -------------------------------------------------------------- Hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          style={{
            background:
              'radial-gradient(60rem 30rem at 15% -10%, #d1fae5 0%, transparent 60%), radial-gradient(50rem 28rem at 100% 0%, #e2e8f0 0%, transparent 55%)',
          }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-6xl px-4 pt-12 pb-14 sm:px-6 sm:pt-20 sm:pb-20">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
                <Signal className="size-3.5" />
                Conçu pour les associations d'Afrique de l'Ouest
              </span>

              <h1 className="mt-5 text-3xl leading-[1.1] font-extrabold tracking-tight text-navy-900 sm:text-5xl">
                Arrêtez de gérer vos cotisations dans des fichiers Excel
                <span className="text-brand-600"> et des groupes WhatsApp.</span>
              </h1>

              <p className="mt-5 max-w-xl text-base leading-relaxed text-navy-600 sm:text-lg">
                Des finances transparentes et un rapport d'Assemblée Générale instantané. Membres,
                cotisations mensuelles, campagnes extraordinaires et dépenses justifiées — dans une
                seule application, pensée pour le téléphone.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" onClick={handleDemo}>
                  <Play className="size-5" />
                  Explorer la démo
                </Button>
                <Button size="lg" variant="outline" onClick={() => setCreateOpen(true)}>
                  Créer mon association
                  <ArrowRight className="size-5" />
                </Button>
              </div>

              <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-navy-600">
                {['Aucune inscription', 'Fonctionne hors-ligne', 'Montants en FCFA'].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <CheckCircle2 className="size-4 text-brand-600" />
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
      <section className="border-t border-navy-200 bg-navy-50/60">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 className="text-center text-2xl font-extrabold tracking-tight text-navy-900 sm:text-3xl">
            Tout ce dont un bureau exécutif a besoin
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-navy-600">
            Six outils qui remplacent le cahier de caisse, le tableur partagé et les rappels
            manuels.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.map(({ icon: Icon, title, text }) => (
              <div
                key={title}
                className="rounded-2xl border border-navy-200 bg-white p-5 shadow-sm shadow-navy-900/5"
              >
                <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon className="size-5.5" />
                </span>
                <h3 className="mt-4 font-bold text-navy-900">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-navy-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- Demo band */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="overflow-hidden rounded-3xl bg-navy-900 px-6 py-12 text-center sm:px-12">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-brand-300">
            <Smartphone className="size-3.5" />
            Bac à sable — association fictive
          </span>
          <h2 className="mt-5 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            Amicale des Anciens &amp; Amis du Sahel
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-navy-300">
            14 membres, 6 mois de cotisations, 2 campagnes extraordinaires et 8 dépenses déjà
            saisies. Chargez la démo et testez l'application immédiatement, sans rien configurer.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button size="lg" onClick={handleDemo}>
              <Play className="size-5" />
              Charger les données de démo
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white/25 bg-transparent text-white hover:bg-white/10 active:bg-white/15"
              onClick={() => setCreateOpen(true)}
            >
              Partir d'une base vide
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-navy-200 py-8">
        <p className="text-center text-xs text-navy-500">
          AssoCaisse — gestion d'associations, ONG, amicales et tontines. Montants en FCFA (XOF).
        </p>
      </footer>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Créer mon association"
        subtitle="Vous pourrez tout modifier ensuite dans les paramètres."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={!name.trim()}>
              Créer
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Field label="Nom de l'association" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Association des Anciens du Lycée 2012"
              autoFocus
            />
          </Field>
          <Field label="Sigle" hint="Affiché dans l'en-tête et sur le rapport d'AG.">
            <Input
              value={acronym}
              onChange={(e) => setAcronym(e.target.value)}
              placeholder="AAL 2012"
            />
          </Field>
          <p className="rounded-xl bg-navy-50 px-4 py-3 text-xs leading-relaxed text-navy-600">
            Quatre catégories de cotisation par défaut sont créées (Standard, Cadre / Soutien,
            Étudiant, Membre d'Honneur). Les données restent sur cet appareil.
          </p>
        </div>
      </Modal>
    </div>
  )
}

/** Static mock of the dashboard — sells the product without loading the app. */
function HeroPreview() {
  return (
    <div className="relative">
      <div className="rounded-3xl border border-navy-200 bg-white p-4 shadow-2xl shadow-navy-900/10 sm:p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-navy-500">Trésorerie actuelle</p>
            <p className="tnum mt-0.5 text-3xl font-extrabold text-navy-900">
              1 284 500<span className="ml-1 text-base font-bold text-navy-400">FCFA</span>
            </p>
          </div>
          <span className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">
            À jour
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {[
            ['Recettes', '2 145 000', 'text-brand-700'],
            ['Dépenses', '860 500', 'text-red-600'],
          ].map(([label, value, tone]) => (
            <div key={label} className="rounded-xl border border-navy-200 bg-navy-50/60 p-3">
              <p className="text-[11px] font-semibold text-navy-500">{label}</p>
              <p className={`tnum mt-0.5 text-sm font-extrabold ${tone}`}>{value} FCFA</p>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-navy-200 p-3">
          <p className="mb-2.5 text-[11px] font-bold text-navy-500">COTISATIONS 2026</p>
          <div className="space-y-2">
            {[
              ['Amadou Diallo', [1, 1, 1, 1, 1, 1, 1, 2, 0]],
              ['Fatoumata Traoré', [1, 1, 1, 1, 2, 1, 1, 0, 0]],
              ['Aminata Ouédraogo', [1, 1, 1, 1, 1, 1, 0, 0, 0]],
              ['Cheikh Ndiaye', [1, 1, 0, 1, 1, 1, 1, 1, 0]],
            ].map(([name, cells]) => (
              <div key={name as string} className="flex items-center gap-2">
                <span className="w-24 shrink-0 truncate text-[11px] font-semibold text-navy-700 sm:w-28">
                  {name as string}
                </span>
                <div className="flex flex-1 gap-1">
                  {(cells as number[]).map((state, i) => (
                    <span
                      key={i}
                      className={`h-5 flex-1 rounded ${
                        state === 1 ? 'bg-brand-500' : state === 2 ? 'bg-amber-400' : 'bg-navy-200'
                      }`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-3 text-[10px] font-semibold text-navy-500">
            {[
              ['bg-brand-500', 'Payé'],
              ['bg-amber-400', 'Partiel'],
              ['bg-navy-200', 'Impayé'],
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
