import { Injectable } from '@nestjs/common';
import { DataSource, Not } from 'typeorm';
import { Tournament, TournamentMatch } from '../database/entities';
import { matchRelations } from '../database/relations';
import { matchResponse } from '../common/serializers';
import { CompetitionService } from '../competition/competition.service';

@Injectable()
export class BracketsService {
  constructor(
    private readonly db: DataSource,
    private readonly competition: CompetitionService,
  ) {}
  async index(tournamentId: string) {
    await this.db
      .getRepository(Tournament)
      .findOneByOrFail({ id: tournamentId });
    const matches = await this.db.getRepository(TournamentMatch).find({
      where: { tournamentId, stage: Not('group') },
      relations: matchRelations,
    });
    matches.sort(
      (a, b) =>
        Number(a.metadata?.round_number ?? 0) -
          Number(b.metadata?.round_number ?? 0) ||
        a.round.localeCompare(b.round),
    );
    return matches.map(matchResponse);
  }
  async generate(tournamentId: string) {
    await this.competition.playoff(tournamentId, {
      qualifiers_per_group: 2,
      consolation_final: false,
      replace: false,
    });
    return this.index(tournamentId);
  }
}
