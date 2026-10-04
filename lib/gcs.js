
/**
 * lib/gcs.js
 * Google Cloud Storage utility for private file storage.
 *
 * Required environment variables:
 *
 * GCS_BUCKET_NAME
 * GCS_PROJECT_ID
 * GCS_CREDENTIALS_JSON
 *
 * Example:
 *
 * GCS_BUCKET_NAME="suchii-group"
 * GCS_PROJECT_ID="suchii-group"
 * GCS_CREDENTIALS_JSON='{"type":"service_account",...}'
 *
 * IMPORTANT:
 * - Keep the bucket private.
 * - Uniform Bucket-Level Access should remain enabled.
 * - Do NOT use publicRead or legacy ACLs.
 * - Do NOT use NEXT_PUBLIC_ for credentials.
 * - Do NOT commit service-account credentials to Git.
 */

import { Storage } from '@google-cloud/storage';
import path from 'path';
import crypto from 'crypto';
import { isS3Configured, uploadToS3, downloadFromS3, deleteFromS3, s3FileExists } from './s3-storage.js';
import { CLIENT } from '@/config/client';
export { isS3Configured, uploadToS3, downloadFromS3, deleteFromS3, s3FileExists };

let _storage = null;

/**
 * Check whether Google Cloud Storage credentials are fully configured.
 */
export function isGCSConfigured() {
  return Boolean(
    process.env.GCS_BUCKET_NAME &&
    process.env.GCS_PROJECT_ID &&
    (
      process.env.GCS_CREDENTIALS_JSON ||
      process.env.GCS_CREDENTIALS_BASE64 ||
      process.env.GCS_KEY_FILE_PATH
    )
  );
}

/**
 * Get authenticated Google Cloud Storage client.
 *
 * Supports:
 * 1. GCS_CREDENTIALS_BASE64 (Base64-encoded service account JSON)
 * 2. GCS_CREDENTIALS_JSON (Raw or stringified service account JSON)
 * 3. GCS_KEY_FILE_PATH (Local path to service account JSON file)
 * 4. Fallback to ./suchii-group-auth-key.json if file exists locally
 */
function getStorage() {
  if (_storage) {
    return _storage;
  }

  const projectId = process.env.GCS_PROJECT_ID;
  const credentialsBase64 = process.env.GCS_CREDENTIALS_BASE64;
  const credentialsJson = process.env.GCS_CREDENTIALS_JSON;
  const keyFilePath = process.env.GCS_KEY_FILE_PATH;

  if (!projectId) {
    throw new Error('GCS_PROJECT_ID must be set in environment variables.');
  }

  let credentials = null;

  // 1. Try GCS_CREDENTIALS_BASE64
  if (credentialsBase64) {
    try {
      const decoded = Buffer.from(credentialsBase64, 'base64').toString('utf8');
      credentials = JSON.parse(decoded);
    } catch (err) {
      throw new Error(`GCS_CREDENTIALS_BASE64 is invalid: ${err.message}`);
    }
  }

  // 2. Try GCS_CREDENTIALS_JSON (auto-detects if user pasted JSON or Base64 into it)
  if (!credentials && credentialsJson) {
    if (typeof credentialsJson === 'object') {
      credentials = credentialsJson;
    } else {
      const trimmed = credentialsJson.trim();
      try {
        credentials = JSON.parse(trimmed);
      } catch (jsonErr) {
        // Fallback: check if the value was Base64 encoded
        try {
          const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
          credentials = JSON.parse(decoded);
        } catch (base64Err) {
          throw new Error(`GCS_CREDENTIALS_JSON contains invalid JSON or Base64: ${jsonErr.message}`);
        }
      }
    }
  }

  // 3. Try GCS_KEY_FILE_PATH or local auth key file
  if (!credentials) {
    const candidatePaths = [
      keyFilePath ? (path.isAbsolute(keyFilePath) ? keyFilePath : path.join(process.cwd(), keyFilePath)) : null,
      path.join(process.cwd(), 'suchii-group-auth-key.json'),
    ].filter(Boolean);

    for (const p of candidatePaths) {
      try {
        const fs = require('fs');
        if (fs.existsSync(p)) {
          credentials = JSON.parse(fs.readFileSync(p, 'utf8'));
          break;
        }
      } catch (e) {
        // ignore and continue
      }
    }
  }

  if (!credentials) {
    throw new Error(
      'GCS credentials not found. Please provide GCS_CREDENTIALS_JSON or GCS_CREDENTIALS_BASE64 in your environment variables.'
    );
  }

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error(
      'GCS credentials are missing client_email or private_key.'
    );
  }

  // Normalize private_key newlines (crucial for Vercel and env vars where \n might be escaped as \\n)
  if (typeof credentials.private_key === 'string') {
    credentials.private_key = credentials.private_key
      .replace(/\\n/g, '\n')
      .replace(/\r/g, '');
  }

  _storage = new Storage({
    projectId,
    credentials,
  });

  return _storage;
}

