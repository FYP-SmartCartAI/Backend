/** Store category slugs Groq / intent rules may assign to a search query. */
export const CATALOG_CATEGORY_SLUGS = [
  'audio--headphones',
  'cameras--photography',
  'designer-watches',
  'fitness--outdoors',
  'laptops--computers',
  'luxury-fragrances',
  'office--stationery',
  'premium-footwear',
  'smart-home-devices',
  'smartphones--tablets',
]

export const CATALOG_CATEGORY_GUIDE = `
- audio--headphones: headphones, earbuds, speakers, soundbars, microphones
- cameras--photography: cameras, drones, lenses, photography gear
- designer-watches: watches, timepieces, luxury wristwear
- fitness--outdoors: gym equipment, hiking, camping, sports bottles, hydration
- laptops--computers: laptops, desktops, PCs, notebooks, MacBooks (NOT phone stands)
- luxury-fragrances: perfume, cologne, fragrance
- office--stationery: pens, journals, planners, desk accessories, phone stands
- premium-footwear: shoes, sneakers, boots, sandals
- smart-home-devices: smart thermostats, locks, purifiers, plugs, hubs, kitchen/home IoT, kettles, appliances
- smartphones--tablets: phones, smartphones, tablets, iPads (NOT headphones)
`.trim()
