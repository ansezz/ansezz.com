// Public list prices for the self-hosting cost calculator. One file, so a
// price check means editing only this file and PRICES_VERIFIED.
//
// All prices are USD per month, excluding VAT and sales tax, as listed on
// each provider's public pricing page on the date below. Every number is
// editable on the page, because prices change and regions differ.

export const PRICES_VERIFIED = "2026-10-05";
export const PRICES_VERIFIED_LABEL = "October 5, 2026";

export interface Source {
  label: string;
  url: string;
}

export interface VpsPlan {
  id: string;
  label: string;
  vcpu: number;
  ramGb: number;
  diskGb: number;
  /** Monthly price for the server itself. */
  price: number;
  /** Extra monthly cost per server for a public IPv4 address. */
  ipv4: number;
  /** Outbound traffic included per server, GB. */
  includedGb: number;
  /** Price per GB over the included traffic. */
  overagePerGb: number;
  /** Automatic server backups, as a percent of the server price. */
  backupPct: number;
  note?: string;
  source: Source;
}

const HETZNER_PRICES: Source = {
  label: "Hetzner price adjustment, 15 June 2026 (Germany/Finland, USD)",
  url: "https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/",
};

export const VPS_PLANS: VpsPlan[] = [
  {
    id: "hetzner-cx33",
    label: "Hetzner CX33 (4 vCPU, 8 GB)",
    vcpu: 4,
    ramGb: 8,
    diskGb: 80,
    price: 9.99,
    ipv4: 0.6,
    includedGb: 20_000,
    overagePerGb: 0.0012,
    backupPct: 20,
    note: "Cost-Optimized line. Hetzner showed it as currently not available on its cloud page on the verified date.",
    source: HETZNER_PRICES,
  },
  {
    id: "hetzner-cax21",
    label: "Hetzner CAX21 (4 Arm vCPU, 8 GB)",
    vcpu: 4,
    ramGb: 8,
    diskGb: 80,
    price: 12.49,
    ipv4: 0.6,
    includedGb: 20_000,
    overagePerGb: 0.0012,
    backupPct: 20,
    note: "Arm. Check that your images have Arm builds. Same availability note as CX.",
    source: HETZNER_PRICES,
  },
  {
    id: "hetzner-cx43",
    label: "Hetzner CX43 (8 vCPU, 16 GB)",
    vcpu: 8,
    ramGb: 16,
    diskGb: 160,
    price: 18.49,
    ipv4: 0.6,
    includedGb: 20_000,
    overagePerGb: 0.0012,
    backupPct: 20,
    note: "Cost-Optimized line, same availability note as CX33.",
    source: HETZNER_PRICES,
  },
  {
    id: "hetzner-cpx32",
    label: "Hetzner CPX32 (4 vCPU, 8 GB)",
    vcpu: 4,
    ramGb: 8,
    diskGb: 160,
    price: 41.99,
    ipv4: 0.6,
    includedGb: 20_000,
    overagePerGb: 0.0012,
    backupPct: 20,
    note: "Regular Performance line, the one you can usually order today.",
    source: HETZNER_PRICES,
  },
  {
    id: "do-basic-8",
    label: "DigitalOcean Basic (4 vCPU, 8 GiB)",
    vcpu: 4,
    ramGb: 8,
    diskGb: 160,
    price: 48,
    ipv4: 0,
    includedGb: 5_000,
    overagePerGb: 0.01,
    backupPct: 20,
    note: "Backups: 20% weekly, 30% daily.",
    source: {
      label: "DigitalOcean Droplet pricing",
      url: "https://www.digitalocean.com/pricing/droplets",
    },
  },
  {
    id: "do-basic-16",
    label: "DigitalOcean Basic (8 vCPU, 16 GiB)",
    vcpu: 8,
    ramGb: 16,
    diskGb: 320,
    price: 96,
    ipv4: 0,
    includedGb: 6_000,
    overagePerGb: 0.01,
    backupPct: 20,
    source: {
      label: "DigitalOcean Droplet pricing",
      url: "https://www.digitalocean.com/pricing/droplets",
    },
  },
];

/** Coolify. Self-hosted is free; Coolify Cloud runs the control panel for you. */
export const COOLIFY = {
  /** Coolify's documented minimum for the server it runs on. */
  selfHostedRamGb: 2,
  cloudBase: 5,
  cloudIncludedServers: 2,
  cloudPerExtraServer: 3,
  sources: [
    { label: "Coolify pricing", url: "https://coolify.io/pricing/" },
    {
      label: "Coolify installation (minimum 2 cores, 2 GB RAM)",
      url: "https://coolify.io/docs/get-started/installation",
    },
  ] as Source[],
};

export interface Tier {
  ramGb: number;
  price: number;
  label: string;
}

export interface ManagedPlatform {
  id: string;
  label: string;
  /** Flat monthly fee for the workspace or plan. */
  platformFee: number;
  /** Usage credit included in the fee (usage-based platforms). */
  includedCredit: number;
  /** Tiers for a web or worker service, smallest first. */
  service: Tier[];
  postgres: Tier[];
  redis: Tier[];
  /** Linear pricing instead of tiers (Railway). */
  perGbRam?: number;
  perVcpu?: number;
  dbStoragePerGb: number;
  includedGb: number;
  overagePerGb: number;
  notes: string[];
  sources: Source[];
}

