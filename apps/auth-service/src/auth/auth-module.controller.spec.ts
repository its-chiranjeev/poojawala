import { Test, TestingModule } from '@nestjs/testing';
import { AuthModuleController } from './auth-module.controller';
import { AuthModuleService } from './auth-module.service';
import { S3Service } from '@poojawala/s3';
import { USER_ROLE, USER_STATUS } from '@poojawala/entities';
import { BadRequestException } from '@nestjs/common';

describe('AuthModuleController - Google OAuth & Intent Flow', () => {
  let controller: AuthModuleController;
  let authService: Partial<Record<keyof AuthModuleService, jest.Mock>>;

  beforeEach(async () => {
    authService = {
      handleGoogleAuth: jest.fn(),
      verifyGoogleToken: jest.fn(),
      exchangeGoogleCode: jest.fn(),
      switchIntentService: jest.fn(),
      getGoogleOAuthRedirect: jest.fn(),
      processGoogleOAuthCallback: jest.fn(),
      getFrontendUrl: jest.fn(() => 'http://localhost:5173'),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthModuleController],
      providers: [
        { provide: AuthModuleService, useValue: authService },
        { provide: S3Service, useValue: {} },
      ],
    }).compile();

    controller = module.get<AuthModuleController>(AuthModuleController);
  });

  describe('GET /api/auth/google', () => {
    it('should set state cookie and redirect to Google OAuth URL returned by service', async () => {
      authService.getGoogleOAuthRedirect!.mockReturnValue({
        url: 'https://accounts.google.com/o/oauth2/v2/auth?mock=1',
        state: 'encoded_state_123',
      });

      const res: any = {
        cookie: jest.fn(),
        redirect: jest.fn(),
      };

      await controller.googleAuth('PUROHIT', res);

      expect(authService.getGoogleOAuthRedirect).toHaveBeenCalledWith('PUROHIT');
      expect(res.cookie).toHaveBeenCalledWith(
        'google_oauth_state',
        'encoded_state_123',
        expect.objectContaining({ httpOnly: true, path: '/' }),
      );
      expect(res.redirect).toHaveBeenCalledWith(
        'https://accounts.google.com/o/oauth2/v2/auth?mock=1',
      );
    });
  });

  describe('GET /api/auth/google/callback', () => {
    it('should redirect to frontend login if state does not match cookie', async () => {
      const req: any = { headers: { cookie: 'google_oauth_state=state_abc' } };
      const res: any = { redirect: jest.fn(), clearCookie: jest.fn() };

      await controller.googleAuthCallback(req, res, 'some_code', 'state_different');

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('error=Invalid%20or%20expired%20OAuth%20state'),
      );
    });

    it('should process callback via service, issue cookies, and redirect on success', async () => {
      const state = 'valid_state_123';
      const req: any = { headers: { cookie: `google_oauth_state=${state}` } };
      const res: any = {
        redirect: jest.fn(),
        clearCookie: jest.fn(),
        cookie: jest.fn(),
      };

      authService.processGoogleOAuthCallback!.mockResolvedValue({
        result: {
          tokens: { accessToken: 'mock-access', refreshToken: 'mock-refresh' },
          user: { id: 1, role: USER_ROLE.CUSTOMER, status: USER_STATUS.ACTIVE },
        },
        redirectUrl: 'http://localhost:5173/auth/callback?role=CUSTOMER&status=ACTIVE&csrfToken=mock-csrf',
        csrfToken: 'mock-csrf',
      });

      await controller.googleAuthCallback(req, res, 'valid_code', state);

      expect(res.clearCookie).toHaveBeenCalledWith('google_oauth_state', { path: '/' });
      expect(authService.processGoogleOAuthCallback).toHaveBeenCalledWith('valid_code', state);
      expect(res.cookie).toHaveBeenCalledWith('accessToken', 'mock-access', expect.any(Object));
      expect(res.cookie).toHaveBeenCalledWith('refreshToken', 'mock-refresh', expect.any(Object));
      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:5173/auth/callback?role=CUSTOMER&status=ACTIVE&csrfToken=mock-csrf',
      );
    });
  });

  describe('POST /api/auth/google', () => {
    it('should throw BadRequestException if neither credential nor code is provided', async () => {
      const res: any = { cookie: jest.fn() };

      await expect(
        controller.googleAuthDirect({ intent: USER_ROLE.CUSTOMER } as any, res),
      ).rejects.toThrow(BadRequestException);
    });

    it('should verify ID token credential and return session with cookies', async () => {
      const res: any = { cookie: jest.fn() };

      authService.verifyGoogleToken!.mockResolvedValue({
        sub: 'google_cred_1',
        email: 'cred@test.com',
        emailVerified: true,
      });

      authService.handleGoogleAuth!.mockResolvedValue({
        message: 'Customer registration successful',
        isNewUser: true,
        tokens: { accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token' },
        user: { id: 2, role: USER_ROLE.CUSTOMER, status: USER_STATUS.ACTIVE },
      });

      const result = await controller.googleAuthDirect(
        { credential: 'valid_id_token', intent: USER_ROLE.CUSTOMER },
        res,
      );

      expect(result.success).toBe(true);
      expect(result.isNewUser).toBe(true);
      expect(res.cookie).toHaveBeenCalledWith('accessToken', 'mock-access-token', expect.any(Object));
    });

    it('should exchange code via service and return session with cookies', async () => {
      const res: any = { cookie: jest.fn() };

      authService.exchangeGoogleCode!.mockResolvedValue({
        sub: 'google_code_1',
        email: 'code@test.com',
        emailVerified: true,
      });

      authService.handleGoogleAuth!.mockResolvedValue({
        message: 'Customer registration successful',
        isNewUser: true,
        tokens: { accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token' },
        user: { id: 3, role: USER_ROLE.CUSTOMER, status: USER_STATUS.ACTIVE },
      });

      const result = await controller.googleAuthDirect(
        { code: 'valid_auth_code', intent: USER_ROLE.CUSTOMER },
        res,
      );

      expect(result.success).toBe(true);
      expect(authService.exchangeGoogleCode).toHaveBeenCalledWith('valid_auth_code');
      expect(res.cookie).toHaveBeenCalledWith('accessToken', 'mock-access-token', expect.any(Object));
    });
  });

  describe('POST /api/auth/intent', () => {
    it('should switch role to PUROHIT and update auth cookies', async () => {
      const req: any = { user: { id: 10, role: USER_ROLE.CUSTOMER } };
      const res: any = { cookie: jest.fn() };

      authService.switchIntentService!.mockResolvedValue({
        message: 'Purohit onboarding initiated. Profile pending admin verification.',
        tokens: { accessToken: 'new-purohit-access', refreshToken: 'new-purohit-refresh' },
        user: { id: 10, role: USER_ROLE.PUROHIT, status: USER_STATUS.PENDING },
      });

      const result = await controller.switchIntent(
        req,
        { intent: USER_ROLE.PUROHIT },
        res,
      );

      expect(result.success).toBe(true);
      expect(result.user.role).toBe(USER_ROLE.PUROHIT);
      expect(res.cookie).toHaveBeenCalledWith('accessToken', 'new-purohit-access', expect.any(Object));
    });
  });
});
