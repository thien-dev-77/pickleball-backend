import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTeamDto {
  @IsOptional() @IsString() @MaxLength(160) name?: string | null;
  @IsUUID() player_one_id!: string;
  @IsOptional() @IsUUID() player_two_id?: string | null;
  @IsOptional() @IsInt() @Min(1) seed?: number | null;
  @IsOptional() @IsBoolean() payment_confirmed?: boolean;
}

export class UpdateTeamDto {
  @IsOptional() @IsUUID() player_one_id?: string;
  @IsOptional() @IsUUID() player_two_id?: string | null;
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsInt() @Min(1) seed?: number | null;
  @IsOptional() @IsBoolean() payment_confirmed?: boolean;
}

export class GenerateTeamsDto {
  @IsArray() @IsUUID('all', { each: true }) player_ids!: string[];
  @IsOptional() @IsBoolean() balance = true;
  @IsOptional() @IsBoolean() replace = false;
}
