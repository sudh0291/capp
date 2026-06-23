import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../users/user.entity';
import { Question } from './question.entity';

@Entity('user_question_history')
export class UserQuestionHistory {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column() userId: string;
  @Column() questionId: string;

  @Column() language: string;
  @Column() difficulty: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Question)
  @JoinColumn({ name: 'questionId' })
  question: Question;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  seenAt: Date;
}
