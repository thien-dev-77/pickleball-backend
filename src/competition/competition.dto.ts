import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';

export class RegistrationDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(256)
  @IsUUID('all', { each: true })
  player_ids!: string[];
  @IsOptional() @IsIn(['registered', 'confirmed']) status = 'registered';
}
export class RegistrationUpdateDto {
  @IsIn(['registered', 'confirmed', 'withdrawn']) status!: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
export class RosterLockDto {
  @IsBoolean() locked!: boolean;
}
export class EntriesDto {
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) player_ids?: string[];
  @IsOptional() @IsBoolean() balance = true;
  @IsOptional() @IsBoolean() replace = false;
}
export class DrawDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(32) group_count!: number;
  @IsOptional() @IsIn(['random', 'seeded']) mode = 'random';
  @IsOptional() @IsBoolean() replace = false;
}
export class ScheduleDto {
  @IsDateString() starts_at!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(64) court_count = 2;
  @Type(() => Number) @IsInt() @Min(10) @Max(240) slot_minutes = 30;
  @Type(() => Number) @IsInt() @Min(0) @Max(120) rest_minutes = 10;
  @IsOptional() @IsBoolean() replace = false;
}
export class PlayoffDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(8) qualifiers_per_group = 2;
  @IsOptional() @IsBoolean() consolation_final = false;
  @IsOptional() @IsBoolean() replace = false;
}
export class GameDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(99) a!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(99) b!: number;
}
export class ScoreDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => GameDto)
  games: GameDto[] = [];
  @IsOptional() @IsIn(['normal', 'walkover', 'retirement']) kind = 'normal';
  @IsOptional() @IsUUID() winner_team_id?: string;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}
export class CompetitionSettingsDto {
  @IsOptional() @IsIn(['open', 'male', 'female', 'mixed']) division?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(6)
  min_rating?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(6)
  max_rating?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(2)
  @Max(12)
  max_team_rating?: number;
  @IsOptional() @Type(() => Number) @IsIn([11, 15, 21]) group_target?: number;
  @IsOptional()
  @Type(() => Number)
  @IsIn([11, 15, 21])
  knockout_target?: number;
  @IsOptional() @Type(() => Number) @IsIn([1, 3, 5]) group_best_of?: number;
  @IsOptional() @Type(() => Number) @IsIn([1, 3, 5]) knockout_best_of?: number;
}
export class FinalizeDto {
  @IsBoolean() apply_rating!: boolean;
}

export class AssignmentDto {
  @IsUUID() team_id!: string;
  @IsUUID() group_id!: string;
}
export class TieBreakDto {
  @IsUUID() group_id!: string;
  @IsArray()
  @ArrayMinSize(2)
  @IsUUID('all', { each: true })
  team_ids!: string[];
  @IsString() @MaxLength(1000) reason!: string;
}
