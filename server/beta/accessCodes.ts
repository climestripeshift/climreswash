import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
const derive = (code: string, salt: string) => new Promise<Buffer>((resolve,reject) => {
  scrypt(code,salt,32,{N:16384,r:8,p:1,maxmem:64*1024*1024},(error,key)=>error ? reject(error) : resolve(key));
});
export const generateAccessCode = () => randomBytes(32).toString("base64url");
export async function hashAccessCode(code: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = await derive(code, salt);
  return `scrypt-v1$${salt}$${hash.toString("hex")}`;
}
export async function checkAccessCode(code: string, encoded: string) {
  const parts = encoded.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt-v1" || !/^[a-f0-9]{32}$/.test(parts[1]) || !/^[a-f0-9]{64}$/.test(parts[2])) return false;
  const actual = await derive(code, parts[1]);
  return timingSafeEqual(actual, Buffer.from(parts[2], "hex"));
}
