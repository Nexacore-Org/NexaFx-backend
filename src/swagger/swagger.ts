import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('NexaFx API')
    .setDescription('API documentation for NexaFx platform')
    .setVersion('1.0')
    .addServer('https://nexafx-backend.onrender.com', 'Production Server')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    // Optionally, you can add extraModels or include modules here
  });
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
    },
    customSiteTitle: 'NexaFx API Docs',
  });
}
