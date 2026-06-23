import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Question } from './question.entity';
import { UserQuestionHistory } from './user-question-history.entity';
import { QuestionsService } from './questions.service';
import { QuestionsController } from './questions.controller';
import { AiService } from '../common/ai.service';
import { ExecutionModule } from '../execution/execution.module';

@Module({
  imports: [TypeOrmModule.forFeature([Question, UserQuestionHistory]), ExecutionModule],
  providers: [QuestionsService, AiService],
  controllers: [QuestionsController],
  exports: [QuestionsService],
})
export class QuestionsModule {}
