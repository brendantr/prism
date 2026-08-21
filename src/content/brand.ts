/** Customer-facing name for a legacy seeded routine whose stored identity stays stable. */
export function routineDisplayName(name: string): string {
  return name === 'Prism 3' ? 'Repello 3' : name;
}
