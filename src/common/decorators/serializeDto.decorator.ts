import { SetMetadata } from '@nestjs/common';
import { Type } from '@nestjs/common';

export const SERIALIZE_DTO_KEY = 'serialize_dto';


export const SerializeDto = (dto: Type) => SetMetadata(SERIALIZE_DTO_KEY, dto);
