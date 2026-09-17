import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Relation, ValueTransformer } from 'typeorm';

const numeric: ValueTransformer = {
  to: (value: number | null) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};

abstract class Timestamps {
  @Column({ name: 'created_at', type: 'timestamp', precision: 0 })
  createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', precision: 0 })
  updatedAt!: Date;

  @BeforeInsert()
  initializeTimestamps() {
    this.createdAt ??= new Date();
    this.updatedAt ??= this.createdAt;
  }
}

abstract class UuidEntity extends Timestamps {
  @PrimaryColumn('uuid')
  id!: string;

  // Existing Laravel tables have UUID primary keys without a database default.
  @BeforeInsert()
  initializeId() {
    this.id ??= randomUUID();
  }
}

@Entity('players')
export class Player extends UuidEntity {
  @Column({ type: 'varchar', length: 120 }) name!: string;
  @Column({ type: 'varchar', length: 255 }) gender!: string;
  @Column({ name: 'avatar_url', type: 'varchar', length: 255, nullable: true })
  avatarUrl: string | null = null;
  @Column({
    type: 'numeric',
    precision: 4,
    scale: 2,
    default: 2.5,
    transformer: numeric,
  })
  rating = 2.5;
  @Column({ type: 'varchar', length: 255, default: 'right' }) hand = 'right';
  @Column({ type: 'jsonb', nullable: true }) metadata: Record<
    string,
    unknown
  > | null = null;
  @OneToMany(() => Team, (team) => team.playerOne) teamsAsPlayerOne!: Relation<
    Team[]
  >;
  @OneToMany(() => Team, (team) => team.playerTwo) teamsAsPlayerTwo!: Relation<
    Team[]
  >;
  @OneToMany(() => RatingAssessment, (rating) => rating.player)
  ratingAssessments!: Relation<RatingAssessment[]>;
}

@Entity('tournaments')
export class Tournament extends UuidEntity {
  @Column({ type: 'varchar', length: 180, nullable: true, unique: true }) slug:
    string | null = null;
  @Column({ type: 'varchar', length: 160 }) name!: string;
  @Column({ type: 'varchar', length: 255, default: 'double' }) format =
    'double';
  @Column({ type: 'varchar', length: 255, default: 'draft' }) status = 'draft';
  @Column({ type: 'varchar', length: 120, nullable: true }) category:
    string | null = null;
  @Column({ type: 'varchar', length: 180, nullable: true }) location:
    string | null = null;
  @Column({ type: 'text', nullable: true }) description: string | null = null;
  @Column({ name: 'cover_url', type: 'varchar', length: 255, nullable: true })
  coverUrl: string | null = null;
  @Column({ name: 'max_teams', type: 'integer', default: 16 }) maxTeams = 16;
  @Column({
    name: 'starts_at',
    type: 'timestamp',
    precision: 0,
    nullable: true,
  })
  startsAt: Date | null = null;
  @Column({ name: 'ends_at', type: 'timestamp', precision: 0, nullable: true })
  endsAt: Date | null = null;
  @Column({ type: 'integer', default: 2 }) courts = 2;
  @Column({ type: 'jsonb', nullable: true }) settings: Record<
    string,
    unknown
  > | null = null;
  @OneToMany(() => Team, (team) => team.tournament) teams!: Relation<Team[]>;
  @OneToMany(() => TournamentGroup, (group) => group.tournament)
  groups!: Relation<TournamentGroup[]>;
  @OneToMany(() => TournamentMatch, (match) => match.tournament)
  matches!: Relation<TournamentMatch[]>;
  teamsCount?: number;
  groupsCount?: number;
  matchesCount?: number;
}

@Entity('teams')
export class Team extends UuidEntity {
  @Column({ name: 'tournament_id', type: 'uuid' }) tournamentId!: string;
  @Column({ type: 'varchar', length: 160 }) name!: string;
  @Column({ name: 'player_one_id', type: 'uuid' }) playerOneId!: string;
  @Column({ name: 'player_two_id', type: 'uuid', nullable: true }) playerTwoId:
    string | null = null;
  @Column({
    name: 'total_rating',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
    transformer: numeric,
  })
  totalRating = 0;
  @Column({ type: 'integer', nullable: true }) seed: number | null = null;
  @ManyToOne(() => Tournament, (tournament) => tournament.teams, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'tournament_id' })
  tournament!: Relation<Tournament>;
  @ManyToOne(() => Player, (player) => player.teamsAsPlayerOne, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'player_one_id' })
  playerOne!: Relation<Player>;
  @ManyToOne(() => Player, (player) => player.teamsAsPlayerTwo, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'player_two_id' })
  playerTwo!: Relation<Player> | null;
  @OneToMany(() => GroupTeam, (membership) => membership.team)
  groups!: Relation<GroupTeam[]>;
}

