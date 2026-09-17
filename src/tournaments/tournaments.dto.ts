import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class TournamentQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional()
  @IsIn(['draft', 'group', 'knockout', 'completed'])
  status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) per_page = 20;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
}

export class CreateTournamentDto {
  @IsOptional() @IsString() @MaxLength(180) slug?: string | null;
  @IsString() @MaxLength(160) name!: string;
  @IsIn(['single', 'double']) format!: string;
  @IsOptional()
  @IsIn(['draft', 'group', 'knockout', 'completed'])
  status?: string;
  @IsOptional() @IsString() @MaxLength(120) category?: string | null;
  @IsOptional() @IsString() @MaxLength(180) location?: string | null;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsUrl() @MaxLength(2048) cover_url?: string | null;
  @Type(() => Number) @IsInt() @Min(2) @Max(128) max_teams!: number;
  @IsOptional() @IsDateString() starts_at?: string | null;
  @IsOptional() @IsDateString() ends_at?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(64) courts?: number;
  @IsOptional() @IsObject() settings?: Record<string, unknown> | null;
}

export class UpdateTournamentDto {
  @IsOptional() @IsString() @MaxLength(180) slug?: string | null;
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsIn(['single', 'double']) format?: string;
  @IsOptional()
  @IsIn(['draft', 'group', 'knockout', 'completed'])
  status?: string;
  @IsOptional() @IsString() @MaxLength(120) category?: string | null;
  @IsOptional() @IsString() @MaxLength(180) location?: string | null;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsUrl() @MaxLength(2048) cover_url?: string | null;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(128)
  max_teams?: number;
  @IsOptional() @IsDateString() starts_at?: string | null;
  @IsOptional() @IsDateString() ends_at?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(64) courts?:
    number | null;
  @IsOptional() @IsObject() settings?: Record<string, unknown> | null;
}
