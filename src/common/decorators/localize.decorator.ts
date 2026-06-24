import { SetMetadata } from '@nestjs/common';
import { LocalizeMode } from '../enums/localize-mode.enum';
/**
 * How the {@link LocalizationInterceptor} should resolve i18n fields.
 * - ONLY → `toJSONLocalizedOnly` (single locale string, default)
 * - ALL  → `toJSONLocalized` (keeps every locale, e.g. `{ en, ar, localized }`)
 */

export const LOCALIZE_MODE_KEY = 'localize_mode';

/**
 * Choose the localization strategy for a handler or controller.
 *
 * @example
 * \@Localize(LocalizeMode.ALL)
 * \@Get()
 * findAll() { ... }
 */
export const Localize = (mode: LocalizeMode = LocalizeMode.ONLY) =>
  SetMetadata(LOCALIZE_MODE_KEY, mode);
