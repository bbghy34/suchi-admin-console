import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse, errorResponse, notFound, handleApiError } from '@/lib/api-response';
import { uploadToGCS, deleteFromGCS } from '@/lib/gcs';
import { forgetMissingFile } from '@/lib/read-cache';
import {
  TENDER_DOC_EXTENSIONS,
  TENDER_DOC_KINDS,
  TENDER_DOC_MAX_BYTES,
  TENDER_DOC_MAX_COUNT,
  isStoredFileUrl,
  publicTenderFile,
} from '@/lib/tender-portal-exchange';

function extensionOf(filename) {
  const base = String(filename || '').split(/[/\\]/).pop() || '';
  const dot = base.lastIndexOf('.');
  if (dot < 1) return '';
  return base.slice(dot + 1).toLowerCase();
}

function displayName(filename) {
  const base = String(filename || '').split(/[/\\]/).pop() || 'document';
  return base.replace(/[^\w.\- ()[\]]+/g, '_').slice(0, 180) || 'document';
}

async function loadTenderProject(projectId) {
  if (!projectId || typeof projectId !== 'string') return null;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, tenderId: true, isActive: true },
  });
  if (!project || !project.isActive) return null;
  if (!project.tenderId || !String(project.tenderId).trim()) return null;
  return project;
}

async function listFiles() {
  const rows = await prisma.tenderFile.findMany({
    where: {
      project: {
        isActive: true,
        AND: [{ tenderId: { not: null } }, { NOT: { tenderId: '' } }],
      },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      project: { select: { id: true, name: true, tenderId: true } },
    },
  });

  const kept = rows.filter((row) => isStoredFileUrl(row.fileUrl));
  const uploaderIds = [...new Set(kept.map((row) => row.createdBy).filter(Boolean))];
  const uploaders = uploaderIds.length
    ? await prisma.employee.findMany({
        where: { id: { in: uploaderIds } },
        select: { id: true, name: true },
      })
    : [];
  const names = Object.fromEntries(uploaders.map((person) => [person.id, person.name]));

  return kept.map((row) => publicTenderFile(row, names[row.createdBy]));
}

export const GET = requireRoles(['A', 'M'])(async () => {
  try {
    return successResponse(await listFiles(), 'Tender files retrieved.');
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve tender files.');
  }
});

export const POST = requireRoles(['A'])(async (request, { user }) => {
  try {
    const formData = await request.formData();
    const projectId = String(formData.get('projectId') || '').trim();
    const kind = String(formData.get('kind') || '').trim();
    const file = formData.get('file');

    if (!TENDER_DOC_KINDS[kind]) {
      return errorResponse('Choose a tender file or a supporting document.', 400);
    }
    if (!file || typeof file === 'string' || !file.name) {
      return errorResponse('Choose a file to upload.', 400);
    }
    if (file.size > TENDER_DOC_MAX_BYTES) {
      return errorResponse('That file is larger than 20 MB.', 400);
    }

    const ext = extensionOf(file.name);
    if (!TENDER_DOC_EXTENSIONS.includes(ext)) {
      return errorResponse('Use a PDF, Office, zip, image, text, or CSV file.', 400);
    }

    const project = await loadTenderProject(projectId);
    if (!project) return notFound('No active project with that tender ID.');

    const held = await prisma.tenderFile.count({ where: { projectId: project.id } });
    if (held >= TENDER_DOC_MAX_COUNT) {
      return errorResponse('This tender already has the maximum number of files.', 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await uploadToGCS(
      buffer,
      displayName(file.name),
      `tender-packs/${project.id}`,
      file.type || 'application/octet-stream'
    );
    const fileUrl = `/api/files/${stored.gcsPath}`;
    if (!isStoredFileUrl(fileUrl)) {
      await deleteFromGCS(stored.gcsPath).catch(() => {});
      return errorResponse('The stored file path was not accepted.', 400);
    }

    try {
      await prisma.tenderFile.create({
        data: {
          projectId: project.id,
          tenderId: String(project.tenderId).trim(),
          kind,
          name: displayName(file.name),
          fileUrl,
          storagePath: stored.gcsPath,
          source: 'manual',
          createdBy: user?.id || null,
        },
      });
      forgetMissingFile(stored.gcsPath);
      return successResponse(
        await listFiles(),
        kind === 'file' ? 'Tender file saved.' : 'Supporting document saved.'
      );
    } catch (error) {
      await deleteFromGCS(stored.gcsPath).catch(() => {});
      throw error;
    }
  } catch (error) {
    if (String(error?.message || '').includes('Object storage is not configured')) {
      return errorResponse('File storage is not configured on the server, so the upload was not saved.', 503);
    }
    return handleApiError(error, 'Failed to save the tender file.');
  }
});

export const DELETE = requireRoles(['A'])(async (request) => {
  try {
    const { searchParams } = new URL(request.url);
    const documentId = String(searchParams.get('documentId') || '').trim();
    if (!documentId) return errorResponse('Choose a file to remove.', 400);

    const target = await prisma.tenderFile.findUnique({ where: { id: documentId } });
    if (!target) return notFound('That file is not in the tender table.');

    await prisma.tenderFile.delete({ where: { id: target.id } });
    if (target.storagePath) {
      await deleteFromGCS(target.storagePath).catch(() => {});
    }

    return successResponse(await listFiles(), 'File removed from the tender table.');
  } catch (error) {
    return handleApiError(error, 'Failed to remove the tender file.');
  }
});
