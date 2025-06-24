import { Request } from 'express';

declare module 'express' {
  export interface Request {
    cookies: {
      [key: string]: string;
    };
  }
}
