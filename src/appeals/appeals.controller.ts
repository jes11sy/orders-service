import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AppealsService } from './appeals.service';
import { CreateAppealDto, UpdateAppealDto, QueryAppealsDto } from './dto/appeal.dto';
import { CookieJwtAuthGuard } from '../auth/guards/cookie-jwt-auth.guard';
import { RolesGuard, Roles, UserRole } from '../auth/roles.guard';
import { AuthUser } from '../types/auth-user.type';

interface AuthenticatedRequest {
  user: AuthUser;
}

@ApiTags('appeals')
@ApiBearerAuth()
@UseGuards(CookieJwtAuthGuard, RolesGuard)
@Controller('appeals')
export class AppealsController {
  constructor(private readonly appealsService: AppealsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Получить список обращений' })
  getAppeals(
    @Query() query: QueryAppealsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.appealsService.getAppeals(query, req.user.userId, req.user.role);
  }

  @Get('stats')
  @Roles(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Статистика обращений' })
  getStats(@Request() req: AuthenticatedRequest) {
    return this.appealsService.getStats(req.user.userId, req.user.role);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Получить обращение по ID' })
  getAppealById(@Param('id', ParseIntPipe) id: number) {
    return this.appealsService.getAppealById(id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Создать обращение' })
  createAppeal(
    @Body() dto: CreateAppealDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.appealsService.createAppeal(dto, req.user.userId);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Обновить обращение' })
  updateAppeal(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAppealDto,
  ) {
    return this.appealsService.updateAppeal(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.OPERATOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Удалить обращение' })
  deleteAppeal(@Param('id', ParseIntPipe) id: number) {
    return this.appealsService.deleteAppeal(id);
  }
}
