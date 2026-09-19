/**
 * Fills "{name}" placeholders in a translation string, e.g.
 * fillText(t.alerts.ageMinutes, { n: 5 }). Unknown placeholders are left as-is.
 */
export function fillText(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}
