import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MaxLength(120)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  password!: string;
}
