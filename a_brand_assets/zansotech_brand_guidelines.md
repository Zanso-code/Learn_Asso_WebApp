# ZANSOTECH — Brand Identity & Visual Guidelines
**Version 1.0** | *Visual Design System & Brand Manual*

---

## 1. Brand Essence & Story

### 1.1 Brand Mission
> **"Empowering progress through sharp technological innovation, high-performance digital engineering, and resilient systems."**

**ZANSOTECH** stands at the intersection of future-facing technology and robust real-world execution. The brand conveys speed, high precision, visionary architecture, and unshakeable structural integrity.

### 1.2 Brand Attributes & Keywords
| Attribute | Meaning in Visual Language |
| :--- | :--- |
| **Velocity & Agility** | Sharp angular lines, aerodynamic wingtips of the 'Z' mark. |
| **Precision & Mastery** | Geometric facets, sharp chamfers, and balanced volumetric lighting. |
| **Innovation & Power** | Luminescent electric cyan highlights, energetic metallic blues. |
| **Reliability & Trust** | Deep royal navy foundation, solid structural typography. |

---

## 2. Logo Anatomy & Visual Rules

```
                      ┌────────────────────────────────────────┐
                      │              THE LOGOMARK              │
                      │   (Aerodynamic 3D Faceted "Z" Emblem)  │
                      └───────────────────┬────────────────────┘
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │              THE WORDMARK              │
                      │    (Custom Geometric "ZANSOTECH" Type) │
                      └────────────────────────────────────────┘
```

### 2.1 Logo Lockup Variations
1. **Primary Vertical Lockup (Master Mark):**
   - The 3D metallic "Z" emblem centered above the "ZANSOTECH" wordmark.
   - Used for splash screens, primary brand presentations, executive documents, and merchandise.
2. **Horizontal Lockup:**
   - The "Z" emblem on the left, followed by the "ZANSOTECH" wordmark on the right.
   - Ideal for website headers, navigation bars, email signatures, and corporate letterheads.
3. **Standalone Logomark (App Icon / Favicon):**
   - The "Z" emblem alone inside a circular or squircle container with a deep space navy/black background.
   - Used for mobile app icons, browser favicons, social media profile avatars.
