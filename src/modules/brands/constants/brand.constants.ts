import { localizedSearchPaths } from '../../../common/constants/supported-content-locales.constant';

export const BRAND_PUBLIC_FIELDS =
  '_id title slug description seo logo website isActive';
export const BRAND_SEARCH_FIELDS = [
  ...localizedSearchPaths('title'),
  'slug',
];
