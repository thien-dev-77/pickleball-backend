import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class MatchQueryDto {
  @IsOptional() @IsUUID() tournament_id?: string;
  @IsOptional()
  @IsIn(['group', 'knockout', 'semifinal', 'final', 'bronze'])
  stage?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) per_page = 50;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
}

export class UpdateMatchDto {
  @IsOptional() @IsString() @MaxLength(80) round?: string;
  @IsOptional() @IsString() @MaxLength(80) court?: string | null;
  @IsOptional() @IsDateString() scheduled_at?: string | null;
}

export class MatchResultDto {
  @Type(() => Number) @IsInt() @Min(0) score_a!: number;
  @Type(() => Number) @IsInt() @Min(0) score_b!: number;
}

export class GenerateRoundRobinDto {
  @IsOptional() @IsDateString() starts_at?: string | null;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(240)
  round_interval_minutes = 45;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(32) court_count = 2;
}
