'use client';

import { useMemo, useState } from 'react';

export interface GeoOption {
  id: string;
  wilayaId?: string;
  wilayaCode?: string;
  nameAr: string;
  nameFr: string;
}

/** Wilaya + municipality selects that stay consistent without a full page load. */
export function GeoSelect({
  wilayas,
  municipalities,
  locale,
  defaultWilayaId,
  defaultMunicipalityId,
  wilayaLabel,
  municipalityLabel,
  allLabel,
}: {
  wilayas: { id: string; nameAr: string; nameFr: string }[];
  municipalities: { id: string; wilayaId: string; nameAr: string; nameFr: string }[];
  locale: 'ar' | 'fr';
  defaultWilayaId?: string;
  defaultMunicipalityId?: string;
  wilayaLabel: string;
  municipalityLabel: string;
  allLabel: string;
}) {
  const [wilayaId, setWilayaId] = useState(defaultWilayaId ?? '');
  const [municipalityId, setMunicipalityId] = useState(defaultMunicipalityId ?? '');

  const options = useMemo(() => {
    if (!wilayaId) return [];
    return municipalities.filter((item) => item.wilayaId === wilayaId);
  }, [municipalities, wilayaId]);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="field-label" htmlFor="wilayaId">
          {wilayaLabel}
        </label>
        <select
          id="wilayaId"
          name="wilayaId"
          required
          className="field-input"
          value={wilayaId}
          onChange={(event) => {
            setWilayaId(event.target.value);
            setMunicipalityId('');
          }}
        >
          <option value="">{allLabel}</option>
          {wilayas.map((wilaya) => (
            <option key={wilaya.id} value={wilaya.id}>
              {locale === 'ar' ? wilaya.nameAr : wilaya.nameFr}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="field-label" htmlFor="municipalityId">
          {municipalityLabel}
        </label>
        <select
          id="municipalityId"
          name="municipalityId"
          className="field-input"
          value={municipalityId}
          onChange={(event) => setMunicipalityId(event.target.value)}
          disabled={!wilayaId || options.length === 0}
        >
          <option value="">{allLabel}</option>
          {options.map((item) => (
            <option key={item.id} value={item.id}>
              {locale === 'ar' ? item.nameAr : item.nameFr}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
