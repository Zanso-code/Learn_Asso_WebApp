# MISSION BRIEF: West African Association & NGO Management SaaS (MVP)

You are an expert full-stack engineer and UI/UX designer. Your task is to build a production-ready, mobile-first MVP of a web application designed for associations, NGOs, alumni networks, and community tontines in West Africa to manage members, monthly dues, extraordinary contributions, expenses with receipt capture, and General Assembly (AG) financial reports.

---

## 1. PROJECT CONTEXT & DESIGN CONSTRAINTS

- **Target Audience:** Association treasurers, presidents, and secretaries in West Africa (Burkina Faso).
- **Default Currency:** XOF / FCFA (format: `50 000 FCFA` with space separators).
- **Network / Bandwidth:** Must be lightweight and fast on 3G/4G connections. Receipts must be compressed client-side before upload (< 150 KB).
- **Mobile-First:** 80%+ of users will use this on smartphones or tablets during meetings.
- **Language Support:** French by default,no translation needed,just make sure the  terminology options are correct for West Africa (e.g., *Cotisations, Dépenses, Assemblée Générale*).

---

## 2. RECOMMENDED TECH STACK

- **Framework:** Next.js (App Router, TypeScript) or React + Vite + Tailwind CSS.
- **UI & Icons:** Tailwind CSS, Lucide React, Shadcn/Radix UI components (clean, high-contrast, accessible).
- **State & Storage:** 
  - For local/demo MVP: Embedded SQLite / Prisma OR Supabase / IndexedDB / LocalStorage with realistic West African mock seed data so the app runs out-of-the-box with zero initial setup friction.
- **Image Compression:** `browser-image-compression` or native Canvas image downscaling (max 1024px width, 70% JPEG quality) before saving.
- **PDF / Print Support:** Native print CSS styling (`@media print`) and PDF export for General Assembly (AG) compliance sheets.

---

## 3. CORE MVP MODULES & REQUIREMENTS

### Module 0: Landing Page & Onboarding
- **Hero Section:** Clear value proposition ("Stop managing association dues in messy Excel sheets and WhatsApp groups. Transparent finances & instant AG reports.").
- **Key Benefits Grid:** Member Registry, Dues Matrix, Special Campaigns, Expense tracking with receipts, 1-Click AG Report.
- **Demo Sandbox / Sample Association:** Button to "Load Demo Data" (e.g., *Association des Anciens du Lycée 2012* or *Bobo 2012 Youth*) so visitors can immediately test the dashboard.
- **Call-to-Action:** "Create Association" or "Explore Demo".

---

### Module 1: Member Registry & Category-Based Dues
- **Member Fields:**
  - `Full Name`
  - `Phone Number` (with an international country code prefix selector,with a direct WhatsApp message shortcut)
  - `Membership Category` (e.g., *Standard*: 1000 FCFA/mo, *Student*: 250 FCFA/mo, *Honorary/Retiree*: 500 FCFA/mo)
  - `Join Date`
  - `Status` (Active / Inactive toggle)
- **Category Configuration:** Simple modal to add/edit categories and their respective monthly due amount.
- **List View:** Fast search by name/phone, filter by Category or Active/Inactive status. Quick stats on total active vs inactive members.

---

### Module 2: Dues Tracking & Running Statements
- **Monthly Matrix View:** A 12-month visual grid (Jan – Dec) for the selected year showing Paid / Unpaid / Partial indicators per member.
- **1-Click Payment Recording:** Click any month cell on a member row to toggle paid or enter an amount with date & payment method (Cash, Orange Money, Wave, MTN MoMo, Bank Transfer).
- **"Who Owes What" Arrears List:** Automated calculation showing members with pending balances, sorted by highest debt, with a "Copy WhatsApp Reminder" button generating a polite message with the exact amount owed.
- **Per-Member Running Statement (Relevé individuel):**
  - Modal or page showing a member's complete payment history across all months and extraordinary contributions.
  - Printable / shareable single-member receipt.

---

### Module 3: Extraordinary Contributions (Cotisations Extraordinaires)
- **Campaign Model:** Record one-off levies separate from regular monthly dues (e.g., *Annual Gala Dinner*, *Community Borehole Project*, *Member Bereavement / Obsèques*).
- **Campaign Fields:** Title, Description, Target Amount, Deadline, Status (Open / Closed).
- **Progress Bar:** Visual % of target collected vs target amount.
- **Contribution Log:** Record contributions from members (or external donors) with Date, Contributor Name, Amount, and Note.

---

### Module 4: Expense Management & Receipt Capture
- **Fields:** Amount, Category (Logistics, Catering, Charity/Aid, Office Supplies, Transport, Honoraria, Other), Date, Description / Beneficiary.
- **Receipt Capture via Camera:**
  - `<input type="file" accept="image/*" capture="environment">` allowing direct mobile camera capture or gallery selection.
  - **Crucial:** Client-side image compression down to < 150 KB before storing/uploading.
  - Receipt preview thumbnail and zoom modal.

---

### Module 5: Executive Dashboard & General Assembly (AG) Report
- **The "Treasurer's 4 Key Numbers" Cards:**
  1. **Total Income Collected:** (Dues + Extraordinary Contributions)
  2. **Total Expenses Spent:**
  3. **Current Net Balance (Trésorerie Actuelle):** (Income − Expenses)
  4. **Total Outstanding Dues (Impayés):** (Sum of all arrears)
