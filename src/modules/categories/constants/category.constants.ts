import { localizedSearchPaths } from '../../../common/constants/supported-content-locales.constant';

export const CATEGORY_PUBLIC_FIELDS =
  '_id title slug description parentCategory' as const;
export const CATEGORY_SEARCH_FIELDS = [
  ...localizedSearchPaths('title'),
  'slug',
];
