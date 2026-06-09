export const HOUSTON_VERBS = [
  'Accomplishing', 'Actioning', 'Baking', 'Booping', 'Brewing',
  'Calculating', 'Cerebrating', 'Channelling', 'Churning', 'Clauding',
  'Coalescing', 'Cogitating', 'Combobulating', 'Computing', 'Concocting',
  'Conjuring', 'Considering', 'Contemplating', 'Cooking', 'Crafting',
  'Creating', 'Crunching', 'Deciphering', 'Deliberating', 'Determining',
  'Discombobulating', 'Doing', 'Effecting', 'Elucidating', 'Enchanting',
  'Envisioning', 'Finagling', 'Flibbertigibbeting', 'Forging', 'Forming',
  'Frolicking', 'Generating', 'Germinating', 'Hatching', 'Herding',
  'Honking', 'Ideating', 'Imagining', 'Incubating', 'Inferring',
  'Manifesting', 'Marinating', 'Meandering', 'Moseying', 'Mulling',
  'Mustering', 'Musing', 'Noodling', 'Percolating', 'Perusing',
  'Philosophising', 'Pondering', 'Pontificating', 'Processing', 'Puttering',
  'Puzzling', 'Reticulating', 'Ruminating', 'Sauteing', 'Scheming',
  'Schlepping', 'Shimmying', 'Simmering', 'Smooshing', 'Spelunking',
  'Stewing', 'Synthesizing', 'Thinking', 'Tinkering', 'Vibing',
  'Whirring', 'Wibbling', 'Wizarding', 'Working', 'Wrangling',
] as const;

export function randomHoustonVerb(): string {
  return HOUSTON_VERBS[Math.floor(Math.random() * HOUSTON_VERBS.length)];
}
