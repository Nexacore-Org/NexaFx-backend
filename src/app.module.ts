import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const config = {
          type: configService.get<'postgres'>('database.type'),
          url: configService.get<string>('database.url'),
          host: configService.get<string>('database.host'),
          port: configService.get<number>('database.port'),
          username: configService.get<string>('database.username'),
          password: configService.get<string>('database.password'),
          database: configService.get<string>('database.database'),
          synchronize: true, // Change to true temporarily
          ssl: configService.get('database.ssl'),
          autoLoadEntities: true,
          logging: false,
        };

        return config;
      },
      inject: [ConfigService],
    }),
  ],
})
export class AppModule { }