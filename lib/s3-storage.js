/**
 * S3-compatible object storage (Neon storage and other AWS S3 endpoints).
 * Credentials stay in server environment variables and are never sent to the browser.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import path from 'path';
import crypto from 'crypto';
import { CLIENT } from '@/config/client';

let client = null;

export function isS3Configured() {
  return Boolean(
    String(process.env.AWS_ENDPOINT_URL_S3 || '').trim() &&
    String(process.env.AWS_ACCESS_KEY_ID || '').trim() &&
    String(process.env.AWS_SECRET_ACCESS_KEY || '').trim()
  );
}

function getClient() {
  if (client) return client;
  client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-2',
    endpoint: process.env.AWS_ENDPOINT_URL_S3,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  return client;
}

function bucketName() {
  const name = String(process.env.AWS_S3_BUCKET || CLIENT.storageBucket).trim();
  if (!name) {
    throw new Error('S3 bucket is not set. Add AWS_S3_BUCKET in .env.');
  }
  return name;
}

function sanitizeFolder(folder) {
  if (!folder) return 'uploads';
  return folder
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.\./g, '');
}

export async function uploadToS3(buffer, filename, folder = 'uploads', mimeType = 'application/octet-stream') {
  if (!buffer) throw new Error('File buffer is required.');
  if (!filename) throw new Error('Filename is required.');

  const safeFolder = sanitizeFolder(folder);
  const ext = path.extname(filename) || '';
  const key = `${safeFolder}/${crypto.randomUUID()}${ext}`;
  const originalName = originalNameOf(filename);

  try {
    await getClient().send(new PutObjectCommand({
      Bucket: bucketName(),
      Key: key,
      Body: Buffer.from(buffer),
      ContentType: mimeType || 'application/octet-stream',
      Metadata: originalName ? { originalname: originalName } : undefined,
    }));
  } catch (error) {
    console.error('Neon S3 upload error:', error);
    throw new Error(`Could not store the file in Neon S3 storage: ${error.message}`);
  }

  return {
    publicUrl: `/api/files/${key}`,
    gcsPath: key,
  };
}

function originalNameOf(filename) {
  return String(filename || '').replace(/[^\x20-\x7E]/g, '').slice(0, 200);
}

/**
 * Signed PUT link so the browser sends the file straight to storage.
 * Vercel functions reject request bodies over about 4.5 MB.
 * The browser must send `headers` exactly as returned or the signature fails.
 */
export async function presignS3Upload(filename, folder = 'uploads', mimeType = 'application/octet-stream', expiresIn = 600) {
  if (!filename) throw new Error('Filename is required.');
  const key = `${sanitizeFolder(folder)}/${crypto.randomUUID()}${path.extname(filename) || ''}`;
  const originalName = originalNameOf(filename);
  const headers = { 'Content-Type': mimeType || 'application/octet-stream' };
  if (originalName) {
    headers['x-amz-meta-originalname'] = originalName;
    // Neon storage ignores response-content-disposition on signed GETs, so the name is stored with the object.
    headers['Content-Disposition'] = `inline; filename="${originalName.replace(/["\\]/g, '')}"`;
  }
  const uploadUrl = await getSignedUrl(
    getClient(),
    new PutObjectCommand({
      Bucket: bucketName(),
      Key: key,
      ContentType: headers['Content-Type'],
      ContentDisposition: headers['Content-Disposition'],
      Metadata: originalName ? { originalname: originalName } : undefined,
    }),
    { expiresIn, unhoistableHeaders: new Set(['x-amz-meta-originalname']) }
  );
  return { key, uploadUrl, headers };
}

export async function s3ObjectInfo(key) {
  if (!key) throw new Error('File path is required.');
  try {
    const result = await getClient().send(new HeadObjectCommand({ Bucket: bucketName(), Key: key }));
    return {
      size: Number(result.ContentLength || 0),
      contentType: result.ContentType || 'application/octet-stream',
      metadata: result.Metadata || {},
    };
  } catch {
    return null;
  }
}

/**
 * Short-lived signed GET link. Vercel functions also cap response bodies at about 4.5 MB,
 * so large files are handed to the browser this way after the permission check.
 */
export async function presignS3Download(key, { filename, contentType, expiresIn = 300 } = {}) {
  if (!key) throw new Error('File path is required.');
  const safeName = String(filename || '').replace(/[\r\n"]/g, '').slice(0, 180);
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({
      Bucket: bucketName(),
      Key: key,
      ResponseContentType: contentType || undefined,
      ResponseContentDisposition: safeName ? `inline; filename="${safeName}"` : undefined,
    }),
    { expiresIn }
  );
}

export async function downloadFromS3(key) {
  if (!key) throw new Error('File path is required.');
  try {
    const result = await getClient().send(new GetObjectCommand({
      Bucket: bucketName(),
      Key: key,
    }));
    const bytes = await result.Body.transformToByteArray();
    return {
      buffer: Buffer.from(bytes),
      contentType: result.ContentType || 'application/octet-stream',
      metadata: result.Metadata || {},
    };
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode;
    const name = error?.name || '';
    if (status === 404 || name === 'NoSuchKey' || name === 'NotFound') {
      return null;
    }
    console.warn(`Neon S3 download warning for "${key}":`, error.message);
    return null;
  }
}

export async function deleteFromS3(key) {
  if (!key) throw new Error('File path is required.');
  try {
    await getClient().send(new DeleteObjectCommand({
      Bucket: bucketName(),
      Key: key,
    }));
  } catch (error) {
    console.warn(`Neon S3 delete warning for "${key}":`, error.message);
  }
}

export async function s3FileExists(key) {
  if (!key) throw new Error('File path is required.');
  try {
    await getClient().send(new HeadObjectCommand({
      Bucket: bucketName(),
      Key: key,
    }));
    return true;
  } catch (error) {
    return false;
  }
}
