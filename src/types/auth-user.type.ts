export interface AuthUser {
  sub: number;
  userId: number;
  login: string;
  role: 'admin' | 'operator' | 'director' | 'master';
  name: string;
  cities?: string[];
}