/**
 * Get the configured GCS bucket.
 */
function getBucketName() {
  const bucketName = process.env.GCS_BUCKET_NAME;

  if (!bucketName) {
    throw new Error(
      'GCS_BUCKET_NAME must be set in environment variables.'
    );
  }

  return bucketName;
}

/**
 * Sanitize a GCS folder path.
 */
function sanitizeFolder(folder) {
  if (!folder) {
    return 'uploads';
  }

  return folder
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.\./g, '');
}

/**
 * Upload a Buffer / Uint8Array to Google Cloud Storage.
 *
 * No legacy ACL is used.
 *
 * This is compatible with:
 *
 * Uniform Bucket-Level Access
 * Private buckets
 *
 * @param {Buffer|Uint8Array} buffer
 * @param {string} filename
 * @param {string} folder
 * @param {string} mimeType
 *
 * @returns {Promise<{
 *   publicUrl: string,
 *   gcsPath: string
 * }>}
 */
export async function uploadToGCS(
  buffer,
  filename,
  folder = 'uploads',
  mimeType = 'application/octet-stream'
) {
  if (!buffer) {
    throw new Error('File buffer is required.');
  }

  if (!filename) {
    throw new Error('Filename is required.');
  }

  if (isS3Configured()) {
    return uploadToS3(buffer, filename, folder, mimeType);
  }

  if (isGCSConfigured()) {
    const storage = getStorage();
    const bucketName = getBucketName();
    const bucket = storage.bucket(bucketName);
    const safeFolder = sanitizeFolder(folder);
    const ext = path.extname(filename) || '';
    const uniqueFilename = `${crypto.randomUUID()}${ext}`;
    const gcsPath = `${safeFolder}/${uniqueFilename}`;
    const file = bucket.file(gcsPath);

    await file.save(Buffer.from(buffer), {
      resumable: false,
      metadata: {
        contentType: mimeType,
        metadata: {
          originalName: filename,
        },
      },
    });

    const publicUrl = `https://storage.googleapis.com/${bucketName}/${gcsPath}`;
    return {
      publicUrl,
      gcsPath,
    };
  }

  throw new Error('Object storage is not configured. Please set AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_S3_BUCKET in your .env file.');
}

/**
 * Generate a download URL for a stored object.
 *
 * @param {string} gcsPath
 * @param {number} expiresInMinutes
 *
 * @returns {Promise<string>}
 */
export async function getSignedDownloadUrl(
  gcsPath,
  expiresInMinutes = 60
) {
  if (!gcsPath) {
    throw new Error('gcsPath is required.');
  }

  if (isS3Configured()) {
    return `/api/files/${gcsPath}`;
  }

  if (isGCSConfigured()) {
    if (!Number.isFinite(expiresInMinutes) || expiresInMinutes <= 0) {
      throw new Error('expiresInMinutes must be greater than 0.');
    }

    const storage = getStorage();
    const bucket = storage.bucket(getBucketName());
    const file = bucket.file(gcsPath);

    const expires = Date.now() + expiresInMinutes * 60 * 1000;
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires,
    });

    return url;
  }

  return `/api/files/${gcsPath}`;
}

