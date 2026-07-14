const SUPPORTED_SPECIES_CLASSES = new Set(['cat', 'dog', 'bird'])

export function matchSpeciesClass(className) {
  return SUPPORTED_SPECIES_CLASSES.has(className) ? className : null
}