4. **Monochrome / Single-Color Flat Versions:**
   - **Solid White (#FFFFFF)** on dark substrates.
   - **Solid Electric Blue (#0066FF)** on neutral backgrounds.
   - **Solid Pitch Black (#0A0E17)** for physical stamping, monochrome invoices, or engraving.

### 2.2 Clear Space & Margin Protection
- Maintain a minimum exclusion zone of **1X** (where **X** equals the height of the letter "Z" in the wordmark) around all sides of the logo.
- No text, UI icons, or busy photography may encroach into this clear space.

```
       ┌────────────────────────────────────────────────────────┐
       │   [ X ]                                          [ X ] │
       │         ┌───────────────────────────────────┐          │
       │         │                 Z                 │          │
       │   [ X ] │             ZANSOTECH             │    [ X ] │
       │         └───────────────────────────────────┘          │
       │   [ X ]                                          [ X ] │
       └────────────────────────────────────────────────────────┘
```

### 2.3 Minimum Reproduction Sizes
- **Digital Screen:** Minimum height of **40px** for the combined vertical lockup; **24px** for the horizontal lockup; **16px** for the standalone favicon mark.
- **Print Material:** Minimum height of **18mm** for the master lockup to preserve bevel and text legibility.

---

## 3. Color Palette & Token Specifications

The ZANSOTECH palette is built upon a high-energy cyber-metallic gradient spectrum, anchored by deep cosmic tones and illuminated by electric cyan accents.

### 3.1 Primary Brand Colors

| Color Name | Swatch Code | HEX | RGB | CMYK | HSL | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Electric Cyan** | `primary-glow` | `#00D4FF` | `0, 212, 255` | `65, 0, 0, 0` | `190°, 100%, 50%` | Specular highlights, active states, glows, hero CTA buttons. |
| **Zanso Royal Blue** | `primary-main` | `#0066FF` | `0, 102, 255` | `85, 60, 0, 0` | `216°, 100%, 50%` | Core brand color, primary links, key UI surfaces. |
| **Cobalt Deep** | `primary-dark` | `#0038A8` | `0, 56, 168` | `98, 80, 0, 5` | `220°, 100%, 33%` | Gradient shading, secondary headers, dark UI borders. |
| **Cosmic Void Navy** | `neutral-dark` | `#070D18` | `7, 13, 24` | `90, 80, 50, 75` | `219°, 55%, 6%` | Primary dark-mode canvas, deep container surfaces. |
| **Pure Sheen White** | `neutral-light` | `#FFFFFF` | `255, 255, 255` | `0, 0, 0, 0` | `0°, 0%, 100%` | High-contrast typography, specular glints, clean canvas. |

### 3.2 Gradient Formulas

```css
/* Master Metallic Chrome Gradient */
--zanso-chrome-gradient: linear-gradient(
  135deg,
  #00D4FF 0%,
  #0080FF 25%,
  #0044CC 60%,
  #002080 85%,
  #00E5FF 100%
);

/* Dark Cyber Glass Background */
--zanso-dark-canvas: radial-gradient(
  circle at 50% 20%,
  #0B1933 0%,
  #070D18 70%,
  #03060B 100%
);

/* Subtle Surface Glass Border */
--zanso-glass-border: linear-gradient(
  135deg,
  rgba(0, 212, 255, 0.4) 0%,
  rgba(0, 102, 255, 0.1) 50%,
  rgba(255, 255, 255, 0.05) 100%
);
```

---

## 4. Typography System

The typography reflects the forward-slanting, engineered nature of the logo: clean, high-legibility geometric sans-serif with modern tech characteristics.

### 4.1 Primary Display Typeface (Headings & Hero Statements)
- **Font Family:** **`Orbitron`** / **`Rajdhani`** / **`Syncopate`** / **`Space Grotesk`**
- **Characteristics:** Wide geometric proportion, technical precision, high-impact presence.
- **Weights:** Medium (500), SemiBold (600), Bold (700), Black (900).
- **Styling:** Subtle uppercase tracking (`letter-spacing: 0.05em` to `0.1em`).

### 4.2 Primary Body & Interface Typeface (UI & Extended Reading)
- **Font Family:** **`Inter`** / **`Plus Jakarta Sans`**
- **Characteristics:** Clean optical kerning, superior rendering across mobile screens, extensive weights for UI hierarchy.
- **Weights:** Regular (400), Medium (500), SemiBold (600).

### 4.3 Code & Data Typeface (Metrics, Financial Figures, Code)
- **Font Family:** **`JetBrains Mono`** / **`Fira Code`**
- **Characteristics:** Tabular figures for financial accuracy, crisp developer aesthetics.

```css
/* Typography Scale Tokens */
--font-display: 'Space Grotesk', 'Rajdhani', sans-serif;
--font-body: 'Inter', system-ui, -apple-system, sans-serif;
--font-mono: 'JetBrains Mono', monospace;

/* Type Scale */
--text-hero: clamp(2.5rem, 5vw, 4.5rem); /* Line height: 1.1 */
--text-h1: clamp(2rem, 3.5vw, 3rem);     /* Line height: 1.2 */
--text-h2: clamp(1.5rem, 2.5vw, 2.25rem); /* Line height: 1.25 */
--text-h3: 1.25rem;                       /* Line height: 1.4 */
--text-body: 1rem;                        /* Line height: 1.6 */
--text-caption: 0.8125rem;                /* Line height: 1.5 */
```

---

## 5. UI/UX Design System & Digital Components

### 5.1 Glassmorphism & Dark Mode Aesthetics
- **Dark Theme Priority:** Surfaces use dark navy-black glass with subtle cyan edge illumination (`backdrop-filter: blur(16px)`).
- **Cards & Containers:**
  - Background: `rgba(11, 25, 51, 0.75)`
  - Border: `1px solid rgba(0, 212, 255, 0.18)`
  - Hover Effect: Soft cyan glow (`box-shadow: 0 0 24px rgba(0, 163, 255, 0.25)`) with a `translateY(-2px)` elevation.

### 5.2 Button Hierarchy
1. **Primary Action (Electric Blue Glow):**
   - Background: `linear-gradient(135deg, #00D4FF 0%, #0066FF 100%)`
   - Text: High-contrast White `#FFFFFF` (font-weight: 600)
   - Glow: `box-shadow: 0 4px 18px rgba(0, 102, 255, 0.4)`
2. **Secondary / Glass Action:**
   - Background: `rgba(0, 102, 255, 0.08)`
   - Border: `1px solid rgba(0, 212, 255, 0.3)`
   - Text: `#00D4FF`
3. **Ghost / Tertiary Action:**
   - Background: Transparent
   - Text: `#94A3B8` (Hover: `#FFFFFF`)

---

## 6. Imagery & Visual Assets Guidelines

- **3D Tech Visuals:** Use metallic rendering, dynamic isometric architecture, deep blue data visualizations, and glass reflections.
- **Photography Style:** High contrast, cool-toned lighting with cyan or royal blue ambient light gels.
- **Avoid:** Warm vintage filters, low-contrast washed-out tones, or cluttered clipart.

---

## 7. Logo Misuse & Co-Branding Rules

> [!CAUTION]
> To protect brand equity and visual strength, never apply the following transformations:

- ❌ **Do not distort or stretch:** Never change the aspect ratio or slant angle of the "Z".
- ❌ **Do not alter colors arbitrarily:** Do not use red, yellow, or unapproved gradients for the metallic logo.
- ❌ **Do not place on low-contrast busy backgrounds:** Always ensure an adequate contrast ratio (minimum 4.5:1).
- ❌ **Do not recreate the typography:** Always use the official vector wordmark artwork.
- ❌ **Do not remove or alter specular highlights:** The directional light gleams are part of the trademark identity.

---

## 8. Brand Tone of Voice

- **Tone:** Confident, visionary, clear, highly competent, and empowering.
- **Pillars:**
  - **Clarity over Jargon:** Explain cutting-edge technology with razor-sharp simplicity.
  - **Reliability:** Speak with the certainty of an engineering firm.
  - **Empowerment:** Emphasize high performance, growth, and digital independence for clients and communities.
