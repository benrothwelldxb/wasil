/**
 * The school's full name, for anything a parent reads.
 *
 * A school is stored as three separate columns — `name`, `shortName`, `city` —
 * and the admin header already renders "Victory Heights Primary School | City
 * of Arabia" from two of them. Outbound email only ever used `name`, so it went
 * out under a shortened version of a name the record already held in full.
 *
 * Composed rather than stored as a fourth column: there are enough name-ish
 * fields to keep in step already, and a school that renames its site would
 * otherwise have to remember to update two of them.
 */
export function formalSchoolName(school: { name: string; city?: string | null } | null | undefined): string {
  const name = school?.name?.trim()
  if (!name) return 'School'
  const city = school?.city?.trim()
  // Skip the suffix when the name already carries the location, so a school
  // called "St Mary's, Dubai" in a city of "Dubai" isn't rendered twice.
  if (!city || name.toLowerCase().includes(city.toLowerCase())) return name
  return `${name} - ${city}`
}
