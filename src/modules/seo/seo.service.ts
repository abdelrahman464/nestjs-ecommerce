import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveRequestContentLocale } from '../../common/constants/supported-content-locales.constant';
import { I18nHttpException } from '../../common/filters/i18n-http.exception';
import { buildSeoMeta, SeoMeta } from '../../common/utils/seo.util';
import { ArticlesService } from '../articles/articles.service';
import { BrandsService } from '../brands/brands.service';
import { CategoriesService } from '../categories/categories.service';
import { ProductStatus } from '../products/enums/product-status.enum';
import { ProductsService } from '../products/products.service';

export type SitemapEntry = {
  slug: string;
  path: string;
  updatedAt: Date;
};

export type SitemapResponse = {
  products: SitemapEntry[];
  categories: SitemapEntry[];
  brands: SitemapEntry[];
  articles: SitemapEntry[];
};

@Injectable()
export class SeoService {
  constructor(
    private readonly productsService: ProductsService,
    private readonly categoriesService: CategoriesService,
    private readonly brandsService: BrandsService,
    private readonly articlesService: ArticlesService,
    private readonly configService: ConfigService,
  ) {}

  private frontendUrl(): string {
    return (
      this.configService.get<string>('app.frontendUrl') ??
      'http://localhost:3000'
    );
  }

  /** Public sitemap for SSG / crawler jobs — slugs only, no heavy payloads. */
  async getSitemap(): Promise<SitemapResponse> {
    const [products, categories, brands, articles] = await Promise.all([
      this.productsService.listSitemapEntries(),
      this.categoriesService.listSitemapEntries(),
      this.brandsService.listSitemapEntries(),
      this.articlesService.listSitemapEntries(),
    ]);

    return {
      products: products.map((p) => ({
        slug: p.slug,
        path: `/products/${p.slug}`,
        updatedAt: p.updatedAt,
      })),
      categories: categories.map((c) => ({
        slug: c.slug,
        path: `/categories/${c.slug}`,
        updatedAt: c.updatedAt,
      })),
      brands: brands.map((b) => ({
        slug: b.slug,
        path: `/brands/${b.slug}`,
        updatedAt: b.updatedAt,
      })),
      articles: articles.map((a) => ({
        slug: a.slug,
        path: `/articles/${a.slug}`,
        updatedAt: a.updatedAt,
      })),
    };
  }

  async resolveProduct(slug: string): Promise<SeoMeta> {
    const product = await this.productsService.findBySlug(slug);
    if (product.status === ProductStatus.INACTIVE) {
      throw new I18nHttpException(
        HttpStatus.NOT_FOUND,
        'product.notFoundBySlug',
        { slug },
      );
    }

    return buildSeoMeta(
      {
        slug: product.slug,
        pathPrefix: '/products',
        title: product.title as never,
        description:
          (product.shortDescription as never) ?? (product.description as never),
        metaTitle: product.seo?.metaTitle as never,
        metaDescription: product.seo?.metaDescription as never,
        keywords: product.seo?.keywords as never,
        image: product.images?.[0] ?? null,
      },
      resolveRequestContentLocale(),
      this.frontendUrl(),
    );
  }

  async resolveCategory(slug: string): Promise<SeoMeta> {
    const category = await this.categoriesService.findBySlug(slug);
    if (!category.isActive) {
      throw new I18nHttpException(
        HttpStatus.NOT_FOUND,
        'category.notFoundBySlug',
        { slug },
      );
    }

    return buildSeoMeta(
      {
        slug: category.slug,
        pathPrefix: '/categories',
        title: category.title as never,
        description: category.description as never,
        metaTitle: category.seo?.metaTitle as never,
        metaDescription: category.seo?.metaDescription as never,
        keywords: category.seo?.keywords as never,
      },
      resolveRequestContentLocale(),
      this.frontendUrl(),
    );
  }

  async resolveBrand(slug: string): Promise<SeoMeta> {
    const brand = await this.brandsService.findBySlug(slug);
    if (!brand.isActive) {
      throw new I18nHttpException(
        HttpStatus.NOT_FOUND,
        'brand.notFoundBySlug',
        { slug },
      );
    }

    return buildSeoMeta(
      {
        slug: brand.slug,
        pathPrefix: '/brands',
        title: brand.title as never,
        description: brand.description as never,
        metaTitle: brand.seo?.metaTitle as never,
        metaDescription: brand.seo?.metaDescription as never,
        keywords: brand.seo?.keywords as never,
        image: brand.logo ?? null,
      },
      resolveRequestContentLocale(),
      this.frontendUrl(),
    );
  }

  async resolveArticle(slug: string): Promise<SeoMeta> {
    const article = await this.articlesService.findBySlug(slug);
    if (!article.isPublished) {
      throw new I18nHttpException(
        HttpStatus.NOT_FOUND,
        'article.notFoundBySlug',
        { slug },
      );
    }

    return buildSeoMeta(
      {
        slug: article.slug,
        pathPrefix: '/articles',
        title: article.title as never,
        description: (article.excerpt as never) ?? (article.content as never),
        metaTitle: article.seo?.metaTitle as never,
        metaDescription: article.seo?.metaDescription as never,
        keywords: article.seo?.keywords as never,
        image: article.coverImage ?? null,
      },
      resolveRequestContentLocale(),
      this.frontendUrl(),
    );
  }
}
