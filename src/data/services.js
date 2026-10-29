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
      {
        id: 'snow-removal',
        name: 'Snow Removal',
        icon: '❄️',
        tagline: 'Lots cleared before you open.',
        description: 'Plowing and salting for parking lots, driveways, and walks all winter. Outline your lot on the map, we price it per push, and our plow trucks are out early every time it snows — so your customers and tenants never wade in.',
        benefits: ['Plowed before opening — every snowfall', 'Priced per push, no surprise bills', 'Parking lots, drives & walks', 'Live plow tracking for every visit'],
        startingPrice: null,
        priceNote: 'Free quote — priced per push',
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
  { name: 'Dr. Karen H.', location: 'Allen Park', rating: 5, text: 'They plow our office lot before our 8am patients show up. Every storm last winter, not one missed push.' },
];

export const SPECIALS = [
  { title: 'New Customer Discount', description: 'Your first lawn cut is half off when you sign up for weekly service. Mention this offer when you book.', code: 'FIRSTCUT' },
  { title: 'Fall Cleanup Special', description: '$25 off a leaf removal cleanup booked before November 15.', code: 'LEAVES25' },
  { title: 'Season Pass', description: 'Book weekly cutting for the full season and get your spring and fall cleanups at 15% off.', code: null },
  { title: 'Free Landscaping Quotes', description: 'Thinking about new beds, mulch, or sod? We will walk your yard and quote it free.', code: null },
  { title: 'Early-Bird Snow Contracts', description: 'Lock in your parking lot or driveway for the winter before December 1 and your first push is free.', code: 'FIRSTPUSH' },
];

export const COMPANY_INFO = {
  name: "John's Lawn & Landscaping",
  shortName: "John's Lawn",
  tagline: 'Cut. Cleaned. Done Right.',
  phone: '(313) 378-9982',
  phoneHref: 'tel:3133789982',
  email: 'service@johnslawn.com',
  address: 'Serving Downriver Michigan & Surrounding Areas',
  // The yard, where the trucks park: SW corner of Roosevelt & Allen. Used for "how far
  // from the yard" on quotes, the map's 🏠 marker, and where the demo trucks start.
  shop: { lat: 42.25646, lng: -83.21425, label: 'Yard · Roosevelt & Allen', address: '7199 Allen Rd, Allen Park, MI 48101' },
  hours: 'Mon–Sat, 7am–7pm · Plows run 24/7 when it snows',
  // Where customers mail checks (printed on invoices). Leave null until John confirms it.
  mailingAddress: null,
  established: 2024,
  credentials: ['Licensed & Insured', 'Locally Owned & Operated', 'Commercial-Grade Equipment', 'Satisfaction Guaranteed'],
  serviceAreas: ['Wyandotte', 'Downriver', 'Taylor', 'Trenton', 'Southgate', 'Allen Park', 'Lincoln Park', 'Riverview', 'Dearborn', 'Dearborn Heights'],
};
