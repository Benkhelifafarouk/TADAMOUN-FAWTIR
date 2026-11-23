import { getDb } from '@/lib/db';
import { num } from '@/lib/db/values';

export interface WilayaOption {
  code: string;
  nameAr: string;
  nameFr: string;
}

export interface WilayaIdOption {
  id: string;
  nameAr: string;
  nameFr: string;
}

export interface CategoryOption {
  id: string;
  code: string;
  nameAr: string;
  nameFr: string;
  descriptionAr: string | null;
  descriptionFr: string | null;
}

export interface PublicRequest {
  reference: string;
  serviceCode: string;
  categoryNameAr: string;
  categoryNameFr: string;
  providerNameAr: string;
  providerNameFr: string;
  wilayaCode: string;
  wilayaNameAr: string;
  wilayaNameFr: string;
  municipalityNameAr: string | null;
  municipalityNameFr: string | null;
  status: string;
  eligibleAmountCentimes: number;
  fundedAmountCentimes: number;
  remainingAmountCentimes: number;
  description: string;
  descriptionFr: string;
  descriptionLocale: string;
  publishedAt: string | null;
  expiresAt: string | null;
}

export interface PublicStats {
  publishedRequests: number;
  completedRequests: number;
  allocatedCentimes: number;
  supportedHouseholds: number;
  fundBalanceCentimes: number;
  fundContributionsCentimes: number;
}

function mapPublicRequest(row: Record<string, unknown>): PublicRequest {
  return {
    reference: String(row.reference),
    serviceCode: String(row.service_category_code),
    categoryNameAr: String(row.category_name_ar),
    categoryNameFr: String(row.category_name_fr),
    providerNameAr: String(row.provider_name_ar),
    providerNameFr: String(row.provider_name_fr),
    wilayaCode: String(row.wilaya_code),
    wilayaNameAr: String(row.wilaya_name_ar),
    wilayaNameFr: String(row.wilaya_name_fr),
    municipalityNameAr: row.municipality_name_ar ? String(row.municipality_name_ar) : null,
    municipalityNameFr: row.municipality_name_fr ? String(row.municipality_name_fr) : null,
    status: String(row.status),
    eligibleAmountCentimes: num(row.eligible_amount_centimes),
    fundedAmountCentimes: num(row.funded_amount_centimes),
    remainingAmountCentimes: num(row.remaining_amount_centimes),
    description: String(row.anonymized_description),
    descriptionFr: String(row.anonymized_description_fr),
    descriptionLocale: String(row.description_locale),
    publishedAt: row.published_at ? new Date(row.published_at as string).toISOString() : null,
    expiresAt: row.expires_at ? new Date(row.expires_at as string).toISOString() : null,
  };
}

export async function getPublicStats(): Promise<PublicStats> {
  const db = await getDb();
  const [statsRows, fundRows] = await Promise.all([
    db.query<{
      published_requests: unknown;
      completed_requests: unknown;
      allocated_centimes: unknown;
      supported_households: unknown;
    }>('select * from public_platform_stats'),
    db.query<{ balance_centimes: unknown; total_contributions_centimes: unknown }>(
      'select balance_centimes, total_contributions_centimes from public_fund_summary limit 1',
    ),
  ]);
  const stats = statsRows[0];
  const fund = fundRows[0];
  return {
    publishedRequests: num(stats?.published_requests),
    completedRequests: num(stats?.completed_requests),
    allocatedCentimes: num(stats?.allocated_centimes),
    supportedHouseholds: num(stats?.supported_households),
    fundBalanceCentimes: num(fund?.balance_centimes),
    fundContributionsCentimes: num(fund?.total_contributions_centimes),
  };
}

export async function getWilayas(): Promise<WilayaOption[]> {
  const db = await getDb();
  const rows = await db.query<{ code: string; name_ar: string; name_fr: string }>(
    'select code, name_ar, name_fr from wilayas where is_active order by code',
  );
  return rows.map((row) => ({ code: row.code, nameAr: row.name_ar, nameFr: row.name_fr }));
}

export async function getWilayaIdOptions(): Promise<WilayaIdOption[]> {
  const db = await getDb();
  const rows = await db.query<{ id: string; name_ar: string; name_fr: string }>(
    'select id, name_ar, name_fr from wilayas where is_active order by code',
  );
  return rows.map((row) => ({ id: row.id, nameAr: row.name_ar, nameFr: row.name_fr }));
}

export async function getCategories(): Promise<CategoryOption[]> {
  const db = await getDb();
  const rows = await db.query<{
    id: string;
    code: string;
    name_ar: string;
    name_fr: string;
    description_ar: string | null;
    description_fr: string | null;
  }>(
    `select id, code, name_ar, name_fr, description_ar, description_fr
       from service_categories where is_active order by sort_order`,
  );
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    nameAr: row.name_ar,
    nameFr: row.name_fr,
    descriptionAr: row.description_ar,
    descriptionFr: row.description_fr,
  }));
}

export async function browsePublicRequests(filters: {
  wilaya?: string;
  service?: string;
  sort?: 'newest' | 'remaining';
  limit?: number;
}): Promise<PublicRequest[]> {
  const db = await getDb();
  const rows = await db.query<Record<string, unknown>>(
    `select * from public_assistance_requests
      where ($1::text is null or wilaya_code = $1)
        and ($2::text is null or service_category_code = $2)
      order by
        case when $3 = 'remaining' then (eligible_amount_centimes - funded_amount_centimes) end desc nulls last,
        published_at desc
      limit $4`,
    [filters.wilaya ?? null, filters.service ?? null, filters.sort === 'remaining' ? 'remaining' : 'newest', filters.limit ?? 60],
  );
  return rows.map(mapPublicRequest);
}

export async function getPublicRequest(reference: string): Promise<PublicRequest | null> {
  const db = await getDb();
  const rows = await db.query<Record<string, unknown>>(
    'select * from public_assistance_requests where reference = $1 limit 1',
    [reference],
  );
  return rows[0] ? mapPublicRequest(rows[0]) : null;
}

export async function countActiveRequests(): Promise<number> {
  const db = await getDb();
  const rows = await db.query<{ count: number }>(
    `select count(*)::int as count from assistance_requests
      where status in ('published', 'partially_funded')`,
  );
  return num(rows[0]?.count);
}

export async function getMunicipalityOptions(): Promise<
  { id: string; wilayaId: string; nameAr: string; nameFr: string }[]
> {
  const db = await getDb();
  const rows = await db.query<{ id: string; wilaya_id: string; name_ar: string; name_fr: string }>(
    'select id, wilaya_id, name_ar, name_fr from municipalities where is_active order by name_ar',
  );
  return rows.map((row) => ({ id: row.id, wilayaId: row.wilaya_id, nameAr: row.name_ar, nameFr: row.name_fr }));
}

export async function getProviderOptions(): Promise<
  { id: string; categoryId: string; nameAr: string; nameFr: string }[]
> {
  const db = await getDb();
  const rows = await db.query<{ id: string; category_id: string; name_ar: string; name_fr: string }>(
    'select id, category_id, name_ar, name_fr from service_providers where is_active order by name_ar',
  );
  return rows.map((row) => ({ id: row.id, categoryId: row.category_id, nameAr: row.name_ar, nameFr: row.name_fr }));
}
