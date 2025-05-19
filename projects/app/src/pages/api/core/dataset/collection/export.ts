import { NextAPI } from '@/service/middleware/entry';
import { authChatCrud, authCollectionInChat } from '@/service/support/permission/auth/chat';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { type OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { useIPFrequencyLimit } from '@fastgpt/service/common/middle/reqFrequencyLimit';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
// import { responseWriteController } from '@fastgpt/service/common/response';
import { addLog } from '@fastgpt/service/common/system/log';
import { getCollectionWithDataset } from '@fastgpt/service/core/dataset/controller';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import type { NextApiResponse } from 'next';
import { saveCsvToTemp } from '@/pages/api/common/file/savetotemp';
import fs from 'fs';
import { encryptFile } from '@/pages/api/common/file/encryption';
import { removeFilesByPaths } from '@fastgpt/service/common/file/utils';

export type ExportCollectionBody = {
  collectionId: string;

  appId?: string;
  chatId?: string;
  chatItemDataId?: string;
  chatTime: Date;
} & OutLinkChatAuthProps;

async function handler(req: ApiRequestProps<ExportCollectionBody, {}>, res: NextApiResponse) {
  const {
    collectionId,
    appId,
    chatId,
    chatItemDataId,
    shareId,
    outLinkUid,
    teamId,
    teamToken,
    chatTime
  } = req.body;

  const { collection, teamId: userTeamId } = await (async () => {
    if (!appId || !chatId || !chatItemDataId) {
      return authDatasetCollection({
        req,
        authToken: true,
        authApiKey: true,
        collectionId: req.body.collectionId,
        per: ReadPermissionVal
      });
    }

    /* 
      1. auth chat read permission
      2. auth collection quote in chat
      3. auth outlink open show quote
    */
    const [authRes, collection] = await Promise.all([
      authChatCrud({
        req,
        authToken: true,
        appId,
        chatId,
        shareId,
        outLinkUid,
        teamId,
        teamToken
      }),
      getCollectionWithDataset(collectionId),
      authCollectionInChat({ appId, chatId, chatItemDataId, collectionIds: [collectionId] })
    ]);

    if (!authRes.showRawSource) {
      return Promise.reject(DatasetErrEnum.unAuthDatasetFile);
    }

    return {
      ...authRes,
      collection
    };
  })();

  const where = {
    teamId: userTeamId,
    datasetId: collection.datasetId,
    collectionId,
    ...(chatTime
      ? {
          $or: [
            { updateTime: { $lt: new Date(chatTime) } },
            { history: { $elemMatch: { updateTime: { $lt: new Date(chatTime) } } } }
          ]
        }
      : {})
  };

  // res.setHeader('Content-Type', 'text/csv; charset=utf-8;');
  // res.setHeader('Content-Disposition', 'attachment; filename=data.csv; ');

  const cursor = MongoDatasetData.find(where, 'q a', {
    ...readFromSecondary,
    batchSize: 1000
  })
    .sort({ chunkIndex: 1 })
    .limit(50000)
    .cursor();

  // const write = responseWriteController({
  //   res,
  //   readStream: cursor
  // });

  // write(`\uFEFFindex,content`);

  // cursor.on('data', (doc) => {
  //   const q = doc.q.replace(/"/g, '""') || '';
  //   const a = doc.a.replace(/"/g, '""') || '';
  //   write(`\n"${q}","${a}"`);
  // });

  const csvFilePath = await saveCsvToTemp('index,content', async (writeToFile) => {
    cursor.on('data', (doc) => {
      const q = doc.q.replace(/"/g, '""') || '';
      const a = doc.a.replace(/"/g, '""') || '';
      const csvLine = `\n"${q}","${a}"`;
      writeToFile(csvLine);
    });

    await new Promise((resolve) => {
      cursor.on('end', resolve);
      cursor.on('error', resolve);
    });
  });

  const encryptionSuccess = await encryptFile(csvFilePath);
  if (!encryptionSuccess) {
    removeFilesByPaths([csvFilePath]);
    throw new Error('encryptFile failed');
  }

  res.setHeader('Content-Type', `application/octet-stream; charset=utf-8`);
  res.setHeader('Cache-Control', 'public, max-age=31536000');
  res.setHeader('Content-Disposition', `attachment; filename="dataqwe.csv"`);

  try {
    const fileStream = fs.createReadStream(csvFilePath);

    fileStream.pipe(res);

    fileStream.on('end', () => {
      cursor.close();
      fs.unlink(csvFilePath, (err) => {
        if (err) {
          addLog.error('Failed to delete temp CSV file', err);
          removeFilesByPaths([csvFilePath]);
        }
      });
    });
  } catch (err) {
    cursor.close();
    addLog.error(`export usage error`, err);
    res.status(500);
    res.end();
  }

  cursor.on('error', (err) => {
    addLog.error(`export usage error`, err);
    res.status(500);
    res.end();
  });
}

export default NextAPI(
  useIPFrequencyLimit({ id: 'export-usage', seconds: 60, limit: 1, force: true }),
  handler
);
