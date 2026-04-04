export const SERVICE_CATEGORIES = [
  {
    id: 'heating',
    label: 'Heating',
    icon: '🔥',
    services: [
      {
        id: 'furnace-repair',
        name: 'Furnace Repair',
        tagline: 'Heat restored fast — any make, any model.',
        description: 'When your furnace quits, you need it fixed now. Our certified technicians diagnose and repair all furnace brands — gas, electric, and oil. We carry common parts on every truck so most repairs are done same-day.',
        benefits: ['Same-day service available', '24/7 emergency repairs', 'All major brands serviced', 'Upfront pricing — no surprises'],
        startingPrice: 89,
        priceNote: 'diagnostic fee (waived with repair)',
      },
      {
        id: 'furnace-install',
        name: 'Furnace Installation',
        tagline: 'New furnace, properly sized and installed right.',
        description: 'Whether your old furnace is beyond repair or you want to upgrade to a high-efficiency model, we handle the full installation — removal of old equipment, proper sizing, ductwork connections, and testing.',
        benefits: ['Free in-home estimates', 'Financing available', 'Up to 98% AFUE efficiency', 'Manufacturer warranty + labor guarantee'],
        startingPrice: null,
        priceNote: 'Free estimate — call for pricing',
      },
      {
        id: 'heating-maintenance',
        name: 'Heating Maintenance',
        tagline: 'Prevent breakdowns before they happen.',
        description: 'Annual furnace tune-ups catch small problems before they become expensive repairs. We clean, inspect, and test every component — keeping your system running efficiently all winter.',
        benefits: ['Extends equipment lifespan', 'Lowers energy bills', 'Reduces breakdown risk', 'Priority scheduling for members'],
        startingPrice: 79,
        priceNote: 'per tune-up',
      },
    ],
  },
  {
    id: 'cooling',
    label: 'Cooling',
    icon: '❄️',
    services: [
      {
        id: 'ac-repair',
        name: 'AC Repair',
        tagline: 'Cool air back on — guaranteed.',
        description: 'No cold air? Strange noises? Leaking water? Our technicians troubleshoot and repair all AC systems. We stock the most common parts so we can fix it on the first visit.',
        benefits: ['Same-day service available', 'All brands and models', 'Refrigerant recharge', 'Honest diagnostics — no upselling'],
        startingPrice: 89,
        priceNote: 'diagnostic fee (waived with repair)',
      },
      {
        id: 'ac-install',
        name: 'AC Installation',
        tagline: 'Right-sized cooling for your home.',
        description: 'A new AC system is a big investment. We do a full load calculation to make sure your new unit is the right size for your home — not too big, not too small. Professional installation with full testing.',
        benefits: ['Free in-home estimates', 'Financing available', 'Energy-efficient models', 'Full warranty coverage'],
        startingPrice: null,
        priceNote: 'Free estimate — call for pricing',
      },
      {
        id: 'ductless-systems',
        name: 'Ductless Mini-Splits',
        tagline: 'Zone comfort without ductwork.',
        description: 'Ductless mini-split systems are perfect for additions, garages, or homes without existing ductwork. Heat and cool individual rooms with independent temperature control.',
        benefits: ['No ductwork needed', 'Individual room control', 'Energy efficient', 'Heating and cooling in one unit'],
        startingPrice: null,
        priceNote: 'Free estimate — call for pricing',
      },
      {
        id: 'ac-maintenance',
        name: 'AC Maintenance',
        tagline: 'Keep your cool all summer long.',
        description: 'Annual AC tune-ups keep your system running at peak efficiency. We clean coils, check refrigerant levels, test electrical connections, and make sure everything is ready for the hot months.',
        benefits: ['Improves efficiency', 'Prevents costly breakdowns', 'Extends equipment life', 'Cleaner indoor air'],
        startingPrice: 79,
        priceNote: 'per tune-up',
      },
    ],
  },
  {
    id: 'home-services',
    label: 'Home Services',
    icon: '🏠',
    services: [
      {
        id: 'water-heater',
        name: 'Water Heater Service',
        tagline: 'Hot water when you need it.',
        description: 'We install and repair tank and tankless water heaters. If your water heater is leaking, not heating, or past its prime, we can help — fast.',
        benefits: ['Tank and tankless options', 'Same-day replacement available', 'Energy-efficient upgrades', 'All major brands'],
        startingPrice: 99,
        priceNote: 'service call',
      },
      {
        id: 'indoor-air-quality',
        name: 'Indoor Air Quality',
        tagline: 'Breathe cleaner, healthier air at home.',
        description: 'Air filtration systems, UV lights, humidifiers, and dehumidifiers — we install solutions that improve the air your family breathes every day.',
        benefits: ['HEPA filtration systems', 'UV germicidal lights', 'Whole-home humidifiers', 'Allergy and asthma relief'],
        startingPrice: null,
        priceNote: 'Free consultation',
      },
      {
        id: 'duct-cleaning',
        name: 'Duct Cleaning',
        tagline: 'Clean ducts, clean air, lower bills.',
        description: 'Over time, dust, debris, and allergens build up in your ductwork. Professional duct cleaning removes buildup and improves airflow — you will notice the difference.',
        benefits: ['Reduces allergens', 'Improves airflow', 'Lowers energy costs', 'Removes odors'],
        startingPrice: 299,
        priceNote: 'whole-home cleaning',
      },
      {
        id: 'smart-thermostats',
        name: 'Smart Thermostat Installation',
        tagline: 'Control your comfort from anywhere.',
        description: 'Upgrade to a smart thermostat and control your heating and cooling from your phone. We install and configure Nest, Ecobee, Honeywell, and more.',
        benefits: ['Remote temperature control', 'Energy savings up to 23%', 'Works with Alexa & Google', 'Professional setup included'],
        startingPrice: 199,
        priceNote: 'installed (thermostat included)',
      },
    ],
  },
];

