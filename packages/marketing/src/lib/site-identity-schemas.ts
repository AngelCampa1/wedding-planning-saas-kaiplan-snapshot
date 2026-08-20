import {
  buildOrganizationSchema,
  buildSoftwareApplicationSchema,
  buildWebSiteSchema,
} from "./schema-builders";
import { buildLandingSoftwareApplicationProps } from "./landing-schema";
import { withId } from "./schema-graph";
import type { SiteConfig } from "../types";

export interface SiteIdentitySchemasInput {
  canonicalUrl: string;
  featureListOverride?: string[];
}

export interface SiteIdentitySchemas {
  schemas: Record<string, unknown>[];
  ids: {
    organizationId: string;
    softwareId: string;
    websiteId: string;
  };
}

export function buildSiteIdentitySchemas(
  config: SiteConfig,
  { canonicalUrl, featureListOverride }: SiteIdentitySchemasInput,
): SiteIdentitySchemas {
  const siteUrl = `https://${config.domain}`;
  const organizationId = `${siteUrl}/#organization`;
  const softwareId = `${siteUrl}/#software`;
  const websiteId = `${siteUrl}/#website`;

  const landingSoftwareProps = buildLandingSoftwareApplicationProps(config, {
    canonicalUrl,
    imageUrl: `${siteUrl}${config.defaultOgImage}`,
  });
  if (featureListOverride) {
    landingSoftwareProps.featureList = featureListOverride;
  }

  const organization = withId(
    buildOrganizationSchema({
      name: config.name,
      url: siteUrl,
      ...(config.author && { founder: config.author }),
      ...(config.sameAs && { sameAs: config.sameAs }),
      ...(config.contactEmail && {
        contactPoint: { email: config.contactEmail, type: "customer support" },
      }),
      ...(config.areaServed && { areaServed: config.areaServed }),
      ...(config.logo?.light && { logo: `${siteUrl}${config.logo.light}` }),
    }),
    organizationId,
  );

  const software = withId(
    buildSoftwareApplicationSchema(landingSoftwareProps),
    softwareId,
  );

  const website = withId(
    buildWebSiteSchema({
      name: config.name,
      url: siteUrl,
      description: config.tagline,
      ...(config.searchPathTemplate && {
        searchAction: {
          siteUrl,
          searchPathTemplate: config.searchPathTemplate,
        },
      }),
      publisherId: organizationId,
    }),
    websiteId,
  );

  return {
    schemas: [organization, software, website],
    ids: { organizationId, softwareId, websiteId },
  };
}
