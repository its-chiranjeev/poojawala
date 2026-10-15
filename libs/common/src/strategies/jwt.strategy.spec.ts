import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { USER_ROLE } from '@poojawala/entities';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy — Multi-Role Cookie & CSRF Validation', () => {
  let strategy: JwtStrategy;
  let mockConfigService: Partial<ConfigService>;
  let mockUserRepository: any;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'JWT_ACCESS_SECRET' || key === 'JWT_SECRET') {
          return 'test-secret';
        }
        return null;
      }),
    };

    mockUserRepository = {
      findOne: jest.fn(),
    };

    strategy = new JwtStrategy(
      mockConfigService as ConfigService,
      mockUserRepository,
    );
  });

  const getExtractor = () => {
    return (strategy as any)._jwtFromRequest;
  };

  it('extracts token from Authorization Bearer header when present', () => {
    const extractor = getExtractor();
    const req: any = {
      headers: {
        authorization: 'Bearer mock-bearer-token',
      },
    };

    const token = extractor(req);
    expect(token).toBe('mock-bearer-token');
    expect(req._extractedRoleFromCookie).toBeNull();
  });

  it('selects single role cookie when only one is present and no csrf token is passed', () => {
    const extractor = getExtractor();
    const req: any = {
      headers: {
        cookie: 'poojawala-customer-access-token=cust-token',
      },
    };

    const token = extractor(req);
    expect(token).toBe('cust-token');
    expect(req._extractedRoleFromCookie).toBe(USER_ROLE.CUSTOMER);
  });

  it('allows single role cookie when x-csrf-token matches the cookie csrf token', () => {
    const extractor = getExtractor();
    const req: any = {
      headers: {
        cookie:
          'poojawala-customer-access-token=cust-token; poojawala-customer-csrf-token=valid-csrf',
        'x-csrf-token': 'valid-csrf',
      },
    };

    const token = extractor(req);
    expect(token).toBe('cust-token');
    expect(req._extractedRoleFromCookie).toBe(USER_ROLE.CUSTOMER);
  });

  it('throws UnauthorizedException if single role cookie is sent with mismatched x-csrf-token', () => {
    const extractor = getExtractor();
    const req: any = {
      headers: {
        cookie:
          'poojawala-customer-access-token=cust-token; poojawala-customer-csrf-token=valid-csrf',
        'x-csrf-token': 'wrong-csrf',
      },
    };

    expect(() => extractor(req)).toThrow(
      new UnauthorizedException('Invalid CSRF token for active session'),
    );
  });

  it('selects matching role when multiple role cookies exist and valid x-csrf-token is passed', () => {
    const extractor = getExtractor();
    const req: any = {
      headers: {
        cookie:
          'poojawala-customer-access-token=cust-token; poojawala-customer-csrf-token=cust-csrf; poojawala-admin-access-token=admin-token; poojawala-admin-csrf-token=admin-csrf',
        'x-csrf-token': 'admin-csrf',
      },
    };

    const token = extractor(req);
    expect(token).toBe('admin-token');
    expect(req._extractedRoleFromCookie).toBe(USER_ROLE.ADMIN);
  });

  it('throws UnauthorizedException when multiple role cookies exist and invalid x-csrf-token is passed', () => {
    const extractor = getExtractor();
    const req: any = {
      headers: {
        cookie:
          'poojawala-customer-access-token=cust-token; poojawala-customer-csrf-token=cust-csrf; poojawala-admin-access-token=admin-token; poojawala-admin-csrf-token=admin-csrf',
        'x-csrf-token': 'unmatched-csrf',
      },
    };

    expect(() => extractor(req)).toThrow(
      new UnauthorizedException('Invalid CSRF token for active sessions'),
    );
  });

  it('throws UnauthorizedException when multiple role cookies exist, no x-csrf-token is passed, and no disambiguation hint exists', () => {
    const extractor = getExtractor();
    const req: any = {
      headers: {
        cookie:
          'poojawala-customer-access-token=cust-token; poojawala-admin-access-token=admin-token',
      },
    };

    expect(() => extractor(req)).toThrow(
      new UnauthorizedException(
        'Multiple active sessions detected. A valid x-csrf-token header matching your active session is required',
      ),
    );
  });
});
