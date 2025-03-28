import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authFileToken } from '@fastgpt/service/support/permission/controller';
import { getDownloadStream, getFileById } from '@fastgpt/service/common/file/gridfs/controller';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { stream2Encoding } from '@fastgpt/service/common/file/gridfs/utils';
import * as fs from 'fs';
import { saveToTemp } from '../savetotemp';
import { encryptFile } from '../encryption';
import { removeFilesByPaths } from '@fastgpt/service/common/file/utils';

// const previewableExtensions = [
//   'jpg',
//   'jpeg',
//   'png',
//   'gif',
//   'bmp',
//   'webp',
//   'txt',
//   'log',
//   'csv',
//   'md',
//   'json'
// ];
export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    const { token, filename } = req.query as { token: string; filename: string };

    const { fileId, bucketName } = await authFileToken(token);

    if (!fileId) {
      throw new Error('fileId is empty');
    }

    const [file, fileStream] = await Promise.all([
      getFileById({ bucketName, fileId }),
      getDownloadStream({ bucketName, fileId })
    ]);

    if (!file) {
      return Promise.reject(CommonErrEnum.fileNotFound);
    }

    const { stream, encoding } = await (async () => {
      if (file.metadata?.encoding) {
        return {
          stream: fileStream,
          encoding: file.metadata.encoding
        };
      }
      return stream2Encoding(fileStream);
    })();

    const disposition = 'attachment';

    if (bucketName === 'chat') {
      res.setHeader('Content-Type', `${file.contentType}; charset=${encoding}`);
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.setHeader(
        'Content-Disposition',
        `${disposition}; filename="${encodeURIComponent(filename)}"`
      );
      res.setHeader('Content-Length', file.length);

      stream.pipe(res);

      stream.on('error', () => {
        res.status(500).end();
      });
      stream.on('end', () => {
        res.end();
      });
    }

    if (bucketName === 'dataset') {
      const tempFilePath = await saveToTemp(stream, filename);

      const encryptionSuccess = await encryptFile(tempFilePath);
      if (!encryptionSuccess) {
        removeFilesByPaths([tempFilePath]);
        throw new Error('encryptFile failed');
      }

      const encryptedFileStats = fs.statSync(tempFilePath);
      const encryptedContentType = 'application/octet-stream';
      const readStream = fs.createReadStream(tempFilePath);

      res.setHeader('Content-Type', `${{ encryptedContentType }}; charset=${encoding}`);
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.setHeader(
        'Content-Disposition',
        `${disposition}; filename="${encodeURIComponent(filename)}"`
      );
      res.setHeader('Content-Length', encryptedFileStats.size);

      readStream.pipe(res);

      readStream.on('error', async () => {
        removeFilesByPaths([tempFilePath]);
        res.status(500).end();
      });
      readStream.on('end', async () => {
        removeFilesByPaths([tempFilePath]);
        res.end();
      });
    }
    if (!bucketName) {
      throw new Error('bucketName is empty');
    }
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}
export const config = {
  api: {
    responseLimit: '100mb'
  }
};
