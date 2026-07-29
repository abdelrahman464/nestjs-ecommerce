import { localizedSearchPaths } from '../../../common/constants/supported-content-locales.constant';

export const PRODUCT_PUBLIC_FIELDS =
  'title slug description shortDescription sku price priceAfterDiscount stock unit images status ratingsAverage ratingsQuantity showOnBanner order category brand';

export const PRODUCT_DEFAULT_SORT = 'order,-createdAt';

export const PRODUCT_SEARCH_FIELDS = [
  ...localizedSearchPaths('title'),
  'slug',
  'sku',
];
