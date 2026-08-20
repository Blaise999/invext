// @/lib/data.ts

export interface Asset {
  ticker: string;
  name: string;
  type: 'public' | 'private';
  logoUrl?: string;
}

export interface Quote {
  ticker: string;
  symbol: string;        // alias for compatibility
  name?: string;
  short?: string;
  price: number;
  change: number;
  source?: string;
  asOf?: string;
}

export interface PrivateCo {
  ticker: string;
  symbol: string;        // alias
  name: string;
  short: string;         // ← was shortName
  shortName: string;     // keep both for safety
  industry: string;
  stage: string;
  founded?: string;
  what?: string;         // short description
  detail?: string;       // longer description
  route?: string;        // ← was ctaRoute
  lastRound: {
    date: string;
    price: string;
    valuation: string;
  };
  body: {
    summary: string;
    bullCase: string[];
    bearCase: string[];
  };
  access: 'waitlist' | 'open';
  ctaLabel: string;
  ctaRoute: string;
  spvTrust: string;
  isSimulated?: boolean;
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface Channel {
  label: string;
  note?: string;
  uploads?: number;
}

export const getQuotes = (): Quote[] => [
  {
    ticker: 'SPCX',
    symbol: 'SPCX',
    name: 'SpaceX',
    short: 'SPCX',
    price: 124.50,
    change: +2.4,
    source: 'NASDAQ',
    asOf: '2026-08-19',
  },
  {
    ticker: 'SNLK',
    symbol: 'SNLK',
    name: 'Symbotic',
    short: 'SNLK',
    price: 88.20,
    change: -1.2,
    source: 'NASDAQ',
    asOf: '2026-08-19',
  },
  {
    ticker: 'TBCO',
    symbol: 'TBCO',
    name: 'The Bionic Co.',
    short: 'TBCO',
    price: 45.00,
    change: +0.8,
    source: 'Private Mark',
    asOf: '2026-08-01',
  },
];

export const privateCos: PrivateCo[] = [
  {
    ticker: 'NLNK',
    symbol: 'NLNK',
    name: 'Neuralink Corporation',
    short: 'Neuralink',
    shortName: 'Neuralink',
    industry: 'Neurotechnology',
    stage: 'Clinical',
    founded: '2016',
    what: 'Implantable brain–computer interface',
    detail: 'Implantable brain–computer interface with first human trials in 2024.',
    route: '/waitlist/nlnk',
    lastRound: {
      date: 'June 2025',
      price: '$9.00',
      valuation: '$9.0B',
    },
    body: {
      summary: 'Implantable brain–computer interface with first human trials.',
      bullCase: [
        'First human implant approved (2024).',
        'Patented high-bandwidth electrode array.',
        'Immediate addressable market for motor impairment.',
      ],
      bearCase: [
        'Regulatory-gated (FDA Phase III).',
        'No recurring revenue model yet.',
        'High technical failure variance.',
      ],
    },
    access: 'waitlist',
    ctaLabel: 'Request Access',
    ctaRoute: '/waitlist/nlnk',
    spvTrust: 'NeuroTech Opportunity Trust I',
    isSimulated: true,
  },
  {
    ticker: 'TBCO',
    symbol: 'TBCO',
    name: 'The Bionic Company',
    short: 'TBCO',
    shortName: 'TBCO',
    industry: 'Bionics',
    stage: 'Post-IPO / Growth',
    founded: '2018',
    what: 'Commercially deployed bionic limb technology',
    detail: 'Commercially deployed bionic limb technology with insurance pathways.',
    route: '/invest/tbco',
    lastRound: {
      date: 'March 2025',
      price: '$12.50',
      valuation: '$450M',
    },
    body: {
      summary: 'Commercially deployed bionic limb technology.',
      bullCase: [
        'First revenue-generating bionic limb company.',
        'Strong insurance reimbursement pathways.',
        'Manufacturing scale-up in progress.',
      ],
      bearCase: [
        'High customer acquisition cost.',
        'Dependent on single product line.',
        'Competitive pressure from traditional prosthetics.',
      ],
    },
    access: 'open',
    ctaLabel: 'Invest Now',
    ctaRoute: '/invest/tbco',
    spvTrust: 'Bionic Innovation Trust II',
    isSimulated: true,
  },
  {
    ticker: 'SNLK',
    symbol: 'SNLK',
    name: 'Symbotic Inc.',
    short: 'Symbotic',
    shortName: 'Symbotic',
    industry: 'Robotics',
    stage: 'Public',
    founded: '2006',
    what: 'AI-driven warehouse automation',
    detail: 'AI-driven warehouse automation and logistics robotics.',
    route: '/asset/snlk',
    lastRound: {
      date: 'N/A',
      price: 'Public',
      valuation: 'N/A',
    },
    body: {
      summary: 'AI-driven warehouse automation and logistics robotics.',
      bullCase: [
        'Backed by Walmart and Boston Consulting Group.',
        'Leading edge in warehouse automation.',
        'Recurring software revenue model.',
      ],
      bearCase: [
        'Capex-heavy business model.',
        'Sensitive to retail inventory cycles.',
        'High valuation multiple.',
      ],
    },
    access: 'open',
    ctaLabel: 'View Details',
    ctaRoute: '/asset/snlk',
    spvTrust: 'Logistics Tech Trust I',
    isSimulated: true,
  },
];

export const faqs: FaqItem[] = [
  {
    q: 'What exactly am I buying?',
    a: 'You are buying units in a Special Purpose Vehicle (SPV) or Trust that holds the underlying equity. This isolates your liability and simplifies tax reporting.',
  },
  {
    q: 'Are these real companies?',
    a: 'Yes. The underlying assets are registered entities. We provide access to secondary markets or private placements that are not available on standard retail exchanges.',
  },
  {
    q: 'How are prices determined?',
    a: 'Public assets reflect live exchange data. Private assets reflect the latest independent valuation or last traded price from our partner network.',
  },
];

export const channels: Channel[] = [
  { label: 'Twitter', note: 'Official updates', uploads: 12 },
  { label: 'LinkedIn', note: 'Company news', uploads: 8 },
  { label: 'Email', note: 'Newsletter', uploads: 4 },
  { label: 'Discord', note: 'Community', uploads: 25 },
];

export const company = {
  name: 'Apex Capital',
  description: 'Next-generation access to private and public innovation.',
  address: '123 Innovation Dr, Palo Alto, CA 94301',
};

export const FACTS_AS_OF = 'August 2026';