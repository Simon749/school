export function convertToCSV(data: unknown[], fields: string[]): string {
  if (!data || data.length === 0) return "";

  const headers = fields.join(",");
  const rows = data.map((row) =>
    fields
      .map((field) => {
        // Safely traverse nested objects (e.g., "stream.grade.name")
        const value = field.split(".").reduce((obj: any, key: string) => obj?.[key], row);
        const stringValue = value === null || value === undefined ? "" : String(value);
        // Escape double quotes for CSV safety
        return `"${stringValue.replace(/"/g, '""')}"`;
      })
      .join(",")
  );

  return [headers, ...rows].join("\n");
}