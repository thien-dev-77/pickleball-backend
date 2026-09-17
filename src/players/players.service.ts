import { Injectable } from '@nestjs/common';
import { DataSource, ILike, MoreThanOrEqual } from 'typeorm';
import type { FindOptionsWhere } from 'typeorm';
import { Player } from '../database/entities';
import { paginate, playerResponse } from '../common/serializers';
import {
  CreatePlayerDto,
  PlayerQueryDto,
  UpdatePlayerDto,
} from './players.dto';

@Injectable()
export class PlayersService {
  constructor(private readonly db: DataSource) {}

  async index(query: PlayerQueryDto) {
    const where: FindOptionsWhere<Player> = {
      ...(query.search ? { name: ILike(`%${query.search}%`) } : {}),
      ...(query.gender ? { gender: query.gender } : {}),
      ...(query.min_rating !== undefined
        ? { rating: MoreThanOrEqual(query.min_rating) }
        : {}),
    };
    const [players, total] = await this.db.getRepository(Player).findAndCount({
      where,
      order:
        query.sort === 'rating'
          ? { rating: 'DESC', name: 'ASC' }
          : { name: 'ASC' },
      skip: (query.page - 1) * query.per_page,
      take: query.per_page,
    });
    return paginate(
      players.map(playerResponse),
      total,
      query.page,
      query.per_page,
    );
  }

  async create(dto: CreatePlayerDto) {
    const repo = this.db.getRepository(Player);
    return playerResponse(
      await repo.save(
        repo.create({
          name: dto.name,
          gender: dto.gender,
          avatarUrl: dto.avatar_url ?? null,
          rating: dto.rating,
          hand: dto.hand,
          metadata: dto.metadata ?? null,
        }),
      ),
    );
  }

  async show(id: string) {
    return playerResponse(
      await this.db.getRepository(Player).findOneByOrFail({ id }),
    );
  }

  async update(id: string, dto: UpdatePlayerDto) {
    const repo = this.db.getRepository(Player);
    const player = await repo.findOneByOrFail({ id });
    repo.merge(player, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
      ...(dto.avatar_url !== undefined ? { avatarUrl: dto.avatar_url } : {}),
      ...(dto.rating !== undefined ? { rating: dto.rating } : {}),
      ...(dto.hand !== undefined ? { hand: dto.hand } : {}),
      ...(dto.metadata !== undefined ? { metadata: dto.metadata } : {}),
    });
    return playerResponse(await repo.save(player));
  }

  async remove(id: string) {
    const repo = this.db.getRepository(Player);
    await repo.delete((await repo.findOneByOrFail({ id })).id);
  }
}
