export type JwtPayload = {
  sub: string;
  email: string;
  role: string;
  boardId?: number;
  schoolId?: number;
  tokenVersion: number;
};