/**
 * Delete a file from storage.
 *
 * @param {string} gcsPath
 *
 * @returns {Promise<void>}
 */
export async function deleteFromGCS(gcsPath) {
  if (!gcsPath) {
    throw new Error('gcsPath is required.');
  }

  if (isS3Configured()) {
    await deleteFromS3(gcsPath);
  }

  if (isGCSConfigured()) {
    try {
      const storage = getStorage();
      const bucket = storage.bucket(getBucketName());
      await bucket.file(gcsPath).delete({ ignoreNotFound: true });
    } catch (error) {
      console.warn('GCS delete warning:', error.message);
    }
  }
}

/**
 * Check whether a file exists in storage.
 *
 * @param {string} gcsPath
 *
 * @returns {Promise<boolean>}
 */
export async function fileExists(gcsPath) {
  if (!gcsPath) {
    throw new Error('gcsPath is required.');
  }

  if (isS3Configured() && (await s3FileExists(gcsPath))) {
    return true;
  }

  if (isGCSConfigured()) {
    try {
      const storage = getStorage();
      const bucket = storage.bucket(getBucketName());
      const [exists] = await bucket.file(gcsPath).exists();
      return exists;
    } catch (error) {
      return false;
    }
  }

  return false;
}

/**
 * Get object metadata.
 *
 * @param {string} gcsPath
 *
 * @returns {Promise<object|null>}
 */
export async function getFileMetadata(gcsPath) {
  if (!gcsPath) {
    throw new Error('gcsPath is required.');
  }

  if (isS3Configured()) {
    const downloaded = await downloadFromS3(gcsPath);
    if (downloaded) return downloaded.metadata;
  }

  if (isGCSConfigured()) {
    try {
      const storage = getStorage();
      const bucket = storage.bucket(getBucketName());
      const [metadata] = await bucket.file(gcsPath).getMetadata();
      return metadata;
    } catch (error) {
      if (error.code === 404 || error.code === '404') {
        return null;
      }
      return null;
    }
  }

  return null;
}

/**
 * Download a private file from storage.
 *
 * Intended for server-side API routes that
 * authenticate the user before returning the file.
 *
 * @param {string} gcsPath
 *
 * @returns {Promise<{
 *   buffer: Buffer,
 *   contentType: string,
 *   metadata: object
 * }|null>}
 */
export async function downloadFromGCS(gcsPath) {
  if (!gcsPath) {
    throw new Error('gcsPath is required.');
  }

  // 1. If Neon S3 is configured, download from S3
  if (isS3Configured()) {
    const stored = await downloadFromS3(gcsPath);
    if (stored) return stored;
  }

  // 2. Only attempt GCS if Google Cloud credentials are fully configured
  if (!isGCSConfigured()) {
    return null;
  }

  try {
    const storage = getStorage();
    const bucket = storage.bucket(getBucketName());
    const file = bucket.file(gcsPath);

    const [exists] = await file.exists();
    if (!exists) {
      return null;
    }

    const [metadata] = await file.getMetadata();
    const [buffer] = await file.download();

    return {
      buffer,
      contentType: metadata.contentType || 'application/octet-stream',
      metadata,
    };
  } catch (error) {
    console.warn('Storage download warning:', error.message);
    return null;
  }
}

/**
 * Get the object URL.
 *
 * @param {string} gcsPath
 *
 * @returns {string}
 */
export function getGCSObjectUrl(gcsPath) {
  if (!gcsPath) {
    throw new Error('gcsPath is required.');
  }

  if (isS3Configured()) {
    return `/api/files/${gcsPath}`;
  }

  const bucket = process.env.GCS_BUCKET_NAME || CLIENT.storageBucket;
  return `https://storage.googleapis.com/${bucket}/${gcsPath}`;
}


