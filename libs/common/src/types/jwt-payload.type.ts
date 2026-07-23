export type JwtPayload = {
  sub: number;
  email: string;
  role: string;
  boardId?: number;
  schoolId?: number;
  tokenVersion: number;
};
