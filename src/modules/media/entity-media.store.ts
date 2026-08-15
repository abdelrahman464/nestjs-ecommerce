import { Types } from 'mongoose';

export type MediaLeanDoc = {
  deletedAt?: Date | null;
  [key: string]: unknown;
};

/**
 * Persistence port for EntityMediaService.
 * Catalog services pass a repository store — never a Mongoose model.
 */
export type EntityMediaStore = {
  findById(
    id: Types.ObjectId,
    extraSelect: string,
  ): Promise<MediaLeanDoc | null>;
  setFields(id: Types.ObjectId, fields: Record<string, unknown>): Promise<void>;
  unsetFields(id: Types.ObjectId, fieldNames: string[]): Promise<void>;
};

/** Mongoose adapter — used only inside repositories. */
export function mongooseMediaStore(model: object): EntityMediaStore {
  const m = model as {
    findById: (id: Types.ObjectId) => {
      select: (fields: string) => {
        lean: () => { exec: () => Promise<MediaLeanDoc | null> };
      };
    };
    findByIdAndUpdate: (
      id: Types.ObjectId,
      update: Record<string, unknown>,
    ) => { exec: () => Promise<unknown> };
  };

  return {
    async findById(id, extraSelect) {
      return m.findById(id).select(extraSelect).lean().exec();
    },
    async setFields(id, fields) {
      await m.findByIdAndUpdate(id, { $set: fields }).exec();
    },
    async unsetFields(id, fieldNames) {
      const $unset: Record<string, 1> = {};
      for (const name of fieldNames) {
        $unset[name] = 1;
      }
      await m.findByIdAndUpdate(id, { $unset }).exec();
    },
  };
}