export const ALL_SERVICES = SERVICE_CATEGORIES.flatMap(cat =>
  cat.services.map(s => ({ ...s, category: cat.label, categoryId: cat.id, categoryIcon: cat.icon }))
);

export const TESTIMONIALS = [
  { name: 'Sarah M.', location: 'Wyandotte', rating: 5, text: 'Called at 10pm on a Friday with no heat. Tech was at my door in 45 minutes. Fixed it on the spot. These guys are the real deal.' },
  { name: 'Mike R.', location: 'Downriver', rating: 5, text: 'Had them install a new furnace. Price was fair, crew was professional, and they cleaned up after themselves. Would recommend to anyone.' },
  { name: 'Jennifer L.', location: 'Taylor', rating: 5, text: 'Best HVAC company I have ever dealt with. Honest, on time, and they actually explain what they are doing. Signed up for their service club.' },
  { name: 'Dan K.', location: 'Trenton', rating: 5, text: 'AC went out in July. They had a tech here within 2 hours and it was a simple fix. No upselling, no nonsense. Fair price.' },
  { name: 'Lisa P.', location: 'Southgate', rating: 5, text: 'We have been using DuctTales for 3 years now. Annual tune-ups, a new water heater, and duct cleaning. Always professional.' },
  { name: 'Tom W.', location: 'Allen Park', rating: 4, text: 'Good service. Tech was knowledgeable and got the job done. Only reason for 4 stars is scheduling took a couple days.' },
  { name: 'Angela S.', location: 'Lincoln Park', rating: 5, text: 'Emergency furnace repair on Christmas Eve. Yes, they showed up. Yes, they fixed it. I am a customer for life.' },
  { name: 'Chris B.', location: 'Riverview', rating: 5, text: 'Installed a Nest thermostat and showed me how to use it. Quick, clean, professional. Already recommended to my neighbors.' },
];

export const SPECIALS = [
  { title: 'New Customer Discount', description: '$50 off your first service call. Mention this offer when you book.', code: 'NEWDUCT50' },
  { title: 'AC Tune-Up Special', description: 'Pre-season AC tune-up for $69 (regularly $79). Get your system summer-ready.', code: 'COOL69' },
  { title: 'Service Club Membership', description: 'Join for $9.99/mo — includes 2 annual tune-ups, priority scheduling, and 15% off all repairs. Cancel anytime.', code: null },
  { title: 'Financing Available', description: '0% APR for 12 months on new equipment installations over $2,500. Subject to credit approval.', code: null },
];

export const COMPANY_INFO = {
  name: 'DuctTales HVAC',
  tagline: 'No Sweat. No Freeze. Just DuctTales.',
  phone: '(313) 378-9982',
  email: 'service@ducttales.com',
  address: 'Serving Downriver Michigan & Surrounding Areas',
  hours: '24/7 Emergency Service Available',
  established: 2024,
  credentials: ['Licensed & Insured', 'EPA Certified', 'NATE Certified Technicians', 'BBB Accredited'],
  serviceAreas: ['Wyandotte', 'Downriver', 'Taylor', 'Trenton', 'Southgate', 'Allen Park', 'Lincoln Park', 'Riverview', 'Dearborn', 'Dearborn Heights'],
};
