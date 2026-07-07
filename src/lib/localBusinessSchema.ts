import { SITE } from "./site";

export const SITE_URL = "https://happy-hugger-fluff.lovable.app";
export const CLINIC_ID = `${SITE_URL}/#clinic`;

type SchemaOpts = {
  /** Absolute URL of the page emitting the schema. Sets `url`. */
  pageUrl: string;
  /** Extra @type entries to add alongside MedicalClinic + LocalBusiness (e.g. "Place"). */
  extraTypes?: string[];
  /** Optional amenity list for the clinic (Place feature). */
  amenities?: { name: string; value?: boolean | string }[];
};

/**
 * Canonical MedicalClinic + LocalBusiness JSON-LD for Baeshen Medical Complex.
 * A single @id is reused across every page so Google treats them as the same entity.
 */
export function buildLocalBusinessSchema({ pageUrl, extraTypes = [], amenities }: SchemaOpts) {
  const base: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": ["MedicalClinic", "LocalBusiness", ...extraTypes],
    "@id": CLINIC_ID,
    name: SITE.nameAr,
    alternateName: SITE.nameEn,
    url: pageUrl,
    telephone: SITE.phone,
    email: SITE.email,
    image: `${SITE_URL}/og-image.jpg`,
    priceRange: "$$",
    currenciesAccepted: "SAR",
    paymentAccepted: "Cash, Credit Card, Mada, Insurance",
    medicalSpecialty: [
      "Cardiovascular",
      "Dermatology",
      "Pediatric",
      "Obstetric",
      "Dentistry",
      "InternalMedicine",
      "Ophthalmologic",
      "Otolaryngologic",
      "Orthopedic",
    ],
    address: {
      "@type": "PostalAddress",
      streetAddress: "King Abdulaziz Rd, Al-Dhabya",
      addressLocality: "Sabya",
      addressRegion: "Jazan",
      postalCode: SITE.postalCode,
      addressCountry: "SA",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: SITE.lat,
      longitude: SITE.lng,
    },
    hasMap: SITE.mapsUrl,
    areaServed: [
      { "@type": "City", name: "Sabya" },
      { "@type": "AdministrativeArea", name: "Jazan Region" },
    ],
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"],
        opens: "09:00",
        closes: "23:00",
      },
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: "Friday",
        opens: "16:00",
        closes: "23:00",
      },
    ],
    sameAs: [SITE.instagram, SITE.tiktok, SITE.x],
    contactPoint: [
      {
        "@type": "ContactPoint",
        telephone: SITE.phone,
        contactType: "reservations",
        areaServed: "SA",
        availableLanguage: ["Arabic", "English"],
      },
      {
        "@type": "ContactPoint",
        telephone: SITE.mobile,
        contactType: "customer service",
        areaServed: "SA",
        availableLanguage: ["Arabic", "English"],
      },
    ],
    isAcceptingNewPatients: true,
  };

  if (amenities && amenities.length > 0) {
    base.amenityFeature = amenities.map((a) => ({
      "@type": "LocationFeatureSpecification",
      name: a.name,
      value: a.value ?? true,
    }));
  }

  return base;
}

export function buildBreadcrumbs(
  items: { name: string; path: string }[],
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.path.startsWith("http") ? it.path : `${SITE_URL}${it.path}`,
    })),
  };
}
