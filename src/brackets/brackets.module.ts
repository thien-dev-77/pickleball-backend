import { Module } from '@nestjs/common';
import { BracketsController } from './brackets.controller';
import { BracketsService } from './brackets.service';

@Module({ controllers: [BracketsController], providers: [BracketsService] })
export class BracketsModule {}
