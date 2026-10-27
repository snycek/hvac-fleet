export const SERVICE_CATEGORIES = [
  {
    id: 'lawn-services',
    label: 'Lawn Services',
    icon: '🌱',
    services: [
      {
        id: 'lawn-cutting',
        name: 'Lawn Cutting',
        icon: '🌱',
        tagline: 'A clean, even cut — every single week.',
        description: 'Weekly or bi-weekly mowing that keeps your yard looking sharp all season. Every visit includes mowing, string-trimming around beds, fences and trees, edging along walks and driveways, and blowing clippings off hard surfaces.',
        benefits: ['Weekly or bi-weekly visits', 'Trimming & edging included', 'Clippings blown off walks and drives', 'Same crew, same day each week'],
        startingPrice: 40,
        priceNote: 'per cut (average residential lot)',
      },
      {
        id: 'leaf-removal',
        name: 'Leaf Removal',
        icon: '🍂',
        tagline: 'Fall cleanup without the back pain.',
        description: 'We blow, rake, and haul away leaves from your lawn, beds, and fence lines so your grass can breathe heading into winter. One-time cleanups or recurring visits through the fall season.',
        benefits: ['Lawn, beds & hardscape cleared', 'Leaves hauled away — nothing left at the curb', 'One-time or recurring fall visits', 'Protects your lawn over winter'],
        startingPrice: 150,
        priceNote: 'per cleanup (average residential lot)',
      },
      {
        id: 'landscaping-quote',
        name: 'Landscaping Quote',
        icon: '🌳',
        tagline: 'Tell us your vision — we will price it out free.',
        description: 'New beds, mulch, shrubs, sod, stone, or a full yard makeover. We come out, walk the property with you, and give you a clear written quote with no pressure and no obligation.',
        benefits: ['Free on-site walkthrough', 'Clear written quote', 'Mulch, plantings, sod & hardscape', 'No pressure, no obligation'],
        startingPrice: null,
        priceNote: 'Free quote — no obligation',
      },
    ],
  },
];

export const ALL_SERVICES = SERVICE_CATEGORIES.flatMap(cat =>
  cat.services.map(s => ({ ...s, category: cat.label, categoryId: cat.id, categoryIcon: s.icon || cat.icon }))
);

export const SERVICE_PAGE_IDS = ALL_SERVICES.map(s => s.id);

export const TESTIMONIALS = [
  { name: 'Sarah M.', location: 'Wyandotte', rating: 5, text: 'Same crew every Tuesday and the lawn has never looked better. They even edge the sidewalk — neighbors keep asking who we use.' },
  { name: 'Mike R.', location: 'Downriver', rating: 5, text: 'Had them do a full fall leaf cleanup. Three huge maples worth of leaves, gone in an afternoon. Nothing left at the curb.' },
  { name: 'Jennifer L.', location: 'Taylor', rating: 5, text: 'Got a landscaping quote for new beds and mulch. Clear pricing, no pushy upsell, and the finished job looks amazing.' },
  { name: 'Dan K.', location: 'Trenton', rating: 5, text: 'Reliable, on time, and they text when they are on the way. Exactly what I want from a lawn service.' },
  { name: 'Lisa P.', location: 'Southgate', rating: 5, text: 'We have used John\'s for weekly cutting for two seasons now. Always professional and always clean.' },
  { name: 'Tom W.', location: 'Allen Park', rating: 4, text: 'Good work and fair price. Only reason for 4 stars is a rain delay pushed my cut a couple days.' },
  { name: 'Angela S.', location: 'Lincoln Park', rating: 5, text: 'They redid our front beds and planted new shrubs. Curb appeal went way up. Customer for life.' },
  { name: 'Chris B.', location: 'Riverview', rating: 5, text: 'Signed up for weekly mowing plus fall cleanup. Easy to book and I never have to think about the yard.' },
];

export const SPECIALS = [
  { title: 'New Customer Discount', description: 'Your first lawn cut is half off when you sign up for weekly service. Mention this offer when you book.', code: 'FIRSTCUT' },
  { title: 'Fall Cleanup Special', description: '$25 off a leaf removal cleanup booked before November 15.', code: 'LEAVES25' },
  { title: 'Season Pass', description: 'Book weekly cutting for the full season and get your spring and fall cleanups at 15% off.', code: null },
  { title: 'Free Landscaping Quotes', description: 'Thinking about new beds, mulch, or sod? We will walk your yard and quote it free.', code: null },
];

export const COMPANY_INFO = {
  name: "John's Lawn & Landscaping",
  shortName: "John's Lawn",
  tagline: 'Cut. Cleaned. Done Right.',
  phone: '(313) 378-9982',
  phoneHref: 'tel:3133789982',
  email: 'service@johnslawn.com',
  address: 'Serving Downriver Michigan & Surrounding Areas',
  hours: 'Mon–Sat, 7am–7pm',
  established: 2024,
  credentials: ['Licensed & Insured', 'Locally Owned & Operated', 'Commercial-Grade Equipment', 'Satisfaction Guaranteed'],
  serviceAreas: ['Wyandotte', 'Downriver', 'Taylor', 'Trenton', 'Southgate', 'Allen Park', 'Lincoln Park', 'Riverview', 'Dearborn', 'Dearborn Heights'],
};
