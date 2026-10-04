import { CLIENT } from '@/config/client';

/**
 * Product naming. Luit is the product; the company it runs for comes from
 * config/client.js. Every screen, title, and API label reads from here so the
 * name never drifts between the landing page, sign-in, shell, and metadata.
 *
 * Luit is the Assamese name for the Brahmaputra. Boat Brothers built it, so
 * the credit line plays on that: a river, and the boat that brought it.
 * Keep Luit to the brand spots; screens keep their plain names (Tender Desk,
 * Warehouse, Projects).
 */
export const BRAND = {
  company: CLIENT.name,
  logo: CLIENT.logo,
  product: 'Luit',
  ai: 'Luit AI',
  fullName: `Luit · ${CLIENT.name}`,
  tagline: 'Many streams, one current. Projects, sites, tenders, people, and stores in one record.',
  description:
    `Luit, the construction operating system for ${CLIENT.name}: projects, sites, BOQs, tenders, workforce, and warehouse.`,
  accessNotice: `Authorised ${CLIENT.name} personnel only.`,
  maker: 'Boat Brothers',
  makerUrl: 'https://boatbrothers.in',
  creditNote: 'Every river needs a boat.',
};
