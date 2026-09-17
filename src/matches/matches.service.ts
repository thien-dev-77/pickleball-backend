import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { FindOptionsWhere } from 'typeorm';
import { helpers } from 'brackets-manager';
import {
  Tournament,
  TournamentGroup,
  TournamentMatch,
} from '../database/entities';
import { matchRelations } from '../database/relations';
import { matchResponse, paginate } from '../common/serializers';
import { businessValidation } from '../common/validation';
import { CompetitionService } from '../competition/competition.service';
import {
  GenerateRoundRobinDto,
  MatchQueryDto,
  MatchResultDto,
  UpdateMatchDto,
} from './matches.dto';

@Injectable()
export class MatchesService {
  constructor(
    private readonly db: DataSource,
    private readonly competition: CompetitionService,
  ) {}
  async index(query: MatchQueryDto) {
    const where: FindOptionsWhere<TournamentMatch> = {
      ...(query.tournament_id ? { tournamentId: query.tournament_id } : {}),
      ...(query.stage ? { stage: query.stage } : {}),
    };
    const [matches, total] = await this.db
      .getRepository(TournamentMatch)
      .findAndCount({
        where,
        relations: matchRelations,
        order: { scheduledAt: { direction: 'ASC', nulls: 'LAST' } },
        skip: (query.page - 1) * query.per_page,
        take: query.per_page,
      });
    return paginate(
      matches.map(matchResponse),
      total,
      query.page,
      query.per_page,
    );
  }
  async show(id: string) {
    return matchResponse(
      await this.db
        .getRepository(TournamentMatch)
        .findOneOrFail({ where: { id }, relations: matchRelations }),
    );
  }
  async update(id: string, dto: UpdateMatchDto) {
    const current = await this.db
      .getRepository(TournamentMatch)
      .findOneByOrFail({ id });
    await this.competition.mutate(
      current.tournamentId,
      async (manager, tournament) => {
        const match = await manager.findOneByOrFail(TournamentMatch, { id });
        if (match.winnerTeamId || tournament.settings?.finalized)
          businessValidation(
            'match',
            'Trận đã có kết quả, không được sửa lịch.',
          );
        const time =
          dto.scheduled_at !== undefined
            ? dto.scheduled_at
              ? new Date(dto.scheduled_at)
              : null
            : match.scheduledAt;
        const court = dto.court !== undefined ? dto.court : match.court;
        const slot = Number(match.metadata?.slot_minutes ?? 30) * 60000;
        if (
          time &&
          ((tournament.startsAt && time < tournament.startsAt) ||
            (tournament.endsAt &&
              time.getTime() + slot > tournament.endsAt.getTime()))
        )
          businessValidation('scheduled_at', 'Lịch nằm ngoài thời gian giải.');
        if (time) {
          const fixtures = await manager.findBy(TournamentMatch, {
            tournamentId: current.tournamentId,
          });
          if (
            fixtures.some(
              (m) =>
                m.id !== id &&
                m.scheduledAt &&
                ((court &&
                  m.court === court &&
                  m.scheduledAt.getTime() < time.getTime() + slot &&
                  time.getTime() <
                    m.scheduledAt.getTime() +
                      Number(m.metadata?.slot_minutes ?? 30) * 60000) ||
                  ([m.teamAId, m.teamBId].some(
                    (team) =>
                      team && [match.teamAId, match.teamBId].includes(team),
                  ) &&
                    m.scheduledAt.getTime() <
                      time.getTime() +
                        slot +
                        Number(match.metadata?.rest_minutes ?? 0) * 60000 &&
                    time.getTime() <
                      m.scheduledAt.getTime() +
                        (Number(m.metadata?.slot_minutes ?? 30) +
                          Number(m.metadata?.rest_minutes ?? 0)) *
                          60000)),
            )
          )
            businessValidation(
              'scheduled_at',
              'Trùng sân, suất thi đấu hoặc chưa đủ thời gian nghỉ.',
            );
        }
        await manager.update(TournamentMatch, id, {
          ...(dto.round !== undefined ? { round: dto.round } : {}),
          court,
          scheduledAt: time,
        });
      },
    );
    return this.show(id);
  }
  async result(id: string, dto: MatchResultDto) {
    await this.competition.score(id, {
      games: [{ a: dto.score_a, b: dto.score_b }],
      kind: 'normal',
    });
    return this.show(id);
  }
  async generateRoundRobin(groupId: string, dto: GenerateRoundRobinDto) {
    const current = await this.db
      .getRepository(TournamentGroup)
      .findOneByOrFail({ id: groupId });
    await this.competition.mutate(
      current.tournamentId,
      async (manager, tournament: Tournament) => {
        const matches = await manager.findBy(TournamentMatch, {
          tournamentId: current.tournamentId,
        });
        if (
          matches.some((m) => m.winnerTeamId) ||
          matches.some((m) => m.groupId === groupId)
        )
          businessValidation(
            'matches',
            'Lịch đã tồn tại hoặc giải đã có kết quả. Dùng trang quản lý giải để xếp lại lịch toàn giải.',
          );
        const group = await manager.findOneOrFail(TournamentGroup, {
          where: { id: groupId },
          relations: { teams: true },
        });
        if (group.teams.length < 2)
          businessValidation('group', 'Bảng cần ít nhất hai suất thi đấu.');
        if (dto.court_count > tournament.courts)
          businessValidation('court_count', 'Số sân vượt cấu hình giải.');
        let offset = 0;
        for (const [round, pairs] of helpers
          .makeRoundRobinMatches(group.teams.map((t) => t.teamId))
          .entries())
          for (const [a, b] of pairs) {
            if (!a || !b) continue;
            const court = `Sân ${(offset % dto.court_count) + 1}`;
            let time = dto.starts_at
              ? new Date(
                  new Date(dto.starts_at).getTime() +
                    Math.floor(offset / dto.court_count) *
                      dto.round_interval_minutes *
                      60000,
                )
              : null;
            if (time)
              while (
                matches.some(
                  (m) =>
                    m.scheduledAt &&
                    m.court === court &&
                    Math.abs(m.scheduledAt.getTime() - time!.getTime()) <
                      dto.round_interval_minutes * 60000,
                )
              )
                time = new Date(
                  time.getTime() + dto.round_interval_minutes * 60000,
                );
            const match = await manager.save(
              TournamentMatch,
              manager.create(TournamentMatch, {
                tournamentId: current.tournamentId,
                groupId,
                stage: 'group',
                round: `Lượt ${round + 1}`,
                court,
                teamAId: a,
                teamBId: b,
                scheduledAt: time,
                metadata: { slot_minutes: dto.round_interval_minutes },
              }),
            );
            matches.push(match);
            offset++;
          }
        await manager.update(Tournament, tournament.id, { status: 'group' });
      },
    );
    return (
      await this.db.getRepository(TournamentMatch).find({
        where: { groupId },
        relations: matchRelations,
        order: { createdAt: 'ASC' },
      })
    ).map(matchResponse);
  }
}
