import { useEffect, useRef, type ReactNode } from 'react';
import { STATS, type Stat } from '../engine/types';
import { STAT_LABEL } from '../engine/progress';
import { itemById } from '../engine/shop';

export type IconName =
  | 'today'
  | 'hero'
  | 'rewards'
  | 'settings'
  | 'flame'
  | 'plus'
  | 'edit'
  | 'up'
  | 'down'
  | 'close'
  | 'lock'
  | 'moon'
  | 'quest'
  | 'treasury'
  | 'shield'
  | 'heart'
  | 'star'
  | 'chest'
  | 'users'
  | 'copy'
  | 'drop';

const PATHS: Record<IconName, ReactNode> = {
  today: <path d="M4 6h16M4 12h16M4 18h10" />,
  hero: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
    </>
  ),
  rewards: (
    <>
      <rect x="3" y="8" width="18" height="13" rx="2" />
      <path d="M12 8v13M3 12h18M12 8c-2-4-6-4-6-1s4 1 6 1c2 0 6 2 6-1s-4-3-6 1" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1c.6.5 1.3.9 2 1.2L10 21h4l.5-2.6c.7-.3 1.4-.7 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z" />
    </>
  ),
  flame: <path d="M12 3c2 3 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-8z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" />,
  up: <path d="M6 15l6-6 6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  moon: <path d="M20 14a8 8 0 1 1-10-10 7 7 0 0 0 10 10z" />,
  quest: (
    <>
      <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
    </>
  ),
  treasury: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </>
  ),
  shield: <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  star: <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" />,
  chest: (
    <>
      <path d="M4 10h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      <path d="M4 10a8 5 0 0 1 16 0M11 13h2v3h-2z" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.5 3.3-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.6.8 2.6 2.6 3 5.2" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
    </>
  ),
  drop: <path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z" />,
};

