import { Injectable } from '@nestjs/common';

@Injectable()
export class EntitiesService {
  testEntities() {
    return 'Entities service is working!';
  }
}
