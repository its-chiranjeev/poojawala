import { Test, TestingModule } from '@nestjs/testing';
import { AuthModuleController } from './auth-module.controller';
import { AuthModuleService } from './auth-module.service';
import { S3Service } from '@poojawala/s3';
import { USER_ROLE, USER_STATUS, LOGIN_PAGE } from '@poojawala/entities';
import { ROLE_COOKIE_MAP } from '@poojawala/common';
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
      expect(res.cookie).toHaveBeenCalledWith('poojawala-customer-access-token', 'mock-access', expect.any(Object));
      expect(res.cookie).toHaveBeenCalledWith('poojawala-customer-refresh-token', 'mock-refresh', expect.any(Object));
      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:5173/auth/callback?role=CUSTOMER&status=ACTIVE&csrfToken=mock-csrf',
      );
    });
  });

  describe('POST /api/auth/google', () => {
    it('should throw BadRequestException if neither credential nor code is provided', async () => {
      const res: any = { cookie: jest.fn() };

      await expect(
        controller.googleAuthDirect({ role: USER_ROLE.CUSTOMER } as any, res),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if role is ADMIN', async () => {
      const res: any = { cookie: jest.fn() };

      await expect(
        controller.googleAuthDirect(
          { credential: 'valid_id_token', role: USER_ROLE.ADMIN },
          res,
        ),
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
        { credential: 'valid_id_token', role: USER_ROLE.CUSTOMER },
        res,
      );

      expect(result.success).toBe(true);
      expect(result.isNewUser).toBe(true);
      expect(res.cookie).toHaveBeenCalledWith('poojawala-customer-access-token', 'mock-access-token', expect.any(Object));
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
        { code: 'valid_auth_code', role: USER_ROLE.CUSTOMER },
        res,
      );

      expect(result.success).toBe(true);
      expect(authService.exchangeGoogleCode).toHaveBeenCalledWith('valid_auth_code');
      expect(res.cookie).toHaveBeenCalledWith('poojawala-customer-access-token', 'mock-access-token', expect.any(Object));
    });
  });

  describe('Role-Based Authentication & CSRF Cookies', () => {
    it('Admin login sets poojawala-admin-* cookies and returns poojawalaAdminCsrfToken', async () => {
      authService.loginService = jest.fn().mockResolvedValue({
        message: 'Login successful',
        tokens: { accessToken: 'admin-access', refreshToken: 'admin-refresh' },
        user: { id: 1, role: USER_ROLE.ADMIN, status: USER_STATUS.ACTIVE },
      });

      const cookiesSet: Record<string, string> = {};
      const res: any = {
        cookie: jest.fn((name: string, val: string) => {
          cookiesSet[name] = val;
        }),
      };

      const result = await controller.login(
        { email: 'admin@poojawala.com', password: 'password' } as any,
        res,
      );

      expect(result.success).toBe(true);
      expect(result.csrfToken).toBeUndefined();
      expect(result.poojawalaAdminCsrfToken).toBeDefined();

      expect(res.cookie).toHaveBeenCalledWith(
        ROLE_COOKIE_MAP[USER_ROLE.ADMIN].access,
        'admin-access',
        expect.any(Object),
      );
      expect(res.cookie).toHaveBeenCalledWith(
        ROLE_COOKIE_MAP[USER_ROLE.ADMIN].refresh,
        'admin-refresh',
        expect.any(Object),
      );
      expect(res.cookie).toHaveBeenCalledWith(
        ROLE_COOKIE_MAP[USER_ROLE.ADMIN].csrf,
        result.poojawalaAdminCsrfToken,
        expect.any(Object),
      );
      expect(res.cookie).not.toHaveBeenCalledWith(
        ROLE_COOKIE_MAP[USER_ROLE.ADMIN].csrfCamel,
        expect.anything(),
        expect.anything(),
      );
    });

    it('Customer login sets poojawala-customer-* cookies and returns poojawalaCustomerCsrfToken', async () => {
      authService.loginService = jest.fn().mockResolvedValue({
        message: 'Login successful',
        tokens: { accessToken: 'cust-access', refreshToken: 'cust-refresh' },
        user: { id: 2, role: USER_ROLE.CUSTOMER, status: USER_STATUS.ACTIVE },
      });

      const res: any = { cookie: jest.fn() };
      const result = await controller.login(
        { email: 'cust@poojawala.com', password: 'password' } as any,
        res,
      );

      expect(result.csrfToken).toBeUndefined();
      expect(result.poojawalaCustomerCsrfToken).toBeDefined();
      expect(res.cookie).toHaveBeenCalledWith(
        ROLE_COOKIE_MAP[USER_ROLE.CUSTOMER].access,
        'cust-access',
        expect.any(Object),
      );
    });

    it('Purohit login sets poojawala-purohit-* cookies and returns poojawalaPurohitCsrfToken', async () => {
      authService.loginService = jest.fn().mockResolvedValue({
        message: 'Login successful',
        tokens: { accessToken: 'purohit-access', refreshToken: 'purohit-refresh' },
        user: { id: 3, role: USER_ROLE.PUROHIT, status: USER_STATUS.ACTIVE },
      });

      const res: any = { cookie: jest.fn() };
      const result = await controller.login(
        { email: 'purohit@poojawala.com', password: 'password' } as any,
        res,
      );

      expect(result.csrfToken).toBeUndefined();
      expect(result.poojawalaPurohitCsrfToken).toBeDefined();
      expect(res.cookie).toHaveBeenCalledWith(
        ROLE_COOKIE_MAP[USER_ROLE.PUROHIT].access,
        'purohit-access',
        expect.any(Object),
      );
    });

    it('Logout clears only the requesting role cookies', async () => {
      authService.logoutService = jest.fn().mockResolvedValue(undefined);
      const res: any = { clearCookie: jest.fn() };

      await controller.logout({ user: { id: 1, role: USER_ROLE.ADMIN } }, res);

      expect(authService.logoutService).toHaveBeenCalledWith(1);
      expect(res.clearCookie).toHaveBeenCalledWith(
        ROLE_COOKIE_MAP[USER_ROLE.ADMIN].access,
        expect.any(Object),
      );
      expect(res.clearCookie).toHaveBeenCalledWith(
        ROLE_COOKIE_MAP[USER_ROLE.ADMIN].refresh,
        expect.any(Object),
      );
    });

    it('Refresh token refreshes all present roles and returns all CSRF tokens when multiple role cookies exist', async () => {
      const adminJwt = 'header.admin-payload.sig';
      const purohitJwt = 'header.purohit-payload.sig';

      authService.refreshToken = jest.fn().mockImplementation((token: string, role?: USER_ROLE) => {
        if (role === USER_ROLE.ADMIN) {
          return Promise.resolve({
            message: 'Tokens refreshed successfully',
            tokens: { accessToken: 'new-admin-access', refreshToken: 'new-admin-refresh' },
            user: { id: 1, role: USER_ROLE.ADMIN, status: USER_STATUS.ACTIVE },
          });
        }
        return Promise.resolve({
          message: 'Tokens refreshed successfully',
          tokens: { accessToken: 'new-purohit-access', refreshToken: 'new-purohit-refresh' },
          user: { id: 20, role: USER_ROLE.PUROHIT, status: USER_STATUS.ACTIVE },
        });
      });

      const req: any = {
        headers: {
          cookie: `poojawala-admin-refresh-token=${adminJwt}; poojawala-purohit-refresh-token=${purohitJwt}`,
        },
      };
      const res: any = { cookie: jest.fn() };

      const result = await controller.refresh(req, res);

      expect(authService.refreshToken).toHaveBeenCalledWith(adminJwt, USER_ROLE.ADMIN);
      expect(authService.refreshToken).toHaveBeenCalledWith(purohitJwt, USER_ROLE.PUROHIT);
      expect(result.success).toBe(true);
      expect(result.poojawalaAdminCsrfToken).toBeDefined();
      expect(result.poojawalaPurohitCsrfToken).toBeDefined();
      expect((result as any).csrfToken).toBeUndefined();
      expect(res.cookie).toHaveBeenCalledWith(
        ROLE_COOKIE_MAP[USER_ROLE.ADMIN].access,
        'new-admin-access',
        expect.any(Object),
      );
      expect(res.cookie).toHaveBeenCalledWith(
        ROLE_COOKIE_MAP[USER_ROLE.PUROHIT].access,
        'new-purohit-access',
        expect.any(Object),
      );
    });

    it('Refresh token refreshes only targeted role when role is explicitly specified in body', async () => {
      const customerJwt = 'header.customer-payload.sig';
      const purohitJwt = 'header.purohit-payload.sig';

      authService.refreshToken = jest.fn().mockResolvedValue({
        message: 'Tokens refreshed successfully',
        tokens: { accessToken: 'new-cust-access', refreshToken: 'new-cust-refresh' },
        user: { id: 10, role: USER_ROLE.CUSTOMER, status: USER_STATUS.ACTIVE },
      });

      const req: any = {
        headers: {
          cookie: `poojawala-customer-refresh-token=${customerJwt}; poojawala-purohit-refresh-token=${purohitJwt}`,
        },
        body: { role: USER_ROLE.CUSTOMER },
      };
      const res: any = { cookie: jest.fn() };

      const result = await controller.refresh(req, res, { role: USER_ROLE.CUSTOMER });

      expect(authService.refreshToken).toHaveBeenCalledWith(customerJwt, USER_ROLE.CUSTOMER);
      expect(authService.refreshToken).not.toHaveBeenCalledWith(purohitJwt, USER_ROLE.PUROHIT);
      expect(result.success).toBe(true);
      expect(result.poojawalaCustomerCsrfToken).toBeDefined();
      expect((result as any).csrfToken).toBeUndefined();
      expect(res.cookie).toHaveBeenCalledWith(
        ROLE_COOKIE_MAP[USER_ROLE.CUSTOMER].access,
        'new-cust-access',
        expect.any(Object),
      );
    });

    it('Logout selects target role via x-csrf-token when multiple role cookies exist', async () => {
      authService.logoutService = jest.fn().mockResolvedValue(undefined);
      const res: any = { clearCookie: jest.fn() };
      const customerCsrf = 'customer-csrf-val';

      const req: any = {
        headers: {
          cookie: `poojawala-customer-csrf-token=${customerCsrf}; poojawala-admin-csrf-token=admin-csrf-val`,
          'x-csrf-token': customerCsrf,
        },
        user: { id: 10, role: USER_ROLE.CUSTOMER },
      };

      await controller.logout(req, res);

      expect(authService.logoutService).toHaveBeenCalledWith(10);
      expect(res.clearCookie).toHaveBeenCalledWith(
        ROLE_COOKIE_MAP[USER_ROLE.CUSTOMER].access,
        expect.any(Object),
      );
      expect(res.clearCookie).not.toHaveBeenCalledWith(
        ROLE_COOKIE_MAP[USER_ROLE.ADMIN].access,
        expect.any(Object),
      );
    });

    it('Logout with role "ALL" clears cookies for all roles', async () => {
      authService.logoutService = jest.fn().mockResolvedValue(undefined);
      const res: any = { clearCookie: jest.fn() };

      const req: any = {
        headers: {},
        user: { id: 1, role: USER_ROLE.ADMIN },
      };

      await controller.logout(req, res, { role: 'ALL' });

      expect(res.clearCookie).toHaveBeenCalledWith(
        ROLE_COOKIE_MAP[USER_ROLE.ADMIN].access,
        expect.any(Object),
      );
      expect(res.clearCookie).toHaveBeenCalledWith(
        ROLE_COOKIE_MAP[USER_ROLE.CUSTOMER].access,
        expect.any(Object),
      );
      expect(res.clearCookie).toHaveBeenCalledWith(
        ROLE_COOKIE_MAP[USER_ROLE.PUROHIT].access,
        expect.any(Object),
      );
    });
    it('login forwards loginPage query param to loginService', async () => {
      authService.loginService = jest.fn().mockResolvedValue({
        message: 'Login successful',
        tokens: { accessToken: 'admin-access', refreshToken: 'admin-refresh' },
        user: { id: 1, role: USER_ROLE.ADMIN, status: USER_STATUS.ACTIVE },
      });
      const res: any = { cookie: jest.fn() };
      await controller.login(
        { email: 'admin@poojawala.com', password: 'password' } as any,
        res,
        { loginPage: LOGIN_PAGE.ADMIN_PAGE },
      );
      expect(authService.loginService).toHaveBeenCalledWith(
        { email: 'admin@poojawala.com', password: 'password' },
        LOGIN_PAGE.ADMIN_PAGE,
      );
    });

    it('forgotPassword forwards loginPage query param to forgotPasswordService', async () => {
      authService.forgotPasswordService = jest.fn().mockResolvedValue({
        message: 'OTP sent successfully',
      });
      await controller.forgotPassword(
        { email: 'user@test.com' },
        { loginPage: LOGIN_PAGE.HOME_PAGE },
      );
      expect(authService.forgotPasswordService).toHaveBeenCalledWith(
        { email: 'user@test.com' },
        LOGIN_PAGE.HOME_PAGE,
      );
    });
  });
});
