import { Module } from '@nestjs/common';
import { createI18nMongooseModule } from '../../common/utils/mongoose-i18n-schema.util';
import { BrandsController } from './brands.controller';
import { BrandsService } from './brands.service';
import { BrandRepository } from './repository/brands.repository';
import { Brand, BrandSchema } from './schemas/brand.schema';

@Module({
  imports: [createI18nMongooseModule(Brand.name, BrandSchema)],
  controllers: [BrandsController],
  providers: [BrandsService, BrandRepository],
  exports: [BrandsService, BrandRepository],
})
export class BrandsModule {}
