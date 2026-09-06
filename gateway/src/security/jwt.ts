import jwt from "jsonwebtoken";
import { config } from "../config";

export interface UserTokenPayload {
  kind: "user";
  username: string;
}

export interface AdminTokenPayload {
  kind: "admin";
  username: string;
}

export type TokenPayload = UserTokenPayload | AdminTokenPayload;

export function signUserToken(username: string): string {
  const payload: UserTokenPayload = { kind: "user", username };
  return jwt.sign(payload, config.jwtUserSecret, { expiresIn: config.jwtExpiresIn } as jwt.SignOptions);
}

export function signAdminToken(username: string): string {
  const payload: AdminTokenPayload = { kind: "admin", username };
  return jwt.sign(payload, config.jwtAdminSecret, { expiresIn: config.jwtExpiresIn } as jwt.SignOptions);
}

export function verifyUserToken(token: string): UserTokenPayload {
  const decoded = jwt.verify(token, config.jwtUserSecret) as TokenPayload;
  if (decoded.kind !== "user") throw new Error("Invalid token kind");
  return decoded;
}

export function verifyAdminToken(token: string): AdminTokenPayload {
  const decoded = jwt.verify(token, config.jwtAdminSecret) as TokenPayload;
  if (decoded.kind !== "admin") throw new Error("Invalid token kind");
  return decoded;
}
