export const CATALOG_COLUMNS = [
    { key: 'sourceId', label: 'Objekt-ID', sortable: true, readOnly: true },
    { key: 'description', label: 'Beschreibung', sortable: true },
    { key: 'category', label: 'Kategorie', sortable: true },
    { key: 'valueKind', label: 'Verhalten', sortable: true },
    { key: 'unit', label: 'Einheit', sortable: true, readOnly: true },
    { key: 'writable', label: 'Schreibbar', sortable: true, readOnly: true },
    { key: 'room', label: 'Raum', sortable: true },
    { key: 'ignored', label: 'Ignoriert', sortable: true },
    { key: 'active', label: 'Aktiv', sortable: true, readOnly: true },
    { key: 'needsReview', label: 'Prüfung nötig', sortable: true, readOnly: true },
    { key: 'writePattern', label: 'Schreibmuster', sortable: true, readOnly: true },
    { key: 'updateFrequency', label: 'Update-Frequenz', sortable: true },
    { key: 'dataCompleteness', label: 'Vollständigkeit', sortable: true },
    { key: 'derivedMetricRole', label: 'Energie-Rolle', sortable: true },
    { key: 'derivedMetricGroupId', label: 'Energiebilanz-Gruppe', sortable: true },
    { key: 'derivedMetricInverted', label: 'Vorzeichen invertiert', sortable: true },
    { key: 'hvacRole', label: 'HVAC-Rolle', sortable: true },
    { key: 'status', label: 'Status', sortable: true, readOnly: true },
    { key: 'actions', label: 'Aktionen', sortable: false, readOnly: true },
];

export const DEFAULT_VISIBLE_COLUMNS = CATALOG_COLUMNS.map(column => column.key);
