/** Make Prisma records safe to pass from a server component to a client component. */
export function asJson(value) {
  return JSON.parse(JSON.stringify(value));
}
