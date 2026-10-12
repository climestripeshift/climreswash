import express, { type RequestHandler } from "express";

// Express 4 does not catch rejected handler promises. Keep private errors out of public logs/responses.
export function asyncRouter() {
  const router = express.Router();
  for (const method of ["get", "post", "use"] as const) {
    const original = router[method].bind(router);
    (router as any)[method] = (...args: any[]) => (original as any)(...args.map(arg => typeof arg !== "function" ? arg :
      ((req, res, next) => {
        Promise.resolve().then(() => arg(req, res, next)).catch(() => {
          if (!res.headersSent) res.status(503).json({ message: "The research beta is temporarily unavailable." });
          else res.end();
        });
      }) satisfies RequestHandler));
  }
  return router;
}
