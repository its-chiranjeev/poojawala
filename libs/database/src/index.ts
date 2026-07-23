// import { NestFactory } from '@nestjs/core';
// import { DatabaseModule } from './database.module';
// import { DatabaseService } from './database.service';

// async function bootstrap() {
//     const app = await NestFactory.createApplicationContext(DatabaseModule);
//     await app.close();
// }

// bootstrap();

export * from './database.module';
export * from './database.service';
