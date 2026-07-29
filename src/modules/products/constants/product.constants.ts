import { localizedSearchPaths } from '../../../common/constants/supported-content-locales.constant';

export const PRODUCT_PUBLIC_FIELDS =
  'title slug description shortDescription images status ratingsAverage ratingsQuantity showOnBanner order optionDefinitions groupBy category brand';

export const PRODUCT_DEFAULT_SORT = 'order,-createdAt';

export const PRODUCT_SEARCH_FIELDS = [
  ...localizedSearchPaths('title'),
  'slug',
];

export const VARIANT_PUBLIC_FIELDS =
  'product sku barcode options price priceAfterDiscount stock unit images status isDefault order';
