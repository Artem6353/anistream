'use client';

/** Селект сортировки с автосабмитом формы. */
export function SortSelect({ value, labels }: { value: string; labels: Record<string, string> }) {
  return (
    <select
      className="input"
      name="sort"
      defaultValue={value}
      onChange={(e) => {
        const form = e.target.form;
        if (form) form.requestSubmit();
      }}
    >
      {Object.entries(labels).map(([k, v]) => (
        <option key={k} value={k}>
          {v}
        </option>
      ))}
    </select>
  );
}
