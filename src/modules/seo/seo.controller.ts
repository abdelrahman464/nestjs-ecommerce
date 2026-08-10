import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { SeoMeta } from '../../common/utils/seo.util';
import { SeoService, SitemapResponse } from './seo.service';

/**
 * Public SEO helpers for the storefront (Next.js `generateMetadata`, sitemap
 * generation). Meta fields fall back to content fields when unset.
 */
@Controller('seo')
export class SeoController {
  constructor(private readonly seoService: SeoService) {}

  @Public()
  @Get('sitemap')
  getSitemap(): Promise<SitemapResponse> {
    return this.seoService.getSitemap();
  }

  @Public()
  @Get('products/:slug')
  resolveProduct(@Param('slug') slug: string): Promise<SeoMeta> {
    return this.seoService.resolveProduct(slug);
  }

  @Public()
  @Get('categories/:slug')
  resolveCategory(@Param('slug') slug: string): Promise<SeoMeta> {
    return this.seoService.resolveCategory(slug);
  }

  @Public()
  @Get('brands/:slug')
  resolveBrand(@Param('slug') slug: string): Promise<SeoMeta> {
    return this.seoService.resolveBrand(slug);
  }

  @Public()
  @Get('articles/:slug')
  resolveArticle(@Param('slug') slug: string): Promise<SeoMeta> {
    return this.seoService.resolveArticle(slug);
  }
}
