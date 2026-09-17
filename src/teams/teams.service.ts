import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import {
  Player,
  Team,
  Tournament,
  TournamentGroup,
  TournamentMatch,
} from '../database/entities';
import { teamRelations } from '../database/relations';
import { businessValidation } from '../common/validation';
import { teamResponse } from '../common/serializers';
import { CreateTeamDto, GenerateTeamsDto, UpdateTeamDto } from './teams.dto';

const shortName = (name: string) => name.trim().split(/\s+/)[0];

@Injectable()
export class TeamsService {
  constructor(private readonly db: DataSource) {}

  async index(tournamentId: string) {
    await this.db
      .getRepository(Tournament)
      .findOneByOrFail({ id: tournamentId });
    return (
      await this.db.getRepository(Team).find({
        where: { tournamentId },
        relations: teamRelations,
        order: { seed: { direction: 'ASC', nulls: 'LAST' } },
      })
    ).map(teamResponse);
  }

  async create(tournamentId: string, dto: CreateTeamDto) {
    if (dto.player_one_id === dto.player_two_id)
      businessValidation(
        'player_two_id',
        'Hai vận động viên trong một đội phải khác nhau.',
      );
    await this.db
      .getRepository(Tournament)
      .findOneByOrFail({ id: tournamentId });
    const ids = [dto.player_one_id, dto.player_two_id];
    const players = await this.db.getRepository(Player).findBy({ id: In(ids) });
    if (players.length !== 2)
      businessValidation('player_one_id', 'Không tìm thấy vận động viên.');
    const repo = this.db.getRepository(Team);
    const assigned = await repo.count({
      where: [
        { tournamentId, playerOneId: In(ids) },
        { tournamentId, playerTwoId: In(ids) },
      ],
    });
    if (assigned)
      businessValidation(
        'player_one_id',
        'Một trong hai vận động viên đã thuộc đội khác trong giải này.',
      );
    const one = players.find((player) => player.id === dto.player_one_id)!;
    const two = players.find((player) => player.id === dto.player_two_id)!;
    const team = await repo.save(
      repo.create({
        tournamentId,
        name: dto.name || `${shortName(one.name)} / ${shortName(two.name)}`,
        playerOneId: one.id,
        playerTwoId: two.id,
        totalRating: one.rating + two.rating,
        seed: dto.seed ?? null,
      }),
    );
    return this.show(team.id);
  }

  async show(id: string) {
    return teamResponse(
      await this.db
        .getRepository(Team)
        .findOneOrFail({ where: { id }, relations: teamRelations }),
    );
  }

  async update(id: string, dto: UpdateTeamDto) {
    const repo = this.db.getRepository(Team);
    await repo.save(repo.merge(await repo.findOneByOrFail({ id }), dto));
    return this.show(id);
  }

  async remove(id: string) {
    const repo = this.db.getRepository(Team);
    await repo.delete((await repo.findOneByOrFail({ id })).id);
  }

  async generate(tournamentId: string, dto: GenerateTeamsDto) {
    if (
      dto.player_ids.length < 2 ||
      new Set(dto.player_ids).size !== dto.player_ids.length
    )
      businessValidation(
        'player_ids',
        'Danh sách cần ít nhất 2 vận động viên và không được trùng lặp.',
      );
    if (dto.player_ids.length % 2 !== 0)
      businessValidation(
        'player_ids',
        'Số vận động viên phải là số chẵn để ghép đội đôi.',
      );
    await this.db
      .getRepository(Tournament)
      .findOneByOrFail({ id: tournamentId });
    if (
      (await this.db.getRepository(Team).countBy({ tournamentId })) &&
      !dto.replace
    )
      businessValidation(
        'replace',
        'Giải đã có đội. Bật tùy chọn tạo lại để thay thế danh sách hiện tại.',
      );
    const players = await this.db
      .getRepository(Player)
      .find({ where: { id: In(dto.player_ids) }, order: { rating: 'DESC' } });
    if (players.length !== dto.player_ids.length)
      businessValidation(
        'player_ids',
        'Một hoặc nhiều vận động viên không tồn tại.',
      );
    const pool = [...players];
    const pairs: Player[][] = [];
    while (pool.length >= 2) {
      pairs.push([
        pool.shift()!,
        (dto.balance ?? true) ? pool.pop()! : pool.shift()!,
      ]);
    }
    const ids = await this.db.transaction(async (manager) => {
      await manager.delete(TournamentMatch, { tournamentId });
      await manager.delete(TournamentGroup, { tournamentId });
      await manager.delete(Team, { tournamentId });
      const repo = manager.getRepository(Team);
      const teams = await repo.save(
        pairs.map(([one, two], index) =>
          repo.create({
            tournamentId,
            name: `${shortName(one.name)} / ${shortName(two.name)}`,
            playerOneId: one.id,
            playerTwoId: two.id,
            totalRating: one.rating + two.rating,
            seed: index + 1,
          }),
        ),
      );
      return teams.map((team) => team.id);
    });
    return (
      await this.db.getRepository(Team).find({
        where: { id: In(ids) },
        relations: teamRelations,
        order: { seed: 'ASC' },
      })
    ).map(teamResponse);
  }
}