- **Quick Charts / Summaries:** Income vs Expenses breakdown and monthly trends.
- **AG Compliance Report (Rapport Financier AG):**
  - Dedicated "Print AG Report" / "Export PDF" view.
  - Clean, professional header with Association Name, Date, Prepared by Treasurer.
  - Formatted summary table + categorized expense table + outstanding dues roster.
  - Signature blocks for *Le Trésorier Général* and *Le Président*.
  - Optimized for standard A4 printing.

---

### Module 6: Lightweight 2-Role System (No complex RBAC)
- **Roles:**
  - `Treasurer (Admin)`: Full read and write access (create/edit/delete members, log dues, log expenses, manage campaigns).
  - `President / Secretary (Viewer)`: Read-only access to all dashboards, reports, running statements, and campaign progress. No edit buttons visible.
- Provide a simple role switcher toggle in the header/settings to seamlessly demonstrate both roles during testing and demos.

---

## 4. SAMPLE SEED DATA

Pre-populate the demo database with realistic data:
- **Association:** "Amicale des Anciens & Amis du Sahel (AAAS)"
- **Categories:** Standard (5 000 FCFA), Cadre / Supporter (10 000 FCFA), Étudiant (2 000 FCFA), Membre d'Honneur (0 FCFA)
- **10+ Members** with typical West African names (e.g., Amadou Diallo, Fatoumata Traoré, Koffi Mensah, Aminata Ouedraogo, Cheikh Ndiaye, Awa Ba).
- **Dues Records** spanning the last 6 months with realistic mix of paid/unpaid statuses.
- **2 Extraordinary Campaigns:** "Fonds d'Urgence Solidarité" (Goal: 500 000 FCFA, 350 000 raised) and "Rénovation Bibliothèque Communautaire" (Goal: 1 200 000 FCFA, 800 000 raised).
- **6+ Expenses** with mock receipt placeholders.

---

## 5. UI/UX GUIDELINES

1. Clean, modern, high-contrast visual design (rich emerald green `#059669` / navy blue `#0f172a` accents symbolizing financial trust and African vibrancy).
2. Fully responsive navigation: Top bar for desktop, Bottom navigation bar for mobile devices.
3. Fast modals for quick actions: "+ Add Payment", "+ New Member", "+ Add Expense".
4. Toast notifications for every action (e.g., "Payment of 5 000 FCFA recorded for Amadou Diallo").

---

## 6. EXECUTION INSTRUCTIONS

1. Scaffolding: Initialize the project with Next.js / Vite, Tailwind CSS, Lucide icons, and required utilities.
2. Build data model and local seed mock store.
3. Implement image compression utility for mobile camera uploads.
4. Implement all 6 modules + Landing page + Printable AG Report.
5. Verify build integrity (`npm run build` or dev test) and ensure zero runtime errors.

Proceed step-by-step and create the full application.

---

## 7. DEV ENVIRONMENT: MCP SERVER SETUP

Notes for setting this repo up on a new machine. The Claude Code plugins
(`github`, `supabase`, `vercel`, `playwright`) are enabled in the user-level
`~/.claude/settings.json`, but their MCP servers each need credentials.

### GitHub — requires a CLASSIC personal access token

The GitHub MCP server reads its credential from the `GITHUB_PERSONAL_ACCESS_TOKEN`
environment variable (`Authorization: Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}`).
It is **not** an OAuth flow — `/mcp` will not fix it.

**Gotcha:** a *fine-grained* token (`github_pat_...`) is rejected with
`400 Bad Request`. Use a **classic** token (`ghp_...`) from
<https://github.com/settings/tokens/new> with scopes `repo` and `read:org`.

Symptoms, in order of progress:

| Error | Meaning |
| --- | --- |
| `Authorization header is badly formatted` | env var is unset |
| `400 Bad Request` | env var is set but the token is fine-grained |
| _connects_ | classic token with `repo` + `read:org` |

Set it on Windows without leaking the value into shell history:

```powershell
$t = Read-Host "Paste classic GitHub PAT" -AsSecureString
[Environment]::SetEnvironmentVariable(
  'GITHUB_PERSONAL_ACCESS_TOKEN',
  [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($t)),
  'User')
```

Restart the Claude desktop app afterwards — env vars are read at launch.

### Vercel and Supabase — OAuth via `/mcp`

Both are HTTP MCP servers (`mcp.vercel.com`, `mcp.supabase.com/mcp`) using OAuth.
Authorize them from an **interactive terminal**, not the desktop Code tab:

```bash
cd <repo root> && claude    # then type /mcp, pick the server, choose Authenticate
```

Credentials are stored in `~/.claude/.credentials.json` and shared with the
desktop app after a restart.

### Vercel project linking

`vercel connect` is unrelated to MCP auth — it mints third-party tokens for a
deployed app at runtime. Ignore it for local setup.

The repo is already linked: `.vercel/repo.json` holds project `assocaisse`
(`prj_mvobjwffukpUU3oyTQDfFaff82lI`) under org `team_YdMpV4SkHf2UYigbW993ZUvl`.

**Open issue:** the Vercel MCP tools still cannot read that org. `list_teams`
returns `[]` and `list_projects` fails even when passed the real `orgId`, which
means the OAuth grant covers the personal scope only. To fix, re-run `/mcp` ->
vercel -> Authenticate and grant access to the **team** on Vercel's consent
screen. Until then, use the `vercel` CLI for deployment inspection.

### Notes

- Supabase project: `Zanso-code's Project_Saas` (`gvnxducufocfhekcmwmk`, eu-west-3).
- A claude.ai Supabase connector may already be present, giving two paths to the
  same project. Harmless but redundant; disable one via `/mcp` if tool names clash.
- `.agents/mcp_config.json` is gitignored and currently empty — safe to delete.
