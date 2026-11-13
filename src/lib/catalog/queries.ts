const PRODUCT_FIELDS = `
  id
  slug
  name
  customFields { shortDescription tagline date popularityRank }
  featuredAsset { source focalPoint { x y } }
  facetValues { code name facet { code } }
  productDefinition
`;

const PRODUCTS_PAGE = `
  products(options: { skip: $skip, take: $take }) {
    totalItems
    items { ${PRODUCT_FIELDS} }
  }
`;

export const PRODUCTS_QUERY = `
  query CatalogProducts($skip: Int!, $take: Int!) { ${PRODUCTS_PAGE} }
`;

export const PRODUCT_QUERY = `
  query CatalogProduct($slug: String!) {
    product(slug: $slug) {
      ${PRODUCT_FIELDS}
      description
      assets { source focalPoint { x y } customFields { galleryDescription } }
    }
  }
`;

const MATERIAL_FIELDS = `
  slug
  label
  subtitle
  description
  thumbnail { source focalPoint { x y } }
  colors { id label hex asset { source focalPoint { x y } } }
`;

export const MATERIALS_QUERY = `query CatalogMaterials { materials { ${MATERIAL_FIELDS} } }`;

export const MATERIAL_QUERY = `
  query CatalogMaterial($slug: String!) { material(slug: $slug) { ${MATERIAL_FIELDS} } }
`;

const THREAD_COLORS = `threadColors { id label hex swatch { source focalPoint { x y } } }`;

const PRODUCT_GROUPS = `productGroups { id kind label discount productIds }`;

export const CATALOG_QUERY = `
  query Catalog($skip: Int!, $take: Int!) {
    ${PRODUCTS_PAGE}
    materials { ${MATERIAL_FIELDS} }
    ${THREAD_COLORS}
    ${PRODUCT_GROUPS}
  }
`;
