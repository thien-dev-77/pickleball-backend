import { IsIn } from 'class-validator';

export class UploadImageDto {
  @IsIn(['players', 'tournaments']) purpose!: 'players' | 'tournaments';
}
