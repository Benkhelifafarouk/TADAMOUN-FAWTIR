'use client';

import { useMemo, useState } from 'react';

/** Provider select that follows the chosen service category. */
export function ProviderSelect({
  categories,
  providers,
  locale,
  categoryLabel,
  providerLabel,
  placeholder,
}: {
  categories: { id: string; nameAr: string; nameFr: string }[];
  providers: { id: string; categoryId: string; nameAr: string; nameFr: string }[];
  locale: 'ar' | 'fr';
  categoryLabel: string;
  providerLabel: string;
  placeholder: string;
}) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const options = useMemo(
    () => providers.filter((provider) => provider.categoryId === categoryId),
    [providers, categoryId],
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="field-label" htmlFor="categoryId">
          {categoryLabel}
        </label>
        <select
          id="categoryId"
          name="categoryId"
          className="field-input"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          required
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {locale === 'ar' ? category.nameAr : category.nameFr}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="field-label" htmlFor="providerId">
          {providerLabel}
        </label>
        <select id="providerId" name="providerId" className="field-input" required defaultValue="">
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {locale === 'ar' ? provider.nameAr : provider.nameFr}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
