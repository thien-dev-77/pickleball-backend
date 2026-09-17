import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PublicPlayersQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(['male', 'female', 'other']) gender?: string;
  @IsOptional() @IsIn(['rating', 'name']) sort?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) per_page = 100;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
}
