export type TelescopeCatalogProfile = {
  _id: string;
  handle?: string;
  name?: string;
  profileImageUrl?: string;
  profileImageThumbUrl?: string;
};

type CreatorIdentity = {
  telescopeProfileId?: string;
  slug: string;
  displayName: string;
};

const TELESCOPE_CATALOG_URL = "https://telescope.ora-town.com/api/profiles";
const CACHE_TTL_MS = 50 * 60 * 1000;
let cachedProfiles: { profiles: TelescopeCatalogProfile[]; expiresAt: number } | undefined;
let pendingProfiles: Promise<TelescopeCatalogProfile[]> | undefined;

export function telescopeSlug(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function matchingTelescopeProfile(profiles: TelescopeCatalogProfile[], creator: CreatorIdentity): TelescopeCatalogProfile | undefined {
  if (creator.telescopeProfileId) {
    const matchingId = profiles.find((profile) => profile._id === creator.telescopeProfileId);
    if (matchingId) return matchingId;
  }

  const creatorSlug = telescopeSlug(creator.slug);
  const creatorName = telescopeSlug(creator.displayName);
  return profiles.find((profile) => telescopeSlug(profile.handle) === creatorSlug)
    ?? profiles.find((profile) => telescopeSlug(profile.name) === creatorName);
}

async function fetchProfiles(): Promise<TelescopeCatalogProfile[]> {
  const response = await fetch(TELESCOPE_CATALOG_URL, { signal: AbortSignal.timeout(7_000) });
  if (!response.ok) throw new Error(`telescope_catalog_${response.status}`);
  const payload = await response.json() as unknown;
  if (!Array.isArray(payload)) throw new Error("telescope_catalog_invalid_response");
  return payload.filter((profile): profile is TelescopeCatalogProfile =>
    typeof profile === "object" && profile !== null && typeof (profile as TelescopeCatalogProfile)._id === "string",
  );
}

async function telescopeProfiles(): Promise<TelescopeCatalogProfile[]> {
  if (cachedProfiles && cachedProfiles.expiresAt > Date.now()) return cachedProfiles.profiles;
  if (!pendingProfiles) {
    pendingProfiles = fetchProfiles()
      .then((profiles) => {
        cachedProfiles = { profiles, expiresAt: Date.now() + CACHE_TTL_MS };
        return profiles;
      })
      .finally(() => { pendingProfiles = undefined; });
  }
  return pendingProfiles;
}

export async function signedTelescopeAvatarUrl(creator: CreatorIdentity): Promise<string | undefined> {
  try {
    const profile = matchingTelescopeProfile(await telescopeProfiles(), creator);
    return profile?.profileImageThumbUrl || profile?.profileImageUrl;
  } catch {
    // Catalog availability must not depend on the source application's media endpoint.
    return undefined;
  }
}
