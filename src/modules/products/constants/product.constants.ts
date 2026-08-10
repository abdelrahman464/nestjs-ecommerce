import { localizedSearchPaths } from '../../../common/constants/supported-content-locales.constant';

export const PRODUCT_PUBLIC_FIELDS =
  'title slug description shortDescription seo images status ratingsAverage ratingsQuantity showOnBanner order optionDefinitions groupBy category brand';

export const PRODUCT_DEFAULT_SORT = 'order,-createdAt';

/** Textable product fields for `GET /products?search=` (locale-aware). */
export const PRODUCT_SEARCH_FIELDS = [
  ...localizedSearchPaths('title'),
  ...localizedSearchPaths('description'),
  ...localizedSearchPaths('shortDescription'),
  'slug',
];

export const VARIANT_PUBLIC_FIELDS =
  'product sku barcode options price priceAfterDiscount stock unit images status isDefault order';
