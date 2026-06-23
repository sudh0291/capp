import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { DataSource } from 'typeorm';
import { User } from '../src/users/user.entity';
import * as bcrypt from 'bcrypt';

describe('API E2E Tests (Deep Dive)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let testUserToken: string;
  let testUserId: string;

  // Test user data
  const TEST_USER = {
    regNumber: 'TEST12345',
    name: 'Test User',
    department: 'CSE',
    year: 2026,
    password: 'Test@1234',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Get data source
    dataSource = moduleFixture.get<DataSource>(DataSource);

    // Cleanup and seed test user
    await dataSource.getRepository(User).delete({ regNumber: TEST_USER.regNumber });
    const hashedPassword = await bcrypt.hash(TEST_USER.password, 10);
    const user = dataSource.getRepository(User).create({
      ...TEST_USER,
      password: hashedPassword,
    });
    const savedUser = await dataSource.getRepository(User).save(user);
    testUserId = savedUser.id;
  });

  describe('Auth API Tests', () => {
    it('POST /api/auth/login - should login test user and return JWT token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ regNumber: TEST_USER.regNumber, password: TEST_USER.password })
        .expect(201);
      
      expect(response.body).toHaveProperty('access_token');
      testUserToken = response.body.access_token;
      console.log('✅ Auth login test passed');
    });
  });

  describe('Questions API Tests', () => {
    it('GET /api/questions/test - should return test endpoint response', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/questions/test')
        .expect(200);
      
      expect(response.body.message).toBe('Test endpoint works! No auth required!');
      console.log('✅ Questions test endpoint passed');
    });

    it('POST /api/questions/chat - should return AI chat response', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/questions/chat')
        .send({
          message: 'Write a hello world in Python',
          history: [],
          assessmentLanguage: 'python'
        })
        .expect(201);
      
      expect(response.body).toHaveProperty('reply');
      console.log('✅ Questions chat test passed');
    });

    it('POST /api/questions/generate-code - should generate code', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/questions/generate-code')
        .send({
          prompt: 'Write a Python function to add two numbers',
          language: 'python'
        })
        .expect(201);
      
      expect(response.body).toHaveProperty('code');
      console.log('✅ Questions generate-code test passed');
    });
  });

  describe('Submissions API Tests', () => {
    it('GET /api/submissions - should return empty list initially', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/submissions')
        .set('Authorization', `Bearer ${testUserToken}`)
        .expect(200);
      
      expect(response.body).toBeInstanceOf(Array);
      console.log('✅ Submissions list test passed');
    });
  });

  describe('Progress API Tests', () => {
    it('GET /api/profile - should return user profile', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/profile')
        .set('Authorization', `Bearer ${testUserToken}`)
        .expect(200);
      
      expect(response.body).toHaveProperty('user');
      console.log('✅ Profile test passed');
    });
  });

  describe('Faculty API Tests', () => {
    it('GET /api/faculty/stats - should return stats', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/faculty/stats')
        .set('Authorization', `Bearer ${testUserToken}`)
        .expect(200);
      
      expect(response.body).toHaveProperty('totalSubmissions');
      console.log('✅ Faculty stats test passed');
    });
  });

  afterAll(async () => {
    // Cleanup test user
    if (testUserId) {
      await dataSource.getRepository(User).delete({ id: testUserId });
    }
    await app.close();
  });
});