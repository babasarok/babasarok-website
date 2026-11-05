const PRODUCT_FIELDS = `
  id
  slug
  name
  customFields { shortDescription tagline date popularityRank }
  featuredAsset { source }
  facetValues { code name facet { code } }
  productDefinition
`;

export const PRODUCTS_QUERY = `
  query CatalogProducts($skip: Int!, $take: Int!) {
    products(options: { skip: $skip, take: $take }) {
      totalItems
      items { ${PRODUCT_FIELDS} }
    }
  }
`;

export const PRODUCT_QUERY = `
  query CatalogProduct($slug: String!) {
    product(slug: $slug) {
      ${PRODUCT_FIELDS}
      assets { source customFields { galleryDescription } }
    }
  }
`;

const MATERIAL_FIELDS = `
  slug
  label
  subtitle
  description
  thumbnail { source }
  colors { id label hex asset { source } }
`;

export const MATERIALS_QUERY = `query CatalogMaterials { materials { ${MATERIAL_FIELDS} } }`;

export const MATERIAL_QUERY = `
  query CatalogMaterial($slug: String!) { material(slug: $slug) { ${MATERIAL_FIELDS} } }
`;

export const THREAD_COLORS_QUERY = `
  query CatalogThreadColors { threadColors { id label hex swatch { source } } }
`;

export const PRODUCT_GROUPS_QUERY = `
  query CatalogProductGroups { productGroups { id kind label discount productIds } }
`;