export const MANAGED: ManagedPlatform[] = [
  {
    id: "render",
    label: "Render (Pro workspace)",
    platformFee: 25,
    includedCredit: 0,
    service: [
      { ramGb: 0.5, price: 7, label: "0.5 CPU, 512 MB" },
      { ramGb: 2, price: 25, label: "1 CPU, 2 GB" },
      { ramGb: 4, price: 85, label: "2 CPU, 4 GB" },
      { ramGb: 8, price: 135, label: "2 CPU, 8 GB" },
      { ramGb: 16, price: 200, label: "2 CPU, 16 GB" },
    ],
    postgres: [
      { ramGb: 0.25, price: 6, label: "256 MB" },
      { ramGb: 1, price: 19, label: "0.5 CPU, 1 GB" },
      { ramGb: 2, price: 40, label: "1 CPU, 2 GB" },
      { ramGb: 4, price: 55, label: "1 CPU, 4 GB" },
      { ramGb: 8, price: 100, label: "2 CPU, 8 GB" },
      { ramGb: 16, price: 160, label: "2 CPU, 16 GB" },
    ],
    redis: [
      { ramGb: 0.25, price: 10, label: "256 MB" },
      { ramGb: 1, price: 20, label: "1 GB" },
      { ramGb: 3, price: 60, label: "3 GB" },
    ],
    dbStoragePerGb: 0.3,
    includedGb: 25,
    overagePerGb: 0.15,
    notes: [
      "Pro workspace is $25 a month plus compute. Background workers cost the same as web services.",
      "Postgres storage is $0.30 per GB on top of the instance.",
    ],
    sources: [{ label: "Render pricing", url: "https://render.com/pricing" }],
  },
  {
    id: "railway",
    label: "Railway (Pro)",
    platformFee: 20,
    includedCredit: 20,
    service: [],
    postgres: [],
    redis: [],
    perGbRam: 10,
    perVcpu: 20,
    dbStoragePerGb: 0.15,
    includedGb: 0,
    overagePerGb: 0.05,
    notes: [
      "Railway bills what you use: $10 per GB of RAM and $20 per vCPU per month, metered by the minute. The $20 fee includes $20 of usage.",
      "Databases run as services with a volume at $0.15 per GB a month.",
    ],
    sources: [
      { label: "Railway pricing", url: "https://railway.com/pricing" },
      {
        label: "Railway plans and resource prices",
        url: "https://docs.railway.com/reference/pricing/plans",
      },
    ],
  },
  {
    id: "heroku",
    label: "Heroku",
    platformFee: 0,
    includedCredit: 0,
    service: [
      { ramGb: 0.5, price: 25, label: "Standard-1X, 512 MB" },
      { ramGb: 1, price: 50, label: "Standard-2X, 1 GB" },
      { ramGb: 2.5, price: 250, label: "Performance-M, 2.5 GB" },
      { ramGb: 14, price: 500, label: "Performance-L, 14 GB" },
    ],
    postgres: [
      { ramGb: 1, price: 20, label: "Essential-2, shared" },
      { ramGb: 4, price: 50, label: "Standard-0, 4 GB" },
      { ramGb: 8, price: 200, label: "Standard-2, 8 GB" },
      { ramGb: 15, price: 400, label: "Standard-3, 15 GB" },
    ],
    redis: [
      { ramGb: 0.05, price: 15, label: "Premium-0, 50 MB" },
      { ramGb: 0.1, price: 30, label: "Premium-1, 100 MB" },
      { ramGb: 0.25, price: 60, label: "Premium-2, 250 MB" },
      { ramGb: 0.5, price: 120, label: "Premium-3, 500 MB" },
      { ramGb: 1, price: 200, label: "Premium-5, 1 GB" },
    ],
    dbStoragePerGb: 0,
    includedGb: 2_000,
    overagePerGb: 0,
    notes: [
      "Heroku Postgres plans include their disk (32 GB on Essential-2, 64 GB on Standard-0). Bandwidth is not billed but is soft limited at 2 TB per app per month.",
      "Since February 2026 Heroku is in a sustaining engineering model: no new features, pricing unchanged for card customers.",
    ],
    sources: [
      { label: "Heroku pricing", url: "https://www.heroku.com/pricing/" },
      {
        label: "Heroku limits",
        url: "https://devcenter.heroku.com/articles/limits",
      },
      {
        label: "An update on Heroku (Feb 2026)",
        url: "https://www.heroku.com/blog/an-update-on-heroku/",
      },
    ],
  },
];

/** Shown in the FAQ; not modelled, because Vercel does not run workers or databases itself. */
export const VERCEL = {
  proSeat: 20,
  proCredit: 20,
  source: {
    label: "Vercel pricing",
    url: "https://vercel.com/pricing",
  } as Source,
};

/** Cheapest tier with at least `ramGb` of memory, or the largest one. */
export function pickTier(tiers: Tier[], ramGb: number): Tier | null {
  if (tiers.length === 0) return null;
  return tiers.find((t) => t.ramGb >= ramGb - 1e-9) ?? tiers[tiers.length - 1];
}
