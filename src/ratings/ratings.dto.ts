import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CalculateRatingDto {
  @Type(() => Number) @IsNumber() @Min(1) @Max(5) base_rating!: number;
  @IsOptional() @IsArray() @IsString({ each: true }) passed_rules: string[] =
    [];
}

export class AssessPlayerDto extends CalculateRatingDto {
  @IsOptional() @IsString() @MaxLength(2000) notes?: string | null;
}