export function Icon({ name, size = 22, color = 'currentColor' }: { name: IconName; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

export function Bar({ value, label, color, tall }: { value: number; label: string; color?: string; tall?: boolean }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={`bar ${tall ? 'tall' : ''}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <span style={{ width: `${pct}%`, ...(color ? { background: color } : {}) }} />
    </div>
  );
}

/** A segmented control for sub-views. */
export function Seg<T extends string>({ options, value, onChange, label }: { options: { id: T; label: string; locked?: boolean }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.locked && <Icon name="lock" size={12} />} {o.label}
        </button>
      ))}
    </div>
  );
}

export function Locked({ what, level, children }: { what: string; level: number; children?: ReactNode }) {
  return (
    <div className="card locked stack">
      <div className="row">
        <Icon name="lock" size={18} />
        <b>
          {what} opens at level {level}
        </b>
      </div>
      {children && <p className="small muted">{children}</p>}
    </div>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="between">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Seven-sided stat shape. */
export function Heptagon({ levels, size = 260 }: { levels: Record<Stat, number>; size?: number }) {
  const top = Math.max(5, ...STATS.map((s) => levels[s]));
  const c = 130;
  const R = 92;
  const pt = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 7;
    return [c + r * Math.cos(a), c + r * Math.sin(a)];
  };
  const ring = (f: number) => STATS.map((_, i) => pt(i, R * f).join(',')).join(' ');
  const shape = STATS.map((s, i) => pt(i, (R * levels[s]) / top).join(',')).join(' ');
  const lo = Math.min(...STATS.map((s) => levels[s]));
  const hi = Math.max(...STATS.map((s) => levels[s]));
  const label = `Stat shape: ${STATS.map((s) => `${STAT_LABEL[s]} ${levels[s]}`).join(', ')}. Highest ${hi}, lowest ${lo}.`;
  return (
    <svg width={size} height={size} viewBox="-20 -6 300 272" role="img" aria-label={label}>
      <polygon points={ring(1)} fill="none" stroke="var(--line)" />
      <polygon points={ring(0.5)} fill="none" stroke="var(--line-soft)" />
      <polygon points={shape} fill="rgba(240,160,75,0.22)" stroke="var(--accent)" strokeWidth="2" />
      {STATS.map((s, i) => {
        const [x, y] = pt(i, R + 22);
        const anchor = Math.abs(x - c) < 8 ? 'middle' : x > c ? 'start' : 'end';
        return (
          <text key={s} x={x} y={y + 4} textAnchor={anchor} fontSize="12.5" fill="var(--text)">
            {STAT_LABEL[s]} {levels[s]}
          </text>
        );
      })}
    </svg>
  );
}

/** The hero portrait, dressed in the equipped cosmetics. */
export function Avatar({ equipped, size = 64 }: { equipped: Record<string, string>; size?: number }) {
  const cloak = itemById(equipped.cloak)?.color ?? '#C9772E';
  const hat = equipped.hat;
  const item = equipped.item;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Your hero">
      <circle cx="32" cy="32" r="31" fill="var(--surface-2)" stroke="var(--accent)" strokeWidth="2" />
      <path d="M16 58c2-14 8-22 16-22s14 8 16 22z" fill={cloak} />
      <circle cx="32" cy="25" r="9" fill="#E9C9A6" />
      {hat === 'hat-hood' && <path d="M21 27c0-9 5-15 11-15s11 6 11 15c-2-6-6-8-11-8s-9 2-11 8z" fill={cloak} />}
      {hat === 'hat-circlet' && <path d="M23 21h18" stroke="#D9DEE5" strokeWidth="2.5" strokeLinecap="round" />}
      {hat === 'hat-antlers' && <path d="M26 17l-4-7m4 7l-6-3m18 3l4-7m-4 7l6-3" stroke="#B48B5E" strokeWidth="2.5" strokeLinecap="round" fill="none" />}
      {hat === 'hat-wizard' && (
        <>
          <path d="M20 19h24L34 3z" fill="#3E4A8E" />
          <circle cx="31" cy="12" r="1.3" fill="#FBE3C2" />
          <circle cx="36" cy="15" r="1" fill="#FBE3C2" />
        </>
      )}
      {hat === 'hat-crown' && <path d="M23 19l2-7 4 4 3-6 3 6 4-4 2 7z" fill="#F0C14B" />}
      {item === 'item-lantern' && (
        <>
          <path d="M50 36v4" stroke="#8C8C8C" strokeWidth="2" />
          <rect x="46" y="40" width="8" height="10" rx="2" fill="#F0A04B" stroke="#8C8C8C" />
        </>
      )}
      {item === 'item-staff' && <path d="M50 20v38" stroke="#8B6A44" strokeWidth="3" strokeLinecap="round" />}
      {item === 'item-tome' && <rect x="44" y="42" width="10" height="12" rx="1.5" fill="#6B4E8E" stroke="#C9B8E0" />}
    </svg>
  );
}

export function StatChips({ value, onChange, max = 2 }: { value: Stat[]; onChange: (v: Stat[]) => void; max?: number }) {
  return (
    <div className="chips" role="group" aria-label="Stats">
      {STATS.map((s) => {
        const on = value.includes(s);
        return (
          <button
            key={s}
            type="button"
            className={`chip ${on ? 'on' : ''}`}
            aria-pressed={on}
            onClick={() => {
              if (on) onChange(value.filter((x) => x !== s));
              else onChange(value.length >= max ? [...value.slice(1), s] : [...value, s]);
            }}
          >
            {STAT_LABEL[s]}
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ Phase 2 art

/** Simple portraits for the three weekly bosses. */
export function BossArt({ boss, size = 96, hurt = 0 }: { boss: import('../engine/types').BossId; size?: number; hurt?: number }) {
  const shake = hurt > 0.66 ? 'boss-art low' : 'boss-art';
  return (
    <svg className={shake} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`${boss} portrait`}>
      <circle cx="50" cy="50" r="48" fill="var(--surface-2)" />
      {boss === 'slothWyrm' && (
        <>
          <path d="M18 70c6-18 22-22 32-14s22 10 30-4" stroke="#7A9A5A" strokeWidth="12" strokeLinecap="round" fill="none" />
          <path d="M70 40c8-6 16-2 16 6s-8 10-14 8" fill="#7A9A5A" />
          <path d="M76 44h6" stroke="#2A3320" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M24 66l-4-6M34 58l-2-7M46 58l1-7" stroke="#A9C27E" strokeWidth="3" strokeLinecap="round" />
          <text x="84" y="30" fontSize="10" fill="var(--muted)">z</text>
          <text x="90" y="22" fontSize="8" fill="var(--muted)">z</text>
        </>
      )}
      {boss === 'procrastinaut' && (
        <>
          <circle cx="50" cy="44" r="22" fill="#C9CCE8" stroke="#7C7FB8" strokeWidth="3" />
          <rect x="36" y="36" width="28" height="16" rx="8" fill="#2D2F52" />
          <circle cx="50" cy="44" r="5" fill="none" stroke="#F0A04B" strokeWidth="2" />
          <path d="M50 41v3l2 1" stroke="#F0A04B" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M32 66h36l4 18H28z" fill="#9EA2D2" />
          <path d="M44 70h12" stroke="#2D2F52" strokeWidth="3" strokeLinecap="round" />
        </>
      )}
      {boss === 'goldGremlin' && (
        <>
          <path d="M28 40l-10-12 16 6M72 40l10-12-16 6" fill="#8E7A3A" />
          <circle cx="50" cy="52" r="24" fill="#8E7A3A" />
          <circle cx="41" cy="48" r="4" fill="#F0E28A" />
          <circle cx="59" cy="48" r="4" fill="#F0E28A" />
          <path d="M40 62q10 7 20 0" stroke="#3A3018" strokeWidth="3" fill="none" strokeLinecap="round" />
          <circle cx="76" cy="74" r="9" fill="#F0C14B" stroke="#B88A1E" strokeWidth="2" />
          <text x="72.5" y="78" fontSize="10" fontWeight="700" fill="#7A5A10">G</text>
        </>
      )}
    </svg>
  );
}

/** A pet: its species, ringed in its hatching-potion color. */
export function PetBadge({ species, potion, size = 44, unknown }: { species?: import('../engine/types').Species; potion?: import('../engine/types').PotionColor; size?: number; unknown?: boolean }) {
  const sp = species ? SPECIES_EMOJI[species] : '?';
  const ring = potion ? POTION_COLOR[potion] : 'var(--line)';
  return (
    <span className="pet-badge" style={{ width: size, height: size, borderColor: ring, fontSize: size * 0.5, opacity: unknown ? 0.35 : 1 }} aria-hidden="true">
      {unknown ? '?' : sp}
    </span>
  );
}

const SPECIES_EMOJI: Record<string, string> = { bear: '🐻', stag: '🦌', hare: '🐇', tortoise: '🐢', fox: '🦊', owl: '🦉', beaver: '🦫', butterfly: '🦋', wolf: '🐺', raccoon: '🦝' };
const POTION_COLOR: Record<string, string> = { ember: '#E0823A', moss: '#6E9E4A', frost: '#7FB3D9' };

/** Line icon for a gear slot. */
export function GearIcon({ slot, size = 22, color = 'currentColor' }: { slot: import('../engine/types').ItemSlot; size?: number; color?: string }) {
  const paths: Record<string, ReactNode> = {
    head: <path d="M5 15a7 7 0 0 1 14 0v3H5zM9 18v-3h6v3" />,
    chest: <path d="M8 4l4 2 4-2 4 4-3 2v10H7V10L4 8z" />,
    legs: <path d="M7 4h10l-1 16h-3l-1-9-1 9H8z" />,
    hands: <path d="M8 20v-8l-2-3 1-1 3 2V5h2v6V4h2v7V5h2v8l2-2 1 1-3 5v3z" />,
    feet: <path d="M7 4h4v10l7 3v3H6z" />,
    weapon: <path d="M14 4h6v6L9 21l-3-3zM5 15l4 4M4 20l2-2" />,
    offhand: <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />,
    trinket: (
      <>
        <circle cx="12" cy="14" r="5" />
        <path d="M9 4h6l-3 5z" />
      </>
    ),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      {paths[slot]}
    </svg>
  );
}
