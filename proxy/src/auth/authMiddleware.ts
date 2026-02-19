import { FastifyReply, FastifyRequest } from "fastify";
import { validateApiToken } from "./authService";
import { AuthContext, Role } from "../types";

declare module "fastify" {
  interface FastifyRequest {
    authContext?: AuthContext;
  }
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer afw_")) {
    return reply.status(401).send({ error: "Missing or invalid API token" });
  }

  const raw = header.replace("Bearer ", "");
  const result = validateApiToken(raw);

  if (!result) {
    return reply.status(401).send({ error: "Invalid or expired API token" });
  }

  request.authContext = result;
}

export function requireRole(...allowedRoles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await requireAuth(request, reply);
    if (reply.sent) return;

    const ctx = request.authContext;
    if (!ctx || !allowedRoles.includes(ctx.user.role)) {
      return reply.status(403).send({
        error: "Insufficient permissions",
        required: allowedRoles,
        current: ctx?.user.role
      });
    }
  };
}
