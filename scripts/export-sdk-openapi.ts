import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.init();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('NexaFX API')
      .setDescription('NexaFX Backend API')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build(),
  );

  const sdkDir = join(process.cwd(), 'sdk', 'nexafx-js');
  await mkdir(sdkDir, { recursive: true });
  await writeFile(
    join(sdkDir, 'openapi.json'),
    `${JSON.stringify(document, null, 2)}\n`,
    'utf8',
  );

  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
