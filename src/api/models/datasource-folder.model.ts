import { prisma } from '../../lib/prisma';
import { AppError } from '../middlewares/error-handler';

function mapDatasourceFolder(folder: {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  _count?: { datasources: number };
}) {
  return {
    id: folder.id,
    name: folder.name,
    sort_order: folder.sortOrder,
    datasource_count: folder._count?.datasources ?? 0,
    created_at: folder.createdAt.toISOString(),
    updated_at: folder.updatedAt.toISOString(),
  };
}

export async function listDatasourceFolders() {
  const folders = await prisma.datasourceFolder.findMany({
    include: {
      _count: {
        select: { datasources: true },
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  return folders.map(mapDatasourceFolder);
}

export async function createDatasourceFolderRecord(input: { name: string }) {
  const name = input.name.trim();
  if (!name) {
    throw new AppError('VALIDATION_ERROR', 422, 'Nome da pasta obrigatorio');
  }

  const existing = await prisma.datasourceFolder.findFirst({
    where: {
      name: {
        equals: name,
        mode: 'insensitive',
      },
    },
    select: { id: true },
  });

  if (existing) {
    throw new AppError('VALIDATION_ERROR', 409, 'Ja existe uma pasta com esse nome');
  }

  const folder = await prisma.datasourceFolder.create({
    data: {
      name,
      sortOrder: await prisma.datasourceFolder.count(),
    },
    include: {
      _count: {
        select: { datasources: true },
      },
    },
  });

  return mapDatasourceFolder(folder);
}

export async function reorderDatasourceFolders(input: { ordered_ids: string[] }) {
  const orderedIds = [...new Set(input.ordered_ids.map((id) => id.trim()).filter(Boolean))];
  const folders = await prisma.datasourceFolder.findMany({
    select: { id: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  if (orderedIds.length !== folders.length || orderedIds.some((id) => !folders.find((folder) => folder.id === id))) {
    throw new AppError('VALIDATION_ERROR', 422, 'ordered_ids deve conter todas as pastas exatamente uma vez');
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.datasourceFolder.update({
        where: { id },
        data: { sortOrder: index },
      })),
  );

  return listDatasourceFolders();
}

export async function updateDatasourceFolderRecord(folderId: string, input: { name: string }) {
  const name = input.name.trim();
  if (!name) {
    throw new AppError('VALIDATION_ERROR', 422, 'Nome da pasta obrigatorio');
  }

  const existing = await prisma.datasourceFolder.findFirst({
    where: {
      id: { not: folderId },
      name: {
        equals: name,
        mode: 'insensitive',
      },
    },
    select: { id: true },
  });

  if (existing) {
    throw new AppError('VALIDATION_ERROR', 409, 'Ja existe uma pasta com esse nome');
  }

  const folder = await prisma.datasourceFolder.update({
    where: { id: folderId },
    data: { name },
    include: {
      _count: {
        select: { datasources: true },
      },
    },
  });

  return mapDatasourceFolder(folder);
}

export async function deleteDatasourceFolderRecord(folderId: string) {
  await prisma.$transaction(async (tx) => {
    const folder = await tx.datasourceFolder.findUnique({
      where: { id: folderId },
      select: { id: true },
    });

    if (!folder) {
      throw new AppError('NOT_FOUND', 404, 'Pasta nao encontrada');
    }

    const rootCount = await tx.datasource.count({ where: { folderId: null } });
    const folderDatasources = await tx.datasource.findMany({
      where: { folderId },
      select: { id: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    await Promise.all(
      folderDatasources.map((datasource, index) =>
        tx.datasource.update({
          where: { id: datasource.id },
          data: {
            folderId: null,
            sortOrder: rootCount + index,
          },
        })),
    );

    await tx.datasourceFolder.delete({ where: { id: folderId } });
  });

  return { message: 'Pasta excluida com sucesso' };
}
