import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const path = request.path;

    // Skip auth for these endpoints
    if (
      path.includes('/api/questions/auto-fix') ||
      path.includes('/api/questions/generate-code') ||
      path.includes('/api/questions/test') ||
      path.includes('/api/submissions/run')
    ) {
      return true;
    }

    // Handle demo tokens
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      if (token.startsWith('demo-jwt-')) {
        const role = token.split('demo-jwt-')[1];
        // Mock user for demo
        request.user = {
          sub: role === 'student' ? 'demo-student-id' : 'demo-faculty-id',
          userId: role === 'student' ? 'demo-student-id' : 'demo-faculty-id',
          regNumber: role === 'student' ? '21CS001' : 'FAC001',
          name: role === 'student' ? 'Arun Kumar' : 'Dr. Priya Sharma',
          role: role,
        };
        return true;
      }
    }

    return super.canActivate(context);
  }
}
