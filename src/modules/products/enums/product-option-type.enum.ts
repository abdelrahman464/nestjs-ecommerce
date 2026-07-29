export enum ProductOptionType {
  COLOR = 'color',
  SIZE = 'size',
  WEIGHT = 'weight',
  MATERIAL = 'material',
  BRAND = 'brand',
  MODEL = 'model',
}

/** Shopify-like cap: keep combination matrices manageable. */
export const MAX_PRODUCT_OPTION_TYPES = 3;
