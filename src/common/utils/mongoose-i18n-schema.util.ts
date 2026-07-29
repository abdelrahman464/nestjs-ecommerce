// src/shared/utils/mongoose-i18n-schema.util.ts
import { MongooseModule } from '@nestjs/mongoose';
import * as mongooseI18n from 'mongoose-i18n-localize';
import { Schema } from 'mongoose';
import {
  DEFAULT_CONTENT_LOCALE,
  SUPPORTED_CONTENT_LOCALES,
} from '../constants/supported-content-locales.constant';

// ✅ No return type annotation — let TypeScript infer it naturally
export function createI18nMongooseModule(name: string, schema: Schema) {
  return MongooseModule.forFeatureAsync([
    {
      name,
      useFactory: () => {
        schema.plugin(mongooseI18n, {
          locales: [...SUPPORTED_CONTENT_LOCALES],
          defaultLocale: DEFAULT_CONTENT_LOCALE,
        });
        return schema;
      },
    },
  ]);
}
