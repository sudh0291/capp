import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('api/users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post('bulk-import')
  async bulkImport(@Body() body: { students: any[]; defaultPassword: string }) {
    return this.usersService.bulkImport(body.students, body.defaultPassword);
  }
}
