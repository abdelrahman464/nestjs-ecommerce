import { Document as MongooseDocument, Query, Model } from 'mongoose';
import { PaginatedResponseDto } from '../../shared/dtos/paginated-response.dto';

export class ApiFeatures<TDoc extends MongooseDocument> {
  page: number;
  limit: number;

  constructor(
    private query: Query<TDoc[], TDoc>,
    private queryParams: Record<string, any>,
    private model: Model<any>, // <-- just Model<any>, no more TRaw
  ) {}

  filter(): ApiFeatures<TDoc> {
    const excludedFields = ['page', 'limit', 'sort', 'search'];
    const params = { ...this.queryParams };
    excludedFields.forEach((f) => delete params[f]);

    const queryStr = JSON.stringify(params).replace(
      /\b(gte|gt|lte|lt)\b/g,
      (match) => `$${match}`,
    );

    this.query = this.query.find(JSON.parse(queryStr));
    return this;
  }

  search(fields: string[]): ApiFeatures<TDoc> {
    const keyword = this.queryParams.search;
    if (!keyword) return this;

    this.query = this.query.find({
      $or: fields.map((field) => ({
        [field]: { $regex: keyword, $options: 'i' },
      })),
    });
    return this;
  }

  sort(): ApiFeatures<TDoc> {
    const sortBy = this.queryParams.sort
      ? (this.queryParams.sort as string).split(',').join(' ')
      : '-createdAt';

    this.query = this.query.sort(sortBy);
    return this;
  }

  paginate(): ApiFeatures<TDoc> {
    this.page = parseInt(this.queryParams.page) || 1;
    this.limit = parseInt(this.queryParams.limit) || 10;
    this.query = this.query
      .skip((this.page - 1) * this.limit)
      .limit(this.limit);
    return this;
  }

  getQuery(): Query<TDoc[], TDoc> {
    return this.query;
  }

  async executePaginated(): Promise<PaginatedResponseDto<TDoc>> {
    const filterConditions = this.query.getFilter();

    const [data, total] = await Promise.all([
      this.query.exec(),
      this.model.countDocuments(filterConditions),
    ]);

    return {
      data,
      total,
      page: this.page,
      limit: this.limit,
      totalPages: Math.ceil(total / this.limit) || 0,
    };
  }
}
