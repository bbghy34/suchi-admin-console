/**
 * The client this Luit deployment runs for. Luit is the product; everything
 * that belongs to one customer (name, logo, email domain, storage defaults)
 * lives here so the product code never names a company. A new client is a
 * copy of this file with their values.
 *
 * Keep values stable once a deployment is live: the storage bucket default
 * points at real files.
 */
export const CLIENT = {
  name: 'Suchii Group',
  shortName: 'Suchii',
  logo: '/logo.jpeg',
  emailDomain: 'suchiigroup.com',
  contactEmail: 'contact@suchiigroup.com',
  sampleFirmName: 'Suchii Construction Pvt. Ltd.',
  /** Luit modules this client bought (ids from config/modules.js). Empty means all of them. */
  modules: [],
  /** Used when GCS_BUCKET_NAME / AWS_S3_BUCKET are not set. */
  storageBucket: 'suchii-group',
};
