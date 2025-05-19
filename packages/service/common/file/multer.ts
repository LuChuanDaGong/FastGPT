import type { NextApiRequest, NextApiResponse } from 'next';
import multer from 'multer';
import path from 'path';
import type { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { bucketNameMap } from '@fastgpt/global/common/file/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import fs from 'fs';

export type FileType = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  filename: string;
  path: string;
  size: number;
};

/* 
  maxSize: 文件最大大小 (MB)
*/
export const getUploadModel = ({ maxSize = 500 }: { maxSize?: number }) => {
  maxSize *= 1024 * 1024;
  const tempDir = '/app/data/fastgptTempfiles/upload/';
  // 检查临时目录是否存在，如果不存在则创建
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  class UploadModel {
    uploader = multer({
      limits: {
        fieldSize: maxSize
      },
      preservePath: true,
      storage: multer.diskStorage({
        destination: (_req, _file, cb) => {
          cb(null, tempDir);
          //   cb(null, tmpFileDirPath);
        },
        filename: (req, file, cb) => {
          if (!file?.originalname) {
            cb(new Error('File not found'), '');
          } else {
            const { ext } = path.parse(decodeURIComponent(file.originalname));
            cb(null, `${getNanoid()}${ext}`);
          }
        }
      })
    }).single('file');

    async doUpload<T = any>(
      req: NextApiRequest,
      res: NextApiResponse,
      originBucketName?: `${BucketNameEnum}`
    ) {
      return new Promise<{
        file: FileType;
        metadata: Record<string, any>;
        data: T;
        bucketName?: `${BucketNameEnum}`;
      }>((resolve, reject) => {
        // @ts-ignore
        this.uploader(req, res, (error) => {
          if (error) {
            return reject(error);
          }

          // 检查 bucket 名称
          const bucketName = (req.body?.bucketName || originBucketName) as `${BucketNameEnum}`;
          if (bucketName && !bucketNameMap[bucketName]) {
            return reject('BucketName is invalid');
          }

          // @ts-ignore
          const file = req.file as FileType;

          resolve({
            file: {
              ...file,
              originalname: decodeURIComponent(file.originalname)
            },
            bucketName,
            metadata: (() => {
              if (!req.body?.metadata) return {};
              try {
                return JSON.parse(req.body.metadata);
              } catch (error) {
                return {};
              }
            })(),
            data: (() => {
              if (!req.body?.data) return {};
              try {
                return JSON.parse(req.body.data);
              } catch (error) {
                return {};
              }
            })()
          });
        });
      });
    }
  }

  return new UploadModel();
};
