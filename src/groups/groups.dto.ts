import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateGroupDto {
  @IsString() @MaxLength(80) name!: string;
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) team_ids: string[] =
    [];
}

export class UpdateGroupDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) team_ids?: string[];
}

export class RandomizeGroupsDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(32) group_count!: number;
}
