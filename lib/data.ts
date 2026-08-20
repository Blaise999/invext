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
    name: 'The Boring Company',
    short: 'TBCO',
    price: 4500.00,
    change: 0,
    source: 'Private Mark',
    asOf: '2026-08-01',
  },
];

export const privateCos: PrivateCo[] = [
  {
    ticker: 'ANDU',
    symbol: 'ANDU',
    name: 'Anduril Industries',
    short: 'Anduril',
    shortName: 'Anduril',
    industry: 'Defence Technology',
    stage: 'Growth',
    founded: '2017',
    what: 'Autonomous defence systems',
    detail: 'Autonomous defence systems and AI-powered military technology.',
    route: '/invest/andu',
    lastRound: { date: '2024', price: '$196.50', valuation: '—' },
    body: {
      summary: 'Autonomous defence systems.',
      bullCase: ['Strong government contracts', 'AI-first defence platform', 'Rapid product iteration'],
      bearCase: ['Revenue concentrated in government programmes', 'Political and procurement risk'],
    },
    access: 'open',
    ctaLabel: 'Invest Now',
    ctaRoute: '/invest/andu',
    spvTrust: 'Anduril Opportunity Trust',
    isSimulated: true,
  },
  {
    ticker: 'ANTH',
    symbol: 'ANTH',
    name: 'Anthropic',
    short: 'Anthropic',
    shortName: 'Anthropic',
    industry: 'Artificial Intelligence',
    stage: 'Growth',
    founded: '2021',
    what: 'Frontier AI research and Claude',
    detail: 'Frontier AI research laboratory building Claude.',
    route: '/invest/anth',
    lastRound: { date: '2025', price: '$348.00', valuation: '—' },
    body: {
      summary: 'Frontier AI research and Claude.',
      bullCase: ['Strong safety focus', 'Enterprise adoption of Claude', 'Well-funded'],
      bearCase: ['Intense competition', 'High burn rate', 'Regulatory uncertainty'],
    },
    access: 'open',
    ctaLabel: 'Invest Now',
    ctaRoute: '/invest/anth',
    spvTrust: 'Anthropic Access Trust',
    isSimulated: true,
  },
  {
    ticker: 'CFSE',
    symbol: 'CFSE',
    name: 'Commonwealth Fusion Systems',
    short: 'CFS',
    shortName: 'CFS',
    industry: 'Fusion Energy',
    stage: 'Development',
    founded: '2018',
    what: 'Tokamak fusion with high-field magnets',
    detail: 'Developing commercial fusion power using high-temperature superconducting magnets.',
    route: '/invest/cfse',
    lastRound: { date: '2024', price: '$63.00', valuation: '—' },
    body: {
      summary: 'Tokamak fusion, high-field magnets.',
      bullCase: ['Leading magnet technology', 'Strong scientific team', 'Clear demonstration roadmap'],
      bearCase: ['Physics and engineering risk', 'Very long timeline', 'Capital intensive'],
    },
    access: 'open',
    ctaLabel: 'Invest Now',
    ctaRoute: '/invest/cfse',
    spvTrust: 'Fusion Energy Trust',
    isSimulated: true,
  },
  {
    ticker: 'DBRX',
    symbol: 'DBRX',
    name: 'Databricks, Inc.',
    short: 'Databricks',
    shortName: 'Databricks',
    industry: 'Data & AI',
    stage: 'Late Stage',
    founded: '2013',
    what: 'Data and AI platform',
    detail: 'Unified data and AI platform used by enterprises worldwide.',
    route: '/invest/dbrx',
    lastRound: { date: '2024', price: '$178.00', valuation: '—' },
    body: {
      summary: 'Data and AI platform.',
      bullCase: ['Strong enterprise traction', 'Lakehouse architecture leadership', 'AI wave tailwinds'],
      bearCase: ['Competition from cloud providers', 'High valuation', 'Long path to IPO'],
    },
    access: 'open',
    ctaLabel: 'Invest Now',
    ctaRoute: '/invest/dbrx',
    spvTrust: 'Databricks Access Trust',
    isSimulated: true,
  },
  {
    ticker: 'FIGR',
    symbol: 'FIGR',
    name: 'Figure AI',
    short: 'Figure',
    shortName: 'Figure',
    industry: 'Robotics',
    stage: 'Early Growth',
    founded: '2022',
    what: 'General-purpose humanoid robotics',
    detail: 'Building general-purpose humanoid robots for commercial and industrial use.',
    route: '/invest/figr',
    lastRound: { date: '2025', price: '$118.00', valuation: '—' },
    body: {
      summary: 'General-purpose humanoid robotics.',
      bullCase: ['Clear product vision', 'Strong talent', 'Large addressable market'],
      bearCase: ['Hardware execution risk', 'Manufacturing unproven at scale', 'High capital needs'],
    },
    access: 'open',
    ctaLabel: 'Invest Now',
    ctaRoute: '/invest/figr',
    spvTrust: 'Figure Robotics Trust',
    isSimulated: true,
  },
  {
    ticker: 'HLON',
    symbol: 'HLON',
    name: 'Helion Energy',
    short: 'Helion',
    shortName: 'Helion',
    industry: 'Fusion Energy',
    stage: 'Development',
    founded: '2013',
    what: 'Fusion power development',
    detail: 'Developing a novel pulsed fusion approach aiming for commercial electricity.',
    route: '/invest/hlon',
    lastRound: { date: '2024', price: '$71.50', valuation: '—' },
    body: {
      summary: 'Fusion power development.',
      bullCase: ['Unique technical approach', 'Microsoft offtake interest', 'Experienced team'],
      bearCase: ['Unproven commercial fusion', 'Long development timeline', 'Technical risk'],
    },
    access: 'open',
    ctaLabel: 'Invest Now',
    ctaRoute: '/invest/hlon',
    spvTrust: 'Helion Energy Trust',
    isSimulated: true,
  },
  {
    ticker: 'NLNK',
    symbol: 'NLNK',
    name: 'Neuralink Corp.',
    short: 'Neuralink',
    shortName: 'Neuralink',
    industry: 'Neurotechnology',
    stage: 'Clinical',
    founded: '2016',
    what: 'Implantable brain–computer interface',
    detail: 'Implantable brain–computer interface with first human trials.',
    route: '/invest/nlnk',
    lastRound: { date: '2025', price: '$224.00', valuation: '—' },
    body: {
      summary: 'Implantable brain–computer interface.',
      bullCase: ['First human implants', 'High bandwidth electrodes', 'Clear medical use cases'],
      bearCase: ['Heavy regulatory path', 'Surgical risk', 'Long timeline to scale'],
    },
    access: 'open',
    ctaLabel: 'Invest Now',
    ctaRoute: '/invest/nlnk',
    spvTrust: 'NeuroTech Opportunity Trust',
    isSimulated: true,
  },
  {
    ticker: 'OPAI',
    symbol: 'OPAI',
    name: 'OpenAI',
    short: 'OpenAI',
    shortName: 'OpenAI',
    industry: 'Artificial Intelligence',
    stage: 'Late Stage',
    founded: '2015',
    what: 'Frontier AI research and ChatGPT',
    detail: 'Leading frontier AI research lab behind ChatGPT and GPT models.',
    route: '/invest/opai',
    lastRound: { date: '2025', price: '$561.50', valuation: '—' },
    body: {
      summary: 'Frontier AI research and ChatGPT.',
      bullCase: ['Clear market leadership', 'Massive distribution', 'Strong brand'],
      bearCase: ['Unusual corporate structure', 'High compute costs', 'Regulatory scrutiny'],
    },
    access: 'open',
    ctaLabel: 'Invest Now',
    ctaRoute: '/invest/opai',
    spvTrust: 'OpenAI Access Trust',
    isSimulated: true,
  },
  {
    ticker: 'SIER',
    symbol: 'SIER',
    name: 'Sierra Space',
    short: 'Sierra',
    shortName: 'Sierra',
    industry: 'Aerospace',
    stage: 'Growth',
    founded: '2021',
    what: 'Spaceplanes and orbital habitats',
    detail: 'Developing spaceplanes and commercial space stations.',
    route: '/invest/sier',
    lastRound: { date: '2024', price: '$41.00', valuation: '—' },
    body: {
      summary: 'Spaceplanes and orbital habitats.',
      bullCase: ['NASA partnerships', 'Dream Chaser vehicle', 'Commercial space station plans'],
      bearCase: ['Programme delays common', 'Capital intensive', 'Launch dependency'],
    },
    access: 'open',
    ctaLabel: 'Invest Now',
    ctaRoute: '/invest/sier',
    spvTrust: 'Sierra Space Trust',
    isSimulated: true,
  },
  {
    ticker: 'SSIL',
    symbol: 'SSIL',
    name: 'Safe Superintelligence Inc.',
    short: 'SSI',
    shortName: 'SSI',
    industry: 'Artificial Intelligence',
    stage: 'Early',
    founded: '2024',
    what: 'AI safety research lab',
    detail: 'Research lab focused exclusively on safe superintelligence.',
    route: '/invest/ssil',
    lastRound: { date: '2024', price: '$96.00', valuation: '—' },
    body: {
      summary: 'AI safety research lab.',
      bullCase: ['Clear mission focus', 'High-profile founders', 'Differentiated approach'],
      bearCase: ['Very early stage', 'No product yet', 'Extremely high variance'],
    },
    access: 'open',
    ctaLabel: 'Invest Now',
    ctaRoute: '/invest/ssil',
    spvTrust: 'SSI Access Trust',
    isSimulated: true,
  },
  {
    ticker: 'STRP',
    symbol: 'STRP',
    name: 'Stripe, Inc.',
    short: 'Stripe',
    shortName: 'Stripe',
    industry: 'Fintech',
    stage: 'Late Stage',
    founded: '2010',
    what: 'Payments infrastructure',
    detail: 'Global payments and financial infrastructure platform.',
    route: '/invest/strp',
    lastRound: { date: '2024', price: '$268.50', valuation: '—' },
    body: {
      summary: 'Payments infrastructure.',
      bullCase: ['Dominant in online payments', 'Strong developer brand', 'Expanding product suite'],
      bearCase: ['Already highly valued', 'Competition from incumbents', 'Slower growth in mature markets'],
    },
    access: 'open',
    ctaLabel: 'Invest Now',
    ctaRoute: '/invest/strp',
    spvTrust: 'Stripe Access Trust',
    isSimulated: true,
  },
  {
    ticker: 'TBCO',
    symbol: 'TBCO',
    name: 'The Boring Company',
    short: 'Boring Co',
    shortName: 'Boring Co',
    industry: 'Infrastructure',
    stage: 'Growth',
    founded: '2016',
    what: 'Tunnelling and urban transit loops',
    detail: 'Building tunnels and high-speed underground transit systems.',
    route: '/invest/tbco',
    lastRound: { date: '2024', price: '$4500.00', valuation: '—' },
    body: {
      summary: 'Tunnelling and urban transit loops.',
      bullCase: ['Unique tunnelling technology', 'Municipal contracts', 'Long-term infrastructure demand'],
      bearCase: ['Very long project timelines', 'Political and permitting risk', 'Limited secondary liquidity'],
    },
    access: 'open',
    ctaLabel: 'Invest Now',
    ctaRoute: '/invest/tbco',
    spvTrust: 'Boring Company Trust',
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