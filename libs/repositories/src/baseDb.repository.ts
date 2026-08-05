import {
  Repository,
  FindOneOptions,
  FindManyOptions,
  DeepPartial,
  ObjectLiteral,
} from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

export class BaseRepository<T extends ObjectLiteral> {
  constructor(protected readonly repo: Repository<T>) {}

  create(data: DeepPartial<T>): T {
    return this.repo.create(data);
  }

  async save(entity: T): Promise<T> {
    return this.repo.save(entity);
  }

  async findOne(options: FindOneOptions<T>): Promise<T | null> {
    return this.repo.findOne(options);
  }

  async find(options?: FindManyOptions<T>): Promise<T[]> {
    return this.repo.find(options);
  }

  async findAndCount(options?: FindManyOptions<T>): Promise<[T[], number]> {
    return this.repo.findAndCount(options);
  }

  async findById(id: string | number): Promise<T | null> {
    return this.repo.findOne({
      where: { id } as any,
    });
  }

  async update(id: string | number, data: QueryDeepPartialEntity<T>) {
    await this.repo.update(id as any, data);
    return this.findById(id);
  }

  async delete(id: string | number) {
    return this.repo.delete(id);
  }
}