@Entity('tournament_groups')
export class TournamentGroup extends UuidEntity {
  @Column({ name: 'tournament_id', type: 'uuid' }) tournamentId!: string;
  @Column({ type: 'varchar', length: 80 }) name!: string;
  @Column({ name: 'sort_order', type: 'integer', default: 1 }) sortOrder = 1;
  @ManyToOne(() => Tournament, (tournament) => tournament.groups, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'tournament_id' })
  tournament!: Relation<Tournament>;
  @OneToMany(() => GroupTeam, (membership) => membership.group)
  teams!: Relation<GroupTeam[]>;
  @OneToMany(() => TournamentMatch, (match) => match.group) matches!: Relation<
    TournamentMatch[]
  >;
}

@Entity('group_team')
export class GroupTeam extends Timestamps {
  @PrimaryGeneratedColumn({ type: 'bigint' }) id!: string;
  @Column({ name: 'group_id', type: 'uuid' }) groupId!: string;
  @Column({ name: 'team_id', type: 'uuid' }) teamId!: string;
  @Column({ type: 'integer', nullable: true }) position: number | null = null;
  @ManyToOne(() => TournamentGroup, (group) => group.teams, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'group_id' })
  group!: Relation<TournamentGroup>;
  @ManyToOne(() => Team, (team) => team.groups, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'team_id' })
  team!: Relation<Team>;
}

@Entity('tournament_matches')
export class TournamentMatch extends UuidEntity {
  @Column({ name: 'tournament_id', type: 'uuid' }) tournamentId!: string;
  @Column({ name: 'group_id', type: 'uuid', nullable: true }) groupId:
    string | null = null;
  @Column({ type: 'varchar', length: 255, default: 'group' }) stage = 'group';
  @Column({ type: 'varchar', length: 80 }) round!: string;
  @Column({ type: 'varchar', length: 80, nullable: true }) court:
    string | null = null;
  @Column({ name: 'team_a_id', type: 'uuid', nullable: true }) teamAId:
    string | null = null;
  @Column({ name: 'team_b_id', type: 'uuid', nullable: true }) teamBId:
    string | null = null;
  @Column({ name: 'score_a', type: 'integer', nullable: true }) scoreA:
    number | null = null;
  @Column({ name: 'score_b', type: 'integer', nullable: true }) scoreB:
    number | null = null;
  @Column({ name: 'winner_team_id', type: 'uuid', nullable: true })
  winnerTeamId: string | null = null;
  @Column({
    name: 'scheduled_at',
    type: 'timestamp',
    precision: 0,
    nullable: true,
  })
  scheduledAt: Date | null = null;
  @ManyToOne(() => Tournament, (tournament) => tournament.matches, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'tournament_id' })
  tournament!: Relation<Tournament>;
  @ManyToOne(() => TournamentGroup, (group) => group.matches, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'group_id' })
  group!: Relation<TournamentGroup> | null;
  @ManyToOne(() => Team, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'team_a_id' })
  teamA!: Relation<Team> | null;
  @ManyToOne(() => Team, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'team_b_id' })
  teamB!: Relation<Team> | null;
  @ManyToOne(() => Team, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'winner_team_id' })
  winnerTeam!: Relation<Team> | null;
}

@Entity('rating_assessments')
export class RatingAssessment extends UuidEntity {
  @Column({ name: 'player_id', type: 'uuid' }) playerId!: string;
  @Column({
    name: 'base_rating',
    type: 'numeric',
    precision: 4,
    scale: 2,
    transformer: numeric,
  })
  baseRating!: number;
  @Column({ name: 'passed_rules', type: 'jsonb' }) passedRules!: string[];
  @Column({
    type: 'numeric',
    precision: 4,
    scale: 2,
    default: 0,
    transformer: numeric,
  })
  bonus = 0;
  @Column({ type: 'numeric', precision: 4, scale: 2, transformer: numeric })
  rating!: number;
  @Column({ type: 'text', nullable: true }) notes: string | null = null;
  @Column({ name: 'assessed_at', type: 'timestamp', precision: 0 })
  assessedAt!: Date;
  @ManyToOne(() => Player, (player) => player.ratingAssessments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'player_id' })
  player!: Relation<Player>;
}

@Entity('admin_sessions')
export class AdminSession extends UuidEntity {
  @Column({ name: 'token_hash', type: 'varchar', length: 64, unique: true })
  tokenHash!: string;
  @Column({ type: 'varchar', length: 120 }) username!: string;
  @Column({ name: 'expires_at', type: 'timestamp', precision: 0 })
  expiresAt!: Date;
  @Column({
    name: 'last_used_at',
    type: 'timestamp',
    precision: 0,
    nullable: true,
  })
  lastUsedAt: Date | null = null;
}

export const databaseEntities = [
  Player,
  Tournament,
  Team,
  TournamentGroup,
  GroupTeam,
  TournamentMatch,
  RatingAssessment,
  AdminSession,
];
