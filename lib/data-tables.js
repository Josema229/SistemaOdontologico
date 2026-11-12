// Orden de importación según las claves foráneas.
export const dataTables = [
  'branches', 'specialties', 'dentists', 'users', 'dentist_branches',
  'availabilities', 'patients', 'appointments', 'appointment_changes',
  'clinical_visits', 'sessions', 'login_attempts',
];

export const timestampColumns = new Set(['created_at', 'changed_at', 'attended_at']);

export function normalizeRow(row) {
  return Object.fromEntries(Object.entries(row).map(([column, value]) => {
    if (timestampColumns.has(column) && value != null) {
      const text = value instanceof Date ? value.toISOString() : value.replace(' ', 'T');
      const instant = new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(text) ? text : text + 'Z');
      return [column, instant.toISOString()];
    }
    if (['expires_at', 'reset_at'].includes(column)) return [column, Number(value)];
    return [column, value];
  }));
}
