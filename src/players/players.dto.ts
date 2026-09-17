import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class PlayerQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(['male', 'female', 'other']) gender?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(6)
  min_rating?: number;
  @IsOptional() @IsIn(['rating', 'name']) sort?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(100) per_page = 20;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page = 1;
}

export class CreatePlayerDto {
  @IsString() @MaxLength(120) name!: string;
  @IsIn(['male', 'female', 'other']) gender!: string;
  @IsOptional() @IsUrl() avatar_url?: string | null;
  @Type(() => Number) @IsNumber() @Min(1) @Max(6) rating!: number;
  @IsIn(['right', 'left']) hand!: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown> | null;
}

export class UpdatePlayerDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsIn(['male', 'female', 'other']) gender?: string;
  @IsOptional() @IsUrl() avatar_url?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(6) rating?: number;
  @IsOptional() @IsIn(['right', 'left']) hand?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown> | null;
}
