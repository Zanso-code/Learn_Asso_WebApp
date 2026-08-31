import { Link } from 'react-router-dom'

/**
 * The AssoCaisse / ZansoTech lockup for the public light pages (login,
 * contact) — mark, product name, vendor line, linked back to the landing page.
 *
 * The artwork has a real alpha channel, so the mark sits directly on the light
 * header — no plate, no blend mode. The landing page keeps its own version for
 * the dark canvas, where the wordmark is white rather than navy.
 */
export function BrandLockup() {
  return (
    <Link to="/" className="flex min-w-0 items-center gap-2.5">
      <img
        src="/brand/zansotech-mark.png"
        alt=""
        width={360}
        height={162}
        className="h-7 w-auto shrink-0"
        aria-hidden
      />
      <span className="min-w-0 leading-none">
        <span className="block truncate text-lg font-extrabold tracking-tight text-navy-900">
          AssoCaisse
        </span>
        <span className="mt-0.5 block font-display text-[9px] font-medium tracking-[0.1em] text-navy-500 uppercase">
          par ZansoTech
        </span>
      </span>
    </Link>
  )
}
