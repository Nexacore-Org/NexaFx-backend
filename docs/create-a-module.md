# Creating a New Module: Widgets Module Guide

This guide walks you through creating a new NestJS module from scratch using the "Widgets" module as an example.

---

## Step 1: Generate the Module with Nest CLI

First, use the Nest CLI to generate the basic module structure:

```bash
# Install Nest CLI if you haven't already
npm install -g @nestjs/cli

# Generate the widgets module
nest g module widgets

# Generate the widget entity
nest g class widgets/entities/widget.entity --no-spec

# Generate the widget service
nest g service widgets --no-spec

# Generate the widget controller
nest g controller widgets --no-spec

# Generate DTOs
nest g class widgets/dto/create-widget.dto --no-spec
nest g class widgets/dto/update-widget.dto --no-spec
```

---

## Step 2: Create the Widget Entity

Create `src/widgets/entities/widget.entity.ts`:

```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class Widget {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  price: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

---

## Step 3: Create DTOs (Data Transfer Objects)

### Create Widget DTO (`src/widgets/dto/create-widget.dto.ts`):

```typescript
import { IsString, IsOptional, IsNumber, Min, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWidgetDto {
  @ApiProperty({ description: 'Name of the widget' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Description of the widget', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Price of the widget' })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ description: 'Whether the widget is active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
```

### Update Widget DTO (`src/widgets/dto/update-widget.dto.ts`):

```typescript
import { PartialType } from '@nestjs/swagger';
import { CreateWidgetDto } from './create-widget.dto';

export class UpdateWidgetDto extends PartialType(CreateWidgetDto) {}
```

---

## Step 4: Implement the Widget Service

Create `src/widgets/widgets.service.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Widget } from './entities/widget.entity';
import { CreateWidgetDto } from './dto/create-widget.dto';
import { UpdateWidgetDto } from './dto/update-widget.dto';

@Injectable()
export class WidgetsService {
  constructor(
    @InjectRepository(Widget)
    private widgetsRepository: Repository<Widget>,
  ) {}

  async create(createWidgetDto: CreateWidgetDto): Promise<Widget> {
    const widget = this.widgetsRepository.create(createWidgetDto);
    return this.widgetsRepository.save(widget);
  }

  async findAll(): Promise<Widget[]> {
    return this.widgetsRepository.find();
  }

  async findOne(id: string): Promise<Widget> {
    const widget = await this.widgetsRepository.findOneBy({ id });
    if (!widget) {
      throw new NotFoundException(`Widget with ID ${id} not found`);
    }
    return widget;
  }

  async update(id: string, updateWidgetDto: UpdateWidgetDto): Promise<Widget> {
    await this.widgetsRepository.update(id, updateWidgetDto);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const result = await this.widgetsRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Widget with ID ${id} not found`);
    }
  }
}
```

---

## Step 5: Implement the Widget Controller with Swagger

Create `src/widgets/widgets.controller.ts`:

```typescript
import { Controller, Get, Post, Body, Patch, Param, Delete, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { WidgetsService } from './widgets.service';
import { CreateWidgetDto } from './dto/create-widget.dto';
import { UpdateWidgetDto } from './dto/update-widget.dto';
import { Widget } from './entities/widget.entity';

@ApiTags('widgets')
@Controller('widgets')
export class WidgetsController {
  constructor(private readonly widgetsService: WidgetsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new widget' })
  @ApiResponse({ status: 201, description: 'Widget created successfully', type: Widget })
  create(@Body() createWidgetDto: CreateWidgetDto): Promise<Widget> {
    return this.widgetsService.create(createWidgetDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all widgets' })
  @ApiResponse({ status: 200, description: 'List of widgets', type: [Widget] })
  findAll(): Promise<Widget[]> {
    return this.widgetsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a widget by ID' })
  @ApiParam({ name: 'id', description: 'Widget ID' })
  @ApiResponse({ status: 200, description: 'Widget found', type: Widget })
  @ApiResponse({ status: 404, description: 'Widget not found' })
  findOne(@Param('id') id: string): Promise<Widget> {
    return this.widgetsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a widget' })
  @ApiParam({ name: 'id', description: 'Widget ID' })
  @ApiResponse({ status: 200, description: 'Widget updated', type: Widget })
  @ApiResponse({ status: 404, description: 'Widget not found' })
  update(
    @Param('id') id: string,
    @Body() updateWidgetDto: UpdateWidgetDto,
  ): Promise<Widget> {
    return this.widgetsService.update(id, updateWidgetDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a widget' })
  @ApiParam({ name: 'id', description: 'Widget ID' })
  @ApiResponse({ status: 204, description: 'Widget deleted' })
  @ApiResponse({ status: 404, description: 'Widget not found' })
  remove(@Param('id') id: string): Promise<void> {
    return this.widgetsService.remove(id);
  }
}
```

---

## Step 6: Update the Widget Module and Register in AppModule

### Update `src/widgets/widgets.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WidgetsService } from './widgets.service';
import { WidgetsController } from './widgets.controller';
import { Widget } from './entities/widget.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Widget])],
  controllers: [WidgetsController],
  providers: [WidgetsService],
})
export class WidgetsModule {}
```

### Register in `src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { WidgetsModule } from './widgets/widgets.module'; // <-- Add this

@Module({
  imports: [
    // ... other modules
    WidgetsModule, // <-- Add this
  ],
})
export class AppModule {}
```

---

## Step 7: Create a Migration for the Widget Entity

```bash
npm run typeorm:migration:generate -- src/migrations/create-widgets-table
```

Then run the migration:

```bash
npm run typeorm:migration:run
```

---

## Step 8: Write Tests

### Unit Test for Service (`src/widgets/widgets.service.spec.ts`):

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WidgetsService } from './widgets.service';
import { Widget } from './entities/widget.entity';

const mockWidgetRepository = {
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOneBy: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

describe('WidgetsService', () => {
  let service: WidgetsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WidgetsService,
        {
          provide: getRepositoryToken(Widget),
          useValue: mockWidgetRepository,
        },
      ],
    }).compile();

    service = module.get<WidgetsService>(WidgetsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // Add more test cases here
});
```

### E2E Tests (create in `test/widgets.e2e-spec.ts`):

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Widgets (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/widgets (POST)', () => {
    return request(app.getHttpServer())
      .post('/widgets')
      .send({ name: 'Test Widget', price: 19.99 })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });
});
```

---

## Step 9: Update .github/labeler.yml

Add a rule to automatically apply the "widgets" label to PRs affecting the widgets module:

```yaml
# Add this to .github/labeler.yml
widgets:
  - src/widgets/**/*
  - docs/**/*widget*
```

---

## Step 10: Verify Everything Works

1. Start the application: `npm run start:dev`
2. Visit Swagger docs: `http://localhost:3000/api/docs`
3. Test the widget endpoints
4. Run tests: `npm run test`

---

That's it! You've successfully created a new module following our project's standards!
